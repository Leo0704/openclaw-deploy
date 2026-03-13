# 龙虾助手 (Lobster Assistant)

面向普通用户的 OpenClaw 部署与管理工具。

双击运行后，龙虾助手会启动本地 Web 控制台，帮助用户完成激活、部署、模型接入、OpenClaw 启停、技能管理、通知渠道配置、卸载和自更新。

## 当前版本

- `1.0.65`

## 主要功能

- **激活码授权**
  - 调用独立 `license-server` 远程校验
  - 绑定设备指纹
  - 支持启动时自动校验授权状态
- **OpenClaw 一键部署**
  - 使用离线包安装（无需 Git、pnpm）
  - 内置 Node.js 运行时和所有依赖
  - 部署前做环境预检
  - 支持无 VPN 部署模式
- **模型接入配置**
  - 预设 provider 快速配置（13 个主流模型服务商）
  - `custom` 自定义 API 配置
  - 支持 OpenAI / Anthropic 兼容接口验证
- **OpenClaw 服务管理**
  - 启动、停止、打开 OpenClaw
  - 自动注入 `OPENCLAW_CONFIG_PATH`
  - 端口冲突时自动切换 Web 控制台端口
- **技能管理**
  - 官方市场入口跳转到 [ClawHub](https://clawhub.ai)
  - 已安装技能优先读取 OpenClaw 实际状态
  - 安装后做二次确认
- **通知配置中心**
  - Telegram 配置
  - 飞书配置
  - 配置诊断、主动探测、保存后重启联动
- **彻底卸载 OpenClaw**
  - 删除安装目录
  - 删除运行缓存和临时日志
  - 清理龙虾助手保存的部署配置
- **自动更新**
  - 启动时检查更新
  - 每 24 小时再次检查
  - 支持多镜像源智能选择

## 用户使用

### 下载与启动

从 release 下载对应平台的安装包：

- `lobster-macos-arm64-app.zip` - macOS Apple Silicon (M1/M2/M3) 推荐下载
- `lobster-macos-arm64` - macOS 原始二进制
- `lobster-linux-x64`
- `lobster-win-x64.exe`

macOS:

1. 下载 `*-app.zip`
2. 解压得到 `Lobster Assistant.app`
3. 双击运行
4. 如果第一次被系统拦截，在"系统设置 > 隐私与安全性"里允许打开

Linux:

```bash
chmod +x lobster-linux-x64
./lobster-linux-x64
```

Windows:

- 直接运行 `lobster-win-x64.exe`

启动后会打开本地 Web 控制台，默认地址：

- `http://localhost:18790`

如果 `18790` 被占用，会自动切换到下一个可用端口。

### 用户操作流程

1. 输入激活码完成授权
2. 在"部署"或"配置"页面填写模型接入信息
3. 点击部署，自动下载/检测离线包并安装
4. 启动 OpenClaw
5. 打开 OpenClaw Web 界面开始使用
6. 按需安装技能、配置通知渠道

## 模型接入

### 预设 provider（13 个）

| 服务商 | 说明 |
|--------|------|
| Anthropic | Claude 直连 |
| OpenAI | GPT 直连 |
| Google | Gemini 直连 |
| OpenRouter | 多模型聚合 |
| 阿里云百炼 | 国内模型 |
| 阿里云 Coding | Code 模型 |
| DeepSeek | 国内模型 |
| 硅基流动 | 国内模型 |
| Moonshot | Kimi |
| 智谱 AI | GLM |
| 自定义 API | 高级配置 |

### Custom API

`custom` 配置流程按 OpenClaw 当前接入语义实现，顺序为：

1. `Base URL`
2. `API Key`
3. 兼容类型
4. `Model ID`
5. 连接验证
6. `Endpoint ID`
7. 可选别名

保存后会写入 OpenClaw 实际使用的配置文件。

## 通知配置中心

- **Telegram**: botToken、allowFrom、私聊/群聊策略、groups 配置
- **飞书**: appId、appSecret、connectionMode、verificationToken、私聊/群聊策略
- **运行时能力**: 读取 OpenClaw 渠道状态、主动探测、保存后提示重启

## 授权系统

- **授权模式**: 激活码绑定设备
- **服务端**: 阿里云函数计算
- **数据存储**: 阿里云 OSS
- **产品 ID**: `lobster-assistant-desktop`

## 自更新

- **源码仓库**: `openclaw/openclaw`
- **发布仓库**: `Leo0704/lobster-releases`
- **镜像源**:
  - GitMirror（默认，国内最稳定）
  - GHProxy
  - GitHub 直连
- **更新策略**: 启动时检查 + 每 24 小时自动检查

## 环境要求

### 运行龙虾助手源码

- Node.js `>= 22.12.0`

### 部署 OpenClaw

龙虾助手使用离线包模式部署，预检项目：

- 网络连接（下载离线包）
- 磁盘空间
- 端口可用性
- 安装路径有效性

离线包已内置 Node.js 运行时和所有依赖，无需 Git、pnpm。

## 开发

### 本地运行

```bash
npm install
npm run build
npm start
```

或直接进入 CLI：

```bash
cd apps/cli
npm install
npm run build
npm start
```

### 打包

```bash
npm run pkg
```

CLI 打包目标：

- `node22-macos-arm64`
- `node22-macos-x64`
- `node22-linux-x64`
- `node22-win-x64`

macOS 可额外生成 `.app` 打包：

```bash
npm run pkg:mac-app
```

输出目录：`apps/cli/bin`

### 发版

发版由 Git tag 触发：

```bash
git tag v1.0.65
git push origin v1.0.65
```

GitHub Actions 会：
1. 校验 release tag 与版本号一致
2. 按平台原生 runner 构建二进制
3. 将产物发布到 `Leo0704/lobster-releases`

## 项目结构

```
.
├── apps/
│   └── cli/
│       ├── src/
│       │   ├── app/                    # 应用入口
│       │   ├── core/                   # 核心服务
│       │   │   ├── api/               # API 处理
│       │   │   ├── bootstrap/         # 引导服务
│       │   │   ├── config/            # 配置管理
│       │   │   ├── deploy/            # 部署任务
│       │   │   ├── diagnostics/        # 系统检查
│       │   │   ├── license/            # 授权服务
│       │   │   ├── providers/         # 模型供应商
│       │   │   ├── server/             # HTTP 服务器
│       │   │   ├── state/              # 应用状态
│       │   │   ├── update/             # 自更新
│       │   │   └── web-ui/             # Web UI 模板
│       │   ├── platform/              # 平台相关
│       │   │   ├── autostart/         # 自启动
│       │   │   ├── browser/           # 浏览器操作
│       │   │   ├── diagnostics/        # 平台诊断
│       │   │   ├── install/            # 安装服务
│       │   │   ├── network/           # 网络配置
│       │   │   ├── process/           # 进程管理
│       │   │   ├── security/           # 安全存储
│       │   │   ├── storage/           # 存储路径
│       │   │   ├── temp/              # 临时目录
│       │   │   ├── update/            # 平台更新
│       │   │   ├── macos.ts
│       │   │   ├── linux.ts
│       │   │   ├── windows.ts
│       │   │   └── index.ts
│       │   ├── runtime/                # 运行时交互
│       │   │   ├── channels/          # 通知渠道
│       │   │   ├── gateway/           # Gateway 进程
│       │   │   └── openclaw/          # OpenClaw 交互
│       │   ├── shared/                 # 共享工具
│       │   │   ├── errors/            # 错误处理
│       │   │   ├── network/           # 网络工具
│       │   │   └── process/           # 进程工具
│       │   └── packaging/             # 打包发布
│       │       └── release/           # 发布源
│       └── bin/
├── docs/                               # 设计文档
├── license-server/                      # 授权服务
├── scripts/
└── .github/workflows/
```

## 关键环境变量

| 变量 | 说明 |
|------|------|
| `LOBSTER_PORT` | 覆盖 Web 控制台端口 |
| `LOBSTER_LICENSE_SERVER_URL` | 覆盖授权服务地址 |
| `LOBSTER_PURCHASE_URL` | 覆盖购买链接 |
| `OPENCLAW_CONFIG_PATH` | 启动 OpenClaw 时自动注入 |

## 购买链接

- [淘宝购买链接](https://m.tb.cn/h.iW33Qi7?tk=MPQHUv32tQo%20CZ193)

## License

`UNLICENSED`
