import { renderWebUiClientDeploy } from './client/deploy';
import { renderWebUiClientConfigActions } from './client/config-actions';
import { renderWebUiClientRuntime } from './client/runtime';
import { renderWebUiClientBootstrap } from './client/bootstrap';

export function renderWebUiClientActions(config: Record<string, unknown>, status: Record<string, unknown>, deps: {
  version: string;
  providers: Record<string, unknown>;
  defaultWebPort: number;
  defaultGatewayPort: number;
  clawhubMarketUrl: string;
  purchaseUrl: string;
}) {
  return [
    renderWebUiClientDeploy(config, status, deps),
    renderWebUiClientConfigActions(config, status, deps),
    renderWebUiClientRuntime(config, status, deps),
    renderWebUiClientBootstrap(config, status, deps),
  ].join('');
}
