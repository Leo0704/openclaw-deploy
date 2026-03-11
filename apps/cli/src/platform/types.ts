/**
 * 平台适配器接口
 * 所有平台差异必须通过这个接口暴露给核心层
 */

export type PlatformId = 'windows' | 'macos' | 'linux';

export interface PlatformAdapter {
  id: PlatformId;

  // ============ 路径相关 ============
  /**
   * 获取默认安装路径
   */
  getDefaultInstallPath(): string;

  /**
   * 路径归一化（处理 Windows 反斜杠、大小写等）
   */
  normalizeProjectPath(projectPath: string): string;

  /**
   * 验证安装路径是否合法
   */
  validateInstallPath(projectPath: string): { valid: boolean; error?: string };

  // ============ 浏览器打开 ============
  /**
   * 获取打开浏览器的命令
   */
  getBrowserOpenCommand(url: string): { file: string; args: string[] } | null;

  // ============ 依赖安装 ============
  /**
   * 获取依赖安装方案（git、pnpm 等）
   */
  getDependencyInstallPlan(name: 'git' | 'pnpm' | 'corepack'): { command: string; manual: string } | null;

  /**
   * 获取解压方案
   */
  getArchiveExtractPlan(format: 'zip' | 'tar.gz'): { file: string; args: string[] } | null;

  // ============ 自更新 ============
  /**
   * 获取自更新目标路径
   */
  getManagedSelfInstallTarget(execPath: string): {
    installRoot: string;
    targetExecPath: string;
    metadataPath: string;
  };

  // ============ 存储路径 ============
  /**
   * 获取应用存储路径（配置、日志、缓存等）
   */
  getStoragePaths(appName: string): {
    configDir: string;
    cacheDir: string;
    dataDir: string;
    logDir: string;
    tempDir: string;
  };

  // ============ 密钥存储 ============
  /**
   * 获取密钥存储方案
   */
  getSecretStore(): {
    kind: 'keychain' | 'credential-manager' | 'file';
    basePath?: string;
  };

  // ============ 网络与代理 ============
  /**
   * 获取代理设置
   */
  getProxySettings(): {
    envKeys: string[];
    systemSource?: string;
  };

  // ============ 自启动 ============
  /**
   * 获取自启动策略
   */
  getAutostartStrategy(): {
    kind: 'launchd' | 'task-scheduler' | 'systemd' | 'none';
  };

  // ============ 诊断与崩溃采集 ============
  /**
   * 采集崩溃上下文
   */
  collectCrashContext(): Record<string, unknown>;

  // ============ 发布资产 ============
  /**
   * 获取发布资产名称
   */
  getReleaseAssetNames(): {
    binary: string;
    offlineBundle?: string;
  };
}

/**
 * 平台适配器工厂
 */
export interface PlatformAdapterFactory {
  createPlatformAdapter(): PlatformAdapter;
}
