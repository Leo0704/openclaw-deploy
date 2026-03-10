export function renderWebUiClientTabs(config: Record<string, unknown>, status: Record<string, unknown>, deps: {
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
  return `
    // ============================================
    // Tab 切换
    // ============================================

    function queueTabDataLoad(tab) {
      setTimeout(() => {
        if (state.currentTab !== tab || state.currentView !== 'dashboard') return;
        if (tab === 'skills' && !state.skillsLoaded && !state.skillsLoading) {
          loadSkills();
        }
        if (tab === 'channels' && !state.channelsLoaded && !state.channelsLoading) {
          loadChannels();
        }
        if (tab === 'help' && !state.helpLoaded && !state.helpLoading) {
          loadHelp();
        }
      }, 0);
    }

    function switchTab(tab) {
      state.currentTab = tab;
      render();
      queueTabDataLoad(tab);
    }
`;
}
