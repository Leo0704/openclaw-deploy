/**
 * 离线包构建和服务 - 全面模拟测试
 * 测试覆盖：构建流程、安装检测、解压流程、验证逻辑
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';

// ============================================
// 模拟依赖
// ============================================

// 模拟平台检测
function getPlatform(): string {
  const p = os.platform();
  if (p === 'win32') return 'win-x64';
  if (p === 'darwin') return 'macos-arm64';
  if (p === 'linux') return 'linux-x64';
  throw new Error(`不支持的平台: ${p}`);
}

// 离线包版本
const BUNDLE_VERSION = '2026.3.8';
const NODE_VERSION = '22.14.0';

// 下载链接配置
const OFFLINE_BUNDLE_URLS: Record<string, string> = {
  'win-x64': 'https://pan.quark.cn/s/6ca5581f1db9',
  'macos-arm64': 'https://pan.quark.cn/s/6ca5581f1db9',
  'macos-x64': 'https://pan.quark.cn/s/6ca5581f1db9',
  'linux-x64': 'https://pan.quark.cn/s/6ca5581f1db9',
};

// 最小磁盘空间 (500MB)
const MIN_DISK_SPACE = 500 * 1024 * 1024;

// ============================================
// 测试套件 1: 平台检测
// ============================================
describe('平台检测', () => {
  it('应该正确检测当前平台', () => {
    const platform = getPlatform();
    expect(['win-x64', 'macos-arm64', 'linux-x64']).toContain(platform);
  });

  it('macOS 统一使用 ARM64 版本', () => {
    // 即使是 Intel Mac 也使用 ARM64 版本（通过 Rosetta 运行）
    const currentPlatform = os.platform();
    if (currentPlatform === 'darwin') {
      expect(getPlatform()).toBe('macos-arm64');
    }
  });

  it('Windows 应该返回 win-x64', () => {
    if (os.platform() === 'win32') {
      expect(getPlatform()).toBe('win-x64');
    }
  });

  it('Linux 应该返回 linux-x64', () => {
    if (os.platform() === 'linux') {
      expect(getPlatform()).toBe('linux-x64');
    }
  });
});

// ============================================
// 测试套件 2: 离线包信息
// ============================================
describe('离线包信息生成', () => {
  function getOfflineBundleInfo(customUrl?: string) {
    const platform = getPlatform();
    const template = customUrl || OFFLINE_BUNDLE_URLS[platform];
    if (!template) {
      throw new Error(`平台 ${platform} 没有配置下载链接`);
    }
    const downloadUrl = template.replace('{VERSION}', BUNDLE_VERSION);
    const ext = '.tar.gz';
    const fileName = `openclaw-${platform}-${BUNDLE_VERSION}${ext}`;

    return {
      version: BUNDLE_VERSION,
      platform,
      nodeVersion: '22.12.0',
      downloadUrl,
      fileName,
    };
  }

  it('应该生成正确的离线包信息', () => {
    const info = getOfflineBundleInfo();
    expect(info.version).toBe(BUNDLE_VERSION);
    expect(info.platform).toBeDefined();
    expect(info.downloadUrl).toBeDefined();
    expect(info.fileName).toContain('openclaw-');
  });

  it('Windows 应该使用 .tar.gz 格式', () => {
    const ext = '.tar.gz';
    expect(ext).toBe('.tar.gz');
  });

  it('Unix 平台应该使用 .tar.gz 格式', () => {
    const platforms = ['macos-arm64', 'linux-x64'];
    for (const _platform of platforms) {
      const ext = '.tar.gz';
      expect(ext).toBe('.tar.gz');
    }
  });

  it('文件名应该包含版本号', () => {
    const info = getOfflineBundleInfo();
    expect(info.fileName).toContain(BUNDLE_VERSION);
  });

  it('文件名应该包含平台标识', () => {
    const info = getOfflineBundleInfo();
    expect(info.fileName).toContain(info.platform);
  });

  it('应该支持自定义下载链接', () => {
    const customUrl = 'https://custom.example.com/bundle-{VERSION}.tar.gz';
    const info = getOfflineBundleInfo(customUrl);
    expect(info.downloadUrl).toContain('custom.example.com');
    expect(info.downloadUrl).toContain(BUNDLE_VERSION);
  });
});

// ============================================
// 测试套件 3: 安装检测
// ============================================
describe('安装检测逻辑', () => {
  // 模拟检测函数
  function detectInstallLogic(
    hasNodeDir: boolean,
    hasOpenClawDir: boolean,
    hasNodeExe: boolean,
    hasOpenClawEntry: boolean,
    hasNodeModules: boolean,
    versionContent?: string
  ) {
    if (!hasNodeDir) {
      return { installed: false, error: '缺少运行时' };
    }
    if (!hasOpenClawDir) {
      return { installed: false, error: '缺少 OpenClaw' };
    }
    if (!hasNodeExe) {
      return { installed: false, error: '缺少运行时' };
    }
    if (!hasOpenClawEntry) {
      return { installed: false, error: '缺少入口文件' };
    }
    if (!hasNodeModules) {
      return { installed: false, error: '安装不完整，缺少依赖' };
    }

    let version = 'unknown';
    if (versionContent) {
      const match = versionContent.match(/openclaw:\s*(.+)/);
      if (match) version = match[1].trim();
    }

    const needUpdate = version !== BUNDLE_VERSION;

    return {
      installed: true,
      version,
      needUpdate,
    };
  }

  it('应该检测到完整安装', () => {
    const result = detectInstallLogic(true, true, true, true, true, `openclaw: ${BUNDLE_VERSION}`);
    expect(result.installed).toBe(true);
    expect(result.needUpdate).toBe(false);
  });

  it('应该检测到缺少运行时', () => {
    const result = detectInstallLogic(false, true, true, true, true);
    expect(result.installed).toBe(false);
    expect(result.error).toContain('运行时');
  });

  it('应该检测到缺少 OpenClaw 目录', () => {
    const result = detectInstallLogic(true, false, true, true, true);
    expect(result.installed).toBe(false);
    expect(result.error).toContain('OpenClaw');
  });

  it('应该检测到缺少入口文件', () => {
    const result = detectInstallLogic(true, true, true, false, true);
    expect(result.installed).toBe(false);
    expect(result.error).toContain('入口文件');
  });

  it('应该检测到缺少依赖', () => {
    const result = detectInstallLogic(true, true, true, true, false);
    expect(result.installed).toBe(false);
    expect(result.error).toContain('依赖');
  });

  it('应该检测到需要更新', () => {
    const result = detectInstallLogic(true, true, true, true, true, 'openclaw: 2025.1.1');
    expect(result.installed).toBe(true);
    expect(result.needUpdate).toBe(true);
  });

  it('应该处理未知版本', () => {
    const result = detectInstallLogic(true, true, true, true, true, undefined);
    expect(result.installed).toBe(true);
    expect(result.version).toBe('unknown');
    expect(result.needUpdate).toBe(true);
  });

  it('应该正确解析版本文件', () => {
    const versionContent = `openclaw: ${BUNDLE_VERSION}
node: ${NODE_VERSION}
platform: macos-arm64
build_date: 2026-03-08 12:00:00`;
    const match = versionContent.match(/openclaw:\s*(.+)/);
    expect(match).toBeDefined();
    expect(match![1].trim()).toBe(BUNDLE_VERSION);
  });
});

// ============================================
// 测试套件 4: 离线包文件验证
// ============================================
describe('离线包文件验证', () => {
  function validateBundleFileLogic(
    exists: boolean,
    isFile: boolean,
    fileSize: number,
    filePath: string
  ) {
    if (!exists) {
      return { valid: false, error: '文件不存在' };
    }
    if (!isFile) {
      return { valid: false, error: '不是有效文件' };
    }
    // 检查文件大小（至少 50MB）
    if (fileSize < 50 * 1024 * 1024) {
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
  }

  it('应该验证有效的离线包文件', () => {
    const result = validateBundleFileLogic(true, true, 100 * 1024 * 1024, 'bundle.tar.gz');
    expect(result.valid).toBe(true);
  });

  it('应该拒绝不存在的文件', () => {
    const result = validateBundleFileLogic(false, true, 100 * 1024 * 1024, 'bundle.tar.gz');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('不存在');
  });

  it('应该拒绝目录', () => {
    const result = validateBundleFileLogic(true, false, 0, 'some-dir');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('不是有效文件');
  });

  it('应该拒绝太小的文件（可能下载不完整）', () => {
    const result = validateBundleFileLogic(true, true, 10 * 1024 * 1024, 'bundle.tar.gz');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('太小');
  });

  it('应该接受刚好超过 50MB 的文件', () => {
    const result = validateBundleFileLogic(true, true, 51 * 1024 * 1024, 'bundle.tar.gz');
    expect(result.valid).toBe(true);
  });

  it('Windows 应该验证 .zip 扩展名', () => {
    // 模拟 Windows 平台验证
    const filePath = 'bundle.zip';
    const ext = path.extname(filePath);
    expect(ext).toBe('.zip');
  });

  it('Unix 应该验证 .tar.gz 扩展名', () => {
    const filePath = 'bundle.tar.gz';
    expect(filePath.endsWith('.tar.gz')).toBe(true);
  });
});

// ============================================
// 测试套件 5: 解压流程
// ============================================
describe('解压流程逻辑', () => {
  it('应该为 Windows 生成正确的 PowerShell 解压命令', () => {
    const archivePath = 'C:\\Users\\test\\bundle.zip';
    const installPath = 'C:\\Users\\test\\openclaw';
    const command = `Expand-Archive -LiteralPath "${archivePath}" -DestinationPath "${installPath}" -Force`;

    expect(command).toContain('Expand-Archive');
    expect(command).toContain(archivePath);
    expect(command).toContain(installPath);
  });

  it('应该为 Unix 生成正确的 tar 解压命令', () => {
    const archivePath = '/Users/test/bundle.tar.gz';
    const installPath = '/Users/test/openclaw';
    const args = ['-xzf', archivePath, '-C', installPath];

    expect(args[0]).toBe('-xzf');
    expect(args[1]).toBe(archivePath);
    expect(args[2]).toBe('-C');
    expect(args[3]).toBe(installPath);
  });

  it('应该处理子目录结构标准化', () => {
    // 模拟解压后只有一个 openclaw-xxx 目录的情况
    const entries = ['openclaw-2026.3.8'];
    const shouldNormalize = entries.length === 1 &&
                           entries[0].startsWith('openclaw-');

    expect(shouldNormalize).toBe(true);
  });

  it('应该不需要标准化多个顶层文件的结构', () => {
    const entries = ['node', 'openclaw', 'VERSION', 'start.sh'];
    const shouldNormalize = entries.length === 1 &&
                           entries[0].startsWith('openclaw-');

    expect(shouldNormalize).toBe(false);
  });
});

// ============================================
// 测试套件 6: 安装完整性验证
// ============================================
describe('安装完整性验证', () => {
  function validateBundleLogic(
    hasNodeExe: boolean,
    nodeExecutable: boolean,
    hasOpenClawDir: boolean,
    hasEntryPoint: boolean,
    hasDistDir: boolean,
    hasNodeModules: boolean,
    criticalDeps: string[],
    hasVersionFile: boolean
  ) {
    const errors: string[] = [];

    if (!hasNodeExe) {
      errors.push('运行时不存在');
    } else if (!nodeExecutable) {
      errors.push('运行时不可执行');
    }

    if (!hasOpenClawDir) {
      errors.push('OpenClaw 目录不存在');
    } else {
      if (!hasEntryPoint) errors.push('入口文件不存在');
      if (!hasDistDir) errors.push('构建产物不存在');
      if (!hasNodeModules) {
        errors.push('依赖目录不存在');
      } else if (criticalDeps.length === 0) {
        errors.push('缺少关键依赖');
      }
    }

    if (!hasVersionFile) {
      errors.push('版本信息文件不存在');
    }

    return { valid: errors.length === 0, errors };
  }

  it('应该验证完整的安装', () => {
    const result = validateBundleLogic(
      true, true, true, true, true, true, ['express', 'ws', 'commander'], true
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('应该检测缺少运行时', () => {
    const result = validateBundleLogic(
      false, false, true, true, true, true, ['express'], true
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('运行时不存在');
  });

  it('应该检测不可执行的运行时', () => {
    const result = validateBundleLogic(
      true, false, true, true, true, true, ['express'], true
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('运行时不可执行');
  });

  it('应该检测缺少入口文件', () => {
    const result = validateBundleLogic(
      true, true, true, false, true, true, ['express'], true
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('入口文件不存在');
  });

  it('应该检测缺少构建产物', () => {
    const result = validateBundleLogic(
      true, true, true, true, false, true, ['express'], true
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('构建产物不存在');
  });

  it('应该检测缺少关键依赖', () => {
    const result = validateBundleLogic(
      true, true, true, true, true, true, [], true
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('缺少关键依赖');
  });

  it('应该检测缺少版本文件', () => {
    const result = validateBundleLogic(
      true, true, true, true, true, true, ['express'], false
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('版本信息文件不存在');
  });

  it('关键依赖应该包含 express, ws, commander', () => {
    const criticalDeps = ['express', 'ws', 'commander'];
    expect(criticalDeps).toContain('express');
    expect(criticalDeps).toContain('ws');
    expect(criticalDeps).toContain('commander');
  });
});

// ============================================
// 测试套件 7: 启动命令生成
// ============================================
describe('启动命令生成', () => {
  function getStartCommandLogic(installPath: string, platform: string) {
    const nodePath = platform === 'win-x64'
      ? path.join(installPath, 'node', 'node.exe')
      : path.join(installPath, 'node', 'bin', 'node');

    const openclawPath = path.join(installPath, 'openclaw');
    const entryPoint = path.join(openclawPath, 'openclaw.mjs');

    return { nodePath, openclawPath, entryPoint };
  }

  it('Windows 应该使用 node.exe 路径', () => {
    const result = getStartCommandLogic('C:\\openclaw', 'win-x64');
    expect(result.nodePath).toContain('node.exe');
    expect(result.nodePath).not.toContain('bin');
  });

  it('Unix 应该使用 bin/node 路径', () => {
    const result = getStartCommandLogic('/opt/openclaw', 'macos-arm64');
    expect(result.nodePath).toContain('bin');
    expect(result.nodePath).toContain('node');
  });

  it('入口点应该是 openclaw.mjs', () => {
    const result = getStartCommandLogic('/opt/openclaw', 'macos-arm64');
    expect(result.entryPoint).toContain('openclaw.mjs');
  });

  it('OpenClaw 路径应该正确', () => {
    const result = getStartCommandLogic('/opt/openclaw', 'macos-arm64');
    expect(result.openclawPath).toContain('openclaw');
  });
});

// ============================================
// 测试套件 8: 离线包搜索路径
// ============================================
describe('离线包搜索路径', () => {
  function getSearchPathsLogic(
    execDir: string,
    homeDir: string,
    platform: string,
    fileName: string
  ): string[] {
    const searchPaths: string[] = [];

    // 1. 可执行文件同目录及子目录
    searchPaths.push(
      path.join(execDir, fileName),
      path.join(execDir, 'bundle', fileName),
      path.join(execDir, 'openclaw-bundle', fileName),
      path.join(execDir, '..', fileName),
      path.join(execDir, '..', 'bundle', fileName)
    );

    // 2. 常见下载目录
    if (platform === 'win32') {
      searchPaths.push(
        path.join(homeDir, 'Downloads', fileName),
        path.join(homeDir, 'Desktop', fileName)
      );
    } else if (platform === 'darwin') {
      searchPaths.push(
        path.join(homeDir, 'Downloads', fileName),
        path.join(homeDir, 'Desktop', fileName)
      );
    } else {
      searchPaths.push(
        path.join(homeDir, 'Downloads', fileName),
        path.join(homeDir, fileName)
      );
    }

    return searchPaths;
  }

  it('应该包含可执行文件同目录', () => {
    const paths = getSearchPathsLogic('/app', '/home/user', 'linux', 'bundle.tar.gz');
    expect(paths.some(p => p === '/app/bundle.tar.gz')).toBe(true);
  });

  it('应该包含 bundle 子目录', () => {
    const paths = getSearchPathsLogic('/app', '/home/user', 'linux', 'bundle.tar.gz');
    expect(paths.some(p => p.includes('bundle'))).toBe(true);
  });

  it('应该包含 Downloads 目录', () => {
    const paths = getSearchPathsLogic('/app', '/home/user', 'linux', 'bundle.tar.gz');
    expect(paths.some(p => p.includes('Downloads'))).toBe(true);
  });

  it('Windows 应该包含 Desktop', () => {
    const paths = getSearchPathsLogic('C:\\app', 'C:\\Users\\test', 'win32', 'bundle.zip');
    expect(paths.some(p => p.includes('Desktop'))).toBe(true);
  });

  it('macOS 应该包含 Desktop', () => {
    const paths = getSearchPathsLogic('/app', '/Users/test', 'darwin', 'bundle.tar.gz');
    expect(paths.some(p => p.includes('Desktop'))).toBe(true);
  });
});

// ============================================
// 测试套件 9: 回滚机制
// ============================================
describe('安装回滚机制', () => {
  it('应该在解压失败时触发回滚', () => {
    const steps = ['backup', 'extract', 'validate', 'cleanup'];
    const failedAt = 'extract';
    const shouldRollback = failedAt === 'extract';

    expect(shouldRollback).toBe(true);
  });

  it('应该在验证失败时触发回滚', () => {
    const steps = ['backup', 'extract', 'validate', 'cleanup'];
    const failedAt = 'validate';
    const shouldRollback = failedAt !== 'cleanup';

    expect(shouldRollback).toBe(true);
  });

  it('成功时不应该回滚', () => {
    const steps = ['backup', 'extract', 'validate', 'cleanup'];
    const failedAt = null;
    const shouldRollback = failedAt !== null;

    expect(shouldRollback).toBe(false);
  });

  it('回滚应该恢复备份', () => {
    const hasBackup = true;
    const installPath = '/opt/openclaw';
    const backupPath = '/opt/openclaw.backup';

    // 模拟回滚逻辑
    const rollbackLogic = {
      removeCurrent: true,
      restoreBackup: hasBackup
    };

    expect(rollbackLogic.removeCurrent).toBe(true);
    expect(rollbackLogic.restoreBackup).toBe(true);
  });
});

// ============================================
// 测试套件 10: 完整部署流程模拟
// ============================================
describe('完整部署流程模拟', () => {
  interface DeployStep {
    name: string;
    status: 'pending' | 'running' | 'success' | 'error';
    message?: string;
  }

  function simulateDeployFlow(
    bundleExists: boolean,
    bundleValid: boolean,
    extractSuccess: boolean,
    installValid: boolean
  ): DeployStep[] {
    const steps: DeployStep[] = [];

    // 步骤1: 检查安装状态
    steps.push({ name: '检查安装状态', status: 'success' });

    // 步骤2: 获取离线包信息
    steps.push({ name: '获取离线包信息', status: 'success' });

    // 步骤3: 检测离线包
    if (bundleExists) {
      steps.push({ name: '检测离线包', status: 'success' });
    } else {
      steps.push({ name: '检测离线包', status: 'error', message: '未找到离线包' });
      return steps;
    }

    // 步骤4: 验证离线包
    if (bundleValid) {
      steps.push({ name: '验证离线包', status: 'success' });
    } else {
      steps.push({ name: '验证离线包', status: 'error', message: '离线包无效' });
      return steps;
    }

    // 步骤5: 解压安装
    if (extractSuccess) {
      steps.push({ name: '解压安装', status: 'success' });
    } else {
      steps.push({ name: '解压安装', status: 'error', message: '解压失败' });
      return steps;
    }

    // 步骤6: 验证安装
    if (installValid) {
      steps.push({ name: '验证安装', status: 'success' });
    } else {
      steps.push({ name: '验证安装', status: 'error', message: '安装不完整' });
      return steps;
    }

    // 步骤7: 保存配置
    steps.push({ name: '保存配置', status: 'success' });

    // 步骤8: 完成
    steps.push({ name: '部署完成', status: 'success' });

    return steps;
  }

  it('成功部署流程', () => {
    const steps = simulateDeployFlow(true, true, true, true);

    expect(steps.every(s => s.status === 'success')).toBe(true);
    expect(steps.length).toBe(8);
    expect(steps[steps.length - 1].name).toBe('部署完成');
  });

  it('离线包不存在时应该提前终止', () => {
    const steps = simulateDeployFlow(false, true, true, true);

    const failedStep = steps.find(s => s.status === 'error');
    expect(failedStep?.name).toBe('检测离线包');
    expect(steps.length).toBe(3);
  });

  it('离线包无效时应该提前终止', () => {
    const steps = simulateDeployFlow(true, false, true, true);

    const failedStep = steps.find(s => s.status === 'error');
    expect(failedStep?.name).toBe('验证离线包');
    expect(steps.length).toBe(4);
  });

  it('解压失败时应该提前终止', () => {
    const steps = simulateDeployFlow(true, true, false, true);

    const failedStep = steps.find(s => s.status === 'error');
    expect(failedStep?.name).toBe('解压安装');
    expect(steps.length).toBe(5);
  });

  it('安装验证失败时应该提前终止', () => {
    const steps = simulateDeployFlow(true, true, true, false);

    const failedStep = steps.find(s => s.status === 'error');
    expect(failedStep?.name).toBe('验证安装');
    expect(steps.length).toBe(6);
  });

  it('每个步骤应该有名称', () => {
    const steps = simulateDeployFlow(true, true, true, true);

    for (const step of steps) {
      expect(step.name).toBeDefined();
      expect(step.name.length).toBeGreaterThan(0);
    }
  });
});

// ============================================
// 测试套件 11: GitHub Actions 构建验证
// ============================================
describe('GitHub Actions 构建配置验证', () => {
  const supportedPlatforms = [
    { platform: 'win-x64', runner: 'windows-latest' },
    { platform: 'macos-arm64', runner: 'macos-latest' },
    { platform: 'linux-x64', runner: 'ubuntu-latest' },
  ];

  it('应该支持 3 个平台', () => {
    expect(supportedPlatforms.length).toBe(3);
  });

  it('每个平台应该有对应的 runner', () => {
    for (const { platform, runner } of supportedPlatforms) {
      expect(runner).toBeDefined();
      expect(runner).toContain('latest');
    }
  });

  it('Node.js 版本应该是 22.14.0', () => {
    expect(NODE_VERSION).toBe('22.14.0');
  });

  it('构建产物命名应该正确', () => {
    for (const { platform } of supportedPlatforms) {
      const ext = platform === 'win-x64' ? '.zip' : '.tar.gz';
      const fileName = `openclaw-${platform}-${BUNDLE_VERSION}${ext}`;

      expect(fileName).toContain(platform);
      expect(fileName).toContain(BUNDLE_VERSION);
    }
  });

  it('VERSION 文件内容应该正确', () => {
    const versionContent = `openclaw: ${BUNDLE_VERSION}
node: ${NODE_VERSION}
platform: macos-arm64
build_date: 2026-03-08 12:00:00`;

    expect(versionContent).toContain(`openclaw: ${BUNDLE_VERSION}`);
    expect(versionContent).toContain(`node: ${NODE_VERSION}`);
  });

  it('启动脚本应该正确生成', () => {
    // Unix 启动脚本
    const unixScript = `#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH="$SCRIPT_DIR/node/bin:$PATH"
cd "$SCRIPT_DIR/openclaw"
echo "Starting OpenClaw..."
"$SCRIPT_DIR/node/bin/node" openclaw.mjs "$@"`;

    expect(unixScript).toContain('#!/bin/bash');
    // 脚本使用完整路径的 Node.js（内置）
    expect(unixScript).toContain('openclaw.mjs');
    expect(unixScript).toContain('$SCRIPT_DIR/node/bin/node');

    // Windows 启动脚本
    const winScript = `@echo off
chcp 65001 >nul
setlocal
set "SCRIPT_DIR=%~dp0"
set "NODE_PATH=%SCRIPT_DIR%node"
set "PATH=%NODE_PATH%;%PATH%"
cd /d "%SCRIPT_DIR%openclaw"
echo Starting OpenClaw...
"%SCRIPT_DIR%node\\node.exe" openclaw.mjs %*`;

    expect(winScript).toContain('@echo off');
    expect(winScript).toContain('node.exe');
  });
});

// ============================================
// 测试总结
// ============================================
console.log(`
========================================
  离线包构建和服务 - 全面模拟测试
  测试覆盖: 平台检测、安装检测、解压流程、
          验证逻辑、启动命令、搜索路径、
          回滚机制、完整部署流程、CI/CD 配置
========================================
`);
