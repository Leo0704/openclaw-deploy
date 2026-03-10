const { renderWebUiClientCore } = require('./web-ui-client-core') as typeof import('./web-ui-client-core');
const { renderWebUiClientChannels } = require('./web-ui-client-channels') as typeof import('./web-ui-client-channels');
const { renderWebUiClientSkills } = require('./web-ui-client-skills') as typeof import('./web-ui-client-skills');
const { renderWebUiClientHelp } = require('./web-ui-client-help') as typeof import('./web-ui-client-help');
const { renderWebUiClientActions } = require('./web-ui-client-actions') as typeof import('./web-ui-client-actions');

export function renderWebUiClientScript(config: Record<string, unknown>, status: Record<string, unknown>, deps: {
  version: string;
  providers: Record<string, unknown>;
  defaultWebPort: number;
  defaultGatewayPort: number;
  clawhubMarketUrl: string;
  purchaseUrl: string;
}) {
  return [
    renderWebUiClientCore(config, status, deps),
    renderWebUiClientChannels(config, status, deps),
    renderWebUiClientSkills(config, status, deps),
    renderWebUiClientHelp(config, status, deps),
    renderWebUiClientActions(config, status, deps),
  ].join('');
}
