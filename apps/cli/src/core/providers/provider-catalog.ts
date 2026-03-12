const {
  ANTHROPIC_API_FORMAT,
} = require('./provider-utils') as typeof import('./provider-utils');

/**
 * OpenClaw 格式的 Provider 定义
 * 用于生成 models.json
 */
export type OpenClawModelDefinition = {
  id: string;
  name: string;
  reasoning?: boolean;
  input: Array<'text' | 'image'>;
  cost: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  contextWindow: number;
  maxTokens: number;
};

export type OpenClawProviderConfig = {
  baseUrl: string;
  apiKey?: string;
  api?: string;
  models: OpenClawModelDefinition[];
};

const PROVIDERS: Record<string, {
  name: string;
  icon: string;
  type: 'direct' | 'proxy' | 'custom';
  apiFormat: string;
  envKey: string;
  baseUrl: string;
  description?: string;
  models: Array<{
    id: string;
    name: string;
    recommended?: boolean;
    reasoning?: boolean;
    input?: Array<'text' | 'image'>;
    contextWindow: number;
    maxTokens: number;
    cost?: {
      input: number;
      output: number;
      cacheRead?: number;
      cacheWrite?: number;
    };
  }>;
}> & {
  // OpenClaw 格式的 provider 配置（用于生成 models.json）
  [key: string]: {
    name: string;
    icon: string;
    type: 'direct' | 'proxy' | 'custom';
    apiFormat: string;
    envKey: string;
    baseUrl: string;
    description?: string;
    models: Array<{
      id: string;
      name: string;
      recommended?: boolean;
      reasoning?: boolean;
      input?: Array<'text' | 'image'>;
      contextWindow: number;
      maxTokens: number;
      cost?: {
        input: number;
        output: number;
        cacheRead?: number;
        cacheWrite?: number;
      };
    }>;
    // OpenClaw 格式的额外字段
    api?: string;
    injectNumCtxForOpenAICompat?: boolean;
    headers?: Record<string, string>;
    authHeader?: boolean;
  };
} = {
  anthropic: {
    name: 'Anthropic (Claude 直连)',
    icon: '🟠',
    type: 'direct',
    apiFormat: ANTHROPIC_API_FORMAT,
    envKey: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com',
    api: 'anthropic-messages',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', recommended: true, reasoning: true, input: ['text', 'image'], contextWindow: 200000, maxTokens: 16000, cost: { input: 3, output: 15, cacheRead: 0.375, cacheWrite: 1.875 } },
      { id: 'claude-opus-4-1-20250805', name: 'Claude Opus 4.1', reasoning: true, input: ['text', 'image'], contextWindow: 200000, maxTokens: 16000, cost: { input: 15, output: 75 } },
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude Sonnet 3.7', reasoning: true, input: ['text', 'image'], contextWindow: 200000, maxTokens: 8192, cost: { input: 3, output: 15 } },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', input: ['text', 'image'], contextWindow: 200000, maxTokens: 8192, cost: { input: 0.8, output: 4 } },
    ]
  },
  openai: {
    name: 'OpenAI (GPT 直连)',
    icon: '🟢',
    type: 'direct',
    apiFormat: 'openai-completions',
    envKey: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    api: 'openai-completions',
    models: [
      { id: 'gpt-5.2', name: 'GPT-5.2', recommended: true, input: ['text', 'image'], contextWindow: 400000, maxTokens: 128000, cost: { input: 2.5, output: 10 } },
      { id: 'gpt-5-mini', name: 'GPT-5 mini', input: ['text', 'image'], contextWindow: 400000, maxTokens: 128000, cost: { input: 0.3, output: 1.2 } },
      { id: 'gpt-5-nano', name: 'GPT-5 nano', input: ['text', 'image'], contextWindow: 400000, maxTokens: 128000, cost: { input: 0.1, output: 0.4 } },
      { id: 'gpt-4.1', name: 'GPT-4.1', input: ['text', 'image'], contextWindow: 1047576, maxTokens: 32768, cost: { input: 2, output: 8 } },
    ]
  },
  google: {
    name: 'Google (Gemini 直连)',
    icon: '🔵',
    type: 'direct',
    apiFormat: 'google',
    envKey: 'GOOGLE_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com',
    api: 'google-generative-ai',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', recommended: true, reasoning: true, input: ['text', 'image'], contextWindow: 1000000, maxTokens: 65536, cost: { input: 0.3, output: 0.5 } },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', reasoning: true, input: ['text', 'image'], contextWindow: 1048576, maxTokens: 65536, cost: { input: 1.25, output: 5 } },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', input: ['text', 'image'], contextWindow: 1000000, maxTokens: 65536, cost: { input: 0.15, output: 0.3 } },
      { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview', reasoning: true, input: ['text', 'image'], contextWindow: 1048576, maxTokens: 65536, cost: { input: 1.25, output: 5 } },
    ]
  },
  openrouter: {
    name: 'OpenRouter (多模型聚合)',
    icon: '🟣',
    type: 'proxy',
    apiFormat: 'openai-completions',
    envKey: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    api: 'openai-completions',
    models: [
      { id: 'anthropic/claude-sonnet-4-20250514', name: 'Claude Sonnet 4', recommended: true, reasoning: true, input: ['text', 'image'], contextWindow: 200000, maxTokens: 16000, cost: { input: 3, output: 15 } },
      { id: 'openai/gpt-5', name: 'GPT-5', input: ['text', 'image'], contextWindow: 400000, maxTokens: 128000, cost: { input: 2.5, output: 10 } },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', reasoning: true, input: ['text', 'image'], contextWindow: 1000000, maxTokens: 65536, cost: { input: 0.3, output: 0.5 } },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', reasoning: true, input: ['text'], contextWindow: 128000, maxTokens: 8192, cost: { input: 0, output: 0 } },
      { id: 'moonshotai/kimi-k2', name: 'Kimi K2', reasoning: true, input: ['text', 'image'], contextWindow: 256000, maxTokens: 32768, cost: { input: 0, output: 0 } },
    ]
  },
  aliyun_bailian: {
    name: '阿里云百炼 (国内)',
    icon: '🟡',
    type: 'proxy',
    apiFormat: 'openai-completions',
    envKey: 'ALIYUN_API_KEY',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    api: 'openai-completions',
    description: '阿里云百炼平台，支持通义千问系列',
    models: [
      { id: 'qwen-plus', name: '通义千问 Plus', recommended: true, reasoning: true, input: ['text', 'image'], contextWindow: 128000, maxTokens: 6000, cost: { input: 0.8, output: 2 } },
      { id: 'qwen-max', name: '通义千问 Max', reasoning: true, input: ['text', 'image'], contextWindow: 32000, maxTokens: 8000, cost: { input: 4, output: 8 } },
      { id: 'qwen-flash', name: '通义千问 Flash', reasoning: true, input: ['text', 'image'], contextWindow: 1000000, maxTokens: 8192, cost: { input: 0.1, output: 0.3 } },
      { id: 'qwen-turbo', name: '通义千问 Turbo', input: ['text', 'image'], contextWindow: 1000000, maxTokens: 8192, cost: { input: 0.1, output: 0.3 } },
      { id: 'qwen-long', name: '通义千问 Long (长文本)', reasoning: true, input: ['text'], contextWindow: 1000000, maxTokens: 10000, cost: { input: 0.5, output: 2 } },
    ]
  },
  aliyun_coding: {
    name: '阿里云 Coding Plan',
    icon: '💻',
    type: 'proxy',
    apiFormat: 'openai-completions',
    envKey: 'ALIYUN_CODING_API_KEY',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
    api: 'openai-completions',
    description: '阿里云开发者 Coding Plan，需开通百炼服务',
    models: [
      { id: 'qwen3-coder-plus', name: 'Qwen3 Coder Plus', recommended: true, reasoning: true, input: ['text', 'image'], contextWindow: 256000, maxTokens: 16384, cost: { input: 1.5, output: 3 } },
      { id: 'qwen3-coder-flash', name: 'Qwen3 Coder Flash', reasoning: true, input: ['text', 'image'], contextWindow: 256000, maxTokens: 16384, cost: { input: 0.5, output: 1 } },
      { id: 'qwen-plus', name: 'Qwen Plus', reasoning: true, input: ['text', 'image'], contextWindow: 128000, maxTokens: 8192, cost: { input: 0.8, output: 2 } },
      { id: 'qwen-max', name: 'Qwen Max', reasoning: true, input: ['text', 'image'], contextWindow: 32000, maxTokens: 8192, cost: { input: 4, output: 8 } },
    ]
  },
  deepseek: {
    name: 'DeepSeek (国内)',
    icon: '🔷',
    type: 'proxy',
    apiFormat: 'openai-completions',
    envKey: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1',
    api: 'openai-completions',
    description: 'DeepSeek 官方 API',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', recommended: true, reasoning: true, input: ['text'], contextWindow: 64000, maxTokens: 4096, cost: { input: 0, output: 0 } },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', reasoning: true, input: ['text'], contextWindow: 64000, maxTokens: 8192, cost: { input: 0.55, output: 2.19 } },
    ]
  },
  siliconflow: {
    name: '硅基流动 (国内)',
    icon: '🌊',
    type: 'proxy',
    apiFormat: 'openai-completions',
    envKey: 'SILICONFLOW_API_KEY',
    baseUrl: 'https://api.siliconflow.cn/v1',
    api: 'openai-completions',
    description: '硅基流动，多种模型聚合',
    models: [
      { id: 'Qwen/Qwen3-Coder-480B-A35B-Instruct', name: 'Qwen3 Coder 480B', reasoning: true, input: ['text'], contextWindow: 256000, maxTokens: 16384, cost: { input: 0, output: 0 } },
      { id: 'deepseek-ai/DeepSeek-V3.2-Exp', name: 'DeepSeek V3.2 Exp', reasoning: true, input: ['text'], contextWindow: 128000, maxTokens: 8192, cost: { input: 0, output: 0 } },
      { id: 'THUDM/glm-4.5', name: 'GLM-4.5', reasoning: true, input: ['text', 'image'], contextWindow: 128000, maxTokens: 8192, cost: { input: 0, output: 0 } },
    ]
  },
  moonshot: {
    name: 'Moonshot (Kimi)',
    icon: '🌙',
    type: 'proxy',
    apiFormat: 'openai-completions',
    envKey: 'MOONSHOT_API_KEY',
    baseUrl: 'https://api.moonshot.cn/v1',
    api: 'openai-completions',
    description: '月之暗面 Kimi，擅长长文本',
    models: [
      { id: 'kimi-thinking-preview', name: 'Kimi Thinking Preview', recommended: true, reasoning: true, input: ['text'], contextWindow: 128000, maxTokens: 32768, cost: { input: 0, output: 0 } },
      { id: 'kimi-k2-turbo-preview', name: 'Kimi K2 Turbo Preview', reasoning: true, input: ['text', 'image'], contextWindow: 256000, maxTokens: 32768, cost: { input: 0, output: 0 } },
      { id: 'kimi-k2-0905-preview', name: 'Kimi K2 0905 Preview', reasoning: true, input: ['text', 'image'], contextWindow: 256000, maxTokens: 32768, cost: { input: 0, output: 0 } },
      { id: 'moonshot-v1-128k', name: 'Moonshot V1 128K', input: ['text'], contextWindow: 131072, maxTokens: 4096, cost: { input: 0, output: 0 } },
    ]
  },
  zhipu: {
    name: '智谱 AI (GLM)',
    icon: '🧠',
    type: 'proxy',
    apiFormat: 'openai-completions',
    envKey: 'ZHIPU_API_KEY',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    api: 'openai-completions',
    description: '智谱清言 GLM 系列',
    models: [
      { id: 'glm-5', name: 'GLM-5', recommended: true, reasoning: true, input: ['text', 'image'], contextWindow: 128000, maxTokens: 8192, cost: { input: 0, output: 0 } },
      { id: 'glm-4-plus', name: 'GLM-4 Plus', reasoning: true, input: ['text', 'image'], contextWindow: 128000, maxTokens: 4096, cost: { input: 0, output: 0 } },
      { id: 'glm-4.5', name: 'GLM-4.5', reasoning: true, input: ['text', 'image'], contextWindow: 128000, maxTokens: 8192, cost: { input: 0, output: 0 } },
      { id: 'glm-4-air', name: 'GLM-4 Air', input: ['text', 'image'], contextWindow: 128000, maxTokens: 4096, cost: { input: 0, output: 0 } },
      { id: 'glm-4-flash', name: 'GLM-4 Flash', input: ['text', 'image'], contextWindow: 128000, maxTokens: 4096, cost: { input: 0, output: 0 } },
    ]
  },
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

/**
 * 将用户配置转换为 OpenClaw 格式的 models.json
 * @param providerKey provider 标识符 (如 'anthropic', 'openai', 'custom')
 * @param model 模型 ID
 * @param apiKey API Key
 * @param customBaseUrl 自定义 API 地址（用于 custom provider）
 * @param apiFormat API 格式
 * @returns OpenClaw 格式的 models 配置对象
 */
export function buildOpenClawModelsJson(
  providerKey: string,
  model: string,
  apiKey: string,
  customBaseUrl?: string,
  apiFormat?: string
): Record<string, unknown> {
  const provider = PROVIDERS[providerKey];
  if (!provider) {
    throw new Error(`未知 provider: ${providerKey}`);
  }

  // 转换模型列表为 OpenClaw 格式
  const modelsConfig = provider.models.map(m => ({
    id: m.id,
    name: m.name,
    reasoning: m.reasoning || false,
    input: m.input || ['text'],
    cost: m.cost || { input: 0, output: 0 },
    contextWindow: m.contextWindow || 128000,
    maxTokens: m.maxTokens || 4096,
  }));

  // 构建 provider 配置
  // custom provider 使用用户提供的 baseUrl
  const providerBaseUrl = providerKey === 'custom' && customBaseUrl ? customBaseUrl : provider.baseUrl;
  const providerConfig: Record<string, unknown> = {
    baseUrl: providerBaseUrl,
    // 如果指定了 apiFormat，使用它
    api: (apiFormat && apiFormat !== 'openai-completions') ? apiFormat : (provider.api || provider.apiFormat),
  };

  // 添加 API Key（写入环境变量引用）
  if (apiKey) {
    providerConfig.apiKey = apiKey;
  }

  // 添加额外的 provider 配置
  if (provider.injectNumCtxForOpenAICompat) {
    providerConfig.injectNumCtxForOpenAICompat = true;
  }
  if (provider.headers) {
    providerConfig.headers = provider.headers;
  }
  if (provider.authHeader !== undefined) {
    providerConfig.authHeader = provider.authHeader;
  }

  // 添加 models
  providerConfig.models = modelsConfig;

  return {
    providers: {
      [providerKey]: providerConfig,
    },
  };
}

/**
 * 获取默认的 OpenClaw agents 配置
 * 设置默认模型
 * @param providerKey provider 标识符
 * @param model 模型 ID
 * @param modelAlias 模型别名（可选）
 */
export function buildOpenClawAgentsConfig(
  providerKey: string,
  model: string,
  modelAlias?: string
): Record<string, unknown> {
  // 模型引用格式：provider/model-id
  const modelRef = `${providerKey}/${model}`;

  // 构建模型别名配置
  const modelConfig: Record<string, unknown> = {};
  if (modelAlias) {
    modelConfig.alias = modelAlias;
  }

  // 使用 object 格式，支持 primary + fallbacks
  return {
    agents: {
      defaults: {
        model: {
          primary: modelRef,
        },
        models: {
          [modelRef]: modelConfig,
        },
      },
    },
  };
}

export { PROVIDERS };
