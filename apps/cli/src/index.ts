#!/usr/bin/env node

/**
 * 龙虾助手
 * 双击运行 → 自动打开浏览器 → 在网页上操作
 */

const { execSync, execFileSync, spawn } = require('child_process') as typeof import('child_process');
const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const os = require('os') as typeof import('os');
const http = require('http') as typeof import('http');
const nodeCrypto = require('crypto') as typeof import('crypto');
const { URL: NodeURL } = require('url') as typeof import('url');

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
  fetchWithRetry,
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
} = require('./system-check') as typeof import('./system-check');

const VERSION = '1.0.19';
const DEFAULT_WEB_PORT = 18790;
const DEFAULT_GATEWAY_PORT = 18789;
const CUSTOM_PROVIDER_DEFAULT_CONTEXT_WINDOW = 16000;
const CUSTOM_PROVIDER_DEFAULT_MAX_TOKENS = 4096;
const SOURCE_REPO_PATH = 'openclaw/openclaw';
const RELEASE_REPO_PATH = 'Leo0704/lobster-releases';
const DEFAULT_LICENSE_SERVER_URL =
  process.env.LOBSTER_LICENSE_SERVER_URL ||
  'https://license-api-lobster-license-qaqgawotfd.cn-hangzhou.fcapp.run';
const DEFAULT_PURCHASE_URL =
  process.env.LOBSTER_PURCHASE_URL ||
  'https://m.tb.cn/h.iW33Qi7?tk=MPQHUv32tQo%20CZ193';
const PRODUCT_ID = 'lobster-assistant-desktop';
const IS_PACKAGED_RUNTIME = !!(process as NodeJS.Process & { pkg?: unknown }).pkg;
const ANTHROPIC_API_FORMAT = 'anthropic-messages';

// GitHub 镜像源（国内加速）
const GITHUB_MIRRORS = [
  { name: 'GitHub 直连', url: 'https://github.com', api: 'https://api.github.com' },
  { name: 'GitMirror', url: 'https://hub.gitmirror.com/https://github.com', api: 'https://hub.gitmirror.com/https://api.github.com' },
  { name: 'GHProxy', url: 'https://mirror.ghproxy.com/https://github.com', api: 'https://mirror.ghproxy.com/https://api.github.com' },
];

// 获取镜像仓库 URL
function getMirrorRepo(mirrorIndex: number = 0): string {
  const mirror = GITHUB_MIRRORS[mirrorIndex] || GITHUB_MIRRORS[0];
  return `${mirror.url}/${SOURCE_REPO_PATH}.git`;
}

// 获取镜像 Release API URL
function getMirrorReleaseApi(mirrorIndex: number = 0): string {
  const mirror = GITHUB_MIRRORS[mirrorIndex] || GITHUB_MIRRORS[0];
  return `${mirror.api}/repos/${RELEASE_REPO_PATH}/releases/latest`;
}

function buildMirrorDownloadUrl(mirrorIndex: number, originalUrl: string): string {
  if (mirrorIndex === 0) {
    return originalUrl;
  }

  const mirror = GITHUB_MIRRORS[mirrorIndex] || GITHUB_MIRRORS[0];
  const parsed = new NodeURL(originalUrl);

  if (parsed.origin !== 'https://github.com') {
    return originalUrl;
  }

  return `${mirror.url}${parsed.pathname}${parsed.search}`;
}

function getLicenseServerUrl(config: Record<string, unknown>): string {
  const configuredUrl = (config.licenseServerUrl || '').toString().trim();
  const baseUrl = configuredUrl || DEFAULT_LICENSE_SERVER_URL;
  return baseUrl.replace(/\/+$/, '');
}

function getPurchaseUrl(config: Record<string, unknown>): string {
  const configuredUrl = String(config.purchaseUrl || '').trim();
  const baseUrl = configuredUrl || DEFAULT_PURCHASE_URL;
  return baseUrl.replace(/\/+$/, '');
}

function normalizeActivationCode(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function generateDeviceFingerprint(): string {
  const interfaces = os.networkInterfaces();
  const macAddresses = Object.values(interfaces)
    .flatMap((items) => items || [])
    .filter((item) => !item.internal && item.mac && item.mac !== '00:00:00:00:00:00')
    .map((item) => item.mac)
    .sort()
    .join('|');

  const fingerprintSource = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.machine?.() || '',
    macAddresses,
  ].join('::');

  return nodeCrypto.createHash('sha256').update(fingerprintSource).digest('hex');
}

async function activateLicense(code: string, config: Record<string, unknown>): Promise<Record<string, unknown>> {
  const normalizedCode = normalizeActivationCode(code);
  const compactCode = normalizedCode.replace(/[^A-Z0-9]/g, '');

  if (!compactCode || compactCode.length < 16) {
    return {
      success: false,
      error: getUserFriendlyMessage(Errors.validation('激活码格式不正确，请检查后重试', 'code')),
    };
  }

  const licenseServerUrl = getLicenseServerUrl(config);
  const deviceFingerprint = generateDeviceFingerprint();
  const deviceName = os.hostname();

  const result = await fetchWithRetry<{
    success?: boolean;
    message?: string;
    license?: {
      activationCode?: string;
      activatedAt?: string;
    };
  }>(
    `${licenseServerUrl}/activate`,
    {
      method: 'POST',
      body: {
        code: normalizedCode,
        deviceFingerprint,
        deviceName,
        productId: PRODUCT_ID,
      },
      headers: {
        'User-Agent': 'Lobster-Assistant',
      },
    },
    {
      timeout: 15000,
      maxRetries: 2,
    }
  );

  if (!result.success) {
    const error = result.error || Errors.activationFailed('激活服务不可用，请稍后重试');
    logError(error, 'license-activate');
    return { success: false, error: getUserFriendlyMessage(error) };
  }

  if (!result.data?.success) {
    const error = Errors.activationFailed(result.data?.message || '激活失败');
    return { success: false, error: getUserFriendlyMessage(error) };
  }

  config.activated = true;
  config.activationCode = result.data.license?.activationCode || normalizedCode;
  config.activatedAt = result.data.license?.activatedAt || new Date().toISOString();
  config.deviceName = deviceName;
  config.deviceFingerprint = deviceFingerprint;
  config.licenseServerUrl = licenseServerUrl;
  saveConfig(config);

  return { success: true, config };
}

async function verifyLicenseStatus(config: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!config.activated || !config.activationCode) {
    return {
      success: true,
      license: {
        activated: false,
        activationCode: null,
        deviceName: null,
        activatedAt: null,
        valid: false,
      },
    };
  }

  const deviceFingerprint = (config.deviceFingerprint as string) || generateDeviceFingerprint();
  const licenseServerUrl = getLicenseServerUrl(config);
  const code = normalizeActivationCode(config.activationCode);

  const result = await fetchWithRetry<{ valid?: boolean; message?: string }>(
    `${licenseServerUrl}/verify`,
    {
      method: 'POST',
      body: {
        code,
        deviceFingerprint,
        productId: PRODUCT_ID,
      },
      headers: {
        'User-Agent': 'Lobster-Assistant',
      },
    },
    {
      timeout: 10000,
      maxRetries: 1,
    }
  );

  const valid = !!result.success && !!result.data?.valid;
  if (!valid && result.error) {
    logError(result.error, 'license-verify');
  }

  if (!valid && result.success) {
    config.activated = false;
    saveConfig(config);
  }

  return {
    success: true,
    license: {
      activated: !!config.activated,
      activationCode: config.activationCode || null,
      deviceName: config.deviceName || null,
      activatedAt: config.activatedAt || null,
      valid,
      message: result.data?.message || (valid ? '授权有效' : '授权无效'),
    },
  };
}

// 热门技能列表（从 ClawHub 获取）
const CLAWHUB_MARKET_URL = 'https://clawhub.ai';

// API 提供商配置（支持直连和中转）
const PROVIDERS = {
  // 直连服务
  anthropic: {
    name: 'Anthropic (Claude 直连)',
    icon: '🟠',
    type: 'direct',
    apiFormat: ANTHROPIC_API_FORMAT,
    envKey: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4 (推荐)', recommended: true, contextWindow: 200000, maxTokens: 16000 },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4 (最强)', contextWindow: 200000, maxTokens: 16000 },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextWindow: 200000, maxTokens: 8192 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (快速)', contextWindow: 200000, maxTokens: 8192 },
    ]
  },
  openai: {
    name: 'OpenAI (GPT 直连)',
    icon: '🟢',
    type: 'direct',
    apiFormat: 'openai-completions',
    envKey: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o (推荐)', recommended: true, contextWindow: 128000, maxTokens: 4096 },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', contextWindow: 128000, maxTokens: 4096 },
      { id: 'gpt-4', name: 'GPT-4', contextWindow: 8192, maxTokens: 4096 },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo (快速)', contextWindow: 16384, maxTokens: 4096 },
    ]
  },
  google: {
    name: 'Google (Gemini 直连)',
    icon: '🔵',
    type: 'direct',
    apiFormat: 'google',
    envKey: 'GOOGLE_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (推荐)', recommended: true, contextWindow: 1000000, maxTokens: 8192 },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', contextWindow: 2000000, maxTokens: 8192 },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (快速)', contextWindow: 1000000, maxTokens: 8192 },
    ]
  },
  openrouter: {
    name: 'OpenRouter (多模型聚合)',
    icon: '🟣',
    type: 'proxy',
    apiFormat: 'openai-completions',
    envKey: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4 (推荐)', recommended: true, contextWindow: 200000, maxTokens: 16000 },
      { id: 'anthropic/claude-opus-4', name: 'Claude Opus 4', contextWindow: 200000, maxTokens: 16000 },
      { id: 'openai/gpt-4o', name: 'GPT-4o', contextWindow: 128000, maxTokens: 4096 },
      { id: 'google/gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', contextWindow: 1000000, maxTokens: 8192 },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat (便宜)', contextWindow: 64000, maxTokens: 4096 },
    ]
  },

  // 国内中转服务
  aliyun_bailian: {
    name: '阿里云百炼 (国内)',
    icon: '🟡',
    type: 'proxy',
    apiFormat: 'openai-completions',
    envKey: 'ALIYUN_API_KEY',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    description: '阿里云百炼平台，支持通义千问系列',
    models: [
      { id: 'qwen-plus', name: '通义千问 Plus (推荐)', recommended: true, contextWindow: 128000, maxTokens: 6000 },
      { id: 'qwen-turbo', name: '通义千问 Turbo (快速)', contextWindow: 8000, maxTokens: 2000 },
      { id: 'qwen-max', name: '通义千问 Max (最强)', contextWindow: 32000, maxTokens: 8000 },
      { id: 'qwen-long', name: '通义千问 Long (长文本)', contextWindow: 1000000, maxTokens: 10000 },
    ]
  },
  aliyun_coding: {
    name: '阿里云 Coding Plan',
    icon: '💻',
    type: 'proxy',
    apiFormat: 'openai-completions',
    envKey: 'ALIYUN_CODING_API_KEY',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
    description: '阿里云开发者 Coding Plan，需开通百炼服务',
    models: [
      { id: 'qwen3-235b-a22b-instruct', name: 'Qwen3 235B (推荐)', recommended: true, contextWindow: 128000, maxTokens: 16384 },
      { id: 'qwen3-32b-instruct', name: 'Qwen3 32B', contextWindow: 32000, maxTokens: 8192 },
      { id: 'qwen3.5-plus', name: 'Qwen3.5 Plus', contextWindow: 128000, maxTokens: 8192 },
      { id: 'qwen3.5-turbo', name: 'Qwen3.5 Turbo', contextWindow: 32000, maxTokens: 8192 },
      { id: 'deepseek-r1', name: 'DeepSeek R1', contextWindow: 64000, maxTokens: 8192 },
      { id: 'deepseek-v3', name: 'DeepSeek V3', contextWindow: 64000, maxTokens: 8192 },
    ]
  },
  deepseek: {
    name: 'DeepSeek (国内)',
    icon: '🔷',
    type: 'proxy',
    apiFormat: 'openai-completions',
    envKey: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1',
    description: 'DeepSeek 官方 API，价格便宜',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat (推荐)', recommended: true, contextWindow: 64000, maxTokens: 4096 },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', contextWindow: 64000, maxTokens: 8192 },
      { id: 'deepseek-coder', name: 'DeepSeek Coder', contextWindow: 16000, maxTokens: 4096 },
    ]
  },
  siliconflow: {
    name: '硅基流动 (国内)',
    icon: '🌊',
    type: 'proxy',
    apiFormat: 'openai-completions',
    envKey: 'SILICONFLOW_API_KEY',
    baseUrl: 'https://api.siliconflow.cn/v1',
    description: '硅基流动，多种模型聚合',
    models: [
      { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen2.5 72B (推荐)', recommended: true, contextWindow: 128000, maxTokens: 8192 },
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', contextWindow: 64000, maxTokens: 4096 },
      { id: 'THUDM/glm-4-9b-chat', name: 'GLM-4 9B', contextWindow: 128000, maxTokens: 8192 },
    ]
  },
  moonshot: {
    name: 'Moonshot (Kimi)',
    icon: '🌙',
    type: 'proxy',
    apiFormat: 'openai-completions',
    envKey: 'MOONSHOT_API_KEY',
    baseUrl: 'https://api.moonshot.cn/v1',
    description: '月之暗面 Kimi，擅长长文本',
    models: [
      { id: 'moonshot-v1-8k', name: 'Moonshot V1 8K', contextWindow: 8192, maxTokens: 4096 },
      { id: 'moonshot-v1-32k', name: 'Moonshot V1 32K', contextWindow: 32768, maxTokens: 4096 },
      { id: 'moonshot-v1-128k', name: 'Moonshot V1 128K (推荐)', recommended: true, contextWindow: 131072, maxTokens: 4096 },
    ]
  },
  zhipu: {
    name: '智谱 AI (GLM)',
    icon: '🧠',
    type: 'proxy',
    apiFormat: 'openai-completions',
    envKey: 'ZHIPU_API_KEY',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    description: '智谱清言 GLM 系列',
    models: [
      { id: 'glm-4-plus', name: 'GLM-4 Plus (推荐)', recommended: true, contextWindow: 128000, maxTokens: 4096 },
      { id: 'glm-4-0520', name: 'GLM-4', contextWindow: 128000, maxTokens: 4096 },
      { id: 'glm-4-air', name: 'GLM-4 Air (快速)', contextWindow: 128000, maxTokens: 4096 },
      { id: 'glm-4-flash', name: 'GLM-4 Flash (免费)', contextWindow: 128000, maxTokens: 4096 },
    ]
  },

  // 自定义配置
  custom: {
    name: '自定义 API (高级)',
    icon: '⚙️',
    type: 'custom',
    apiFormat: 'openai-completions',
    envKey: 'CUSTOM_API_KEY',
    baseUrl: '',
    description: '自定义 API 地址和模型配置',
    models: [
      { id: 'custom', name: '自定义模型', contextWindow: 128000, maxTokens: 4096 }
    ]
  }
};

function normalizeApiFormat(value: unknown): string {
  const normalized = String(value || '').trim();
  if (normalized === 'anthropic') {
    return ANTHROPIC_API_FORMAT;
  }
  if (normalized === 'openai' || !normalized) {
    return 'openai-completions';
  }
  return normalized;
}

function normalizeCustomCompatibilityChoice(value: unknown): 'openai' | 'anthropic' | 'unknown' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'anthropic' || normalized === ANTHROPIC_API_FORMAT) {
    return 'anthropic';
  }
  if (normalized === 'unknown') {
    return 'unknown';
  }
  return 'openai';
}

function resolveApiFormatFromCompatibility(value: unknown): string {
  return normalizeCustomCompatibilityChoice(value) === 'anthropic' ? ANTHROPIC_API_FORMAT : 'openai-completions';
}

function isAzureUrl(baseUrl: string): boolean {
  try {
    const url = new NodeURL(baseUrl);
    const host = url.hostname.toLowerCase();
    return host.endsWith('.services.ai.azure.com') || host.endsWith('.openai.azure.com');
  } catch {
    return false;
  }
}

function transformAzureUrl(baseUrl: string, modelId: string): string {
  const normalizedUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  if (normalizedUrl.includes('/openai/deployments/')) {
    return normalizedUrl;
  }
  return `${normalizedUrl}/openai/deployments/${modelId}`;
}

function getAnthropicBaseUrl(baseUrl: string): string {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    return trimmed;
  }
  return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

function buildEndpointUrl(baseUrl: string, endpointPath: string): URL {
  const normalizedBase = String(baseUrl || '').trim().replace(/\/+$/, '');
  const normalizedPath = String(endpointPath || '').trim().replace(/^\/+/, '');
  return new NodeURL(`${normalizedBase}/${normalizedPath}`);
}

function normalizeEndpointId(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildEndpointIdFromUrl(baseUrl: string): string {
  try {
    const url = new NodeURL(baseUrl);
    const host = url.hostname.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const port = url.port ? `-${url.port}` : '';
    const candidate = `custom-${host}${port}`;
    return normalizeEndpointId(candidate) || 'custom';
  } catch {
    return 'custom';
  }
}

function resolveCustomBaseUrlForConfig(baseUrl: string, modelId: string): string {
  const trimmedBaseUrl = String(baseUrl || '').trim();
  const trimmedModelId = String(modelId || '').trim();
  if (!trimmedBaseUrl) {
    return trimmedBaseUrl;
  }
  return isAzureUrl(trimmedBaseUrl) && trimmedModelId ? transformAzureUrl(trimmedBaseUrl, trimmedModelId) : trimmedBaseUrl;
}

function buildCustomProviderConfig(config: Record<string, unknown>, providerBaseUrl: string, modelId: string) {
  const providerId = normalizeEndpointId(config.customEndpointId) || buildEndpointIdFromUrl(providerBaseUrl) || 'custom';
  const modelRef = `${providerId}/${modelId}`;
  const alias = String(config.customModelAlias || '').trim();
  const providerConfig: Record<string, unknown> = {
    baseUrl: providerBaseUrl,
    api: normalizeApiFormat(config.apiFormat || 'openai-completions'),
    apiKey: String(config.apiKey || ''),
    models: [
      {
        id: modelId,
        name: `${modelId} (Custom Provider)`,
        contextWindow: CUSTOM_PROVIDER_DEFAULT_CONTEXT_WINDOW,
        maxTokens: CUSTOM_PROVIDER_DEFAULT_MAX_TOKENS,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        reasoning: false,
      },
    ],
  };

  return {
    providerId,
    modelRef,
    openclawConfig: {
      models: {
        mode: 'merge',
        providers: {
          [providerId]: providerConfig,
        },
      },
      agents: {
        defaults: {
          model: {
            primary: modelRef,
          },
          models: {
            [modelRef]: alias ? { alias } : {},
          },
        },
      },
    } as Record<string, unknown>,
  };
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type InstalledSkillEntry = {
  id: string;
  name: string;
  source: string;
  removable: boolean;
};

type OpenClawSkillStatusReport = {
  skills?: Array<{
    name?: string;
    source?: string;
    bundled?: boolean;
  }>;
};

function getOpenClawConfigPath(): string {
  return path.join(os.homedir(), '.openclaw', 'openclaw.json');
}

function readOpenClawRuntimeConfig(): Record<string, unknown> {
  return readJsonFile(getOpenClawConfigPath()) || {};
}

function resolveOpenClawWorkspaceDir(): string {
  const cfg = readOpenClawRuntimeConfig();
  const agents = cfg.agents as Record<string, unknown> | undefined;
  const defaults = agents?.defaults as Record<string, unknown> | undefined;
  const configured = String(defaults?.workspace || '').trim();
  return configured ? path.resolve(configured) : path.join(os.homedir(), '.openclaw', 'workspace');
}

function mapOpenClawSkillSource(source: string, bundled?: boolean): { source: string; removable: boolean } {
  switch (source) {
    case 'openclaw-workspace':
      return { source: '工作区', removable: true };
    case 'openclaw-managed':
      return { source: 'OpenClaw 已管理', removable: true };
    case 'agents-skills-personal':
      return { source: '个人 .agents', removable: true };
    case 'agents-skills-project':
      return { source: '项目 .agents', removable: true };
    case 'openclaw-extra':
      return { source: '额外目录', removable: false };
    case 'openclaw-bundled':
      return { source: bundled ? 'OpenClaw 内置' : '打包技能', removable: false };
    default:
      return { source: source || '未知', removable: false };
  }
}

function mapSkillStatusReport(report: OpenClawSkillStatusReport | null | undefined): InstalledSkillEntry[] {
  const entries = Array.isArray(report?.skills) ? report.skills : [];
  const merged = new Map<string, InstalledSkillEntry>();
  for (const entry of entries) {
    const id = String(entry?.name || '').trim();
    if (!id) {
      continue;
    }
    const mapped = mapOpenClawSkillSource(String(entry?.source || '').trim(), entry?.bundled === true);
    merged.set(id, {
      id,
      name: id,
      source: mapped.source,
      removable: mapped.removable,
    });
  }
  return Array.from(merged.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function getOpenClawCliCommand(projectPath: string, args: string[]): { file: string; args: string[] } {
  const pm = detectProjectPackageManager(projectPath);
  return pm === 'pnpm'
    ? { file: 'pnpm', args: ['openclaw', ...args] }
    : { file: 'npm', args: ['run', 'openclaw', '--', ...args] };
}

function tryParseJsonObject(raw: string | undefined): Record<string, unknown> | null {
  const text = String(raw || '').trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function listSkillsFromRoot(rootDir: string, source: string, removable: boolean): InstalledSkillEntry[] {
  if (!rootDir || !fs.existsSync(rootDir)) {
    return [];
  }
  try {
    return fs.readdirSync(rootDir).flatMap((entryName: string) => {
      const entryPath = path.join(rootDir, entryName);
      if (!fs.statSync(entryPath).isDirectory()) {
        return [];
      }
      if (!fs.existsSync(path.join(entryPath, 'SKILL.md'))) {
        return [];
      }
      return [{
        id: entryName,
        name: entryName,
        source,
        removable,
      }];
    });
  } catch {
    return [];
  }
}

function getInstalledOpenClawSkills(config: Record<string, unknown>): InstalledSkillEntry[] {
  if (!config.installPath || !isOpenClawProjectDir(config.installPath as string)) {
    return [];
  }

  const workspaceDir = resolveOpenClawWorkspaceDir();
  const runtimeConfig = readOpenClawRuntimeConfig();
  const skills = runtimeConfig.skills as Record<string, unknown> | undefined;
  const load = skills?.load as Record<string, unknown> | undefined;
  const extraDirs = Array.isArray(load?.extraDirs)
    ? load?.extraDirs
      .map((dir) => String(dir || '').trim())
      .filter(Boolean)
    : [];

  const sources: Array<{ dir: string; source: string; removable: boolean }> = [
    { dir: path.join(config.installPath as string, 'skills'), source: 'OpenClaw 内置', removable: false },
    { dir: path.join(os.homedir(), '.openclaw', 'skills'), source: 'OpenClaw 已管理', removable: true },
    { dir: path.join(os.homedir(), '.agents', 'skills'), source: '个人 .agents', removable: true },
    { dir: path.join(workspaceDir, '.agents', 'skills'), source: '项目 .agents', removable: true },
    { dir: path.join(workspaceDir, 'skills'), source: '工作区', removable: true },
    ...extraDirs.map((dir) => ({ dir: path.resolve(dir), source: '额外目录', removable: false })),
  ];

  const merged = new Map<string, InstalledSkillEntry>();
  for (const source of sources) {
    for (const skill of listSkillsFromRoot(source.dir, source.source, source.removable)) {
      merged.set(skill.id, skill);
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.id.localeCompare(b.id));
}

async function getInstalledOpenClawSkillsFromStatus(config: Record<string, unknown>): Promise<InstalledSkillEntry[]> {
  if (!config.installPath || !isOpenClawProjectDir(config.installPath as string)) {
    return [];
  }

  const projectPath = config.installPath as string;
  const gatewayPort = Number(config.gatewayPort || DEFAULT_GATEWAY_PORT);
  const gatewayToken = readGatewayTokenFromHome();

  if (gatewayToken) {
    const gatewayCall = getOpenClawCliCommand(projectPath, [
      'gateway',
      'call',
      'skills.status',
      '--json',
      '--url',
      `ws://127.0.0.1:${gatewayPort}`,
      '--token',
      gatewayToken,
      '--params',
      '{}',
    ]);
    const gatewayResult = runCommandArgs(gatewayCall.file, projectPath, {
      args: gatewayCall.args,
      timeout: 30000,
      ignoreError: true,
      silent: true,
    });
    if (gatewayResult.success) {
      const parsed = tryParseJsonObject(gatewayResult.stdout);
      if (parsed && Array.isArray((parsed as OpenClawSkillStatusReport).skills)) {
        const mapped = mapSkillStatusReport(parsed as OpenClawSkillStatusReport);
        return mapped;
      }
    }
  }

  const listCommand = getOpenClawCliCommand(projectPath, ['skills', 'list', '--json']);
  const listResult = runCommandArgs(listCommand.file, projectPath, {
    args: listCommand.args,
    timeout: 30000,
    ignoreError: true,
    silent: true,
  });
  if (listResult.success) {
    const parsed = tryParseJsonObject(listResult.stdout);
    if (parsed && Array.isArray((parsed as OpenClawSkillStatusReport).skills)) {
      const mapped = mapSkillStatusReport(parsed as OpenClawSkillStatusReport);
      return mapped;
    }
  }

  return getInstalledOpenClawSkills(config);
}

function resolveRemovableSkillPath(config: Record<string, unknown>, skillId: string): { path: string; source: string } | null {
  if (!config.installPath || !isOpenClawProjectDir(config.installPath as string)) {
    return null;
  }

  const workspaceDir = resolveOpenClawWorkspaceDir();
  const candidates = [
    { path: path.join(workspaceDir, 'skills', skillId), source: '工作区' },
    { path: path.join(workspaceDir, '.agents', 'skills', skillId), source: '项目 .agents' },
    { path: path.join(os.homedir(), '.agents', 'skills', skillId), source: '个人 .agents' },
    { path: path.join(os.homedir(), '.openclaw', 'skills', skillId), source: 'OpenClaw 已管理' },
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate.path, 'SKILL.md'))) {
      return candidate;
    }
  }

  return null;
}

function detectProjectPackageManager(projectPath: string): 'pnpm' | 'npm' {
  const packageJsonPath = path.join(projectPath, 'package.json');
  const packageJson = readJsonFile(packageJsonPath);
  const packageManager = String(packageJson?.packageManager || '').split('@')[0].trim();

  if (packageManager === 'pnpm' || fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }

  return 'npm';
}

function isOpenClawProjectDir(projectPath: string): boolean {
  if (!projectPath || !fs.existsSync(projectPath)) {
    return false;
  }

  try {
    const stat = fs.statSync(projectPath);
    if (!stat.isDirectory()) {
      return false;
    }
  } catch {
    return false;
  }

  const packageJson = readJsonFile(path.join(projectPath, 'package.json'));
  const packageName = String(packageJson?.name || '').trim();
  return packageName === 'openclaw';
}

function getInstallCommand(projectPath: string): { pm: 'pnpm' | 'npm'; command: string } {
  const pm = detectProjectPackageManager(projectPath);
  return { pm, command: pm === 'pnpm' ? 'pnpm install' : 'npm install' };
}

function getBuildCommand(projectPath: string): { pm: 'pnpm' | 'npm'; command: string } {
  const pm = detectProjectPackageManager(projectPath);
  return { pm, command: pm === 'pnpm' ? 'pnpm run build' : 'npm run build' };
}

function getOpenClawStartCommand(projectPath: string, port: number): string {
  const pm = detectProjectPackageManager(projectPath);
  return pm === 'pnpm'
    ? `pnpm openclaw gateway run --port ${port} --allow-unconfigured`
    : `npm run openclaw -- gateway run --port ${port} --allow-unconfigured`;
}

function readGatewayTokenFromHome(): string | null {
  const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  const configJson = readJsonFile(configPath);
  const gateway = configJson?.gateway as Record<string, unknown> | undefined;
  const auth = gateway?.auth as Record<string, unknown> | undefined;
  const token = String(auth?.token || '').trim();
  return token || null;
}

function checkOpenClawRuntimeReadiness(projectPath: string): { ready: boolean; error?: string } {
  if (!isOpenClawProjectDir(projectPath)) {
    return { ready: false, error: '当前安装路径不是有效的 OpenClaw 项目，请重新部署' };
  }

  if (!fs.existsSync(path.join(projectPath, 'package.json'))) {
    return { ready: false, error: 'OpenClaw 安装目录缺少 package.json，请重新部署' };
  }

  const packageManager = detectProjectPackageManager(projectPath);
  if (packageManager === 'pnpm' && !checkCommand('pnpm')) {
    return { ready: false, error: '当前 OpenClaw 源码要求使用 pnpm，请先安装 pnpm 后再启动' };
  }

  if (!fs.existsSync(path.join(projectPath, 'node_modules'))) {
    return { ready: false, error: 'OpenClaw 依赖尚未安装，请先执行“部署 OpenClaw”或手动安装依赖' };
  }

  return { ready: true };
}

function getDependencyInstallPlan(name: 'git' | 'pnpm'): { command: string; manual: string } | null {
  if (name === 'pnpm') {
    return {
      command: 'npm install -g pnpm',
      manual: '请先执行 `npm install -g pnpm` 后重试',
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

function ensureDependencyInstalled(
  name: 'git' | 'pnpm',
  addLog: (msg: string, level?: 'info' | 'success' | 'error' | 'warning') => void
): { success: boolean; manual?: string } {
  if (checkCommand(name)) {
    return { success: true };
  }

  const plan = getDependencyInstallPlan(name);
  if (!plan) {
    return { success: false };
  }

  addLog(`未检测到 ${name}，尝试自动安装...`, 'warning');
  if (!plan.command) {
    addLog(`${name} 无法自动安装`, 'error');
    return { success: false, manual: plan.manual };
  }

  const installResult = runCommand(plan.command, process.cwd(), {
    timeout: 900000,
    ignoreError: true,
  });

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

  if (!installResult.success || !checkCommand(name)) {
    addLog(`${name} 自动安装失败`, 'error');
    return { success: false, manual: plan.manual };
  }

  addLog(`${name} 自动安装成功 ✓`, 'success');
  return { success: true };
}

// ============================================
// 配置
// ============================================

function getConfigPath() {
  const dir = path.join(os.homedir(), '.lobster-assistant');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'config.json');
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'));
  } catch {
    return {};
  }
}

function saveConfig(config: Record<string, unknown>) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
}

function clearOpenClawDeploymentConfig(config: Record<string, unknown>) {
  delete config.installPath;
  delete config.provider;
  delete config.model;
  delete config.apiKey;
  delete config.baseUrl;
  delete config.apiFormat;
  delete config.customModelId;
  delete config.customEndpointId;
  delete config.customModelAlias;
  delete config.gatewayPort;
}

function isProtectedRemovalPath(targetPath: string): boolean {
  const normalized = path.resolve(targetPath);
  const parsed = path.parse(normalized);
  const homeDir = path.resolve(os.homedir());
  const cwd = path.resolve(process.cwd());

  return (
    !normalized ||
    normalized === parsed.root ||
    normalized === homeDir ||
    normalized === cwd ||
    normalized === path.dirname(homeDir)
  );
}

function removePathIfExists(targetPath: string, removed: string[]) {
  if (!targetPath) return;
  const normalized = path.resolve(targetPath);
  if (!fs.existsSync(normalized)) return;
  if (isProtectedRemovalPath(normalized)) {
    throw new Error(`拒绝删除高风险路径: ${normalized}`);
  }
  fs.rmSync(normalized, { recursive: true, force: true });
  removed.push(normalized);
}

// ============================================
// 工具函数
// ============================================

interface RunCommandOptions {
  timeout?: number;
  retries?: number;
  ignoreError?: boolean;
  silent?: boolean;
}

interface RunCommandResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  error?: typeof AppError.prototype;
}

interface RunCommandArgsOptions extends RunCommandOptions {
  args?: string[];
}

/**
 * 执行命令（带超时和错误处理）
 */
function runCommand(
  cmd: string,
  cwd: string,
  options: RunCommandOptions = {}
): RunCommandResult {
  const { timeout = 300000, retries = 0, ignoreError = false, silent = false } = options;

  let lastError: typeof AppError.prototype | undefined;
  let attempt = 0;

  while (attempt <= retries) {
    attempt++;
    try {
      const result = execSync(cmd, {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout,
      });
      return { success: true, stdout: result.trim() };
    } catch (e: unknown) {
      const error = e as { stderr?: string; message?: string; status?: number };
      const errorMessage = error.stderr || error.message || '未知错误';

      lastError = createError(ErrorType.PROCESS, 'PROCESS_ERROR', {
        userMessage: `命令执行失败: ${errorMessage}`,
        context: { cmd, cwd, exitCode: error.status },
      });

      if (!silent) {
        console.error(`[命令错误] ${cmd}: ${errorMessage}`);
      }

      // 如果不是网络相关错误，不重试
      if (!errorMessage.includes('network') && !errorMessage.includes('timeout') && !errorMessage.includes('ETIMEDOUT')) {
        break;
      }

      // 如果还有重试机会，等待后重试
      if (attempt <= retries) {
        const delay = 1000 * attempt;
        console.log(`[重试] ${delay}ms 后进行第 ${attempt} 次重试...`);
        const start = Date.now();
        while (Date.now() - start < delay) {
          // 同步等待
        }
      }
    }
  }

  if (ignoreError) {
    return { success: false, stderr: lastError?.userMessage, error: lastError };
  }

  return { success: false, stderr: lastError?.userMessage, error: lastError };
}

function runCommandArgs(
  file: string,
  cwd: string,
  options: RunCommandArgsOptions = {}
): RunCommandResult {
  const { timeout = 300000, ignoreError = false, silent = false, args = [] } = options;

  try {
    const result = execFileSync(file, args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout,
    });
    return { success: true, stdout: result.trim() };
  } catch (e: unknown) {
    const error = e as { stderr?: string; message?: string; status?: number };
    const errorMessage = error.stderr || error.message || '未知错误';
    const appError = createError(ErrorType.PROCESS, 'PROCESS_ERROR', {
      userMessage: `命令执行失败: ${errorMessage}`,
      context: { file, args, cwd, exitCode: error.status },
    });

    if (!silent) {
      console.error(`[命令错误] ${file} ${args.join(' ')}: ${errorMessage}`);
    }

    if (ignoreError) {
      return { success: false, stderr: appError.userMessage, error: appError };
    }

    return { success: false, stderr: appError.userMessage, error: appError };
  }
}

/**
 * 简单版本（向后兼容）
 */
function runCommandSimple(cmd: string, cwd: string): string {
  const result = runCommand(cmd, cwd);
  if (!result.success && result.error) {
    throw new Error(result.stderr || result.error.userMessage);
  }
  return result.stdout || '';
}

function appendLog(
  level: 'info' | 'success' | 'error' | 'warning',
  message: string
) {
  logs.push({ time: new Date().toLocaleTimeString(), level, message });
  if (logs.length > 100) logs.shift();
}

function checkCommand(cmd: string): boolean {
  try {
    if (os.platform() === 'win32') {
      execFileSync('where', [cmd], { stdio: 'pipe' });
    } else {
      execFileSync('which', [cmd], { stdio: 'pipe' });
    }
    return true;
  } catch {
    return false;
  }
}

function parseCommandForSpawn(command: string): { file: string; args: string[] } {
  const tokens = command.match(/"[^"]*"|'[^']*'|\S+/g) || [];
  const normalized = tokens.map((token) => token.replace(/^['"]|['"]$/g, ''));
  return {
    file: normalized[0] || '',
    args: normalized.slice(1),
  };
}

function resolveRemoteDefaultRef(projectPath: string): string {
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

/**
 * 验证 URL 格式
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new NodeURL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 打开浏览器（改进版）
 */
function openBrowser(url: string): { success: boolean; error?: string; fallbackUrl?: string } {
  // 1. 验证 URL 格式
  if (!isValidUrl(url)) {
    return { success: false, error: '无效的URL格式' };
  }

  // 2. 根据平台选择命令
  const platform = os.platform();
  let commands: string[] = [];

  if (platform === 'darwin') {
    commands = ['open'];
  } else if (platform === 'win32') {
    commands = ['start', ''];
  } else {
    commands = ['xdg-open', 'google-chrome', 'firefox'];
  }

  // 3. 尝试多个命令
  for (const cmd of commands) {
    if (!cmd) continue;
    try {
      if (platform === 'win32') {
        execSync(`start "" "${url}"`, { timeout: 5000 });
      } else {
        execSync(`${cmd} "${url}"`, { timeout: 5000 });
      }
      return { success: true };
    } catch {
      continue;
    }
  }

  // 4. 失败时返回可手动打开的URL
  console.log('');
  console.log('\x1b[33m⚠️  无法自动打开浏览器，请手动访问:\x1b[0m');
  console.log(`\x1b[36m    ${url}\x1b[0m`);
  console.log('');

  return {
    success: false,
    error: '无法自动打开浏览器',
    fallbackUrl: url,
  };
}

// ============================================
// 状态
// ============================================

let gatewayProcess: import('child_process').ChildProcess | null = null;
let gatewayStatus: 'stopped' | 'starting' | 'running' | 'stopping' = 'stopped';
let logs: Array<{ time: string; level: string; message: string }> = [];

function getGatewayRuntimeStatus(config: Record<string, unknown>) {
  const gatewayPort = Number(config.gatewayPort || DEFAULT_GATEWAY_PORT);
  const installPath = String(config.installPath || '');
  return {
    installed: !!installPath && isOpenClawProjectDir(installPath),
    running: gatewayStatus === 'running' || gatewayStatus === 'starting',
    state: gatewayStatus,
    gatewayPort,
    gatewayToken: readGatewayTokenFromHome(),
    gatewayUrl: `http://localhost:${gatewayPort}/`,
  };
}

// ============================================
// Web 界面 HTML
// ============================================

function getHTML(config: Record<string, unknown>, status: ReturnType<typeof getGatewayRuntimeStatus>) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🦞 龙虾助手</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg-top: #f36b32;
      --bg-mid: #134074;
      --bg-bottom: #08111f;
      --surface: rgba(255,255,255,0.94);
      --surface-strong: #ffffff;
      --surface-soft: #f6f8fc;
      --surface-accent: #fff5ef;
      --text-main: #18212f;
      --text-muted: #5f6b7a;
      --text-soft: #8b95a5;
      --border: rgba(24,33,47,0.08);
      --border-strong: rgba(243,107,50,0.18);
      --brand: #f36b32;
      --brand-dark: #d75621;
      --success: #0f9d72;
      --danger: #e24a4a;
      --warning: #d48a18;
      --shadow: 0 18px 60px rgba(7,15,28,0.18);
      --radius-xl: 22px;
      --radius-lg: 16px;
      --radius-md: 12px;
      --radius-sm: 10px;
    }
    body {
      font-family: "PingFang SC", "Microsoft YaHei", "Helvetica Neue", system-ui, sans-serif;
      background:
        radial-gradient(circle at top left, rgba(255,255,255,0.2), transparent 28%),
        radial-gradient(circle at top right, rgba(243,107,50,0.22), transparent 24%),
        linear-gradient(155deg, var(--bg-top) 0%, var(--bg-mid) 56%, var(--bg-bottom) 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 920px; margin: 0 auto; }
    .header {
      color: white;
      padding: 22px 0 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      flex-wrap: wrap;
    }
    .header-main { display: flex; align-items: center; gap: 18px; }
    .logo {
      width: 72px;
      height: 72px;
      border-radius: 22px;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06));
      border: 1px solid rgba(255,255,255,0.22);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.2),
        0 16px 30px rgba(7,15,28,0.18);
      backdrop-filter: blur(10px);
      padding: 10px;
    }
    .logo svg {
      width: 100%;
      height: 100%;
      display: block;
      filter: drop-shadow(0 10px 18px rgba(127, 27, 27, 0.24));
    }
    .title { font-size: 32px; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 4px; }
    .subtitle { opacity: 0.88; font-size: 14px; }
    .version { font-size: 12px; opacity: 0.72; margin-top: 6px; }
    .header-badges { display: flex; gap: 10px; flex-wrap: wrap; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 999px;
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.16);
      color: rgba(255,255,255,0.92);
      font-size: 12px;
      backdrop-filter: blur(10px);
    }
    .card {
      background: var(--surface);
      border-radius: var(--radius-xl);
      padding: 28px;
      margin-bottom: 20px;
      box-shadow: var(--shadow);
      border: 1px solid rgba(255,255,255,0.45);
      backdrop-filter: blur(16px);
      animation: fadeUp 0.24s ease-out;
    }
    .card-title {
      font-size: 22px;
      color: var(--text-main);
      margin-bottom: 18px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 10px;
      letter-spacing: -0.02em;
    }
    .card-subtitle { color: var(--text-muted); font-size: 14px; margin: -6px 0 18px; line-height: 1.65; }
    .hero-panel {
      background: linear-gradient(135deg, rgba(243,107,50,0.1), rgba(19,64,116,0.08));
      border: 1px solid var(--border-strong);
      border-radius: 18px;
      padding: 18px 18px 16px;
      margin-bottom: 20px;
    }
    .hero-kicker { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; color: var(--brand-dark); text-transform: uppercase; margin-bottom: 8px; }
    .hero-title { font-size: 20px; font-weight: 800; color: var(--text-main); margin-bottom: 8px; letter-spacing: -0.02em; }
    .hero-copy { color: var(--text-muted); font-size: 14px; line-height: 1.7; }
    .meta-row, .actions, .actions-right, .toolbar, .header-badges { display: flex; flex-wrap: wrap; }
    .meta-row { gap: 10px; margin-top: 14px; }
    .meta-pill, .inline-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(255,255,255,0.84);
      border: 1px solid var(--border);
      color: var(--text-main);
      font-size: 12px;
    }
    .status-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .status-item {
      padding: 18px;
      background: linear-gradient(180deg, var(--surface-strong), var(--surface-soft));
      border-radius: 16px;
      border: 1px solid var(--border);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
    }
    .status-label { font-size: 12px; color: var(--text-soft); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.08em; }
    .status-value { font-size: 17px; font-weight: 700; color: var(--text-main); line-height: 1.35; }
    .status-value.success { color: var(--success); }
    .status-value.error { color: var(--danger); }
    .status-value.warning { color: var(--warning); }
    .btn {
      padding: 12px 18px;
      border: none;
      border-radius: 999px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-decoration: none;
    }
    .btn-primary {
      background: linear-gradient(135deg, var(--brand), var(--brand-dark));
      color: white;
      box-shadow: 0 10px 24px rgba(243,107,50,0.24);
    }
    .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(243,107,50,0.28); }
    .btn-secondary { background: #edf1f7; color: var(--text-main); border: 1px solid rgba(24,33,47,0.08); }
    .btn-secondary:hover { background: #e4e9f2; }
    .btn-danger { background: linear-gradient(135deg, #ef5350, #d83c3c); color: white; box-shadow: 0 10px 24px rgba(216,60,60,0.18); }
    .btn-danger:hover { transform: translateY(-1px); }
    .btn-small { padding: 8px 16px; font-size: 13px; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .actions { margin-top: 20px; gap: 10px; }
    .actions-right { justify-content: flex-end; gap: 10px; margin-top: 20px; }
    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-size: 13px; font-weight: 700; color: var(--text-main); margin-bottom: 8px; }
    .form-helper { font-size: 12px; color: var(--text-soft); margin-top: 6px; line-height: 1.5; }
    .form-input, .form-select {
      width: 100%;
      padding: 13px 14px;
      border: 1px solid rgba(24,33,47,0.1);
      border-radius: 14px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
      background: rgba(255,255,255,0.96);
      color: var(--text-main);
    }
    .form-input:focus, .form-select:focus {
      border-color: rgba(243,107,50,0.5);
      box-shadow: 0 0 0 4px rgba(243,107,50,0.12);
      background: white;
    }
    .logs {
      background: linear-gradient(180deg, #101926, #172233);
      border-radius: 16px;
      padding: 18px;
      max-height: 320px;
      overflow-y: auto;
      font-family: "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      color: #9CA3AF;
      border: 1px solid rgba(255,255,255,0.06);
    }
    .log-line { margin-bottom: 4px; }
    .log-time { color: #6B7280; }
    .log-info { color: #9CA3AF; }
    .log-error { color: #F87171; }
    .log-success { color: #34D399; }
    .log-warning { color: #FBBF24; }
    .note {
      background: #fff1cc;
      border-radius: 14px;
      padding: 13px 14px;
      margin-bottom: 16px;
      font-size: 14px;
      color: #915b0d;
      border: 1px solid rgba(212,138,24,0.18);
      line-height: 1.6;
    }
    .note-info { background: #e8f1ff; color: #1c4ea5; border-color: rgba(28,78,165,0.14); }
    .note-success { background: #ddf8ee; color: #086247; border-color: rgba(8,98,71,0.12); }
    .footer { text-align: center; color: rgba(255,255,255,0.72); font-size: 12px; margin-top: 20px; }
    #toast { position: fixed; bottom: 20px; right: 20px; padding: 12px 24px; border-radius: 8px; color: white; font-weight: 500; opacity: 0; transition: all 0.3s; z-index: 1000; }
    #toast.show { opacity: 1; }
    #toast.success { background: #10B981; }
    #toast.error { background: #EF4444; }
    .wizard-steps { display: grid; gap: 16px; margin-bottom: 20px; }
    .wizard-step {
      padding: 18px;
      border: 1px solid var(--border);
      border-radius: 18px;
      background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(246,248,252,0.96));
    }
    .wizard-step-title { font-size: 15px; font-weight: 800; color: var(--text-main); margin-bottom: 10px; letter-spacing: -0.01em; }
    .wizard-step-desc { font-size: 12px; color: var(--text-muted); margin-bottom: 12px; line-height: 1.6; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 13px; font-weight: 700; color: var(--text-soft); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
    .divider { height: 1px; background: var(--border); margin: 22px 0; }
    .panel {
      background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(246,248,252,0.95));
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 18px;
    }
    .panel-title { font-size: 15px; font-weight: 800; color: var(--text-main); margin-bottom: 8px; }
    .panel-copy { font-size: 13px; color: var(--text-muted); line-height: 1.6; }
    .update-section { background: linear-gradient(180deg, rgba(246,248,252,0.98), rgba(237,241,247,0.95)); border-radius: 18px; padding: 18px; margin-top: 16px; border: 1px solid var(--border); }
    .update-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #E5E7EB; }
    .update-item:last-child { border-bottom: none; }
    .update-info h4 { font-size: 14px; color: var(--text-main); margin-bottom: 4px; }
    .update-info p { font-size: 12px; color: var(--text-muted); }
    .help-section { background: #F9FAFB; border-radius: 16px; padding: 16px; margin-bottom: 20px; border: 1px solid var(--border); }
    .help-item { padding: 12px 0; border-bottom: 1px solid #E5E7EB; }
    .help-item:last-child { border-bottom: none; }
    .help-title { font-size: 14px; font-weight: 600; color: #1F2937; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
    .help-content { font-size: 13px; color: #6B7280; line-height: 1.6; }
    .help-content ul { margin: 8px 0 0 20px; }
    .help-content li { margin-bottom: 4px; }
    .help-content code { background: #E5E7EB; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    .help-accordion { cursor: pointer; }
    .help-accordion .help-title::after { content: '▼'; font-size: 10px; margin-left: auto; color: #9CA3AF; transition: transform 0.2s; }
    .help-accordion.open .help-title::after { transform: rotate(180deg); }
    .help-accordion .help-content { display: none; }
    .help-accordion.open .help-content { display: block; }
    .faq-item { margin-bottom: 16px; }
    .faq-q { font-weight: 600; color: #1F2937; margin-bottom: 4px; }
    .faq-a { color: #6B7280; font-size: 13px; line-height: 1.5; }
    /* Tab 样式 */
    .tabs { display: flex; gap: 10px; margin-bottom: 20px; padding: 8px; border-radius: 16px; background: #f2f5fa; border: 1px solid var(--border); }
    .tab { flex: 1; padding: 12px 16px; border: none; background: transparent; font-size: 14px; font-weight: 700; color: var(--text-soft); cursor: pointer; border-radius: 12px; transition: all 0.2s; }
    .tab:hover { color: var(--brand-dark); background: rgba(255,255,255,0.72); }
    .tab.active { color: var(--brand-dark); background: white; box-shadow: 0 8px 18px rgba(24,33,47,0.06); }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    /* 技能卡片 */
    .skill-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    @media (max-width: 500px) { .skill-grid { grid-template-columns: 1fr; } }
    .skill-card { padding: 16px; border: 2px solid #E5E7EB; border-radius: 12px; transition: all 0.2s; }
    .skill-card:hover { border-color: #FF6B35; box-shadow: 0 4px 12px rgba(255,107,53,0.15); }
    .skill-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .skill-icon { font-size: 24px; }
    .skill-name { font-weight: 600; color: #1F2937; font-size: 14px; }
    .skill-desc { font-size: 12px; color: #6B7280; margin-bottom: 10px; line-height: 1.4; }
    .skill-footer { display: flex; justify-content: space-between; align-items: center; }
    .skill-stars { font-size: 12px; color: #F59E0B; }
    .skill-category { font-size: 11px; padding: 2px 8px; background: #F3F4F6; border-radius: 4px; color: #6B7280; }
    .skill-installed { color: #10B981; font-size: 12px; display: flex; align-items: center; gap: 4px; }
    .category-filter { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .category-btn { padding: 6px 12px; border: 1px solid #E5E7EB; border-radius: 20px; background: white; font-size: 12px; color: #6B7280; cursor: pointer; transition: all 0.2s; }
    .category-btn:hover { border-color: #FF6B35; color: #FF6B35; }
    .category-btn.active { background: #FF6B35; color: white; border-color: #FF6B35; }
    .installed-list { margin-top: 20px; }
    .installed-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #F9FAFB; border-radius: 8px; margin-bottom: 8px; }
    .installed-name { font-weight: 500; color: #1F2937; }
    .service-hero {
      display: grid;
      grid-template-columns: minmax(0, 1.5fr) minmax(260px, 1fr);
      gap: 16px;
      margin-bottom: 18px;
    }
    .service-actions, .service-side { height: 100%; }
    .muted { color: var(--text-muted); }
    .mono { font-family: "SFMono-Regular", Menlo, Monaco, Consolas, monospace; font-size: 12px; }
    .small { font-size: 12px; }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @media (max-width: 720px) {
      body { padding: 14px; }
      .card { padding: 20px; border-radius: 18px; }
      .header { padding-top: 10px; }
      .header-main { align-items: flex-start; }
      .service-hero, .status-grid { grid-template-columns: 1fr; }
      .tabs { flex-direction: column; }
      .tab { width: 100%; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-main">
        <div class="logo" aria-label="OpenClaw logo">
          <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <linearGradient id="openclaw-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ff4d4d"/>
                <stop offset="100%" stop-color="#991b1b"/>
              </linearGradient>
            </defs>
            <path d="M60 10 C30 10 15 35 15 55 C15 75 30 95 45 100 L45 110 L55 110 L55 100 C55 100 60 102 65 100 L65 110 L75 110 L75 100 C90 95 105 75 105 55 C105 35 90 10 60 10Z" fill="url(#openclaw-logo-gradient)"/>
            <path d="M20 45 C5 40 0 50 5 60 C10 70 20 65 25 55 C28 48 25 45 20 45Z" fill="url(#openclaw-logo-gradient)"/>
            <path d="M100 45 C115 40 120 50 115 60 C110 70 100 65 95 55 C92 48 95 45 100 45Z" fill="url(#openclaw-logo-gradient)"/>
            <path d="M45 15 Q35 5 30 8" stroke="#ff4d4d" stroke-width="3" stroke-linecap="round"/>
            <path d="M75 15 Q85 5 90 8" stroke="#ff4d4d" stroke-width="3" stroke-linecap="round"/>
            <circle cx="45" cy="35" r="6" fill="#050810"/>
            <circle cx="75" cy="35" r="6" fill="#050810"/>
            <circle cx="46" cy="34" r="2.5" fill="#00e5cc"/>
            <circle cx="76" cy="34" r="2.5" fill="#00e5cc"/>
          </svg>
        </div>
        <div>
          <div class="title">龙虾助手</div>
          <div class="subtitle">把 OpenClaw 的授权、部署、配置和运行都收进一个本地控制台。</div>
          <div class="version">v${VERSION}</div>
        </div>
      </div>
      <div class="header-badges">
        <div class="badge">本地控制台</div>
        <div class="badge">自动更新</div>
        <div class="badge">OpenClaw 引导式配置</div>
      </div>
    </div>
    <div id="main-card" class="card"></div>
    <div class="footer">© 2024 龙虾助手 · 让 AI 触手可及</div>
  </div>
  <div id="toast"></div>
  <script>
    const PROVIDERS = ${JSON.stringify(PROVIDERS)};
    // 默认选择当前 provider 的默认模型
    const defaultProvider = '${config.provider || 'anthropic'}';
    const defaultModel = defaultProvider === 'custom'
      ? ('${config.customModelId || config.model || ''}')
      : ('${config.model}' || (PROVIDERS[defaultProvider]?.models.find(m => m.recommended)?.id || PROVIDERS[defaultProvider]?.models[0]?.id || ''));
    const state = {
      config: ${JSON.stringify(config)},
      status: ${JSON.stringify(status)},
      purchaseUrl: '${getPurchaseUrl(config)}',
      logs: [],
      selectedProvider: defaultProvider,
      selectedModel: defaultModel,
      currentTab: 'status',
      currentView: 'dashboard',
      skillsLoaded: false,
      helpLoaded: false,
      customWizard: {
        verified: false,
        verifying: false,
        message: '',
        suggestedEndpointId: '',
        retryMode: '',
      },
    };

    function $(id) { return document.getElementById(id); }
    function toast(msg, type = 'success') {
      const t = $('toast'); t.textContent = msg; t.className = 'show ' + type;
      setTimeout(() => t.className = '', 3000);
    }

    // 带超时的 API 请求
    async function api(action, data = {}, timeout = 60000) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const res = await fetch('/api/' + action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          if (res.status === 413) {
            return { success: false, error: '请求数据过大' };
          }
          return { success: false, error: 'HTTP ' + res.status + ': ' + res.statusText };
        }

        const result = await res.json();
        return result;
      } catch (e) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') {
          return { success: false, error: '请求超时，请稍后重试' };
        }
        return { success: false, error: e.message || '网络请求失败' };
      }
    }

    // 显示友好的错误信息
    function showError(title, error, suggestions = []) {
      const card = $('main-card');
      let html = '<h2 class="card-title">❌ ' + title + '</h2>';
      html += '<div class="note" style="background:#FEF2F2;color:#991B1B">' + (error || '未知错误') + '</div>';
      if (suggestions.length > 0) {
        html += '<div style="margin-top:16px"><strong>建议:</strong><ul style="margin:8px 0 0 20px;color:#6B7280">';
        suggestions.forEach(s => { html += '<li>' + s + '</li>'; });
        html += '</ul></div>';
      }
      html += '<div class="actions" style="margin-top:20px"><button class="btn btn-primary" onclick="render()">返回</button></div>';
      card.innerHTML = html;
    }

    // 显示加载状态
    function showLoading(message) {
      const card = $('main-card');
      card.innerHTML = '<h2 class="card-title">' + message + '</h2><div style="text-align:center;padding:40px"><div style="font-size:40px">⏳</div><p style="color:#6B7280;margin-top:12px">请稍候...</p></div>';
    }

    function render() {
      state.currentView = 'dashboard';
      const card = $('main-card');
      const c = state.config, s = state.status;

      // 未激活
      if (!c.activated) {
        card.innerHTML = \`
          <h2 class="card-title">🔐 激活产品</h2>
          <div class="hero-panel">
            <div class="hero-kicker">Activation</div>
            <div class="hero-title">先完成激活，再进入部署和运行</div>
            <div class="hero-copy">输入购买得到的激活码即可完成当前设备绑定。激活成功后，会自动进入 OpenClaw 的部署与配置流程。</div>
            <div class="meta-row">
              <div class="meta-pill">一机一绑定</div>
              <div class="meta-pill">服务端校验</div>
              <div class="meta-pill">支持购买后即刻激活</div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">激活码</label>
            <input type="text" id="code" class="form-input" placeholder="XXXX-XXXX-XXXX-XXXX" style="text-transform: uppercase; letter-spacing: 2px;">
            <div class="form-helper">输入时可以带分隔符，系统会自动规范化并提交到授权服务器验证。</div>
          </div>
          <div class="actions">
            <button class="btn btn-primary" onclick="activate()">激活</button>
            <a class="btn btn-secondary" href="\${state.purchaseUrl}" target="_blank" rel="noopener noreferrer">购买激活码</a>
          </div>
          <div class="panel" style="margin-top:14px">
            <div class="panel-title">还没有激活码？</div>
            <div class="panel-copy">点击“购买激活码”会打开购买页面。购买后回到这里输入激活码即可继续，不需要额外切换到命令行。</div>
          </div>
        \`;
        return;
      }

      // 未部署
      if (!s.installed) {
        const deployProvider = PROVIDERS[state.selectedProvider] || PROVIDERS.custom;
        const deployIsCustom = state.selectedProvider === 'custom';
        card.innerHTML = \`
          <h2 class="card-title">📦 部署 OpenClaw</h2>
          <div class="hero-panel">
            <div class="hero-kicker">Deploy</div>
            <div class="hero-title">先确定模型接入方式，再落到本地部署</div>
            <div class="hero-copy">先选模型接入方式，再完成本地部署。常见服务可以快速配置，自定义接入则需要先完成连接验证。</div>
          </div>

          <div class="note note-info">部署前会先跑一次性环境预检，缺依赖、端口冲突、安装路径异常会在开始前集中给出。</div>

          <div class="wizard-steps">
            <div class="wizard-step">
              <div class="wizard-step-title">第 1 步：选择 Provider</div>
              <div class="wizard-step-desc">先选择你要接入的模型服务。常见服务可以直接选，自定义服务则需要手动填写连接信息。</div>
              <select id="deployProvider" class="form-select" onchange="selectProvider(this.value)">
                \${renderProviderOptions()}
              </select>
            </div>

            <div class="wizard-step">
              <div class="wizard-step-title">第 2 步：填写模型与认证</div>
              \${deployIsCustom ? \`
                <div class="wizard-step-desc">自定义接入时，请先填写地址和密钥，再确认接口类型与模型名称。</div>
                <div class="form-group">
                  <label class="form-label">API Key</label>
                  <input type="password" id="apiKey" class="form-input" value="\${c.apiKey || ''}" placeholder="请输入 API Key">
                </div>
                <div class="form-group">
                  <label class="form-label">Base URL</label>
                  <input type="text" id="deployBaseUrl" class="form-input" value="\${c.baseUrl || ''}" placeholder="例如: https://api.example.com/v1">
                </div>
                <div class="form-group">
                  <label class="form-label">接口类型</label>
                  <select id="deployApiFormat" class="form-select">
                    <option value="openai" \${normalizeCustomCompatibilityChoiceClient(c.apiFormat || 'openai') === 'openai' ? 'selected' : ''}>OpenAI-compatible</option>
                    <option value="anthropic" \${normalizeCustomCompatibilityChoiceClient(c.apiFormat) === 'anthropic' ? 'selected' : ''}>Anthropic-compatible</option>
                    <option value="unknown" \${normalizeCustomCompatibilityChoiceClient(c.apiFormat) === 'unknown' ? 'selected' : ''}>Unknown (自动探测)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Model ID</label>
                  <input type="text" id="deployCustomModelId" class="form-input" value="\${c.customModelId || c.model || ''}" placeholder="例如: glm-5">
                </div>
              \` : \`
                <div class="wizard-step-desc">常见服务只需要选模型并填写 API Key，不需要额外步骤。</div>
                <div class="form-group">
                  <label class="form-label">Model</label>
                  <select id="deployModel" class="form-select" onchange="selectModel(this.value)">
                    \${renderModelOptions(state.selectedProvider, state.selectedModel)}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">API Key</label>
                  <input type="password" id="apiKey" class="form-input" value="\${c.apiKey || ''}" placeholder="请输入 API Key">
                </div>
              \`}
            </div>

            <div class="wizard-step">
              <div class="wizard-step-title">第 3 步：部署位置与端口</div>
              <div class="form-group">
                <label class="form-label">安装路径</label>
                <input type="text" id="path" class="form-input" value="\${c.installPath || '${path.join(os.homedir(), 'openclaw')}'}">
              </div>
              <div class="form-group">
                <label class="form-label">端口号</label>
                <input type="number" id="port" class="form-input" value="\${c.gatewayPort || ${DEFAULT_GATEWAY_PORT}}">
              </div>
            </div>
          </div>

          <div class="section">
            <div class="panel">
              <div class="panel-title">部署说明</div>
              <div class="panel-copy">
                \${deployIsCustom
                  ? '自定义接入会保留你填写的地址、接口类型、模型名称和别名，后续启动时直接沿用。'
                  : '常见服务这里会自动生成对应配置，保存后可以直接启动 OpenClaw。'}
              </div>
            </div>
          </div>

          <div class="actions">
            <button class="btn btn-primary" onclick="deploy()">开始部署</button>
          </div>
        \`;
        return;
      }

      // 控制面板
      card.innerHTML = \`
        <div class="tabs">
          <button class="tab \${state.currentTab === 'status' || !state.currentTab ? 'active' : ''}" onclick="switchTab('status')">🎛️ 服务</button>
          <button class="tab \${state.currentTab === 'skills' ? 'active' : ''}" onclick="switchTab('skills')">🧩 技能市场</button>
          <button class="tab \${state.currentTab === 'help' ? 'active' : ''}" onclick="switchTab('help')">❓ 使用指南</button>
        </div>

        <!-- 服务 Tab -->
        <div id="tab-status" class="tab-content \${state.currentTab === 'status' || !state.currentTab ? 'active' : ''}">
          <div class="service-hero">
            <div class="hero-panel service-actions">
              <div class="hero-kicker">Service</div>
              <div class="hero-title">\${s.running ? 'OpenClaw 正在运行' : 'OpenClaw 当前未启动'}</div>
              <div class="hero-copy">\${s.running ? '网关已经就绪，可以直接打开 OpenClaw，或者复制自动认证链接给当前浏览器会话使用。' : '先确认 API 配置无误，再启动本地网关。启动失败时，可直接在下方查看运行日志。'}</div>
              <div class="actions">
                \${s.running
                  ? '<button class="btn btn-danger" onclick="stop()">⏹ 停止服务</button>'
                  : '<button class="btn btn-primary" onclick="start()">▶ 启动服务</button>'
                }
                <button class="btn btn-secondary" onclick="showConfig()">⚙️ 配置</button>
                \${s.running ? '<button class="btn btn-secondary" onclick="openGateway()">🌐 打开 OpenClaw</button>' : ''}
              </div>
            </div>
            <div class="panel service-side">
              <div class="panel-title">当前运行要点</div>
              <div class="panel-copy">
                Web 控制台：<span class="mono">http://localhost:${config.webPort || DEFAULT_WEB_PORT}</span><br>
                Gateway 端口：<span class="mono">\${c.gatewayPort || ${DEFAULT_GATEWAY_PORT}}</span><br>
                模型接入：<span class="mono">\${c.provider || '未配置'} / \${c.model || '未配置'}</span>
              </div>
              \${s.running ? '<div class="actions" style="margin-top:14px"><button class="btn btn-secondary btn-small" onclick="copyGatewayLink()">🔗 复制自动认证链接</button></div>' : ''}
            </div>
          </div>

          <div class="status-grid">
            <div class="status-item">
              <div class="status-label">服务状态</div>
              <div class="status-value \${s.running ? 'success' : 'error'}">\${s.running ? '● 运行中' : '○ 已停止'}</div>
            </div>
            <div class="status-item">
              <div class="status-label">端口</div>
              <div class="status-value">\${c.gatewayPort || ${DEFAULT_GATEWAY_PORT}}</div>
            </div>
            <div class="status-item">
              <div class="status-label">AI 提供商</div>
              <div class="status-value">\${PROVIDERS[c.provider]?.name || '未配置'}</div>
            </div>
            <div class="status-item">
              <div class="status-label">模型</div>
              <div class="status-value" style="font-size:12px">\${c.model || '未配置'}</div>
            </div>
          </div>

          \${s.running && s.gatewayToken ? \`
            <div class="note note-info" style="margin-top:14px">
              访问令牌：<code style="word-break:break-all">\${s.gatewayToken}</code><br>
              使用“打开 OpenClaw”或“复制自动认证链接”时会自动带上它。只有你自己手动打开新标签页时，才需要把它填进网页设置里。
            </div>
          \` : ''}

          <div class="divider"></div>

          <div class="update-section">
            <h3 style="font-size:14px;color:#1F2937;margin-bottom:12px">🔄 更新管理</h3>
            <div class="update-item">
              <div class="update-info">
                <h4>OpenClaw</h4>
                <p>更新 AI 网关服务到最新版本</p>
              </div>
              <button class="btn btn-secondary btn-small" onclick="updateOpenClaw()">检查更新</button>
            </div>
            <div class="update-item">
              <div class="update-info">
                <h4>龙虾助手</h4>
                <p>启动时自动检查并强制更新</p>
              </div>
              <span style="color:#10B981;font-size:13px">✓ 自动更新已启用</span>
            </div>
          </div>

          <div class="divider"></div>

          <div class="panel">
            <div class="panel-title">卸载 OpenClaw</div>
            <div class="panel-copy">
              会先停止网关，再删除 OpenClaw 安装目录、<span class="mono">~/.openclaw</span> 运行缓存、临时日志目录，并清空当前部署配置。
              产品激活状态会保留，不会把龙虾助手本身一起卸掉。
            </div>
            <div class="actions" style="margin-top:14px">
              <button class="btn btn-danger" onclick="uninstallOpenClaw()">🗑️ 彻底卸载 OpenClaw</button>
            </div>
          </div>

          <div class="divider"></div>

          <h3 style="font-size:14px;color:#1F2937;margin-bottom:12px">📋 运行日志</h3>
          <div class="logs" id="logs"><div class="log-line log-info">等待操作...</div></div>
        </div>

        <!-- 技能市场 Tab -->
        <div id="tab-skills" class="tab-content \${state.currentTab === 'skills' ? 'active' : ''}">
          <div class="note note-info" style="margin-bottom: 16px;">
            🧩 OpenClaw 的技能市场是 ClawHub。先去市场里挑技能，记住 skill id，再回到这里安装。
          </div>
          <div class="panel" style="margin-bottom:16px">
            <div class="panel-title">官方技能市场</div>
            <div class="panel-copy">
              直接去 <span class="mono">clawhub.ai</span> 浏览技能详情、安装说明和依赖要求。这个页面只负责执行安装和查看已安装结果，不再内置一份本地热门技能假列表。
            </div>
            <div class="actions" style="margin-top:14px">
              <a class="btn btn-primary" href="${CLAWHUB_MARKET_URL}" target="_blank" rel="noopener">打开 ClawHub</a>
              <button class="btn btn-secondary" onclick="refreshInstalledSkills()">刷新已安装</button>
            </div>
          </div>

          <div class="panel" style="margin-bottom:16px">
            <div class="panel-title">按 skill id 安装</div>
            <div class="panel-copy">
              在 ClawHub 找到技能后，把技能 id 粘贴到下面。例如 <span class="mono">tavily-search</span> 或 <span class="mono">github</span>。
            </div>
            <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;margin-top:14px">
              <input id="skill-id-input" class="input" placeholder="输入 skill id，例如 tavily-search" />
              <button class="btn btn-primary" onclick="installSkillFromInput()">安装技能</button>
            </div>
            <div style="margin-top:10px;font-size:12px;color:#6B7280">
              安装后通常需要重启 OpenClaw 服务，技能才会出现在实际会话里。
            </div>
          </div>

          <div class="divider"></div>

          <h3 style="font-size:14px;color:#1F2937;margin-bottom:12px">✅ 已安装技能</h3>
          <div id="installed-skills">
            <div style="text-align:center;padding:20px;color:#9CA3AF;">加载中...</div>
          </div>
        </div>

        <!-- 使用指南 Tab -->
        <div id="tab-help" class="tab-content \${state.currentTab === 'help' ? 'active' : ''}" id="help-content">
          加载中...
        </div>
      \`;

      // 初始化 Tab 数据
      if (state.currentTab === 'skills' || !state.skillsLoaded) {
        loadSkills();
      }
      if (state.currentTab === 'help' || !state.helpLoaded) {
        loadHelp();
      }

      if (s.running && (state.currentTab === 'status' || !state.currentTab)) pollLogs();
    }

    function renderProviderOptions() {
      return Object.entries(PROVIDERS).map(([key, provider]) => {
        return '<option value="' + key + '"' + (state.selectedProvider === key ? ' selected' : '') + '>' + provider.name + '</option>';
      }).join('');
    }

    function renderModelOptions(providerKey, selectedValue) {
      const provider = PROVIDERS[providerKey];
      if (!provider || !provider.models || provider.models.length === 0) return '';
      return provider.models.map((model) => {
        const selected = selectedValue === model.id ? ' selected' : '';
        return '<option value="' + model.id + '"' + selected + '>' + model.name + '</option>';
      }).join('');
    }

    function selectProvider(key) {
      state.selectedProvider = key;
      resetCustomWizard();
      const provider = PROVIDERS[key];
      if (provider && provider.models.length > 0) {
        if (key === 'custom') {
          state.selectedModel = state.config.customModelId || state.config.model || '';
        } else {
          const recommended = provider.models.find(m => m.recommended);
          state.selectedModel = recommended ? recommended.id : provider.models[0].id;
        }
      }
      render();
    }

    function selectModel(modelId) {
      state.selectedModel = modelId;
      render();
    }

    // ============================================
    // Tab 切换
    // ============================================

    function switchTab(tab) {
      state.currentTab = tab;
      render();
    }

    // ============================================
    // 技能市场
    // ============================================

    let installedSkills = [];

    async function loadSkills() {
      await refreshInstalledSkills();
      state.skillsLoaded = true;
    }

    async function refreshInstalledSkills() {
      const installedRes = await api('skills/installed');
      if (installedRes.success) {
        installedSkills = Array.isArray(installedRes.skills) ? installedRes.skills : [];
        renderInstalledSkills();
      } else {
        toast(installedRes.error || '无法读取已安装技能', 'error');
      }
    }

    function installSkillFromInput() {
      const input = $('skill-id-input');
      const skillId = (input?.value || '').trim();
      if (!skillId) {
        toast('请先输入 skill id', 'error');
        input?.focus();
        return;
      }
      installSkill(skillId);
    }

    function renderInstalledSkills() {
      const el = $('installed-skills');
      if (!el) return;

      if (installedSkills.length === 0) {
        el.innerHTML = '<div style="text-align:center;padding:20px;color:#9CA3AF;">暂无已安装的技能</div>';
        return;
      }

      el.innerHTML = installedSkills.map(skill => {
        const removable = skill.removable !== false;
        return \`
          <div class="installed-item">
            <div>
              <div class="installed-name">\${skill.name || skill.id}</div>
              <div style="font-size:12px;color:#6B7280;margin-top:4px">
                skill id: <span class="mono">\${skill.id}</span> · 来源：\${skill.source || '未知'}
              </div>
            </div>
            \${removable
              ? \`<button class="btn btn-secondary btn-small" onclick="uninstallSkill('\${skill.id}')">卸载</button>\`
              : '<span class="skill-installed">只读</span>'
            }
          </div>
        \`;
      }).join('');
    }

    async function installSkill(skillId) {
      toast('正在安装技能...', 'info');
      const res = await api('skills/install', { skill: skillId });
      if (res.success) {
        toast(res.message || '安装成功！');
        const input = $('skill-id-input');
        if (input) input.value = '';
        await refreshInstalledSkills();
      } else {
        toast(res.error || '安装失败', 'error');
      }
    }

    async function uninstallSkill(skillId) {
      if (!confirm('确定要卸载这个技能吗？')) return;
      toast('正在卸载...', 'info');
      const res = await api('skills/uninstall', { skill: skillId });
      if (res.success) {
        toast(res.message || '卸载成功！');
        await refreshInstalledSkills();
      } else {
        toast(res.error || '卸载失败', 'error');
      }
    }

    // ============================================
    // 使用指南
    // ============================================

    async function loadHelp() {
      const el = $('tab-help');
      if (!el) return;

      el.innerHTML = \`
        <div class="help-section">
          <h3 style="font-size:16px;color:#1F2937;margin-bottom:16px">🧭 OpenClaw 使用总览</h3>
          <div class="help-item">
            <div class="help-title">OpenClaw 不是单纯聊天页</div>
            <div class="help-content">
              OpenClaw 更像一个本地 AI 工作台：它有网关、模型接入、技能扩展、浏览器控制和会话状态。你真正要掌握的不是“怎么打开页面”，而是“怎样让 AI 在一个稳定环境里持续完成任务”。
            </div>
          </div>
          <div class="help-item">
            <div class="help-title">建议的使用顺序</div>
            <div class="help-content">
              <ul>
                <li>先确认当前模型可正常回复，再开始长任务。</li>
                <li>再决定是否需要安装技能，不要一开始装太多。</li>
                <li>最后进入对话，让 AI 先理解目标、输出计划，再开始执行。</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="help-section">
          <h3 style="font-size:16px;color:#1F2937;margin-bottom:16px">💬 推荐对话方式</h3>
          <div class="help-item">
            <div class="help-title">1. 先给目标，再给限制</div>
            <div class="help-content">
              <ul>
                <li>"帮我整理一份这周的产品更新总结，给非技术同事看。"</li>
                <li>"不要泛泛而谈，按变化点、影响、风险三段输出。"</li>
                <li>"如果信息不够，先问我最多 3 个补充问题。"</li>
              </ul>
            </div>
          </div>
          <div class="help-item">
            <div class="help-title">2. 长任务先让它给计划</div>
            <div class="help-content">
              <ul>
                <li>"先列一个执行计划，不要立刻开始改。"</li>
                <li>"把任务拆成：信息收集、方案、执行、验证。"</li>
                <li>"每完成一段给我一个可检查的结果。"</li>
              </ul>
            </div>
          </div>
          <div class="help-item">
            <div class="help-title">3. 让 AI 用结构化格式回答</div>
            <div class="help-content">
              <ul>
                <li>"按问题、原因、建议三列输出。"</li>
                <li>"最后只给我可执行结论，不要铺垫。"</li>
                <li>"如果存在不确定性，请单独列出。"</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="help-section">
          <h3 style="font-size:16px;color:#1F2937;margin-bottom:16px">🧩 技能与能力边界</h3>
          <div class="help-item">
            <div class="help-title">什么时候该装技能</div>
            <div class="help-content">
              如果你只是普通问答、写作、总结、翻译，通常不需要额外技能。只有当你希望 OpenClaw 去搜索网页、读写特定资源、连接第三方服务时，技能才真正有价值。
            </div>
          </div>
          <div class="help-item">
            <div class="help-title">技能装完以后怎么用</div>
            <div class="help-content">
              技能不是菜单按钮。正确方式是在对话里直接说需求，例如：
              <ul>
                <li>"搜索最近三天关于 Anthropic 的发布更新。"</li>
                <li>"把这个网页总结成 5 条给老板看的要点。"</li>
                <li>"检查这个仓库里和认证相关的代码。"</li>
              </ul>
              模型会自行决定是否调用已安装技能。
            </div>
          </div>
          <div class="help-item">
            <div class="help-title">为什么技能装了却像没生效</div>
            <div class="help-content">
              常见原因有三个：
              <ul>
                <li>安装后没有重启 OpenClaw。</li>
                <li>当前模型本身工具调用能力偏弱。</li>
                <li>你的提问方式太像普通聊天，没有明确需要外部能力。</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="help-section">
          <h3 style="font-size:16px;color:#1F2937;margin-bottom:16px">🧠 模型选择与切换</h3>
          <div class="help-item">
            <div class="help-title">什么时候切模型</div>
            <div class="help-content">
              <ul>
                <li>需要稳定工具调用和长上下文时，优先选更稳的主力模型。</li>
                <li>需要便宜、快、批量处理时，再换轻量模型。</li>
                <li>遇到回答飘、工具不触发、长任务跑偏时，先换模型再怀疑技能。</li>
              </ul>
            </div>
          </div>
          <div class="help-item">
            <div class="help-title">自定义模型接入怎么理解</div>
            <div class="help-content">
              自定义接入不是“随便填个代理地址”。正确顺序是：
              <ul>
                <li>先填 Base URL 和 API Key。</li>
                <li>再选接口类型。</li>
                <li>再填 Model ID 并验证。</li>
                <li>验证通过后再保存连接名称和模型别名。</li>
              </ul>
              如果验证不过，不要继续往下配，否则后面所有问题都会混在一起。
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="help-section">
          <h3 style="font-size:16px;color:#1F2937;margin-bottom:16px">🔐 Gateway Token 与浏览器会话</h3>
          <div class="help-item">
            <div class="help-title">为什么有时会提示缺少访问令牌</div>
            <div class="help-content">
              OpenClaw 网页和本地网关之间需要访问令牌。如果你不是从“打开 OpenClaw”按钮进入，而是自己手动输入地址打开新标签页，就可能没有把令牌一起带上。
            </div>
          </div>
          <div class="help-item">
            <div class="help-title">推荐打开方式</div>
            <div class="help-content">
              优先使用“打开 OpenClaw”或“复制自动认证链接”。这样浏览器会自动带上 token，不需要你手动去设置里粘贴。
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="help-section">
          <h3 style="font-size:16px;color:#1F2937;margin-bottom:16px">🛠️ 进阶排查</h3>
          <div class="help-item">
            <div class="help-title">启动失败时先看什么</div>
            <div class="help-content">
              先看服务页日志，不要直接猜。
              <ul>
                <li>如果是 API Key / Base URL 问题，通常会在启动早期看到认证或连接错误。</li>
                <li>如果是端口问题，会看到端口被占用或进程立即退出。</li>
                <li>如果是技能或依赖问题，往往发生在网关起来之后的初始化阶段。</li>
              </ul>
            </div>
          </div>
          <div class="help-item">
            <div class="help-title">最常见的三种误判</div>
            <div class="help-content">
              <ul>
                <li>模型能聊天，不代表技能一定可用。</li>
                <li>服务启动了，不代表浏览器会话已经带上 token。</li>
                <li>更新成功，不代表你当前配置一定还适配新版本模型接口。</li>
              </ul>
            </div>
          </div>
          <div class="help-item">
            <div class="help-title">一套稳妥的恢复流程</div>
            <div class="help-content">
              如果你把当前环境折腾乱了，建议按这个顺序恢复：
              <ul>
                <li>先停止服务。</li>
                <li>重新验证 API 配置。</li>
                <li>只保留必要技能。</li>
                <li>再启动服务并观察日志前 30 秒。</li>
                <li>如果仍然异常，再考虑更新或彻底卸载重装。</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="help-section">
          <h3 style="font-size:16px;color:#1F2937;margin-bottom:16px">📌 常见高质量提问模板</h3>
          <div class="faq-item">
            <div class="faq-q">研究型任务</div>
            <div class="faq-a">"帮我研究这个主题，先列出信息来源和判断框架，再给结论。不要只给一段概述。"</div>
          </div>
          <div class="faq-item">
            <div class="faq-q">文档处理</div>
            <div class="faq-a">"先提炼结构，再按目标读者重写，最后列出你删掉了哪些冗余内容。"</div>
          </div>
          <div class="faq-item">
            <div class="faq-q">代码分析</div>
            <div class="faq-a">"先定位文件和调用链，再按 bug、风险、修复建议输出，不要先讲背景。"</div>
          </div>
          <div class="faq-item">
            <div class="faq-q">连续协作</div>
            <div class="faq-a">"每次只做一步，做完给我当前状态和下一步建议，不要一次性跑满。"</div>
          </div>
        </div>
      \`;

      state.helpLoaded = true;
    }

    async function activate() {
      const code = $('code').value;
      if (!code) return toast('请输入激活码', 'error');
      const res = await api('activate', { code });
      if (res.success) { state.config = res.config; toast('激活成功！'); render(); }
      else toast(res.error || '激活失败', 'error');
    }

    async function deploy() {
      state.currentView = 'deploy';
      const installPath = $('path').value;
      const gatewayPort = parseInt($('port').value);
      const apiKey = $('apiKey').value;
      const isCustom = state.selectedProvider === 'custom';

      if (!apiKey) return toast('请输入 API Key', 'error');
      if (!isCustom && !state.selectedModel) return toast('请选择模型', 'error');

      const payload = {
        installPath,
        gatewayPort,
        apiKey,
        provider: state.selectedProvider,
        model: isCustom ? (($('deployCustomModelId')?.value || '').trim()) : state.selectedModel,
      };

      if (isCustom) {
        if (!payload.model) return toast('请输入 Model ID', 'error');
        payload.baseUrl = $('deployBaseUrl')?.value || '';
        payload.apiFormat = resolveApiFormatFromCompatibilityClient($('deployApiFormat')?.value || 'openai');
        payload.customModelId = payload.model;
      }

      $('main-card').innerHTML = \`
        <h2 class="card-title">🩺 部署前检查</h2>
        <div class="logs" id="deploy-logs" style="max-height:400px"><div class="log-line log-info">正在执行一次性预检...</div></div>
      \`;

      const health = await api('health-check', {
        installPath,
        gatewayPort,
      });

      const precheckLogsEl = $('deploy-logs');
      if (!health.success) {
        precheckLogsEl.innerHTML += '<div class="log-line log-error" style="margin-top:16px">❌ 预检失败: ' + (health.error || '未知错误') + '</div>';
        $('main-card').innerHTML += '<div class="actions" style="margin-top:20px"><button class="btn btn-primary" onclick="render()">返回</button></div>';
        return;
      }

      const checkLines = (health.checks || []).map(check => {
        const level = check.passed ? 'success' : (check.severity === 'warning' ? 'warning' : 'error');
        const icon = check.passed ? '✓' : (check.severity === 'warning' ? '!' : '✗');
        return '<div class="log-line log-' + level + '">[' + check.name + '] ' + icon + ' ' + check.message + '</div>';
      }).join('');
      precheckLogsEl.innerHTML = checkLines || '<div class="log-line log-info">未返回检查结果</div>';

      if (health.errors && health.errors.length > 0) {
        precheckLogsEl.innerHTML += '<div class="log-line log-error" style="margin-top:16px">❌ 发现阻塞问题，已停止部署。</div>';
        $('main-card').innerHTML += '<div class="actions" style="margin-top:20px"><button class="btn btn-primary" onclick="render()">返回修正</button></div>';
        return;
      }

      if (health.warnings && health.warnings.length > 0) {
        precheckLogsEl.innerHTML += '<div class="log-line log-warning" style="margin-top:16px">⚠️ 存在警告项，部署会继续。</div>';
      }

      $('main-card').innerHTML = \`
        <h2 class="card-title">📦 部署中...</h2>
        <div class="logs" id="deploy-logs" style="max-height:400px"><div class="log-line log-info">准备部署...</div></div>
      \`;

      const res = await api('deploy', payload);

      const logsEl = $('deploy-logs');
      if (res.logs) {
        logsEl.innerHTML = res.logs.map(l => \`<div class="log-line log-\${l.level || 'info'}"><span class="log-time">[\${l.time}]</span> \${l.message}</div>\`).join('');
      }

      if (res.success) {
        state.config = res.config;
        state.status = res.status;
        logsEl.innerHTML += '<div class="log-line log-success" style="margin-top:16px">🎉 部署完成！</div>';
        $('main-card').innerHTML += '<div class="actions" style="margin-top:20px"><button class="btn btn-primary" onclick="render()">进入控制面板</button></div>';
      } else {
        logsEl.innerHTML += '<div class="log-line log-error" style="margin-top:16px">❌ 部署失败: ' + (res.error || '未知错误') + '</div>';
        $('main-card').innerHTML += '<div class="actions" style="margin-top:20px"><button class="btn btn-primary" onclick="render()">重试</button></div>';
      }
    }

    async function start() {
      if (!state.config.apiKey) return toast('请先配置 API Key', 'error');
      toast('正在启动...');
      const res = await api('start');
      if (res.success) {
        if (res.status) state.status = res.status;
        else state.status.running = true;
        toast('服务已启动！');
        render();
      }
      else toast(res.error || '启动失败', 'error');
    }

    async function stop() {
      toast('正在停止...');
      const res = await api('stop');
      if (res.success) {
        state.status.running = false;
        state.status.state = 'stopped';
        toast('服务已停止');
        render();
      }
      else toast(res.error || '停止失败', 'error');
    }

    function normalizeEndpointIdClient(value) {
      return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    function normalizeCustomCompatibilityChoiceClient(value) {
      const normalized = String(value || '').trim().toLowerCase();
      if (normalized === 'anthropic' || normalized === '${ANTHROPIC_API_FORMAT}') return 'anthropic';
      if (normalized === 'unknown') return 'unknown';
      return 'openai';
    }

    function resolveApiFormatFromCompatibilityClient(value) {
      return normalizeCustomCompatibilityChoiceClient(value) === 'anthropic' ? '${ANTHROPIC_API_FORMAT}' : 'openai-completions';
    }

    function buildEndpointIdFromUrlClient(baseUrl) {
      try {
        const url = new URL(baseUrl);
        const host = url.hostname.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        const port = url.port ? '-' + url.port : '';
        return normalizeEndpointIdClient('custom-' + host + port) || 'custom';
      } catch {
        return 'custom';
      }
    }

    function resetCustomWizard() {
      state.customWizard = {
        verified: false,
        verifying: false,
        message: '',
        suggestedEndpointId: '',
        retryMode: '',
      };
    }

    function chooseCustomRetry(mode) {
      state.customWizard.retryMode = mode;
      state.customWizard.verified = false;
      const resultEl = $('test-result');
      if (mode === 'baseUrl' || mode === 'both') $('baseUrl')?.focus();
      if (mode === 'model' || mode === 'both') $('customModelId')?.focus();
      if (resultEl) {
        resultEl.style.display = 'block';
        resultEl.innerHTML = '<div class="note note-info">请修改刚才失败的地址或模型名称，然后再次点击“验证连接”。</div>';
      }
    }

    function syncCustomEndpointId() {
      const endpointInput = $('customEndpointId');
      const baseUrlInput = $('baseUrl');
      if (!endpointInput || !baseUrlInput) return;
      if (!endpointInput.value || endpointInput.value === state.customWizard.suggestedEndpointId) {
        const nextId = buildEndpointIdFromUrlClient(baseUrlInput.value);
        endpointInput.value = nextId;
        state.customWizard.suggestedEndpointId = nextId;
      }
    }

    function getGatewayOpenUrl() {
      const baseUrl = state.status.gatewayUrl || ('http://localhost:' + (state.config.gatewayPort || ${DEFAULT_GATEWAY_PORT}) + '/');
      const token = state.status.gatewayToken;
      if (!token) {
        return baseUrl;
      }
      return baseUrl.replace(/#.*$/, '') + '#token=' + encodeURIComponent(token);
    }

    function showConfig() {
      state.currentView = 'config';
      const card = $('main-card');
      const c = state.config;
      const currentProvider = PROVIDERS[state.selectedProvider] || PROVIDERS.custom;
      const isCustom = state.selectedProvider === 'custom';

      card.innerHTML = \`
        <h2 class="card-title">⚙️ API 配置</h2>
        <div class="hero-panel">
          <div class="hero-kicker">Configuration</div>
          <div class="hero-title">\${isCustom ? '按顺序完成自定义模型接入' : '快速完成常见模型配置'}</div>
          <div class="hero-copy">\${isCustom ? '请先填地址和密钥，再确认接口类型、模型名称并完成连接验证。验证通过后再保存。' : '常见服务只需要选择模型并填写 API Key，保存后就能直接使用。'}</div>
        </div>
        <div class="wizard-steps">
          <div class="wizard-step">
            <div class="wizard-step-title">第 1 步：选择 Provider</div>
            <div class="wizard-step-desc">先选择你要接入的模型服务。常见服务可快速配置，自定义服务需要手动验证连接。</div>
            <select id="configProvider" class="form-select" onchange="selectProvider(this.value)">
              \${renderProviderOptions()}
            </select>
          </div>

          <div class="wizard-step">
            <div class="wizard-step-title">第 2 步：提供凭证</div>
            <div class="wizard-step-desc">\${isCustom ? '自定义服务先填地址和密钥。' : '常见服务只需要这三个关键输入：服务、模型、API Key。'}</div>
            <div class="form-group">
              <label class="form-label">API Key</label>
              <input type="password" id="apiKey" class="form-input" value="\${c.apiKey || ''}" placeholder="请输入 API Key" \${isCustom ? 'oninput="resetCustomWizard()"' : ''}>
            </div>
            \${isCustom || currentProvider.type === 'proxy' ? \`
            <div class="form-group">
              <label class="form-label">Base URL</label>
              <input type="text" id="baseUrl" class="form-input" value="\${c.baseUrl || currentProvider.baseUrl || ''}" placeholder="例如: https://api.example.com/v1" \${isCustom ? 'oninput="syncCustomEndpointId(); resetCustomWizard()"' : ''}>
            </div>
            \` : ''}
          </div>

          \${isCustom ? \`
          <div class="wizard-step">
            <div class="wizard-step-title">第 3 步：验证自定义连接</div>
            <div class="wizard-step-desc">依次确认接口类型、模型名称，验证通过后再保存连接名称和模型别名。</div>
            <div class="form-group">
              <label class="form-label">接口类型</label>
              <select id="apiFormat" class="form-select" onchange="resetCustomWizard()">
                <option value="openai" \${normalizeCustomCompatibilityChoiceClient(c.apiFormat || 'openai') === 'openai' ? 'selected' : ''}>OpenAI-compatible</option>
                <option value="anthropic" \${normalizeCustomCompatibilityChoiceClient(c.apiFormat) === 'anthropic' ? 'selected' : ''}>Anthropic-compatible</option>
                <option value="unknown" \${normalizeCustomCompatibilityChoiceClient(c.apiFormat) === 'unknown' ? 'selected' : ''}>Unknown (自动探测)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Model ID</label>
              <input type="text" id="customModelId" class="form-input" value="\${c.customModelId || state.selectedModel || ''}" placeholder="例如: glm-5, claude-sonnet-4" oninput="resetCustomWizard()">
            </div>
            <div class="form-group">
              <label class="form-label">Endpoint ID</label>
              <input type="text" id="customEndpointId" class="form-input" value="\${c.customEndpointId || buildEndpointIdFromUrl(c.baseUrl || currentProvider.baseUrl || '') || 'custom'}" placeholder="例如: custom-open-bigmodel-cn">
            </div>
            <div class="form-group">
              <label class="form-label">模型别名（可选）</label>
              <input type="text" id="customModelAlias" class="form-input" value="\${c.customModelAlias || ''}" placeholder="例如: glm">
            </div>
            <div id="custom-wizard-result" style="margin-top:12px">
              \${state.customWizard.message ? \`<div class="note" style="background:\${state.customWizard.verified ? '#D1FAE5' : '#FEF2F2'};color:\${state.customWizard.verified ? '#065F46' : '#991B1B'}">\${state.customWizard.message}</div>\` : ''}
            </div>
          </div>
          \` : \`
          <div class="wizard-step">
            <div class="wizard-step-title">第 3 步：选择 Model</div>
            <div class="wizard-step-desc">选择你实际要使用的模型即可。</div>
            <select id="presetModel" class="form-select" onchange="selectModel(this.value)">
              \${renderModelOptions(state.selectedProvider, state.selectedModel)}
            </select>
          </div>
          \`}

          <div class="wizard-step">
            <div class="wizard-step-title">第 4 步：本地网关参数</div>
            <div class="form-group">
              <label class="form-label">服务端口号</label>
              <input type="number" id="gport" class="form-input" value="\${c.gatewayPort || ${DEFAULT_GATEWAY_PORT}}">
            </div>
          </div>
        </div>

        <div class="actions">
          <button class="btn btn-primary" onclick="saveConfig()">保存配置</button>
          <button class="btn btn-secondary" onclick="testConnection()">\${isCustom ? '验证 Endpoint' : '测试连接'}</button>
          <button class="btn btn-secondary" onclick="render()">取消</button>
        </div>

        <div id="test-result" style="margin-top:16px;display:none"></div>
      \`;
    }

    async function testConnection() {
      const resultEl = $('test-result');
      resultEl.style.display = 'block';
      resultEl.innerHTML = '<div style="text-align:center;padding:20px;color:#6B7280">🔄 正在测试连接...</div>';

      const isCustom = state.selectedProvider === 'custom';
      const requestedCompatibility = $('apiFormat')?.value || 'openai';
      const baseUrl = $('baseUrl')?.value;
      const model = $('customModelId')?.value || state.selectedModel;
      const endpointIdInput = $('customEndpointId');
      const suggestedEndpointId = buildEndpointIdFromUrlClient(baseUrl);

      if (endpointIdInput && !endpointIdInput.value) {
        endpointIdInput.value = suggestedEndpointId;
      }

      const attempt = async (apiFormatValue) => api('test-connection', {
        provider: state.selectedProvider,
        apiKey: $('apiKey')?.value,
        baseUrl,
        model,
        apiFormat: apiFormatValue,
      });

      let res;
      let resolvedCompatibility = requestedCompatibility;

      if (isCustom && requestedCompatibility === 'unknown') {
        const openaiRes = await attempt('openai-completions');
        if (openaiRes.success) {
          res = openaiRes;
          resolvedCompatibility = 'openai';
        } else {
          const anthropicRes = await attempt('${ANTHROPIC_API_FORMAT}');
          res = anthropicRes;
          if (anthropicRes.success) {
            resolvedCompatibility = 'anthropic';
          }
        }
      } else {
        res = await attempt(resolveApiFormatFromCompatibilityClient(requestedCompatibility));
      }

      if (res.success) {
        if (isCustom) {
          state.customWizard.verified = true;
          state.customWizard.retryMode = '';
          state.customWizard.message = '验证成功。当前地址、接口类型和模型名称可以正常使用，保存后会直接按这组配置启动。';
          state.customWizard.suggestedEndpointId = suggestedEndpointId;
          if ($('apiFormat')) $('apiFormat').value = resolvedCompatibility;
        }
        resultEl.innerHTML = \`<div class="note" style="background:#D1FAE5;color:#065F46">✅ 连接成功！模型响应正常</div>\`;
      } else {
        if (isCustom) {
          state.customWizard.verified = false;
          state.customWizard.retryMode = 'baseUrl';
          state.customWizard.message = '验证失败：' + (res.error || '未知错误');
        }
        resultEl.innerHTML = \`
          <div class="note" style="background:#FEE2E2;color:#991B1B">❌ 连接失败：\${res.error || '未知错误'}</div>
          \${isCustom ? \`
            <div class="actions" style="margin-top:12px">
              <button class="btn btn-secondary btn-small" onclick="chooseCustomRetry('baseUrl')">修改 Base URL</button>
              <button class="btn btn-secondary btn-small" onclick="chooseCustomRetry('model')">修改 Model ID</button>
              <button class="btn btn-secondary btn-small" onclick="chooseCustomRetry('both')">同时修改两者</button>
            </div>
          \` : ''}
        \`;
      }
    }

    function showHelp() {
      switchTab('help');
    }

    async function saveConfig() {
      const provider = PROVIDERS[state.selectedProvider] || PROVIDERS.custom;
      const isCustom = state.selectedProvider === 'custom';
      const selectedPresetModel = $('presetModel')?.value || state.selectedModel;

      const configData = {
        apiKey: $('apiKey')?.value || '',
        gatewayPort: parseInt($('gport')?.value || String(DEFAULT_GATEWAY_PORT)),
        provider: state.selectedProvider,
        model: isCustom ? ($('customModelId')?.value || state.selectedModel) : selectedPresetModel,
      };

      // 中转服务和自定义配置需要保存额外信息
      if (isCustom || provider.type === 'proxy') {
        configData.baseUrl = $('baseUrl')?.value || provider.baseUrl || '';
      }

      if (isCustom) {
        if (!state.customWizard.verified) {
          return toast('请先完成 Endpoint 验证，再保存自定义模型配置', 'error');
        }
        configData.apiFormat = resolveApiFormatFromCompatibilityClient($('apiFormat')?.value || 'openai');
        configData.customModelId = $('customModelId')?.value || state.selectedModel;
        configData.customEndpointId = $('customEndpointId')?.value || buildEndpointIdFromUrlClient($('baseUrl')?.value || '');
        configData.customModelAlias = $('customModelAlias')?.value || '';
      }

      const res = await api('config', configData);
      if (res.success) { state.config = res.config; toast('配置已保存！'); render(); }
      else toast(res.error || '保存失败', 'error');
    }

    async function uninstallOpenClaw() {
      const confirmed = confirm('这会停止当前 OpenClaw 服务，并删除安装目录、运行缓存、临时日志和部署配置。产品激活状态会保留。确定继续吗？');
      if (!confirmed) return;

      showLoading('正在彻底卸载 OpenClaw...');
      const res = await api('uninstall-openclaw', {}, 180000);
      if (res.success) {
        state.config = res.config || {};
        state.status = res.status || { running: false, installed: false };
        toast(res.message || 'OpenClaw 已卸载');
        render();
      } else {
        toast(res.error || '卸载失败', 'error');
        render();
      }
    }

    async function updateOpenClaw() {
      toast('检查更新中...');
      const res = await api('update-openclaw');
      if (res.success) toast(res.message || '更新成功！');
      else toast(res.error || '更新失败', 'error');
    }

    function openGateway() {
      window.open(getGatewayOpenUrl(), '_blank');
    }

    async function copyGatewayLink() {
      const url = getGatewayOpenUrl();
      try {
        await navigator.clipboard.writeText(url);
        toast('自动认证链接已复制');
      } catch {
        toast('复制失败，请手动打开 OpenClaw', 'error');
      }
    }

    async function pollLogs() {
      if (!state.status.running) return;
      const res = await api('logs');
      if (res.logs) {
        const el = $('logs');
        if (el) { el.innerHTML = res.logs.map(l => \`<div class="log-line log-\${l.level || 'info'}"><span class="log-time">[\${l.time}]</span> \${l.message}</div>\`).join(''); }
      }
      setTimeout(pollLogs, 2000);
    }

    render();
    setInterval(async () => {
      const res = await api('status');
      if (res.status) {
        state.status = res.status;
        if (state.currentView === 'dashboard') {
          render();
        }
      }
    }, 5000);
  </script>
</body>
</html>`;
}

// ============================================
// API 处理
// ============================================

// 异步版本的 handleAPI，支持健康检查等异步操作
async function handleAPIAsync(action: string, data: Record<string, unknown>, config: Record<string, unknown>): Promise<Record<string, unknown>> {
  switch (action) {
    case 'activate':
      return activateLicense(data.code as string, config);

    case 'config':
      return handleConfigAsync(data, config);

    case 'deploy':
      return handleDeploy(data, config);

    case 'test-connection':
      return handleTestConnection(data, config);

    case 'health-check':
      // 执行部署前健康检查
      try {
        const healthResult = await performHealthChecks({
          installPath: (data.installPath as string) || path.join(os.homedir(), 'openclaw'),
          gatewayPort: (data.gatewayPort as number) || DEFAULT_GATEWAY_PORT,
          requiredDiskSpace: 500 * 1024 * 1024, // 500MB
        });
        return { success: true, ...healthResult };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }

    case 'check-port':
      try {
        const port = (data.port as number) || DEFAULT_GATEWAY_PORT;
        const result = await checkPortAvailability(port);
        return { success: true, ...result };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }

    case 'check-network':
      try {
        const results = await checkNetworkConnectivity();
        return { success: true, results };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }

    case 'start':
      return handleStart(config);

    case 'status':
      return { success: true, status: getGatewayRuntimeStatus(config) };

    case 'license':
      return verifyLicenseStatus(config);

    case 'skills/installed':
      return { success: true, skills: await getInstalledOpenClawSkillsFromStatus(config) };

    case 'skills/install':
      return handleSkillInstall(data, config);

    case 'skills/uninstall':
      return handleSkillUninstall(data, config);

    default:
      // 其他操作使用同步处理
      return handleAPI(action, data, config);
  }
}

function handleAPI(action: string, data: Record<string, unknown>, config: Record<string, unknown>): Record<string, unknown> {
  switch (action) {
    case 'stop':
      return handleStop();

    case 'logs':
      return { success: true, logs };

    case 'update-openclaw':
      return handleUpdateOpenClaw(config);

    case 'uninstall-openclaw':
      return handleUninstallOpenClaw(config);

    case 'system-info':
      return {
        success: true,
        info: {
          platform: os.platform(),
          arch: os.arch(),
          nodeVersion: process.versions.node,
          dependencies: checkDependencies(),
        },
      };

    // ============================================
    // 技能市场 API
    // ============================================

    case 'skills/popular':
      return { success: true, skills: [], marketUrl: CLAWHUB_MARKET_URL };

    case 'skills/search':
      return { success: true, skills: [], marketUrl: CLAWHUB_MARKET_URL };

    default:
      return { success: false, error: `未知操作: ${action}` };
  }
}

// ============================================
// 部署处理（带健康检查和回滚）
// ============================================

async function handleDeploy(data: Record<string, unknown>, config: Record<string, unknown>): Promise<Record<string, unknown>> {
  const installPath = (data.installPath as string) || path.join(os.homedir(), 'openclaw');
  const gatewayPort = (data.gatewayPort as number) || DEFAULT_GATEWAY_PORT;
  logs = [];

  const addLog = (msg: string, level: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    appendLog(level, msg);
    console.log(`[部署] ${msg}`);
  };

  try {
    addLog('开始部署...');

    // 1. 基本验证
    if (!data.apiKey) {
      addLog('错误: 未提供 API Key', 'error');
      return { success: false, error: '请输入 API Key', logs };
    }
    if (!data.model) {
      addLog('错误: 未选择模型', 'error');
      return { success: false, error: '请选择模型', logs };
    }

    // 2. 一次性预检
    addLog('执行部署前预检...');
    const precheck = await performHealthChecks({
      installPath,
      gatewayPort,
      requiredDiskSpace: 500 * 1024 * 1024,
    });
    precheck.checks.forEach((check) => {
      addLog(`[预检] ${check.name}: ${check.message}`, check.passed ? 'success' : check.severity === 'warning' ? 'warning' : 'error');
    });
    if (precheck.errors.length > 0) {
      return { success: false, error: precheck.errors[0], logs };
    }

    // 3. 检查依赖并自动补齐可恢复项
    addLog('检查系统依赖...');
    const deps = checkDependencies();
    if (!deps.node.valid) {
      addLog(`错误: Node.js 版本过低 (当前: v${deps.node.version}, 需要: v18.0.0)`, 'error');
      return { success: false, error: 'Node.js 版本过低，请升级到 v18 或更高版本', logs };
    }
    if (!deps.git) {
      const gitInstall = ensureDependencyInstalled('git', addLog);
      if (!gitInstall.success) {
        return {
          success: false,
          error: gitInstall.manual || '未找到 Git，请先安装 Git 后重试',
          logs,
        };
      }
    }
    if (!deps.npm) {
      addLog('错误: 未找到 npm', 'error');
      return { success: false, error: '未找到 npm，请先安装 Node.js: https://nodejs.org', logs };
    }
    let pnpmAvailable = deps.pnpm;
    addLog(`依赖检查通过 ✓ (Node: v${deps.node.version}, Git: ✓, npm: ✓, pnpm: ${pnpmAvailable ? '✓' : '✗'})`, 'success');

    // 4. 保存配置
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

    // 5. 克隆/更新仓库（支持镜像源自动切换）
    if (!fs.existsSync(installPath)) {
      let cloneSuccess = false;

      // 尝试多个镜像源
      for (let i = 0; i < GITHUB_MIRRORS.length; i++) {
        const mirror = GITHUB_MIRRORS[i];
        const repoUrl = getMirrorRepo(i);

        addLog(`尝试克隆 (${mirror.name})...`);

        const cloneResult = runCommand(`git clone --depth 1 ${repoUrl} "${installPath}"`, process.cwd(), {
          timeout: 300000, // 5分钟
        });

        if (cloneResult.success) {
          addLog(`仓库克隆成功 ✓ (使用: ${mirror.name})`, 'success');
          cloneSuccess = true;
          break;
        } else {
          addLog(`${mirror.name} 克隆失败，尝试下一个...`, 'warning');
          // 清理失败的目录
          if (fs.existsSync(installPath)) {
            try {
              fs.rmSync(installPath, { recursive: true, force: true });
            } catch {}
          }
        }
      }

      if (!cloneSuccess) {
        addLog('所有镜像源均克隆失败，请检查网络', 'error');
        return { success: false, error: '网络连接失败，请检查网络后重试', logs };
      }
    } else {
      const existingStat = fs.statSync(installPath);
      if (!existingStat.isDirectory()) {
        addLog('错误: 安装路径指向一个文件', 'error');
        return { success: false, error: '安装路径指向一个文件，请改成目录路径', logs };
      }
      if (!isOpenClawProjectDir(installPath)) {
        const existingEntries = fs.readdirSync(installPath);
        if (existingEntries.length === 0) {
          addLog('目录存在但为空，将在该目录中克隆 OpenClaw...');
          let cloneSuccess = false;
          for (let i = 0; i < GITHUB_MIRRORS.length; i++) {
            const mirror = GITHUB_MIRRORS[i];
            const repoUrl = getMirrorRepo(i);
            addLog(`尝试克隆 (${mirror.name})...`);
            const cloneResult = runCommand(`git clone --depth 1 ${repoUrl} "${installPath}"`, process.cwd(), {
              timeout: 300000,
            });
            if (cloneResult.success) {
              addLog(`仓库克隆成功 ✓ (使用: ${mirror.name})`, 'success');
              cloneSuccess = true;
              break;
            }
            addLog(`${mirror.name} 克隆失败，尝试下一个...`, 'warning');
          }
          if (!cloneSuccess) {
            addLog('所有镜像源均克隆失败，请检查网络', 'error');
            return { success: false, error: '网络连接失败，请检查网络后重试', logs };
          }
        } else {
          addLog('错误: 目录已存在，但不是 OpenClaw 项目目录', 'error');
          return { success: false, error: '安装路径已存在且不是 OpenClaw 项目，请换一个空目录或正确的 OpenClaw 目录', logs };
        }
      } else {
      addLog('目录已存在，更新中...');
      const pullResult = runCommand('git pull', installPath, { ignoreError: true });
      if (pullResult.success) {
        addLog('更新成功 ✓', 'success');
      } else {
        addLog('更新失败，使用现有代码', 'warning');
      }
      }
    }

    const projectPackageManager = detectProjectPackageManager(installPath);
    if (projectPackageManager === 'pnpm' && !pnpmAvailable) {
      const pnpmInstall = ensureDependencyInstalled('pnpm', addLog);
      if (!pnpmInstall.success) {
        return {
          success: false,
          error: pnpmInstall.manual || '当前 OpenClaw 源码要求使用 pnpm，请先安装 pnpm 后重试',
          logs,
        };
      }
      pnpmAvailable = true;
    }

    // 6. 安装依赖
    const installPlan = getInstallCommand(installPath);
    addLog(`安装依赖 (${installPlan.pm})...`);
    const installResult = runCommand(installPlan.command, installPath, {
      timeout: 600000, // 10分钟
      retries: 2,
    });
    if (!installResult.success) {
      addLog(`依赖安装失败: ${installResult.stderr}`, 'error');
      return { success: false, error: installResult.stderr || '依赖安装失败', logs };
    }
    addLog('依赖安装成功 ✓', 'success');

    // 7. 构建
    addLog('构建项目...');
    const buildPlan = getBuildCommand(installPath);
    const buildResult = runCommand(buildPlan.command, installPath, { ignoreError: true, timeout: 300000 });
    if (buildResult.success) {
      addLog('构建成功 ✓', 'success');
    } else {
      addLog('构建跳过（可能无构建脚本）', 'warning');
    }

    // 8. 保存最终配置
    config.installPath = installPath;
    saveConfig(config);

    addLog('🎉 部署完成！', 'success');

    return { success: true, config, status: getGatewayRuntimeStatus(config), logs };
  } catch (e) {
    const error = e as Error;
    addLog(`❌ 部署失败: ${error.message}`, 'error');
    logError(error, 'deploy');
    return { success: false, error: getUserFriendlyMessage(error), logs };
  }
}

// ============================================
// 配置处理
// ============================================

async function handleConfigAsync(data: Record<string, unknown>, config: Record<string, unknown>): Promise<Record<string, unknown>> {
  // 验证端口号
  if (data.gatewayPort !== undefined) {
    const port = data.gatewayPort as number;
    if (port < 1024 || port > 65535) {
      return { success: false, error: getUserFriendlyMessage(Errors.validation('端口号必须在 1024-65535 之间', 'gatewayPort')) };
    }

    const availability = await checkPortAvailability(port);
    if (!availability.available) {
      return { success: false, error: availability.message || '端口已被占用，请更换其他端口' };
    }
  }

  // 验证 API Key（基本格式检查）
  if (data.apiKey !== undefined) {
    const apiKey = data.apiKey as string;
    if (apiKey && apiKey.length < 10) {
      return { success: false, error: 'API Key 格式不正确' };
    }
  }

  // 保存基本配置
  if (data.apiKey !== undefined) config.apiKey = data.apiKey;
  if (data.gatewayPort !== undefined) config.gatewayPort = data.gatewayPort;
  if (data.provider) config.provider = data.provider;
  if (data.model) config.model = data.model;

  // 保存高级配置
  if (data.baseUrl !== undefined) config.baseUrl = data.baseUrl;
  if (data.apiFormat !== undefined) config.apiFormat = normalizeApiFormat(data.apiFormat);
  if (data.customModelId !== undefined) config.customModelId = data.customModelId;
  if (data.customEndpointId !== undefined) config.customEndpointId = normalizeEndpointId(data.customEndpointId) || 'custom';
  if (data.customModelAlias !== undefined) config.customModelAlias = String(data.customModelAlias || '').trim();
  if (data.contextWindow !== undefined) config.contextWindow = data.contextWindow;
  if (data.maxTokens !== undefined) config.maxTokens = data.maxTokens;
  if (data.licenseServerUrl !== undefined) config.licenseServerUrl = data.licenseServerUrl;
  if (data.purchaseUrl !== undefined) config.purchaseUrl = data.purchaseUrl;

  saveConfig(config);
  return { success: true, config };
}

// API 连接测试
async function handleTestConnection(data: Record<string, unknown>, config: Record<string, unknown>): Promise<Record<string, unknown>> {
  const providerKey = String(data.provider || config.provider || 'custom') as keyof typeof PROVIDERS;
  const provider = PROVIDERS[providerKey] || PROVIDERS.custom;
  const apiKey = (data.apiKey || config.apiKey) as string;
  const baseUrl = (data.baseUrl || config.baseUrl || provider.baseUrl) as string;
  const model = (data.model || config.model) as string;
  const apiFormat = normalizeApiFormat(data.apiFormat || config.apiFormat || provider.apiFormat);

  if (!apiKey) {
    return { success: false, error: '请先输入 API Key' };
  }

  try {
    // 按 OpenClaw 源码兼容格式发送最小探活请求
    const https = require('https');
    const http = require('http');
    const client = baseUrl.startsWith('https') ? https : http;
    const isAnthropic = apiFormat === ANTHROPIC_API_FORMAT;
    const resolvedBaseUrl = resolveCustomBaseUrlForConfig(baseUrl, model);
    const requestBaseUrl = isAnthropic ? getAnthropicBaseUrl(resolvedBaseUrl) : resolvedBaseUrl;
    const isAzureOpenAi = !isAnthropic && isAzureUrl(baseUrl);
    const testUrl = buildEndpointUrl(requestBaseUrl, isAnthropic ? 'messages' : 'chat/completions');
    if (isAzureOpenAi) {
      testUrl.searchParams.set('api-version', '2024-10-21');
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (isAnthropic) {
      headers['anthropic-version'] = '2023-06-01';
      headers['x-api-key'] = apiKey;
    } else if (isAzureOpenAi) {
      headers['api-key'] = apiKey;
    } else {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const testBody = JSON.stringify(
      isAnthropic
        ? {
            model,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 1,
            stream: false,
          }
        : isAzureOpenAi
          ? {
              messages: [{ role: 'user', content: 'hi' }],
              max_completion_tokens: 5,
              stream: false,
            }
        : {
            model,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 1,
            stream: false,
          }
    );

    return new Promise((resolve) => {
      const req = client.request(
        testUrl,
        {
          method: 'POST',
          headers,
          timeout: 15000,
        },
        (res: import('http').IncomingMessage) => {
          let body = '';
          res.on('data', (chunk: Buffer) => (body += chunk));
          res.on('end', () => {
            if (res.statusCode && res.statusCode < 500) {
              if (res.statusCode === 200 || res.statusCode === 201) {
                resolve({ success: true });
              } else if (res.statusCode === 401) {
                resolve({ success: false, error: 'API Key 无效' });
              } else if (res.statusCode === 404) {
                resolve({ success: false, error: '模型不存在或 API 地址错误' });
              } else {
                resolve({ success: false, error: `请求失败: ${res.statusCode}` });
              }
            } else {
              resolve({ success: false, error: `服务器错误: ${res.statusCode}` });
            }
          });
        }
      );

      req.on('error', (e: Error) => {
        resolve({ success: false, error: `连接失败: ${e.message}` });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: '连接超时，请检查网络' });
      });

      req.write(testBody);
      req.end();
    });
  } catch (e) {
    const error = e as Error;
    return { success: false, error: `测试失败: ${error.message}` };
  }
}

// ============================================
// 启动处理
// ============================================

async function handleStart(config: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!config.apiKey) {
    return { success: false, error: '请先配置 API Key' };
  }
  if (!config.installPath || !isOpenClawProjectDir(config.installPath as string)) {
    return { success: false, error: '请先部署' };
  }
  if (gatewayStatus === 'starting' || gatewayStatus === 'running') {
    return { success: true, message: '服务已在运行中' };
  }

  const runtimeReadiness = checkOpenClawRuntimeReadiness(config.installPath as string);
  if (!runtimeReadiness.ready) {
    return { success: false, error: runtimeReadiness.error || 'OpenClaw 运行环境未就绪' };
  }

  try {
    gatewayStatus = 'starting';
    const providerKey = String(config.provider || 'custom') as keyof typeof PROVIDERS;
    const provider = PROVIDERS[providerKey] || PROVIDERS.custom;
    const baseUrl = (config.baseUrl || provider.baseUrl) as string;
    const apiFormat = normalizeApiFormat(config.apiFormat || provider.apiFormat || 'openai-completions');
    const model = (config.model || config.customModelId || '') as string;
    const customModelAlias = String(config.customModelAlias || '').trim();
    const gatewayPort = Number(config.gatewayPort || DEFAULT_GATEWAY_PORT);

    const availability = await checkPortAvailability(gatewayPort);
    if (!availability.available) {
      gatewayStatus = 'stopped';
      return { success: false, error: availability.message || '端口已被占用，请更换后重试' };
    }

    // 生成 OpenClaw 配置文件
    let openclawConfig: Record<string, unknown> = {
      models: {
        mode: 'merge',
        providers: {} as Record<string, unknown>,
      },
    };

    // 根据提供商类型配置
    if (config.provider === 'custom' || provider.type === 'proxy') {
      const providerBaseUrl = resolveCustomBaseUrlForConfig(baseUrl, model);
      if (config.provider === 'custom') {
        openclawConfig = buildCustomProviderConfig(
          {
            ...config,
            apiFormat,
            baseUrl: providerBaseUrl,
            customModelAlias,
          },
          providerBaseUrl,
          model
        );
      } else {
        const proxyProviderId = normalizeEndpointId(config.customEndpointId) || buildEndpointIdFromUrl(providerBaseUrl) || 'custom';
        (openclawConfig.models as Record<string, unknown>).providers = {
          [proxyProviderId]: {
            baseUrl: providerBaseUrl,
            apiKey: config.apiKey,
            api: apiFormat,
            models: [
              {
                id: model,
                name: model,
                contextWindow: CUSTOM_PROVIDER_DEFAULT_CONTEXT_WINDOW,
                maxTokens: CUSTOM_PROVIDER_DEFAULT_MAX_TOKENS,
                input: ['text'],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                reasoning: false,
              },
            ],
          },
        };
      }
    } else {
      // 直连服务使用环境变量
      (openclawConfig.models as Record<string, unknown>).providers = {
        default: {
          provider: config.provider,
          modelId: model,
        },
      };
    }

    // 写入配置文件
    const configDir = path.join(config.installPath as string, '.claude');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    const configPath = path.join(configDir, 'openclaw.json');
    fs.writeFileSync(configPath, JSON.stringify(openclawConfig, null, 2));
    console.log(`[配置] 已写入: ${configPath}`);

    // 环境变量
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: String(gatewayPort),
      [provider.envKey]: String(config.apiKey || ''),
      OPENAI_BASE_URL: baseUrl,
      API_KEY: String(config.apiKey || ''),
      API_PROVIDER: String(config.provider || ''),
      MODEL: model,
    };

    if (provider.envKey !== 'OPENAI_API_KEY') {
      env.OPENAI_API_KEY = String(config.apiKey || '');
    }

    const startCommand = getOpenClawStartCommand(config.installPath as string, gatewayPort);
    appendLog('info', `启动命令: ${startCommand}`);

    const parsedCommand = parseCommandForSpawn(startCommand);
    if (!parsedCommand.file) {
      gatewayStatus = 'stopped';
      return { success: false, error: '无法解析 OpenClaw 启动命令' };
    }

    const processRef = spawn(parsedCommand.file, parsedCommand.args, {
      cwd: config.installPath as string,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    gatewayProcess = processRef;
    let startupSettled = false;
    let lastStderr = '';

    const startupResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const settle = (result: { ok: boolean; error?: string }) => {
        if (startupSettled) return;
        startupSettled = true;
        resolve(result);
      };

      processRef.once('error', (err: Error) => {
        settle({ ok: false, error: `进程启动失败: ${err.message}` });
      });

      processRef.once('exit', (code: number | null) => {
        const details = lastStderr || (code !== null ? `进程已退出 (code: ${code})` : '进程启动后立即退出');
        settle({ ok: false, error: details });
      });

      setTimeout(() => settle({ ok: true }), 1200);
    });

    processRef.stdout?.on('data', (d: Buffer) => {
      appendLog('info', d.toString().trim());
    });

    processRef.stderr?.on('data', (d: Buffer) => {
      lastStderr = d.toString().trim() || lastStderr;
      appendLog('error', d.toString().trim());
    });

    processRef.on('spawn', () => {
      gatewayStatus = 'running';
    });

    processRef.on('error', (err: Error) => {
      gatewayStatus = 'stopped';
      if (gatewayProcess === processRef) {
        gatewayProcess = null;
      }
      appendLog('error', `进程错误: ${err.message}`);
      console.error('[进程错误]', err);
    });

    processRef.on('exit', (code: number | null, signal: string | null) => {
      if (gatewayProcess === processRef) {
        gatewayProcess = null;
      }
      gatewayStatus = 'stopped';
      if (code !== 0 && code !== null) {
        appendLog('warning', `进程已退出 (code: ${code})`);
      }
      if (signal) {
        appendLog('info', `进程已结束 (signal: ${signal})`);
      }
    });

    if (!startupResult.ok) {
      if (gatewayProcess === processRef) {
        gatewayProcess = null;
      }
      gatewayStatus = 'stopped';
      return { success: false, error: startupResult.error || 'OpenClaw 启动失败' };
    }

    return { success: true, status: getGatewayRuntimeStatus(config) };
  } catch (e) {
    gatewayStatus = 'stopped';
    const error = e as Error;
    logError(error, 'start');
    return { success: false, error: getUserFriendlyMessage(error) };
  }
}

// ============================================
// 停止处理
// ============================================

function handleStop(): Record<string, unknown> {
  if (gatewayProcess) {
    try {
      gatewayStatus = 'stopping';
      const processRef = gatewayProcess;
      const killed = processRef.kill();
      if (!killed) {
        gatewayStatus = 'running';
        return { success: false, error: '停止信号发送失败，请稍后重试' };
      }
      gatewayProcess = null;
      gatewayStatus = 'stopped';
      appendLog('info', '服务已停止');
    } catch (e) {
      gatewayStatus = 'running';
      console.error('[停止错误]', e);
      return { success: false, error: `停止失败: ${(e as Error).message}` };
    }
  }
  return { success: true };
}

// ============================================
// 更新处理
// ============================================

function handleUpdateOpenClaw(config: Record<string, unknown>): Record<string, unknown> {
  if (!config.installPath || !isOpenClawProjectDir(config.installPath as string)) {
    return { success: false, error: '请先部署' };
  }

  try {
    // 获取远程版本
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

    // 更新
    const resetResult = runCommand(`git reset --hard ${remoteRef}`, config.installPath as string);
    if (!resetResult.success) {
      return { success: false, error: resetResult.stderr || '更新失败' };
    }

    const projectPackageManager = detectProjectPackageManager(config.installPath as string);
    if (projectPackageManager === 'pnpm' && !checkCommand('pnpm')) {
      return { success: false, error: '当前 OpenClaw 源码要求使用 pnpm，请先安装 pnpm 后再更新' };
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
    logError(error, 'update-openclaw');
    return { success: false, error: getUserFriendlyMessage(error) };
  }
}

function handleUninstallOpenClaw(config: Record<string, unknown>): Record<string, unknown> {
  const installPath = String(config.installPath || '').trim();
  const removedPaths: string[] = [];

  if (!installPath && !fs.existsSync(path.join(os.homedir(), '.openclaw'))) {
    clearOpenClawDeploymentConfig(config);
    saveConfig(config);
    return {
      success: true,
      message: '当前没有检测到可卸载的 OpenClaw 部署。部署配置已清空。',
      removedPaths: [],
      config,
      status: getGatewayRuntimeStatus(config),
    };
  }

  try {
    handleStop();

    if (installPath) {
      removePathIfExists(installPath, removedPaths);
    }

    removePathIfExists(path.join(os.homedir(), '.openclaw'), removedPaths);
    removePathIfExists(path.join(os.tmpdir(), 'openclaw'), removedPaths);

    clearOpenClawDeploymentConfig(config);
    saveConfig(config);
    logs = [];

    return {
      success: true,
      message: 'OpenClaw 已彻底卸载。安装目录、运行缓存、临时日志和部署配置都已清理。',
      removedPaths,
      config,
      status: getGatewayRuntimeStatus(config),
    };
  } catch (e) {
    const error = e as Error;
    logError(error, 'uninstall-openclaw');
    return { success: false, error: `卸载失败: ${error.message}` };
  }
}

// ============================================
// 技能安装处理
// ============================================

async function handleSkillInstall(data: Record<string, unknown>, config: Record<string, unknown>): Promise<Record<string, unknown>> {
  const skillId = String(data.skill || '').trim();
  if (!skillId) {
    return { success: false, error: '请指定技能名称' };
  }
  if (!/^[a-z0-9][a-z0-9-_./]{0,127}$/i.test(skillId)) {
    return { success: false, error: '技能名称格式不正确' };
  }
  if (!config.installPath || !fs.existsSync(config.installPath as string)) {
    return { success: false, error: '请先部署 OpenClaw' };
  }
  if (!isOpenClawProjectDir(config.installPath as string)) {
    return { success: false, error: '当前安装路径不是有效的 OpenClaw 项目，请重新部署' };
  }

  try {
    console.log(`[技能] 正在安装: ${skillId}`);
    const result = runCommandArgs(
      'npx',
      config.installPath as string,
      {
        args: ['clawhub@latest', 'install', skillId],
        timeout: 120000,
      }
    );

    if (result.success) {
      const installedSkills = await getInstalledOpenClawSkillsFromStatus(config);
      const installed = installedSkills.find((skill) => skill.id === skillId);
      if (!installed) {
        return {
          success: false,
          error: `安装命令已执行，但 OpenClaw 当前技能列表中还没有识别到 "${skillId}"。请检查该 skill id 是否正确，并在 OpenClaw 里执行一次技能刷新。`,
        };
      }
      console.log(`[技能] 安装成功: ${skillId}`);
      return { success: true, message: `技能 "${skillId}" 安装成功，来源：${installed.source}` };
    } else {
      return { success: false, error: result.stderr || '安装失败' };
    }
  } catch (e) {
    const error = e as Error;
    console.error(`[技能] 安装失败: ${error.message}`);
    return { success: false, error: `安装失败: ${error.message}` };
  }
}

async function handleSkillUninstall(data: Record<string, unknown>, config: Record<string, unknown>): Promise<Record<string, unknown>> {
  const skillId = String(data.skill || '').trim();
  if (!skillId) {
    return { success: false, error: '请指定技能名称' };
  }
  if (!/^[a-z0-9][a-z0-9-_./]{0,127}$/i.test(skillId) || skillId.includes('..')) {
    return { success: false, error: '技能名称格式不正确' };
  }
  if (!config.installPath) {
    return { success: false, error: '请先部署 OpenClaw' };
  }
  if (!isOpenClawProjectDir(config.installPath as string)) {
    return { success: false, error: '当前安装路径不是有效的 OpenClaw 项目，请重新部署' };
  }

  try {
    const installedSkill = (await getInstalledOpenClawSkillsFromStatus(config)).find((skill) => skill.id === skillId);
    if (!installedSkill) {
      return { success: false, error: '技能未安装' };
    }
    if (!installedSkill.removable) {
      return { success: false, error: `技能 "${skillId}" 来自 ${installedSkill.source}，当前不支持在龙虾助手里直接卸载` };
    }

    const resolved = resolveRemovableSkillPath(config, skillId);
    if (!resolved) {
      return { success: false, error: `已识别到技能 "${skillId}"，但未找到可删除的技能目录` };
    }

    fs.rmSync(resolved.path, { recursive: true, force: true });
    console.log(`[技能] 已卸载: ${skillId}`);
    return { success: true, message: `技能 "${skillId}" 已从 ${resolved.source} 卸载` };
  } catch (e) {
    const error = e as Error;
    return { success: false, error: `卸载失败: ${error.message}` };
  }
}

// ============================================
// Web 服务器
// ============================================

function createServer(config: Record<string, unknown>) {
  return http.createServer((req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
    const url = new NodeURL(req.url || '/', `http://${req.headers.host}`);

    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 处理 OPTIONS 预检请求
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      const action = url.pathname.replace('/api/', '');
      let body = '';

      req.on('data', (chunk: Buffer) => {
        body += chunk;
        // 限制请求体大小 (1MB)
        if (body.length > 1024 * 1024) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '请求体过大' }));
          req.destroy();
        }
      });

      req.on('end', async () => {
        try {
          const data = body ? JSON.parse(body) : {};

          // 使用异步处理
          const result = await handleAPIAsync(action, data, config);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (e) {
          const error = e as Error;
          console.error('[API错误]', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: getUserFriendlyMessage(error) }));
        }
      });

      req.on('error', (err: Error) => {
        console.error('[请求错误]', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: '请求处理失败' }));
      });

      return;
    }

    if (url.pathname === '/') {
      const status = getGatewayRuntimeStatus(config);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getHTML(config, status));
      return;
    }

    // 健康检查端点
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        version: VERSION,
        uptime: process.uptime(),
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: '未找到' }));
  });
}

// ============================================
// 自动更新（龙虾助手本身）- 从 GitHub Releases 拉取
// ============================================

interface UpdateResult {
  checked: boolean;
  updated: boolean;
  error?: string;
}

async function checkSelfUpdate(): Promise<UpdateResult> {
  if (!IS_PACKAGED_RUNTIME) {
    return { checked: false, updated: false };
  }

  console.log('  检查更新中...');

  try {
    // 1. 从 release API 镜像源获取最新版本；不要先用 GitHub 直连结果把镜像链路短路掉
    let releaseInfo: { tag_name: string; assets?: Array<{ name: string; browser_download_url: string }> } | null = null;
    let usedMirror = '';

    for (let i = 0; i < GITHUB_MIRRORS.length; i++) {
      const mirror = GITHUB_MIRRORS[i];
      const apiUrl = getMirrorReleaseApi(i);

      console.log(`  尝试 ${mirror.name}...`);

      const releaseResult = await fetchWithRetry<{ tag_name: string; assets?: Array<{ name: string; browser_download_url: string }> }>(
        apiUrl,
        {
          method: 'GET',
          headers: { 'User-Agent': 'Lobster-Assistant' },
        },
        {
          timeout: 15000,
          maxRetries: 1,
        }
      );

      if (releaseResult.success && releaseResult.data?.tag_name) {
        releaseInfo = releaseResult.data;
        usedMirror = mirror.name;
        console.log(`  使用 ${mirror.name} 获取版本信息成功`);
        break;
      }
    }

    if (!releaseInfo) {
      console.log('  所有镜像源均无法获取版本信息，跳过更新');
      return { checked: false, updated: false, error: '获取版本信息失败' };
    }

    const latestVersion = releaseInfo.tag_name.replace(/^v/, '');
    if (latestVersion === VERSION) {
      console.log('  已是最新版本');
      return { checked: true, updated: false };
    }

    console.log(`  发现新版本 v${latestVersion}，正在更新...`);

    // 2. 确定当前平台的二进制文件名
    const platform = os.platform();
    const arch = os.arch();
    let assetName: string;
    if (platform === 'darwin' && arch === 'arm64') {
      assetName = 'lobster-macos-arm64';
    } else if (platform === 'darwin') {
      assetName = 'lobster-macos-x64';
    } else if (platform === 'win32') {
      assetName = 'lobster-win-x64.exe';
    } else {
      assetName = 'lobster-linux-x64';
    }

    // 3. 查找对应的 asset
    const asset = releaseInfo.assets?.find((a) => a.name === assetName);
    if (!asset) {
      console.log(`  未找到 ${assetName}，跳过更新`);
      return { checked: true, updated: false, error: `未找到 ${assetName} 发布包` };
    }

    // 4. 下载新版本（尝试多个镜像源）
    const currentExe = process.execPath;
    const newExe = currentExe + '.new';
    let downloadSuccess = false;

    console.log(`  正在下载 ${assetName}...`);

    for (let i = 0; i < GITHUB_MIRRORS.length; i++) {
      const mirror = GITHUB_MIRRORS[i];
      const downloadUrl = buildMirrorDownloadUrl(i, asset.browser_download_url);

      console.log(`  尝试从 ${mirror.name} 下载...`);

      const downloadResult = await downloadFile(downloadUrl, newExe, {
        timeout: 120000, // 2分钟
        onProgress: (downloaded: number, total: number | null) => {
          if (total && downloaded % (1024 * 1024) < 1000) {
            console.log(`  已下载: ${Math.round(downloaded / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB`);
          }
        },
      });

      if (downloadResult.success) {
        downloadSuccess = true;
        console.log(`  下载成功 (使用: ${mirror.name})`);
        break;
      } else {
        console.log(`  ${mirror.name} 下载失败，尝试下一个...`);
        try { fs.unlinkSync(newExe); } catch {}
      }
    }

    if (!downloadSuccess) {
      console.log('  所有镜像源均下载失败');
      return { checked: true, updated: false, error: '下载失败' };
    }

    // 5. 验证下载文件
    const stats = fs.statSync(newExe);
    if (stats.size < 1000) {
      console.log('  下载的文件太小，可能已损坏');
      try {
        fs.unlinkSync(newExe);
      } catch {}
      return { checked: true, updated: false, error: '下载的文件可能已损坏' };
    }

    // 6. 设置可执行权限
    if (platform !== 'win32') {
      fs.chmodSync(newExe, 0o755);
    }

    // 7. 原子性替换（备份旧文件）
    const backupExe = currentExe + '.old';

    // 清理旧备份
    try {
      if (fs.existsSync(backupExe)) {
        fs.unlinkSync(backupExe);
      }
    } catch {}

    // 替换文件
    try {
      fs.renameSync(currentExe, backupExe);
      fs.renameSync(newExe, currentExe);
    } catch (renameError) {
      // 回滚
      console.log('  替换文件失败，尝试回滚...');
      try {
        if (fs.existsSync(backupExe) && !fs.existsSync(currentExe)) {
          fs.renameSync(backupExe, currentExe);
        }
        if (fs.existsSync(newExe)) {
          fs.unlinkSync(newExe);
        }
      } catch {}
      return { checked: true, updated: false, error: '替换文件失败' };
    }

    console.log('  更新完成！正在重启...');

    // 8. 重启
    spawn(currentExe, process.argv.slice(1), {
      detached: true,
      stdio: 'inherit',
    });
    process.exit(0);

    return { checked: true, updated: true };
  } catch (e) {
    const error = e as Error;
    console.log(`  更新检查失败: ${error.message}`);
    logError(error, 'self-update');
    return { checked: false, updated: false, error: getUserFriendlyMessage(error) };
  }
}

// ============================================
// 启动！
// ============================================

async function main() {
  const config = loadConfig();

  // 龙虾助手自动更新（启动时检查）
  await checkSelfUpdate();

  // 每天自动检查更新
  const ONE_DAY = 24 * 60 * 60 * 1000;
  setInterval(() => {
    console.log('[自动更新] 每日检查更新...');
    checkSelfUpdate();
  }, ONE_DAY);

  const server = createServer(config);
  const requestedPort = Number(process.env.LOBSTER_PORT || DEFAULT_WEB_PORT);
  let port = requestedPort;
  const requestedPortAvailability = await checkPortAvailability(requestedPort);

  if (!requestedPortAvailability.available) {
    const fallbackPort = await findAvailablePort(requestedPort + 1, 20);
    if (!fallbackPort) {
      throw new Error(requestedPortAvailability.message || `Web 控制台端口 ${requestedPort} 已被占用`);
    }

    console.log(`[Web] 端口 ${requestedPort} 已被占用，自动切换到 ${fallbackPort}`);
    port = fallbackPort;
  }

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Web 控制台端口 ${port} 已被占用，请关闭旧进程或设置新的 LOBSTER_PORT`);
      return;
    }
    console.error('[Web 服务错误]', err.message);
  });

  server.listen(port, () => {
    console.log('');
    console.log('\x1b[46m\x1b[30m 🦞 龙虾助手 \x1b[0m');
    console.log('');
    console.log(`  Web 界面: \x1b[36mhttp://localhost:${port}\x1b[0m`);
    console.log('  自动更新: 每24小时检查');
    console.log('');
    console.log('  按 Ctrl+C 停止');
    console.log('');

    // 使用改进的浏览器打开函数
    const browserResult = openBrowser(`http://localhost:${port}`);
    if (!browserResult.success) {
      console.log('\x1b[33m提示: 请手动打开上面的链接\x1b[0m');
    }
  });
}

main().catch(console.error);
