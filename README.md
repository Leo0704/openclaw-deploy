# 龙虾助手 (Lobster Assistant)

OpenClaw 一键部署商业化产品

## 产品介绍

龙虾助手是一款面向小白用户的 OpenClaw 一键部署工具，提供：

- **桌面应用**：macOS、Windows、Linux 原生应用
- **Web 配置面板**：可视化的配置和管理界面
- **CLI 工具**：命令行部署工具

## 快速开始

### 环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
# 启动所有项目
pnpm dev

# 单独启动
pnpm web dev      # Web 面板
pnpm cli dev      # CLI 工具
pnpm desktop dev  # 桌面应用
```

### 构建

```bash
pnpm build
```

## 项目结构

```
├── apps/
│   ├── desktop/     # Tauri 桌面应用
│   ├── web/         # Web 配置面板
│   └── cli/         # 命令行工具
├── packages/
│   ├── core/        # 核心部署引擎
│   ├── license/     # 授权系统
│   ├── branding/    # 品牌定制
│   └── ui/          # 共享 UI 组件
└── scripts/         # 构建脚本
```

## 授权系统

龙虾助手采用设备绑定激活码的授权模式：

1. 用户输入激活码
2. 系统生成设备指纹
3. 服务器验证并绑定设备
4. 本地加密存储授权凭证

## License

UNLICENSED - 商业软件，保留所有权利
