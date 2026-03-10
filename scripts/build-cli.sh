#!/bin/bash

# ========================================
# 龙虾助手 - CLI + Web 界面打包脚本
# ========================================

set -e

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}🦞 龙虾助手 - 打包发布版${NC}"
echo "================================"
echo ""

# 进入 CLI 目录
cd "$(dirname "$0")/../apps/cli"

# 清理
echo -e "${YELLOW}🧹 清理旧文件...${NC}"
rm -rf dist bin
mkdir -p bin

# 安装依赖
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 安装依赖...${NC}"
    npm install
fi

# 编译
echo -e "${YELLOW}🔨 编译 TypeScript...${NC}"
npm run build

# 打包
echo ""
echo -e "${YELLOW}📦 打包二进制文件...${NC}"
echo ""

# macOS ARM64
echo -e "  ${CYAN}[1/6]${NC} macOS ARM64 (M1/M2/M3)..."
npx @yao-pkg/pkg dist/index.js --targets node22-macos-arm64 --output bin/lobster-macos-arm64 2>/dev/null

# macOS Intel
echo -e "  ${CYAN}[2/6]${NC} macOS Intel..."
npx @yao-pkg/pkg dist/index.js --targets node22-macos-x64 --output bin/lobster-macos-x64 2>/dev/null

# 生成 macOS .app zip
VERSION=$(node -p "require('./package.json').version")
echo -e "  ${CYAN}[3/6]${NC} 生成 macOS App Bundle..."
../../scripts/build-macos-app.sh bin/lobster-macos-arm64 bin/lobster-macos-arm64-app.zip "${VERSION}"
../../scripts/build-macos-app.sh bin/lobster-macos-x64 bin/lobster-macos-x64-app.zip "${VERSION}"

# Windows
echo -e "  ${CYAN}[4/6]${NC} Windows x64..."
npx @yao-pkg/pkg dist/index.js --targets node22-win-x64 --output bin/lobster-win-x64.exe 2>/dev/null

# Linux
echo -e "  ${CYAN}[5/6]${NC} Linux x64..."
npx @yao-pkg/pkg dist/index.js --targets node22-linux-x64 --output bin/lobster-linux-x64 2>/dev/null

echo ""
echo -e "${GREEN}✅ 打包完成！${NC}"
echo ""
echo -e "${CYAN}📁 输出文件:${NC}"
echo "----------------------------------------"
ls -lh bin/
echo "----------------------------------------"
echo ""

TOTAL=$(du -sh bin/ | cut -f1)
echo -e "${CYAN}📊 总大小: ${TOTAL}${NC}"
echo ""
echo -e "${CYAN}📋 用户使用流程:${NC}"
echo ""
echo "  1. macOS 用户优先下载 *-app.zip"
echo "  2. 解压后双击 Lobster Assistant.app"
echo "  3. Windows 用户双击 lobster-win-x64.exe"
echo "  4. Linux 用户 chmod +x lobster-linux-x64 后运行"
echo "  5. 自动打开浏览器 → 图形界面操作"
echo ""
