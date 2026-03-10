const { spawn } = require('child_process') as typeof import('child_process');
const fs = require('fs') as typeof import('fs');
const os = require('os') as typeof import('os');
const path = require('path') as typeof import('path');

const {
  fetchWithRetry,
  downloadFile,
} = require('./network-utils') as typeof import('./network-utils');
const { readJsonFile } = require('./openclaw-project') as typeof import('./openclaw-project');

export interface UpdateResult {
  checked: boolean;
  updated: boolean;
  error?: string;
}

type ManagedSelfInstallTarget = {
  installRoot: string;
  targetExecPath: string;
  metadataPath: string;
};

type SelfUpdateDeps = {
  version: string;
  isPackagedRuntime: boolean;
  githubMirrors: Array<{ name: string }>;
  getMirrorReleaseApi: (mirrorIndex: number) => string;
  buildMirrorDownloadUrl: (mirrorIndex: number, originalUrl: string) => string;
  logError: (error: Error, context?: string) => void;
  getUserFriendlyMessage: (error: unknown) => string;
};

function parseVersionParts(version: string): number[] {
  return String(version || '')
    .replace(/^v/, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function compareVersions(a: string, b: string): number {
  const left = parseVersionParts(a);
  const right = parseVersionParts(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function getManagedSelfInstallTarget(): ManagedSelfInstallTarget {
  if (process.platform === 'win32') {
    const baseDir = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const installRoot = path.join(baseDir, 'LobsterAssistant');
    return {
      installRoot,
      targetExecPath: path.join(installRoot, 'lobster-win-x64.exe'),
      metadataPath: path.join(installRoot, 'install-meta.json'),
    };
  }

  if (process.platform === 'darwin') {
    const appBundleMatch = process.execPath.match(/^(.*?\.app)\/Contents\/MacOS\/[^/]+$/);
    if (appBundleMatch) {
      const installRoot = path.join(os.homedir(), 'Applications', 'Lobster Assistant.app');
      return {
        installRoot,
        targetExecPath: path.join(installRoot, 'Contents', 'MacOS', 'Lobster Assistant'),
        metadataPath: path.join(installRoot, 'Contents', 'Resources', 'install-meta.json'),
      };
    }

    const installRoot = path.join(os.homedir(), '.local', 'share', 'LobsterAssistant');
    return {
      installRoot,
      targetExecPath: path.join(installRoot, os.arch() === 'arm64' ? 'lobster-macos-arm64' : 'lobster-macos-x64'),
      metadataPath: path.join(installRoot, 'install-meta.json'),
    };
  }

  const installRoot = path.join(os.homedir(), '.local', 'share', 'LobsterAssistant');
  return {
    installRoot,
    targetExecPath: path.join(installRoot, 'lobster-linux-x64'),
    metadataPath: path.join(installRoot, 'install-meta.json'),
  };
}

function readManagedSelfInstallVersion(metadataPath: string): string | null {
  const parsed = readJsonFile(metadataPath);
  const version = String(parsed?.version || '').trim();
  return version || null;
}

function writeManagedSelfInstallVersion(metadataPath: string, version: string) {
  const dir = path.dirname(metadataPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(metadataPath, JSON.stringify({ version }, null, 2));
}

function copyManagedSelfInstall(currentExecPath: string, target: ManagedSelfInstallTarget) {
  const bundleMatch = currentExecPath.match(/^(.*?\.app)\/Contents\/MacOS\/[^/]+$/);
  if (bundleMatch) {
    const sourceBundle = bundleMatch[1];
    const parentDir = path.dirname(target.installRoot);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.rmSync(target.installRoot, { recursive: true, force: true });
    fs.cpSync(sourceBundle, target.installRoot, { recursive: true });
    try {
      fs.chmodSync(target.targetExecPath, 0o755);
    } catch {}
    return;
  }

  const targetDir = path.dirname(target.targetExecPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  fs.copyFileSync(currentExecPath, target.targetExecPath);
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(target.targetExecPath, 0o755);
    } catch {}
  }
}

export async function ensureManagedSelfInstall(deps: SelfUpdateDeps): Promise<boolean> {
  if (!deps.isPackagedRuntime) {
    return false;
  }

  if (process.platform === 'darwin') {
    return false;
  }

  const currentExecPath = path.resolve(process.execPath);
  const target = getManagedSelfInstallTarget();
  const targetExecPath = path.resolve(target.targetExecPath);

  if (currentExecPath === targetExecPath) {
    if (readManagedSelfInstallVersion(target.metadataPath) !== deps.version) {
      writeManagedSelfInstallVersion(target.metadataPath, deps.version);
    }
    return false;
  }

  const installedVersion = readManagedSelfInstallVersion(target.metadataPath);
  const targetExists = fs.existsSync(targetExecPath);

  if (targetExists && installedVersion && compareVersions(installedVersion, deps.version) >= 0) {
    console.log(`  检测到固定安装目录已有 v${installedVersion}，切换到统一安装副本启动...`);
    spawn(targetExecPath, process.argv.slice(1), {
      detached: true,
      stdio: 'inherit',
    });
    process.exit(0);
  }

  console.log('  正在同步到固定安装目录...');
  copyManagedSelfInstall(currentExecPath, target);
  writeManagedSelfInstallVersion(target.metadataPath, deps.version);
  console.log('  已切换到固定安装副本，正在重启...');
  spawn(targetExecPath, process.argv.slice(1), {
    detached: true,
    stdio: 'inherit',
  });
  process.exit(0);
}

export async function checkSelfUpdate(deps: SelfUpdateDeps): Promise<UpdateResult> {
  if (!deps.isPackagedRuntime) {
    return { checked: false, updated: false };
  }

  console.log('  检查更新中...');

  try {
    let releaseInfo: { tag_name: string; assets?: Array<{ name: string; browser_download_url: string }> } | null = null;

    for (let i = 0; i < deps.githubMirrors.length; i++) {
      const mirror = deps.githubMirrors[i];
      const apiUrl = deps.getMirrorReleaseApi(i);

      console.log(`  尝试 ${mirror.name}...`);

      const releaseResult = await fetchWithRetry<{ tag_name: string; assets?: Array<{ name: string; browser_download_url: string }> }>(
        apiUrl,
        {
          method: 'GET',
          headers: { 'User-Agent': 'Lobster-Assistant' },
        },
        {
          timeout: 15000,
          maxRetries: 1,
        }
      );

      if (releaseResult.success && releaseResult.data?.tag_name) {
        releaseInfo = releaseResult.data;
        console.log(`  使用 ${mirror.name} 获取版本信息成功`);
        break;
      }
    }

    if (!releaseInfo) {
      console.log('  所有镜像源均无法获取版本信息，跳过更新');
      return { checked: false, updated: false, error: '获取版本信息失败' };
    }

    const latestVersion = releaseInfo.tag_name.replace(/^v/, '');
    if (compareVersions(latestVersion, deps.version) <= 0) {
      console.log('  已是最新版本');
      return { checked: true, updated: false };
    }

    console.log(`  发现新版本 v${latestVersion}，正在更新...`);

    const platform = os.platform();
    const arch = os.arch();
    let assetName: string;
    if (platform === 'darwin' && arch === 'arm64') {
      assetName = 'lobster-macos-arm64';
    } else if (platform === 'darwin') {
      assetName = 'lobster-macos-x64';
    } else if (platform === 'win32') {
      assetName = 'lobster-win-x64.exe';
    } else {
      assetName = 'lobster-linux-x64';
    }

    const asset = releaseInfo.assets?.find((a) => a.name === assetName);
    if (!asset) {
      console.log(`  未找到 ${assetName}，跳过更新`);
      return { checked: true, updated: false, error: `未找到 ${assetName} 发布包` };
    }

    const currentExe = process.execPath;
    const managedTarget = getManagedSelfInstallTarget();
    const newExe = currentExe + '.new';
    let downloadSuccess = false;

    console.log(`  正在下载 ${assetName}...`);

    for (let i = 0; i < deps.githubMirrors.length; i++) {
      const mirror = deps.githubMirrors[i];
      const downloadUrl = deps.buildMirrorDownloadUrl(i, asset.browser_download_url);

      console.log(`  尝试从 ${mirror.name} 下载...`);

      const downloadResult = await downloadFile(downloadUrl, newExe, {
        timeout: 120000,
        onProgress: (downloaded: number, total: number | null) => {
          if (total && downloaded % (1024 * 1024) < 1000) {
            console.log(`  已下载: ${Math.round(downloaded / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB`);
          }
        },
      });

      if (downloadResult.success) {
        downloadSuccess = true;
        console.log(`  下载成功 (使用: ${mirror.name})`);
        break;
      }

      console.log(`  ${mirror.name} 下载失败，尝试下一个...`);
      try {
        fs.unlinkSync(newExe);
      } catch {}
    }

    if (!downloadSuccess) {
      console.log('  所有镜像源均下载失败');
      return { checked: true, updated: false, error: '下载失败' };
    }

    const stats = fs.statSync(newExe);
    if (stats.size < 1000) {
      console.log('  下载的文件太小，可能已损坏');
      try {
        fs.unlinkSync(newExe);
      } catch {}
      return { checked: true, updated: false, error: '下载的文件可能已损坏' };
    }

    if (platform !== 'win32') {
      fs.chmodSync(newExe, 0o755);
    }

    const backupExe = currentExe + '.old';
    try {
      if (fs.existsSync(backupExe)) {
        fs.unlinkSync(backupExe);
      }
    } catch {}

    try {
      fs.renameSync(currentExe, backupExe);
      fs.renameSync(newExe, currentExe);
    } catch {
      console.log('  替换文件失败，尝试回滚...');
      try {
        if (fs.existsSync(backupExe) && !fs.existsSync(currentExe)) {
          fs.renameSync(backupExe, currentExe);
        }
        if (fs.existsSync(newExe)) {
          fs.unlinkSync(newExe);
        }
      } catch {}
      return { checked: true, updated: false, error: '替换文件失败' };
    }

    console.log('  更新完成！正在重启...');
    writeManagedSelfInstallVersion(managedTarget.metadataPath, latestVersion);

    spawn(currentExe, process.argv.slice(1), {
      detached: true,
      stdio: 'inherit',
    });
    setImmediate(() => process.exit(0));
    return { checked: true, updated: true };
  } catch (error) {
    console.log(`  更新检查失败: ${(error as Error).message}`);
    deps.logError(error as Error, 'self-update');
    return { checked: false, updated: false, error: deps.getUserFriendlyMessage(error) };
  }
}
