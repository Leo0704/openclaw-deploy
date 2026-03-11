const fs = require('fs') as typeof import('fs');
const os = require('os') as typeof import('os');
const path = require('path') as typeof import('path');

const {
  getBuildCommand,
  getInstallCommand,
  getManagedOpenClawStateDir,
  isOpenClawProjectDir,
  detectProjectPackageManager,
} = require('./openclaw-project') as typeof import('./openclaw-project');

const {
  clearOpenClawDeploymentConfig,
  removePathIfExists,
  saveConfig,
} = require('./lobster-config') as typeof import('./lobster-config');

const {
  checkDependencies,
  OPENCLAW_MIN_NODE_VERSION,
  checkPnpmAvailable,
} = require('./system-check') as typeof import('./system-check');

const {
  checkCommand,
  runCommand,
} = require('./process-utils') as typeof import('./process-utils');

type TemporaryPatchResult = {
  changed: boolean;
  error?: string;
  restore: () => void;
};

export function checkOpenClawRuntimeReadiness(projectPath: string): { ready: boolean; error?: string } {
  if (!isOpenClawProjectDir(projectPath)) {
    return { ready: false, error: '当前安装路径不是有效的 OpenClaw 项目，请重新部署' };
  }

  if (!fs.existsSync(path.join(projectPath, 'package.json'))) {
    return { ready: false, error: 'OpenClaw 安装目录缺少 package.json，请重新部署' };
  }

  const packageManager = detectProjectPackageManager(projectPath);
  if (packageManager === 'pnpm' && !canBootstrapPnpm()) {
    return { ready: false, error: '当前 OpenClaw 源码要求使用 pnpm，请先安装 pnpm，或确认 corepack / npm 可用后再启动' };
  }

  if (!fs.existsSync(path.join(projectPath, 'node_modules'))) {
    return { ready: false, error: 'OpenClaw 依赖尚未安装，请先执行”部署 OpenClaw”或手动安装依赖' };
  }

  return { ready: true };
}

export function getDependencyInstallPlan(name: 'git' | 'pnpm'): { command: string; manual: string } | null {
  if (name === 'pnpm') {
    return {
      command: 'npm install -g pnpm',
      manual: '请先执行 `corepack pnpm --version`，或执行 `npm install -g pnpm --registry=https://registry.npmmirror.com` 后重试',
    };
  }

  switch (os.platform()) {
    case 'win32':
      if (checkCommand('winget')) {
        return {
          command: 'winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements',
          manual: '请先安装 Git for Windows: https://git-scm.com/download/win',
        };
      }
      return { command: '', manual: '请先安装 Git for Windows: https://git-scm.com/download/win' };
    case 'darwin':
      if (checkCommand('brew')) {
        return {
          command: 'brew install git',
          manual: '请先执行 `brew install git`，或安装 Xcode Command Line Tools',
        };
      }
      return {
        command: 'xcode-select --install',
        manual: '请先安装 Xcode Command Line Tools，或执行 `brew install git`',
      };
    default:
      if (checkCommand('apt-get')) {
        return { command: 'sudo apt-get update && sudo apt-get install -y git', manual: '请先执行 `sudo apt-get install -y git` 后重试' };
      }
      if (checkCommand('dnf')) {
        return { command: 'sudo dnf install -y git', manual: '请先执行 `sudo dnf install -y git` 后重试' };
      }
      if (checkCommand('yum')) {
        return { command: 'sudo yum install -y git', manual: '请先执行 `sudo yum install -y git` 后重试' };
      }
      if (checkCommand('pacman')) {
        return { command: 'sudo pacman -Sy --noconfirm git', manual: '请先执行 `sudo pacman -Sy git` 后重试' };
      }
      return { command: '', manual: '请先手动安装 Git 后重试' };
  }
}

function canBootstrapPnpm(): boolean {
  return checkPnpmAvailable() || checkCommand('corepack') || checkCommand('npm');
}

export function ensureDependencyInstalled(
  name: 'git' | 'pnpm',
  addLog: (msg: string, level?: 'info' | 'success' | 'error' | 'warning') => void
): { success: boolean; manual?: string } {
  // For pnpm on Windows, use more robust check
  const isPnpmAvailable = name === 'pnpm' ? checkPnpmAvailable() : checkCommand(name);
  if (isPnpmAvailable) {
    return { success: true };
  }

  const plan = getDependencyInstallPlan(name);
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

export function applyTemporaryWindowsTlonPatch(projectPath: string): TemporaryPatchResult {
  if (os.platform() !== 'win32') {
    return { changed: false, restore: () => {} };
  }

  const workspacePath = path.join(projectPath, 'pnpm-workspace.yaml');
  const packageJsonPath = path.join(projectPath, 'package.json');

  try {
    let changed = false;
    const originals = new Map<string, string>();

    if (fs.existsSync(workspacePath)) {
      const workspaceRaw = fs.readFileSync(workspacePath, 'utf-8');
      if (!workspaceRaw.includes('!extensions/tlon')) {
        originals.set(workspacePath, workspaceRaw);
        const marker = '  - extensions/*';
        const patchedWorkspace = workspaceRaw.includes(marker)
          ? workspaceRaw.replace(marker, `${marker}\n  - "!extensions/tlon"`)
          : `${workspaceRaw.trimEnd()}\n  - "!extensions/tlon"\n`;
        fs.writeFileSync(workspacePath, patchedWorkspace);
        changed = true;
      }
    }

    if (fs.existsSync(packageJsonPath)) {
      const packageRaw = fs.readFileSync(packageJsonPath, 'utf-8');
      if (packageRaw.includes('"@tloncorp/api"')) {
        const parsed = JSON.parse(packageRaw) as Record<string, unknown>;
        const pnpmConfig = (parsed.pnpm as Record<string, unknown> | undefined) || {};
        const onlyBuiltDependencies = Array.isArray(pnpmConfig.onlyBuiltDependencies)
          ? pnpmConfig.onlyBuiltDependencies.filter((entry) => entry !== '@tloncorp/api')
          : pnpmConfig.onlyBuiltDependencies;
        const alreadyRemoved = !Array.isArray(pnpmConfig.onlyBuiltDependencies) || !pnpmConfig.onlyBuiltDependencies.includes('@tloncorp/api');

        if (!alreadyRemoved) {
          originals.set(packageJsonPath, packageRaw);
          parsed.pnpm = {
            ...pnpmConfig,
            onlyBuiltDependencies,
          };
          fs.writeFileSync(packageJsonPath, `${JSON.stringify(parsed, null, 2)}\n`);
          changed = true;
        }
      }
    }

    return {
      changed,
      restore: () => {
        for (const [filePath, content] of originals.entries()) {
          fs.writeFileSync(filePath, content);
        }
      },
    };
  } catch (error) {
    return { changed: false, error: (error as Error).message, restore: () => {} };
  }
}

export function handleUpdateOpenClaw(
  config: Record<string, unknown>,
  deps: {
    logError: (error: Error, context?: string) => void;
    getUserFriendlyMessage: (error: unknown) => string;
  }
): Record<string, unknown> {
  if (!config.installPath || !isOpenClawProjectDir(config.installPath as string)) {
    return { success: false, error: '请先部署' };
  }

  try {
    const fetchResult = runCommand('git fetch origin', config.installPath as string, { timeout: 60000 });
    if (!fetchResult.success) {
      return { success: false, error: fetchResult.stderr || '无法获取远程版本信息' };
    }

    const remoteRef = resolveRemoteDefaultRef(config.installPath as string);
    const localResult = runCommand('git rev-parse HEAD', config.installPath as string);
    const remoteResult = runCommand(`git rev-parse ${remoteRef}`, config.installPath as string);

    if (!localResult.success || !remoteResult.success) {
      return { success: false, error: '无法获取版本信息' };
    }

    if (localResult.stdout === remoteResult.stdout) {
      return { success: true, message: '已是最新版本' };
    }

    const resetResult = runCommand(`git reset --hard ${remoteRef}`, config.installPath as string);
    if (!resetResult.success) {
      return { success: false, error: resetResult.stderr || '更新失败' };
    }

    const projectPackageManager = detectProjectPackageManager(config.installPath as string);
    if (projectPackageManager === 'pnpm' && !canBootstrapPnpm()) {
      return { success: false, error: '当前 OpenClaw 源码要求使用 pnpm，请先安装 pnpm，或确认 corepack / npm 可用后再更新' };
    }

    const installPlan = getInstallCommand(config.installPath as string);
    const buildPlan = getBuildCommand(config.installPath as string);
    const installResult = runCommand(installPlan.command, config.installPath as string, { timeout: 300000 });
    if (!installResult.success) {
      return { success: false, error: installResult.stderr || '依赖安装失败' };
    }

    const buildResult = runCommand(buildPlan.command, config.installPath as string, { timeout: 300000, ignoreError: true });
    if (!buildResult.success) {
      return { success: false, error: buildResult.stderr || '构建失败' };
    }

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
  }
): Promise<Record<string, unknown>> {
  const installPath = String(config.installPath || '').trim();
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
    return { success: false, error: `卸载失败: ${error.message}` };
  }
}

export function getDeployEnvironmentSummary() {
  const deps = checkDependencies();
  return {
    dependencies: deps,
    minNodeVersion: OPENCLAW_MIN_NODE_VERSION,
  };
}
