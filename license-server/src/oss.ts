import OSS from 'ali-oss';
import { LicenseData, LicenseCode } from './types';

// 从环境变量读取配置
const OSS_REGION = process.env.OSS_REGION || 'oss-cn-hangzhou';
const OSS_BUCKET = process.env.OSS_BUCKET || '';
const OSS_ACCESS_KEY_ID = process.env.OSS_ACCESS_KEY_ID || '';
const OSS_ACCESS_KEY_SECRET = process.env.OSS_ACCESS_KEY_SECRET || '';
const OSS_FILE_KEY = 'license/codes.json';

let ossClient: OSS | null = null;

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
  return data.codes.find(c => c.code === code) || null;
}

/**
 * 更新激活码状态
 */
export async function updateCode(code: string, updates: Partial<LicenseCode>): Promise<boolean> {
  const data = await readLicenseData();
  const index = data.codes.findIndex(c => c.code === code);

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
