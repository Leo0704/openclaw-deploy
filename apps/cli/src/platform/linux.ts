/**
 * Linux 平台适配器实现
 */

import * as os from 'os';
import type { PlatformAdapter } from './types';

export class LinuxPlatformAdapter implements PlatformAdapter {
  readonly id = 'linux';

  getDefaultInstallPath(): string {
    const home = process.env.HOME || '';
    return home ? `${home}/.local/share/OpenClaw` : '/opt/OpenClaw';
  }

  normalizeProjectPath(projectPath: string): string {
    // Linux 路径归一化：处理可能的重复斜杠
    return projectPath.replace(/\/+/g, '/');
  }

  validateInstallPath(projectPath: string): { valid: boolean; error?: string } {
    // Linux 路径验证：检查是否在 /usr、/etc 等系统目录
    const forbiddenPrefixes = ['/usr', '/etc', '/bin', '/sbin', '/boot', '/root'];

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
      file: 'xdg-open',
      args: [url],
    };
  }

  getDependencyInstallPlan(name: 'git' | 'pnpm' | 'corepack'): { command: string; manual: string } | null {
    switch (name) {
      case 'git':
        return {
          command: 'apt-get install git',
          manual: '使用包管理器安装 git（apt/yum/dnf/pacman 等）',
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
    const xdgConfigHome = process.env.XDG_CONFIG_HOME || `${home}/.config`;
    const xdgCacheHome = process.env.XDG_CACHE_HOME || `${home}/.cache`;
    const xdgDataHome = process.env.XDG_DATA_HOME || `${home}/.local/share`;

    return {
      configDir: `${xdgConfigHome}/${appName}`,
      cacheDir: `${xdgCacheHome}/${appName}`,
      dataDir: `${xdgDataHome}/${appName}`,
      logDir: `${xdgDataHome}/${appName}/logs`,
      tempDir: '/tmp',
    };
  }

  getSecretStore(): {
    kind: 'keychain' | 'credential-manager' | 'file';
    basePath?: string;
  } {
    // Linux 默认使用文件存储（可选支持 SecretService）
    return {
      kind: 'file',
      basePath: this.getStoragePaths('openclaw-deploy').configDir,
    };
  }

  getProxySettings(): {
    envKeys: string[];
    systemSource?: string;
  } {
    return {
      envKeys: ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'],
      systemSource: 'gsettings get org.gnome.system.proxy',
    };
  }

  getAutostartStrategy(): {
    kind: 'launchd' | 'task-scheduler' | 'systemd' | 'none';
  } {
    return {
      kind: 'systemd',
    };
  }

  collectCrashContext(): Record<string, unknown> {
    return {
      platform: 'linux',
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
      binary: 'openclaw-deploy-linux-x64',
      offlineBundle: 'openclaw-deploy-linux-offline.tar.gz',
    };
  }
}
