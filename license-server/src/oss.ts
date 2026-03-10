import OSS from 'ali-oss';
import { LicenseData, LicenseCode } from './types';

// 从环境变量读取配置
const OSS_REGION = process.env.OSS_REGION || 'oss-cn-hangzhou';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const OSS_BUCKET = requireEnv('OSS_BUCKET');
const OSS_ACCESS_KEY_ID = requireEnv('OSS_ACCESS_KEY_ID');
const OSS_ACCESS_KEY_SECRET = requireEnv('OSS_ACCESS_KEY_SECRET');
const OSS_FILE_KEY = 'license/codes.json';

let ossClient: any = null;
const ACTIVATION_MAX_RETRIES = 3;

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function extractEtag(result: any): string | null {
  return result?.res?.headers?.etag || result?.headers?.etag || null;
}

function isConditionalWriteConflict(error: any): boolean {
  return error?.status === 412 || error?.code === 'PreconditionFailed';
}

/**
 * 获取 OSS 客户端
 */
function getOSSClient(): any {
  if (!ossClient) {
    ossClient = new OSS({
      region: OSS_REGION,
      bucket: OSS_BUCKET,
      accessKeyId: OSS_ACCESS_KEY_ID,
      accessKeySecret: OSS_ACCESS_KEY_SECRET,
    });
  }
  return ossClient;
}

/**
 * 读取激活码数据
 */
export async function readLicenseData(): Promise<LicenseData> {
  const document = await readLicenseDocument();
  return document.data;
}

async function readLicenseDocument(): Promise<{ data: LicenseData; etag: string | null }> {
  const client = getOSSClient();

  try {
    const result = await client.get(OSS_FILE_KEY);
    const content = result.content.toString('utf-8');
    return {
      data: JSON.parse(content),
      etag: extractEtag(result),
    };
  } catch (error: any) {
    // 文件不存在，返回空数据
    if (error.code === 'NoSuchKey') {
      return {
        data: {
          codes: [],
          updatedAt: new Date().toISOString(),
        },
        etag: null,
      };
    }
    console.error('[OSS] 读取授权数据失败:', {
      code: error.code,
      message: error.message,
      fileKey: OSS_FILE_KEY,
    });
    throw error;
  }
}

/**
 * 写入激活码数据
 */
export async function writeLicenseData(data: LicenseData): Promise<void> {
  await writeLicenseDataWithConditions(data);
}

async function writeLicenseDataWithConditions(data: LicenseData, ifMatch?: string | null): Promise<void> {
  const client = getOSSClient();

  data.updatedAt = new Date().toISOString();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ifMatch) {
    headers['If-Match'] = ifMatch;
  } else {
    // File did not exist at read time; prevent overwriting if created concurrently
    headers['If-None-Match'] = '*';
  }

  await client.put(OSS_FILE_KEY, Buffer.from(JSON.stringify(data, null, 2)), { headers });
}

/**
 * 查找激活码
 */
export async function findCode(code: string): Promise<LicenseCode | null> {
  const data = await readLicenseData();
  const normalized = normalizeCode(code);
  return data.codes.find(c => normalizeCode(c.code) === normalized) || null;
}

export async function activateCode(
  code: string,
  deviceFingerprint: string,
  deviceName: string
): Promise<
  | { status: 'not_found' }
  | { status: 'already_used_same_device'; licenseCode: LicenseCode }
  | { status: 'already_used_other_device'; licenseCode: LicenseCode }
  | { status: 'activated'; licenseCode: LicenseCode }
> {
  const normalized = normalizeCode(code);

  for (let attempt = 0; attempt < ACTIVATION_MAX_RETRIES; attempt++) {
    const document = await readLicenseDocument();
    const index = document.data.codes.findIndex(entry => normalizeCode(entry.code) === normalized);

    if (index === -1) {
      return { status: 'not_found' };
    }

    const licenseCode = document.data.codes[index];
    if (licenseCode.status === 'used') {
      if (licenseCode.deviceFingerprint === deviceFingerprint) {
        return { status: 'already_used_same_device', licenseCode };
      }
      return { status: 'already_used_other_device', licenseCode };
    }

    const activatedCode: LicenseCode = {
      ...licenseCode,
      status: 'used',
      deviceFingerprint,
      deviceName,
      activatedAt: new Date().toISOString(),
    };
    document.data.codes[index] = activatedCode;

    try {
      await writeLicenseDataWithConditions(document.data, document.etag);
      return { status: 'activated', licenseCode: activatedCode };
    } catch (error: any) {
      if (isConditionalWriteConflict(error)) {
        continue;
      }
      throw error;
    }
  }

  const latestCode = await findCode(code);
  if (!latestCode) {
    return { status: 'not_found' };
  }
  if (latestCode.status === 'used' && latestCode.deviceFingerprint === deviceFingerprint) {
    return { status: 'already_used_same_device', licenseCode: latestCode };
  }
  if (latestCode.status === 'unused') {
    // Write conflicts exhausted before we could activate; let the caller retry
    throw new Error('激活写入冲突超过最大重试次数，请稍后重试');
  }
  return { status: 'already_used_other_device', licenseCode: latestCode };
}
