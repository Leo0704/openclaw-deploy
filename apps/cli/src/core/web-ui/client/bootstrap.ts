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

    // 注意：更新检查改为手动触发，不再启动时自动检查
    // 用户可点击"检查更新"按钮或部署后自动检查

    // 检测用户是否正在输入（避免自动刷新干扰）
    function isUserInteracting() {
      const activeElement = document.activeElement;
      if (!activeElement) return false;
      const tagName = activeElement.tagName.toLowerCase();
      // 检查是否在输入框、文本域或选择框中
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
        return true;
      }
      // 检查是否在配置视图
      if (state.currentView === 'config') {
        return true;
      }
      return false;
    }

    // 状态轮询：仅更新状态数据，不重新渲染（除非用户没有在交互）
    setInterval(async () => {
      const res = await api('status');
      if (res.status) {
        state.status = res.status;
        // 只有在用户没有交互且满足条件时才重新渲染
        if (!isUserInteracting() && state.currentView === 'dashboard' && !state.deployPolling && (state.currentTab === 'status' || !state.currentTab)) {
          render();
        }
      }
    }, 5000);
`;
}
