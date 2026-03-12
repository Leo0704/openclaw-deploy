#!/bin/bash
# OpenClaw 离线包构建脚本
# 用法: ./build-bundle.sh [版本号] [平台]
# 示例: ./build-bundle.sh 2026.3.8 win-x64

set -e

# 配置
OPENCLAW_REPO="https://github.com/openclaw/openclaw.git"
NODE_VERSION="22.12.0"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}/output"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 解析参数
VERSION="${1:-2026.3.8}"
PLATFORM="${2:-}"

# 检测当前平台
detect_platform() {
    local os=$(uname -s | tr '[:upper:]' '[:lower:]')
    local arch=$(uname -m)

    case "$os" in
        darwin)
            if [ "$arch" = "arm64" ]; then
                echo "macos-arm64"
            else
                echo "macos-x64"
            fi
            ;;
        linux)
            echo "linux-x64"
            ;;
        mingw*|msys*|cygwin*)
            echo "win-x64"
            ;;
        *)
            log_error "不支持的系统: $os"
            exit 1
            ;;
    esac
}

if [ -z "$PLATFORM" ]; then
    PLATFORM=$(detect_platform)
    log_info "自动检测平台: $PLATFORM"
fi

# 平台相关配置
get_node_archive() {
    local platform=$1
    case "$platform" in
        win-x64)
            echo "node-v${NODE_VERSION}-win-x64.zip"
            ;;
        macos-arm64)
            echo "node-v${NODE_VERSION}-darwin-arm64.tar.gz"
            ;;
        macos-x64)
            echo "node-v${NODE_VERSION}-darwin-x64.tar.gz"
            ;;
        linux-x64)
            echo "node-v${NODE_VERSION}-linux-x64.tar.gz"
            ;;
        *)
            log_error "未知平台: $platform"
            exit 1
            ;;
    esac
}

get_node_download_url() {
    local platform=$1
    local archive=$(get_node_archive "$platform")
    echo "https://nodejs.org/dist/v${NODE_VERSION}/${archive}"
}

get_output_ext() {
    local platform=$1
    case "$platform" in
        win-x64) echo "zip" ;;
        *) echo "tar.gz" ;;
    esac
}

# 主流程
main() {
    local node_archive=$(get_node_archive "$PLATFORM")
    local node_url=$(get_node_download_url "$PLATFORM")
    local output_ext=$(get_output_ext "$PLATFORM")
    local output_name="openclaw-${PLATFORM}-${VERSION}"
    local work_dir="${SCRIPT_DIR}/build-${PLATFORM}"

    log_info "=========================================="
    log_info "构建 OpenClaw 离线包"
    log_info "=========================================="
    log_info "版本: ${VERSION}"
    log_info "平台: ${PLATFORM}"
    log_info "Node.js: ${NODE_VERSION}"
    log_info "=========================================="

    # 创建工作目录
    log_info "创建工作目录..."
    rm -rf "${work_dir}"
    mkdir -p "${work_dir}"
    mkdir -p "${OUTPUT_DIR}"

    # 步骤1: 克隆 OpenClaw
    log_info "步骤 1/5: 克隆 OpenClaw 源码..."
    if [ ! -d "${work_dir}/openclaw" ]; then
        git clone --depth 1 --branch "v${VERSION}" "${OPENCLAW_REPO}" "${work_dir}/openclaw" || {
            log_warn "指定版本克隆失败，尝试默认分支..."
            git clone --depth 1 "${OPENCLAW_REPO}" "${work_dir}/openclaw"
        }
    fi

    # 步骤2: 安装依赖
    log_info "步骤 2/5: 安装依赖..."
    cd "${work_dir}/openclaw"

    # 检查 pnpm
    if ! command -v pnpm &> /dev/null; then
        log_info "安装 pnpm..."
        npm install -g pnpm@10
    fi

    log_info "执行 pnpm install..."
    pnpm install --frozen-lockfile || pnpm install

    # 步骤3: 构建
    log_info "步骤 3/5: 构建 OpenClaw..."
    pnpm build

    # 步骤4: 下载 Node.js
    log_info "步骤 4/5: 下载 Node.js 运行时..."
    cd "${work_dir}"
    if [ ! -f "${node_archive}" ]; then
        curl -L -o "${node_archive}" "${node_url}" || {
            log_error "Node.js 下载失败"
            exit 1
        }
    else
        log_info "Node.js 已存在，跳过下载"
    fi

    # 解压 Node.js
    log_info "解压 Node.js..."
    mkdir -p "${work_dir}/bundle/node"
    case "$PLATFORM" in
        win-x64)
            if command -v unzip &> /dev/null; then
                unzip -q "${node_archive}" -d "${work_dir}/node-temp"
            else
                # macOS 没有 unzip 用 ditto
                ditto -x -k "${node_archive}" "${work_dir}/node-temp"
            fi
            mv "${work_dir}/node-temp/node-v${NODE_VERSION}-win-x64/"* "${work_dir}/bundle/node/"
            rm -rf "${work_dir}/node-temp"
            ;;
        *)
            tar -xzf "${node_archive}" -C "${work_dir}"
            mv "${work_dir}/node-v${NODE_VERSION}-"*/* "${work_dir}/bundle/node/"
            ;;
    esac

    # 复制 OpenClaw
    log_info "组装离线包..."
    cp -r "${work_dir}/openclaw" "${work_dir}/bundle/openclaw"

    # 创建启动脚本
    create_start_script "${work_dir}/bundle" "$PLATFORM"

    # 创建版本信息
    create_version_file "${work_dir}/bundle" "$VERSION" "$PLATFORM" "$NODE_VERSION"

    # 步骤5: 打包
    log_info "步骤 5/5: 打包..."
    cd "${work_dir}/bundle"

    case "$output_ext" in
        zip)
            if command -v zip &> /dev/null; then
                zip -r "${OUTPUT_DIR}/${output_name}.zip" .
            else
                ditto -c -k --sequesterRsrc --keepParent . "${OUTPUT_DIR}/${output_name}.zip"
            fi
            ;;
        tar.gz)
            tar -czvf "${OUTPUT_DIR}/${output_name}.tar.gz" .
            ;;
    esac

    # 清理
    log_info "清理临时文件..."
    cd "${SCRIPT_DIR}"
    rm -rf "${work_dir}"

    # 完成
    local output_file="${OUTPUT_DIR}/${output_name}.${output_ext}"
    local size=$(ls -lh "$output_file" | awk '{print $5}')
    log_info "=========================================="
    log_info "构建完成!"
    log_info "=========================================="
    log_info "文件: ${output_file}"
    log_info "大小: ${size}"
    log_info "=========================================="
}

# 创建启动脚本
create_start_script() {
    local bundle_dir=$1
    local platform=$2

    if [ "$platform" = "win-x64" ]; then
        cat > "${bundle_dir}/start.bat" << 'EOF'
@echo off
chcp 65001 >nul
setlocal
set "SCRIPT_DIR=%~dp0"
set "NODE_PATH=%SCRIPT_DIR%node"
set "PATH=%NODE_PATH%;%PATH%"
cd /d "%SCRIPT_DIR%openclaw"
echo Starting OpenClaw...
"%SCRIPT_DIR%node\node.exe" openclaw.mjs %*
EOF
    else
        cat > "${bundle_dir}/start.sh" << 'EOF'
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH="$SCRIPT_DIR/node/bin:$PATH"
cd "$SCRIPT_DIR/openclaw"
echo "Starting OpenClaw..."
"$SCRIPT_DIR/node/bin/node" openclaw.mjs "$@"
EOF
        chmod +x "${bundle_dir}/start.sh"
    fi
}

# 创建版本文件
create_version_file() {
    local bundle_dir=$1
    local version=$2
    local platform=$3
    local node_version=$4

    cat > "${bundle_dir}/VERSION" << EOF
openclaw: ${version}
node: ${node_version}
platform: ${platform}
build_date: $(date '+%Y-%m-%d %H:%M:%S')
EOF
}

# 执行
main
