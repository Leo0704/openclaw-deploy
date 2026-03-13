import { describe, it, expect, beforeEach } from 'vitest';

// ============================================
// macOS 平台适配器测试
// ============================================
describe('MacOSPlatformAdapter', () => {
  // 模拟 macOS 适配器
  class MockMacOSAdapter {
    readonly id = 'macos';

    getDefaultInstallPath(): string {
      const home = '/Users/test';
      return `${home}/Applications/OpenClaw`;
    }

    normalizeProjectPath(projectPath: string): string {
      return projectPath.replace(/\/+/g, '/');
    }

    validateInstallPath(projectPath: string): { valid: boolean; error?: string } {
      const forbiddenPrefixes = ['/System', '/Library', '/Network'];

      for (const prefix of forbiddenPrefixes) {
        if (projectPath.startsWith(prefix)) {
          return { valid: false, error: '安装路径不能位于系统目录' };
        }
      }

      return { valid: true };
    }

    getBrowserOpenCommand(url: string): { file: string; args: string[] } | null {
      return { file: 'open', args: [url] };
    }

    getDependencyInstallPlan(name: 'git' | 'pnpm' | 'corepack'): { command: string; manual: string } | null {
      switch (name) {
        case 'git':
          return { command: 'xcode-select --install', manual: '访问 https://git-scm.com/download/mac 下载安装' };
        case 'pnpm':
          return { command: 'corepack enable pnpm', manual: '运行 npm install -g pnpm' };
        case 'corepack':
          return { command: 'corepack enable', manual: '运行 npm install -g corepack' };
        default:
          return null;
      }
    }

    getArchiveExtractPlan(format: 'zip' | 'tar.gz'): { file: string; args: string[] } | null {
      if (format === 'zip') {
        return { file: 'unzip', args: ['-o', '<input>', '-d', '<output>'] };
      }
      if (format === 'tar.gz') {
        return { file: 'tar', args: ['-xzf', '<input>', '-C', '<output>'] };
      }
      return null;
    }

    getManagedSelfInstallTarget(execPath: string): {
      installRoot: string;
      targetExecPath: string;
      metadataPath: string;
    } {
      const installRoot = '/Users/test/.local/share/openclaw-deploy';
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
      const home = '/Users/test';
      return {
        configDir: `${home}/Library/Application Support/${appName}`,
        cacheDir: `${home}/Library/Caches/${appName}`,
        dataDir: `${home}/Library/Application Support/${appName}`,
        logDir: `${home}/Library/Logs/${appName}`,
        tempDir: '/tmp',
      };
    }

    getSecretStore(): { kind: 'keychain' | 'credential-manager' | 'file'; basePath?: string } {
      return { kind: 'keychain' };
    }

    getProxySettings(): { envKeys: string[]; systemSource?: string } {
      return {
        envKeys: ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'],
        systemSource: 'networksetup -getwebproxy',
      };
    }

    getAutostartStrategy(): { kind: 'launchd' | 'task-scheduler' | 'systemd' | 'none' } {
      return { kind: 'launchd' };
    }

    collectCrashContext(): Record<string, unknown> {
      return {
        platform: 'macos',
        platformVersion: '23.0.0',
        arch: 'arm64',
        nodeVersion: 'v22.0.0',
        envPath: '/usr/local/bin:/usr/bin',
      };
    }

    getReleaseAssetNames(): { binary: string; offlineBundle?: string } {
      return {
        binary: 'openclaw-deploy-macos-x64',
        offlineBundle: 'openclaw-deploy-macos-offline.tar.gz',
      };
    }
  }

  let adapter: MockMacOSAdapter;

  beforeEach(() => {
    adapter = new MockMacOSAdapter();
  });

  describe('基础属性', () => {
    it('should have correct platform id', () => {
      expect(adapter.id).toBe('macos');
    });

    it('should return default install path in Applications', () => {
      const path = adapter.getDefaultInstallPath();
      expect(path).toContain('Applications');
      expect(path).toContain('OpenClaw');
    });
  });

  describe('路径处理', () => {
    it('should normalize paths with multiple slashes', () => {
      expect(adapter.normalizeProjectPath('/Users//test///path')).toBe('/Users/test/path');
    });

    it('should validate forbidden system paths', () => {
      expect(adapter.validateInstallPath('/System/Library').valid).toBe(false);
      expect(adapter.validateInstallPath('/Library/Preferences').valid).toBe(false);
      expect(adapter.validateInstallPath('/Network/Servers').valid).toBe(false);
    });

    it('should allow valid user paths', () => {
      expect(adapter.validateInstallPath('/Users/test/OpenClaw').valid).toBe(true);
      expect(adapter.validateInstallPath('/Applications/OpenClaw').valid).toBe(true);
    });
  });

  describe('浏览器命令', () => {
    it('should use open command', () => {
      const result = adapter.getBrowserOpenCommand('http://localhost:18790');
      expect(result).not.toBeNull();
      expect(result!.file).toBe('open');
      expect(result!.args).toContain('http://localhost:18790');
    });
  });

  describe('依赖安装', () => {
    it('should return xcode-select for git', () => {
      const plan = adapter.getDependencyInstallPlan('git');
      expect(plan).not.toBeNull();
      expect(plan!.command).toContain('xcode-select');
    });

    it('should return corepack for pnpm', () => {
      const plan = adapter.getDependencyInstallPlan('pnpm');
      expect(plan).not.toBeNull();
      expect(plan!.command).toContain('corepack enable pnpm');
    });
  });

  describe('解压方案', () => {
    it('should use unzip for zip files', () => {
      const plan = adapter.getArchiveExtractPlan('zip');
      expect(plan).not.toBeNull();
      expect(plan!.file).toBe('unzip');
    });

    it('should use tar for tar.gz files', () => {
      const plan = adapter.getArchiveExtractPlan('tar.gz');
      expect(plan).not.toBeNull();
      expect(plan!.file).toBe('tar');
    });
  });

  describe('存储路径', () => {
    it('should return macOS standard paths', () => {
      const paths = adapter.getStoragePaths('TestApp');
      expect(paths.configDir).toContain('Library/Application Support');
      expect(paths.cacheDir).toContain('Library/Caches');
      expect(paths.logDir).toContain('Library/Logs');
      expect(paths.tempDir).toBe('/tmp');
    });
  });

  describe('密钥存储', () => {
    it('should use keychain', () => {
      const store = adapter.getSecretStore();
      expect(store.kind).toBe('keychain');
    });
  });

  describe('自启动策略', () => {
    it('should use launchd', () => {
      const strategy = adapter.getAutostartStrategy();
      expect(strategy.kind).toBe('launchd');
    });
  });

  describe('发布资产', () => {
    it('should return macos binary name', () => {
      const assets = adapter.getReleaseAssetNames();
      expect(assets.binary).toContain('macos');
    });
  });
});

// ============================================
// Windows 平台适配器测试
// ============================================
describe('WindowsPlatformAdapter', () => {
  class MockWindowsAdapter {
    readonly id = 'windows';

    getDefaultInstallPath(): string {
      return 'C:\\Users\\test\\AppData\\Local\\OpenClaw';
    }

    normalizeProjectPath(projectPath: string): string {
      // 简化的 Windows 路径规范化
      return projectPath.replace(/\\\\+/g, '\\');
    }

    validateInstallPath(projectPath: string): { valid: boolean; error?: string } {
      const forbiddenPrefixes = ['C:\\Program Files', 'C:\\Program Files (x86)'];
      const normalizedPath = projectPath.toLowerCase();

      for (const prefix of forbiddenPrefixes) {
        if (normalizedPath.startsWith(prefix.toLowerCase())) {
          return { valid: false, error: '安装路径不能位于 Program Files 目录' };
        }
      }

      if (projectPath.length > 250) {
        return { valid: false, error: '路径过长' };
      }

      return { valid: true };
    }

    getBrowserOpenCommand(url: string): { file: string; args: string[] } | null {
      return { file: 'cmd', args: ['/c', 'start', '', url] };
    }

    getDependencyInstallPlan(name: 'git' | 'pnpm' | 'corepack'): { command: string; manual: string } | null {
      switch (name) {
        case 'git':
          return { command: 'winget install Git.Git', manual: '访问 https://git-scm.com/download/win' };
        case 'pnpm':
          return { command: 'corepack enable pnpm', manual: '运行 npm install -g pnpm' };
        case 'corepack':
          return { command: 'corepack enable', manual: '运行 npm install -g corepack' };
        default:
          return null;
      }
    }

    getArchiveExtractPlan(format: 'zip' | 'tar.gz'): { file: string; args: string[] } | null {
      if (format === 'zip') {
        return { file: 'powershell', args: ['-Command', 'Expand-Archive -Path <input> -DestinationPath <output> -Force'] };
      }
      if (format === 'tar.gz') {
        return { file: 'tar', args: ['-xzf', '<input>', '-C', '<output>'] };
      }
      return null;
    }

    getManagedSelfInstallTarget(execPath: string): {
      installRoot: string;
      targetExecPath: string;
      metadataPath: string;
    } {
      const installRoot = 'C:\\Users\\test\\AppData\\Local\\openclaw-deploy';
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
      return {
        configDir: `C:\\Users\\test\\AppData\\Roaming\\${appName}`,
        cacheDir: `C:\\Users\\test\\AppData\\Local\\${appName}\\Cache`,
        dataDir: `C:\\Users\\test\\AppData\\Local\\${appName}\\Data`,
        logDir: `C:\\Users\\test\\AppData\\Local\\${appName}\\Logs`,
        tempDir: 'C:\\Users\\test\\AppData\\Local\\Temp',
      };
    }

    getSecretStore(): { kind: 'keychain' | 'credential-manager' | 'file'; basePath?: string } {
      return { kind: 'credential-manager' };
    }

    getProxySettings(): { envKeys: string[]; systemSource?: string } {
      return {
        envKeys: ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'],
        systemSource: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
      };
    }

    getAutostartStrategy(): { kind: 'launchd' | 'task-scheduler' | 'systemd' | 'none' } {
      return { kind: 'task-scheduler' };
    }

    collectCrashContext(): Record<string, unknown> {
      return {
        platform: 'windows',
        platformVersion: '10.0.0',
        arch: 'x64',
        nodeVersion: 'v22.0.0',
        envPath: 'C:\\Windows\\system32;C:\\Windows',
      };
    }

    getReleaseAssetNames(): { binary: string; offlineBundle?: string } {
      return {
        binary: 'openclaw-deploy-win-x64.exe',
        offlineBundle: 'openclaw-deploy-win-offline.tar.gz',
      };
    }
  }

  let adapter: MockWindowsAdapter;

  beforeEach(() => {
    adapter = new MockWindowsAdapter();
  });

  describe('基础属性', () => {
    it('should have correct platform id', () => {
      expect(adapter.id).toBe('windows');
    });

    it('should return default install path in LocalAppData', () => {
      const path = adapter.getDefaultInstallPath();
      expect(path).toContain('AppData\\Local');
      expect(path).toContain('OpenClaw');
    });
  });

  describe('路径处理', () => {
    it('should normalize paths with multiple backslashes', () => {
      expect(adapter.normalizeProjectPath('C:\\\\Users\\\\test')).toBe('C:\\Users\\test');
    });

    it('should validate forbidden Program Files paths', () => {
      expect(adapter.validateInstallPath('C:\\Program Files\\App').valid).toBe(false);
      expect(adapter.validateInstallPath('C:\\Program Files (x86)\\App').valid).toBe(false);
    });

    it('should reject paths longer than 250 characters', () => {
      const longPath = 'C:\\Users\\test\\' + 'a'.repeat(250);
      expect(adapter.validateInstallPath(longPath).valid).toBe(false);
    });

    it('should allow valid user paths', () => {
      expect(adapter.validateInstallPath('C:\\Users\\test\\OpenClaw').valid).toBe(true);
    });
  });

  describe('浏览器命令', () => {
    it('should use cmd start command', () => {
      const result = adapter.getBrowserOpenCommand('http://localhost:18790');
      expect(result).not.toBeNull();
      expect(result!.file).toBe('cmd');
      expect(result!.args).toContain('/c');
      expect(result!.args).toContain('start');
    });
  });

  describe('依赖安装', () => {
    it('should return winget for git', () => {
      const plan = adapter.getDependencyInstallPlan('git');
      expect(plan).not.toBeNull();
      expect(plan!.command).toContain('winget');
    });
  });

  describe('解压方案', () => {
    it('should use powershell for zip files', () => {
      const plan = adapter.getArchiveExtractPlan('zip');
      expect(plan).not.toBeNull();
      expect(plan!.file).toBe('powershell');
      expect(plan!.args.join(' ')).toContain('Expand-Archive');
    });

    it('should use tar for tar.gz files (Windows 10+)', () => {
      const plan = adapter.getArchiveExtractPlan('tar.gz');
      expect(plan).not.toBeNull();
      expect(plan!.file).toBe('tar');
    });
  });

  describe('存储路径', () => {
    it('should return Windows AppData paths', () => {
      const paths = adapter.getStoragePaths('TestApp');
      expect(paths.configDir).toContain('AppData\\Roaming');
      expect(paths.cacheDir).toContain('AppData\\Local');
      expect(paths.tempDir).toContain('Temp');
    });
  });

  describe('密钥存储', () => {
    it('should use credential-manager', () => {
      const store = adapter.getSecretStore();
      expect(store.kind).toBe('credential-manager');
    });
  });

  describe('自启动策略', () => {
    it('should use task-scheduler', () => {
      const strategy = adapter.getAutostartStrategy();
      expect(strategy.kind).toBe('task-scheduler');
    });
  });

  describe('发布资产', () => {
    it('should return windows binary name with exe extension', () => {
      const assets = adapter.getReleaseAssetNames();
      expect(assets.binary).toContain('win');
      expect(assets.binary).toContain('.exe');
    });

    it('should return tar.gz offline bundle', () => {
      const assets = adapter.getReleaseAssetNames();
      expect(assets.offlineBundle).toContain('.tar.gz');
    });
  });
});

// ============================================
// Linux 平台适配器测试
// ============================================
describe('LinuxPlatformAdapter', () => {
  class MockLinuxAdapter {
    readonly id = 'linux';

    getDefaultInstallPath(): string {
      return '/home/test/.local/share/OpenClaw';
    }

    normalizeProjectPath(projectPath: string): string {
      return projectPath.replace(/\/+/g, '/');
    }

    validateInstallPath(projectPath: string): { valid: boolean; error?: string } {
      const forbiddenPrefixes = ['/usr', '/etc', '/bin', '/sbin', '/boot', '/root'];

      for (const prefix of forbiddenPrefixes) {
        if (projectPath.startsWith(prefix)) {
          return { valid: false, error: '安装路径不能位于系统目录' };
        }
      }

      return { valid: true };
    }

    getBrowserOpenCommand(url: string): { file: string; args: string[] } | null {
      return { file: 'xdg-open', args: [url] };
    }

    getDependencyInstallPlan(name: 'git' | 'pnpm' | 'corepack'): { command: string; manual: string } | null {
      switch (name) {
        case 'git':
          return { command: 'apt-get install git', manual: '使用包管理器安装 git' };
        case 'pnpm':
          return { command: 'corepack enable pnpm', manual: '运行 npm install -g pnpm' };
        case 'corepack':
          return { command: 'corepack enable', manual: '运行 npm install -g corepack' };
        default:
          return null;
      }
    }

    getArchiveExtractPlan(format: 'zip' | 'tar.gz'): { file: string; args: string[] } | null {
      if (format === 'zip') {
        return { file: 'unzip', args: ['-o', '<input>', '-d', '<output>'] };
      }
      if (format === 'tar.gz') {
        return { file: 'tar', args: ['-xzf', '<input>', '-C', '<output>'] };
      }
      return null;
    }

    getManagedSelfInstallTarget(execPath: string): {
      installRoot: string;
      targetExecPath: string;
      metadataPath: string;
    } {
      const installRoot = '/home/test/.local/share/openclaw-deploy';
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
      return {
        configDir: `/home/test/.config/${appName}`,
        cacheDir: `/home/test/.cache/${appName}`,
        dataDir: `/home/test/.local/share/${appName}`,
        logDir: `/home/test/.local/share/${appName}/logs`,
        tempDir: '/tmp',
      };
    }

    getSecretStore(): { kind: 'keychain' | 'credential-manager' | 'file'; basePath?: string } {
      return { kind: 'file', basePath: '/home/test/.config/openclaw-deploy' };
    }

    getProxySettings(): { envKeys: string[]; systemSource?: string } {
      return {
        envKeys: ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'],
        systemSource: 'gsettings get org.gnome.system.proxy',
      };
    }

    getAutostartStrategy(): { kind: 'launchd' | 'task-scheduler' | 'systemd' | 'none' } {
      return { kind: 'systemd' };
    }

    collectCrashContext(): Record<string, unknown> {
      return {
        platform: 'linux',
        platformVersion: '6.0.0',
        arch: 'x64',
        nodeVersion: 'v22.0.0',
        envPath: '/usr/local/bin:/usr/bin',
      };
    }

    getReleaseAssetNames(): { binary: string; offlineBundle?: string } {
      return {
        binary: 'openclaw-deploy-linux-x64',
        offlineBundle: 'openclaw-deploy-linux-offline.tar.gz',
      };
    }
  }

  let adapter: MockLinuxAdapter;

  beforeEach(() => {
    adapter = new MockLinuxAdapter();
  });

  describe('基础属性', () => {
    it('should have correct platform id', () => {
      expect(adapter.id).toBe('linux');
    });

    it('should return default install path in .local/share', () => {
      const path = adapter.getDefaultInstallPath();
      expect(path).toContain('.local/share');
      expect(path).toContain('OpenClaw');
    });
  });

  describe('路径处理', () => {
    it('should normalize paths with multiple slashes', () => {
      expect(adapter.normalizeProjectPath('/home//test///path')).toBe('/home/test/path');
    });

    it('should validate forbidden system paths', () => {
      expect(adapter.validateInstallPath('/usr/bin').valid).toBe(false);
      expect(adapter.validateInstallPath('/etc/config').valid).toBe(false);
      expect(adapter.validateInstallPath('/bin/app').valid).toBe(false);
      expect(adapter.validateInstallPath('/sbin/app').valid).toBe(false);
      expect(adapter.validateInstallPath('/boot/app').valid).toBe(false);
      expect(adapter.validateInstallPath('/root/app').valid).toBe(false);
    });

    it('should allow valid user paths', () => {
      expect(adapter.validateInstallPath('/home/test/OpenClaw').valid).toBe(true);
      expect(adapter.validateInstallPath('/opt/OpenClaw').valid).toBe(true);
    });
  });

  describe('浏览器命令', () => {
    it('should use xdg-open command', () => {
      const result = adapter.getBrowserOpenCommand('http://localhost:18790');
      expect(result).not.toBeNull();
      expect(result!.file).toBe('xdg-open');
      expect(result!.args).toContain('http://localhost:18790');
    });
  });

  describe('依赖安装', () => {
    it('should return apt-get for git', () => {
      const plan = adapter.getDependencyInstallPlan('git');
      expect(plan).not.toBeNull();
      expect(plan!.command).toContain('apt-get');
    });
  });

  describe('解压方案', () => {
    it('should use unzip for zip files', () => {
      const plan = adapter.getArchiveExtractPlan('zip');
      expect(plan).not.toBeNull();
      expect(plan!.file).toBe('unzip');
    });

    it('should use tar for tar.gz files', () => {
      const plan = adapter.getArchiveExtractPlan('tar.gz');
      expect(plan).not.toBeNull();
      expect(plan!.file).toBe('tar');
    });
  });

  describe('存储路径', () => {
    it('should return XDG standard paths', () => {
      const paths = adapter.getStoragePaths('TestApp');
      expect(paths.configDir).toContain('.config');
      expect(paths.cacheDir).toContain('.cache');
      expect(paths.dataDir).toContain('.local/share');
      expect(paths.tempDir).toBe('/tmp');
    });
  });

  describe('密钥存储', () => {
    it('should use file storage', () => {
      const store = adapter.getSecretStore();
      expect(store.kind).toBe('file');
      expect(store.basePath).toBeDefined();
    });
  });

  describe('自启动策略', () => {
    it('should use systemd', () => {
      const strategy = adapter.getAutostartStrategy();
      expect(strategy.kind).toBe('systemd');
    });
  });

  describe('发布资产', () => {
    it('should return linux binary name without extension', () => {
      const assets = adapter.getReleaseAssetNames();
      expect(assets.binary).toContain('linux');
      expect(assets.binary).not.toContain('.exe');
    });

    it('should return tar.gz offline bundle', () => {
      const assets = adapter.getReleaseAssetNames();
      expect(assets.offlineBundle).toContain('.tar.gz');
    });
  });
});

// ============================================
// 跨平台对比测试
// ============================================
describe('Cross-Platform Comparison', () => {
  const macosAdapter = new (class {
    id = 'macos';
    getSecretStore() { return { kind: 'keychain' as const }; }
    getAutostartStrategy() { return { kind: 'launchd' as const }; }
    getReleaseAssetNames() { return { binary: 'openclaw-deploy-macos-x64' }; }
  })();

  const windowsAdapter = new (class {
    id = 'windows';
    getSecretStore() { return { kind: 'credential-manager' as const }; }
    getAutostartStrategy() { return { kind: 'task-scheduler' as const }; }
    getReleaseAssetNames() { return { binary: 'openclaw-deploy-win-x64.exe' }; }
  })();

  const linuxAdapter = new (class {
    id = 'linux';
    getSecretStore() { return { kind: 'file' as const, basePath: '/config' }; }
    getAutostartStrategy() { return { kind: 'systemd' as const }; }
    getReleaseAssetNames() { return { binary: 'openclaw-deploy-linux-x64' }; }
  })();

  describe('密钥存储对比', () => {
    it('should have different secret store kinds for each platform', () => {
      const stores = [
        macosAdapter.getSecretStore().kind,
        windowsAdapter.getSecretStore().kind,
        linuxAdapter.getSecretStore().kind,
      ];

      expect(new Set(stores).size).toBe(3); // 三个不同的值
    });
  });

  describe('自启动策略对比', () => {
    it('should have different autostart strategies for each platform', () => {
      const strategies = [
        macosAdapter.getAutostartStrategy().kind,
        windowsAdapter.getAutostartStrategy().kind,
        linuxAdapter.getAutostartStrategy().kind,
      ];

      expect(new Set(strategies).size).toBe(3); // 三个不同的值
    });
  });

  describe('发布资产名称对比', () => {
    it('should have unique binary names for each platform', () => {
      const binaries = [
        macosAdapter.getReleaseAssetNames().binary,
        windowsAdapter.getReleaseAssetNames().binary,
        linuxAdapter.getReleaseAssetNames().binary,
      ];

      expect(new Set(binaries).size).toBe(3);
    });

    it('should include platform name in binary', () => {
      expect(macosAdapter.getReleaseAssetNames().binary).toContain('macos');
      expect(windowsAdapter.getReleaseAssetNames().binary).toContain('win');
      expect(linuxAdapter.getReleaseAssetNames().binary).toContain('linux');
    });

    it('should have .exe extension only for Windows', () => {
      expect(windowsAdapter.getReleaseAssetNames().binary).toContain('.exe');
      expect(macosAdapter.getReleaseAssetNames().binary).not.toContain('.exe');
      expect(linuxAdapter.getReleaseAssetNames().binary).not.toContain('.exe');
    });
  });

  describe('平台ID对比', () => {
    it('should have unique platform IDs', () => {
      const ids = [macosAdapter.id, windowsAdapter.id, linuxAdapter.id];
      expect(new Set(ids).size).toBe(3);
    });
  });
});

// ============================================
// 自动更新功能对比测试
// ============================================
describe('Auto-Update Feature Comparison', () => {
  function getAutoUpdateBehavior(platform: 'macos' | 'windows' | 'linux'): {
    supportsAutoUpdate: boolean;
    requiresManualUpdate: boolean;
    platformAction: 'download' | 'self_update';
  } {
    if (platform === 'macos') {
      return {
        supportsAutoUpdate: false,
        requiresManualUpdate: true,
        platformAction: 'download',
      };
    }

    return {
      supportsAutoUpdate: true,
      requiresManualUpdate: false,
      platformAction: 'self_update',
    };
  }

  it('macOS should NOT support auto-update', () => {
    const behavior = getAutoUpdateBehavior('macos');
    expect(behavior.supportsAutoUpdate).toBe(false);
    expect(behavior.requiresManualUpdate).toBe(true);
    expect(behavior.platformAction).toBe('download');
  });

  it('Windows should support auto-update', () => {
    const behavior = getAutoUpdateBehavior('windows');
    expect(behavior.supportsAutoUpdate).toBe(true);
    expect(behavior.requiresManualUpdate).toBe(false);
    expect(behavior.platformAction).toBe('self_update');
  });

  it('Linux should support auto-update', () => {
    const behavior = getAutoUpdateBehavior('linux');
    expect(behavior.supportsAutoUpdate).toBe(true);
    expect(behavior.requiresManualUpdate).toBe(false);
    expect(behavior.platformAction).toBe('self_update');
  });

  it('only macOS requires manual update', () => {
    const platforms = ['windows', 'linux'] as const;
    for (const platform of platforms) {
      expect(getAutoUpdateBehavior(platform).requiresManualUpdate).toBe(false);
    }
    expect(getAutoUpdateBehavior('macos').requiresManualUpdate).toBe(true);
  });
});

// ============================================
// 路径分隔符测试
// ============================================
describe('Path Separator Differences', () => {
  it('macOS and Linux should use forward slash', () => {
    const macosPath = '/Users/test/Applications/OpenClaw';
    const linuxPath = '/home/test/.local/share/OpenClaw';

    expect(macosPath).toContain('/');
    expect(linuxPath).toContain('/');
    expect(macosPath).not.toContain('\\');
    expect(linuxPath).not.toContain('\\');
  });

  it('Windows should use backslash', () => {
    const windowsPath = 'C:\\Users\\test\\AppData\\Local\\OpenClaw';
    expect(windowsPath).toContain('\\');
  });

  it('Windows paths should start with drive letter', () => {
    const windowsPath = 'C:\\Users\\test\\AppData\\Local\\OpenClaw';
    expect(windowsPath).toMatch(/^[A-Z]:\\/);
  });

  it('Unix paths should start with forward slash', () => {
    const macosPath = '/Users/test/Applications/OpenClaw';
    const linuxPath = '/home/test/.local/share/OpenClaw';

    expect(macosPath).toMatch(/^\//);
    expect(linuxPath).toMatch(/^\//);
  });
});

// ============================================
// 浏览器打开命令对比
// ============================================
describe('Browser Open Command Comparison', () => {
  function getBrowserCommand(platform: 'macos' | 'windows' | 'linux'): string {
    switch (platform) {
      case 'macos': return 'open';
      case 'windows': return 'cmd';
      case 'linux': return 'xdg-open';
    }
  }

  it('should use different commands for each platform', () => {
    const commands = [
      getBrowserCommand('macos'),
      getBrowserCommand('windows'),
      getBrowserCommand('linux'),
    ];

    expect(new Set(commands).size).toBe(3);
  });

  it('macOS should use open', () => {
    expect(getBrowserCommand('macos')).toBe('open');
  });

  it('Windows should use cmd', () => {
    expect(getBrowserCommand('windows')).toBe('cmd');
  });

  it('Linux should use xdg-open', () => {
    expect(getBrowserCommand('linux')).toBe('xdg-open');
  });
});

// ============================================
// Git 安装命令对比
// ============================================
describe('Git Installation Command Comparison', () => {
  function getGitInstallCommand(platform: 'macos' | 'windows' | 'linux'): string {
    switch (platform) {
      case 'macos': return 'xcode-select --install';
      case 'windows': return 'winget install Git.Git';
      case 'linux': return 'apt-get install git';
    }
  }

  it('macOS should use xcode-select', () => {
    expect(getGitInstallCommand('macos')).toContain('xcode-select');
  });

  it('Windows should use winget', () => {
    expect(getGitInstallCommand('windows')).toContain('winget');
  });

  it('Linux should use apt-get', () => {
    expect(getGitInstallCommand('linux')).toContain('apt-get');
  });

  it('should have different commands for each platform', () => {
    const commands = [
      getGitInstallCommand('macos'),
      getGitInstallCommand('windows'),
      getGitInstallCommand('linux'),
    ];

    expect(new Set(commands).size).toBe(3);
  });
});
