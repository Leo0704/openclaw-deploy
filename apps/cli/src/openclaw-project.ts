const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const os = require('os') as typeof import('os');

export function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function detectProjectPackageManager(projectPath: string): 'pnpm' | 'npm' {
  const packageJsonPath = path.join(projectPath, 'package.json');
  const packageJson = readJsonFile(packageJsonPath);
  const packageManager = String(packageJson?.packageManager || '').split('@')[0].trim();

  if (packageManager === 'pnpm' || fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }

  return 'npm';
}

export function isOpenClawProjectDir(projectPath: string): boolean {
  if (!projectPath || !fs.existsSync(projectPath)) {
    return false;
  }

  try {
    const stat = fs.statSync(projectPath);
    if (!stat.isDirectory()) {
      return false;
    }
  } catch {
    return false;
  }

  const packageJson = readJsonFile(path.join(projectPath, 'package.json'));
  const packageName = String(packageJson?.name || '').trim();
  return packageName === 'openclaw';
}

export function getInstallCommand(projectPath: string): { pm: 'pnpm' | 'npm'; command: string } {
  const pm = detectProjectPackageManager(projectPath);
  return { pm, command: pm === 'pnpm' ? 'pnpm install' : 'npm install' };
}

export function getBuildCommand(projectPath: string): { pm: 'pnpm' | 'npm'; command: string } {
  const pm = detectProjectPackageManager(projectPath);
  return { pm, command: pm === 'pnpm' ? 'pnpm run build' : 'npm run build' };
}

export function getOpenClawStartCommand(projectPath: string, port: number): string {
  const pm = detectProjectPackageManager(projectPath);
  return pm === 'pnpm'
    ? `pnpm openclaw gateway run --port ${port} --allow-unconfigured`
    : `npm run openclaw -- gateway run --port ${port} --allow-unconfigured`;
}

export function getOpenClawConfigPath(): string {
  return path.join(os.homedir(), '.openclaw', 'openclaw.json');
}

export function getManagedOpenClawConfigPath(config: Record<string, unknown>): string {
  const installPath = String(config.installPath || '').trim();
  if (installPath && isOpenClawProjectDir(installPath)) {
    return path.join(installPath, '.claude', 'openclaw.json');
  }
  return getOpenClawConfigPath();
}

export function getManagedOpenClawStateDir(config: Record<string, unknown>): string {
  const installPath = String(config.installPath || '').trim();
  if (installPath && isOpenClawProjectDir(installPath)) {
    return path.join(installPath, '.claude', 'state');
  }
  return path.join(os.homedir(), '.openclaw');
}

export function getManagedOpenClawSkillsDir(config: Record<string, unknown>): string {
  return path.join(getManagedOpenClawStateDir(config), 'skills');
}

export function readManagedOpenClawConfig(config: Record<string, unknown>): {
  path: string;
  exists: boolean;
  config: Record<string, unknown>;
} {
  const configPath = getManagedOpenClawConfigPath(config);
  const parsed = readJsonFile(configPath);
  return {
    path: configPath,
    exists: !!parsed,
    config: parsed || {},
  };
}

export function readOpenClawRuntimeConfig(config?: Record<string, unknown>): Record<string, unknown> {
  if (config) {
    return readManagedOpenClawConfig(config).config;
  }
  return readJsonFile(getOpenClawConfigPath()) || {};
}

export function writeManagedOpenClawConfig(config: Record<string, unknown>, nextConfig: Record<string, unknown>) {
  const configPath = getManagedOpenClawConfigPath(config);
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2));
  return configPath;
}

export function mergeOpenClawConfigSections(
  baseConfig: Record<string, unknown>,
  patchConfig: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...baseConfig,
    ...patchConfig,
  };

  const baseModels = (baseConfig.models as Record<string, unknown> | undefined) || {};
  const patchModels = (patchConfig.models as Record<string, unknown> | undefined) || {};
  if (baseConfig.models || patchConfig.models) {
    merged.models = {
      ...baseModels,
      ...patchModels,
      providers: {
        ...(((baseModels.providers as Record<string, unknown> | undefined) || {})),
        ...(((patchModels.providers as Record<string, unknown> | undefined) || {})),
      },
    };
  }

  const baseAgents = (baseConfig.agents as Record<string, unknown> | undefined) || {};
  const patchAgents = (patchConfig.agents as Record<string, unknown> | undefined) || {};
  const baseDefaults = (baseAgents.defaults as Record<string, unknown> | undefined) || {};
  const patchDefaults = (patchAgents.defaults as Record<string, unknown> | undefined) || {};
  if (baseConfig.agents || patchConfig.agents) {
    merged.agents = {
      ...baseAgents,
      ...patchAgents,
      defaults: {
        ...baseDefaults,
        ...patchDefaults,
        model: {
          ...(((baseDefaults.model as Record<string, unknown> | undefined) || {})),
          ...(((patchDefaults.model as Record<string, unknown> | undefined) || {})),
        },
        models: {
          ...(((baseDefaults.models as Record<string, unknown> | undefined) || {})),
          ...(((patchDefaults.models as Record<string, unknown> | undefined) || {})),
        },
      },
    };
  }

  return merged;
}

export function resolveOpenClawWorkspaceDir(config?: Record<string, unknown>): string {
  const cfg = readOpenClawRuntimeConfig(config);
  const agents = cfg.agents as Record<string, unknown> | undefined;
  const defaults = agents?.defaults as Record<string, unknown> | undefined;
  const configured = String(defaults?.workspace || '').trim();
  if (configured) {
    return path.resolve(configured);
  }
  return config
    ? path.join(getManagedOpenClawStateDir(config), 'workspace')
    : path.join(os.homedir(), '.openclaw', 'workspace');
}
