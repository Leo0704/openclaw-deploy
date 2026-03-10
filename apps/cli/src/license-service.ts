const os = require('os') as typeof import('os');
const nodeCrypto = require('crypto') as typeof import('crypto');

const {
  Errors,
  getUserFriendlyMessage,
  logError,
} = require('./error-utils') as typeof import('./error-utils');

const {
  fetchWithRetry,
} = require('./network-utils') as typeof import('./network-utils');

const {
  saveConfig,
} = require('./lobster-config') as typeof import('./lobster-config');

const DEFAULT_LICENSE_SERVER_URL =
  process.env.LOBSTER_LICENSE_SERVER_URL ||
  'https://license-api-lobster-license-qaqgawotfd.cn-hangzhou.fcapp.run';
const DEFAULT_PURCHASE_URL =
  process.env.LOBSTER_PURCHASE_URL ||
  'https://m.tb.cn/h.iW33Qi7?tk=MPQHUv32tQo%20CZ193';
const PRODUCT_ID = 'lobster-assistant-desktop';

function getLicenseServerUrl(config: Record<string, unknown>): string {
  const configuredUrl = (config.licenseServerUrl || '').toString().trim();
  const baseUrl = configuredUrl || DEFAULT_LICENSE_SERVER_URL;
  return baseUrl.replace(/\/+$/, '');
}

function getPurchaseUrl(config: Record<string, unknown>): string {
  const configuredUrl = String(config.purchaseUrl || '').trim();
  const baseUrl = configuredUrl || DEFAULT_PURCHASE_URL;
  return baseUrl.replace(/\/+$/, '');
}

function normalizeActivationCode(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function generateDeviceFingerprint(): string {
  const interfaces = os.networkInterfaces();
  const macAddresses = Object.values(interfaces)
    .flatMap((items) => items || [])
    .filter((item) => !item.internal && item.mac && item.mac !== '00:00:00:00:00:00')
    .map((item) => item.mac)
    .sort()
    .join('|');

  const fingerprintSource = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.machine?.() || '',
    macAddresses,
  ].join('::');

  return nodeCrypto.createHash('sha256').update(fingerprintSource).digest('hex');
}

async function activateLicense(code: string, config: Record<string, unknown>): Promise<Record<string, unknown>> {
  const normalizedCode = normalizeActivationCode(code);
  const compactCode = normalizedCode.replace(/[^A-Z0-9]/g, '');

  if (!compactCode || compactCode.length < 16) {
    return {
      success: false,
      error: getUserFriendlyMessage(Errors.validation('激活码格式不正确，请检查后重试', 'code')),
    };
  }

  const licenseServerUrl = getLicenseServerUrl(config);
  const deviceFingerprint = generateDeviceFingerprint();
  const deviceName = os.hostname();

  const result = await fetchWithRetry<{
    success?: boolean;
    message?: string;
    license?: {
      activationCode?: string;
      activatedAt?: string;
    };
  }>(
    `${licenseServerUrl}/activate`,
    {
      method: 'POST',
      body: {
        code: normalizedCode,
        deviceFingerprint,
        deviceName,
        productId: PRODUCT_ID,
      },
      headers: {
        'User-Agent': 'Lobster-Assistant',
      },
    },
    {
      timeout: 15000,
      maxRetries: 2,
    }
  );

  if (!result.success) {
    const error = result.error || Errors.activationFailed('激活服务不可用，请稍后重试');
    logError(error, 'license-activate');
    return { success: false, error: getUserFriendlyMessage(error) };
  }

  if (!result.data?.success) {
    const error = Errors.activationFailed(result.data?.message || '激活失败');
    return { success: false, error: getUserFriendlyMessage(error) };
  }

  config.activated = true;
  config.activationCode = result.data.license?.activationCode || normalizedCode;
  config.activatedAt = result.data.license?.activatedAt || new Date().toISOString();
  config.deviceName = deviceName;
  config.deviceFingerprint = deviceFingerprint;
  config.licenseServerUrl = licenseServerUrl;
  saveConfig(config);

  return { success: true, config };
}

async function verifyLicenseStatus(config: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!config.activated || !config.activationCode) {
    return {
      success: true,
      license: {
        activated: false,
        activationCode: null,
        deviceName: null,
        activatedAt: null,
        valid: false,
      },
    };
  }

  const deviceFingerprint = (config.deviceFingerprint as string) || generateDeviceFingerprint();
  const licenseServerUrl = getLicenseServerUrl(config);
  const code = normalizeActivationCode(config.activationCode);

  const result = await fetchWithRetry<{ valid?: boolean; message?: string }>(
    `${licenseServerUrl}/verify`,
    {
      method: 'POST',
      body: {
        code,
        deviceFingerprint,
        productId: PRODUCT_ID,
      },
      headers: {
        'User-Agent': 'Lobster-Assistant',
      },
    },
    {
      timeout: 10000,
      maxRetries: 1,
    }
  );

  const valid = !!result.success && !!result.data?.valid;
  if (!valid && result.error) {
    logError(result.error, 'license-verify');
  }

  if (!valid && result.success) {
    config.activated = false;
    saveConfig(config);
  }

  return {
    success: true,
    license: {
      activated: !!config.activated,
      activationCode: config.activationCode || null,
      deviceName: config.deviceName || null,
      activatedAt: config.activatedAt || null,
      valid,
      message: result.data?.message || (valid ? '授权有效' : '授权无效'),
    },
  };
}

export {
  activateLicense,
  verifyLicenseStatus,
  getLicenseServerUrl,
  getPurchaseUrl,
};
