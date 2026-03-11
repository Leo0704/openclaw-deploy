import { renderWebUiClientCore } from './client-core';
import { renderWebUiClientChannels } from './client/channels';
import { renderWebUiClientSkills } from './client/skills';
import { renderWebUiClientHelp } from './client/help';
import { renderWebUiClientActions } from './client-actions';

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
