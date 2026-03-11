/**
 * macOS 平台适配器实现
 */

import * as os from 'os';
import type { PlatformAdapter } from './types';

export class MacOSPlatformAdapter implements PlatformAdapter {
  readonly id = 'macos';

  getDefaultInstallPath(): string {
    const home = process.env.HOME || '';
    return home ? `${home}/Applications/OpenClaw` : '/Applications/OpenClaw';
  }

  normalizeProjectPath(projectPath: string): string {
    // macOS 路径归一化：处理可能的重复斜杠
    return projectPath.replace(/\/+/g, '/');
  }

  validateInstallPath(projectPath: string): { valid: boolean; error?: string } {
    // macOS 路径验证：检查是否在 /System 或 /Applications（非用户控制）目录
    const forbiddenPrefixes = ['/System', '/Library', '/Network'];

    for (const prefix of forbiddenPrefixes) {
      if (projectPath.startsWith(prefix)) {
        return {
          valid: false,
          error: '安装路径不能位于系统目录',
        };
      }
    }

    return { valid: true };
  }

  getBrowserOpenCommand(url: string): { file: string; args: string[] } | null {
    return {
      file: 'open',
      args: [url],
    };
  }

  getDependencyInstallPlan(name: 'git' | 'pnpm' | 'corepack'): { command: string; manual: string } | null {
    switch (name) {
      case 'git':
        return {
          command: 'xcode-select --install',
          manual: '访问 https://git-scm.com/download/mac 下载安装',
        };
      case 'pnpm':
        return {
          command: 'corepack enable pnpm',
          manual: '运行 npm install -g pnpm 或访问 https://pnpm.io/installation',
        };
      case 'corepack':
        return {
          command: 'corepack enable',
          manual: '运行 npm install -g corepack 或确保 Node.js >= 16.10',
        };
      default:
        return null;
    }
  }

  getArchiveExtractPlan(format: 'zip' | 'tar.gz'): { file: string; args: string[] } | null {
    if (format === 'zip') {
      return {
        file: 'unzip',
        args: ['-o', '<input>', '-d', '<output>'],
      };
    }
    if (format === 'tar.gz') {
      return {
        file: 'tar',
        args: ['-xzf', '<input>', '-C', '<output>'],
      };
    }
    return null;
  }

  getManagedSelfInstallTarget(execPath: string): {
    installRoot: string;
    targetExecPath: string;
    metadataPath: string;
  } {
    const home = process.env.HOME || '';
    const installRoot = home ? `${home}/.local/share/openclaw-deploy` : '/opt/openclaw-deploy';

    return {
      installRoot,
      targetExecPath: `${installRoot}/openclaw-deploy`,
      metadataPath: `${installRoot}/.install-meta.json`,
    };
  }

  getStoragePaths(appName: string): {
    configDir: string;
    cacheDir: string;
    dataDir: string;
    logDir: string;
    tempDir: string;
  } {
    const home = process.env.HOME || '';

    return {
      configDir: home ? `${home}/Library/Application Support/${appName}` : '/tmp/config',
      cacheDir: home ? `${home}/Library/Caches/${appName}` : '/tmp/cache',
      dataDir: home ? `${home}/Library/Application Support/${appName}` : '/tmp/data',
      logDir: home ? `${home}/Library/Logs/${appName}` : '/tmp/logs',
      tempDir: '/tmp',
    };
  }

  getSecretStore(): {
    kind: 'keychain' | 'credential-manager' | 'file';
    basePath?: string;
  } {
    // macOS 使用 Keychain
    return {
      kind: 'keychain',
    };
  }

  getProxySettings(): {
    envKeys: string[];
    systemSource?: string;
  } {
    return {
      envKeys: ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'],
      systemSource: 'networksetup -getwebproxy',
    };
  }

  getAutostartStrategy(): {
    kind: 'launchd' | 'task-scheduler' | 'systemd' | 'none';
  } {
    return {
      kind: 'launchd',
    };
  }

  collectCrashContext(): Record<string, unknown> {
    return {
      platform: 'macos',
      platformVersion: os.release(),
      arch: process.arch,
      nodeVersion: process.version,
      envPath: process.env.PATH || '',
    };
  }

  getReleaseAssetNames(): {
    binary: string;
    offlineBundle?: string;
  } {
    return {
      binary: 'openclaw-deploy-macos-x64',
      offlineBundle: 'openclaw-deploy-macos-offline.tar.gz',
    };
  }
}
