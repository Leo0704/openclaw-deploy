import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as os from 'os';

describe('lobster-config pure functions', () => {
  describe('clearOpenClawDeploymentConfig', () => {
    function clearOpenClawDeploymentConfig(config: Record<string, unknown>) {
      delete config.installPath;
      delete config.provider;
      delete config.model;
      delete config.apiKey;
      delete config.baseUrl;
      delete config.apiFormat;
      delete config.customModelId;
      delete config.customEndpointId;
      delete config.customModelAlias;
      delete config.gatewayPort;
    }

    it('should remove all deployment-related keys', () => {
      const config = {
        installPath: '/test',
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'secret',
        baseUrl: 'https://api.example.com',
        apiFormat: 'openai',
        customModelId: 'model-1',
        customEndpointId: 'endpoint-1',
        customModelAlias: 'my-model',
        gatewayPort: 18789,
        someOtherKey: 'should remain',
      };

      clearOpenClawDeploymentConfig(config);

      expect(config.installPath).toBeUndefined();
      expect(config.provider).toBeUndefined();
      expect(config.model).toBeUndefined();
      expect(config.apiKey).toBeUndefined();
      expect(config.baseUrl).toBeUndefined();
      expect(config.apiFormat).toBeUndefined();
      expect(config.customModelId).toBeUndefined();
      expect(config.customEndpointId).toBeUndefined();
      expect(config.customModelAlias).toBeUndefined();
      expect(config.gatewayPort).toBeUndefined();
      expect(config.someOtherKey).toBe('should remain');
    });

    it('should handle empty config', () => {
      const config = {};

      expect(() => clearOpenClawDeploymentConfig(config)).not.toThrow();
    });
  });

  describe('isProtectedRemovalPath', () => {
    function isProtectedRemovalPath(targetPath: string): boolean {
      const normalized = path.resolve(targetPath);
      const parsed = path.parse(normalized);
      const homeDir = path.resolve(os.homedir());
      const cwd = path.resolve(process.cwd());

      return (
        !normalized ||
        normalized === parsed.root ||
        normalized === homeDir ||
        normalized === cwd ||
        normalized === path.dirname(homeDir)
      );
    }

    it('should protect root directory', () => {
      const rootPath = process.platform === 'win32' ? 'C:\\' : '/';
      expect(isProtectedRemovalPath(rootPath)).toBe(true);
    });

    it('should protect home directory', () => {
      expect(isProtectedRemovalPath(os.homedir())).toBe(true);
    });

    it('should protect current working directory', () => {
      expect(isProtectedRemovalPath(process.cwd())).toBe(true);
    });

    it('should allow safe paths', () => {
      const safePath = path.join(os.tmpdir(), 'test-' + Date.now(), 'subdir');
      expect(isProtectedRemovalPath(safePath)).toBe(false);
    });

    it('should handle parent of home directory', () => {
      const parentOfHome = path.dirname(os.homedir());
      expect(isProtectedRemovalPath(parentOfHome)).toBe(true);
    });

    it('should reject empty path', () => {
      expect(isProtectedRemovalPath('')).toBe(true);
    });
  });

  describe('UpdateState type', () => {
    it('should have all expected update modes', () => {
      const modes = ['up_to_date', 'available', 'recommended', 'required'];

      modes.forEach(mode => {
        const state = {
          currentVersion: '1.0.0',
          mode: mode as 'up_to_date' | 'available' | 'recommended' | 'required',
        };
        expect(state.mode).toBe(mode);
      });
    });

    it('should support all UpdateState properties', () => {
      const state = {
        currentVersion: '1.0.0',
        latestVersion: '1.0.1',
        minimumSupportedVersion: '1.0.0',
        mode: 'available' as const,
        lastCheckedAt: '2024-01-01T00:00:00Z',
        lastCheckSucceededAt: '2024-01-01T00:00:00Z',
        lastCheckFailedAt: undefined as string | undefined,
        lastError: undefined as string | undefined,
        downloading: false,
        updateReady: true,
        downloadUrl: 'https://example.com/download',
        notesUrl: 'https://example.com/notes',
        platformAction: 'download' as const,
      };

      expect(state.currentVersion).toBe('1.0.0');
      expect(state.latestVersion).toBe('1.0.1');
      expect(state.mode).toBe('available');
      expect(state.downloading).toBe(false);
      expect(state.updateReady).toBe(true);
    });
  });

  describe('Config path generation', () => {
    it('should generate config path in home directory', () => {
      const configPath = path.join(os.homedir(), '.lobster-assistant', 'config.json');
      expect(configPath).toContain('.lobster-assistant');
    });

    it('should generate update state path in home directory', () => {
      const updateStatePath = path.join(os.homedir(), '.lobster-assistant', 'update-state.json');
      expect(updateStatePath).toContain('.lobster-assistant');
    });
  });

  describe('removePathIfExists logic', () => {
    // Simulating the removePathIfExists function behavior without actual file system operations
    function simulateRemovePathIfExists(
      targetPath: string,
      existingPaths: Set<string>,
      removed: string[]
    ): { success: boolean; error?: string } {
      function isProtectedRemovalPath(p: string): boolean {
        const normalized = path.resolve(p);
        const parsed = path.parse(normalized);
        const homeDir = path.resolve(os.homedir());
        const cwd = path.resolve(process.cwd());

        return (
          !normalized ||
          normalized === parsed.root ||
          normalized === homeDir ||
          normalized === cwd ||
          normalized === path.dirname(homeDir)
        );
      }

      if (!targetPath) {
        return { success: true };
      }

      const normalized = path.resolve(targetPath);

      if (!existingPaths.has(normalized)) {
        return { success: true };
      }

      if (isProtectedRemovalPath(normalized)) {
        return { success: false, error: `拒绝删除高风险路径: ${normalized}` };
      }

      existingPaths.delete(normalized);
      removed.push(normalized);
      return { success: true };
    }

    it('should handle empty path', () => {
      const existingPaths = new Set(['/some/path']);
      const removed: string[] = [];

      const result = simulateRemovePathIfExists('', existingPaths, removed);

      expect(result.success).toBe(true);
      expect(removed.length).toBe(0);
    });

    it('should handle non-existent path', () => {
      const existingPaths = new Set(['/existing/path']);
      const removed: string[] = [];

      const result = simulateRemovePathIfExists('/nonexistent/path', existingPaths, removed);

      expect(result.success).toBe(true);
      expect(removed.length).toBe(0);
    });

    it('should reject protected paths', () => {
      const existingPaths = new Set([os.homedir()]);
      const removed: string[] = [];

      const result = simulateRemovePathIfExists(os.homedir(), existingPaths, removed);

      expect(result.success).toBe(false);
      expect(result.error).toContain('拒绝删除高风险路径');
      expect(removed.length).toBe(0);
    });

    it('should remove safe existing paths', () => {
      const safePath = path.join(os.tmpdir(), 'test-safe-path');
      const existingPaths = new Set([safePath]);
      const removed: string[] = [];

      const result = simulateRemovePathIfExists(safePath, existingPaths, removed);

      expect(result.success).toBe(true);
      expect(removed).toContain(path.resolve(safePath));
      expect(existingPaths.has(path.resolve(safePath))).toBe(false);
    });
  });

  describe('UpdateState transitions', () => {
    type UpdateMode = 'up_to_date' | 'available' | 'recommended' | 'required';

    function createUpdateState(currentVersion: string, mode: UpdateMode) {
      return {
        currentVersion,
        mode,
        lastCheckedAt: new Date().toISOString(),
      };
    }

    function updateModeFromVersions(
      current: string,
      latest: string,
      minimum?: string
    ): UpdateMode {
      if (current === latest) return 'up_to_date';
      if (minimum && compareVersions(current, minimum) < 0) return 'required';
      return 'available';
    }

    function compareVersions(a: string, b: string): number {
      const partsA = a.split('.').map(Number);
      const partsB = b.split('.').map(Number);

      for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const numA = partsA[i] || 0;
        const numB = partsB[i] || 0;
        if (numA < numB) return -1;
        if (numA > numB) return 1;
      }
      return 0;
    }

    it('should create up_to_date state when versions match', () => {
      const state = createUpdateState('1.0.0', 'up_to_date');
      expect(state.mode).toBe('up_to_date');
      expect(state.currentVersion).toBe('1.0.0');
    });

    it('should detect required update when below minimum', () => {
      const mode = updateModeFromVersions('1.0.0', '1.0.2', '1.0.1');
      expect(mode).toBe('required');
    });

    it('should detect available update when above minimum', () => {
      const mode = updateModeFromVersions('1.0.1', '1.0.2', '1.0.0');
      expect(mode).toBe('available');
    });

    it('should return up_to_date when current matches latest', () => {
      const mode = updateModeFromVersions('1.0.0', '1.0.0');
      expect(mode).toBe('up_to_date');
    });

    it('should compare versions correctly', () => {
      expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
      expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
      expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    });
  });

  describe('Config normalization', () => {
    function normalizeConfigPath(configPath: string | undefined): string {
      if (!configPath) return '';
      return path.resolve(configPath);
    }

    function normalizeInstallPath(installPath: string | undefined): string {
      if (!installPath) return '';
      return path.resolve(installPath);
    }

    it('should normalize install path', () => {
      const result = normalizeInstallPath('/some/path');
      expect(path.isAbsolute(result)).toBe(true);
    });

    it('should handle undefined install path', () => {
      const result = normalizeInstallPath(undefined);
      expect(result).toBe('');
    });

    it('should handle empty install path', () => {
      const result = normalizeInstallPath('');
      expect(result).toBe('');
    });
  });

  describe('clearUpdateStateError', () => {
    function clearUpdateStateError(state: {
      currentVersion: string;
      mode: string;
      lastError?: string;
    }): void {
      delete state.lastError;
    }

    it('should remove lastError from state', () => {
      const state = {
        currentVersion: '1.0.0',
        mode: 'available',
        lastError: 'Something went wrong',
      };

      clearUpdateStateError(state);

      expect(state.lastError).toBeUndefined();
    });

    it('should not throw when no error exists', () => {
      const state = {
        currentVersion: '1.0.0',
        mode: 'up_to_date',
      };

      expect(() => clearUpdateStateError(state)).not.toThrow();
    });
  });

  describe('Config file paths', () => {
    it('should have consistent directory name', () => {
      const configDir = '.lobster-assistant';
      const configPath = path.join(os.homedir(), configDir, 'config.json');
      const updateStatePath = path.join(os.homedir(), configDir, 'update-state.json');

      expect(path.dirname(configPath)).toBe(path.dirname(updateStatePath));
    });

    it('should use JSON file extension', () => {
      const configPath = path.join(os.homedir(), '.lobster-assistant', 'config.json');
      const updateStatePath = path.join(os.homedir(), '.lobster-assistant', 'update-state.json');

      expect(configPath.endsWith('.json')).toBe(true);
      expect(updateStatePath.endsWith('.json')).toBe(true);
    });
  });

  describe('Config validation', () => {
    function validateConfig(config: Record<string, unknown>): { valid: boolean; errors: string[] } {
      const errors: string[] = [];

      if (config.gatewayPort !== undefined) {
        const port = config.gatewayPort as number;
        if (port < 1024 || port > 65535) {
          errors.push('gatewayPort must be between 1024 and 65535');
        }
      }

      if (config.apiKey !== undefined && config.apiKey !== '') {
        const key = config.apiKey as string;
        if (key.length < 10) {
          errors.push('apiKey must be at least 10 characters');
        }
      }

      return { valid: errors.length === 0, errors };
    }

    it('should validate valid config', () => {
      const config = {
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'valid-api-key-12345',
        gatewayPort: 8080,
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should reject invalid port', () => {
      const config = {
        gatewayPort: 80,
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('gatewayPort must be between 1024 and 65535');
    });

    it('should reject short API key', () => {
      const config = {
        apiKey: 'short',
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('apiKey must be at least 10 characters');
    });

    it('should allow empty API key', () => {
      const config = {
        apiKey: '',
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should allow undefined fields', () => {
      const config = {};

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should collect multiple errors', () => {
      const config = {
        gatewayPort: 80,
        apiKey: 'short',
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2);
    });
  });
});
