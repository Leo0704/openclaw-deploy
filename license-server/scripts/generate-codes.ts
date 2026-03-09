/**
 * 激活码生成工具
 *
 * 使用方法:
 *   npx ts-node scripts/generate-codes.ts <数量>
 *
 * 示例:
 *   npx ts-node scripts/generate-codes.ts 10
 */

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 生成单个激活码
 * 格式: LOBSTER-XXXX-XXXX-XXXX
 */
function generateCode(): string {
  const uuid = randomUUID().replace(/-/g, '').toUpperCase();
  const segments = [
    uuid.substring(0, 4),
    uuid.substring(4, 8),
    uuid.substring(8, 12),
  ];
  return `LOBSTER-${segments.join('-')}`;
}

/**
 * 批量生成激活码
 */
function generateCodes(count: number): string[] {
  const codes: Set<string> = new Set();

  while (codes.size < count) {
    codes.add(generateCode());
  }

  return Array.from(codes);
}

/**
 * 主函数
 */
function main() {
  const count = parseInt(process.argv[2]) || 10;

  console.log(`正在生成 ${count} 个激活码...\n`);

  const codes = generateCodes(count);

  // 输出到控制台
  codes.forEach(code => console.log(code));

  // 生成 JSON 文件（用于上传到 OSS）
  const outputData = {
    codes: codes.map(code => ({
      code,
      status: 'unused',
      deviceFingerprint: null,
      deviceName: null,
      activatedAt: null,
    })),
    updatedAt: new Date().toISOString(),
  };

  const outputPath = path.join(__dirname, '../codes-generated.json');
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));

  console.log(`\n已生成文件: ${outputPath}`);
  console.log('\n下一步: 将 codes-generated.json 上传到 OSS');
}

main();
