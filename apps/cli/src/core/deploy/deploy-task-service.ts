const fs = require('fs') as typeof import('fs');
const os = require('os') as typeof import('os');
const path = require('path') as typeof import('path');
const {
  getDefaultInstallPath,
  validateInstallPathForUse,
} = require('../../platform/path/platform-paths') as typeof import('../../platform/path/platform-paths');

const {
  checkDependencies,
  OPENCLAW_MIN_NODE_VERSION,
  performHealthChecks,
  getCommandLookupEnv,
} = require('../diagnostics/system-check') as typeof import('../diagnostics/system-check');
const {
  ensureDependencyInstalled,
  getPackageInstallAttempts,
  applyWindowsNativePatch,
  getGithubDirectConnected,
} = require('../../platform/install') as typeof import('../../platform/install');
const {
  detectProjectPackageManager,
  isOpenClawProjectDir,
  normalizeProjectPath,
} = require('../../runtime/openclaw/openclaw-project') as typeof import('../../runtime/openclaw/openclaw-project');
const {
  getOpenClawConfigPath,
} = require('../../platform/storage/storage-paths') as typeof import('../../platform/storage/storage-paths');
const {
  checkCommand,
  runCommandArgs,
  runCommandStreaming,
} = require('../../shared/process/process-utils') as typeof import('../../shared/process/process-utils');
const { saveConfig } = require('../config/lobster-config') as typeof import('../config/lobster-config');
const {
  normalizeApiFormat,
  normalizeEndpointId,
} = require('../providers/provider-utils') as typeof import('../providers/provider-utils');

// 超时配置（毫秒）
const TIMEOUTS = {
  // 依赖安装超时：8分钟（480秒）
  packageInstall: 480000,
};

// 内置源码路径（pkg 打包后的路径）
const BUNDLED_SOURCE_TAR = path.join(__dirname, '../../../assets/openclaw-source.tar.gz');
const BUNDLED_SOURCE_ZIP = path.join(__dirname, '../../../assets/openclaw-source.zip');
const BUNDLED_VERSION_FILE = path.join(__dirname, '../../../assets/openclaw-version.json');

/**
 * 修改 package.json，移除需要编译工具或 Git SSH 的依赖
 * 解决 Windows 上 node-llama-cpp 编译失败和 git+ssh 访问问题
 */
async function fixPackageJsonForWindows(
  projectPath: string,
  deps: DeployTaskDeps
): Promise<void> {
  const packageJsonPath = path.join(projectPath, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    deps.addLog('警告: 未找到 package.json，跳过依赖修复', 'warning');
    return;
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as Record<string, unknown>;
    let modified = false;

    // 1. 从 onlyBuiltDependencies 移除 node-llama-cpp
    if (pkg.pnpm && typeof pkg.pnpm === 'object' && 'onlyBuiltDependencies' in pkg.pnpm) {
      const onlyBuiltDeps = (pkg.pnpm as Record<string, unknown>).onlyBuiltDependencies as string[];
      if (Array.isArray(onlyBuiltDeps)) {
        const idx = onlyBuiltDeps.indexOf('node-llama-cpp');
        if (idx !== -1) {
          onlyBuiltDeps.splice(idx, 1);
          modified = true;
          deps.addLog('已移除 node-llama-cpp from onlyBuiltDependencies', 'info');
        }
      }
    }

    // 2. 从 peerDependencies 移除 node-llama-cpp
    if (pkg.peerDependencies && typeof pkg.peerDependencies === 'object') {
      const peerDeps = pkg.peerDependencies as Record<string, string>;
      if ('node-llama-cpp' in peerDeps) {
        delete peerDeps['node-llama-cpp'];
        modified = true;
        deps.addLog('已从 peerDependencies 移除 node-llama-cpp', 'info');
      }
    }

    // 3. 将 node-llama-cpp 添加到 optionalDependencies
    if (!pkg.optionalDependencies || typeof pkg.optionalDependencies !== 'object') {
      pkg.optionalDependencies = {};
    }
    const optionalDeps = pkg.optionalDependencies as Record<string, string>;
    if (!optionalDeps['node-llama-cpp']) {
      optionalDeps['node-llama-cpp'] = '3.16.2';
      modified = true;
      deps.addLog('已将 node-llama-cpp 添加到 optionalDependencies', 'info');
    }

    if (modified) {
      fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
      deps.addLog('package.json 已修复 ✓', 'success');
    }
  } catch (error) {
    deps.addLog(`修复 package.json 失败: ${error instanceof Error ? error.message : '未知错误'}`, 'warning');
  }
}

/**
 * 创建 .npmrc 和 git 配置，解决无 VPN 下的 git+ssh 访问问题
 */
async function createNpmrcForNoVpn(
  projectPath: string,
  deps: DeployTaskDeps
): Promise<void> {
  const npmrcPath = path.join(projectPath, '.npmrc');
  const gitconfigPath = path.join(projectPath, '.gitconfig');

  try {
    // 1. 创建 .npmrc
    if (!fs.existsSync(npmrcPath)) {
      const npmrcContent = `# 龙虾助手：解决无 VPN 下的 Git 依赖问题
enable-pre-post-scripts=true
`;
      fs.writeFileSync(npmrcPath, npmrcContent);
      deps.addLog('已创建 .npmrc 配置', 'info');
    }

    // 2. 创建 .gitconfig，将 git@ 转换为 https://
    if (!fs.existsSync(gitconfigPath)) {
      const gitconfigContent = `[url "https://github.com/"]
    insteadOf = git@github.com:
    insteadOf = git://github.com/

[url "https://github.com/"]
    insteadOf = git@github.com/
`;
      fs.writeFileSync(gitconfigPath, gitconfigContent);
      deps.addLog('已创建 .gitconfig 配置（将 git@ 转换为 https://）', 'info');
    }
  } catch (error) {
    deps.addLog(`创建配置文件失败: ${error instanceof Error ? error.message : '未知错误'}`, 'warning');
  }
}

interface BundledSourceInfo {
  version: string;
  commit: string;
  branch: string;
  packedAt: string;
}

function getBundledSourceInfo(): BundledSourceInfo | null {
  try {
    if (fs.existsSync(BUNDLED_VERSION_FILE)) {
      const content = fs.readFileSync(BUNDLED_VERSION_FILE, 'utf-8');
      return JSON.parse(content) as BundledSourceInfo;
    }
  } catch {}
  return null;
}

function hasBundledSource(): boolean {
  return fs.existsSync(BUNDLED_SOURCE_TAR) || fs.existsSync(BUNDLED_SOURCE_ZIP);
}

function getBundledSourcePath(): { path: string; format: 'tar.gz' | 'zip' } | null {
  if (fs.existsSync(BUNDLED_SOURCE_TAR)) return { path: BUNDLED_SOURCE_TAR, format: 'tar.gz' };
  if (fs.existsSync(BUNDLED_SOURCE_ZIP)) return { path: BUNDLED_SOURCE_ZIP, format: 'zip' };
  return null;
}

function materializeBundledAsset(assetPath: string, destDir: string): { success: boolean; path?: string; error?: string } {
  try {
    fs.mkdirSync(destDir, { recursive: true });
    const targetPath = path.join(destDir, path.basename(assetPath));
    fs.copyFileSync(assetPath, targetPath);
    return { success: true, path: targetPath };
  } catch (error) {
    return {
      success: false,
      error: `内置源码包复制失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
  }
}

type DeployLogLevel = 'info' | 'success' | 'error' | 'warning';

type DeployTaskDeps = {
  defaultGatewayPort: number;
  getGatewayRuntimeStatus: (config: Record<string, unknown>) => Record<string, unknown>;
  getUserFriendlyMessage: (error: unknown) => string;
  logError: (error: Error, context?: string) => void;
  addLog: (message: string, level?: DeployLogLevel) => void;
  getUpdateState?: () => { mode: string };
};

export async function performDeployTask(
  data: Record<string, unknown>,
  baseConfig: Record<string, unknown>,
  deps: DeployTaskDeps
): Promise<Record<string, unknown>> {
  // 检查龙虾助手更新状态（required 模式阻止部署）
  if (deps.getUpdateState) {
    const updateState = deps.getUpdateState();
    if (updateState.mode === 'required') {
      deps.addLog('错误: 龙虾助手版本过低，需要先更新', 'error');
      return {
        success: false,
        error: '龙虾助手版本过低，需要先更新到最新版本。请在 Web 控制台点击"立即更新"按钮。',
        updateRequired: true,
      };
    }
  }
  const installPathInput = normalizeProjectPath((data.installPath as string) || getDefaultInstallPath());
  const installPathValidation = validateInstallPathForUse(installPathInput, { probeWritable: true });
  if (!installPathValidation.valid) {
    deps.addLog(`错误: ${installPathValidation.error}`, 'error');
    return { success: false, error: installPathValidation.error || '安装路径无效' };
  }
  const installPath = installPathValidation.normalizedPath;
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

  const extractSourceArchive = async (archivePath: string, destDir: string, format: 'tar.gz' | 'zip') => {
    if (format === 'tar.gz') {
      if (!checkCommand('tar')) {
        return { success: false, error: '当前系统缺少 tar，无法解压源码归档' };
      }
      const extractResult = runCommandArgs('tar', process.cwd(), {
        args: ['-xzf', archivePath, '-C', destDir],
        timeout: 300000,
        ignoreError: true,
        silent: true,
      });
      return extractResult.success
        ? { success: true }
        : { success: false, error: extractResult.stderr || 'tar 解压失败' };
    }

    // ZIP 格式
    if (os.platform() === 'win32') {
      const powershell = checkCommand('powershell') ? 'powershell' : checkCommand('pwsh') ? 'pwsh' : '';
      if (!powershell) {
        return { success: false, error: '当前系统缺少 PowerShell，无法解压 ZIP 源码包' };
      }
      const extractResult = runCommandArgs(powershell, process.cwd(), {
        args: [
          '-NoProfile',
          '-Command',
          '& { Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force }',
          archivePath,
          destDir,
        ],
        timeout: 300000,
        ignoreError: true,
        silent: true,
      });
      return extractResult.success
        ? { success: true }
        : { success: false, error: extractResult.stderr || 'PowerShell 解压失败' };
    }

    if (!checkCommand('unzip')) {
      return { success: false, error: '当前系统缺少 unzip，无法解压 ZIP 源码包' };
    }

    const extractResult = runCommandArgs('unzip', process.cwd(), {
      args: ['-q', archivePath, '-d', destDir],
      timeout: 300000,
      ignoreError: true,
      silent: true,
    });
    return extractResult.success
      ? { success: true }
      : { success: false, error: extractResult.stderr || 'unzip 解压失败' };
  };

  /**
   * 从内置源码安装
   */
  const installFromBundledSource = async (): Promise<{ success: boolean; error?: string }> => {
    const bundledSource = getBundledSourcePath();
    if (!bundledSource) {
      return { success: false, error: '未找到内置源码' };
    }

    const sourceInfo = getBundledSourceInfo();
    deps.addLog(`使用内置源码 ${sourceInfo ? `(v${sourceInfo.version})` : ''}...`, 'info');

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-bundled-'));
    const extractDir = path.join(tempRoot, 'extract');
    const materializedDir = path.join(tempRoot, 'asset');
    fs.mkdirSync(extractDir, { recursive: true });

    try {
      const materializedAsset = materializeBundledAsset(bundledSource.path, materializedDir);
      if (!materializedAsset.success || !materializedAsset.path) {
        return { success: false, error: materializedAsset.error || '内置源码包复制失败' };
      }

      const extractResult = await extractSourceArchive(materializedAsset.path, extractDir, bundledSource.format);
      if (!extractResult.success) {
        return { success: false, error: `内置源码解压失败: ${extractResult.error}` };
      }

      // 查找解压后的根目录（通常 npm 包解压后会有一个 package 目录）
      let extractedRoot: string | undefined;
      try {
        extractedRoot = fs.readdirSync(extractDir)
          .map((entry) => path.join(extractDir, entry))
          .find((entry) => {
            try {
              return fs.existsSync(entry) && fs.statSync(entry).isDirectory();
            } catch {
              return false;
            }
          });
      } catch {
        return { success: false, error: '内置源码内容读取失败' };
      }

      if (!extractedRoot) {
        return { success: false, error: '内置源码内容无效' };
      }

      // 清理目标目录
      if (fs.existsSync(installPath)) {
        fs.rmSync(installPath, { recursive: true, force: true });
      }
      fs.mkdirSync(path.dirname(installPath), { recursive: true });
      fs.cpSync(extractedRoot, installPath, { recursive: true });

      // 修改 package.json，移除需要编译/Git SSH 的依赖
      await fixPackageJsonForWindows(installPath, deps);

      // 创建 .npmrc 配置，解决 git+ssh 访问问题
      await createNpmrcForNoVpn(installPath, deps);

      deps.addLog(`源码安装成功 ✓ ${sourceInfo ? `(v${sourceInfo.version})` : ''}`, 'success');
      return { success: true };
    } finally {
      try {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      } catch {}
    }
  };

  try {
    deps.addLog('开始部署...');

    if (!data.apiKey) {
      deps.addLog('错误: 未提供 API Key', 'error');
      return { success: false, error: '请输入 API Key' };
    }
    if (!data.model) {
      deps.addLog('错误: 未选择模型', 'error');
      return { success: false, error: '请选择模型' };
    }

    // 预检
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

    // 系统依赖检查
    deps.addLog('检查系统依赖...');
    const dependencyStatus = checkDependencies();
    if (!dependencyStatus.node.valid) {
      deps.addLog(`错误: Node.js 版本过低 (当前: v${dependencyStatus.node.version}, 需要: v${OPENCLAW_MIN_NODE_VERSION})`, 'error');
      return { success: false, error: `Node.js 版本过低，请升级到 v${OPENCLAW_MIN_NODE_VERSION} 或更高版本` };
    }
    if (!dependencyStatus.npm) {
      deps.addLog('错误: 未找到 npm', 'error');
      return { success: false, error: '未找到 npm，请先安装 Node.js: https://nodejs.org' };
    }
    let pnpmAvailable = dependencyStatus.pnpm;
    deps.addLog(`依赖检查通过 ✓ (Node: v${dependencyStatus.node.version}, npm: ✓, pnpm: ${pnpmAvailable ? '✓' : '✗'})`, 'success');

    // 保存配置
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

    // 检查目标目录状态
    if (fs.existsSync(installPath)) {
      let existingStat: import('fs').Stats;
      try {
        existingStat = fs.statSync(installPath);
      } catch {
        deps.addLog('错误: 安装路径无法访问', 'error');
        return { success: false, error: '安装路径无法访问，请检查路径是否正确' };
      }
      if (!existingStat.isDirectory()) {
        deps.addLog('错误: 安装路径指向一个文件', 'error');
        return { success: false, error: '安装路径指向一个文件，请改成目录路径' };
      }
      if (isOpenClawProjectDir(installPath)) {
        const hasGitDir = fs.existsSync(path.join(installPath, '.git'));
        if (hasGitDir) {
          deps.addLog('检测到现有 OpenClaw 项目（支持在线更新），将重新安装...', 'warning');
        } else {
          deps.addLog('检测到旧版本 OpenClaw（不支持在线更新），将完全重新安装并清理旧状态...', 'warning');
          // 清理旧版本的状态目录
          const oldStateDir = path.join(installPath, '.claude', 'state');
          if (fs.existsSync(oldStateDir)) {
            try {
              fs.rmSync(oldStateDir, { recursive: true, force: true });
              deps.addLog('已清理旧版本状态目录', 'info');
            } catch {
              // 忽略清理失败
            }
          }
          // 清理临时目录
          const tempOpenClawDir = path.join(os.tmpdir(), 'openclaw');
          if (fs.existsSync(tempOpenClawDir)) {
            try {
              fs.rmSync(tempOpenClawDir, { recursive: true, force: true });
            } catch {
              // 忽略清理失败
            }
          }
        }
      } else {
        const existingEntries = fs.readdirSync(installPath);
        if (existingEntries.length > 0) {
          deps.addLog('错误: 目录已存在且不为空', 'error');
          return { success: false, error: '安装路径已存在且不是 OpenClaw 项目，请换一个空目录' };
        }
      }
    }

    // 清理旧配置（新安装或路径变化时清理 ~/.openclaw/ 目录）
    const previousInstallPath = String(baseConfig.installPath || '');
    const newInstallPath = String(data.installPath || '');
    const openClawConfigDir = path.dirname(getOpenClawConfigPath());
    const shouldCleanConfig = !previousInstallPath || (newInstallPath && previousInstallPath !== newInstallPath);
    if (shouldCleanConfig && fs.existsSync(openClawConfigDir)) {
      // 清理旧配置：首次部署或路径变化时
      try {
        fs.rmSync(openClawConfigDir, { recursive: true, force: true });
        deps.addLog(`已清理旧配置目录: ${openClawConfigDir}`, 'info');
      } catch {
        // 忽略清理失败，不阻塞部署
      }
    }

    // 检查内置源码
    if (!hasBundledSource()) {
      deps.addLog('错误: 未找到内置源码', 'error');
      return { success: false, error: '当前版本未包含 OpenClaw 源码，请下载完整版' };
    }

    // 安装源码
    const installResult = await installFromBundledSource();
    if (!installResult.success) {
      deps.addLog(`源码安装失败: ${installResult.error}`, 'error');
      return { success: false, error: installResult.error };
    }

    const projectPackageManager = detectProjectPackageManager(installPath);

    // 确保 pnpm 可用
    if (projectPackageManager === 'pnpm' && !pnpmAvailable) {
      const pnpmInstall = ensureDependencyInstalled('pnpm', deps.addLog);
      if (!pnpmInstall.success) {
        return { success: false, error: pnpmInstall.manual || '当前 OpenClaw 源码要求使用 pnpm，请先安装 pnpm 后重试' };
      }
      pnpmAvailable = true;
    }

    // 应用 Windows 原生模块补丁（跳过需要编译的原生模块）
    const nativePatch = applyWindowsNativePatch(installPath);

    try {
      // 安装依赖
      const installAttempts = getPackageInstallAttempts(installPath, getCommandLookupEnv(), getGithubDirectConnected());
      const installPlan = detectProjectPackageManager(installPath);
      deps.addLog(`安装依赖 (${installPlan})...`);

      let installResult: Awaited<ReturnType<typeof streamCommand>> = { success: false };
      for (let index = 0; index < installAttempts.length; index++) {
        const attempt = installAttempts[index];
        if (index > 0) {
          deps.addLog(`默认依赖源失败，尝试 ${attempt.label}...`, 'warning');
        }
        installResult = await streamCommand(attempt.command, installPath, {
          timeout: TIMEOUTS.packageInstall,
          ignoreError: true,
          env: attempt.env,
        });
        if (installResult.success) {
          break;
        }
      }

      if (!installResult.success) {
        deps.addLog(`依赖安装失败: ${installResult.stderr}`, 'error');
        return { success: false, error: installResult.stderr || '依赖安装失败' };
      }
      deps.addLog('依赖安装成功 ✓', 'success');

      config.installPath = installPath;
      saveConfig(config);
      deps.addLog('🎉 部署完成！', 'success');

      return { success: true, config, status: deps.getGatewayRuntimeStatus(config) };
    } catch (error) {
      deps.addLog(`❌ 依赖安装失败: ${(error as Error).message}`, 'error');
      deps.logError(error as Error, 'install');
      return { success: false, error: deps.getUserFriendlyMessage(error) };
    } finally {
      if (nativePatch.changed) {
        nativePatch.restore();
      }
    }
  } catch (error) {
    deps.addLog(`❌ 部署过程发生错误: ${(error as Error).message}`, 'error');
    deps.logError(error as Error, 'deploy-task');
    return { success: false, error: deps.getUserFriendlyMessage(error) };
  }
}
