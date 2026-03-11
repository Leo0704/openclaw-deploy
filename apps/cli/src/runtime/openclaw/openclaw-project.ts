/**
 * OpenClaw 项目工具
 *
 * 注：路径和存储相关函数已迁移到平台模块：
 * - normalizeProjectPath, isOpenClawProjectDir, readJsonFile -> @/platform/path/platform-paths
 * - getOpenClawConfigPath, getManagedOpenClawConfigPath, getManagedOpenClawStateDir, getManagedOpenClawSkillsDir -> @/platform/storage/storage-paths
 */

import * as fs from 'fs';
import * as path from 'path';
import { checkPnpmAvailable } from '../../core/diagnostics/system-check';
import { checkCommand } from '../../shared/process/process-utils';
import {
  normalizeProjectPath,
  readJsonFile,
  isOpenClawProjectDir,
} from '../../platform/path/platform-paths';
import {
  getOpenClawConfigPath,
  getManagedOpenClawConfigPath,
  getManagedOpenClawStateDir,
  getManagedOpenClawSkillsDir,
} from '../../platform/storage/storage-paths';

export function detectProjectPackageManager(projectPath: string): 'pnpm' | 'npm' {
  projectPath = normalizeProjectPath(projectPath);
  const packageJsonPath = path.join(projectPath, 'package.json');
  const packageJson = readJsonFile(packageJsonPath);
  const packageManager = String(packageJson?.packageManager || '').split('@')[0].trim();

  if (packageManager === 'pnpm' || fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }

  return 'npm';
}

type CommandInvocation = {
  file: string;
  args: string[];
};

function quoteShellArg(value: string): string {
  if (!value) return '""';
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) {
    return value;
  }
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

function formatShellCommand(file: string, args: string[]): string {
  return [file, ...args].map((part) => quoteShellArg(part)).join(' ');
}

export function getPnpmInvocation(): CommandInvocation {
  if (checkPnpmAvailable()) {
    return { file: 'pnpm', args: [] };
  }

  if (checkCommand('corepack')) {
    return { file: 'corepack', args: ['pnpm'] };
  }

  return { file: 'npm', args: ['exec', '--yes', 'pnpm', '--'] };
}


export function getInstallCommand(projectPath: string): { pm: 'pnpm' | 'npm'; command: string } {
  projectPath = normalizeProjectPath(projectPath);
  const pm = detectProjectPackageManager(projectPath);
  if (pm === 'pnpm') {
    const invocation = getPnpmInvocation();
    return { pm, command: formatShellCommand(invocation.file, [...invocation.args, 'install']) };
  }
  return { pm, command: 'npm install' };
}

export function getOpenClawStartCommand(projectPath: string, port: number): string {
  projectPath = normalizeProjectPath(projectPath);
  const pm = detectProjectPackageManager(projectPath);
  if (pm === 'pnpm') {
    const invocation = getPnpmInvocation();
    return formatShellCommand(invocation.file, [
      ...invocation.args,
      'openclaw',
      'gateway',
      'run',
      '--port',
      String(port),
      '--allow-unconfigured',
    ]);
  }
  return `npm run openclaw -- gateway run --port ${port} --allow-unconfigured`;
}

// 重新导出平台模块的函数，保持向后兼容
// 从平台模块导入更多函数
import {
  readManagedOpenClawConfig,
  readOpenClawRuntimeConfig,
  writeManagedOpenClawConfig,
  mergeOpenClawConfigSections,
  resolveOpenClawWorkspaceDir,
} from '../../platform/storage/storage-paths';

export {
  normalizeProjectPath,
  readJsonFile,
  isOpenClawProjectDir,
  getOpenClawConfigPath,
  getManagedOpenClawConfigPath,
  getManagedOpenClawStateDir,
  getManagedOpenClawSkillsDir,
  readManagedOpenClawConfig,
  readOpenClawRuntimeConfig,
  writeManagedOpenClawConfig,
  mergeOpenClawConfigSections,
  resolveOpenClawWorkspaceDir,
};
