/**
 * 系统检查工具
 * 提供磁盘空间、端口、Node版本等系统检查功能
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { createError, ErrorType, Errors } = require('./error-utils');

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
          path.join(process.env['AppData'] || '', 'npm'),
        ].filter(Boolean)
      : [];

  return Array.from(new Set([...preferred, ...entries]));
}

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
  passed: boolean;
  checks: HealthCheckResult[];
  errors: string[];
  warnings: string[];
}

type ExistingInstallState =
  | { kind: 'missing' }
  | { kind: 'file' }
  | { kind: 'empty-dir' }
  | { kind: 'openclaw-project'; packageManager: 'pnpm' | 'npm' }
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
        return { kind: 'openclaw-project', packageManager: inferredPackageManager };
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
 * 检查所有依赖
 */
export function checkDependencies(): DependencyResult {
  const nodeCheck = checkNodeVersion(OPENCLAW_MIN_NODE_VERSION);

  return {
    git: checkCommand('git'),
    npm: checkCommand('npm'),
    pnpm: checkCommand('pnpm'),
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

  // 2. Git 检查
  const gitAvailable = checkCommand('git');
  checks.push({
    name: 'Git',
    passed: gitAvailable,
    message: gitAvailable ? 'Git 已安装' : '未找到 Git，部署时将尝试自动安装',
    severity: gitAvailable ? 'info' : 'warning',
    details: { version: getCommandVersion('git') },
  });
  if (!gitAvailable) {
    warnings.push('未找到 Git，部署时会尝试自动安装');
  }

  // 3. npm/pnpm 检查
  const npmAvailable = checkCommand('npm');
  const pnpmAvailable = checkCommand('pnpm');
  const requiresPnpm = installState.kind === 'openclaw-project' ? installState.packageManager === 'pnpm' : true;
  checks.push({
    name: '包管理器',
    passed: requiresPnpm ? pnpmAvailable : npmAvailable,
    message: requiresPnpm
      ? pnpmAvailable
        ? installState.kind === 'openclaw-project'
          ? '检测到当前 OpenClaw 目录要求 pnpm，pnpm 已安装'
          : 'OpenClaw 部署要求 pnpm，pnpm 已安装'
        : installState.kind === 'openclaw-project'
          ? '检测到当前 OpenClaw 目录要求 pnpm，但未找到 pnpm'
          : 'OpenClaw 部署要求 pnpm，但未找到 pnpm'
      : npmAvailable
        ? pnpmAvailable
          ? 'pnpm 已安装 (推荐)'
          : 'npm 已安装'
        : '未找到 npm',
    severity: 'critical',
  });
  if (requiresPnpm && !pnpmAvailable) {
    warnings.push('当前 OpenClaw 目录要求 pnpm，部署时会尝试自动安装 pnpm');
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
  const portCheck = await checkPortAvailability(config.gatewayPort);
  checks.push({
    name: '端口检查',
    passed: portCheck.available,
    message: portCheck.message || '',
    severity: portCheck.available ? 'info' : 'critical',
    details: { port: config.gatewayPort, inUseBy: portCheck.inUseBy },
  });
  if (!portCheck.available) {
    errors.push(portCheck.message || `端口 ${config.gatewayPort} 不可用`);
  }

  // 6. 安装路径检查
  switch (installState.kind) {
    case 'missing':
      checks.push({
        name: '安装路径',
        passed: true,
        message: '目录不存在，将创建新目录',
        severity: 'info',
      });
      break;
    case 'empty-dir':
      checks.push({
        name: '安装路径',
        passed: true,
        message: '目录为空，将在该目录中部署 OpenClaw',
        severity: 'info',
      });
      break;
    case 'openclaw-project':
      checks.push({
        name: '安装路径',
        passed: true,
        message: `检测到现有 OpenClaw 目录，将执行更新 (${installState.packageManager})`,
        severity: 'warning',
      });
      warnings.push(`目录 ${config.installPath} 已存在，将尝试更新现有 OpenClaw`);
      break;
    case 'file':
      checks.push({
        name: '安装路径',
        passed: false,
        message: '安装路径指向一个文件，而不是目录',
        severity: 'critical',
      });
      errors.push(`安装路径 ${config.installPath} 指向文件，请改成目录路径`);
      break;
    case 'non-openclaw-dir':
      checks.push({
        name: '安装路径',
        passed: false,
        message: '目录已存在，但不是 OpenClaw 项目目录',
        severity: 'critical',
      });
      errors.push(`安装路径 ${config.installPath} 已存在且不是 OpenClaw 项目，请换一个空目录或正确的 OpenClaw 目录`);
      break;
  }

  // 7. 网络连接检查 (非阻塞)
  try {
    const { checkNetworkConnectivity } = require('./network-utils');
    const results = await checkNetworkConnectivity();
    const reachableCount = results.filter((item: { connected: boolean }) => item.connected).length;
    const totalCount = results.length;
    const hasNetwork = reachableCount > 0;
    const networkMessage = !totalCount
      ? '未返回网络探测结果'
      : reachableCount === totalCount
        ? `网络连接正常 (${reachableCount}/${totalCount} 个探测源可访问)`
        : hasNetwork
          ? `部分网络探测可访问 (${reachableCount}/${totalCount})，部署时仍可能重试镜像源`
          : '网络连接异常';
    checks.push({
      name: '网络连接',
      passed: hasNetwork,
      message: networkMessage,
      severity: !hasNetwork ? 'warning' : reachableCount === totalCount ? 'info' : 'warning',
      details: { reachableCount, totalCount, results },
    });
    if (!hasNetwork) {
      warnings.push('网络连接异常，部署可能失败');
    } else if (reachableCount !== totalCount) {
      warnings.push('只有部分网络探测源可访问，部署时可能需要切换镜像源');
    }
  } catch {
    checks.push({
      name: '网络连接',
      passed: true,
      message: '跳过网络检查',
      severity: 'info',
    });
  }

  return {
    passed: errors.length === 0,
    checks,
    errors,
    warnings,
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
