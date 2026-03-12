const fs = require('fs') as typeof import('fs');
const os = require('os') as typeof import('os');
const path = require('path') as typeof import('path');

const {
  getManagedOpenClawStateDir,
  isOpenClawProjectDir,
  detectProjectPackageManager,
  normalizeProjectPath,
} = require('../../runtime/openclaw/openclaw-project') as typeof import('../../runtime/openclaw/openclaw-project');

const {
  clearOpenClawDeploymentConfig,
  removePathIfExists,
  saveConfig,
} = require('../config/lobster-config') as typeof import('../config/lobster-config');

const {
  checkDependencies,
  OPENCLAW_MIN_NODE_VERSION,
  checkPnpmAvailable,
  getCommandLookupEnv,
} = require('../../core/diagnostics/system-check') as typeof import('../../core/diagnostics/system-check');

const {
  checkCommand,
  runCommand,
} = require('../../shared/process/process-utils') as typeof import('../../shared/process/process-utils');
const {
  getGithubMirrors,
  getMirrorRepo,
} = require('../../packaging/release/release-sources') as typeof import('../../packaging/release/release-sources');

// 从平台模块导入安装策略
const { getPackageInstallAttempts, getGithubDirectConnected } = require('../../platform/install') as typeof import('../../platform/install');

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

  return { ready: true };
}

function getCurrentGitBranch(projectPath: string): string {
  const branchResult = runCommand('git branch --show-current', projectPath, {
    ignoreError: true,
    silent: true,
  });
  const branch = String(branchResult.stdout || '').trim();
  return branch || 'main';
}

export function resolveRemoteDefaultRef(projectPath: string): string {
  const originHead = runCommand('git symbolic-ref refs/remotes/origin/HEAD', projectPath, {
    ignoreError: true,
    silent: true,
  });

  if (originHead.success && originHead.stdout) {
    const match = originHead.stdout.trim().match(/^refs\/remotes\/origin\/(.+)$/);
    if (match?.[1]) {
      return `origin/${match[1]}`;
    }
  }

  const mainRef = runCommand('git rev-parse --verify origin/main', projectPath, {
    ignoreError: true,
    silent: true,
  });
  if (mainRef.success) {
    return 'origin/main';
  }

  const masterRef = runCommand('git rev-parse --verify origin/master', projectPath, {
    ignoreError: true,
    silent: true,
  });
  if (masterRef.success) {
    return 'origin/master';
  }

  return 'origin/main';
}

export function handleUpdateOpenClaw(
  config: Record<string, unknown>,
  deps: {
    logError: (error: Error, context?: string) => void;
    getUserFriendlyMessage: (error: unknown) => string;
    getUpdateState?: () => { mode: string };
  }
): Record<string, unknown> {
  // 检查龙虾助手更新状态（required 模式阻止 OpenClaw 更新）
  if (deps.getUpdateState) {
    const updateState = deps.getUpdateState();
    if (updateState.mode === 'required') {
      return {
        success: false,
        error: '龙虾助手版本过低，需要先更新到最新版本。请在 Web 控制台点击"立即更新"按钮。',
        updateRequired: true,
      };
    }
  }

  const installPath = normalizeProjectPath(String(config.installPath || '').trim());
  if (!installPath || !isOpenClawProjectDir(installPath)) {
    return { success: false, error: '请先部署' };
  }

  // 检查 .git 目录是否存在
  if (!fs.existsSync(path.join(installPath, '.git'))) {
    return { success: false, error: '当前安装版本不支持在线更新，请重新部署最新版本' };
  }

  // 检查 git 是否可用
  if (!checkCommand('git')) {
    return { success: false, error: '未找到 Git，请先安装 Git 后再更新' };
  }

  try {
    const branch = getCurrentGitBranch(installPath);
    let fetchTarget = 'origin';
    let fetchResult = runCommand('git fetch origin', installPath, {
      timeout: 60000,
      ignoreError: true,
      silent: true,
    });
    if (!fetchResult.success) {
      // 添加总重试次数限制，防止无限循环
      const MAX_MIRROR_RETRIES = Math.min(getGithubMirrors().length, 5);
      for (let index = 0; index < MAX_MIRROR_RETRIES; index++) {
        const repoUrl = getMirrorRepo(index);
        const mirrorFetch = runCommand(`git fetch --depth 1 ${repoUrl} ${branch}`, installPath, {
          timeout: 120000,
          ignoreError: true,
          silent: true,
        });
        if (mirrorFetch.success) {
          fetchResult = mirrorFetch;
          fetchTarget = 'FETCH_HEAD';
          break;
        }
      }
    }

    if (!fetchResult.success) {
      return { success: false, error: fetchResult.stderr || '无法获取远程版本信息' };
    }

    const remoteRef = fetchTarget === 'origin'
      ? resolveRemoteDefaultRef(installPath)
      : fetchTarget;
    const localResult = runCommand('git rev-parse HEAD', installPath);
    const remoteResult = runCommand(`git rev-parse ${remoteRef}`, installPath);

    if (!localResult.success || !remoteResult.success) {
      return { success: false, error: '无法获取版本信息' };
    }

    if (localResult.stdout === remoteResult.stdout) {
      return { success: true, message: '已是最新版本' };
    }

    const resetResult = runCommand(`git reset --hard ${remoteRef}`, installPath);
    if (!resetResult.success) {
      return { success: false, error: resetResult.stderr || '更新失败' };
    }

    const projectPackageManager = detectProjectPackageManager(installPath);
    if (projectPackageManager === 'pnpm' && !checkPnpmAvailable()) {
      return { success: false, error: '当前 OpenClaw 源码要求使用 pnpm，请先安装 pnpm，或确认 corepack / npm 可用后再更新' };
    }

    let installResult: ReturnType<typeof runCommand> = { success: false };
    const installAttempts = getPackageInstallAttempts(installPath, getCommandLookupEnv(), getGithubDirectConnected());
    for (let index = 0; index < installAttempts.length; index++) {
      const attempt = installAttempts[index];
      installResult = runCommand(attempt.command, installPath, {
        timeout: 300000,
        ignoreError: true,
        env: attempt.env,
      });
      if (installResult.success) {
        break;
      }
    }
    if (!installResult.success) {
      return { success: false, error: installResult.stderr || '依赖安装失败' };
    }

    // npm 包已预编译，无需 build 步骤
    return { success: true, message: 'OpenClaw 更新成功！' };
  } catch (e) {
    const error = e as Error;
    deps.logError(error, 'update-openclaw');
    return { success: false, error: deps.getUserFriendlyMessage(error) };
  }
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
  // 检查龙虾助手更新状态（required 模式阻止卸载）
  if (deps.getUpdateState) {
    const updateState = deps.getUpdateState();
    if (updateState.mode === 'required') {
      return {
        success: false,
        error: '龙虾助手版本过低，需要先更新到最新版本。请在 Web 控制台点击"立即更新"按钮。',
        updateRequired: true,
      };
    }
  }

  const installPath = normalizeProjectPath(String(config.installPath || '').trim());
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
