import { activate } from './activate';
import { verify } from './verify';

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
      const payload = body ? JSON.parse(body) : {};
      const result = await activate(payload);
      response.setStatusCode(200);
      response.send(JSON.stringify(result));
      return;
    }

    if (path === '/verify' && method === 'POST') {
      const payload = body ? JSON.parse(body) : {};
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
    response.setStatusCode(500);
    response.send(JSON.stringify({ error: 'Internal Server Error', message: error.message }));
  }
}
