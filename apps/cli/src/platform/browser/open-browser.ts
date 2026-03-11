/**
 * 打开浏览器（跨平台）
 * 通过平台适配器统一处理
 */

import * as os from 'os';
import { execSync } from 'child_process';
import { getPlatformAdapter } from '../index';

function isValidUrl(url: string): boolean {
  try {
    const { URL: NodeURL } = require('url') as typeof import('url');
    const parsed = new NodeURL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function openBrowser(url: string): { success: boolean; error?: string; fallbackUrl?: string } {
  if (!isValidUrl(url)) {
    return { success: false, error: '无效的 URL 格式' };
  }

  const adapter = getPlatformAdapter();
  const command = adapter.getBrowserOpenCommand(url);

  if (!command) {
    console.log('');
    console.log('\x1b[33m⚠️  无法自动打开浏览器，请手动访问:\x1b[0m');
    console.log(`\x1b[36m    ${url}\x1b[0m`);
    console.log('');
    return {
      success: false,
      error: '无法自动打开浏览器',
      fallbackUrl: url,
    };
  }

  try {
    if (adapter.id === 'windows') {
      execSync(`start "" "${url}"`, { timeout: 5000, shell: '/bin/sh' });
    } else if (adapter.id === 'macos') {
      execSync(`${command.file} "${url}"`, { timeout: 5000 });
    } else {
      // Linux 尝试多个命令
      const commands = [command.file, 'google-chrome', 'firefox'];
      for (const cmd of commands) {
        if (!cmd) continue;
        try {
          execSync(`${cmd} "${url}"`, { timeout: 5000 });
          return { success: true };
        } catch {
          continue;
        }
      }
      console.log('');
      console.log('\x1b[33m⚠️  无法自动打开浏览器，请手动访问:\x1b[0m');
      console.log(`\x1b[36m    ${url}\x1b[0m`);
      console.log('');
      return {
        success: false,
        error: '无法自动打开浏览器',
        fallbackUrl: url,
      };
    }
    return { success: true };
  } catch (error) {
    console.log('');
    console.log('\x1b[33m⚠️  无法自动打开浏览器，请手动访问:\x1b[0m');
    console.log(`\x1b[36m    ${url}\x1b[0m`);
    console.log('');
    return {
      success: false,
      error: '无法自动打开浏览器',
      fallbackUrl: url,
    };
  }
}
