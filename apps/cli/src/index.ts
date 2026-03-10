#!/usr/bin/env node

/**
 * 龙虾助手
 * 双击运行 → 自动打开浏览器 → 在网页上操作
 */

const { spawn } = require('child_process') as typeof import('child_process');
const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

// 导入错误处理和系统检查工具
const {
  AppError,
  ErrorType,
  ErrorSeverity,
  Errors,
  createError,
  fromNativeError,
  getUserFriendlyMessage,
  logError,
  isRecoverable,
} = require('./error-utils') as typeof import('./error-utils');

const {
  fetchWithTimeout,
  checkNetworkConnectivity,
  checkGitHubAccess,
  downloadFile,
} = require('./network-utils') as typeof import('./network-utils');

const {
  checkDiskSpace,
  checkPortAvailability,
  findAvailablePort,
  checkNodeVersion,
  checkDependencies,
  performHealthChecks,
  OPENCLAW_MIN_NODE_VERSION,
  getCommandLookupEnv,
} = require('./system-check') as typeof import('./system-check');

const {
  readJsonFile,
  detectProjectPackageManager,
  isOpenClawProjectDir,
  getInstallCommand,
  getBuildCommand,
  getOpenClawStartCommand,
  getOpenClawConfigPath,
  getManagedOpenClawConfigPath,
  getManagedOpenClawStateDir,
  getManagedOpenClawSkillsDir,
  readManagedOpenClawConfig,
  readOpenClawRuntimeConfig,
  writeManagedOpenClawConfig,
  mergeOpenClawConfigSections,
  resolveOpenClawWorkspaceDir,
} = require('./openclaw-project') as typeof import('./openclaw-project');

const {
  clearOpenClawDeploymentConfig,
  loadConfig,
  removePathIfExists,
  saveConfig,
} = require('./lobster-config') as typeof import('./lobster-config');

const {
  handleConfigAsync,
  handleTestConnection,
} = require('./config-service') as typeof import('./config-service');

const {
  applyTemporaryWindowsTlonPatch,
  checkOpenClawRuntimeReadiness,
  ensureDependencyInstalled,
  handleUninstallOpenClaw,
  handleUpdateOpenClaw,
} = require('./deployment-service') as typeof import('./deployment-service');

const {
  performDeployTask: runDeployTask,
} = require('./deploy-task-service') as typeof import('./deploy-task-service');

const {
  createApiHandlers,
} = require('./api-service') as typeof import('./api-service');

const {
  createServer,
} = require('./server') as typeof import('./server');

const {
  bootstrapApp,
} = require('./bootstrap-service') as typeof import('./bootstrap-service');

const {
  getHTML: renderHTMLTemplate,
} = require('./web-ui') as typeof import('./web-ui');

const {
  checkSelfUpdate,
  ensureManagedSelfInstall,
} = require('./self-update-service') as typeof import('./self-update-service');

const {
  handleStart,
  stopGatewayProcess,
} = require('./gateway-service') as typeof import('./gateway-service');

const {
  runCommand,
  runCommandArgs,
  runCommandStreaming,
  runCommandSimple,
  checkCommand,
  parseCommandForSpawn,
  resolveSpawnExecutable,
} = require('./process-utils') as typeof import('./process-utils');

const {
  openBrowser,
} = require('./browser-utils') as typeof import('./browser-utils');

const {
  GITHUB_MIRRORS,
  buildMirrorDownloadUrl,
  getMirrorReleaseApi,
  getMirrorRepo,
} = require('./release-sources') as typeof import('./release-sources');

const {
  activateLicense,
  getPurchaseUrl,
  verifyLicenseStatus,
} = require('./license-service') as typeof import('./license-service');

const {
  ANTHROPIC_API_FORMAT,
  buildCustomProviderConfig,
  buildEndpointIdFromUrl,
  buildEndpointUrl,
  CUSTOM_PROVIDER_DEFAULT_CONTEXT_WINDOW,
  CUSTOM_PROVIDER_DEFAULT_MAX_TOKENS,
  getAnthropicBaseUrl,
  isAzureUrl,
  normalizeApiFormat,
  normalizeCustomCompatibilityChoice,
  normalizeEndpointId,
  resolveApiFormatFromCompatibility,
  resolveCustomBaseUrlForConfig,
} = require('./provider-utils') as typeof import('./provider-utils');

const {
  PROVIDERS,
} = require('./provider-catalog') as typeof import('./provider-catalog');

const {
  handleSaveFeishuChannel,
  handleSaveTelegramChannel,
  handleSkillInstall,
  handleSkillInstallOptions,
  handleSkillUninstall,
} = require('./channels-skills-service') as typeof import('./channels-skills-service');

const {
  getInstalledOpenClawSkillsFromStatus,
  getNotificationChannelsStatus,
  getManagedOpenClawEnv,
  resolveGatewayToken,
} = require('./openclaw-runtime') as typeof import('./openclaw-runtime');

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
} = require('./app-state') as typeof import('./app-state');

type InstalledSkillEntry = import('./openclaw-runtime').InstalledSkillEntry;
type OpenClawSkillStatusReport = import('./openclaw-runtime').OpenClawSkillStatusReport;
type SkillInstallOptionSummary = import('./openclaw-runtime').SkillInstallOptionSummary;
type NotificationChannelStatus = import('./openclaw-runtime').NotificationChannelStatus;
type GatewayTokenResolution = import('./openclaw-runtime').GatewayTokenResolution;
type LogEntry = import('./app-state').LogEntry;

const VERSION = '1.0.39';
const DEFAULT_WEB_PORT = 18790;
const DEFAULT_GATEWAY_PORT = 18789;
const IS_PACKAGED_RUNTIME = !!(process as NodeJS.Process & { pkg?: unknown }).pkg;

// 热门技能列表（从 ClawHub 获取）
const CLAWHUB_MARKET_URL = 'https://clawhub.ai';

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
    getMirrorRepo,
    githubMirrors: GITHUB_MIRRORS,
    getGatewayRuntimeStatus,
    getUserFriendlyMessage: (error: unknown) => getUserFriendlyMessage(error as any),
    logError,
  });
}

function handleDeployStart(data: Record<string, unknown>, baseConfig: Record<string, unknown>): Record<string, unknown> {
  if (getDeployTaskState() === 'running') {
    return { success: false, error: '已有部署任务正在进行，请等待当前任务结束' };
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
});

// ============================================
// 技能安装处理
// ============================================

void bootstrapApp({
  loadConfig,
  ensureManagedSelfInstall,
  checkSelfUpdate,
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
  githubMirrors: GITHUB_MIRRORS,
  getMirrorReleaseApi,
  buildMirrorDownloadUrl,
  defaultWebPort: DEFAULT_WEB_PORT,
}).catch(console.error);
