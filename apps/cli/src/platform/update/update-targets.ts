/**
 * 自更新目标路径
 */

import * as os from 'os';
import * as path from 'path';

export interface UpdateTargetPaths {
  installRoot: string;
  targetExecPath: string;
  metadataPath: string;
}

/**
 * 获取自更新目标路径（平台相关）
 */
export function getManagedSelfInstallTarget(): UpdateTargetPaths {
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
