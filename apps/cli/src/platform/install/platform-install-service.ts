/**
 * 平台安装服务
 * 处理依赖安装策略、pnpm 自举、registry fallback 和 Windows 原生模块补丁
 */

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { getPlatformAdapter } from '../index';
import { checkCommand, runCommand } from '../../shared/process/process-utils';
import { checkPnpmAvailable, getCommandLookupEnv } from '../../core/diagnostics/system-check';

export const NPM_MIRROR_REGISTRY = 'https://registry.npmmirror.com';
export const NPM_OFFICIAL_REGISTRY = 'https://registry.npmjs.org';

/**
 * Windows 原生模块补丁结果
 */
export type NativePatchResult = {
  changed: boolean;
  error?: string;
  restore: () => void;
};

/**
 * 包安装尝试配置
 */
export type PackageInstallAttempt = {
  label: string;
  command: string;
  env?: NodeJS.ProcessEnv;
};

/**
 * 检查 pnpm 是否可用（支持 corepack 和 npm fallback）
 */
function canBootstrapPnpm(): boolean {
  return checkPnpmAvailable() || checkCommand('corepack') || checkCommand('npm');
}

/**
 * 构建 registry 环境变量
 * @param registry 指定的 registry 地址
 */
export function buildRegistryEnv(registry: string, baseEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...(baseEnv || getCommandLookupEnv()),
    npm_config_registry: registry,
    NPM_CONFIG_REGISTRY: registry,
    COREPACK_NPM_REGISTRY: registry,
  };
}

/**
 * 构建 registry 镜像环境变量（兼容旧接口）
 */
export function buildRegistryMirrorEnv(baseEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return buildRegistryEnv(NPM_MIRROR_REGISTRY, baseEnv);
}

/**
 * 获取推荐的 npm registry
 * - 有 VPN/直连：使用官方 npm（更快）
 * - 无 VPN：使用 npmmirror 镜像
 */
export function getRecommendedNpmRegistry(githubDirectConnected?: boolean): string {
  if (githubDirectConnected) {
    return NPM_OFFICIAL_REGISTRY;
  }
  return NPM_MIRROR_REGISTRY;
}

/**
 * 获取包安装尝试列表
 * 根据网络探测结果智能选择顺序：
 * - 有 VPN/直连：先官方源，再镜像
 * - 无 VPN：先镜像，再官方源（备用）
 */
export function getPackageInstallAttempts(projectPath: string, baseEnv?: NodeJS.ProcessEnv, githubDirectConnected?: boolean): PackageInstallAttempt[] {
  const { getInstallCommand } = require('../../runtime/openclaw/openclaw-project') as typeof import('../../runtime/openclaw/openclaw-project');
  const installPlan = getInstallCommand(projectPath);

  const recommendedRegistry = getRecommendedNpmRegistry(githubDirectConnected);

  if (recommendedRegistry === NPM_OFFICIAL_REGISTRY) {
    // 有 VPN/直连：先官方源，再镜像
    return [
      { label: 'npm 官方源', command: installPlan.command, env: buildRegistryEnv(NPM_OFFICIAL_REGISTRY, baseEnv) },
      { label: 'npm 镜像源', command: installPlan.command, env: buildRegistryEnv(NPM_MIRROR_REGISTRY, baseEnv) },
    ];
  } else {
    // 无 VPN：先镜像，再官方源
    return [
      { label: 'npm 镜像源', command: installPlan.command, env: buildRegistryEnv(NPM_MIRROR_REGISTRY, baseEnv) },
      { label: 'npm 官方源', command: installPlan.command, env: buildRegistryEnv(NPM_OFFICIAL_REGISTRY, baseEnv) },
    ];
  }
}

/**
 * 确保依赖已安装（git 或 pnpm）
 * 包含 pnpm 自举策略（corepack -> npm exec -> 全局安装）
 */
export function ensureDependencyInstalled(
  name: 'git' | 'pnpm',
  addLog: (msg: string, level?: 'info' | 'success' | 'error' | 'warning') => void
): { success: boolean; manual?: string } {
  const adapter = getPlatformAdapter();

  // For pnpm on Windows, use more robust check
  const isPnpmAvailable = name === 'pnpm' ? checkPnpmAvailable() : checkCommand(name);
  if (isPnpmAvailable) {
    return { success: true };
  }

  const plan = adapter.getDependencyInstallPlan(name);
  if (!plan) {
    return { success: false };
  }

  addLog(`未检测到 ${name}，尝试自动安装...`, 'warning');
  if (name === 'pnpm') {
    if (checkCommand('corepack')) {
      addLog('尝试通过 Corepack 获取 pnpm...', 'info');
      const corepackResult = runCommand('corepack pnpm --version', process.cwd(), {
        timeout: 180000,
        ignoreError: true,
        silent: true,
      });
      if (corepackResult.success) {
        addLog('Corepack 已就绪，将通过 Corepack 提供 pnpm ✓', 'success');
        return { success: true };
      }
    }

    addLog('尝试通过 npm exec 临时拉起 pnpm...', 'info');
    const npmExecResult = runCommand('npm exec --yes pnpm -- --version', process.cwd(), {
      timeout: 300000,
      ignoreError: true,
      silent: true,
    });
    if (npmExecResult.success) {
      addLog('已切换到 npm exec 临时提供 pnpm ✓', 'success');
      return { success: true };
    }
  }

  if (!plan.command) {
    addLog(`${name} 无法自动安装`, 'error');
    return { success: false, manual: plan.manual };
  }

  const installCommands = name === 'pnpm'
    ? [
        plan.command,
        'npm install -g pnpm --registry=https://registry.npmmirror.com',
      ]
    : [plan.command];
  let installResult: ReturnType<typeof runCommand> = { success: false };

  for (let index = 0; index < installCommands.length; index++) {
    const command = installCommands[index];
    if (index > 0 && name === 'pnpm') {
      addLog('默认源失败，尝试 npm 镜像源安装 pnpm...', 'warning');
    }
    installResult = runCommand(command, process.cwd(), {
      timeout: 900000,
      ignoreError: true,
    });
    if (installResult.success) {
      break;
    }
  }

  if (name === 'git' && os.platform() === 'darwin' && plan.command === 'xcode-select --install') {
    if (checkCommand(name)) {
      addLog(`${name} 自动安装成功 ✓`, 'success');
      return { success: true };
    }
    addLog('已触发 Xcode Command Line Tools 安装器，请先完成安装后重试', 'warning');
    return {
      success: false,
      manual: '已打开 Xcode Command Line Tools 安装器，请完成安装后重新点击部署',
    };
  }

  // For pnpm, use the more robust check after installation
  const checkResult = name === 'pnpm' ? checkPnpmAvailable() : checkCommand(name);
  if (!installResult.success || !checkResult) {
    addLog(`${name} 自动安装失败`, 'error');
    return { success: false, manual: plan.manual };
  }

  addLog(`${name} 自动安装成功 ✓`, 'success');
  return { success: true };
}

/**
 * 应用 Windows 原生模块补丁
 * 从 onlyBuiltDependencies 中移除需要编译的原生模块，避免 Windows 上编译失败
 */
export function applyWindowsNativePatch(projectPath: string): NativePatchResult {
  if (os.platform() !== 'win32') {
    return { changed: false, restore: () => {} };
  }

  const packageJsonPath = path.join(projectPath, 'package.json');

  try {
    if (!fs.existsSync(packageJsonPath)) {
      return { changed: false, restore: () => {} };
    }

    const packageRaw = fs.readFileSync(packageJsonPath, 'utf-8');
    const parsed = JSON.parse(packageRaw) as Record<string, unknown>;
    const pnpmConfig = (parsed.pnpm as Record<string, unknown> | undefined) || {};

    // 需要移除的原生模块列表（这些模块在 Windows 上可能编译失败）
    const nativeModulesToRemove = [
      '@tloncorp/api',
      '@lydell/node-pty',
      'authenticate-pam',  // Linux PAM，Windows 上肯定失败
    ];

    const onlyBuiltDependencies = Array.isArray(pnpmConfig.onlyBuiltDependencies)
      ? (pnpmConfig.onlyBuiltDependencies as string[])
      : [];

    const filtered = onlyBuiltDependencies.filter(
      (dep) => !nativeModulesToRemove.includes(dep)
    );

    if (filtered.length === onlyBuiltDependencies.length) {
      return { changed: false, restore: () => {} };
    }

    parsed.pnpm = {
      ...pnpmConfig,
      onlyBuiltDependencies: filtered,
    };

    fs.writeFileSync(packageJsonPath, `${JSON.stringify(parsed, null, 2)}\n`);

    return {
      changed: true,
      restore: () => {
        fs.writeFileSync(packageJsonPath, packageRaw);
      },
    };
  } catch (error) {
    return { changed: false, error: (error as Error).message, restore: () => {} };
  }
}
