const { execSync, execFileSync, spawn } = require('child_process') as typeof import('child_process');
const os = require('os') as typeof import('os');
const path = require('path') as typeof import('path');

const {
  AppError,
  ErrorType,
  createError,
} = require('./error-utils') as typeof import('./error-utils');

const { getCommandLookupEnv } = require('./system-check') as typeof import('./system-check');

export interface RunCommandOptions {
  timeout?: number;
  retries?: number;
  ignoreError?: boolean;
  silent?: boolean;
}

export interface RunCommandResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  error?: typeof AppError.prototype;
}

export interface RunCommandArgsOptions extends RunCommandOptions {
  args?: string[];
  env?: NodeJS.ProcessEnv;
}

function normalizeExecOutput(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Buffer.isBuffer(value)) return value.toString('utf-8').trim();
  if (value == null) return '';
  return String(value).trim();
}

export function runCommand(
  cmd: string,
  cwd: string,
  options: RunCommandOptions = {}
): RunCommandResult {
  const { timeout = 300000, retries = 0, ignoreError = false, silent = false } = options;

  let lastError: typeof AppError.prototype | undefined;
  let attempt = 0;

  while (attempt <= retries) {
    attempt++;
    try {
      const result = execSync(cmd, {
        cwd,
        env: getCommandLookupEnv(),
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout,
      });
      return { success: true, stdout: result.trim() };
    } catch (e: unknown) {
      const error = e as { stderr?: unknown; stdout?: unknown; message?: string; status?: number };
      const stderr = normalizeExecOutput(error.stderr);
      const stdout = normalizeExecOutput(error.stdout);
      const errorMessage = stderr || stdout || error.message || '未知错误';

      lastError = createError(ErrorType.PROCESS, 'PROCESS_ERROR', {
        userMessage: `命令执行失败: ${errorMessage}`,
        context: { cmd, cwd, exitCode: error.status },
      });

      if (!silent) {
        console.error(`[命令错误] ${cmd}: ${errorMessage}`);
      }

      if (!errorMessage.includes('network') && !errorMessage.includes('timeout') && !errorMessage.includes('ETIMEDOUT')) {
        break;
      }

      if (attempt <= retries) {
        const delay = 1000 * attempt;
        console.log(`[重试] ${delay}ms 后进行第 ${attempt} 次重试...`);
        // Note: runCommand is synchronous; retries > 0 are not supported here.
        // Use runCommandStreaming for async retries with proper sleep.
        break;
      }
    }
  }

  if (ignoreError) {
    return { success: false, stderr: lastError?.userMessage, error: lastError };
  }

  return { success: false, stderr: lastError?.userMessage, error: lastError };
}

export function runCommandArgs(
  file: string,
  cwd: string,
  options: RunCommandArgsOptions = {}
): RunCommandResult {
  const { timeout = 300000, ignoreError = false, silent = false, args = [], env } = options;

  try {
    const result = execFileSync(file, args, {
      cwd,
      env: env || getCommandLookupEnv(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout,
    });
    return { success: true, stdout: result.trim() };
  } catch (e: unknown) {
    const error = e as { stderr?: unknown; stdout?: unknown; message?: string; status?: number };
    const stderr = normalizeExecOutput(error.stderr);
    const stdout = normalizeExecOutput(error.stdout);
    const errorMessage = stderr || stdout || error.message || '未知错误';
    const appError = createError(ErrorType.PROCESS, 'PROCESS_ERROR', {
      userMessage: `命令执行失败: ${errorMessage}`,
      context: { file, args, cwd, exitCode: error.status },
    });

    if (!silent) {
      console.error(`[命令错误] ${file} ${args.join(' ')}: ${errorMessage}`);
    }

    if (ignoreError) {
      return { success: false, stderr: appError.userMessage, error: appError };
    }

    return { success: false, stderr: appError.userMessage, error: appError };
  }
}

export async function runCommandStreaming(
  cmd: string,
  cwd: string,
  options: RunCommandOptions & { env?: NodeJS.ProcessEnv; onLog?: (level: 'info' | 'error', message: string) => void } = {}
): Promise<RunCommandResult> {
  const { timeout = 300000, env, onLog } = options;

  return new Promise((resolve) => {
    const child = spawn(cmd, {
      cwd,
      env: env || getCommandLookupEnv(),
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let stdoutBuffer = '';
    let stderrBuffer = '';

    const flushLines = (buffer: string, level: 'info' | 'error'): string => {
      const lines = buffer.split(/\r?\n/);
      const rest = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) onLog?.(level, trimmed);
      }
      return rest;
    };

    const finish = (result: RunCommandResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill();
      finish({
        success: false,
        stderr: stderr.trim() || stdout.trim() || `命令执行超时 (${timeout}ms)`,
        error: createError(ErrorType.PROCESS, 'PROCESS_TIMEOUT', {
          userMessage: `命令执行超时 (${timeout}ms)`,
          context: { cmd, cwd, timeout },
        }),
      });
    }, timeout);

    child.stdout?.on('data', (chunk: Buffer | string) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : chunk;
      stdout += text;
      stdoutBuffer += text;
      stdoutBuffer = flushLines(stdoutBuffer, 'info');
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : chunk;
      stderr += text;
      stderrBuffer += text;
      stderrBuffer = flushLines(stderrBuffer, 'error');
    });

    child.once('error', (error: Error) => {
      clearTimeout(timer);
      finish({
        success: false,
        stderr: error.message,
        error: createError(ErrorType.PROCESS, 'PROCESS_ERROR', {
          userMessage: `命令执行失败: ${error.message}`,
          context: { cmd, cwd },
        }),
      });
    });

    child.once('close', (code: number | null) => {
      clearTimeout(timer);
      const lastStdout = stdoutBuffer.trim();
      const lastStderr = stderrBuffer.trim();
      if (lastStdout) onLog?.('info', lastStdout);
      if (lastStderr) onLog?.('error', lastStderr);

      if (code === 0) {
        finish({ success: true, stdout: stdout.trim(), stderr: stderr.trim() });
        return;
      }

      const message = stderr.trim() || stdout.trim() || `命令执行失败 (code: ${code ?? 'unknown'})`;
      finish({
        success: false,
        stdout: stdout.trim(),
        stderr: message,
        error: createError(ErrorType.PROCESS, 'PROCESS_ERROR', {
          userMessage: `命令执行失败: ${message}`,
          context: { cmd, cwd, exitCode: code },
        }),
      });
    });
  });
}

export function runCommandSimple(cmd: string, cwd: string): string {
  const result = runCommand(cmd, cwd);
  if (!result.success && result.error) {
    throw new Error(result.stderr || result.error.userMessage);
  }
  return result.stdout || '';
}

export function checkCommand(cmd: string): boolean {
  try {
    const env = getCommandLookupEnv();
    if (os.platform() === 'win32') {
      execFileSync('where', [cmd], { stdio: 'pipe', env });
    } else {
      execFileSync('which', [cmd], { stdio: 'pipe', env });
    }
    return true;
  } catch {
    return false;
  }
}

export function parseCommandForSpawn(command: string): { file: string; args: string[] } {
  const tokens = command.match(/"[^"]*"|'[^']*'|\S+/g) || [];
  const normalized = tokens.map((token) => token.replace(/^['"]|['"]$/g, ''));
  return {
    file: normalized[0] || '',
    args: normalized.slice(1),
  };
}

export function resolveSpawnExecutable(file: string): string {
  if (!file || os.platform() !== 'win32' || /\.[A-Za-z0-9]+$/.test(file) || path.isAbsolute(file)) {
    return file;
  }

  const resolved = runCommandArgs('where', process.cwd(), {
    args: [file],
    ignoreError: true,
    silent: true,
  });

  if (!resolved.success || !resolved.stdout) {
    return file;
  }

  const firstMatch = resolved.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstMatch || file;
}
