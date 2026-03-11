import { describe, it, expect } from 'vitest';

const ANTHROPIC_API_FORMAT = 'anthropic-messages';
const CUSTOM_PROVIDER_DEFAULT_CONTEXT_WINDOW = 16000;
const CUSTOM_PROVIDER_DEFAULT_MAX_TOKENS = 4096;

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
    const url = new URL(baseUrl);
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

function normalizeEndpointId(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildEndpointIdFromUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
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

describe('normalizeApiFormat', () => {
  it('should return anthropic-messages for anthropic', () => {
    expect(normalizeApiFormat('anthropic')).toBe('anthropic-messages');
  });

  it('should return openai-completions for openai', () => {
    expect(normalizeApiFormat('openai')).toBe('openai-completions');
  });

  it('should return openai-completions for empty value', () => {
    expect(normalizeApiFormat('')).toBe('openai-completions');
    expect(normalizeApiFormat(null)).toBe('openai-completions');
    expect(normalizeApiFormat(undefined)).toBe('openai-completions');
  });

  it('should return normalized value for other formats', () => {
    expect(normalizeApiFormat('custom-format')).toBe('custom-format');
  });

  it('should trim whitespace', () => {
    expect(normalizeApiFormat('  anthropic  ')).toBe('anthropic-messages');
  });
});

describe('normalizeCustomCompatibilityChoice', () => {
  it('should return anthropic for anthropic', () => {
    expect(normalizeCustomCompatibilityChoice('anthropic')).toBe('anthropic');
  });

  it('should return anthropic for anthropic-messages', () => {
    expect(normalizeCustomCompatibilityChoice('anthropic-messages')).toBe('anthropic');
  });

  it('should return openai for openai', () => {
    expect(normalizeCustomCompatibilityChoice('openai')).toBe('openai');
  });

  it('should return unknown for unknown', () => {
    expect(normalizeCustomCompatibilityChoice('unknown')).toBe('unknown');
  });

  it('should handle case insensitivity', () => {
    expect(normalizeCustomCompatibilityChoice('ANTHROPIC')).toBe('anthropic');
  });

  it('should return openai for unrecognized values', () => {
    expect(normalizeCustomCompatibilityChoice('custom')).toBe('openai');
  });
});

describe('resolveApiFormatFromCompatibility', () => {
  it('should return anthropic-messages for anthropic', () => {
    expect(resolveApiFormatFromCompatibility('anthropic')).toBe('anthropic-messages');
  });

  it('should return openai-completions for openai', () => {
    expect(resolveApiFormatFromCompatibility('openai')).toBe('openai-completions');
  });
});

describe('isAzureUrl', () => {
  it('should detect Azure OpenAI URLs', () => {
    expect(isAzureUrl('https://myresource.services.ai.azure.com')).toBe(true);
    expect(isAzureUrl('https://myresource.openai.azure.com')).toBe(true);
  });

  it('should reject non-Azure URLs', () => {
    expect(isAzureUrl('https://api.openai.com')).toBe(false);
    expect(isAzureUrl('https://api.anthropic.com')).toBe(false);
  });

  it('should handle case insensitivity', () => {
    expect(isAzureUrl('https://MyResource.Services.Ai.Azure.Com')).toBe(true);
  });

  it('should handle invalid URLs', () => {
    expect(isAzureUrl('not-a-url')).toBe(false);
    expect(isAzureUrl('')).toBe(false);
  });
});

describe('transformAzureUrl', () => {
  it('should add deployment path for non-deployment URLs', () => {
    const result = transformAzureUrl('https://myresource.azure.com', 'my-model');
    expect(result).toContain('/openai/deployments/my-model');
  });

  it('should not modify URLs with existing deployment path', () => {
    const url = 'https://myresource.azure.com/openai/deployments/existing-model';
    const result = transformAzureUrl(url, 'new-model');
    expect(result).toBe(url);
  });

  it('should handle trailing slash', () => {
    const result = transformAzureUrl('https://myresource.azure.com/', 'my-model');
    // The function removes trailing slash then adds /openai/deployments/model
    expect(result).toContain('/openai/deployments/my-model');
  });
});

describe('getAnthropicBaseUrl', () => {
  it('should add /v1 suffix if not present', () => {
    expect(getAnthropicBaseUrl('https://api.anthropic.com')).toBe('https://api.anthropic.com/v1');
  });

  it('should not modify URLs with /v1 suffix', () => {
    expect(getAnthropicBaseUrl('https://api.anthropic.com/v1')).toBe('https://api.anthropic.com/v1');
  });

  it('should handle case insensitivity', () => {
    expect(getAnthropicBaseUrl('https://API.ANTHROPIC.COM')).toBe('https://API.ANTHROPIC.COM/v1');
  });

  it('should handle empty string', () => {
    expect(getAnthropicBaseUrl('')).toBe('');
  });

  it('should handle URLs with trailing slashes', () => {
    expect(getAnthropicBaseUrl('https://api.anthropic.com/')).toBe('https://api.anthropic.com/v1');
    expect(getAnthropicBaseUrl('https://api.anthropic.com//')).toBe('https://api.anthropic.com/v1');
  });
});

describe('normalizeEndpointId', () => {
  it('should convert to lowercase', () => {
    expect(normalizeEndpointId('MyModel')).toBe('mymodel');
  });

  it('should replace non-alphanumeric characters with dash', () => {
    expect(normalizeEndpointId('my_model.name')).toBe('my-model-name');
  });

  it('should remove leading and trailing dashes', () => {
    expect(normalizeEndpointId('-my-model-')).toBe('my-model');
  });

  it('should handle special characters', () => {
    expect(normalizeEndpointId('model@#$%')).toBe('model');
  });

  it('should handle empty value', () => {
    expect(normalizeEndpointId('')).toBe('');
  });

  it('should handle undefined/null', () => {
    expect(normalizeEndpointId(undefined)).toBe('');
    expect(normalizeEndpointId(null)).toBe('');
  });
});

describe('buildEndpointIdFromUrl', () => {
  it('should extract hostname and create endpoint ID', () => {
    const result = buildEndpointIdFromUrl('https://api.example.com/v1');
    expect(result).toContain('custom-api-example-com');
  });

  it('should include port if present', () => {
    const result = buildEndpointIdFromUrl('https://api.example.com:8080/v1');
    expect(result).toContain('8080');
  });

  it('should handle invalid URLs', () => {
    expect(buildEndpointIdFromUrl('not-a-url')).toBe('custom');
    expect(buildEndpointIdFromUrl('')).toBe('custom');
  });
});

describe('resolveCustomBaseUrlForConfig', () => {
  it('should return empty string for empty baseUrl', () => {
    expect(resolveCustomBaseUrlForConfig('', 'model')).toBe('');
  });

  it('should transform Azure URL with model', () => {
    // isAzureUrl checks for .services.ai.azure.com OR .openai.azure.com
    const result = resolveCustomBaseUrlForConfig('https://myservice.services.ai.azure.com', 'my-model');
    expect(result).toContain('/openai/deployments/my-model');
  });

  it('should not transform non-Azure URLs', () => {
    const url = 'https://api.example.com';
    expect(resolveCustomBaseUrlForConfig(url, 'model')).toBe(url);
  });

  it('should not transform Azure URL without model', () => {
    const url = 'https://myresource.azure.com';
    expect(resolveCustomBaseUrlForConfig(url, '')).toBe(url);
    expect(resolveCustomBaseUrlForConfig(url, null)).toBe(url);
  });
});

describe('Constants', () => {
  it('should have correct ANTHROPIC_API_FORMAT', () => {
    expect(ANTHROPIC_API_FORMAT).toBe('anthropic-messages');
  });

  it('should have correct default context window', () => {
    expect(CUSTOM_PROVIDER_DEFAULT_CONTEXT_WINDOW).toBe(16000);
  });

  it('should have correct default max tokens', () => {
    expect(CUSTOM_PROVIDER_DEFAULT_MAX_TOKENS).toBe(4096);
  });
});
