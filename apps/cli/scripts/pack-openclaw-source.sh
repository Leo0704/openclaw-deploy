#!/bin/bash

# ========================================
# 打包 OpenClaw 源码（包含 .git 目录）
# ========================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

OPENCLAW_REPO="https://github.com/openclaw/openclaw.git"
ASSETS_DIR="$(dirname "$0")/../assets"
TEMP_DIR=$(mktemp -d)

# 清理临时目录
cleanup() {
    echo -e "${YELLOW}🧹 清理临时文件...${NC}"
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo ""
echo -e "${CYAN}📦 打包 OpenClaw 源码${NC}"
echo "================================"
echo ""

# 获取版本参数
VERSION="${1:-}"
if [ -z "$VERSION" ]; then
    echo -e "${YELLOW}从 npm 获取最新版本...${NC}"
    VERSION=$(npm view openclaw version 2>/dev/null || echo "latest")
fi

echo -e "${CYAN}版本: ${VERSION}${NC}"
echo ""

# 克隆仓库（shallow clone 以减小体积）
echo -e "${YELLOW}📥 克隆 OpenClaw 仓库...${NC}"
git clone --depth 1 --branch "$VERSION" "$OPENCLAW_REPO" "$TEMP_DIR/openclaw" 2>/dev/null || {
    # 如果 tag 不存在，尝试克隆 main 分支
    echo -e "${YELLOW}Tag $VERSION 不存在，克隆 main 分支...${NC}"
    git clone --depth 1 "$OPENCLAW_REPO" "$TEMP_DIR/openclaw"
}

cd "$TEMP_DIR/openclaw"

# ========== 新增：修改 package.json，移除需要编译/Git SSH 的依赖 ==========
echo -e "${YELLOW}🔧 修改 package.json，移除问题依赖...${NC}"
if [ -f package.json ]; then
    # 使用 node 来修改 package.json
    node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

    // 1. 从 onlyBuiltDependencies 移除 node-llama-cpp
    if (pkg.pnpm && pkg.pnpm.onlyBuiltDependencies) {
        pkg.pnpm.onlyBuiltDependencies = pkg.pnpm.onlyBuiltDependencies.filter(dep => dep !== 'node-llama-cpp');
        console.log('已从 onlyBuiltDependencies 移除 node-llama-cpp');
    }

    // 2. 从 peerDependencies 移除 node-llama-cpp
    if (pkg.peerDependencies && pkg.peerDependencies['node-llama-cpp']) {
        delete pkg.peerDependencies['node-llama-cpp'];
        console.log('已从 peerDependencies 移除 node-llama-cpp');
    }

    // 3. 将 node-llama-cpp 添加到 optionalDependencies（如果需要可选）
    if (!pkg.optionalDependencies) pkg.optionalDependencies = {};
    pkg.optionalDependencies['node-llama-cpp'] = pkg.optionalDependencies['node-llama-cpp'] || '3.16.2';
    console.log('已添加 node-llama-cpp 到 optionalDependencies');

    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
    echo -e "${GREEN}✓ package.json 修改完成${NC}"
else
    echo -e "${YELLOW}⚠ 未找到 package.json，跳过修改${NC}"
fi
# =============================================================================

# 获取版本信息
COMMIT=$(git rev-parse --short HEAD)
BRANCH=$(git branch --show-current || echo "main")
PACKED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo -e "${GREEN}✓ 克隆完成${NC}"
echo "  Commit: $COMMIT"
echo "  Branch: $BRANCH"
echo ""

# 打包（包含 .git 目录）
echo -e "${YELLOW}📦 创建归档（包含 .git 目录）...${NC}"

mkdir -p "$ASSETS_DIR"

# 创建 tar.gz（包含完整 .git 目录）
tar -czf "$ASSETS_DIR/openclaw-source.tar.gz" \
    --transform 's,^,package/,' \
    --exclude='node_modules' \
    .

# 创建 zip（Windows 兼容）
rm -rf "$TEMP_DIR/zip-package"
mkdir -p "$TEMP_DIR/zip-package/package"
cp -R . "$TEMP_DIR/zip-package/package/"
rm -rf "$TEMP_DIR/zip-package/package/node_modules"
(cd "$TEMP_DIR/zip-package" && zip -rq "$ASSETS_DIR/openclaw-source.zip" package)

# 创建版本信息文件
cat > "$ASSETS_DIR/openclaw-version.json" << EOF
{
  "version": "$VERSION",
  "commit": "$COMMIT",
  "branch": "$BRANCH",
  "source": "git",
  "packedAt": "$PACKED_AT"
}
EOF

# 显示结果
echo ""
echo -e "${GREEN}✅ 打包完成！${NC}"
echo ""
echo -e "${CYAN}📁 输出文件:${NC}"
echo "----------------------------------------"
ls -lh "$ASSETS_DIR/openclaw-source."*
ls -lh "$ASSETS_DIR/openclaw-version.json"
echo "----------------------------------------"
echo ""
echo -e "${CYAN}📋 版本信息:${NC}"
cat "$ASSETS_DIR/openclaw-version.json"
echo ""
