/**
 * 可执行文件解析（Windows 特有逻辑）
 */

import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { getPlatformAdapter } from '../index';
import { getCommandLookupEnv } from '../../core/diagnostics/system-check';
import { checkCommand as checkCommandBase } from '../../shared/process/process-utils';

/**
 * 检查命令是否可用
 * 复用 shared/process/process-utils 中的实现，避免代码重复
 */
export function checkCommand(cmd: string): boolean {
  return checkCommandBase(cmd);
}

/**
 * 在 Windows 上解析可执行文件的完整路径
 * 处理 .cmd/.bat 等脚本扩展名
 *
 * Windows 优先级：.exe > .cmd > .bat > 其他
 * 避免使用无扩展名的 unix 脚本
 */
export function resolveExecutable(name: string): string {
  const adapter = getPlatformAdapter();

  // 非 Windows 或已有扩展名，直接返回
  if (adapter.id !== 'windows' || /\.[A-Za-z0-9]+$/.test(name) || path.isAbsolute(name)) {
    return name;
  }

  try {
    const env = getCommandLookupEnv();
    const result = execFileSync('where', [name], { stdio: 'pipe', encoding: 'utf-8', env });

    const matches = result
      .split(/\r?\n/)
      .map((line: string) => line.trim())
      .filter(Boolean);

    // Windows 优先级：.exe > .cmd > .bat > 其他
    const preferred = matches.find((m: string) => /\.exe$/i.test(m))
      || matches.find((m: string) => /\.(cmd|bat)$/i.test(m))
      || matches[0];

    return preferred || name;
  } catch {
    return name;
  }
}

/**
 * 解析命令为 spawn 可用的 file 和 args
 */
export function parseCommandForSpawn(command: string): { file: string; args: string[] } {
  const tokens = command.match(/"[^"]*"|'[^']*'|\S+/g) || [];
  const normalized = tokens.map((token) => token.replace(/^['"]|['"]$/g, ''));
  return {
    file: normalized[0] || '',
    args: normalized.slice(1),
  };
}

/**
 * 解析可执行文件用于 spawn（Windows 特定）
 * 处理 .cmd/.bat 等脚本扩展名
 *
 * Windows 优先级：.exe > .cmd > .bat > 其他
 * 避免使用无扩展名的 unix 脚本
 */
export function resolveSpawnExecutable(file: string): string {
  if (!file || os.platform() !== 'win32' || /\.[A-Za-z0-9]+$/.test(file) || path.isAbsolute(file)) {
    return file;
  }

  try {
    const env = getCommandLookupEnv();
    const result = execFileSync('where', [file], { stdio: 'pipe', encoding: 'utf-8', env });

    const matches = result
      .split(/\r?\n/)
      .map((line: string) => line.trim())
      .filter(Boolean);

    // Windows 优先级：.exe > .cmd > .bat > 其他
    const preferred = matches.find((m: string) => /\.exe$/i.test(m))
      || matches.find((m: string) => /\.(cmd|bat)$/i.test(m))
      || matches[0];

    return preferred || file;
  } catch {
    return file;
  }
}
