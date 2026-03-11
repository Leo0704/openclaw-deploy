import { describe, it, expect } from 'vitest';

describe('Provider Catalog', () => {
  const PROVIDERS = {
    anthropic: {
      name: 'Anthropic (Claude 直连)',
      icon: '🟠',
      type: 'direct',
      apiFormat: 'anthropic-messages',
      envKey: 'ANTHROPIC_API_KEY',
      baseUrl: 'https://api.anthropic.com',
      models: [
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', recommended: true, contextWindow: 200000, maxTokens: 16000 },
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
      ]
    },
    openrouter: {
      name: 'OpenRouter (多模型聚合)',
      icon: '🟣',
      type: 'proxy',
      apiFormat: 'openai-completions',
      envKey: 'OPENROUTER_API_KEY',
      baseUrl: 'https://openrouter.ai/api/v1',
      models: []
    },
    aliyun_bailian: {
      name: '阿里云百炼 (国内)',
      icon: '🟡',
      type: 'proxy',
      apiFormat: 'openai-completions',
      envKey: 'ALIYUN_API_KEY',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      models: []
    },
    deepseek: {
      name: 'DeepSeek (国内)',
      icon: '🔷',
      type: 'proxy',
      apiFormat: 'openai-completions',
      envKey: 'DEEPSEEK_API_KEY',
      baseUrl: 'https://api.deepseek.com/v1',
      models: []
    },
    custom: {
      name: '自定义 API (高级)',
      icon: '⚙️',
      type: 'custom',
      apiFormat: 'openai-completions',
      envKey: 'CUSTOM_API_KEY',
      baseUrl: '',
      models: [
        { id: 'custom', name: '自定义模型', contextWindow: 128000, maxTokens: 4096 }
      ]
    }
  };

  describe('Provider structure', () => {
    it('should have all required providers', () => {
      expect(Object.keys(PROVIDERS)).toContain('anthropic');
      expect(Object.keys(PROVIDERS)).toContain('openai');
      expect(Object.keys(PROVIDERS)).toContain('google');
      expect(Object.keys(PROVIDERS)).toContain('deepseek');
      expect(Object.keys(PROVIDERS)).toContain('custom');
    });

    it('should have correct structure for each provider', () => {
      for (const [key, provider] of Object.entries(PROVIDERS)) {
        expect(provider).toHaveProperty('name');
        expect(provider).toHaveProperty('icon');
        expect(provider).toHaveProperty('type');
        expect(provider).toHaveProperty('apiFormat');
        expect(provider).toHaveProperty('envKey');
        expect(provider).toHaveProperty('baseUrl');
        expect(provider).toHaveProperty('models');
        expect(Array.isArray(provider.models)).toBe(true);
      }
    });
  });

  describe('Provider types', () => {
    it('should have direct type providers', () => {
      const directProviders = Object.values(PROVIDERS).filter(p => p.type === 'direct');
      expect(directProviders.length).toBeGreaterThan(0);
      expect(directProviders.find(p => p.name.includes('Anthropic'))).toBeDefined();
    });

    it('should have proxy type providers', () => {
      const proxyProviders = Object.values(PROVIDERS).filter(p => p.type === 'proxy');
      expect(proxyProviders.length).toBeGreaterThan(0);
    });

    it('should have custom type provider', () => {
      expect(PROVIDERS.custom.type).toBe('custom');
    });
  });

  describe('Provider env keys', () => {
    it('should have correct env key format', () => {
      for (const provider of Object.values(PROVIDERS)) {
        expect(provider.envKey).toMatch(/^[A-Z][A-Z0-9_]*$/);
      }
    });

    it('should have unique env keys', () => {
      const envKeys = Object.values(PROVIDERS).map(p => p.envKey);
      const uniqueKeys = new Set(envKeys);
      expect(uniqueKeys.size).toBe(envKeys.length);
    });
  });

  describe('Model structure', () => {
    it('should have recommended model for providers with models', () => {
      // Only check providers that should have recommended models
      const providersWithRecommended = ['anthropic', 'openai', 'google', 'openrouter', 'aliyun_bailian', 'deepseek'];
      for (const key of providersWithRecommended) {
        const provider = PROVIDERS[key as keyof typeof PROVIDERS];
        if (provider.models.length > 0) {
          const hasRecommended = provider.models.some(m => m.recommended);
          // At least some models should be recommended
          expect(provider.models.some(m => m.recommended === true)).toBe(true);
        }
      }
    });

    it('should have required model properties', () => {
      const anthropic = PROVIDERS.anthropic;
      const model = anthropic.models[0];
      expect(model).toHaveProperty('id');
      expect(model).toHaveProperty('name');
      expect(model).toHaveProperty('contextWindow');
      expect(model).toHaveProperty('maxTokens');
    });

    it('should have numeric context window and max tokens', () => {
      const anthropic = PROVIDERS.anthropic;
      const model = anthropic.models[0];
      expect(typeof model.contextWindow).toBe('number');
      expect(typeof model.maxTokens).toBe('number');
      expect(model.contextWindow).toBeGreaterThan(0);
      expect(model.maxTokens).toBeGreaterThan(0);
    });
  });

  describe('Base URLs', () => {
    it('should have valid base URLs', () => {
      for (const provider of Object.values(PROVIDERS)) {
        if (provider.baseUrl) {
          expect(provider.baseUrl).toMatch(/^https?:\/\/.+/);
        }
      }
    });

    it('should allow empty base URL for custom provider', () => {
      expect(PROVIDERS.custom.baseUrl).toBe('');
    });
  });

  describe('Icons', () => {
    it('should have emoji icons', () => {
      for (const provider of Object.values(PROVIDERS)) {
        expect(provider.icon.length).toBeGreaterThan(0);
        // Check it's a single emoji (roughly)
        expect(provider.icon.length).toBeLessThanOrEqual(4);
      }
    });
  });

  describe('Provider Lookup Functions', () => {
    function getProvider(key: string) {
      return PROVIDERS[key as keyof typeof PROVIDERS];
    }

    function getProviderOrCustom(key: string) {
      return PROVIDERS[key as keyof typeof PROVIDERS] || PROVIDERS.custom;
    }

    function getRecommendedModel(providerKey: string) {
      const provider = PROVIDERS[providerKey as keyof typeof PROVIDERS];
      if (!provider || provider.models.length === 0) return undefined;
      return provider.models.find(m => m.recommended);
    }

    it('should return undefined for unknown provider', () => {
      expect(getProvider('unknown_provider')).toBeUndefined();
    });

    it('should return custom provider as fallback', () => {
      const provider = getProviderOrCustom('nonexistent');
      expect(provider.type).toBe('custom');
    });

    it('should find recommended model for providers with models', () => {
      const model = getRecommendedModel('anthropic');
      expect(model).toBeDefined();
      expect(model?.recommended).toBe(true);
    });

    it('should return undefined for provider without models', () => {
      const model = getRecommendedModel('openrouter');
      expect(model).toBeUndefined();
    });
  });

  describe('Model Validation', () => {
    it('should have maxTokens <= contextWindow for all models', () => {
      for (const [providerKey, provider] of Object.entries(PROVIDERS)) {
        for (const model of provider.models) {
          expect(
            model.maxTokens,
            `${providerKey}/${model.id}: maxTokens should not exceed contextWindow`
          ).toBeLessThanOrEqual(model.contextWindow);
        }
      }
    });

    it('should have reasonable context window sizes', () => {
      const MIN_CONTEXT = 1000;
      const MAX_CONTEXT = 10_000_000;

      for (const [providerKey, provider] of Object.entries(PROVIDERS)) {
        for (const model of provider.models) {
          expect(
            model.contextWindow,
            `${providerKey}/${model.id}: contextWindow should be reasonable`
          ).toBeGreaterThanOrEqual(MIN_CONTEXT);
          expect(
            model.contextWindow,
            `${providerKey}/${model.id}: contextWindow should be reasonable`
          ).toBeLessThanOrEqual(MAX_CONTEXT);
        }
      }
    });

    it('should have non-empty model IDs', () => {
      for (const [providerKey, provider] of Object.entries(PROVIDERS)) {
        for (const model of provider.models) {
          expect(
            model.id.length,
            `${providerKey}: model ID should not be empty`
          ).toBeGreaterThan(0);
        }
      }
    });

    it('should have unique model IDs within each provider', () => {
      for (const [providerKey, provider] of Object.entries(PROVIDERS)) {
        const ids = provider.models.map(m => m.id);
        const uniqueIds = new Set(ids);
        expect(
          uniqueIds.size,
          `${providerKey}: model IDs should be unique`
        ).toBe(ids.length);
      }
    });
  });

  describe('API Format Mapping', () => {
    it('should use anthropic-messages for Anthropic provider', () => {
      expect(PROVIDERS.anthropic.apiFormat).toBe('anthropic-messages');
    });

    it('should use openai-completions for OpenAI provider', () => {
      expect(PROVIDERS.openai.apiFormat).toBe('openai-completions');
    });

    it('should use google for Google provider', () => {
      expect(PROVIDERS.google.apiFormat).toBe('google');
    });

    it('should use openai-completions for proxy providers', () => {
      expect(PROVIDERS.deepseek.apiFormat).toBe('openai-completions');
      expect(PROVIDERS.aliyun_bailian.apiFormat).toBe('openai-completions');
    });
  });

  describe('URL Format Validation', () => {
    it('should not have trailing slashes in base URLs', () => {
      for (const [key, provider] of Object.entries(PROVIDERS)) {
        if (provider.baseUrl && provider.baseUrl.length > 0) {
          expect(
            provider.baseUrl.endsWith('/'),
            `${key}: baseUrl should not have trailing slash`
          ).toBe(false);
        }
      }
    });

    it('should use HTTPS for all URLs', () => {
      for (const [key, provider] of Object.entries(PROVIDERS)) {
        if (provider.baseUrl && provider.baseUrl.length > 0) {
          expect(
            provider.baseUrl.startsWith('https://'),
            `${key}: baseUrl should use HTTPS`
          ).toBe(true);
        }
      }
    });
  });

  describe('Domestic Providers (China)', () => {
    it('should have providers labeled with 国内', () => {
      const domesticProviders = Object.entries(PROVIDERS)
        .filter(([_, p]) => p.name.includes('国内'));

      expect(domesticProviders.length).toBeGreaterThan(0);
    });

    it('should have DeepSeek as domestic provider', () => {
      expect(PROVIDERS.deepseek.name).toContain('国内');
    });

    it('should have Aliyun as domestic provider', () => {
      expect(PROVIDERS.aliyun_bailian.name).toContain('国内');
    });
  });

  describe('Provider Type Distribution', () => {
    it('should have at least 3 direct providers', () => {
      const directCount = Object.values(PROVIDERS).filter(p => p.type === 'direct').length;
      expect(directCount).toBeGreaterThanOrEqual(3);
    });

    it('should have at least 2 proxy providers', () => {
      const proxyCount = Object.values(PROVIDERS).filter(p => p.type === 'proxy').length;
      expect(proxyCount).toBeGreaterThanOrEqual(2);
    });

    it('should have exactly 1 custom provider', () => {
      const customCount = Object.values(PROVIDERS).filter(p => p.type === 'custom').length;
      expect(customCount).toBe(1);
    });
  });
});
