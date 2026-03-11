export function renderWebUiClientBootstrap(config: Record<string, unknown>, status: Record<string, unknown>, deps: {
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
  return `    render();

    // 初始化时获取更新状态
    fetchUpdateStatus();

    setInterval(async () => {
      const res = await api('status');
      if (res.status) {
        state.status = res.status;
        if (state.currentView === 'dashboard' && !state.deployPolling && (state.currentTab === 'status' || !state.currentTab)) {
          render();
        }
      }
    }, 5000);
`;
}
