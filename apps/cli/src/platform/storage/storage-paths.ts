/**
 * 应用存储路径
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getPlatformAdapter } from '../index';
import { normalizePath, isOpenClawProjectDir, readJsonFile } from '../path/platform-paths';

const APP_NAME = 'openclaw-deploy';

export interface StoragePaths {
  configDir: string;
  cacheDir: string;
  dataDir: string;
  logDir: string;
  tempDir: string;
}

export function getAppStoragePaths(appName: string = APP_NAME): StoragePaths {
  const adapter = getPlatformAdapter();
  return adapter.getStoragePaths(appName);
}

/**
 * 获取 OpenClaw 配置文件路径（用户主目录）
 */
export function getOpenClawConfigPath(): string {
  return path.join(os.homedir(), '.openclaw', 'openclaw.json');
}

function getFallbackOpenClawBaseDir(): string {
  return path.join(os.homedir(), '.openclaw');
}

function canUseProjectManagedStorage(installPath: string): boolean {
  const managedDir = path.join(installPath, '.claude');
  try {
    fs.mkdirSync(managedDir, { recursive: true });
    const probeFile = path.join(managedDir, `.lobster-write-test-${process.pid}-${Date.now()}`);
    fs.writeFileSync(probeFile, '');
    fs.rmSync(probeFile, { force: true });
    return true;
  } catch {
    return false;
  }
}

function getManagedOpenClawBaseDir(config: Record<string, unknown>): string {
  if (os.platform() === 'win32') {
    return getFallbackOpenClawBaseDir();
  }

  // 离线包模式：使用 openclawPath（openclaw 子目录）
  // 传统模式：使用 installPath（直接是 openclaw 项目目录）
  const projectPath = config.useBundledNode && config.openclawPath
    ? normalizePath(String(config.openclawPath))
    : normalizePath(String(config.installPath || '').trim());

  if (projectPath && isOpenClawProjectDir(projectPath) && canUseProjectManagedStorage(projectPath)) {
    return path.join(projectPath, '.claude');
  }
  return getFallbackOpenClawBaseDir();
}

/**
 * 获取 OpenClaw 配置文件路径（根据安装路径决定）
 */
export function getManagedOpenClawConfigPath(config: Record<string, unknown>): string {
  return path.join(getManagedOpenClawBaseDir(config), 'openclaw.json');
}

/**
 * 获取 OpenClaw 状态目录
 */
export function getManagedOpenClawStateDir(config: Record<string, unknown>): string {
  return path.join(getManagedOpenClawBaseDir(config), 'state');
}

/**
 * 获取 OpenClaw Skills 目录
 */
export function getManagedOpenClawSkillsDir(config: Record<string, unknown>): string {
  return path.join(getManagedOpenClawStateDir(config), 'skills');
}

/**
 * 读取 OpenClaw 配置文件
 */
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

/**
 * 读取 OpenClaw 运行时配置
 */
export function readOpenClawRuntimeConfig(config?: Record<string, unknown>): Record<string, unknown> {
  if (config) {
    return readManagedOpenClawConfig(config).config;
  }
  return readJsonFile(getOpenClawConfigPath()) || {};
}

/**
 * 写入 OpenClaw 配置文件
 */
export function writeManagedOpenClawConfig(config: Record<string, unknown>, nextConfig: Record<string, unknown>): string {
  const fs = require('fs') as typeof import('fs');
  const configPath = getManagedOpenClawConfigPath(config);
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2));
  return configPath;
}

/**
 * 合并 OpenClaw 配置段落
 */
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

/**
 * 解析 OpenClaw 工作空间目录
 */
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
