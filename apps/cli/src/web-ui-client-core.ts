const { renderWebUiClientState } = require('./web-ui-client-state') as typeof import('./web-ui-client-state');
const { renderWebUiClientDashboard } = require('./web-ui-client-dashboard') as typeof import('./web-ui-client-dashboard');
const { renderWebUiClientTabs } = require('./web-ui-client-tabs') as typeof import('./web-ui-client-tabs');

export function renderWebUiClientCore(config: Record<string, unknown>, status: Record<string, unknown>, deps: {
  version: string;
  providers: Record<string, unknown>;
  defaultWebPort: number;
  defaultGatewayPort: number;
  clawhubMarketUrl: string;
  purchaseUrl: string;
}) {
  return [
    renderWebUiClientState(config, status, deps),
    renderWebUiClientDashboard(config, status, deps),
    renderWebUiClientTabs(config, status, deps),
  ].join('');
}
