import { describe, it, expect } from 'vitest';

// 复制 config-service 中的纯函数逻辑进行测试
describe('Config Service Validation', () => {
  describe('Port Validation', () => {
    function validateGatewayPort(port: number): { valid: boolean; error?: string } {
      if (port < 1024 || port > 65535) {
        return { valid: false, error: '端口号必须在 1024-65535 之间' };
      }
      return { valid: true };
    }

    it('should accept valid port numbers', () => {
      expect(validateGatewayPort(1024)).toEqual({ valid: true });
      expect(validateGatewayPort(8080)).toEqual({ valid: true });
      expect(validateGatewayPort(65535)).toEqual({ valid: true });
    });

    it('should reject ports below 1024', () => {
      expect(validateGatewayPort(80).valid).toBe(false);
      expect(validateGatewayPort(0).valid).toBe(false);
      expect(validateGatewayPort(1023).valid).toBe(false);
    });

    it('should reject ports above 65535', () => {
      expect(validateGatewayPort(65536).valid).toBe(false);
      expect(validateGatewayPort(100000).valid).toBe(false);
    });

    it('should return appropriate error message', () => {
      const result = validateGatewayPort(80);
      expect(result.error).toBe('端口号必须在 1024-65535 之间');
    });
  });

  describe('API Key Validation', () => {
    function validateApiKey(apiKey: string | undefined): { valid: boolean; error?: string } {
      if (apiKey !== undefined && apiKey && apiKey.length < 10) {
        return { valid: false, error: 'API Key 格式不正确' };
      }
      return { valid: true };
    }

    it('should accept valid API keys', () => {
      expect(validateApiKey('sk-1234567890abcdef')).toEqual({ valid: true });
      expect(validateApiKey('valid-api-key-with-sufficient-length')).toEqual({ valid: true });
    });

    it('should accept empty API key (for clearing)', () => {
      expect(validateApiKey('')).toEqual({ valid: true });
    });

    it('should accept undefined API key', () => {
      expect(validateApiKey(undefined)).toEqual({ valid: true });
    });

    it('should reject short API keys', () => {
      expect(validateApiKey('short').valid).toBe(false);
      expect(validateApiKey('123456789').valid).toBe(false); // 9 chars
    });

    it('should accept API keys with exactly 10 characters', () => {
      expect(validateApiKey('1234567890')).toEqual({ valid: true }); // exactly 10 chars
    });

    it('should return appropriate error message', () => {
      const result = validateApiKey('short');
      expect(result.error).toBe('API Key 格式不正确');
    });
  });

  describe('Config Field Normalization', () => {
    function normalizeApiFormat(value: unknown): string {
      const normalized = String(value || '').trim();
      if (normalized === 'anthropic') {
        return 'anthropic-messages';
      }
      if (normalized === 'openai' || !normalized) {
        return 'openai-completions';
      }
      return normalized;
    }

    function normalizeEndpointId(value: unknown): string {
      const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      return normalized || 'custom';
    }

    function normalizeModelAlias(value: unknown): string {
      return String(value || '').trim();
    }

    it('should normalize apiFormat to openai-completions by default', () => {
      expect(normalizeApiFormat('')).toBe('openai-completions');
      expect(normalizeApiFormat(null)).toBe('openai-completions');
      expect(normalizeApiFormat(undefined)).toBe('openai-completions');
    });

    it('should normalize anthropic to anthropic-messages', () => {
      expect(normalizeApiFormat('anthropic')).toBe('anthropic-messages');
      expect(normalizeApiFormat('  anthropic  ')).toBe('anthropic-messages');
    });

    it('should preserve other api formats', () => {
      expect(normalizeApiFormat('google')).toBe('google');
      expect(normalizeApiFormat('custom-format')).toBe('custom-format');
    });

    it('should normalize endpointId correctly', () => {
      expect(normalizeEndpointId('MyEndpoint')).toBe('myendpoint');
      expect(normalizeEndpointId('my_endpoint.name')).toBe('my-endpoint-name');
      expect(normalizeEndpointId('-test-')).toBe('test');
    });

    it('should return custom for empty endpointId', () => {
      expect(normalizeEndpointId('')).toBe('custom');
      expect(normalizeEndpointId(null)).toBe('custom');
      expect(normalizeEndpointId(undefined)).toBe('custom');
    });

    it('should normalize model alias', () => {
      expect(normalizeModelAlias('  My Model  ')).toBe('My Model');
      expect(normalizeModelAlias('')).toBe('');
    });
  });

  describe('Config Update Logic', () => {
    interface MockConfig {
      apiKey?: string;
      gatewayPort?: number;
      provider?: string;
      model?: string;
      baseUrl?: string;
      apiFormat?: string;
      customModelId?: string;
      customEndpointId?: string;
      customModelAlias?: string;
      contextWindow?: number;
      maxTokens?: number;
      licenseServerUrl?: string;
      purchaseUrl?: string;
    }

    function updateConfig(
      data: Partial<MockConfig>,
      config: MockConfig
    ): MockConfig {
      const updated = { ...config };

      if (data.apiKey !== undefined) updated.apiKey = data.apiKey;
      if (data.gatewayPort !== undefined) updated.gatewayPort = data.gatewayPort;
      if (data.provider) updated.provider = data.provider;
      if (data.model) updated.model = data.model;
      if (data.baseUrl !== undefined) updated.baseUrl = data.baseUrl;
      if (data.apiFormat !== undefined) {
        updated.apiFormat = normalizeApiFormat(data.apiFormat);
      }
      if (data.customModelId !== undefined) updated.customModelId = data.customModelId;
      if (data.customEndpointId !== undefined) {
        updated.customEndpointId = normalizeEndpointId(data.customEndpointId);
      }
      if (data.customModelAlias !== undefined) {
        updated.customModelAlias = String(data.customModelAlias || '').trim();
      }
      if (data.contextWindow !== undefined) updated.contextWindow = data.contextWindow;
      if (data.maxTokens !== undefined) updated.maxTokens = data.maxTokens;
      if (data.licenseServerUrl !== undefined) updated.licenseServerUrl = data.licenseServerUrl;
      if (data.purchaseUrl !== undefined) updated.purchaseUrl = data.purchaseUrl;

      return updated;
    }

    function normalizeApiFormat(value: unknown): string {
      const normalized = String(value || '').trim();
      if (normalized === 'anthropic') return 'anthropic-messages';
      if (normalized === 'openai' || !normalized) return 'openai-completions';
      return normalized;
    }

    function normalizeEndpointId(value: unknown): string {
      const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      return normalized || 'custom';
    }

    it('should update individual fields', () => {
      const config: MockConfig = {};
      const updated = updateConfig({ provider: 'openai' }, config);

      expect(updated.provider).toBe('openai');
    });

    it('should preserve existing config values', () => {
      const config: MockConfig = { provider: 'anthropic', model: 'claude-3' };
      const updated = updateConfig({ gatewayPort: 8080 }, config);

      expect(updated.provider).toBe('anthropic');
      expect(updated.model).toBe('claude-3');
      expect(updated.gatewayPort).toBe(8080);
    });

    it('should update multiple fields at once', () => {
      const config: MockConfig = {};
      const updated = updateConfig({
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'sk-test-key-123456',
        gatewayPort: 9000,
      }, config);

      expect(updated.provider).toBe('openai');
      expect(updated.model).toBe('gpt-4');
      expect(updated.apiKey).toBe('sk-test-key-123456');
      expect(updated.gatewayPort).toBe(9000);
    });

    it('should normalize apiFormat on update', () => {
      const config: MockConfig = {};
      const updated = updateConfig({ apiFormat: 'anthropic' }, config);

      expect(updated.apiFormat).toBe('anthropic-messages');
    });

    it('should normalize customEndpointId on update', () => {
      const config: MockConfig = {};
      const updated = updateConfig({ customEndpointId: 'My_Custom_ID' }, config);

      expect(updated.customEndpointId).toBe('my-custom-id');
    });

    it('should not update fields when value is undefined (preserves existing)', () => {
      const config: MockConfig = { apiKey: 'existing-key', baseUrl: 'https://api.example.com' };
      const updated = updateConfig({ apiKey: undefined, baseUrl: undefined }, config);

      // undefined values don't trigger updates (condition: !== undefined)
      expect(updated.apiKey).toBe('existing-key');
      expect(updated.baseUrl).toBe('https://api.example.com');
    });

    it('should clear fields with empty string', () => {
      const config: MockConfig = { apiKey: 'existing-key', baseUrl: 'https://api.example.com' };
      const updated = updateConfig({ apiKey: '', baseUrl: '' }, config);

      expect(updated.apiKey).toBe('');
      expect(updated.baseUrl).toBe('');
    });

    it('should not mutate original config', () => {
      const config: MockConfig = { provider: 'anthropic' };
      updateConfig({ provider: 'openai' }, config);

      expect(config.provider).toBe('anthropic');
    });
  });

  describe('Test Connection URL Building', () => {
    function buildTestConnectionUrl(
      baseUrl: string,
      apiFormat: string,
      model: string
    ): { url: string; isAnthropic: boolean; isAzure: boolean } {
      const isAnthropic = apiFormat === 'anthropic-messages';
      const isAzure = !isAnthropic && (
        baseUrl.includes('.services.ai.azure.com') ||
        baseUrl.includes('.openai.azure.com')
      );

      let requestBaseUrl = baseUrl;
      if (isAnthropic && !baseUrl.endsWith('/v1')) {
        requestBaseUrl = baseUrl.replace(/\/+$/, '') + '/v1';
      }

      const endpoint = isAnthropic ? 'messages' : 'chat/completions';
      const url = `${requestBaseUrl.replace(/\/+$/, '')}/${endpoint}`;

      return { url, isAnthropic, isAzure };
    }

    it('should build Anthropic messages endpoint', () => {
      const result = buildTestConnectionUrl(
        'https://api.anthropic.com',
        'anthropic-messages',
        'claude-3'
      );

      expect(result.isAnthropic).toBe(true);
      expect(result.url).toContain('/v1/messages');
    });

    it('should detect Azure OpenAI URLs', () => {
      const result = buildTestConnectionUrl(
        'https://myresource.openai.azure.com',
        'openai-completions',
        'gpt-4'
      );

      expect(result.isAzure).toBe(true);
      expect(result.isAnthropic).toBe(false);
      expect(result.url).toContain('/chat/completions');
    });

    it('should detect Azure services.ai URLs', () => {
      const result = buildTestConnectionUrl(
        'https://myresource.services.ai.azure.com',
        'openai-completions',
        'gpt-4'
      );

      expect(result.isAzure).toBe(true);
    });

    it('should build OpenAI compatible endpoint', () => {
      const result = buildTestConnectionUrl(
        'https://api.openai.com/v1',
        'openai-completions',
        'gpt-4'
      );

      expect(result.isAnthropic).toBe(false);
      expect(result.isAzure).toBe(false);
      expect(result.url).toContain('/chat/completions');
    });

    it('should handle URLs with trailing slashes', () => {
      const result = buildTestConnectionUrl(
        'https://api.example.com/v1/',
        'openai-completions',
        'model'
      );

      expect(result.url).not.toContain('//v1//');
      expect(result.url).toContain('/chat/completions');
    });
  });

  describe('Test Connection Request Body', () => {
    function buildTestRequestBody(
      isAnthropic: boolean,
      isAzure: boolean,
      model: string
    ): Record<string, unknown> {
      if (isAnthropic) {
        return {
          model,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
          stream: false,
        };
      }

      if (isAzure) {
        return {
          messages: [{ role: 'user', content: 'hi' }],
          max_completion_tokens: 5,
          stream: false,
        };
      }

      return {
        model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
        stream: false,
      };
    }

    it('should build Anthropic request body with model', () => {
      const body = buildTestRequestBody(true, false, 'claude-3');

      expect(body.model).toBe('claude-3');
      expect(body.max_tokens).toBe(1);
      expect(body.stream).toBe(false);
    });

    it('should build Azure request body without model in body', () => {
      const body = buildTestRequestBody(false, true, 'gpt-4');

      expect(body.model).toBeUndefined();
      expect((body as any).max_completion_tokens).toBe(5);
    });

    it('should build OpenAI request body with model', () => {
      const body = buildTestRequestBody(false, false, 'gpt-4');

      expect(body.model).toBe('gpt-4');
      expect(body.max_tokens).toBe(1);
    });
  });
});

describe('Provider Selection', () => {
  function selectProvider(
    providerKey: string,
    providers: Record<string, { baseUrl: string; apiFormat: string }>
  ): { baseUrl: string; apiFormat: string } {
    return providers[providerKey] || providers.custom;
  }

  const mockProviders = {
    anthropic: {
      baseUrl: 'https://api.anthropic.com',
      apiFormat: 'anthropic-messages',
    },
    openai: {
      baseUrl: 'https://api.openai.com/v1',
      apiFormat: 'openai-completions',
    },
    custom: {
      baseUrl: '',
      apiFormat: 'openai-completions',
    },
  };

  it('should select correct provider by key', () => {
    const provider = selectProvider('anthropic', mockProviders);
    expect(provider.baseUrl).toBe('https://api.anthropic.com');
  });

  it('should fallback to custom for unknown provider', () => {
    const provider = selectProvider('unknown', mockProviders);
    expect(provider.baseUrl).toBe('');
  });

  it('should use custom provider when specified', () => {
    const provider = selectProvider('custom', mockProviders);
    expect(provider.apiFormat).toBe('openai-completions');
  });
});
