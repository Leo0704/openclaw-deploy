/**
 * 平台信息诊断
 */

import { getPlatformAdapter } from '../index';

export function getPlatformInfo(): Record<string, unknown> {
  const adapter = getPlatformAdapter();
  return adapter.collectCrashContext();
}
