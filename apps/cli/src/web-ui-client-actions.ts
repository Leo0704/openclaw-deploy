const { renderWebUiClientDeploy } = require('./web-ui-client-deploy') as typeof import('./web-ui-client-deploy');
const { renderWebUiClientConfigActions } = require('./web-ui-client-config-actions') as typeof import('./web-ui-client-config-actions');
const { renderWebUiClientRuntime } = require('./web-ui-client-runtime') as typeof import('./web-ui-client-runtime');
const { renderWebUiClientBootstrap } = require('./web-ui-client-bootstrap') as typeof import('./web-ui-client-bootstrap');

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
