#!/bin/bash

# ============================================
# OpenClaw 一键部署脚本
# ============================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 默认配置
OPENCLAW_DIR="/Users/lylyyds/Desktop/openclaw"
CONFIG_DIR="$HOME/.openclaw"
ENV_FILE="$CONFIG_DIR/.env"
GATEWAY_PORT=18789

# 打印带颜色的消息
print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_header() { echo -e "${CYAN}$1${NC}"; }

# 显示 Logo
show_logo() {
    clear
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                                                           ║"
    echo "║     🦞  OpenClaw 一键部署脚本  🦞                        ║"
    echo "║                                                           ║"
    echo "║     Personal AI Assistant - 自动化部署工具               ║"
    echo "║                                                           ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
}

# 检查 Node.js 版本
check_node() {
    print_info "检查 Node.js 版本..."

    if ! command -v node &> /dev/null; then
        print_error "未安装 Node.js，请先安装 Node.js 22 或更高版本"
        print_info "推荐使用 nvm 安装: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
        exit 1
    fi

    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 22 ]; then
        print_error "Node.js 版本过低 (当前: $(node -v))，需要 22 或更高版本"
        print_info "请升级 Node.js: nvm install 22 && nvm use 22"
        exit 1
    fi

    print_success "Node.js 版本: $(node -v) ✓"
}

# 检查 pnpm
check_pnpm() {
    print_info "检查 pnpm..."

    if ! command -v pnpm &> /dev/null; then
        print_warning "未安装 pnpm，正在安装..."
        npm install -g pnpm
        print_success "pnpm 安装完成 ✓"
    else
        print_success "pnpm 已安装: $(pnpm -v) ✓"
    fi
}

# 检查 OpenClaw 源码目录
check_source() {
    print_info "检查 OpenClaw 源码..."

    if [ ! -d "$OPENCLAW_DIR" ]; then
        print_error "OpenClaw 源码目录不存在: $OPENCLAW_DIR"
        exit 1
    fi

    if [ ! -f "$OPENCLAW_DIR/package.json" ]; then
        print_error "package.json 不存在，请确认源码目录正确"
        exit 1
    fi

    print_success "OpenClaw 源码目录存在 ✓"
}

# 选择 API 提供商
select_provider() {
    echo ""
    print_header "═══════════════════════════════════════════════════════════"
    print_header "              请选择 AI 模型提供商"
    print_header "═══════════════════════════════════════════════════════════"
    echo ""
    echo "  1) Anthropic (Claude)"
    echo "  2) OpenAI (GPT)"
    echo "  3) Google (Gemini)"
    echo "  4) OpenRouter (多模型)"
    echo "  5) 自定义 API (兼容 OpenAI 格式)"
    echo ""
    read -p "请输入选项 [1-5]: " provider_choice

    case $provider_choice in
        1)
            PROVIDER="anthropic"
            PROVIDER_NAME="Anthropic (Claude)"
            ENV_KEY="ANTHROPIC_API_KEY"
            ;;
        2)
            PROVIDER="openai"
            PROVIDER_NAME="OpenAI (GPT)"
            ENV_KEY="OPENAI_API_KEY"
            ;;
        3)
            PROVIDER="gemini"
            PROVIDER_NAME="Google (Gemini)"
            ENV_KEY="GEMINI_API_KEY"
            ;;
        4)
            PROVIDER="openrouter"
            PROVIDER_NAME="OpenRouter"
            ENV_KEY="OPENROUTER_API_KEY"
            ;;
        5)
            PROVIDER="custom"
            PROVIDER_NAME="自定义 API"
            ENV_KEY="CUSTOM_API_KEY"
            ;;
        *)
            print_error "无效选项"
            exit 1
            ;;
    esac

    print_success "已选择: $PROVIDER_NAME"
}

# 获取 API 密钥
get_api_key() {
    echo ""
    print_header "═══════════════════════════════════════════════════════════"
    print_header "              请输入 API 配置"
    print_header "═══════════════════════════════════════════════════════════"
    echo ""

    # 输入 API 密钥
    read -p "请输入 $PROVIDER_NAME API 密钥: " api_key

    if [ -z "$api_key" ]; then
        print_error "API 密钥不能为空"
        exit 1
    fi

    API_KEY="$api_key"
    print_success "API 密钥已设置 ✓"

    # 如果是自定义 API，需要输入 Base URL
    if [ "$PROVIDER" = "custom" ]; then
        echo ""
        read -p "请输入 API Base URL (例如: https://api.example.com/v1): " base_url
        if [ -z "$base_url" ]; then
            print_error "Base URL 不能为空"
            exit 1
        fi
        CUSTOM_BASE_URL="$base_url"
        print_success "API Base URL 已设置 ✓"

        echo ""
        read -p "请输入模型名称 (例如: gpt-4, claude-3-opus): " model_name
        if [ -z "$model_name" ]; then
            print_error "模型名称不能为空"
            exit 1
        fi
        MODEL_NAME="$model_name"
        print_success "模型名称已设置 ✓"
    fi

    # 输入 Gateway Token
    echo ""
    print_info "设置 Gateway 访问令牌（用于保护 Web 界面）"
    read -p "请输入令牌 (留空自动生成): " gateway_token

    if [ -z "$gateway_token" ]; then
        gateway_token=$(openssl rand -hex 32)
        print_info "已自动生成安全令牌"
    fi

    GATEWAY_TOKEN="$gateway_token"
    print_success "Gateway 令牌已设置 ✓"
}

# 创建配置目录和文件
create_config() {
    print_info "创建配置文件..."

    # 创建配置目录
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$CONFIG_DIR/workspace"

    # 生成 .env 文件
    cat > "$ENV_FILE" << EOF
# OpenClaw 配置文件
# 由一键部署脚本生成于 $(date)

# Gateway 配置
OPENCLAW_GATEWAY_TOKEN=$GATEWAY_TOKEN
OPENCLAW_STATE_DIR=$CONFIG_DIR
OPENCLAW_CONFIG_PATH=$CONFIG_DIR/openclaw.json

# API 密钥
EOF

    # 根据提供商添加配置
    case $PROVIDER in
        anthropic)
            echo "ANTHROPIC_API_KEY=$API_KEY" >> "$ENV_FILE"
            ;;
        openai)
            echo "OPENAI_API_KEY=$API_KEY" >> "$ENV_FILE"
            ;;
        gemini)
            echo "GEMINI_API_KEY=$API_KEY" >> "$ENV_FILE"
            ;;
        openrouter)
            echo "OPENROUTER_API_KEY=$API_KEY" >> "$ENV_FILE"
            ;;
        custom)
            cat >> "$ENV_FILE" << EOF
OPENAI_API_KEY=$API_KEY
OPENAI_BASE_URL=$CUSTOM_BASE_URL
EOF
            ;;
    esac

    # 创建 openclaw.json 配置文件
    cat > "$CONFIG_DIR/openclaw.json" << EOF
{
  "gateway": {
    "port": $GATEWAY_PORT,
    "bind": "lan",
    "auth": {
      "token": "$GATEWAY_TOKEN"
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "provider": "$PROVIDER"
EOF

    if [ "$PROVIDER" = "custom" ]; then
        cat >> "$CONFIG_DIR/openclaw.json" << EOF
,
        "modelId": "$MODEL_NAME"
EOF
    fi

    cat >> "$CONFIG_DIR/openclaw.json" << EOF
      }
    }
  }
}
EOF

    print_success "配置文件创建完成 ✓"
    print_info "配置目录: $CONFIG_DIR"
}

# 安装依赖
install_deps() {
    print_info "安装依赖包..."

    cd "$OPENCLAW_DIR"

    # 安装主项目依赖
    pnpm install

    print_success "依赖安装完成 ✓"
}

# 构建项目
build_project() {
    print_info "构建项目..."

    cd "$OPENCLAW_DIR"

    # 构建 UI
    print_info "构建 UI..."
    pnpm ui:build

    # 构建主项目
    print_info "构建主项目..."
    pnpm build

    print_success "项目构建完成 ✓"
}

# 启动 Gateway
start_gateway() {
    print_info "启动 OpenClaw Gateway..."

    cd "$OPENCLAW_DIR"

    # 检查是否有旧进程在运行
    if pgrep -f "node.*dist/index.js.*gateway" > /dev/null 2>&1; then
        print_warning "检测到旧的 Gateway 进程，正在停止..."
        pkill -f "node.*dist/index.js.*gateway" 2>/dev/null || true
        sleep 2
    fi

    # 后台启动 Gateway
    nohup node dist/index.js gateway --port $GATEWAY_PORT > "$CONFIG_DIR/gateway.log" 2>&1 &
    GATEWAY_PID=$!

    # 等待服务启动
    print_info "等待 Gateway 启动..."
    sleep 3

    # 检查服务是否启动成功
    if curl -s "http://localhost:$GATEWAY_PORT/healthz" > /dev/null 2>&1; then
        print_success "Gateway 启动成功 ✓ (PID: $GATEWAY_PID)"
    else
        print_warning "Gateway 可能仍在启动中，请稍后检查"
    fi
}

# 打开 Web 界面
open_web() {
    print_info "打开 Web 界面..."

    WEB_URL="http://localhost:$GATEWAY_PORT"

    # macOS
    if command -v open &> /dev/null; then
        open "$WEB_URL"
    # Linux
    elif command -v xdg-open &> /dev/null; then
        xdg-open "$WEB_URL"
    # Windows (WSL)
    elif command -v explorer.exe &> /dev/null; then
        explorer.exe "$WEB_URL"
    else
        print_warning "无法自动打开浏览器，请手动访问: $WEB_URL"
    fi

    print_success "Web 界面地址: $WEB_URL"
}

# 显示完成信息
show_complete() {
    echo ""
    print_header "═══════════════════════════════════════════════════════════"
    print_header "                  🎉 部署完成！"
    print_header "═══════════════════════════════════════════════════════════"
    echo ""
    echo -e "${GREEN}  Web 界面: http://localhost:$GATEWAY_PORT${NC}"
    echo ""
    echo "  Gateway Token: $GATEWAY_TOKEN"
    echo ""
    echo "  配置目录: $CONFIG_DIR"
    echo "  日志文件: $CONFIG_DIR/gateway.log"
    echo ""
    print_header "═══════════════════════════════════════════════════════════"
    print_header "                    常用命令"
    print_header "═══════════════════════════════════════════════════════════"
    echo ""
    echo "  查看日志:    tail -f $CONFIG_DIR/gateway.log"
    echo "  停止服务:    pkill -f 'node.*dist/index.js.*gateway'"
    echo "  重启服务:    cd $OPENCLAW_DIR && node dist/index.js gateway"
    echo "  进入 CLI:    cd $OPENCLAW_DIR && node dist/index.js"
    echo ""
    print_header "═══════════════════════════════════════════════════════════"
    echo ""
}

# 主函数
main() {
    show_logo

    # 环境检查
    check_node
    check_pnpm
    check_source

    # 用户配置
    select_provider
    get_api_key

    # 创建配置
    create_config

    # 安装和构建
    install_deps
    build_project

    # 启动服务
    start_gateway

    # 打开 Web 界面
    open_web

    # 显示完成信息
    show_complete
}

# 运行主函数
main
