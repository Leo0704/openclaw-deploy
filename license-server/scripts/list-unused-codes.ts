import * as fs from 'fs';
import * as path from 'path';

interface LicenseCode {
  code: string;
  status: 'unused' | 'used';
  deviceFingerprint: string | null;
  deviceName: string | null;
  activatedAt: string | null;
}

interface LicenseData {
  codes: LicenseCode[];
  updatedAt: string;
}

function resolveInputPath(customPath?: string): string {
  if (customPath) {
    return path.resolve(process.cwd(), customPath);
  }

  const defaultPaths = [
    path.join(__dirname, '../codes.json'),
    path.join(__dirname, '../codes-generated.json'),
  ];

  const found = defaultPaths.find((filePath) => fs.existsSync(filePath));
  if (!found) {
    throw new Error('未找到 codes.json 或 codes-generated.json');
  }

  return found;
}

function main() {
  const limitArg = process.argv[2];
  const fileArg = process.argv[3];
  const limit = limitArg ? parseInt(limitArg, 10) : 20;
  const inputPath = resolveInputPath(fileArg);

  if (Number.isNaN(limit) || limit <= 0) {
    throw new Error('数量必须是大于 0 的数字');
  }

  const raw = fs.readFileSync(inputPath, 'utf-8');
  const data = JSON.parse(raw) as LicenseData;
  const unusedCodes = data.codes.filter((item) => item.status === 'unused');
  const selected = unusedCodes.slice(0, limit);

  console.log(`文件: ${inputPath}`);
  console.log(`总激活码数: ${data.codes.length}`);
  console.log(`未使用数量: ${unusedCodes.length}`);
  console.log(`显示前 ${selected.length} 个:\n`);

  selected.forEach((item, index) => {
    console.log(`${index + 1}. ${item.code}`);
  });
}

main();
