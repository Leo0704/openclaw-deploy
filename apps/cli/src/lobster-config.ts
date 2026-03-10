const fs = require('fs') as typeof import('fs');
const os = require('os') as typeof import('os');
const path = require('path') as typeof import('path');

export function getConfigPath() {
  const dir = path.join(os.homedir(), '.lobster-assistant');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'config.json');
}

export function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'));
  } catch {
    return {};
  }
}

export function saveConfig(config: Record<string, unknown>) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
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
