/**
 * 安装策略模块
 */

// 网络探测结果（启动时设置）
let cachedGithubDirectConnected: boolean | undefined = undefined;

/**
 * 设置 GitHub 直连状态（由 app/index.ts 启动时调用）
 */
export function setGithubDirectConnected(connected: boolean): void {
  cachedGithubDirectConnected = connected;
}

/**
 * 获取 GitHub 直连状态
 */
export function getGithubDirectConnected(): boolean | undefined {
  return cachedGithubDirectConnected;
}

export { getInstallPlan } from './install-plan';
export {
  NPM_MIRROR_REGISTRY,
  NPM_OFFICIAL_REGISTRY,
  buildRegistryMirrorEnv,
  buildRegistryEnv,
  getRecommendedNpmRegistry,
  getPackageInstallAttempts,
  ensureDependencyInstalled,
  applyWindowsNativePatch,
  type NativePatchResult,
  type PackageInstallAttempt,
} from './platform-install-service';
