/**
 * 网络请求工具
 * 提供带超时、重试机制的网络请求功能
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { createError, fromNativeError, ErrorType, Errors } = require('./error-utils');

// ============================================
// 类型定义
// ============================================

export interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string | Buffer | object;
  timeout?: number;
}

export interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  retryOn?: number[]; // 特定状态码重试
  backoff?: boolean; // 是否使用指数退避
}

export interface FetchResult<T = unknown> {
  success: boolean;
  data?: T;
  status?: number;
  headers?: Record<string, string>;
  error?: Error;
}

export interface NetworkCheckResult {
  connected: boolean;
  latency?: number;
  error?: string;
}

// ============================================
// 默认配置
// ============================================

const DEFAULT_TIMEOUT = 30000; // 30秒
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000; // 1秒
const DEFAULT_CONNECTIVITY_URLS = [
  'https://github.com',
  'https://api.github.com',
  'https://hub.gitmirror.com/https://github.com',
  'https://mirror.ghproxy.com/https://github.com',
  'https://registry.npmmirror.com',
];

// ============================================
// 核心网络请求函数
// ============================================

/**
 * 带超时的 fetch 实现（Node.js 原生）
 */
export async function fetchWithTimeout<T = unknown>(
  url: string,
  options: FetchOptions = {},
  timeout: number = DEFAULT_TIMEOUT
): Promise<FetchResult<T>> {
  return new Promise((resolve) => {
    const effectiveTimeout = options.timeout ?? timeout;
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: effectiveTimeout,
    };

    // 处理 JSON body
    let bodyData: Buffer | null = null;
    if (options.body) {
      if (typeof options.body === 'object' && !Buffer.isBuffer(options.body)) {
        bodyData = Buffer.from(JSON.stringify(options.body));
        requestOptions.headers['Content-Type'] = 'application/json';
      } else {
        bodyData = Buffer.isBuffer(options.body) ? options.body : Buffer.from(options.body as string);
      }
      requestOptions.headers['Content-Length'] = String(bodyData.length);
    }

    const req = client.request(requestOptions, (res: any) => {
      let data = '';
      const headers: Record<string, string> = {};

      // 收集响应头
      Object.entries(res.headers).forEach(([key, value]: [string, any]) => {
        if (value) {
          headers[key] = Array.isArray(value) ? value.join(', ') : value;
        }
      });

      res.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });

      res.on('end', () => {
        let parsedData: T | undefined;
        try {
          // 尝试解析 JSON
          if (res.headers['content-type']?.includes('application/json')) {
            parsedData = JSON.parse(data);
          } else {
            parsedData = data as unknown as T;
          }
        } catch {
          parsedData = data as unknown as T;
        }

        resolve({
          success: res.statusCode ? res.statusCode >= 200 && res.statusCode < 300 : false,
          data: parsedData,
          status: res.statusCode,
          headers,
        });
      });
    });

    req.on('error', (error: NodeJS.ErrnoException) => {
      const appError = fromNativeError(error, ErrorType.NETWORK, { url });
      resolve({
        success: false,
        error: appError,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        error: createError(ErrorType.NETWORK, 'ETIMEDOUT', { context: { url, timeout } }),
      });
    });

    if (bodyData) {
      req.write(bodyData);
    }

    req.end();
  });
}

/**
 * 带重试的请求
 */
export async function fetchWithRetry<T = unknown>(
  url: string,
  options: FetchOptions = {},
  retryOptions: RetryOptions = {}
): Promise<FetchResult<T>> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelay = DEFAULT_RETRY_DELAY,
    timeout = DEFAULT_TIMEOUT,
    retryOn = [429, 500, 502, 503, 504], // 默认在这些状态码时重试
    backoff = true,
  } = retryOptions;

  let lastError: Error | undefined;
  const maxAttempts = maxRetries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {

    try {
      const result = await fetchWithTimeout<T>(url, options, timeout);

      // 成功
      if (result.success) {
        return result;
      }

      // 状态码错误，检查是否需要重试
      if (result.status && retryOn.includes(result.status)) {
        lastError = createError(ErrorType.NETWORK, 'HTTP_' + result.status, {
          userMessage: `HTTP ${result.status} 错误，准备重试...`,
          context: { url, status: result.status, attempt },
        });
      } else if (result.error) {
        lastError = result.error;
        // 网络错误，检查是否应该重试
        const code = (result.error as NodeJS.ErrnoException).code;
        const retryableCodes = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND'];
        if (!retryableCodes.includes(code || '')) {
          // 对于非网络错误，不重试
          return result;
        }
      } else {
        // 其他错误，不重试
        return result;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    // 如果还有重试机会，等待后重试
    if (attempt < maxAttempts) {
      const delay = backoff ? retryDelay * Math.pow(2, attempt - 1) : retryDelay;
      console.log(`[网络] 请求失败，${delay}ms 后进行第 ${attempt} 次重试...`);
      await sleep(delay);
    }
  }

  return {
    success: false,
    error: lastError || createError(ErrorType.NETWORK, 'MAX_RETRIES_EXCEEDED', {
      userMessage: '请求失败，已达到最大重试次数',
      context: { url, attempts: maxAttempts },
    }),
  };
}

/**
 * 简单的 sleep 函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// 网络检查函数
// ============================================

/**
 * 检查网络连接
 */
export async function checkNetworkConnectivity(
  testUrls: string[] = DEFAULT_CONNECTIVITY_URLS
): Promise<NetworkCheckResult[]> {
  return Promise.all(testUrls.map(async (url) => {
    const startTime = Date.now();
    const result = await fetchWithTimeout(url, { method: 'GET', timeout: 5000 });
    const latency = Date.now() - startTime;

    return {
      connected: result.success,
      latency: result.success ? latency : undefined,
      error: result.error?.message,
    };
  }));
}

/**
 * 检查是否有网络连接
 */
export async function hasNetworkConnection(): Promise<boolean> {
  const results = await checkNetworkConnectivity(DEFAULT_CONNECTIVITY_URLS);
  return results.some((r) => r.connected);
}

/**
 * 检查 GitHub 可达性
 */
export async function checkGitHubAccess(): Promise<NetworkCheckResult> {
  const startTime = Date.now();
  const result = await fetchWithTimeout('https://api.github.com', {
    method: 'GET',
    headers: { 'User-Agent': 'Lobster-Assistant' },
  }, 10000);
  const latency = Date.now() - startTime;

  return {
    connected: result.success,
    latency: result.success ? latency : undefined,
    error: result.error?.message,
  };
}

/**
 * 下载文件
 */
export async function downloadFile(
  url: string,
  destPath: string,
  options: {
    timeout?: number;
    onProgress?: (downloaded: number, total: number | null) => void;
    _redirectCount?: number;
  } = {}
): Promise<{ success: boolean; error?: Error; bytesWritten?: number }> {
  const fs = require('fs');
  const { timeout = 60000, _redirectCount = 0 } = options;
  const MAX_REDIRECTS = 10;

  if (_redirectCount > MAX_REDIRECTS) {
    return {
      success: false,
      error: createError(ErrorType.NETWORK, 'TOO_MANY_REDIRECTS', {
        userMessage: `下载失败: 重定向次数超过 ${MAX_REDIRECTS} 次`,
      }),
    };
  }

  return new Promise((resolve) => {
    let parsedUrl: InstanceType<typeof URL>;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      resolve({
        success: false,
        error: fromNativeError(error instanceof Error ? error : new Error(String(error)), ErrorType.NETWORK, { url, destPath }),
      });
      return;
    }
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const file = fs.createWriteStream(destPath);
    let bytesWritten = 0;

    const req = client.get(url, {
      headers: { 'User-Agent': 'Lobster-Assistant' },
      timeout,
    }, (res: any) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // 处理重定向
        file.close();
        fs.unlinkSync(destPath);
        const redirectedUrl = new URL(res.headers.location, parsedUrl).toString();
        downloadFile(redirectedUrl, destPath, { ...options, _redirectCount: _redirectCount + 1 }).then(resolve);
        return;
      }

      if (res.statusCode && res.statusCode >= 400) {
        file.close();
        fs.unlinkSync(destPath);
        resolve({
          success: false,
          error: createError(ErrorType.NETWORK, 'HTTP_' + res.statusCode, {
            userMessage: `下载失败: HTTP ${res.statusCode}`,
          }),
        });
        return;
      }

      const totalSize = res.headers['content-length']
        ? parseInt(res.headers['content-length'], 10)
        : null;

      res.on('data', (chunk: Buffer) => {
        bytesWritten += chunk.length;
        if (options.onProgress) {
          options.onProgress(bytesWritten, totalSize);
        }
      });

      res.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve({ success: true, bytesWritten });
      });
    });

    req.on('error', (error: Error) => {
      file.close();
      try { fs.unlinkSync(destPath); } catch {}
      resolve({
        success: false,
        error: fromNativeError(error, ErrorType.NETWORK, { url, destPath }),
      });
    });

    req.on('timeout', () => {
      req.destroy();
      file.close();
      try { fs.unlinkSync(destPath); } catch {}
      resolve({
        success: false,
        error: createError(ErrorType.NETWORK, 'ETIMEDOUT', {
          userMessage: '下载超时',
          context: { url, timeout },
        }),
      });
    });
  });
}

// ============================================
// 导出便捷函数
// ============================================

export const network = {
  fetch: fetchWithTimeout,
  fetchRetry: fetchWithRetry,
  checkConnectivity: checkNetworkConnectivity,
  hasConnection: hasNetworkConnection,
  checkGitHub: checkGitHubAccess,
  download: downloadFile,
};
