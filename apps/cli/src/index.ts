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
  hasNetworkConnection,
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

const VERSION = '1.0.14';
const DEFAULT_WEB_PORT = 18790;
const DEFAULT_GATEWAY_PORT = 18789;
const CUSTOM_PROVIDER_DEFAULT_CONTEXT_WINDOW = 16000;
const CUSTOM_PROVIDER_DEFAULT_MAX_TOKENS = 4096;
const SOURCE_REPO_PATH = 'openclaw/openclaw';
const RELEASE_REPO_PATH = 'Leo0704/lobster-releases';
const DEFAULT_LICENSE_SERVER_URL =
  process.env.LOBSTER_LICENSE_SERVER_URL ||
  'https://license-api-lobster-license-qaqgawotfd.cn-hangzhou.fcapp.run';
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
const POPULAR_SKILLS = [
  { id: 'tavily-search', name: 'Tavily Search', icon: '🔍', desc: 'AI优化的网络搜索，返回精准结果', stars: '129k', category: '搜索' },
  { id: 'summarize', name: 'Summarize', icon: '📄', desc: '网页/PDF/视频/音频总结', stars: '87k', category: '文档' },
  { id: 'github', name: 'GitHub', icon: '🐙', desc: '操作 GitHub issue/PR/CI', stars: '75k', category: '开发' },
  { id: 'weather', name: 'Weather', icon: '🌤️', desc: '天气查询（无需API Key）', stars: '64k', category: '生活' },
  { id: 'notion', name: 'Notion', icon: '📝', desc: 'Notion 笔记和数据库操作', stars: '43k', category: '办公' },
  { id: 'obsidian', name: 'Obsidian', icon: '📕', desc: 'Obsidian 笔记库管理', stars: '37k', category: '笔记' },
  { id: 'nano-pdf', name: 'Nano PDF', icon: '📑', desc: '用自然语言编辑 PDF', stars: '40k', category: '文档' },
  { id: 'brave-search', name: 'Brave Search', icon: '🦁', desc: 'Brave 搜索引擎集成', stars: '30k', category: '搜索' },
  { id: 'openai-whisper', name: 'Whisper', icon: '🎙️', desc: '本地语音转文字（无需API）', stars: '34k', category: '音频' },
  { id: 'gog', name: 'Google Workspace', icon: '📧', desc: 'Gmail/Calendar/Drive 操作', stars: '88k', category: '办公' },
];

// 技能分类
const SKILL_CATEGORIES = ['全部', '搜索', '文档', '开发', '办公', '笔记', '生活', '音频'];

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

function detectProjectPackageManager(projectPath: string): 'pnpm' | 'npm' {
  const packageJsonPath = path.join(projectPath, 'package.json');
  const packageJson = readJsonFile(packageJsonPath);
  const packageManager = String(packageJson?.packageManager || '').split('@')[0].trim();

  if (packageManager === 'pnpm' || fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }

  return 'npm';
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

function checkCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd} || where ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
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
  return {
    installed: !!(config.installPath && fs.existsSync(config.installPath as string)),
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
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #FF6B35 0%, #004E89 100%);
      min-height: 100vh; padding: 20px;
    }
    .container { max-width: 800px; margin: 0 auto; }
    .header { text-align: center; color: white; padding: 30px 0; }
    .logo { font-size: 60px; margin-bottom: 10px; }
    .title { font-size: 28px; font-weight: bold; margin-bottom: 5px; }
    .subtitle { opacity: 0.9; }
    .version { font-size: 12px; opacity: 0.7; margin-top: 5px; }
    .card { background: white; border-radius: 16px; padding: 24px; margin-bottom: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
    .card-title { font-size: 18px; color: #1F2937; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #E5E7EB; display: flex; align-items: center; gap: 8px; }
    .status-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    @media (max-width: 500px) { .status-grid { grid-template-columns: 1fr; } }
    .status-item { padding: 16px; background: #F9FAFB; border-radius: 8px; }
    .status-label { font-size: 12px; color: #6B7280; margin-bottom: 4px; }
    .status-value { font-size: 16px; font-weight: 600; color: #1F2937; }
    .status-value.success { color: #10B981; }
    .status-value.error { color: #EF4444; }
    .status-value.warning { color: #F59E0B; }
    .btn { padding: 12px 20px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; margin-right: 8px; margin-bottom: 8px; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; }
    .btn-primary { background: #FF6B35; color: white; }
    .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
    .btn-secondary { background: #F3F4F6; color: #1F2937; }
    .btn-secondary:hover { background: #E5E7EB; }
    .btn-danger { background: #EF4444; color: white; }
    .btn-danger:hover { opacity: 0.9; }
    .btn-small { padding: 8px 16px; font-size: 13px; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .actions { margin-top: 20px; }
    .actions-right { text-align: right; margin-top: 20px; }
    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px; }
    .form-input { width: 100%; padding: 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px; outline: none; transition: border-color 0.2s; }
    .form-input:focus { border-color: #FF6B35; }
    .form-select { width: 100%; padding: 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px; outline: none; background: white; cursor: pointer; }
    .form-select:focus { border-color: #FF6B35; }
    .logs { background: #1F2937; border-radius: 8px; padding: 16px; max-height: 300px; overflow-y: auto; font-family: 'Monaco', 'Menlo', monospace; font-size: 12px; color: #9CA3AF; }
    .log-line { margin-bottom: 4px; }
    .log-time { color: #6B7280; }
    .log-info { color: #9CA3AF; }
    .log-error { color: #F87171; }
    .log-success { color: #34D399; }
    .log-warning { color: #FBBF24; }
    .note { background: #FEF3C7; border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 14px; color: #92400E; }
    .note-info { background: #DBEAFE; color: #1E40AF; }
    .footer { text-align: center; color: rgba(255,255,255,0.8); font-size: 12px; margin-top: 20px; }
    #toast { position: fixed; bottom: 20px; right: 20px; padding: 12px 24px; border-radius: 8px; color: white; font-weight: 500; opacity: 0; transition: all 0.3s; z-index: 1000; }
    #toast.show { opacity: 1; }
    #toast.success { background: #10B981; }
    #toast.error { background: #EF4444; }
    .wizard-steps { display: grid; gap: 16px; margin-bottom: 20px; }
    .wizard-step { padding: 16px; border: 1px solid #E5E7EB; border-radius: 12px; background: #F9FAFB; }
    .wizard-step-title { font-size: 14px; font-weight: 700; color: #1F2937; margin-bottom: 10px; }
    .wizard-step-desc { font-size: 12px; color: #6B7280; margin-bottom: 10px; line-height: 1.5; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 14px; font-weight: 600; color: #6B7280; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .divider { height: 1px; background: #E5E7EB; margin: 20px 0; }
    .update-section { background: #F9FAFB; border-radius: 8px; padding: 16px; margin-top: 16px; }
    .update-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #E5E7EB; }
    .update-item:last-child { border-bottom: none; }
    .update-info h4 { font-size: 14px; color: #1F2937; margin-bottom: 4px; }
    .update-info p { font-size: 12px; color: #6B7280; }
    .help-section { background: #F9FAFB; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
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
    .tabs { display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 2px solid #E5E7EB; padding-bottom: 12px; }
    .tab { padding: 10px 20px; border: none; background: transparent; font-size: 14px; font-weight: 500; color: #6B7280; cursor: pointer; border-radius: 8px 8px 0 0; transition: all 0.2s; }
    .tab:hover { color: #FF6B35; background: #FFF7ED; }
    .tab.active { color: #FF6B35; background: #FFF7ED; border-bottom: 2px solid #FF6B35; margin-bottom: -14px; }
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
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🦞</div>
      <div class="title">龙虾助手</div>
      <div class="subtitle">OpenClaw 一键部署工具</div>
      <div class="version">v${VERSION}</div>
    </div>
    <div id="main-card" class="card"></div>
    <div class="footer">© 2024 龙虾助手 · 让 AI 触手可及</div>
  </div>
  <div id="toast"></div>
  <script>
    const PROVIDERS = ${JSON.stringify(PROVIDERS)};
    // 默认选择当前 provider 的默认模型；custom 不展示预设推荐模型
    const defaultProvider = '${config.provider || 'anthropic'}';
    const defaultModel = defaultProvider === 'custom'
      ? ('${config.customModelId || config.model || ''}')
      : ('${config.model}' || (PROVIDERS[defaultProvider]?.models.find(m => m.recommended)?.id || PROVIDERS[defaultProvider]?.models[0]?.id || ''));
    const state = {
      config: ${JSON.stringify(config)},
      status: ${JSON.stringify(status)},
      logs: [],
      selectedProvider: defaultProvider,
      selectedModel: defaultModel,
      currentTab: 'status',
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
      const card = $('main-card');
      const c = state.config, s = state.status;

      // 未激活
      if (!c.activated) {
        card.innerHTML = \`
          <h2 class="card-title">🔐 激活产品</h2>
          <div class="note note-info">请输入您购买的激活码来激活产品</div>
          <div class="form-group">
            <label class="form-label">激活码</label>
            <input type="text" id="code" class="form-input" placeholder="XXXX-XXXX-XXXX-XXXX" style="text-transform: uppercase; letter-spacing: 2px;">
          </div>
          <div class="actions">
            <button class="btn btn-primary" onclick="activate()">激活</button>
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
          <div class="note note-info">部署阶段也按顺序填写模型接入信息，不再使用推荐模型卡片。</div>

          <div class="wizard-steps">
            <div class="wizard-step">
              <div class="wizard-step-title">第 1 步：选择 Provider</div>
              <div class="wizard-step-desc">先确定是使用 OpenClaw 预设 provider，还是走 custom onboarding。</div>
              <select id="deployProvider" class="form-select" onchange="selectProvider(this.value)">
                \${renderProviderOptions()}
              </select>
            </div>

            <div class="wizard-step">
              <div class="wizard-step-title">第 2 步：填写模型与认证</div>
              \${deployIsCustom ? \`
                <div class="wizard-step-desc">custom 不提供推荐模型。请按 OpenClaw 官方 custom onboarding 的顺序填写。</div>
                <div class="form-group">
                  <label class="form-label">API Key</label>
                  <input type="password" id="apiKey" class="form-input" value="\${c.apiKey || ''}" placeholder="请输入 API Key">
                </div>
                <div class="form-group">
                  <label class="form-label">Base URL</label>
                  <input type="text" id="deployBaseUrl" class="form-input" value="\${c.baseUrl || ''}" placeholder="例如: https://api.example.com/v1">
                </div>
                <div class="form-group">
                  <label class="form-label">Endpoint compatibility</label>
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
                <div class="wizard-step-desc">预设 provider 只保留 provider 与 model 的源码语义，不再展示推荐卡片。</div>
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
            <div class="form-group">
              <label class="form-label">说明</label>
              <div class="note note-info" style="margin-bottom:0">
                \${deployIsCustom
                  ? 'custom provider 会在部署后继续沿用 OpenClaw 的 custom provider 配置语义。'
                  : '预设 provider 仅作为快捷模板，最终仍由 OpenClaw 网关读取生成的配置。'}
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

          <div class="actions">
            \${s.running
              ? '<button class="btn btn-danger" onclick="stop()">⏹ 停止服务</button>'
              : '<button class="btn btn-primary" onclick="start()">▶ 启动服务</button>'
            }
            <button class="btn btn-secondary" onclick="showConfig()">⚙️ 配置</button>
            \${s.running ? '<button class="btn btn-secondary" onclick="openGateway()">🌐 打开 OpenClaw</button>' : ''}
            \${s.running ? '<button class="btn btn-secondary" onclick="copyGatewayLink()">🔗 复制自动认证链接</button>' : ''}
          </div>

          \${s.running && s.gatewayToken ? \`
            <div class="note note-info" style="margin-top:12px">
              Gateway Token: <code style="word-break:break-all">\${s.gatewayToken}</code><br>
              “打开 OpenClaw” 会自动带上 token。只有手动打开其它浏览器标签页时，才需要去 Control UI settings 粘贴它。
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

          <h3 style="font-size:14px;color:#1F2937;margin-bottom:12px">📋 运行日志</h3>
          <div class="logs" id="logs"><div class="log-line log-info">等待操作...</div></div>
        </div>

        <!-- 技能市场 Tab -->
        <div id="tab-skills" class="tab-content \${state.currentTab === 'skills' ? 'active' : ''}">
          <div class="note note-info" style="margin-bottom: 16px;">
            🧩 技能可以扩展 AI 的能力，如搜索、文档处理、代码操作等。点击安装后重启服务即可使用。
          </div>

          <div class="category-filter" id="category-filter"></div>

          <div class="skill-grid" id="skill-grid">
            <div style="text-align:center;padding:40px;color:#9CA3AF;">加载中...</div>
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

    let allSkills = [];
    let installedSkills = [];
    let selectedCategory = '全部';

    async function loadSkills() {
      // 加载热门技能
      const popularRes = await api('skills/popular');
      if (popularRes.success) {
        allSkills = popularRes.skills;
        renderCategoryFilter();
        renderSkillGrid();
      }

      // 加载已安装技能
      const installedRes = await api('skills/installed');
      if (installedRes.success) {
        installedSkills = installedRes.skills;
        renderInstalledSkills();
      }

      state.skillsLoaded = true;
    }

    function renderCategoryFilter() {
      const el = $('category-filter');
      if (!el) return;
      const categories = ['全部', ...new Set(allSkills.map(s => s.category))];
      el.innerHTML = categories.map(cat => \`
        <button class="category-btn \${selectedCategory === cat ? 'active' : ''}" onclick="filterCategory('\${cat}')">\${cat}</button>
      \`).join('');
    }

    function filterCategory(cat) {
      selectedCategory = cat;
      renderCategoryFilter();
      renderSkillGrid();
    }

    function renderSkillGrid() {
      const el = $('skill-grid');
      if (!el) return;

      const filtered = selectedCategory === '全部'
        ? allSkills
        : allSkills.filter(s => s.category === selectedCategory);

      if (filtered.length === 0) {
        el.innerHTML = '<div style="text-align:center;padding:40px;color:#9CA3AF;">暂无技能</div>';
        return;
      }

      el.innerHTML = filtered.map(skill => {
        const isInstalled = installedSkills.includes(skill.id);
        return \`
          <div class="skill-card">
            <div class="skill-header">
              <span class="skill-icon">\${skill.icon}</span>
              <span class="skill-name">\${skill.name}</span>
            </div>
            <div class="skill-desc">\${skill.desc}</div>
            <div class="skill-footer">
              <span class="skill-stars">⭐ \${skill.stars}</span>
              \${isInstalled
                ? '<span class="skill-installed">✓ 已安装</span>'
                : \`<button class="btn btn-primary btn-small" onclick="installSkill('\${skill.id}')">安装</button>\`
              }
            </div>
          </div>
        \`;
      }).join('');
    }

    function renderInstalledSkills() {
      const el = $('installed-skills');
      if (!el) return;

      if (installedSkills.length === 0) {
        el.innerHTML = '<div style="text-align:center;padding:20px;color:#9CA3AF;">暂无已安装的技能</div>';
        return;
      }

      el.innerHTML = installedSkills.map(skillId => {
        const skill = allSkills.find(s => s.id === skillId);
        const name = skill ? skill.name : skillId;
        return \`
          <div class="installed-item">
            <span class="installed-name">\${name}</span>
            <button class="btn btn-secondary btn-small" onclick="uninstallSkill('\${skillId}')">卸载</button>
          </div>
        \`;
      }).join('');
    }

    async function installSkill(skillId) {
      toast('正在安装技能...', 'info');
      const res = await api('skills/install', { skill: skillId });
      if (res.success) {
        toast(res.message || '安装成功！');
        // 刷新已安装列表
        const installedRes = await api('skills/installed');
        if (installedRes.success) {
          installedSkills = installedRes.skills;
          renderSkillGrid();
          renderInstalledSkills();
        }
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
        // 刷新已安装列表
        const installedRes = await api('skills/installed');
        if (installedRes.success) {
          installedSkills = installedRes.skills;
          renderSkillGrid();
          renderInstalledSkills();
        }
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
          <h3 style="font-size:16px;color:#1F2937;margin-bottom:16px">🚀 快速开始</h3>
          <div class="help-item">
            <div class="help-title">1. 启动服务</div>
            <div class="help-content">点击"启动服务"按钮，等待服务启动完成后，点击"打开 OpenClaw"进入 AI 对话界面。</div>
          </div>
          <div class="help-item">
            <div class="help-title">2. 安装技能</div>
            <div class="help-content">在"技能市场"中选择需要的技能并安装。技能可以扩展 AI 的能力，如搜索、文档处理等。</div>
          </div>
          <div class="help-item">
            <div class="help-title">3. 开始对话</div>
            <div class="help-content">打开 OpenClaw 后，直接输入问题即可开始对话。AI 会根据你安装的技能自动调用相应功能。</div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="help-section">
          <h3 style="font-size:16px;color:#1F2937;margin-bottom:16px">💬 常用对话示例</h3>
          <div class="help-item">
            <div class="help-title">🔍 搜索信息</div>
            <div class="help-content">
              <ul>
                <li>"帮我搜索一下 Claude 最新版本的功能"</li>
                <li>"查一下今天北京的天气"</li>
                <li>"搜索 React 19 的新特性"</li>
              </ul>
            </div>
          </div>
          <div class="help-item">
            <div class="help-title">📄 处理文档</div>
            <div class="help-content">
              <ul>
                <li>"帮我总结这个网页的内容：https://..."</li>
                <li>"把这个 PDF 转换成 Markdown"</li>
                <li>"帮我编辑这个 PDF，把标题改成..."</li>
              </ul>
            </div>
          </div>
          <div class="help-item">
            <div class="help-title">💻 代码相关</div>
            <div class="help-content">
              <ul>
                <li>"帮我查看 GitHub 上的 issue #123"</li>
                <li>"创建一个 PR 到 main 分支"</li>
                <li>"解释这段代码的作用"</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="help-section">
          <h3 style="font-size:16px;color:#1F2937;margin-bottom:16px">❓ 常见问题</h3>
          <div class="faq-item">
            <div class="faq-q">Q: 技能安装后怎么使用？</div>
            <div class="faq-a">A: 安装技能后需要重启服务，然后直接在对话中提问即可。AI 会自动判断是否需要使用技能。</div>
          </div>
          <div class="faq-item">
            <div class="faq-q">Q: 如何更换 AI 模型？</div>
            <div class="faq-a">A: 点击"配置"按钮，在配置页面选择新的模型和 API Key，保存后重启服务即可。</div>
          </div>
          <div class="faq-item">
            <div class="faq-q">Q: 服务启动失败怎么办？</div>
            <div class="faq-a">A: 请检查：1) API Key 是否正确；2) 端口是否被占用；3) 查看运行日志了解具体错误。</div>
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
        resultEl.innerHTML = '<div class="note note-info">请按 OpenClaw 源码的重试分支修改字段后，再次点击“验证 Endpoint”。</div>';
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
      const card = $('main-card');
      const c = state.config;
      const currentProvider = PROVIDERS[state.selectedProvider] || PROVIDERS.custom;
      const isCustom = state.selectedProvider === 'custom';

      card.innerHTML = \`
        <h2 class="card-title">⚙️ API 配置</h2>
        <div class="wizard-steps">
          <div class="wizard-step">
            <div class="wizard-step-title">第 1 步：选择 Provider</div>
            <div class="wizard-step-desc">先确定是使用 OpenClaw 预设 provider，还是进入 custom provider onboarding。</div>
            <select id="configProvider" class="form-select" onchange="selectProvider(this.value)">
              \${renderProviderOptions()}
            </select>
          </div>

          <div class="wizard-step">
            <div class="wizard-step-title">第 2 步：提供凭证</div>
            <div class="wizard-step-desc">\${isCustom ? 'custom provider 先填 Base URL 和 API Key。' : '预设 provider 只保留 provider、model、api key 这三个核心输入。'}</div>
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
            <div class="wizard-step-title">第 3 步：OpenClaw Custom Onboarding</div>
            <div class="wizard-step-desc">这部分按 OpenClaw 源码顺序：compatibility -> model id -> verify -> endpoint id -> alias。</div>
            <div class="form-group">
              <label class="form-label">Endpoint compatibility</label>
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
              <label class="form-label">Model alias (optional)</label>
              <input type="text" id="customModelAlias" class="form-input" value="\${c.customModelAlias || ''}" placeholder="例如: glm">
            </div>
            <div id="custom-wizard-result" style="margin-top:12px">
              \${state.customWizard.message ? \`<div class="note" style="background:\${state.customWizard.verified ? '#D1FAE5' : '#FEF2F2'};color:\${state.customWizard.verified ? '#065F46' : '#991B1B'}">\${state.customWizard.message}</div>\` : ''}
            </div>
          </div>
          \` : \`
          <div class="wizard-step">
            <div class="wizard-step-title">第 3 步：选择 Model</div>
            <div class="wizard-step-desc">预设 provider 不再显示推荐模型卡片，只保留源码语义上的 model 选择。</div>
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
          state.customWizard.message = '验证成功。输入顺序、验证行为和落盘配置将按 OpenClaw custom onboarding 语义保存。';
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
      if (res.status) { state.status = res.status; render(); }
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
      return { success: true, skills: POPULAR_SKILLS, categories: SKILL_CATEGORIES };

    case 'skills/search':
      const query = (data.query as string || '').toLowerCase();
      if (!query) return { success: true, skills: POPULAR_SKILLS };
      const filtered = POPULAR_SKILLS.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.desc.toLowerCase().includes(query) ||
        s.category.toLowerCase().includes(query)
      );
      return { success: true, skills: filtered };

    case 'skills/installed':
      if (!config.installPath) return { success: true, skills: [] };
      const skillsDir = path.join(config.installPath as string, '.claude', 'skills');
      if (!fs.existsSync(skillsDir)) return { success: true, skills: [] };
      try {
        const installed = fs.readdirSync(skillsDir).filter((f: string) =>
          fs.statSync(path.join(skillsDir, f)).isDirectory()
        );
        return { success: true, skills: installed };
      } catch {
        return { success: true, skills: [] };
      }

    case 'skills/install':
      return handleSkillInstall(data, config);

    case 'skills/uninstall':
      return handleSkillUninstall(data, config);

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
    logs.push({ time: new Date().toLocaleTimeString(), level, message: msg });
    if (logs.length > 100) logs.shift();
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

    // 2. 检查依赖
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

    // 3. 检查磁盘空间
    addLog('检查磁盘空间...');
    const diskCheck = checkDiskSpace(500 * 1024 * 1024, installPath); // 500MB
    if (!diskCheck.available) {
      addLog(`错误: ${diskCheck.message}`, 'error');
      return { success: false, error: diskCheck.message, logs };
    }
    addLog(`磁盘空间充足 (可用: ${Math.round(diskCheck.freeBytes / 1024 / 1024)}MB) ✓`, 'success');

    // 4. 检查端口
    addLog(`检查端口 ${gatewayPort}...`);
    const portResult = await checkPortAvailability(gatewayPort);
    if (!portResult.available) {
      addLog(`错误: ${portResult.message}`, 'error');
      return { success: false, error: portResult.message || '端口已被占用', logs };
    }
    addLog('端口可用 ✓', 'success');

    // 5. 保存配置
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

    // 6. 克隆/更新仓库（支持镜像源自动切换）
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
      addLog('目录已存在，更新中...');
      const pullResult = runCommand('git pull', installPath, { ignoreError: true });
      if (pullResult.success) {
        addLog('更新成功 ✓', 'success');
      } else {
        addLog('更新失败，使用现有代码', 'warning');
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

    // 7. 安装依赖
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

    // 8. 构建
    addLog('构建项目...');
    const buildPlan = getBuildCommand(installPath);
    const buildResult = runCommand(buildPlan.command, installPath, { ignoreError: true, timeout: 300000 });
    if (buildResult.success) {
      addLog('构建成功 ✓', 'success');
    } else {
      addLog('构建跳过（可能无构建脚本）', 'warning');
    }

    // 9. 保存最终配置
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
  if (!config.installPath || !fs.existsSync(config.installPath as string)) {
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
    logs.push({
      time: new Date().toLocaleTimeString(),
      level: 'info',
      message: `启动命令: ${startCommand}`,
    });

    const processRef = spawn(startCommand, [], {
      cwd: config.installPath as string,
      env,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    gatewayProcess = processRef;

    processRef.stdout?.on('data', (d: Buffer) => {
      logs.push({ time: new Date().toLocaleTimeString(), level: 'info', message: d.toString().trim() });
      if (logs.length > 100) logs.shift();
    });

    processRef.stderr?.on('data', (d: Buffer) => {
      logs.push({ time: new Date().toLocaleTimeString(), level: 'error', message: d.toString().trim() });
      if (logs.length > 100) logs.shift();
    });

    processRef.on('spawn', () => {
      gatewayStatus = 'running';
    });

    processRef.on('error', (err: Error) => {
      gatewayStatus = 'stopped';
      logs.push({ time: new Date().toLocaleTimeString(), level: 'error', message: `进程错误: ${err.message}` });
      console.error('[进程错误]', err);
    });

    processRef.on('exit', (code: number | null, signal: string | null) => {
      if (gatewayProcess === processRef) {
        gatewayProcess = null;
      }
      gatewayStatus = 'stopped';
      if (code !== 0 && code !== null) {
        logs.push({ time: new Date().toLocaleTimeString(), level: 'warning', message: `进程已退出 (code: ${code})` });
      }
    });

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
      gatewayProcess.kill();
      gatewayProcess = null;
      gatewayStatus = 'stopped';
      logs.push({ time: new Date().toLocaleTimeString(), level: 'info', message: '服务已停止' });
    } catch (e) {
      gatewayStatus = 'running';
      console.error('[停止错误]', e);
    }
  }
  return { success: true };
}

// ============================================
// 更新处理
// ============================================

function handleUpdateOpenClaw(config: Record<string, unknown>): Record<string, unknown> {
  if (!config.installPath || !fs.existsSync(config.installPath as string)) {
    return { success: false, error: '请先部署' };
  }

  try {
    // 获取远程版本
    const fetchResult = runCommand('git fetch origin', config.installPath as string, { timeout: 60000 });
    if (!fetchResult.success) {
      return { success: false, error: fetchResult.stderr || '无法获取远程版本信息' };
    }

    const localResult = runCommand('git rev-parse HEAD', config.installPath as string);
    const remoteResult = runCommand('git rev-parse origin/main', config.installPath as string);

    if (!localResult.success || !remoteResult.success) {
      return { success: false, error: '无法获取版本信息' };
    }

    if (localResult.stdout === remoteResult.stdout) {
      return { success: true, message: '已是最新版本' };
    }

    // 更新
    const resetResult = runCommand('git reset --hard origin/main', config.installPath as string);
    if (!resetResult.success) {
      return { success: false, error: resetResult.stderr || '更新失败' };
    }

    const projectPackageManager = detectProjectPackageManager(config.installPath as string);
    if (projectPackageManager === 'pnpm' && !checkCommand('pnpm')) {
      return { success: false, error: '当前 OpenClaw 源码要求使用 pnpm，请先安装 pnpm 后再更新' };
    }

    const installPlan = getInstallCommand(config.installPath as string);
    const buildPlan = getBuildCommand(config.installPath as string);
    runCommand(installPlan.command, config.installPath as string, { timeout: 300000 });
    runCommand(buildPlan.command, config.installPath as string, { ignoreError: true, timeout: 300000 });

    return { success: true, message: 'OpenClaw 更新成功！' };
  } catch (e) {
    const error = e as Error;
    logError(error, 'update-openclaw');
    return { success: false, error: getUserFriendlyMessage(error) };
  }
}

// ============================================
// 技能安装处理
// ============================================

function handleSkillInstall(data: Record<string, unknown>, config: Record<string, unknown>): Record<string, unknown> {
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
      console.log(`[技能] 安装成功: ${skillId}`);
      return { success: true, message: `技能 "${skillId}" 安装成功！` };
    } else {
      return { success: false, error: result.stderr || '安装失败' };
    }
  } catch (e) {
    const error = e as Error;
    console.error(`[技能] 安装失败: ${error.message}`);
    return { success: false, error: `安装失败: ${error.message}` };
  }
}

function handleSkillUninstall(data: Record<string, unknown>, config: Record<string, unknown>): Record<string, unknown> {
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

  try {
    const skillPath = path.join(config.installPath as string, '.claude', 'skills', skillId);
    if (!fs.existsSync(skillPath)) {
      return { success: false, error: '技能未安装' };
    }

    fs.rmSync(skillPath, { recursive: true, force: true });
    console.log(`[技能] 已卸载: ${skillId}`);
    return { success: true, message: `技能 "${skillId}" 已卸载` };
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
    // 1. 网络连接检查
    const hasNetwork = await hasNetworkConnection();
    if (!hasNetwork) {
      console.log('  无网络连接，跳过更新检查');
      return { checked: false, updated: false, error: '无网络连接' };
    }

    // 2. 从 GitHub API 获取最新 release 信息（尝试多个镜像源）
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

    // 3. 确定当前平台的二进制文件名
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

    // 4. 查找对应的 asset
    const asset = releaseInfo.assets?.find((a) => a.name === assetName);
    if (!asset) {
      console.log(`  未找到 ${assetName}，跳过更新`);
      return { checked: true, updated: false, error: `未找到 ${assetName} 发布包` };
    }

    // 5. 下载新版本（尝试多个镜像源）
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

    // 6. 验证下载文件
    const stats = fs.statSync(newExe);
    if (stats.size < 1000) {
      console.log('  下载的文件太小，可能已损坏');
      try {
        fs.unlinkSync(newExe);
      } catch {}
      return { checked: true, updated: false, error: '下载的文件可能已损坏' };
    }

    // 7. 设置可执行权限
    if (platform !== 'win32') {
      fs.chmodSync(newExe, 0o755);
    }

    // 8. 原子性替换（备份旧文件）
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

    // 9. 重启
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
  const port = process.env.LOBSTER_PORT || DEFAULT_WEB_PORT;

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
