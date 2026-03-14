const fs = require('fs') as typeof import('fs');
const os = require('os') as typeof import('os');
const path = require('path') as typeof import('path');

const {
  getManagedOpenClawStateDir,
  isOpenClawProjectDir,
  detectProjectPackageManager,
} = require('../../runtime/openclaw/openclaw-project') as typeof import('../../runtime/openclaw/openclaw-project');

const {
  normalizePath,
} = require('../../platform/path/platform-paths') as typeof import('../../platform/path/platform-paths');

const {
  clearOpenClawDeploymentConfig,
  removePathIfExists,
  saveConfig,
} = require('../config/lobster-config') as typeof import('../config/lobster-config');

const {
  checkDependencies,
  OPENCLAW_MIN_NODE_VERSION,
  checkPnpmAvailable,
} = require('../../core/diagnostics/system-check') as typeof import('../../core/diagnostics/system-check');

function getMissingPackage(projectPath: string, packageRefs: string[]): string | null {
  const nodeModulesPath = path.join(projectPath, 'node_modules');
  for (const packageRef of packageRefs) {
    const packageName = packageRef.split('/')[0];
    // 检查 node_modules 中是否存在该包的 package.json（文件系统检查，兼容 ESM-only 包）
    const packageJsonPath = path.join(nodeModulesPath, packageName, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return packageName;
    }
  }
  return null;
}

export function checkOpenClawRuntimeReadiness(projectPath: string, options?: { useBundledNode?: boolean }): { ready: boolean; error?: string } {
  if (!isOpenClawProjectDir(projectPath)) {
    return { ready: false, error: '当前安装路径不是有效的 OpenClaw 项目，请重新部署' };
  }

  if (!fs.existsSync(path.join(projectPath, 'package.json'))) {
    return { ready: false, error: 'OpenClaw 安装目录缺少 package.json，请重新部署' };
  }

  // 离线包模式下跳过 pnpm 检查（依赖已内置）
  if (!options?.useBundledNode) {
    const packageManager = detectProjectPackageManager(projectPath);
    if (packageManager === 'pnpm' && !checkPnpmAvailable()) {
      return { ready: false, error: '当前 OpenClaw 源码要求使用 pnpm，请先安装 pnpm，或确认 corepack / npm 可用后再启动' };
    }
  }

  if (!fs.existsSync(path.join(projectPath, 'node_modules'))) {
    return { ready: false, error: 'OpenClaw 依赖尚未安装，请先执行"部署 OpenClaw"或手动安装依赖' };
  }

  const packageJsonPath = path.join(projectPath, 'package.json');
  let topLevelDeps: string[] = [];
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as { dependencies?: Record<string, unknown> };
    topLevelDeps = Object.keys(packageJson.dependencies || {});
  } catch {
    return { ready: false, error: 'OpenClaw package.json 解析失败，请重新部署' };
  }

  const requiredPackages = Array.from(new Set([
    ...topLevelDeps.map((name) => `${name}/package.json`),
    'file-type/package.json',
    'strtok3/package.json',
  ]));

  const missingPackage = getMissingPackage(projectPath, requiredPackages);
  if (missingPackage) {
    const fixHint = '请联系售后客服处理';
    return {
      ready: false,
      error: `OpenClaw 依赖不完整（缺少 ${missingPackage}），${fixHint}`,
    };
  }

  return { ready: true };
}

export function handleUpdateOpenClaw(
  _config: Record<string, unknown>,
  _deps: {
    logError: (error: Error, context?: string) => void;
    getUserFriendlyMessage: (error: unknown) => string;
    getUpdateState?: () => { mode: string };
  }
): Record<string, unknown> {
  // OpenClaw 不支持在线更新，请联系售后服务
  void _config;
  void _deps;
  return {
    success: false,
    error: 'OpenClaw 更新请联系售后服务获取最新版本',
    contactSupport: true,
  };
}

export async function handleUninstallOpenClaw(
  config: Record<string, unknown>,
  deps: {
    stopGatewayProcess: (config: Record<string, unknown>, timeoutMs?: number) => Promise<Record<string, unknown>>;
    getGatewayRuntimeStatus: (config: Record<string, unknown>) => Record<string, unknown>;
    logError: (error: Error, context?: string) => void;
    clearLogs: () => void;
    getUpdateState?: () => { mode: string };
  }
): Promise<Record<string, unknown>> {
  const installPath = normalizePath(String(config.installPath || '').trim());
  const managedStateDir = getManagedOpenClawStateDir(config);
  const removedPaths: string[] = [];

  if (!installPath && !fs.existsSync(managedStateDir)) {
    clearOpenClawDeploymentConfig(config);
    saveConfig(config);
    return {
      success: true,
      message: '当前没有检测到可卸载的 OpenClaw 部署。部署配置已清空。',
      removedPaths: [],
      config,
      status: deps.getGatewayRuntimeStatus(config),
    };
  }

  try {
    const stopResult = await deps.stopGatewayProcess(config, 15000);
    if (!stopResult.success) {
      return stopResult;
    }

    if (installPath) {
      removePathIfExists(installPath, removedPaths);
    }

    removePathIfExists(managedStateDir, removedPaths);
    removePathIfExists(path.join(os.tmpdir(), 'openclaw'), removedPaths);

    clearOpenClawDeploymentConfig(config);
    saveConfig(config);
    deps.clearLogs();

    return {
      success: true,
      message: 'OpenClaw 已彻底卸载。安装目录、运行缓存、临时日志和部署配置都已清理。',
      removedPaths,
      config,
      status: deps.getGatewayRuntimeStatus(config),
    };
  } catch (e) {
    const error = e as Error;
    deps.logError(error, 'uninstall-openclaw');
    return { success: false, error: `卸载失败：${error.message}` };
  }
}

export function getDeployEnvironmentSummary() {
  const deps = checkDependencies();
  return {
    dependencies: deps,
    minNodeVersion: OPENCLAW_MIN_NODE_VERSION,
  };
}
