import { ActivateRequest, ActivateResponse } from './types';
import { findCode, updateCode } from './oss';

/**
 * 激活产品
 */
export async function activate(request: ActivateRequest): Promise<ActivateResponse> {
  const { code, deviceFingerprint, deviceName, productId } = request;

  // 查找激活码
  const licenseCode = await findCode(code);

  if (!licenseCode) {
    return {
      success: false,
      message: '激活码不存在',
    };
  }

  // 检查是否已使用
  if (licenseCode.status === 'used') {
    // 检查是否是同一设备
    if (licenseCode.deviceFingerprint === deviceFingerprint) {
      return {
        success: true,
        message: '该设备已激活',
        license: {
          productId,
          activationCode: code,
          activatedAt: licenseCode.activatedAt!,
          expiresAt: null,
        },
      };
    }

    return {
      success: false,
      message: '激活码已被其他设备使用',
    };
  }

  // 激活码有效，绑定设备
  const now = new Date().toISOString();
  const updated = await updateCode(code, {
    status: 'used',
    deviceFingerprint,
    deviceName,
    activatedAt: now,
  });

  if (!updated) {
    return {
      success: false,
      message: '激活失败，请稍后重试',
    };
  }

  return {
    success: true,
    message: '激活成功',
    license: {
      productId,
      activationCode: code,
      activatedAt: now,
      expiresAt: null,
    },
  };
}
