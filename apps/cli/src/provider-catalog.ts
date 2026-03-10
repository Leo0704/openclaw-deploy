const {
  ANTHROPIC_API_FORMAT,
} = require('./provider-utils') as typeof import('./provider-utils');

const PROVIDERS = {
  anthropic: {
    name: 'Anthropic (Claude 直连)',
    icon: '🟠',
    type: 'direct',
    apiFormat: ANTHROPIC_API_FORMAT,
    envKey: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', recommended: true, contextWindow: 200000, maxTokens: 16000 },
      { id: 'claude-opus-4-1-20250805', name: 'Claude Opus 4.1', contextWindow: 200000, maxTokens: 16000 },
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude Sonnet 3.7', contextWindow: 200000, maxTokens: 8192 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', contextWindow: 200000, maxTokens: 8192 },
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
      { id: 'gpt-5.2', name: 'GPT-5.2', recommended: true, contextWindow: 400000, maxTokens: 128000 },
      { id: 'gpt-5-mini', name: 'GPT-5 mini', contextWindow: 400000, maxTokens: 128000 },
      { id: 'gpt-5-nano', name: 'GPT-5 nano', contextWindow: 400000, maxTokens: 128000 },
      { id: 'gpt-4.1', name: 'GPT-4.1', contextWindow: 1047576, maxTokens: 32768 },
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
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', recommended: true, contextWindow: 1000000, maxTokens: 65536 },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 1048576, maxTokens: 65536 },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', contextWindow: 1000000, maxTokens: 65536 },
      { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview', contextWindow: 1048576, maxTokens: 65536 },
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
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', recommended: true, contextWindow: 200000, maxTokens: 16000 },
      { id: 'openai/gpt-5', name: 'GPT-5', contextWindow: 400000, maxTokens: 128000 },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextWindow: 1000000, maxTokens: 65536 },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', contextWindow: 128000, maxTokens: 8192 },
      { id: 'moonshotai/kimi-k2', name: 'Kimi K2', contextWindow: 256000, maxTokens: 32768 },
    ]
  },
  aliyun_bailian: {
    name: '阿里云百炼 (国内)',
    icon: '🟡',
    type: 'proxy',
    apiFormat: 'openai-completions',
    envKey: 'ALIYUN_API_KEY',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    description: '阿里云百炼平台，支持通义千问系列',
    models: [
      { id: 'qwen-plus', name: '通义千问 Plus', recommended: true, contextWindow: 128000, maxTokens: 6000 },
      { id: 'qwen-max', name: '通义千问 Max', contextWindow: 32000, maxTokens: 8000 },
      { id: 'qwen-flash', name: '通义千问 Flash', contextWindow: 1000000, maxTokens: 8192 },
      { id: 'qwen-turbo', name: '通义千问 Turbo', contextWindow: 1000000, maxTokens: 8192 },
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
      { id: 'qwen3-coder-plus', name: 'Qwen3 Coder Plus', recommended: true, contextWindow: 256000, maxTokens: 16384 },
      { id: 'qwen3-coder-flash', name: 'Qwen3 Coder Flash', contextWindow: 256000, maxTokens: 16384 },
      { id: 'qwen-plus', name: 'Qwen Plus', contextWindow: 128000, maxTokens: 8192 },
      { id: 'qwen-max', name: 'Qwen Max', contextWindow: 32000, maxTokens: 8192 },
    ]
  },
  deepseek: {
    name: 'DeepSeek (国内)',
    icon: '🔷',
    type: 'proxy',
    apiFormat: 'openai-completions',
    envKey: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1',
    description: 'DeepSeek 官方 API',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', recommended: true, contextWindow: 64000, maxTokens: 4096 },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', contextWindow: 64000, maxTokens: 8192 },
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
      { id: 'Qwen/Qwen3-Coder-480B-A35B-Instruct', name: 'Qwen3 Coder 480B', contextWindow: 256000, maxTokens: 16384 },
      { id: 'deepseek-ai/DeepSeek-V3.2-Exp', name: 'DeepSeek V3.2 Exp', contextWindow: 128000, maxTokens: 8192 },
      { id: 'THUDM/glm-4.5', name: 'GLM-4.5', contextWindow: 128000, maxTokens: 8192 },
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
      { id: 'kimi-thinking-preview', name: 'Kimi Thinking Preview', recommended: true, contextWindow: 128000, maxTokens: 32768 },
      { id: 'kimi-k2-turbo-preview', name: 'Kimi K2 Turbo Preview', contextWindow: 256000, maxTokens: 32768 },
      { id: 'kimi-k2-0905-preview', name: 'Kimi K2 0905 Preview', contextWindow: 256000, maxTokens: 32768 },
      { id: 'moonshot-v1-128k', name: 'Moonshot V1 128K', contextWindow: 131072, maxTokens: 4096 },
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
      { id: 'glm-5', name: 'GLM-5', recommended: true, contextWindow: 128000, maxTokens: 8192 },
      { id: 'glm-4-plus', name: 'GLM-4 Plus', contextWindow: 128000, maxTokens: 4096 },
      { id: 'glm-4.5', name: 'GLM-4.5', contextWindow: 128000, maxTokens: 8192 },
      { id: 'glm-4-air', name: 'GLM-4 Air', contextWindow: 128000, maxTokens: 4096 },
      { id: 'glm-4-flash', name: 'GLM-4 Flash', contextWindow: 128000, maxTokens: 4096 },
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

export { PROVIDERS };
