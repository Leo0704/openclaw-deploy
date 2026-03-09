#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fail(message) {
  console.error(`[release-version] ${message}`);
  process.exit(1);
}

const rootPackagePath = path.join(repoRoot, 'package.json');
const cliPackagePath = path.join(repoRoot, 'apps', 'cli', 'package.json');
const cliIndexPath = path.join(repoRoot, 'apps', 'cli', 'src', 'index.ts');

const rootVersion = String(readJson(rootPackagePath).version || '').trim();
const cliVersion = String(readJson(cliPackagePath).version || '').trim();
const cliIndexSource = fs.readFileSync(cliIndexPath, 'utf8');
const cliVersionMatch = cliIndexSource.match(/const VERSION = '([^']+)'/);
const cliSourceVersion = cliVersionMatch ? cliVersionMatch[1].trim() : '';

if (!rootVersion || !cliVersion || !cliSourceVersion) {
  fail('无法读取完整版本信息，请检查 package.json 和 apps/cli/src/index.ts');
}

if (rootVersion !== cliVersion || cliVersion !== cliSourceVersion) {
  fail(
    `版本不一致: root=${rootVersion}, apps/cli/package.json=${cliVersion}, apps/cli/src/index.ts=${cliSourceVersion}`
  );
}

const rawTag = String(process.argv[2] || process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME || '').trim();
if (!rawTag) {
  console.log(`[release-version] 版本一致: ${rootVersion}`);
  process.exit(0);
}

const normalizedTag = rawTag.startsWith('v') ? rawTag.slice(1) : rawTag;
if (normalizedTag !== rootVersion) {
  fail(`tag 版本与代码版本不一致: tag=${rawTag}, code=${rootVersion}`);
}

console.log(`[release-version] 校验通过: tag=${rawTag}, version=${rootVersion}`);
