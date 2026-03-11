/**
 * 平台适配层入口
 * 根据当前操作系统选择并导出对应的平台适配器
 */

import * as os from 'os';
import type { PlatformAdapter, PlatformId } from './types';
import { WindowsPlatformAdapter } from './windows';
import { MacOSPlatformAdapter } from './macos';
import { LinuxPlatformAdapter } from './linux';

let currentAdapter: PlatformAdapter | null = null;

/**
 * 获取当前平台的适配器
 */
export function getPlatformAdapter(): PlatformAdapter {
  if (currentAdapter) {
    return currentAdapter;
  }

  const platform = os.platform();

  switch (platform) {
    case 'win32':
      currentAdapter = new WindowsPlatformAdapter();
      break;
    case 'darwin':
      currentAdapter = new MacOSPlatformAdapter();
      break;
    case 'linux':
      currentAdapter = new LinuxPlatformAdapter();
      break;
    default:
      // 未知平台，使用 Linux 适配器作为降级
      currentAdapter = new LinuxPlatformAdapter();
      break;
  }

  return currentAdapter;
}

/**
 * 获取当前平台 ID（供外部直接使用）
 */
export function getPlatformId(): PlatformId {
  const adapter = getPlatformAdapter();
  return adapter.id;
}

/**
 * 手动设置平台适配器（用于测试）
 */
export function setPlatformAdapter(adapter: PlatformAdapter): void {
  currentAdapter = adapter;
}

/**
 * 重置平台适配器（用于测试）
 */
export function resetPlatformAdapter(): void {
  currentAdapter = null;
}

// 重新导出类型
export type { PlatformAdapter, PlatformId };

// 重新导出具体实现（供测试使用）
export { WindowsPlatformAdapter, MacOSPlatformAdapter, LinuxPlatformAdapter };
