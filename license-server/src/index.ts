import { FCRequest, FCResponse, ActivateRequest, VerifyRequest } from './types';
import { activate } from './activate';
import { verify } from './verify';

/**
 * 处理 HTTP 请求
 */
export async function handler(request: FCRequest): Promise<FCResponse> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // 处理 OPTIONS 预检请求
  if (request.method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  try {
    const { path, method, body } = request;

    // 路由: 激活
    if (path === '/activate' && method === 'POST') {
      const data: ActivateRequest = JSON.parse(body);
      const result = await activate(data);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(result),
      };
    }

    // 路由: 验证
    if (path === '/verify' && method === 'POST') {
      const data: VerifyRequest = JSON.parse(body);
      const result = await verify(data);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(result),
      };
    }

    // 健康检查
    if (path === '/health') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }),
      };
    }

    // 404
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Not Found' }),
    };
  } catch (error: any) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal Server Error', message: error.message }),
    };
  }
}
