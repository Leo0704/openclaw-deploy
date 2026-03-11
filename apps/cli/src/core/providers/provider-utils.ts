const { URL: NodeURL } = require('url') as typeof import('url');

export const ANTHROPIC_API_FORMAT = 'anthropic-messages';
export const CUSTOM_PROVIDER_DEFAULT_CONTEXT_WINDOW = 16000;
export const CUSTOM_PROVIDER_DEFAULT_MAX_TOKENS = 4096;

export function normalizeApiFormat(value: unknown): string {
  const normalized = String(value || '').trim();
  if (normalized === 'anthropic') {
    return ANTHROPIC_API_FORMAT;
  }
  if (normalized === 'openai' || !normalized) {
    return 'openai-completions';
  }
  return normalized;
}

export function normalizeCustomCompatibilityChoice(value: unknown): 'openai' | 'anthropic' | 'unknown' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'anthropic' || normalized === ANTHROPIC_API_FORMAT) {
    return 'anthropic';
  }
  if (normalized === 'unknown') {
    return 'unknown';
  }
  return 'openai';
}

export function resolveApiFormatFromCompatibility(value: unknown): string {
  return normalizeCustomCompatibilityChoice(value) === 'anthropic' ? ANTHROPIC_API_FORMAT : 'openai-completions';
}

export function isAzureUrl(baseUrl: string): boolean {
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

export function getAnthropicBaseUrl(baseUrl: string): string {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    return trimmed;
  }
  return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

export function buildEndpointUrl(baseUrl: string, endpointPath: string): URL {
  const normalizedBase = String(baseUrl || '').trim().replace(/\/+$/, '');
  const normalizedPath = String(endpointPath || '').trim().replace(/^\/+/, '');
  return new NodeURL(`${normalizedBase}/${normalizedPath}`);
}

export function normalizeEndpointId(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildEndpointIdFromUrl(baseUrl: string): string {
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

export function resolveCustomBaseUrlForConfig(baseUrl: string, modelId: string): string {
  const trimmedBaseUrl = String(baseUrl || '').trim();
  const trimmedModelId = String(modelId || '').trim();
  if (!trimmedBaseUrl) {
    return trimmedBaseUrl;
  }
  return isAzureUrl(trimmedBaseUrl) && trimmedModelId ? transformAzureUrl(trimmedBaseUrl, trimmedModelId) : trimmedBaseUrl;
}

export function buildCustomProviderConfig(config: Record<string, unknown>, providerBaseUrl: string, modelId: string) {
  const providerId = normalizeEndpointId(config.customEndpointId) || buildEndpointIdFromUrl(providerBaseUrl) || 'custom';
  const modelRef = `${providerId}/${modelId}`;
  const alias = String(config.customModelAlias || '').trim();
  const providerConfig: Record<string, unknown> = {
    baseUrl: providerBaseUrl,
    apiKey: config.apiKey,
    api: normalizeApiFormat(config.apiFormat || 'openai-completions'),
    models: [
      {
        id: modelId,
        name: modelId,
        contextWindow: Number(config.contextWindow || CUSTOM_PROVIDER_DEFAULT_CONTEXT_WINDOW),
        maxTokens: Number(config.maxTokens || CUSTOM_PROVIDER_DEFAULT_MAX_TOKENS),
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
