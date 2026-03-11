/**
 * 存储模块
 */

export { getAppStoragePaths } from './storage-paths';

// OpenClaw 配置和状态路径
export {
  getOpenClawConfigPath,
  getManagedOpenClawConfigPath,
  getManagedOpenClawStateDir,
  getManagedOpenClawSkillsDir,
} from './storage-paths';

// OpenClaw 配置读写
export {
  readManagedOpenClawConfig,
  readOpenClawRuntimeConfig,
  writeManagedOpenClawConfig,
} from './storage-paths';

// OpenClaw 配置工具
export {
  mergeOpenClawConfigSections,
  resolveOpenClawWorkspaceDir,
} from './storage-paths';
