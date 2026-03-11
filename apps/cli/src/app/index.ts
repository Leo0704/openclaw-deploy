#!/usr/bin/env node

/**
 * 龙虾助手
 * 双击运行 → 自动打开浏览器 → 在网页上操作
 */

// Windows 全局错误处理：防止控制台闪退
if (process.platform === 'win32') {
  const waitAndExit = (code: number) => {
    console.error('\n按回车键退出...');
    process.stdin.setRawMode?.(false);
    process.stdin.resume();
    process.stdin.once('data', () => process.exit(code));
    // 如果 30 秒没有输入也退出
    setTimeout(() => process.exit(code), 30000);
  };
  process.on('uncaughtException', (err) => {
    console.error('\n[致命错误]', err.message || err);
    waitAndExit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('\n[未处理异常]', reason instanceof Error ? reason.message : reason);
    waitAndExit(1);
  });
}

const fs = require('fs') as typeof import('fs');

const {
  getUserFriendlyMessage,
  logError,
} = require('../shared/errors/error-utils') as typeof import('../shared/errors/error-utils');

const {
  fetchWithTimeout,
  fetchWithRetry,
  downloadFile,
  probeNetworkSources,
} = require('../shared/network/network-utils') as typeof import('../shared/network/network-utils');

const {
  setSortedMirrors,
  sortMirrorsByProbe,
  getNpmRegistry,
} = require('../packaging/release/release-sources') as typeof import('../packaging/release/release-sources');

const {
  setGithubDirectConnected,
} = require('../platform/install') as typeof import('../platform/install');

const {
  checkPortAvailability,
  findAvailablePort,
} = require('../core/diagnostics/system-check') as typeof import('../core/diagnostics/system-check');

const {
  isOpenClawProjectDir,
} = require('../runtime/openclaw/openclaw-project') as typeof import('../runtime/openclaw/openclaw-project');

const {
  loadConfig,
  loadUpdateState,
  saveUpdateState,
} = require('../core/config/lobster-config') as typeof import('../core/config/lobster-config');

const {
  handleConfigAsync,
  handleTestConnection,
} = require('../core/config/config-service') as typeof import('../core/config/config-service');

const {
  handleUninstallOpenClaw,
  handleUpdateOpenClaw,
} = require('../core/deploy/deployment-service') as typeof import('../core/deploy/deployment-service');

const {
  performDeployTask: runDeployTask,
} = require('../core/deploy/deploy-task-service') as typeof import('../core/deploy/deploy-task-service');

const {
  createApiHandlers,
} = require('../core/api/api-service') as typeof import('../core/api/api-service');

const {
  createServer,
} = require('../core/server/server') as typeof import('../core/server/server');

const {
  bootstrapApp,
} = require('../core/bootstrap/bootstrap-service') as typeof import('../core/bootstrap/bootstrap-service');

const {
  getHTML: renderHTMLTemplate,
} = require('../core/web-ui/web-ui') as typeof import('../core/web-ui/web-ui');

const {
  checkSelfUpdate,
  ensureManagedSelfInstall,
  checkForUpdates,
  performSelfUpdate,
  shouldSkipScheduledCheck,
} = require('../core/update/self-update-service') as typeof import('../core/update/self-update-service');

const {
  handleStart,
  stopGatewayProcess,
} = require('../runtime/gateway/gateway-service') as typeof import('../runtime/gateway/gateway-service');

const {
  openBrowser,
} = require('../platform/browser') as typeof import('../platform/browser');

const {
  getGithubMirrors,
  getMirrorReleaseApi,
  buildMirrorDownloadUrl,
} = require('../packaging/release/release-sources') as typeof import('../packaging/release/release-sources');

const {
  activateLicense,
  getPurchaseUrl,
  verifyLicenseStatus,
} = require('../core/license/license-service') as typeof import('../core/license/license-service');

const {
  PROVIDERS,
} = require('../core/providers/provider-catalog') as typeof import('../core/providers/provider-catalog');

const {
  handleSaveFeishuChannel,
  handleSaveTelegramChannel,
  handleSkillInstall,
  handleSkillInstallOptions,
  handleSkillUninstall,
} = require('../runtime/channels/channels-skills-service') as typeof import('../runtime/channels/channels-skills-service');

const {
  getInstalledOpenClawSkillsFromStatus,
  getNotificationChannelsStatus,
  resolveGatewayToken,
} = require('../runtime/openclaw/openclaw-runtime') as typeof import('../runtime/openclaw/openclaw-runtime');

const {
  appendBufferedLog,
  appendLog,
  clearLogs,
  completeDeployTask,
  failDeployTask,
  getDeployTaskLogs,
  getDeployTaskSnapshot,
  getDeployTaskState,
  getGatewayProcess,
  getGatewayRuntimeStatus: getGatewayRuntimeStatusFromState,
  getGatewayRuntimeStatusAsync: getGatewayRuntimeStatusAsyncFromState,
  getGatewayStatus,
  getLogs,
  setGatewayProcess,
  setGatewayStatus,
  startDeployTask,
} = require('../core/state/app-state') as typeof import('../core/state/app-state');

const VERSION = '1.0.51';
const DEFAULT_WEB_PORT = 18790;
const DEFAULT_GATEWAY_PORT = 18789;
const IS_PACKAGED_RUNTIME = !!(process as NodeJS.Process & { pkg?: unknown }).pkg;

// 热门技能列表（从 ClawHub 获取）
const CLAWHUB_MARKET_URL = 'https://clawhub.ai';

// ============================================
// 网络探测（启动时自动执行）
// ============================================

// 保存网络探测结果，供后续使用
let networkProbeResult: { githubDirectConnected: boolean } | null = null;

async function probeNetworkAndSetMirrors(): Promise<void> {
  if (!IS_PACKAGED_RUNTIME) return;

  console.log('[网络] 探测网络连接状态...');

  try {
    const result = await probeNetworkSources(5000);
    networkProbeResult = { githubDirectConnected: result.githubDirectConnected };

    // 设置全局网络状态（供依赖安装时使用）
    setGithubDirectConnected(result.githubDirectConnected);

    // 根据探测结果排序 GitHub 镜像源
    const sortedMirrors = sortMirrorsByProbe(result);
    setSortedMirrors(sortedMirrors);

    // 打印探测结果
    const npmRegistry = getNpmRegistry({ githubDirectConnected: result.githubDirectConnected });
    console.log(`[网络] GitHub 直连: ${result.githubDirectConnected ? '可用' : '不可用'}`);
    console.log(`[网络] npm registry: ${npmRegistry.label}`);

    if (result.bestSource) {
      console.log(`[网络] 最优源: ${result.bestSource.name} (${result.bestSource.latency}ms)`);
    }
  } catch (error) {
    console.log('[网络] 探测失败，使用默认配置');
    networkProbeResult = { githubDirectConnected: false };
    setGithubDirectConnected(false);
  }
}

// 启动时执行网络探测
void probeNetworkAndSetMirrors();

async function getGatewayHealthStatus(config: Record<string, unknown>): Promise<boolean> {
  const gatewayPort = Number(config.gatewayPort || DEFAULT_GATEWAY_PORT);
  const result = await fetchWithTimeout(`http://127.0.0.1:${gatewayPort}/health`, { method: 'GET' }, 2000);
  return !!result.success;
}

function getGatewayRuntimeStatus(config: Record<string, unknown>) {
  return getGatewayRuntimeStatusFromState(config, {
    defaultGatewayPort: DEFAULT_GATEWAY_PORT,
    resolveGatewayToken,
    isOpenClawProjectDir,
  });
}

async function getGatewayRuntimeStatusAsync(config: Record<string, unknown>): Promise<ReturnType<typeof getGatewayRuntimeStatus>> {
  return getGatewayRuntimeStatusAsyncFromState(config, {
    getGatewayRuntimeStatus,
    getGatewayHealthStatus,
  });
}

// ============================================
// HTML 生成
// ============================================

function getHTML(config: Record<string, unknown>, status: ReturnType<typeof getGatewayRuntimeStatus>) {
  return renderHTMLTemplate(config, status, {
    version: VERSION,
    providers: PROVIDERS,
    defaultWebPort: DEFAULT_WEB_PORT,
    defaultGatewayPort: DEFAULT_GATEWAY_PORT,
    clawhubMarketUrl: CLAWHUB_MARKET_URL,
    purchaseUrl: getPurchaseUrl(config),
  });
}

// ============================================
// API 处理
// ============================================

async function performDeployTask(data: Record<string, unknown>, baseConfig: Record<string, unknown>): Promise<Record<string, unknown>> {
  const addLog = (msg: string, level: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    appendBufferedLog(getDeployTaskLogs(), level, msg);
    console.log(`[部署] ${msg}`);
  };
  return runDeployTask(data, baseConfig, {
    addLog,
    defaultGatewayPort: DEFAULT_GATEWAY_PORT,
    getGatewayRuntimeStatus,
    getUserFriendlyMessage: (error: unknown) => getUserFriendlyMessage(error as any),
    logError,
  });
}

async function handleDeployStart(data: Record<string, unknown>, baseConfig: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (getDeployTaskState() === 'running') {
    return { success: false, error: '已有部署任务正在进行，请等待当前任务结束' };
  }

  // 如果 gateway 正在运行，先停止它
  const currentStatus = getGatewayStatus();
  if (currentStatus === 'running' || currentStatus === 'starting') {
    console.log('[部署] 检测到运行中的 Gateway，正在停止...');
    await stopGatewayProcess(baseConfig, getGatewayLifecycleDeps(), 10000);
    setGatewayStatus('stopped');
    setGatewayProcess(null);
  }

  startDeployTask();

  void performDeployTask(data, baseConfig).then((result) => {
    completeDeployTask(result, baseConfig);
  }).catch((error: Error) => {
    failDeployTask(error);
  });

  return getDeployTaskSnapshot();
}

function getGatewayLifecycleDeps() {
  return {
    appendLog,
    checkExternalGatewayHealth: getGatewayHealthStatus,
    getGatewayProcess,
    setGatewayProcess,
    getGatewayStatus,
    setGatewayStatus,
    getGatewayRuntimeStatusAsync,
    getUserFriendlyMessage: (error: unknown) => getUserFriendlyMessage(error as any),
    logError,
    providers: PROVIDERS,
    defaultGatewayPort: DEFAULT_GATEWAY_PORT,
  };
}

const apiHandlers = createApiHandlers({
  activateLicense,
  handleConfigAsync,
  handleDeployStart,
  getDeployTaskSnapshot,
  handleTestConnection,
  handleStart,
  stopGatewayProcess,
  getGatewayRuntimeStatusAsync,
  verifyLicenseStatus,
  getInstalledOpenClawSkillsFromStatus,
  handleSkillInstallOptions,
  handleSkillInstall,
  handleSkillUninstall,
  getNotificationChannelsStatus,
  handleSaveTelegramChannel,
  handleSaveFeishuChannel,
  handleUninstallOpenClaw,
  handleUpdateOpenClaw,
  getGatewayRuntimeStatus,
  getGatewayLifecycleDeps,
  getLogs,
  clearLogs,
  logError,
  getUserFriendlyMessage: (error: unknown) => getUserFriendlyMessage(error as any),
  providers: PROVIDERS,
  clawhubMarketUrl: CLAWHUB_MARKET_URL,
  defaultGatewayPort: DEFAULT_GATEWAY_PORT,
  // 更新相关
  getUpdateState: loadUpdateState,
  checkForUpdates: (deps: any) => checkForUpdates({
    version: VERSION,
    isPackagedRuntime: IS_PACKAGED_RUNTIME,
    githubMirrors: getGithubMirrors(),
    getMirrorReleaseApi,
    buildMirrorDownloadUrl,
    fetchWithRetry: fetchWithRetry as any,
    downloadFile: downloadFile as any,
    logError: logError as any,
    getUserFriendlyMessage: (error: unknown) => getUserFriendlyMessage(error as any),
    ...deps,
  }),
  performSelfUpdate: (deps: any) => {
    const updateState = loadUpdateState();
    return performSelfUpdate({
      version: VERSION,
      isPackagedRuntime: IS_PACKAGED_RUNTIME,
      githubMirrors: getGithubMirrors(),
      getMirrorReleaseApi,
      buildMirrorDownloadUrl,
      fetchWithRetry: fetchWithRetry as any,
      downloadFile: downloadFile as any,
      logError: logError as any,
      getUserFriendlyMessage: (error: unknown) => getUserFriendlyMessage(error as any),
      updateState,
    });
  },
});

// ============================================
// 更新检查（异步，不阻塞启动）
// ============================================

async function maybeCheckForUpdates(options: { force: boolean }) {
  if (!IS_PACKAGED_RUNTIME) return;

  const updateState = loadUpdateState();

  // 非强制检查时，判断是否需要跳过
  if (!options.force && updateState.lastCheckedAt) {
    const lastCheck = new Date(updateState.lastCheckedAt).getTime();
    if (Date.now() - lastCheck < 24 * 60 * 60 * 1000) {
      console.log('[更新] 24小时内已检查过，跳过');
      return;
    }
  }

  try {
    const result = await checkForUpdates({
      version: VERSION,
      isPackagedRuntime: IS_PACKAGED_RUNTIME,
      githubMirrors: getGithubMirrors(),
      getMirrorReleaseApi,
      buildMirrorDownloadUrl,
      fetchWithRetry: fetchWithRetry as any,
      downloadFile: downloadFile as any,
      logError: logError as any,
      getUserFriendlyMessage: (error: unknown) => getUserFriendlyMessage(error as any),
    });
    saveUpdateState(result);
    if (result.mode !== 'up_to_date') {
      console.log(`[更新] 发现新版本 v${result.latestVersion} (${result.mode})`);
    }
  } catch (error) {
    console.log('[更新] 检查失败:', (error as Error).message);
  }
}

// ============================================
// 启动应用
// ============================================

void bootstrapApp({
  loadConfig,
  loadUpdateState,
  ensureManagedSelfInstall,
  maybeCheckForUpdates,
  createServer,
  apiHandlers,
  getGatewayRuntimeStatusAsync,
  getHTML,
  getUserFriendlyMessage: (error: unknown) => getUserFriendlyMessage(error as any),
  logError,
  checkPortAvailability,
  findAvailablePort,
  openBrowser,
  version: VERSION,
  isPackagedRuntime: IS_PACKAGED_RUNTIME,
  githubMirrors: getGithubMirrors(),
  getMirrorReleaseApi,
  buildMirrorDownloadUrl,
  defaultWebPort: DEFAULT_WEB_PORT,
}).catch((err: Error) => {
  console.error('\n[启动失败]', err.message || err);
  if (process.platform === 'win32') {
    console.error('按回车键退出...');
    process.stdin.setRawMode?.(false);
    process.stdin.resume();
    process.stdin.once('data', () => process.exit(1));
    setTimeout(() => process.exit(1), 30000);
  } else {
    process.exit(1);
  }
});
