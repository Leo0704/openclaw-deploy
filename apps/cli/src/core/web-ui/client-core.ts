import { renderWebUiClientState } from './client/state';
import { renderWebUiClientDashboard } from './client/dashboard';
import { renderWebUiClientTabs } from './client/tabs';

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
