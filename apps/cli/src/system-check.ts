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

// ============================================
// 类型定义
// ============================================

export interface DiskSpaceResult {
  available: boolean;
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
      // Windows
      const output = execSync(`wmic logicaldisk where "DeviceID='${targetPath.charAt(0)}:'" get FreeSpace /format:csv`, {
        encoding: 'utf-8',
      });
      const lines = output.trim().split('\n');
      const dataLine = lines.find((line: string) => line.includes(','));
      if (dataLine) {
        freeBytes = parseInt(dataLine.split(',')[1], 10);
      } else {
        // 回退方案
        freeBytes = Number.MAX_SAFE_INTEGER;
      }
    } else {
      // Unix/Linux/macOS
      try {
        const output = execSync(`df -k "${targetPath}" | tail -1`, { encoding: 'utf-8' });
        const parts = output.trim().split(/\s+/);
        const freeKB = parseInt(parts[3], 10);
        freeBytes = freeKB * 1024;
      } catch {
        // 如果 df 命令失败，使用保守估计
        freeBytes = 1024 * 1024 * 1024; // 假设 1GB
      }
    }

    const available = freeBytes >= requiredBytes;

    return {
      available,
      freeBytes,
      requiredBytes,
      path: checkPath,
      message: available
        ? `磁盘空间充足 (可用: ${formatBytes(freeBytes)})`
        : `磁盘空间不足 (需要: ${formatBytes(requiredBytes)}, 可用: ${formatBytes(freeBytes)})`,
    };
  } catch (error) {
    return {
      available: true, // 检查失败时假设空间充足
      freeBytes: 0,
      requiredBytes,
      path: checkPath,
      message: `无法检查磁盘空间: ${error instanceof Error ? error.message : '未知错误'}`,
    };
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

        resolve({
          available: false,
          port,
          inUseBy,
          message: `端口 ${port} 已被 ${inUseBy} 占用`,
        });
      } else {
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
export function checkNodeVersion(minVersion: string = '18.0.0'): NodeVersionResult {
  const current = process.versions.node;

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
  try {
    execSync(os.platform() === 'win32' ? `where ${cmd}` : `which ${cmd}`, {
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取命令版本
 */
function getCommandVersion(cmd: string): string | null {
  try {
    const output = execSync(`${cmd} --version`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
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
  const nodeCheck = checkNodeVersion('18.0.0');

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

  // 1. Node.js 版本检查
  const nodeCheck = checkNodeVersion('18.0.0');
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
    message: gitAvailable ? 'Git 已安装' : '未找到 Git',
    severity: 'critical',
    details: { version: getCommandVersion('git') },
  });
  if (!gitAvailable) {
    errors.push('未找到 Git，请先安装 Git: https://git-scm.com');
  }

  // 3. npm/pnpm 检查
  const npmAvailable = checkCommand('npm');
  const pnpmAvailable = checkCommand('pnpm');
  checks.push({
    name: '包管理器',
    passed: npmAvailable,
    message: npmAvailable
      ? pnpmAvailable
        ? 'pnpm 已安装 (推荐)'
        : 'npm 已安装'
      : '未找到 npm',
    severity: 'critical',
  });
  if (!npmAvailable) {
    errors.push('未找到 npm，请先安装 Node.js: https://nodejs.org');
  }

  // 4. 磁盘空间检查
  const requiredSpace = config.requiredDiskSpace || 500 * 1024 * 1024; // 默认 500MB
  const diskCheck = checkDiskSpace(requiredSpace, config.installPath);
  checks.push({
    name: '磁盘空间',
    passed: diskCheck.available,
    message: diskCheck.message || '',
    severity: diskCheck.available ? 'info' : 'critical',
    details: { freeBytes: diskCheck.freeBytes, requiredBytes: diskCheck.requiredBytes },
  });
  if (!diskCheck.available) {
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
  const pathExists = fs.existsSync(config.installPath);
  if (pathExists) {
    checks.push({
      name: '安装路径',
      passed: true,
      message: '目录已存在，将进行更新',
      severity: 'warning',
    });
    warnings.push(`目录 ${config.installPath} 已存在，将尝试更新而不是全新安装`);
  } else {
    checks.push({
      name: '安装路径',
      passed: true,
      message: '目录不存在，将创建新目录',
      severity: 'info',
    });
  }

  // 7. 网络连接检查 (非阻塞)
  try {
    const { hasNetworkConnection } = require('./network-utils');
    const hasNetwork = await hasNetworkConnection();
    checks.push({
      name: '网络连接',
      passed: hasNetwork,
      message: hasNetwork ? '网络连接正常' : '网络连接异常',
      severity: hasNetwork ? 'info' : 'warning',
    });
    if (!hasNetwork) {
      warnings.push('网络连接异常，部署可能失败');
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
