const fs = require('fs') as typeof import('fs');
const os = require('os') as typeof import('os');
const path = require('path') as typeof import('path');

const {
  checkDependencies,
  OPENCLAW_MIN_NODE_VERSION,
  performHealthChecks,
} = require('./system-check') as typeof import('./system-check');
const {
  applyTemporaryWindowsTlonPatch,
  ensureDependencyInstalled,
} = require('./deployment-service') as typeof import('./deployment-service');
const {
  detectProjectPackageManager,
  getBuildCommand,
  getInstallCommand,
  isOpenClawProjectDir,
} = require('./openclaw-project') as typeof import('./openclaw-project');
const { runCommandStreaming } = require('./process-utils') as typeof import('./process-utils');
const { getCommandLookupEnv } = require('./system-check') as typeof import('./system-check');
const { saveConfig } = require('./lobster-config') as typeof import('./lobster-config');
const {
  normalizeApiFormat,
  normalizeEndpointId,
} = require('./provider-utils') as typeof import('./provider-utils');

type DeployLogLevel = 'info' | 'success' | 'error' | 'warning';

type DeployTaskDeps = {
  defaultGatewayPort: number;
  getMirrorRepo: (mirrorIndex: number) => string;
  githubMirrors: Array<{ name: string }>;
  getGatewayRuntimeStatus: (config: Record<string, unknown>) => Record<string, unknown>;
  getUserFriendlyMessage: (error: unknown) => string;
  logError: (error: Error, context?: string) => void;
  addLog: (message: string, level?: DeployLogLevel) => void;
};

export async function performDeployTask(
  data: Record<string, unknown>,
  baseConfig: Record<string, unknown>,
  deps: DeployTaskDeps
): Promise<Record<string, unknown>> {
  const installPath = (data.installPath as string) || path.join(os.homedir(), 'openclaw');
  const gatewayPort = (data.gatewayPort as number) || deps.defaultGatewayPort;
  const config = { ...baseConfig };

  const streamCommand = async (
    command: string,
    cwd: string,
    options: { timeout?: number; ignoreError?: boolean; env?: NodeJS.ProcessEnv } = {}
  ) => {
    const result = await runCommandStreaming(command, cwd, {
      timeout: options.timeout,
      env: options.env,
      onLog: (level, message) => deps.addLog(message, level === 'error' ? 'error' : 'info'),
    });
    if (!result.success && !options.ignoreError) {
      throw new Error(result.stderr || result.error?.userMessage || '命令执行失败');
    }
    return result;
  };

  // 将 git+ssh://git@github.com/ 重写为 https://github.com/ 避免 SSH key 问题
  const getInstallEnv = (): NodeJS.ProcessEnv => ({
    ...getCommandLookupEnv(),
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'url.https://github.com/.insteadOf',
    GIT_CONFIG_VALUE_0: 'git+ssh://git@github.com/',
    GIT_SSH_COMMAND: 'ssh -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null',
  });

  try {
    deps.addLog('开始部署...');

    if (/[;&|`$(){}[\]<>!\\]/.test(installPath)) {
      deps.addLog('错误: 安装路径包含非法字符', 'error');
      return { success: false, error: '安装路径包含非法字符，请使用普通目录路径' };
    }

    if (!data.apiKey) {
      deps.addLog('错误: 未提供 API Key', 'error');
      return { success: false, error: '请输入 API Key' };
    }
    if (!data.model) {
      deps.addLog('错误: 未选择模型', 'error');
      return { success: false, error: '请选择模型' };
    }

    deps.addLog('执行部署前预检...');
    const precheck = await performHealthChecks({
      installPath,
      gatewayPort,
      requiredDiskSpace: 500 * 1024 * 1024,
    });
    precheck.checks.forEach((check) => {
      deps.addLog(
        `[预检] ${check.name}: ${check.message}`,
        check.passed ? 'success' : check.severity === 'warning' ? 'warning' : 'error'
      );
    });
    if (precheck.errors.length > 0) {
      return { success: false, error: precheck.errors[0] };
    }

    deps.addLog('检查系统依赖...');
    const dependencyStatus = checkDependencies();
    if (!dependencyStatus.node.valid) {
      deps.addLog(`错误: Node.js 版本过低 (当前: v${dependencyStatus.node.version}, 需要: v${OPENCLAW_MIN_NODE_VERSION})`, 'error');
      return { success: false, error: `Node.js 版本过低，请升级到 v${OPENCLAW_MIN_NODE_VERSION} 或更高版本` };
    }
    if (!dependencyStatus.git) {
      const gitInstall = ensureDependencyInstalled('git', deps.addLog);
      if (!gitInstall.success) {
        return { success: false, error: gitInstall.manual || '未找到 Git，请先安装 Git 后重试' };
      }
    }
    if (!dependencyStatus.npm) {
      deps.addLog('错误: 未找到 npm', 'error');
      return { success: false, error: '未找到 npm，请先安装 Node.js: https://nodejs.org' };
    }
    let pnpmAvailable = dependencyStatus.pnpm;
    deps.addLog(`依赖检查通过 ✓ (Node: v${dependencyStatus.node.version}, Git: ✓, npm: ✓, pnpm: ${pnpmAvailable ? '✓' : '✗'})`, 'success');

    config.provider = data.provider || 'anthropic';
    config.model = data.model;
    config.apiKey = data.apiKey;
    config.gatewayPort = gatewayPort;
    if (data.baseUrl !== undefined) config.baseUrl = data.baseUrl;
    if (data.apiFormat !== undefined) config.apiFormat = normalizeApiFormat(data.apiFormat);
    if (data.customModelId !== undefined) config.customModelId = data.customModelId;
    if (data.customEndpointId !== undefined) config.customEndpointId = normalizeEndpointId(data.customEndpointId) || 'custom';
    if (data.customModelAlias !== undefined) config.customModelAlias = String(data.customModelAlias || '').trim();
    if (data.contextWindow !== undefined) config.contextWindow = data.contextWindow;
    if (data.maxTokens !== undefined) config.maxTokens = data.maxTokens;

    if (!fs.existsSync(installPath)) {
      let cloneSuccess = false;
      for (let i = 0; i < deps.githubMirrors.length; i++) {
        const mirror = deps.githubMirrors[i];
        const repoUrl = deps.getMirrorRepo(i);
        deps.addLog(`尝试克隆 (${mirror.name})...`);
        const cloneResult = await streamCommand(`git clone --depth 1 ${repoUrl} "${installPath}"`, process.cwd(), {
          timeout: 300000,
          ignoreError: true,
        });

        if (cloneResult.success) {
          deps.addLog(`仓库克隆成功 ✓ (使用: ${mirror.name})`, 'success');
          cloneSuccess = true;
          break;
        }

        deps.addLog(`${mirror.name} 克隆失败，尝试下一个...`, 'warning');
        if (fs.existsSync(installPath)) {
          try {
            fs.rmSync(installPath, { recursive: true, force: true });
          } catch (error) {
            deps.addLog(`克隆失败后的目录清理也失败了: ${(error as Error).message}`, 'error');
            return { success: false, error: '克隆失败后无法清理安装目录，请手动删除该目录后重试' };
          }
        }
      }

      if (!cloneSuccess) {
        deps.addLog('所有镜像源均克隆失败，请检查网络', 'error');
        return { success: false, error: '网络连接失败，请检查网络后重试' };
      }
    } else {
      const existingStat = fs.statSync(installPath);
      if (!existingStat.isDirectory()) {
        deps.addLog('错误: 安装路径指向一个文件', 'error');
        return { success: false, error: '安装路径指向一个文件，请改成目录路径' };
      }
      if (!isOpenClawProjectDir(installPath)) {
        const existingEntries = fs.readdirSync(installPath);
        if (existingEntries.length === 0) {
          deps.addLog('目录存在但为空，将在该目录中克隆 OpenClaw...');
          let cloneSuccess = false;
          for (let i = 0; i < deps.githubMirrors.length; i++) {
            const mirror = deps.githubMirrors[i];
            const repoUrl = deps.getMirrorRepo(i);
            deps.addLog(`尝试克隆 (${mirror.name})...`);
            const cloneResult = await streamCommand(`git clone --depth 1 ${repoUrl} "${installPath}"`, process.cwd(), {
              timeout: 300000,
              ignoreError: true,
            });
            if (cloneResult.success) {
              deps.addLog(`仓库克隆成功 ✓ (使用: ${mirror.name})`, 'success');
              cloneSuccess = true;
              break;
            }
            deps.addLog(`${mirror.name} 克隆失败，尝试下一个...`, 'warning');
            try {
              const gitDir = path.join(installPath, '.git');
              if (fs.existsSync(gitDir)) {
                fs.rmSync(gitDir, { recursive: true, force: true });
              }
            } catch {}
          }
          if (!cloneSuccess) {
            deps.addLog('所有镜像源均克隆失败，请检查网络', 'error');
            return { success: false, error: '网络连接失败，请检查网络后重试' };
          }
        } else {
          deps.addLog('错误: 目录已存在，但不是 OpenClaw 项目目录', 'error');
          return { success: false, error: '安装路径已存在且不是 OpenClaw 项目，请换一个空目录或正确的 OpenClaw 目录' };
        }
      } else {
        deps.addLog('目录已存在，更新中...');
        const pullResult = await streamCommand('git pull', installPath, {
          timeout: 300000,
          ignoreError: true,
        });
        if (pullResult.success) {
          deps.addLog('更新成功 ✓', 'success');
        } else {
          deps.addLog('更新失败，使用现有代码', 'warning');
        }
      }
    }

    const projectPackageManager = detectProjectPackageManager(installPath);
    const tlonPatch = applyTemporaryWindowsTlonPatch(installPath);
    if (tlonPatch.error) {
      deps.addLog(`Windows Tlon 依赖补丁应用失败: ${tlonPatch.error}`, 'warning');
    } else if (tlonPatch.changed) {
      deps.addLog('已临时禁用 Windows 下的 tlon 扩展安装，安装结束后会自动恢复仓库文件', 'warning');
    }

    if (projectPackageManager === 'pnpm' && !pnpmAvailable) {
      const pnpmInstall = ensureDependencyInstalled('pnpm', deps.addLog);
      if (!pnpmInstall.success) {
        return { success: false, error: pnpmInstall.manual || '当前 OpenClaw 源码要求使用 pnpm，请先安装 pnpm 后重试' };
      }
      pnpmAvailable = true;
    }

    try {
      const installPlan = getInstallCommand(installPath);
      deps.addLog(`安装依赖 (${installPlan.pm})...`);
      const installResult = await streamCommand(installPlan.command, installPath, {
        timeout: 600000,
        ignoreError: true,
        env: getInstallEnv(),
      });
      if (!installResult.success) {
        deps.addLog(`依赖安装失败: ${installResult.stderr}`, 'error');
        return { success: false, error: installResult.stderr || '依赖安装失败' };
      }
      deps.addLog('依赖安装成功 ✓', 'success');
    } finally {
      if (tlonPatch.changed) {
        tlonPatch.restore();
        deps.addLog('已恢复临时 Windows Tlon 依赖补丁，仓库工作树保持干净', 'info');
      }
    }

    deps.addLog('构建项目...');
    const buildPlan = getBuildCommand(installPath);
    const buildResult = await streamCommand(buildPlan.command, installPath, {
      timeout: 300000,
      ignoreError: true,
      env: getInstallEnv(),
    });
    if (buildResult.success) {
      deps.addLog('构建成功 ✓', 'success');
    } else {
      deps.addLog('构建跳过（可能无构建脚本）', 'warning');
    }

    config.installPath = installPath;
    saveConfig(config);
    deps.addLog('🎉 部署完成！', 'success');

    return { success: true, config, status: deps.getGatewayRuntimeStatus(config) };
  } catch (error) {
    deps.addLog(`❌ 部署失败: ${(error as Error).message}`, 'error');
    deps.logError(error as Error, 'deploy');
    return { success: false, error: deps.getUserFriendlyMessage(error) };
  }
}
