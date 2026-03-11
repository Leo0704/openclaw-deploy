/**
 * 崩溃报告采集
 */

import { getPlatformAdapter } from '../index';

export function collectCrashReport(error?: Error): Record<string, unknown> {
  const adapter = getPlatformAdapter();
  const context = adapter.collectCrashContext();

  return {
    ...context,
    errorMessage: error?.message,
    errorStack: error?.stack,
    timestamp: new Date().toISOString(),
  };
}
