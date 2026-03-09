import { ActivateRequest, ActivateResponse, PRODUCT_ID } from './types';
import { activateCode } from './oss';

/**
 * 激活产品
 */
export async function activate(request: ActivateRequest): Promise<ActivateResponse> {
  const { code, deviceFingerprint, deviceName, productId } = request;
  if (productId !== PRODUCT_ID) {
    return {
      success: false,
      message: '产品标识无效',
    };
  }

  const activation = await activateCode(code, deviceFingerprint, deviceName);

  if (activation.status === 'not_found') {
    return {
      success: false,
      message: '激活码不存在',
    };
  }

  if (activation.status === 'already_used_same_device') {
      return {
        success: true,
        message: '该设备已激活',
        license: {
          productId,
          activationCode: code,
          activatedAt: activation.licenseCode.activatedAt!,
          expiresAt: null,
        },
      };
  }

  if (activation.status === 'already_used_other_device') {
    return {
      success: false,
      message: '激活码已被其他设备使用',
    };
  }

  return {
    success: true,
    message: '激活成功',
    license: {
      productId,
      activationCode: code,
      activatedAt: activation.licenseCode.activatedAt!,
      expiresAt: null,
    },
  };
}
