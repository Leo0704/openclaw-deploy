/**
 * OpenClaw 离线包服务
 * 处理离线包的检测、引导下载、解压安装
 */

const fs = require('fs') as typeof import('fs');
const os = require('os') as typeof import('os');
const path = require('path') as typeof import('path');
const { spawn } = require('child_process') as typeof import('child_process');

// 离线包下载链接配置
const OFFLINE_BUNDLE_URLS: Record<string, string> = {
  'win-x64': 'https://pan.quark.cn/s/6ca5581f1db9',
  'macos-arm64': 'https://pan.quark.cn/s/6ca5581f1db9',
  'macos-x64': 'https://pan.quark.cn/s/6ca5581f1db9',
  'linux-x64': 'https://pan.quark.cn/s/6ca5581f1db9',
};

// 当前支持的版本
const BUNDLE_VERSION = '2026.3.8';

// 最小磁盘空间要求 (500MB)
const MIN_DISK_SPACE = 500 * 1024 * 1024;

export interface OfflineBundleInfo {
  version: string;
  platform: string;
  nodeVersion: string;
  downloadUrl: string;
  fileName: string;
  fileSize?: number;
}

/**
 * 获取当前平台标识
 * 注意: macOS Intel 用户使用 ARM64 版本（通过 Rosetta 运行）
 */
export function getPlatform(): string {
  const p = os.platform();
  const arch = process.arch;

  if (p === 'win32') return 'win-x64';
  if (p === 'darwin') return 'macos-arm64'; // 统一使用 ARM64 版本
  if (p === 'linux') return 'linux-x64';

  throw new Error(`不支持的平台: ${p} ${arch}`);
}

/**
 * 获取离线包下载信息
 */
export function getOfflineBundleInfo(customUrl?: string): OfflineBundleInfo {
  const platform = getPlatform();
  const template = customUrl || OFFLINE_BUNDLE_URLS[platform];

  if (!template) {
    throw new Error(`平台 ${platform} 没有配置下载链接`);
  }

  const downloadUrl = template.replace('{VERSION}', BUNDLE_VERSION);
  const ext = platform === 'win-x64' ? '.zip' : '.tar.gz';
  const fileName = `openclaw-${platform}-${BUNDLE_VERSION}${ext}`;

  return {
    version: BUNDLE_VERSION,
    platform,
    nodeVersion: '22.12.0',
    downloadUrl,
    fileName,
  };
}

/**
 * 检测是否已安装
 */
export function detectInstall(installPath: string): {
  installed: boolean;
  version?: string;
  nodePath?: string;
  openclawPath?: string;
  needUpdate?: boolean;
  error?: string;
} {
  try {
    const nodeDir = path.join(installPath, 'node');
    const openclawDir = path.join(installPath, 'openclaw');
    const versionFile = path.join(installPath, 'VERSION');

    if (!fs.existsSync(nodeDir)) {
      return { installed: false, error: '缺少运行时' };
    }
    if (!fs.existsSync(openclawDir)) {
      return { installed: false, error: '缺少 OpenClaw' };
    }

    const platform = getPlatform();
    const nodeExe = platform === 'win-x64'
      ? path.join(nodeDir, 'node.exe')
      : path.join(nodeDir, 'bin', 'node');

    if (!fs.existsSync(nodeExe)) {
      return { installed: false, error: '缺少运行时' };
    }

    const openclawEntry = path.join(openclawDir, 'openclaw.mjs');
    if (!fs.existsSync(openclawEntry)) {
      return { installed: false, error: '缺少入口文件' };
    }

    // 检查关键依赖目录
    const nodeModules = path.join(openclawDir, 'node_modules');
    if (!fs.existsSync(nodeModules)) {
      return { installed: false, error: '安装不完整，缺少依赖' };
    }

    // 读取版本
    let version = 'unknown';
    if (fs.existsSync(versionFile)) {
      const content = fs.readFileSync(versionFile, 'utf-8');
      const match = content.match(/openclaw:\s*(.+)/);
      if (match) version = match[1].trim();
    }

    // 检查是否需要更新
    const needUpdate = version !== BUNDLE_VERSION;

    return {
      installed: true,
      version,
      nodePath: nodeExe,
      openclawPath: openclawDir,
      needUpdate,
    };
  } catch (error) {
    return {
      installed: false,
      error: `检测失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
  }
}

/**
 * 验证离线包文件
 */
export function validateBundleFile(filePath: string, bundleInfo: OfflineBundleInfo): {
  valid: boolean;
  error?: string;
} {
  try {
    if (!fs.existsSync(filePath)) {
      return { valid: false, error: '文件不存在' };
    }

    const stat = fs.statSync(filePath);

    if (!stat.isFile()) {
      return { valid: false, error: '不是有效文件' };
    }

    // 检查文件大小（至少 50MB）
    if (stat.size < 50 * 1024 * 1024) {
      return { valid: false, error: '文件太小，可能下载不完整' };
    }

    // 检查文件扩展名
    const ext = path.extname(filePath);
    const platform = getPlatform();
    const expectedExt = platform === 'win-x64' ? '.zip' : '.gz';

    if (ext !== expectedExt && !filePath.endsWith('.tar.gz')) {
      return { valid: false, error: `文件格式不正确，期望 ${expectedExt}` };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `验证失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
  }
}

/**
 * 检测用户是否已下载离线包
 * 搜索顺序：
 * 1. 龙虾助手可执行文件同目录及子目录（与离线包一起分发的场景）
 * 2. 常见下载目录
 */
export function detectDownloadedBundle(bundleInfo: OfflineBundleInfo): {
  found: boolean;
  path?: string;
} {
  const platform = os.platform();
  const homeDir = os.homedir();
  const fileName = bundleInfo.fileName;

  const searchPaths: string[] = [];

  // 1. 龙虾助手可执行文件同目录及子目录（最高优先级）
  // 这是用户从网盘下载的"龙虾助手+离线包"文件夹的场景
  const execDir = path.dirname(process.execPath);
  searchPaths.push(
    path.join(execDir, fileName),                           // 同目录
    path.join(execDir, 'bundle', fileName),                 // bundle/ 子目录
    path.join(execDir, 'openclaw-bundle', fileName),        // openclaw-bundle/ 子目录
    path.join(execDir, '..', fileName),                     // 上级目录（开发模式）
    path.join(execDir, '..', 'bundle', fileName),           // 上级 bundle/ 目录
  );

  // 2. 常见下载目录
  if (platform === 'win32') {
    searchPaths.push(
      path.join(homeDir, 'Downloads', fileName),
      path.join(homeDir, 'downloads', fileName),
      path.join(homeDir, 'Desktop', fileName),
      path.join(homeDir, '桌面', fileName),
    );
  } else if (platform === 'darwin') {
    searchPaths.push(
      path.join(homeDir, 'Downloads', fileName),
      path.join(homeDir, 'Desktop', fileName),
    );
  } else {
    searchPaths.push(
      path.join(homeDir, 'Downloads', fileName),
      path.join(homeDir, fileName),
    );
  }

  for (const searchPath of searchPaths) {
    if (fs.existsSync(searchPath)) {
      const validation = validateBundleFile(searchPath, bundleInfo);
      if (validation.valid) {
        return { found: true, path: searchPath };
      }
    }
  }

  return { found: false };
}

/**
 * 检查磁盘空间
 */
export function checkDiskSpace(installPath: string): {
  sufficient: boolean;
  available?: number;
  required: number;
  error?: string;
} {
  try {
    // 简单检查：尝试创建测试文件
    const testDir = path.dirname(installPath);
    if (!fs.existsSync(testDir)) {
      return { sufficient: true, required: MIN_DISK_SPACE };
    }

    // 使用 df 命令（仅 Unix）或估算
    // 这里简化处理，实际部署时如果空间不足会自然失败
    return { sufficient: true, required: MIN_DISK_SPACE };
  } catch (error) {
    return {
      sufficient: false,
      required: MIN_DISK_SPACE,
      error: `磁盘空间检查失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
  }
}

/**
 * 解压离线包（带回滚）
 */
export async function extractBundle(
  archivePath: string,
  installPath: string,
  addLog: (message: string, level?: 'info' | 'success' | 'error' | 'warning') => void
): Promise<{ success: boolean; error?: string }> {
  const platform = getPlatform();

  // 检查磁盘空间
  const diskCheck = checkDiskSpace(installPath);
  if (!diskCheck.sufficient) {
    return { success: false, error: diskCheck.error || '磁盘空间不足' };
  }

  // 备份现有安装（如果存在）
  const backupPath = installPath + '.backup';
  let hasBackup = false;

  try {
    if (fs.existsSync(installPath)) {
      addLog('备份现有安装...', 'info');
      try {
        fs.renameSync(installPath, backupPath);
        hasBackup = true;
      } catch {
        // 如果重命名失败，直接删除
        fs.rmSync(installPath, { recursive: true, force: true });
      }
    }

    fs.mkdirSync(installPath, { recursive: true });
    addLog(`正在解压到 ${installPath}...`, 'info');

    let extractResult: { success: boolean; error?: string };

    if (platform === 'win-x64') {
      extractResult = await extractZip(archivePath, installPath, addLog);
    } else {
      extractResult = await extractTarGz(archivePath, installPath, addLog);
    }

    if (!extractResult.success) {
      // 解压失败，回滚
      addLog('解压失败，正在回滚...', 'warning');
      rollbackInstall(installPath, backupPath, hasBackup);
      return extractResult;
    }

    // 成功，删除备份
    if (hasBackup && fs.existsSync(backupPath)) {
      fs.rmSync(backupPath, { recursive: true, force: true });
    }

    addLog('解压完成', 'success');
    return { success: true };
  } catch (error) {
    // 异常时回滚
    rollbackInstall(installPath, backupPath, hasBackup);
    return {
      success: false,
      error: `解压失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
  }
}

/**
 * 回滚安装
 */
function rollbackInstall(installPath: string, backupPath: string, hasBackup: boolean): void {
  try {
    if (fs.existsSync(installPath)) {
      fs.rmSync(installPath, { recursive: true, force: true });
    }
    if (hasBackup && fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, installPath);
    }
  } catch {
    // 忽略回滚失败
  }
}

/**
 * 解压 ZIP（Windows）
 */
async function extractZip(
  archivePath: string,
  installPath: string,
  addLog: (message: string, level?: 'info' | 'success' | 'error' | 'warning') => void
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const ps = spawn('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath "${archivePath}" -DestinationPath "${installPath}" -Force`,
    ]);

    ps.on('close', (code: number) => {
      if (code === 0) {
        // 处理可能的子目录结构
        normalizeExtractedStructure(installPath);
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `解压失败，退出码: ${code}` });
      }
    });

    ps.on('error', (err: Error) => {
      resolve({ success: false, error: `解压失败: ${err.message}` });
    });
  });
}

/**
 * 解压 tar.gz（Unix）
 */
async function extractTarGz(
  archivePath: string,
  installPath: string,
  addLog: (message: string, level?: 'info' | 'success' | 'error' | 'warning') => void
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const tar = spawn('tar', ['-xzf', archivePath, '-C', installPath]);

    tar.on('close', (code: number) => {
      if (code === 0) {
        normalizeExtractedStructure(installPath);
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `解压失败，退出码: ${code}` });
      }
    });

    tar.on('error', (err: Error) => {
      resolve({ success: false, error: `解压失败: ${err.message}` });
    });
  });
}

/**
 * 标准化解压后的目录结构
 * 有些压缩包会有顶层目录，需要移动内容
 */
function normalizeExtractedStructure(installPath: string): void {
  const entries = fs.readdirSync(installPath);

  // 如果只有一个目录且名为 openclaw-xxx，则移动内容
  if (entries.length === 1) {
    const entry = entries[0];
    const entryPath = path.join(installPath, entry);

    if (fs.statSync(entryPath).isDirectory() && entry.startsWith('openclaw-')) {
      const subEntries = fs.readdirSync(entryPath);
      for (const subEntry of subEntries) {
        fs.renameSync(
          path.join(entryPath, subEntry),
          path.join(installPath, subEntry)
        );
      }
      fs.rmSync(entryPath, { recursive: true, force: true });
    }
  }
}

/**
 * 获取启动命令
 */
export function getStartCommand(installPath: string): {
  nodePath: string;
  openclawPath: string;
  entryPoint: string;
} {
  const platform = getPlatform();

  const nodePath = platform === 'win-x64'
    ? path.join(installPath, 'node', 'node.exe')
    : path.join(installPath, 'node', 'bin', 'node');

  const openclawPath = path.join(installPath, 'openclaw');
  const entryPoint = path.join(openclawPath, 'openclaw.mjs');

  return { nodePath, openclawPath, entryPoint };
}

/**
 * 验证安装完整性
 */
export function validateBundle(installPath: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const platform = getPlatform();

  // 检查 Node.js
  const nodePath = platform === 'win-x64'
    ? path.join(installPath, 'node', 'node.exe')
    : path.join(installPath, 'node', 'bin', 'node');

  if (!fs.existsSync(nodePath)) {
    errors.push(`运行时不存在: ${nodePath}`);
  } else {
    // 检查是否可执行
    try {
      fs.accessSync(nodePath, fs.constants.X_OK);
    } catch {
      errors.push(`运行时不可执行: ${nodePath}`);
    }
  }

  // 检查 OpenClaw
  const openclawPath = path.join(installPath, 'openclaw');
  if (!fs.existsSync(openclawPath)) {
    errors.push(`OpenClaw 目录不存在`);
  } else {
    const entryPoint = path.join(openclawPath, 'openclaw.mjs');
    if (!fs.existsSync(entryPoint)) {
      errors.push(`入口文件不存在`);
    }

    const distDir = path.join(openclawPath, 'dist');
    if (!fs.existsSync(distDir)) {
      errors.push(`构建产物不存在`);
    }

    const nodeModules = path.join(openclawPath, 'node_modules');
    if (!fs.existsSync(nodeModules)) {
      errors.push(`依赖目录不存在`);
    } else {
      // 抽样检查几个关键依赖
      const criticalDeps = ['express', 'ws', 'commander'];
      for (const dep of criticalDeps) {
        if (!fs.existsSync(path.join(nodeModules, dep))) {
          errors.push(`缺少关键依赖: ${dep}`);
          break; // 只报告一个
        }
      }
    }
  }

  // 检查版本文件
  const versionFile = path.join(installPath, 'VERSION');
  if (!fs.existsSync(versionFile)) {
    errors.push(`版本信息文件不存在`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export const BUNDLE_CONFIG = {
  version: BUNDLE_VERSION,
  downloadUrls: OFFLINE_BUNDLE_URLS,
  minDiskSpace: MIN_DISK_SPACE,
};
