# 龙虾助手开发指南

## 开发环境设置

### 系统要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Rust >= 1.70.0 (用于 Tauri 桌面应用)
- Git

### 安装依赖

```bash
# 克隆仓库
git clone https://github.com/lobster-assistant/lobster-assistant.git
cd lobster-assistant

# 安装依赖
pnpm install
```

### 开发命令

```bash
# 启动所有项目开发模式
pnpm dev

# 单独启动
pnpm web dev       # Web 面板 (http://localhost:3000)
pnpm cli dev       # CLI 工具
pnpm desktop dev   # Tauri 桌面应用
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

## 核心模块

### @lobster-assistant/core

核心部署引擎，包含：

- **detector.ts**: 环境检测
- **config.ts**: 配置管理
- **installer.ts**: 安装引擎
- **service.ts**: 服务管理
- **logger.ts**: 日志管理

### @lobster-assistant/license

授权系统，包含：

- **fingerprint.ts**: 设备指纹生成
- **activator.ts**: 激活逻辑
- **validator.ts**: 授权验证
- **crypto.ts**: 加密存储

### @lobster-assistant/branding

品牌定制系统，支持：

- 自定义产品名称和 Logo
- 自定义主题色
- 自定义链接

## 构建发布

### 构建所有包

```bash
pnpm build
```

### 构建桌面应用

```bash
cd apps/desktop
pnpm tauri:build
```

构建产物位于 `apps/desktop/src-tauri/target/release/bundle/`

### 发布新版本

```bash
./scripts/release.sh patch  # 或 minor / major
```

## 代码规范

- 使用 TypeScript
- 使用 ESLint + Prettier
- 提交信息遵循 Conventional Commits

## 测试

```bash
pnpm test
```

## 文档

- [API 文档](./api.md)
- [部署指南](./deployment.md)
- [授权系统](./license.md)
