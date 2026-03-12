const fs = require('fs') as typeof import('fs');
const os = require('os') as typeof import('os');
const path = require('path') as typeof import('path');
const { normalizePath } = require('../../platform/path/platform-paths') as typeof import('../../platform/path/platform-paths');

export function getConfigPath() {
  const dir = path.join(os.homedir(), '.lobster-assistant');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'config.json');
}

export function loadConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8')) as Record<string, unknown>;
    if (typeof config.installPath === 'string') {
      config.installPath = normalizePath(config.installPath);
    }
    return config;
  } catch {
    return {};
  }
}

export function saveConfig(config: Record<string, unknown>) {
  const nextConfig = { ...config };
  if (typeof nextConfig.installPath === 'string') {
    nextConfig.installPath = normalizePath(nextConfig.installPath);
  }
  fs.writeFileSync(getConfigPath(), JSON.stringify(nextConfig, null, 2));
}

export function clearOpenClawDeploymentConfig(config: Record<string, unknown>) {
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

export function isProtectedRemovalPath(targetPath: string): boolean {
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

export function removePathIfExists(targetPath: string, removed: string[]) {
  if (!targetPath) return;
  const normalized = path.resolve(targetPath);
  if (!fs.existsSync(normalized)) return;
  if (isProtectedRemovalPath(normalized)) {
    throw new Error(`拒绝删除高风险路径: ${normalized}`);
  }
  fs.rmSync(normalized, { recursive: true, force: true });
  removed.push(normalized);
}

// ============================================
// 更新状态持久化
// ============================================

export type UpdateState = {
  currentVersion: string;
  latestVersion?: string;
  minimumSupportedVersion?: string;
  mode: 'up_to_date' | 'available' | 'recommended' | 'required';
  lastCheckedAt?: string;
  lastCheckSucceededAt?: string;
  lastCheckFailedAt?: string;
  lastError?: string;
  downloading?: boolean;
  updateReady?: boolean;
  downloadUrl?: string;
  notesUrl?: string;
  platformAction?: 'download' | 'self_update';
};

export function getUpdateStatePath(): string {
  const dir = path.join(os.homedir(), '.lobster-assistant');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'update-state.json');
}

export function loadUpdateState(): UpdateState {
  try {
    const filePath = getUpdateStatePath();
    if (!fs.existsSync(filePath)) {
      return {
        currentVersion: '',
        mode: 'up_to_date',
      };
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as UpdateState;
  } catch {
    return {
      currentVersion: '',
      mode: 'up_to_date',
    };
  }
}

export function saveUpdateState(state: UpdateState): void {
  const filePath = getUpdateStatePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

export function clearUpdateStateError(): void {
  const state = loadUpdateState();
  delete state.lastError;
  saveUpdateState(state);
}
