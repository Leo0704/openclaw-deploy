import type { UpdateState } from '../config/lobster-config';

async function bootstrapApp(deps: {
  loadConfig: () => Record<string, unknown>;
  loadUpdateState: () => UpdateState;
  ensureManagedSelfInstall: (args: any) => Promise<unknown>;
  maybeCheckForUpdates: (options: { force: boolean }) => Promise<void>;
  createServer: (config: Record<string, unknown>, deps: any) => import('http').Server;
  apiHandlers: any;
  getGatewayRuntimeStatusAsync: (config: Record<string, unknown>) => Promise<any>;
  getHTML: (config: Record<string, unknown>, status: any, updateState?: UpdateState) => string;
  getUserFriendlyMessage: (error: unknown) => string;
  logError: (error: any, context?: string) => void;
  checkPortAvailability: (port: number) => Promise<{ available: boolean; message?: string }>;
  findAvailablePort: (startPort: number, maxAttempts?: number) => Promise<number | null>;
  openBrowser: (url: string) => { success: boolean; error?: string; fallbackUrl?: string };
  version: string;
  isPackagedRuntime: boolean;
  githubMirrors: Array<{ name: string; url: string; api: string }>;
  getMirrorReleaseApi: (mirrorIndex?: number) => string;
  buildMirrorDownloadUrl: (mirrorIndex: number, originalUrl: string) => string;
  defaultWebPort: number;
}) {
  const config = deps.loadConfig();

  // 1. 固定安装位置管理（保留）
  await deps.ensureManagedSelfInstall({
    version: deps.version,
    isPackagedRuntime: deps.isPackagedRuntime,
    githubMirrors: deps.githubMirrors,
    getMirrorReleaseApi: deps.getMirrorReleaseApi,
    buildMirrorDownloadUrl: deps.buildMirrorDownloadUrl,
    logError: deps.logError,
    getUserFriendlyMessage: deps.getUserFriendlyMessage,
  });

  // 2. 加载缓存的更新状态
  const updateState = deps.loadUpdateState();

  // 3. 创建服务器（传入更新状态）
  const server = deps.createServer(config, {
    apiHandlers: deps.apiHandlers,
    getGatewayRuntimeStatusAsync: deps.getGatewayRuntimeStatusAsync,
    getHTML: deps.getHTML,
    getUserFriendlyMessage: deps.getUserFriendlyMessage,
    version: deps.version,
    updateState,
  });

  // 4. 端口检查
  const requestedPort = Number(process.env.LOBSTER_PORT || deps.defaultWebPort);
  let port = requestedPort;
  const requestedPortAvailability = await deps.checkPortAvailability(requestedPort);

  if (!requestedPortAvailability.available) {
    const fallbackPort = await deps.findAvailablePort(requestedPort + 1, 20);
    if (!fallbackPort) {
      throw new Error(requestedPortAvailability.message || `Web 控制台端口 ${requestedPort} 已被占用`);
    }

    console.log(`[Web] 端口 ${requestedPort} 已被占用，自动切换到 ${fallbackPort}`);
    port = fallbackPort;
  }

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Web 控制台端口 ${port} 已被占用，请关闭旧进程或设置新的 LOBSTER_PORT`);
      return;
    }
    console.error('[Web 服务错误]', err.message);
  });

  // 5. 启动服务器
  server.listen(port, () => {
    console.log('');
    console.log('\x1b[46m\x1b[30m 🦞 龙虾助手 \x1b[0m');
    console.log('');
    console.log(`  Web 界面: \x1b[36mhttp://localhost:${port}\x1b[0m`);
    console.log('  更新检查: 每24小时检查');
    console.log('');
    console.log('  按 Ctrl+C 停止');
    console.log('');

    const browserResult = deps.openBrowser(`http://localhost:${port}`);
    if (!browserResult.success) {
      console.log('\x1b[33m提示: 请手动打开上面的链接\x1b[0m');
    }

    // 注意：不再启动时检查更新，改为用户手动触发或部署后检查
  });

  // 6. 24小时定时检查（部署后才会真正检查）
  const ONE_DAY = 24 * 60 * 60 * 1000;
  setInterval(() => {
    console.log('[更新] 定时检查更新...');
    void deps.maybeCheckForUpdates({ force: false });
  }, ONE_DAY);
}

export { bootstrapApp };
