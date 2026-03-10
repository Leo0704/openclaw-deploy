export function renderWebUiClientRuntime(config: Record<string, unknown>, status: Record<string, unknown>, deps: {
  version: string;
  providers: Record<string, unknown>;
  defaultWebPort: number;
  defaultGatewayPort: number;
  clawhubMarketUrl: string;
  purchaseUrl: string;
}) {
  const VERSION = deps.version;
  const PROVIDERS = deps.providers;
  const DEFAULT_WEB_PORT = deps.defaultWebPort;
  const DEFAULT_GATEWAY_PORT = deps.defaultGatewayPort;
  const CLAWHUB_MARKET_URL = deps.clawhubMarketUrl;
  const purchaseUrl = deps.purchaseUrl;
  void VERSION;
  void PROVIDERS;
  void DEFAULT_WEB_PORT;
  void DEFAULT_GATEWAY_PORT;
  void CLAWHUB_MARKET_URL;
  void purchaseUrl;
  void config;
  void status;
  return `    async function start() {
      if (!state.config.apiKey) return toast('请先配置 API Key', 'error');
      toast('正在启动...');
      const res = await api('start', {}, 180000);
      if (res.success) {
        if (res.status) state.status = res.status;
        else state.status.running = true;
        toast('服务已启动！');
        render();
      }
      else toast(res.error || '启动失败', 'error');
    }

    async function stop() {
      toast('正在停止...');
      const res = await api('stop');
      if (res.success) {
        state.status.running = false;
        state.status.state = 'stopped';
        toast('服务已停止');
        render();
      }
      else toast(res.error || '停止失败', 'error');
    }

    async function uninstallOpenClaw() {
      const confirmed = confirm('这会停止当前 OpenClaw 服务，并删除安装目录、运行缓存、临时日志和部署配置。产品激活状态会保留。确定继续吗？');
      if (!confirmed) return;

      showLoading('正在彻底卸载 OpenClaw...');
      const res = await api('uninstall-openclaw', {}, 180000);
      if (res.success) {
        state.config = res.config || {};
        state.status = res.status || { running: false, installed: false };
        toast(res.message || 'OpenClaw 已卸载');
        render();
      } else {
        toast(res.error || '卸载失败', 'error');
        render();
      }
    }

    async function updateOpenClaw() {
      toast('检查更新中...');
      const res = await api('update-openclaw');
      if (res.success) toast(res.message || '更新成功！');
      else toast(res.error || '更新失败', 'error');
    }

    let _pollLogsActive = false;
    async function pollLogs() {
      if (_pollLogsActive) return;
      _pollLogsActive = true;
      try {
        while (state.status.running && state.currentTab === 'status') {
          const res = await api('logs');
          if (res.logs) {
            const el = $('logs');
            if (el) { el.innerHTML = res.logs.map(l => \`<div class="log-line log-\${escapeHtml(l.level || 'info')}"><span class="log-time">[\${escapeHtml(l.time)}]</span> \${escapeHtml(l.message)}</div>\`).join(''); }
          }
          await new Promise(r => setTimeout(r, 2000));
        }
      } finally {
        _pollLogsActive = false;
      }
    }
`;
}
