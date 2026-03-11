/**
 * Windows 平台适配器实现
 */

import * as os from 'os';
import * as path from 'path';
import type { PlatformAdapter } from './types';

export class WindowsPlatformAdapter implements PlatformAdapter {
  readonly id = 'windows';

  getDefaultInstallPath(): string {
    const localAppData = process.env.LOCALAPPDATA || '';
    return localAppData ? `${localAppData}\\OpenClaw` : 'C:\\OpenClaw';
  }

  normalizeProjectPath(projectPath: string): string {
    const rawPath = String(projectPath || '').trim();
    if (!rawPath) {
      return '';
    }
    return path.win32.normalize(rawPath);
  }

  validateInstallPath(projectPath: string): { valid: boolean; error?: string } {
    // Windows 路径验证：检查是否在 Program Files 等需要管理员权限的目录
    const forbiddenPrefixes = [
      'C:\\Program Files',
      'C:\\Program Files (x86)',
    ];

    const normalizedPath = projectPath.toLowerCase();
    for (const prefix of forbiddenPrefixes) {
      if (normalizedPath.startsWith(prefix.toLowerCase())) {
        return {
          valid: false,
          error: '安装路径不能位于 Program Files 目录（需要管理员权限）',
        };
      }
    }

    // 检查路径长度（Windows MAX_PATH 限制）
    if (projectPath.length > 250) {
      return {
        valid: false,
        error: '路径过长，Windows 建议不超过 250 字符',
      };
    }

    return { valid: true };
  }

  getBrowserOpenCommand(url: string): { file: string; args: string[] } | null {
    return {
      file: 'cmd',
      args: ['/c', 'start', '', url],
    };
  }

  getDependencyInstallPlan(name: 'git' | 'pnpm' | 'corepack'): { command: string; manual: string } | null {
    switch (name) {
      case 'git':
        return {
          command: 'winget install Git.Git',
          manual: '访问 https://git-scm.com/download/win 下载安装',
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
      // Windows PowerShell 内置解压
      return {
        file: 'powershell',
        args: ['-Command', 'Expand-Archive -Path <input> -DestinationPath <output> -Force'],
      };
    }
    if (format === 'tar.gz') {
      // Windows 10+ 内置 tar
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
    const localAppData = process.env.LOCALAPPDATA || '';
    const installRoot = localAppData ? `${localAppData}\\openclaw-deploy` : 'C:\\openclaw-deploy';

    return {
      installRoot,
      targetExecPath: `${installRoot}\\openclaw-deploy.exe`,
      metadataPath: `${installRoot}\\.install-meta.json`,
    };
  }

  getStoragePaths(appName: string): {
    configDir: string;
    cacheDir: string;
    dataDir: string;
    logDir: string;
    tempDir: string;
  } {
    const appData = process.env.APPDATA || '';
    const localAppData = process.env.LOCALAPPDATA || '';
    const tempDir = process.env.TEMP || process.env.TMP || '';

    return {
      configDir: appData ? `${appData}\\${appName}` : 'C:\\config',
      cacheDir: localAppData ? `${localAppData}\\${appName}\\Cache` : 'C:\\cache',
      dataDir: localAppData ? `${localAppData}\\${appName}\\Data` : 'C:\\data',
      logDir: localAppData ? `${localAppData}\\${appName}\\Logs` : 'C:\\logs',
      tempDir: tempDir || 'C:\\temp',
    };
  }

  getSecretStore(): {
    kind: 'keychain' | 'credential-manager' | 'file';
    basePath?: string;
  } {
    // Windows 使用 Credential Manager
    return {
      kind: 'credential-manager',
    };
  }

  getProxySettings(): {
    envKeys: string[];
    systemSource?: string;
  } {
    return {
      envKeys: ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'],
      systemSource: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
    };
  }

  getAutostartStrategy(): {
    kind: 'launchd' | 'task-scheduler' | 'systemd' | 'none';
  } {
    return {
      kind: 'task-scheduler',
    };
  }

  collectCrashContext(): Record<string, unknown> {
    return {
      platform: 'windows',
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
      binary: 'openclaw-deploy-win-x64.exe',
      offlineBundle: 'openclaw-deploy-win-offline.zip',
    };
  }
}
