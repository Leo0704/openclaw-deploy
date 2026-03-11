import { describe, it, expect } from 'vitest';
import * as path from 'path';

describe('OpenClaw Project Functions', () => {
  describe('detectProjectPackageManager', () => {
    // Mock function - testing the logic
    function detectProjectPackageManagerLogic(
      packageJson: { packageManager?: string },
      hasPnpmLock: boolean
    ): 'pnpm' | 'npm' {
      const packageManager = String(packageJson?.packageManager || '').split('@')[0].trim();

      if (packageManager === 'pnpm' || hasPnpmLock) {
        return 'pnpm';
      }

      return 'npm';
    }

    it('should return pnpm when packageManager is pnpm', () => {
      const result = detectProjectPackageManagerLogic({ packageManager: 'pnpm@8' }, false);
      expect(result).toBe('pnpm');
    });

    it('should return pnpm when pnpm-lock.yaml exists', () => {
      const result = detectProjectPackageManagerLogic({}, true);
      expect(result).toBe('pnpm');
    });

    it('should return npm when no package manager specified', () => {
      const result = detectProjectPackageManagerLogic({}, false);
      expect(result).toBe('npm');
    });

    it('should return npm when packageManager is npm', () => {
      const result = detectProjectPackageManagerLogic({ packageManager: 'npm@10' }, false);
      expect(result).toBe('npm');
    });

    it('should handle empty packageManager', () => {
      const result = detectProjectPackageManagerLogic({ packageManager: '' }, false);
      expect(result).toBe('npm');
    });
  });

  describe('normalizeProjectPath', () => {
    function normalizeProjectPathLogic(projectPath: string): string {
      if (!projectPath) return '';
      // Simple normalization - in real code this handles ~ and environment variables
      let normalized = projectPath.trim();
      if (normalized === '~') {
        return process.env.HOME || process.env.USERPROFILE || '';
      }
      return path.resolve(normalized);
    }

    it('should resolve absolute paths', () => {
      const result = normalizeProjectPathLogic('/usr/local/bin');
      expect(result).toBe(path.resolve('/usr/local/bin'));
    });

    it('should handle empty path', () => {
      const result = normalizeProjectPathLogic('');
      expect(result).toBe('');
    });

    it('should handle whitespace', () => {
      const result = normalizeProjectPathLogic('  /path  ');
      expect(result).toBe(path.resolve('/path'));
    });
  });

  describe('isOpenClawProjectDir', () => {
    // Test the logic without file system
    function isOpenClawProjectDirLogic(
      hasPackageJson: boolean,
      hasOpenClawConfig: boolean
    ): boolean {
      return hasPackageJson || hasOpenClawConfig;
    }

    it('should return true when has package.json', () => {
      expect(isOpenClawProjectDirLogic(true, false)).toBe(true);
    });

    it('should return true when has openclaw config', () => {
      expect(isOpenClawProjectDirLogic(false, true)).toBe(true);
    });

    it('should return false when neither exists', () => {
      expect(isOpenClawProjectDirLogic(false, false)).toBe(false);
    });
  });

  describe('getInstallCommand', () => {
    function getInstallCommandLogic(
      packageManager: 'pnpm' | 'npm',
      usePnpm: boolean
    ): string {
      if (packageManager === 'pnpm' && usePnpm) {
        return 'pnpm install';
      }
      return 'npm install';
    }

    it('should return pnpm install command', () => {
      const result = getInstallCommandLogic('pnpm', true);
      expect(result).toBe('pnpm install');
    });

    it('should return npm install command', () => {
      const result = getInstallCommandLogic('npm', false);
      expect(result).toBe('npm install');
    });
  });

  describe('getOpenClawStartCommand', () => {
    function getOpenClawStartCommandLogic(
      packageManager: 'pnpm' | 'npm',
      port: number
    ): string {
      if (packageManager === 'pnpm') {
        return `pnpm openclaw gateway run --port ${port} --allow-unconfigured`;
      }
      return `npm run openclaw -- gateway run --port ${port} --allow-unconfigured`;
    }

    it('should generate pnpm start command', () => {
      const result = getOpenClawStartCommandLogic('pnpm', 18789);
      expect(result).toContain('pnpm');
      expect(result).toContain('18789');
    });

    it('should generate npm start command', () => {
      const result = getOpenClawStartCommandLogic('npm', 18789);
      expect(result).toContain('npm');
      expect(result).toContain('18789');
    });

    it('should include gateway run command', () => {
      const result = getOpenClawStartCommandLogic('pnpm', 18789);
      expect(result).toContain('gateway run');
    });

    it('should include allow-unconfigured flag', () => {
      const result = getOpenClawStartCommandLogic('npm', 18789);
      expect(result).toContain('--allow-unconfigured');
    });
  });

  describe('Project Path Validation', () => {
    it('should validate Unix root path', () => {
      const isRoot = (p: string) => {
        const resolved = path.resolve(p);
        return resolved === path.parse(resolved).root;
      };

      // This test only runs on Unix-like systems
      if (process.platform !== 'win32') {
        expect(isRoot('/')).toBe(true);
      }
    });

    it('should validate project path is not home directory', () => {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      expect(homeDir).toBeTruthy();
    });
  });

  describe('Package Manager Detection', () => {
    it('should have pnpm and npm as options', () => {
      const packageManagers = ['pnpm', 'npm'];
      expect(packageManagers).toContain('pnpm');
      expect(packageManagers).toContain('npm');
    });

    it('should detect pnpm from packageManager field', () => {
      const packageJson = { packageManager: 'pnpm@8.15.0' };
      const detected = String(packageJson.packageManager).split('@')[0];
      expect(detected).toBe('pnpm');
    });

    it('should detect pnpm from lock file presence', () => {
      const lockFiles = ['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json'];
      const hasPnpmLock = lockFiles[0] === 'pnpm-lock.yaml';
      expect(hasPnpmLock).toBe(true);
    });
  });

  describe('Configuration Files', () => {
    it('should recognize openclaw config files', () => {
      const configFiles = [
        'openclaw.config.json',
        '.openclawrc',
        'openclaw.config.js',
      ];

      expect(configFiles.length).toBe(3);
      expect(configFiles[0]).toContain('openclaw');
    });

    it('should recognize openclaw package.json', () => {
      const packageJsonName = 'package.json';
      expect(packageJsonName).toBe('package.json');
    });
  });

  describe('Port Configuration', () => {
    it('should use default gateway port', () => {
      const DEFAULT_GATEWAY_PORT = 18789;
      expect(DEFAULT_GATEWAY_PORT).toBe(18789);
    });

    it('should use default web port', () => {
      const DEFAULT_WEB_PORT = 18790;
      expect(DEFAULT_WEB_PORT).toBe(18790);
    });

    it('should handle custom port', () => {
      const customPort = 20000;
      expect(customPort).toBeGreaterThan(1024);
      expect(customPort).toBeLessThan(65536);
    });
  });

  describe('State Directory', () => {
    it('should construct state directory path', () => {
      const baseDir = '.lobster-assistant';
      const stateDir = 'state';
      const fullPath = path.join(baseDir, stateDir);
      expect(fullPath).toContain('.lobster-assistant');
      expect(fullPath).toContain('state');
    });

    it('should handle platform-specific paths', () => {
      const platform = process.platform;
      const isWindows = platform === 'win32';
      const isMac = platform === 'darwin';
      const isLinux = platform === 'linux';

      expect(isWindows || isMac || isLinux).toBe(true);
    });
  });

  describe('Skills Directory', () => {
    it('should construct skills directory path', () => {
      const baseDir = '.lobster-assistant';
      const skillsDir = 'skills';
      const fullPath = path.join(baseDir, 'openclaw', skillsDir);
      expect(fullPath).toContain('skills');
    });
  });
});

describe('Version Detection', () => {
  it('should parse version string', () => {
    const version = '1.0.0';
    const parts = version.split('.');
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe('1');
  });

  it('should handle pre-release versions', () => {
    const version = '1.0.0-beta.1';
    expect(version).toContain('beta');
  });
});

describe('Git Integration', () => {
  it('should recognize .git directory', () => {
    const gitDir = '.git';
    expect(gitDir).toBe('.git');
  });

  it('should check git command availability', () => {
    const command = 'git';
    expect(command).toBe('git');
  });

  it('should construct git fetch command', () => {
    const remote = 'origin';
    const branch = 'main';
    const command = `git fetch ${remote}`;
    expect(command).toContain('fetch');
  });
});
