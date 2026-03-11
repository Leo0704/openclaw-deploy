/**
 * 系统检查工具
 * 提供磁盘空间、端口、Node版本等系统检查功能
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { createError, ErrorType, Errors } = require('../../shared/errors/error-utils');

export const OPENCLAW_MIN_NODE_VERSION = '22.12.0';

function getPreferredPathEntries(): string[] {
  const currentPath = String(process.env.PATH || '');
  const entries = currentPath.split(path.delimiter).filter(Boolean);
  const preferred = os.platform() === 'darwin'
    ? [
        '/opt/homebrew/bin',
        '/opt/homebrew/sbin',
        '/usr/local/bin',
        '/usr/local/sbin',
        '/opt/local/bin',
        '/opt/local/sbin',
      ]
    : os.platform() === 'win32'
      ? [
          path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'nodejs'),
          // npm global packages path - try multiple common locations
          process.env['AppData'] ? path.join(process.env['AppData'], 'npm') : null,
          process.env['APPDATA'] ? path.join(process.env['APPDATA'], 'npm') : null,
          path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
          path.join(os.homedir(), 'AppData', 'Local', 'npm'),
        ].filter((p): p is string => Boolean(p))
      : [];

  return Array.from(new Set([...preferred, ...entries]));
}

/**
 * 获取用于命令查找的环境变量
 *
 * 注意：此函数返回 process.env 的浅拷贝，并覆盖 PATH。
 * - 基本类型值（字符串）是独立的，修改不会影响原始 process.env
 * - 但如果后续添加对象类型属性到返回值，这些对象仍然是共享引用
 * - 对于典型用法（只读取，不修改），无需担心污染问题
 */
export function getCommandLookupEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: getPreferredPathEntries().join(path.delimiter),
  };
}

function resolveCommandPath(cmd: string): string | null {
  try {
    const env = getCommandLookupEnv();
    const lookup = os.platform() === 'win32' ? 'where' : 'which';
    const output = execSync(`${lookup} ${cmd}`, {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
      env,
    }).trim();
    const first = output.split(/\r?\n/).find(Boolean);
    return first || null;
  } catch {
    return null;
  }
}

// ============================================
// 类型定义
// ============================================

export interface DiskSpaceResult {
  available: boolean;
  checked: boolean;
  freeBytes: number;
  requiredBytes: number;
  path: string;
  message?: string;
}

export interface PortResult {
  available: boolean;
  port: number;
  inUseBy?: string;
  message?: string;
}

export interface NodeVersionResult {
  valid: boolean;
  current: string;
  required: string;
  message?: string;
}

export interface DependencyResult {
  git: boolean;
  npm: boolean;
  pnpm: boolean;
  node: { valid: boolean; version: string };
}

export interface HealthCheckResult {
  name: string;
  passed: boolean;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  details?: Record<string, unknown>;
}

export interface PreDeployCheckResult {
  success: boolean;
  passed: boolean;
  checks: HealthCheckResult[];
  errors: string[];
  warnings: string[];
  availablePort?: number;
}

type ExistingInstallState =
  | { kind: 'missing' }
  | { kind: 'file' }
  | { kind: 'empty-dir' }
  | { kind: 'openclaw-project'; packageManager: 'pnpm' | 'npm'; hasGitDir: boolean }
  | { kind: 'non-openclaw-dir' };

function buildUnknownDiskSpaceResult(requiredBytes: number, checkPath: string, reason: string): DiskSpaceResult {
  return {
    available: false,
    checked: false,
    freeBytes: 0,
    requiredBytes,
    path: checkPath,
    message: reason,
  };
}

// ============================================
// 磁盘空间检查
// ============================================

/**
 * 检查磁盘空间
 * @param requiredBytes 需要的字节数
 * @param checkPath 检查的路径
 */
export function checkDiskSpace(requiredBytes: number, checkPath: string): DiskSpaceResult {
  try {
    // 确保路径存在
    const targetPath = fs.existsSync(checkPath) ? checkPath : path.dirname(checkPath);

    // 获取磁盘空间信息
    let freeBytes: number;

    if (os.platform() === 'win32') {
      const driveLetter = path.resolve(targetPath).charAt(0).toUpperCase();
      try {
        const output = execSync(`wmic logicaldisk where "DeviceID='${driveLetter}:'" get FreeSpace /value`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const match = output.match(/FreeSpace=(\d+)/);
        freeBytes = match ? parseInt(match[1], 10) : Number.NaN;
      } catch {
        const output = execSync(
          `powershell -NoProfile -Command "(Get-CimInstance Win32_LogicalDisk -Filter \\"DeviceID='${driveLetter}:'\\").FreeSpace"`,
          {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          }
        );
        freeBytes = parseInt(output.trim(), 10);
      }

      if (!Number.isFinite(freeBytes) || freeBytes < 0) {
        return buildUnknownDiskSpaceResult(requiredBytes, checkPath, '无法检查磁盘空间（Windows 存储查询失败）');
      }
    } else {
      const output = execSync(`df -k "${targetPath}" | tail -1`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const parts = output.trim().split(/\s+/);
      const freeKB = parseInt(parts[3], 10);
      if (!Number.isFinite(freeKB) || freeKB < 0) {
        return buildUnknownDiskSpaceResult(requiredBytes, checkPath, '无法检查磁盘空间（df 输出无效）');
      }
      freeBytes = freeKB * 1024;
    }

    const available = freeBytes >= requiredBytes;

    return {
      available,
      checked: true,
      freeBytes,
      requiredBytes,
      path: checkPath,
      message: available
        ? `磁盘空间充足 (可用: ${formatBytes(freeBytes)})`
        : `磁盘空间不足 (需要: ${formatBytes(requiredBytes)}, 可用: ${formatBytes(freeBytes)})`,
    };
  } catch (error) {
    return buildUnknownDiskSpaceResult(
      requiredBytes,
      checkPath,
      `无法检查磁盘空间: ${error instanceof Error ? error.message : '未知错误'}`
    );
  }
}

/**
 * 格式化字节数
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function detectExistingInstallState(installPath: string): ExistingInstallState {
  if (!fs.existsSync(installPath)) {
    return { kind: 'missing' };
  }

  const stat = fs.statSync(installPath);
  if (!stat.isDirectory()) {
    return { kind: 'file' };
  }

  const packageJsonPath = path.join(installPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const packageName = String(packageJson?.name || '').trim();
      const packageManager = String(packageJson?.packageManager || '').split('@')[0].trim();
      const inferredPackageManager: 'pnpm' | 'npm' =
        packageManager === 'pnpm' || fs.existsSync(path.join(installPath, 'pnpm-lock.yaml')) ? 'pnpm' : 'npm';
      if (packageName === 'openclaw') {
        const hasGitDir = fs.existsSync(path.join(installPath, '.git'));
        return { kind: 'openclaw-project', packageManager: inferredPackageManager, hasGitDir };
      }
    } catch {
      // fall through to generic directory handling
    }
  }

  const entries = fs.readdirSync(installPath);
  if (entries.length === 0) {
    return { kind: 'empty-dir' };
  }

  return { kind: 'non-openclaw-dir' };
}

// ============================================
// 端口检查
// ============================================

/**
 * 检查端口是否可用
 */
export async function checkPortAvailability(port: number): Promise<PortResult> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // 端口被占用，尝试找出占用进程
        let inUseBy = '未知进程';
        try {
          if (os.platform() === 'win32') {
            const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8' });
            const match = output.match(/(\d+)$/m);
            if (match) {
              const pid = match[1];
              const processOutput = execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf-8' });
              inUseBy = processOutput.trim().split(/\s+/)[0] || `PID ${pid}`;
            }
          } else {
            const output = execSync(`lsof -i :${port} -t`, { encoding: 'utf-8' }).trim();
            if (output) {
              const pid = output.split('\n')[0];
              const processOutput = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf-8' }).trim();
              inUseBy = processOutput || `PID ${pid}`;
            }
          }
        } catch {
          // 忽略错误
        }

        server.close();
        resolve({
          available: false,
          port,
          inUseBy,
          message: `端口 ${port} 已被 ${inUseBy} 占用`,
        });
      } else {
        server.close();
        resolve({
          available: false,
          port,
          message: `无法检查端口: ${err.message}`,
        });
      }
    });

    server.once('listening', () => {
      server.close();
      resolve({
        available: true,
        port,
        message: `端口 ${port} 可用`,
      });
    });

    server.listen(port);
  });
}

/**
 * 找一个可用的端口
 */
export async function findAvailablePort(startPort: number, maxAttempts: number = 100): Promise<number | null> {
  for (let port = startPort; port < startPort + maxAttempts; port++) {
    const result = await checkPortAvailability(port);
    if (result.available) {
      return port;
    }
  }
  return null;
}

// ============================================
// Node.js 版本检查
// ============================================

/**
 * 检查 Node.js 版本
 */
export function checkNodeVersion(minVersion: string = OPENCLAW_MIN_NODE_VERSION): NodeVersionResult {
  const nodePath = resolveCommandPath('node');
  const current = (() => {
    if (nodePath) {
      try {
        const output = execSync(`"${nodePath}" --version`, {
          stdio: ['pipe', 'pipe', 'pipe'],
          encoding: 'utf-8',
          env: getCommandLookupEnv(),
        }).trim();
        return output.replace(/^v/, '');
      } catch {
        // fall through
      }
    }
    return process.versions.node;
  })();

  const parseVersion = (v: string): number[] => {
    return v.split('.').map((part) => parseInt(part, 10));
  };

  const currentParts = parseVersion(current);
  const requiredParts = parseVersion(minVersion);

  let valid = true;
  for (let i = 0; i < Math.max(currentParts.length, requiredParts.length); i++) {
    const currentPart = currentParts[i] || 0;
    const requiredPart = requiredParts[i] || 0;

    if (currentPart > requiredPart) break;
    if (currentPart < requiredPart) {
      valid = false;
      break;
    }
  }

  return {
    valid,
    current,
    required: minVersion,
    message: valid
      ? `Node.js 版本符合要求 (当前: v${current})`
      : `Node.js 版本过低 (当前: v${current}, 需要: v${minVersion})`,
  };
}

// ============================================
// 依赖检查
// ============================================

/**
 * 检查命令是否存在
 */
function checkCommand(cmd: string): boolean {
  return !!resolveCommandPath(cmd);
}

/**
 * 获取命令版本
 */
function getCommandVersion(cmd: string): string | null {
  const commandPath = resolveCommandPath(cmd);
  if (!commandPath) {
    return null;
  }
  try {
    const output = execSync(`"${commandPath}" --version`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: getCommandLookupEnv(),
    }).trim();
    return output.split('\n')[0];
  } catch {
    return null;
  }
}

/**
 * 获取 npm 全局安装路径
 */
function getNpmGlobalPrefix(): string | null {
  try {
    const env = getCommandLookupEnv();
    const output = execSync('npm config get prefix', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    }).trim();
    return output || null;
  } catch {
    return null;
  }
}

/**
 * 检查 pnpm 是否可用 (Windows 上更健壮的检测)
 */
export function checkPnpmAvailable(): boolean {
  // 首先尝试常规检查
  if (checkCommand('pnpm')) {
    return true;
  }

  // Windows 上尝试查找 pnpm 可执行文件
  if (os.platform() === 'win32') {
    const prefix = getNpmGlobalPrefix();
    if (prefix) {
      const possiblePaths = [
        path.join(prefix, 'pnpm.cmd'),
        path.join(prefix, 'pnpm.exe'),
        path.join(prefix, 'pnpm'),
        path.join(prefix, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
      ];
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          return true;
        }
      }
    }

    // 尝试常见的 npm 全局路径
    const commonPaths = [
      path.join(process.env['AppData'] || '', 'npm', 'pnpm.cmd'),
      path.join(process.env['APPDATA'] || '', 'npm', 'pnpm.cmd'),
      path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'pnpm.cmd'),
      path.join(os.homedir(), 'AppData', 'Local', 'npm', 'pnpm.cmd'),
    ];
    for (const p of commonPaths) {
      if (p && fs.existsSync(p)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 检查所有依赖
 */
export function checkDependencies(): DependencyResult {
  const nodeCheck = checkNodeVersion(OPENCLAW_MIN_NODE_VERSION);

  return {
    git: checkCommand('git'),
    npm: checkCommand('npm'),
    pnpm: checkPnpmAvailable(),
    node: {
      valid: nodeCheck.valid,
      version: nodeCheck.current,
    },
  };
}

// ============================================
// 综合健康检查
// ============================================

/**
 * 执行部署前健康检查
 */
export async function performHealthChecks(config: {
  installPath: string;
  gatewayPort: number;
  requiredDiskSpace?: number;
}): Promise<PreDeployCheckResult> {
  const checks: HealthCheckResult[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const installState = detectExistingInstallState(config.installPath);

  // 1. Node.js 版本检查
  const nodeCheck = checkNodeVersion(OPENCLAW_MIN_NODE_VERSION);
  checks.push({
    name: 'Node.js 版本',
    passed: nodeCheck.valid,
    message: nodeCheck.message || '',
    severity: 'critical',
    details: { current: nodeCheck.current, required: nodeCheck.required },
  });
  if (!nodeCheck.valid) {
    errors.push(`Node.js 版本过低，请升级到 v${nodeCheck.required} 或更高版本`);
  }

  // 2. Git 检查（仅更新功能需要）
  const gitAvailable = checkCommand('git');
  checks.push({
    name: 'Git',
    passed: gitAvailable,
    message: gitAvailable ? 'Git 已安装' : '未找到 Git，在线更新功能将不可用',
    severity: gitAvailable ? 'info' : 'warning',
    details: { version: getCommandVersion('git') },
  });
  if (!gitAvailable) {
    warnings.push('未找到 Git，在线更新功能将不可用');
  }

  // 3. npm/pnpm 检查
  const npmAvailable = checkCommand('npm');
  const pnpmReady = checkPnpmAvailable();
  const requiresPnpm = installState.kind === 'openclaw-project' ? installState.packageManager === 'pnpm' : true;
  checks.push({
    name: '包管理器',
    passed: requiresPnpm ? pnpmReady : npmAvailable,
    message: requiresPnpm
      ? pnpmReady
        ? installState.kind === 'openclaw-project'
          ? '检测到当前 OpenClaw 目录要求 pnpm，pnpm 已安装'
          : 'OpenClaw 部署要求 pnpm，pnpm 已安装'
        : installState.kind === 'openclaw-project'
          ? '检测到当前 OpenClaw 目录要求 pnpm，但当前未发现已安装的 pnpm'
          : 'OpenClaw 部署要求 pnpm，但当前未发现已安装的 pnpm'
      : npmAvailable
        ? pnpmReady
          ? 'pnpm 已安装 (推荐)'
          : 'npm 已安装'
        : '未找到 npm',
    severity: 'critical',
  });
  if (requiresPnpm && !pnpmReady) {
    warnings.push('当前 OpenClaw 目录要求 pnpm，部署时会优先尝试 Corepack、npm exec 和镜像源自动获取 pnpm');
  } else if (!npmAvailable) {
    errors.push('未找到 npm，请先安装 Node.js: https://nodejs.org');
  }

  // 4. 磁盘空间检查
  const requiredSpace = config.requiredDiskSpace || 500 * 1024 * 1024; // 默认 500MB
  const diskCheck = checkDiskSpace(requiredSpace, config.installPath);
  checks.push({
    name: '磁盘空间',
    passed: diskCheck.checked ? diskCheck.available : false,
    message: diskCheck.message || '',
    severity: !diskCheck.checked ? 'warning' : diskCheck.available ? 'info' : 'critical',
    details: { freeBytes: diskCheck.freeBytes, requiredBytes: diskCheck.requiredBytes, checked: diskCheck.checked },
  });
  if (!diskCheck.checked) {
    warnings.push(diskCheck.message || '无法检查磁盘空间');
  } else if (!diskCheck.available) {
    errors.push(diskCheck.message || '磁盘空间不足');
  }

  // 5. 端口检查
  let portCheck = await checkPortAvailability(config.gatewayPort);
  let availablePort = config.gatewayPort;

  // 如果默认端口不可用，自动查找可用端口（只尝试 10 个，避免性能问题）
  if (!portCheck.available) {
    const newPort = await findAvailablePort(config.gatewayPort + 1, 10);
    if (newPort) {
      availablePort = newPort;
      portCheck = {
        available: true,
        port: newPort,
        message: `默认端口 ${config.gatewayPort} 被占用，已自动切换到可用端口 ${newPort}`,
      };
    }
  }

  checks.push({
    name: '端口检查',
    passed: portCheck.available,
    message: portCheck.message || '',
    severity: portCheck.available ? 'info' : 'critical',
    details: { port: availablePort, originalPort: config.gatewayPort, inUseBy: portCheck.inUseBy },
  });
  if (!portCheck.available) {
    errors.push(portCheck.message || `端口 ${config.gatewayPort} 不可用`);
  }

  // 安装路径检查已移除 - 部署时会做真正的检查

  // 7. 网络连接检查已移除 - 部署时会根据实际网络状况自动选择直连或镜像源

  return {
    success: true,
    passed: errors.length === 0,
    checks,
    errors,
    warnings,
    availablePort,
  };
}

// ============================================
// 导出便捷函数
// ============================================

export const system = {
  checkDisk: checkDiskSpace,
  checkPort: checkPortAvailability,
  findPort: findAvailablePort,
  checkNode: checkNodeVersion,
  checkDeps: checkDependencies,
  healthCheck: performHealthChecks,
};
