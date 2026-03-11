/**
 * 自启动配置
 */

import { getPlatformAdapter } from '../index';

export type AutostartKind = 'launchd' | 'task-scheduler' | 'systemd' | 'none';

export interface AutostartConfig {
  kind: AutostartKind;
}

export function getAutostartConfig(): AutostartConfig {
  const adapter = getPlatformAdapter();
  return adapter.getAutostartStrategy();
}
