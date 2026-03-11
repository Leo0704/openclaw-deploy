/**
 * 密钥存储配置
 */

import { getPlatformAdapter } from '../index';

export interface SecretStoreConfig {
  kind: 'keychain' | 'credential-manager' | 'file';
  basePath?: string;
}

export function getSecretStoreConfig(): SecretStoreConfig {
  const adapter = getPlatformAdapter();
  return adapter.getSecretStore();
}
