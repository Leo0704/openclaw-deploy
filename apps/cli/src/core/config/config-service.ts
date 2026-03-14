const {
  Errors,
  getUserFriendlyMessage,
} = require('../../shared/errors/error-utils') as typeof import('../../shared/errors/error-utils');

const {
  checkPortAvailability,
} = require('../../core/diagnostics/system-check') as typeof import('../../core/diagnostics/system-check');

const {
  saveConfig,
} = require('./lobster-config') as typeof import('./lobster-config');

const {
  ANTHROPIC_API_FORMAT,
  buildEndpointUrl,
  getAnthropicBaseUrl,
  isAzureUrl,
  normalizeApiFormat,
  normalizeEndpointId,
  resolveCustomBaseUrlForConfig,
} = require('../../core/providers/provider-utils') as typeof import('../../core/providers/provider-utils');

export async function handleConfigAsync(
  data: Record<string, unknown>,
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
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

  if (data.apiKey !== undefined) {
    const apiKey = data.apiKey as string;
    if (apiKey && apiKey.length < 10) {
      return { success: false, error: 'API Key 格式不正确' };
    }
  }

  if (data.apiKey !== undefined) config.apiKey = data.apiKey;
  if (data.gatewayPort !== undefined) config.gatewayPort = data.gatewayPort;
  if (data.provider) config.provider = data.provider;
  if (data.model) config.model = data.model;

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

export async function handleTestConnection(
  data: Record<string, unknown>,
  config: Record<string, unknown>,
  providers: Record<string, Record<string, unknown>>
): Promise<Record<string, unknown>> {
  const providerKey = String(data.provider || config.provider || 'custom').trim();
  const provider = providers[providerKey] || providers.custom;
  const apiKey = String(data.apiKey || config.apiKey || '').trim();
  const baseUrl = String(data.baseUrl || config.baseUrl || provider.baseUrl || '').trim();
  const model = String(data.model || config.model || '').trim();
  const apiFormat = normalizeApiFormat(data.apiFormat || config.apiFormat || provider.apiFormat);

  if (!apiKey) {
    return { success: false, error: '请先输入 API Key' };
  }

  try {
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
      'User-Agent': 'Lobster-Assistant/1.0',
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
