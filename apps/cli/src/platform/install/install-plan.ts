/**
 * 依赖安装方案
 */

import { getPlatformAdapter } from '../index';

export type DependencyName = 'git' | 'pnpm' | 'corepack';

export interface InstallPlan {
  command: string;
  manual: string;
}

export function getInstallPlan(name: DependencyName): InstallPlan | null {
  const adapter = getPlatformAdapter();
  return adapter.getDependencyInstallPlan(name);
}
