/**
 * 代理配置读取
 */

import { getPlatformAdapter } from '../index';

export interface ProxyConfig {
  httpProxy?: string;
  httpsProxy?: string;
  noProxy?: string;
  systemSource?: string;
}

export function getProxyConfig(): ProxyConfig {
  const adapter = getPlatformAdapter();
  const settings = adapter.getProxySettings();

  const config: ProxyConfig = {
    systemSource: settings.systemSource,
  };

  for (const key of settings.envKeys) {
    const value = process.env[key];
    if (value) {
      if (key.toLowerCase().includes('https')) {
        config.httpsProxy = value;
      } else if (key.toLowerCase().includes('http')) {
        config.httpProxy = value;
      }
    }
  }

  return config;
}
