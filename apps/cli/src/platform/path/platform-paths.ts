/**
 * 路径处理工具
 */

import * as os from 'os';
import * as path from 'path';
import { getPlatformAdapter } from '../index';

/**
 * 获取默认安装路径
 */
export function getDefaultInstallPath(): string {
  const adapter = getPlatformAdapter();
  return adapter.getDefaultInstallPath();
}

/**
 * Windows 路径紧凑比较（忽略大小写和斜杠）
 */
function compactWindowsPath(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[\\/]/g, '')
    .toLowerCase();
}

/**
 * 路径归一化
 *
 * Windows 特殊处理：
 * - 如果路径与默认安装路径匹配（忽略大小写和斜杠），返回默认路径
 * - 否则使用 path.win32.normalize
 */
export function normalizePath(projectPath: string): string {
  const adapter = getPlatformAdapter();

  // 使用适配器的归一化方法
  const normalized = adapter.normalizeProjectPath(projectPath);

  // Windows 特定逻辑：如果路径匹配默认路径，返回标准格式
  if (adapter.id === 'windows' && normalized) {
    const defaultInstallPath = getDefaultInstallPath();
    if (compactWindowsPath(normalized) === compactWindowsPath(defaultInstallPath)) {
      return defaultInstallPath;
    }
  }

  return normalized;
}

/**
 * 路径归一化（原始实现，不依赖平台适配器）
 *
 * Windows 特殊处理：
 * - 如果路径与默认安装路径匹配（忽略大小写和斜杠），返回默认路径
 * - 否则使用 path.win32.normalize
 */
export function normalizeProjectPath(projectPath: string): string {
  const rawPath = String(projectPath || '').trim();
  if (!rawPath || os.platform() !== 'win32') {
    return rawPath;
  }

  const defaultInstallPath = path.win32.join(os.homedir(), 'openclaw');
  if (compactWindowsPath(rawPath) === compactWindowsPath(defaultInstallPath)) {
    return defaultInstallPath;
  }

  return path.win32.normalize(rawPath);
}

/**
 * 验证安装路径
 */
export function validatePath(projectPath: string): { valid: boolean; error?: string } {
  const adapter = getPlatformAdapter();
  return adapter.validateInstallPath(projectPath);
}

/**
 * 读取 JSON 文件
 */
export function readJsonFile(filePath: string): Record<string, unknown> | null {
  const fs = require('fs') as typeof import('fs');
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 验证路径是否为 OpenClaw 项目目录
 */
export function isOpenClawProject(projectPath: string): boolean {
  const fs = require('fs') as typeof import('fs');
  const pathModule = require('path') as typeof import('path');

  projectPath = normalizePath(projectPath);

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

  const packageJsonPath = pathModule.join(projectPath, 'package.json');
  const packageJson = readJsonFile(packageJsonPath);
  const packageName = String(packageJson?.name || '').trim();
  return packageName === 'openclaw';
}

/**
 * 验证路径是否为 OpenClaw 项目目录（使用 normalizeProjectPath）
 */
export function isOpenClawProjectDir(projectPath: string): boolean {
  const fs = require('fs') as typeof import('fs');

  projectPath = normalizeProjectPath(projectPath);

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
