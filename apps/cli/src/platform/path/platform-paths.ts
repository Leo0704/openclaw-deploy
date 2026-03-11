/**
 * 路径处理工具
 */

import * as fs from 'fs';
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

function hasUnsafePathChars(projectPath: string): boolean {
  const invalidInstallPathPattern = os.platform() === 'win32'
    ? /[;&|`$(){}[\]<>!]/
    : /[;&|`$(){}[\]<>!\\]/;
  return invalidInstallPathPattern.test(projectPath);
}

function getSuspiciousPathError(projectPath: string): string | undefined {
  if (os.platform() !== 'win32') {
    return undefined;
  }

  const normalized = projectPath.replace(/\//g, '\\').toLowerCase();
  const suspiciousPatterns: Array<{ pattern: RegExp; error: string }> = [
    {
      pattern: /\\xwechat_files\\/,
      error: '安装路径不能位于微信聊天附件目录，请改用独立目录，例如 C:\\Users\\<用户名>\\openclaw',
    },
    {
      pattern: /\\wechat files\\/,
      error: '安装路径不能位于微信聊天附件目录，请改用独立目录，例如 C:\\Users\\<用户名>\\openclaw',
    },
    {
      pattern: /\\msg\\file\\/,
      error: '安装路径不能位于聊天附件缓存目录，请改用独立目录，例如 C:\\Users\\<用户名>\\openclaw',
    },
  ];

  for (const entry of suspiciousPatterns) {
    if (entry.pattern.test(normalized)) {
      return entry.error;
    }
  }

  return undefined;
}

function probePathWritable(projectPath: string): { valid: boolean; error?: string } {
  try {
    const probeRoot = fs.existsSync(projectPath) ? projectPath : path.dirname(projectPath);
    if (!probeRoot) {
      return { valid: false, error: '安装路径无效，请重新选择一个目录' };
    }

    fs.mkdirSync(probeRoot, { recursive: true });
    const probeDir = fs.mkdtempSync(path.join(probeRoot, '.lobster-write-test-'));
    fs.rmSync(probeDir, { recursive: true, force: true });
    return { valid: true };
  } catch {
    return {
      valid: false,
      error: '安装路径不可写，请不要选择微信附件目录、系统目录或只读目录',
    };
  }
}

export function validateInstallPathForUse(
  projectPath: string,
  options: { requireProject?: boolean; probeWritable?: boolean } = {}
): { valid: boolean; normalizedPath: string; error?: string } {
  const normalizedPath = normalizeProjectPath(projectPath);
  if (!normalizedPath) {
    return { valid: false, normalizedPath, error: '请选择安装目录' };
  }

  if (hasUnsafePathChars(normalizedPath)) {
    return { valid: false, normalizedPath, error: '安装路径包含非法字符，请使用普通目录路径' };
  }

  const baseValidation = validatePath(normalizedPath);
  if (!baseValidation.valid) {
    return { valid: false, normalizedPath, error: baseValidation.error || '安装路径无效' };
  }

  const suspiciousPathError = getSuspiciousPathError(normalizedPath);
  if (suspiciousPathError) {
    return { valid: false, normalizedPath, error: suspiciousPathError };
  }

  if (fs.existsSync(normalizedPath)) {
    try {
      if (!fs.statSync(normalizedPath).isDirectory()) {
        return { valid: false, normalizedPath, error: '安装路径指向一个文件，请改成目录路径' };
      }
    } catch {
      return { valid: false, normalizedPath, error: '安装路径无法访问，请检查路径是否正确' };
    }
  }

  if (options.requireProject && !isOpenClawProjectDir(normalizedPath)) {
    return { valid: false, normalizedPath, error: '请先部署到一个有效的 OpenClaw 目录' };
  }

  if (options.probeWritable) {
    const writableValidation = probePathWritable(normalizedPath);
    if (!writableValidation.valid) {
      return { valid: false, normalizedPath, error: writableValidation.error };
    }
  }

  return { valid: true, normalizedPath };
}

/**
 * 读取 JSON 文件
 */
export function readJsonFile(filePath: string): Record<string, unknown> | null {
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
