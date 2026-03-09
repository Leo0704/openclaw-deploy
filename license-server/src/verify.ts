import { VerifyRequest, VerifyResponse } from './types';
import { findCode } from './oss';

/**
 * 验证授权
 */
export async function verify(request: VerifyRequest): Promise<VerifyResponse> {
  const { code, deviceFingerprint, productId } = request;

  // 查找激活码
  const licenseCode = await findCode(code);

  if (!licenseCode) {
    return {
      valid: false,
      message: '激活码不存在',
    };
  }

  // 检查状态
  if (licenseCode.status !== 'used') {
    return {
      valid: false,
      message: '激活码未激活',
    };
  }

  // 检查设备绑定
  if (licenseCode.deviceFingerprint !== deviceFingerprint) {
    return {
      valid: false,
      message: '设备不匹配',
    };
  }

  return {
    valid: true,
    message: '授权有效',
  };
}
