import { activate } from './activate';
import { verify } from './verify';
import { ActivateRequest, PRODUCT_ID, VerifyRequest } from './types';

class RequestError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'RequestError';
    this.statusCode = statusCode;
  }
}

function setCorsHeaders(response: any) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Content-Type', 'application/json');
}

async function readBody(request: any): Promise<string> {
  if (typeof request.body === 'string') {
    return request.body;
  }

  if (Buffer.isBuffer(request.body)) {
    return request.body.toString('utf-8');
  }

  return await new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf-8');
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function parseJsonBody(body: string): unknown {
  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new RequestError(400, '请求体不是合法的 JSON');
  }
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new RequestError(400, `${fieldName} 不能为空`);
  }
  return value.trim();
}

function parseActivateRequest(payload: unknown): ActivateRequest {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new RequestError(400, '请求体格式不正确');
  }

  const input = payload as Record<string, unknown>;
  const productId = requireNonEmptyString(input.productId, 'productId');
  if (productId !== PRODUCT_ID) {
    throw new RequestError(400, 'productId 无效');
  }

  return {
    code: requireNonEmptyString(input.code, 'code'),
    deviceFingerprint: requireNonEmptyString(input.deviceFingerprint, 'deviceFingerprint'),
    deviceName: requireNonEmptyString(input.deviceName, 'deviceName'),
    productId,
  };
}

function parseVerifyRequest(payload: unknown): VerifyRequest {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new RequestError(400, '请求体格式不正确');
  }

  const input = payload as Record<string, unknown>;
  const productId = requireNonEmptyString(input.productId, 'productId');
  if (productId !== PRODUCT_ID) {
    throw new RequestError(400, 'productId 无效');
  }

  return {
    code: requireNonEmptyString(input.code, 'code'),
    deviceFingerprint: requireNonEmptyString(input.deviceFingerprint, 'deviceFingerprint'),
    productId,
  };
}

export async function handler(request: any, response: any): Promise<void> {
  setCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    response.setStatusCode(200);
    response.send('');
    return;
  }

  try {
    const path = request.path || request.url || '/';
    const method = request.method || 'GET';
    const body = await readBody(request);

    if (path === '/activate' && method === 'POST') {
      const payload = parseActivateRequest(parseJsonBody(body));
      const result = await activate(payload);
      response.setStatusCode(200);
      response.send(JSON.stringify(result));
      return;
    }

    if (path === '/verify' && method === 'POST') {
      const payload = parseVerifyRequest(parseJsonBody(body));
      const result = await verify(payload);
      response.setStatusCode(200);
      response.send(JSON.stringify(result));
      return;
    }

    if (path === '/health') {
      response.setStatusCode(200);
      response.send(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
      return;
    }

    response.setStatusCode(404);
    response.send(JSON.stringify({ error: 'Not Found' }));
  } catch (error: any) {
    console.error('Handler error:', error);
    const statusCode = error instanceof RequestError ? error.statusCode : 500;
    response.setStatusCode(statusCode);
    response.send(JSON.stringify({ error: statusCode === 500 ? 'Internal Server Error' : 'Bad Request', message: error.message }));
  }
}
