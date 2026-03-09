/**
 * 激活码数据结构
 */
export interface LicenseCode {
  /** 激活码 */
  code: string;
  /** 状态: unused-未使用, used-已使用 */
  status: 'unused' | 'used';
  /** 绑定的设备指纹 */
  deviceFingerprint: string | null;
  /** 设备名称 */
  deviceName: string | null;
  /** 激活时间 */
  activatedAt: string | null;
}

/**
 * OSS 存储的数据结构
 */
export interface LicenseData {
  codes: LicenseCode[];
  updatedAt: string;
}

/**
 * 激活请求
 */
export interface ActivateRequest {
  /** 激活码 */
  code: string;
  /** 设备指纹 */
  deviceFingerprint: string;
  /** 设备名称 */
  deviceName: string;
  /** 产品ID */
  productId: string;
}

/**
 * 激活响应
 */
export interface ActivateResponse {
  success: boolean;
  message: string;
  license?: {
    productId: string;
    activationCode: string;
    activatedAt: string;
    expiresAt: string | null;
  };
}

/**
 * 验证请求
 */
export interface VerifyRequest {
  /** 激活码 */
  code: string;
  /** 设备指纹 */
  deviceFingerprint: string;
  /** 产品ID */
  productId: string;
}

/**
 * 验证响应
 */
export interface VerifyResponse {
  valid: boolean;
  message: string;
}

/**
 * 函数计算 HTTP 触发器请求
 */
export interface FCRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
  queries: Record<string, string>;
}

/**
 * 函数计算 HTTP 触发器响应
 */
export interface FCResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}
