import OSS from 'ali-oss';
import { LicenseData, LicenseCode } from './types';

// 从环境变量读取配置
const OSS_REGION = process.env.OSS_REGION || 'oss-cn-hangzhou';
const OSS_BUCKET = process.env.OSS_BUCKET || '';
const OSS_ACCESS_KEY_ID = process.env.OSS_ACCESS_KEY_ID || '';
const OSS_ACCESS_KEY_SECRET = process.env.OSS_ACCESS_KEY_SECRET || '';
const OSS_FILE_KEY = 'license/codes.json';

let ossClient: OSS | null = null;

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * 获取 OSS 客户端
 */
function getOSSClient(): OSS {
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
  const client = getOSSClient();

  try {
    const result = await client.get(OSS_FILE_KEY);
    const content = result.content.toString('utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    // 文件不存在，返回空数据
    if (error.code === 'NoSuchKey') {
      return {
        codes: [],
        updatedAt: new Date().toISOString(),
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
  const client = getOSSClient();

  data.updatedAt = new Date().toISOString();

  await client.put(OSS_FILE_KEY, Buffer.from(JSON.stringify(data, null, 2)), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * 查找激活码
 */
export async function findCode(code: string): Promise<LicenseCode | null> {
  const data = await readLicenseData();
  const normalized = normalizeCode(code);
  return data.codes.find(c => normalizeCode(c.code) === normalized) || null;
}

/**
 * 更新激活码状态
 */
export async function updateCode(code: string, updates: Partial<LicenseCode>): Promise<boolean> {
  const data = await readLicenseData();
  const normalized = normalizeCode(code);
  const index = data.codes.findIndex(c => normalizeCode(c.code) === normalized);

  if (index === -1) {
    return false;
  }

  data.codes[index] = {
    ...data.codes[index],
    ...updates,
  };

  await writeLicenseData(data);
  return true;
}
