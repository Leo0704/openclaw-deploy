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

// 默认版本（当无法从已安装包读取时使用）
const DEFAULT_BUNDLE_VERSION = '2026.3.11';

/**
 * 从已安装的离线包读取版本信息
 * 这样版本号只需要在 CI 构建时维护
 */
function getInstalledBundleVersion(installPath?: string): string | null {
  if (!installPath) {
    // 尝试从默认安装路径读取
    const homeDir = os.homedir();
    installPath = path.join(homeDir, '.openclaw');
  }

  const versionFile = path.join(installPath, 'VERSION');
  if (fs.existsSync(versionFile)) {
    try {
      const content = fs.readFileSync(versionFile, 'utf-8');
      const match = content.match(/openclaw:\s*(.+)/);
      if (match) {
        return match[1].trim();
      }
    } catch {
      // 忽略读取错误
    }
  }
  return null;
}

const MIN_DISK_SPACE = 20 * 1024 * 1024 * 1024;

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
 * 版本号优先从已安装的包读取（与 CI 构建版本保持一致）
 */
export function getOfflineBundleInfo(customUrl?: string, installPath?: string): OfflineBundleInfo {
  const platform = getPlatform();

  // 优先从已安装的版本读取（CI 构建时会写入 VERSION 文件）
  // 这样版本号只需要在 CI 构建时维护一处
  const installedVersion = getInstalledBundleVersion(installPath);
  const bundleVersion = installedVersion || DEFAULT_BUNDLE_VERSION;

  const template = customUrl || OFFLINE_BUNDLE_URLS[platform];

  if (!template) {
    throw new Error(`平台 ${platform} 没有配置下载链接`);
  }

  const downloadUrl = template.replace('{VERSION}', bundleVersion);
  const ext = '.tar.gz'; // 统一使用 tar.gz 格式（避免 zip 2GB 限制）
  const fileName = `openclaw-${platform}-${bundleVersion}${ext}`;

  return {
    version: bundleVersion,
    platform,
    nodeVersion: '22.14.0',
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

    // 检查是否需要更新（优先使用已安装包记录的版本）
    const currentVersion = getInstalledBundleVersion() || DEFAULT_BUNDLE_VERSION;
    const needUpdate = version !== currentVersion;

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

    const lowerPath = filePath.toLowerCase();
    if (!lowerPath.endsWith('.tar.gz') && !lowerPath.endsWith('.zip')) {
      return { valid: false, error: '文件格式不正确，期望 .tar.gz 或 .zip' };
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
  const altFileNames = Array.from(new Set([
    fileName,
    fileName.replace(/\.tar\.gz$/i, '.zip'),
    `openclaw-${bundleInfo.platform}.zip`,
    `openclaw-${bundleInfo.platform}.tar.gz`,
  ]));
  const searchPaths: string[] = [];
  const searchDirs: string[] = [];

  // 1. 龙虾助手可执行文件同目录及子目录（最高优先级）
  // 这是用户从网盘下载的"龙虾助手+离线包"文件夹的场景
  const execDir = path.dirname(process.execPath);
  searchDirs.push(
    execDir,
    path.join(execDir, 'bundle'),
    path.join(execDir, 'openclaw-bundle'),
    path.join(execDir, '..'),
    path.join(execDir, '..', 'bundle'),
  );
  for (const name of altFileNames) {
    searchPaths.push(
      path.join(execDir, name),                           // 同目录
      path.join(execDir, 'bundle', name),                 // bundle/ 子目录
      path.join(execDir, 'openclaw-bundle', name),        // openclaw-bundle/ 子目录
      path.join(execDir, '..', name),                     // 上级目录（开发模式）
      path.join(execDir, '..', 'bundle', name),           // 上级 bundle/ 目录
    );
  }

  // 2. 常见下载目录
  if (platform === 'win32') {
    searchDirs.push(
      path.join(homeDir, 'Downloads'),
      path.join(homeDir, 'downloads'),
      path.join(homeDir, 'Desktop'),
      path.join(homeDir, '桌面'),
    );
    for (const name of altFileNames) {
      searchPaths.push(
        path.join(homeDir, 'Downloads', name),
        path.join(homeDir, 'downloads', name),
        path.join(homeDir, 'Desktop', name),
        path.join(homeDir, '桌面', name),
      );
    }
  } else if (platform === 'darwin') {
    searchDirs.push(
      path.join(homeDir, 'Downloads'),
      path.join(homeDir, 'Desktop'),
    );
    for (const name of altFileNames) {
      searchPaths.push(
        path.join(homeDir, 'Downloads', name),
        path.join(homeDir, 'Desktop', name),
      );
    }
  } else {
    searchDirs.push(
      path.join(homeDir, 'Downloads'),
      homeDir,
    );
    for (const name of altFileNames) {
      searchPaths.push(
        path.join(homeDir, 'Downloads', name),
        path.join(homeDir, name),
      );
    }
  }

  for (const searchPath of searchPaths) {
    if (fs.existsSync(searchPath)) {
      const validation = validateBundleFile(searchPath, bundleInfo);
      if (validation.valid) {
        return { found: true, path: searchPath };
      }
    }
  }

  const exactPrefix = `openclaw-${bundleInfo.platform}-`;
  const fallbackCandidates: string[] = [];
  const visitedDirs = new Set<string>();
  for (const dir of searchDirs) {
    const normalizedDir = path.resolve(dir);
    if (visitedDirs.has(normalizedDir)) {
      continue;
    }
    visitedDirs.add(normalizedDir);
    if (!fs.existsSync(normalizedDir) || !fs.statSync(normalizedDir).isDirectory()) {
      continue;
    }
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(normalizedDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const lower = entry.toLowerCase();
      if (!lower.endsWith('.tar.gz') && !lower.endsWith('.zip')) {
        continue;
      }
      if (!lower.startsWith('openclaw-') && !lower.includes('offline')) {
        continue;
      }
      fallbackCandidates.push(path.join(normalizedDir, entry));
    }
  }

  fallbackCandidates.sort((a, b) => {
    const aName = path.basename(a).toLowerCase();
    const bName = path.basename(b).toLowerCase();
    const aScore = Number(aName.startsWith(exactPrefix)) * 4
      + Number(aName.includes(bundleInfo.version)) * 2
      + Number(aName.includes(bundleInfo.platform));
    const bScore = Number(bName.startsWith(exactPrefix)) * 4
      + Number(bName.includes(bundleInfo.version)) * 2
      + Number(bName.includes(bundleInfo.platform));
    return bScore - aScore;
  });

  for (const candidate of fallbackCandidates) {
    const validation = validateBundleFile(candidate, bundleInfo);
    if (validation.valid) {
      return { found: true, path: candidate };
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
    const testDir = path.dirname(installPath);
    if (!fs.existsSync(testDir)) {
      // 目录不存在，尝试创建
      fs.mkdirSync(testDir, { recursive: true });
    }

    const isWindows = process.platform === 'win32';
    let available = 0;

    if (isWindows) {
      // Windows: 使用 PowerShell 获取磁盘可用空间
      const { execSync } = require('child_process') as typeof import('child_process');
      const drive = testDir.substring(0, 2); // 如 "C:"
      try {
        const result = execSync(
          `powershell -Command "(Get-PSDrive -Name '${drive.replace(':', '')}').Free"`,
          { encoding: 'utf-8', timeout: 5000 }
        );
        available = parseInt(result.trim(), 10) || 0;
      } catch {
        // PowerShell 失败时返回 0，让后续检查处理
        available = 0;
      }
    } else {
      // Unix: 使用 df 获取磁盘可用空间
      const { execSync } = require('child_process') as typeof import('child_process');
      try {
        const result = execSync(
          `df -k "${testDir}" | tail -1 | awk '{print $4}'`,
          { encoding: 'utf-8', timeout: 5000 }
        );
        // df 输出是 1K-blocks，转换为字节
        available = (parseInt(result.trim(), 10) || 0) * 1024;
      } catch {
        available = 0;
      }
    }

    const sufficient = available >= MIN_DISK_SPACE;
    return {
      sufficient,
      available,
      required: MIN_DISK_SPACE,
      error: sufficient
        ? undefined
        : `磁盘空间不足，需要 ${(MIN_DISK_SPACE / 1024 / 1024 / 1024).toFixed(0)}GB，可用 ${(available / 1024 / 1024 / 1024).toFixed(2)}GB，请切换部署目录后重试`,
    };
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

    // 按文件扩展名选择解压方式（统一使用 tar.gz 后不再区分平台）
    if (archivePath.endsWith('.tar.gz')) {
      extractResult = await extractTarGz(archivePath, installPath, addLog);
    } else {
      extractResult = await extractZip(archivePath, installPath, addLog);
    }

    if (!extractResult.success) {
      // 解压失败，回滚
      addLog('解压失败，正在回滚...', 'warning');
      rollbackInstall(installPath, backupPath, hasBackup, addLog);
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
    rollbackInstall(installPath, backupPath, hasBackup, addLog);
    return {
      success: false,
      error: `解压失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
  }
}

/**
 * 回滚安装
 */
function rollbackInstall(
  installPath: string,
  backupPath: string,
  hasBackup: boolean,
  addLog?: (message: string, level?: 'info' | 'success' | 'error' | 'warning') => void
): void {
  try {
    if (fs.existsSync(installPath)) {
      addLog?.('清理损坏的安装目录...', 'warning');
      fs.rmSync(installPath, { recursive: true, force: true });
    }
    if (hasBackup && fs.existsSync(backupPath)) {
      addLog?.('恢复备份...', 'info');
      fs.renameSync(backupPath, installPath);
      addLog?.('已恢复备份', 'success');
    }
  } catch (error) {
    const msg = `回滚失败: ${error instanceof Error ? error.message : '未知错误'}，请手动检查 ${installPath} 目录状态`;
    addLog?.(msg, 'error');
    console.error('[回滚失败]', msg);
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
 * 解压 tar.gz（支持 Windows 和 Unix）
 */
async function extractTarGz(
  archivePath: string,
  installPath: string,
  addLog: (message: string, level?: 'info' | 'success' | 'error' | 'warning') => void
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    // Windows tar 需要特殊处理
    const isWindows = process.platform === 'win32';

    // 处理路径中的反斜杠和冒号
    const normalizedArchivePath = isWindows ? archivePath.replace(/\\/g, '/') : archivePath;
    const normalizedInstallPath = isWindows ? installPath.replace(/\\/g, '/') : installPath;

    const args = isWindows
      ? ['-xzf', normalizedArchivePath, '-C', normalizedInstallPath]
      : ['-xzf', archivePath, '-C', installPath];

    const tar = spawn('tar', args);
    let stderr = '';

    tar.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    tar.on('close', (code: number) => {
      // 优先检查关键文件是否存在，即使退出码为 1 也可能成功
      const hasFiles = fs.existsSync(path.join(installPath, 'openclaw')) ||
                       fs.existsSync(path.join(installPath, 'node')) ||
                       fs.existsSync(path.join(installPath, 'VERSION'));

      if (code === 0 || (isWindows && hasFiles)) {
        // 即使退出码非零，如果文件存在也认为成功
        normalizeExtractedStructure(installPath);

        // 检查是否真的有文件被解压出来
        const finalFiles = fs.readdirSync(installPath);
        if (finalFiles.length === 0) {
          resolve({ success: false, error: '解压后目录为空，文件可能损坏' });
          return;
        }

        resolve({ success: true });
      } else {
        // Windows 退出码非 0 且没有关键文件，才判定为失败
        const errorMsg = stderr.trim() || `解压失败，退出码: ${code}`;
        resolve({ success: false, error: errorMsg });
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

  // 如果只有一个目录且名为 openclaw-xxx 或 bundle，则移动内容
  if (entries.length === 1) {
    const entry = entries[0];
    const entryPath = path.join(installPath, entry);

    if (fs.statSync(entryPath).isDirectory() && (entry.startsWith('openclaw-') || entry === 'bundle')) {
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
  version: DEFAULT_BUNDLE_VERSION,
  downloadUrls: OFFLINE_BUNDLE_URLS,
  minDiskSpace: MIN_DISK_SPACE,
};
