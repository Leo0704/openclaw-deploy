#!/bin/bash
# 一键构建所有平台的离线包
# 用法: ./build-all-platforms.sh [版本号]

set -e

VERSION="${1:-2026.3.8}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=========================================="
echo "构建所有平台的 OpenClaw 离线包"
echo "版本: ${VERSION}"
echo "=========================================="

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "[ERROR] 需要 Docker 来构建跨平台包"
    echo "请安装 Docker 后重试"
    exit 1
fi

# 构建函数
build_platform() {
    local platform=$1
    local docker_image=$2

    echo ""
    echo "=========================================="
    echo "构建平台: ${platform}"
    echo "=========================================="

    docker run --rm \
        -v "${SCRIPT_DIR}:/work" \
        -w /work \
        "${docker_image}" \
        bash -c "
            apt-get update && apt-get install -y git curl zip unzip &&
            curl -fsSL https://deb.nodesource.com/setup_22.x | bash - &&
            apt-get install -y nodejs &&
            npm install -g pnpm@10 &&
            chmod +x build-bundle.sh &&
            ./build-bundle.sh ${VERSION} ${platform}
        "
}

# 构建各平台
# 注意：macOS 需要在 macOS 机器上构建

# Linux x64
build_platform "linux-x64" "ubuntu:22.04"

# Windows x64 (在 Linux 上交叉编译 Windows 包有问题，建议在 Windows 机器上构建)
echo ""
echo "[INFO] Windows 包需要在 Windows 机器上运行 build-bundle.bat 构建"
echo "[INFO] macOS 包需要在 macOS 机器上构建"

echo ""
echo "=========================================="
echo "构建完成！"
echo "=========================================="
ls -lh "${SCRIPT_DIR}/output/"
