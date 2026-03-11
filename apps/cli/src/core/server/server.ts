const http = require('http') as typeof import('http');
const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

type ServerDeps = {
  apiHandlers: {
    handleAPIAsync: (action: string, data: Record<string, unknown>, config: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
  getGatewayRuntimeStatusAsync: (config: Record<string, unknown>) => Promise<Record<string, unknown>>;
  getHTML: (config: Record<string, unknown>, status: any) => string;
  getUserFriendlyMessage: (error: unknown) => string;
  version: string;
};

export function createServer(config: Record<string, unknown>, deps: ServerDeps) {
  return http.createServer((req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      const action = url.pathname.replace('/api/', '');
      let body = '';
      let responseSent = false;

      req.on('data', (chunk: Buffer) => {
        body += chunk;
        if (body.length > 1024 * 1024 && !responseSent) {
          responseSent = true;
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '请求体过大' }));
          req.destroy();
        }
      });

      req.on('end', async () => {
        if (responseSent) return;
        try {
          const data = body ? JSON.parse(body) : {};
          const result = await deps.apiHandlers.handleAPIAsync(action, data, config);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (error) {
          console.error('[API错误]', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: deps.getUserFriendlyMessage(error) }));
        }
      });

      req.on('error', (err: Error) => {
        console.error('[请求错误]', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: '请求处理失败' }));
      });

      return;
    }

    if (url.pathname === '/') {
      void (async () => {
        const status = await deps.getGatewayRuntimeStatusAsync(config);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(deps.getHTML(config, status));
      })().catch((error: Error) => {
        console.error('[首页渲染错误]', error);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Internal Server Error');
      });
      return;
    }

    if (url.pathname === '/assets/official-support-qq.jpg') {
      const candidates = [
        path.join(__dirname, '../../../assets/official-support-qq.jpg'),
        path.join(process.cwd(), 'assets/official-support-qq.jpg'),
      ];
      const assetPath = candidates.find((candidate) => fs.existsSync(candidate));
      if (!assetPath) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: '未找到资源' }));
        return;
      }

      try {
        const content = fs.readFileSync(assetPath);
        res.writeHead(200, {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=3600',
        });
        res.end(content);
      } catch (error) {
        console.error('[静态资源读取错误]', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: '资源读取失败' }));
      }
      return;
    }

    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        version: deps.version,
        uptime: process.uptime(),
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: '未找到' }));
  });
}
