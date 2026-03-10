# 龙虾助手 (Lobster Assistant)

面向普通用户的 OpenClaw 部署与管理工具。

双击运行后，龙虾助手会启动本地 Web 控制台，帮助用户完成激活、部署、模型接入、OpenClaw 启停、技能管理、通知渠道配置、卸载和自更新。

## 当前版本

- `1.0.25`

## 主要功能

- 激活码授权
  - 调用独立 `license-server` 远程校验
  - 绑定设备指纹
  - 支持启动时自动校验授权状态
- OpenClaw 一键部署
  - 从 `openclaw/openclaw` 克隆源码
  - 自动执行依赖安装和构建
  - 部署前做环境预检
- 模型接入配置
  - 预设 provider 快速配置
  - `custom` 按 OpenClaw 实际接入顺序引导配置
  - 支持 OpenAI / Anthropic 兼容接口验证
- OpenClaw 服务管理
  - 启动、停止、打开 OpenClaw
  - 自动注入 `OPENCLAW_CONFIG_PATH`
  - 端口冲突时自动切换 Web 控制台端口
- 技能管理
  - 官方市场入口跳转到 [ClawHub](https://clawhub.ai)
  - 已安装技能优先读取 OpenClaw 实际状态
  - 安装后做二次确认
- 通知配置中心
  - Telegram
  - 飞书
  - 配置诊断、主动探测、保存后重启联动
- 彻底卸载 OpenClaw
  - 删除安装目录
  - 删除运行缓存和临时日志
  - 清理龙虾助手保存的部署配置
- 自动更新
  - 启动时检查更新
  - 每 24 小时再次检查
  - 支持 GitHub 直连和镜像下载

## 用户使用

### 下载与启动

从 release 下载对应平台的安装包：

- `lobster-macos-arm64-app.zip` - macOS Apple Silicon 推荐下载
- `lobster-macos-x64-app.zip` - macOS Intel 推荐下载
- `lobster-macos-arm64` - macOS Apple Silicon 原始二进制
- `lobster-macos-x64` - macOS Intel 原始二进制
- `lobster-linux-x64`
- `lobster-win-x64.exe`

macOS:

1. 下载 `*-app.zip`
2. 解压得到 `Lobster Assistant.app`
3. 双击运行
4. 如果第一次被系统拦截，在“系统设置 > 隐私与安全性”里允许打开

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
2. 在“部署”或“配置”页面填写模型接入信息
3. 点击部署，完成 OpenClaw 克隆、依赖安装和构建
4. 启动 OpenClaw
5. 打开 OpenClaw Web 界面开始使用
6. 按需安装技能、配置通知渠道

## 模型接入

### 预设 provider

支持常见模型服务的快捷配置：

- Anthropic
- OpenAI
- Google
- OpenRouter
- 阿里云百炼
- 阿里云 Coding
- DeepSeek
- SiliconFlow
- Moonshot
- 智谱

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

当前已实现：

- Telegram 配置
  - `botToken`
  - `allowFrom`
  - 私聊策略
  - 群聊策略
  - `groups."*".requireMention`
- 飞书配置
  - `appId`
  - `appSecret`
  - `connectionMode`
  - `verificationToken`
  - 私聊 / 群聊策略
  - `allowFrom`
- 运行时能力
  - 读取 OpenClaw 渠道状态
  - 主动探测
  - 保存后提示重启并尝试刷新状态

相关设计文档见：

- [notification-channel-plan.md](/Users/lylyyds/Desktop/openclaw-deploy/docs/notification-channel-plan.md)

## 授权系统

授权模式为激活码绑定设备。

客户端：

- 默认授权服务地址：
  - `https://license-api-lobster-license-qaqgawotfd.cn-hangzhou.fcapp.run`
- 产品 ID：
  - `lobster-assistant-desktop`

服务端：

- `POST /activate`
- `POST /verify`
- `GET /health`

数据存储在阿里云 OSS，授权服务部署在阿里云函数计算。

## 自更新

自更新检查 `Leo0704/lobster-releases` 的最新 release。

源码拉取仓库：

- `openclaw/openclaw`

发布仓库：

- `Leo0704/lobster-releases`

当前内置镜像：

- GitHub 直连
- GitMirror
- GHProxy

## 环境要求

### 运行龙虾助手源码

- Node.js `>= 22.12.0`

### 部署 OpenClaw

龙虾助手会在部署前预检这些项目：

- Node.js 版本
- Git
- `pnpm`
- 网络连接
- 磁盘空间
- 端口可用性
- 安装路径有效性

部分依赖会尝试自动安装：

- Git
- `pnpm`

不会自动安装：

- Node.js
- `npm`

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

- `node20-macos-arm64`
- `node20-macos-x64`
- `node20-linux-x64`
- `node20-win-x64`

macOS 发布同时额外生成：

- `lobster-macos-arm64-app.zip`
- `lobster-macos-x64-app.zip`

输出目录：

- `apps/cli/bin`

### 发版

发版由 Git tag 触发：

```bash
git tag v1.0.25
git push origin v1.0.25
```

GitHub Actions 会：

1. 校验 release tag 与版本号一致
2. 按平台原生 runner 构建二进制
3. 将产物发布到 `Leo0704/lobster-releases`

## 项目结构

```text
.
├── apps/
│   └── cli/
│       ├── src/
│       │   ├── index.ts
│       │   ├── system-check.ts
│       │   ├── network-utils.ts
│       │   └── error-utils.ts
│       └── bin/
├── license-server/
│   ├── src/
│   │   ├── index.ts
│   │   ├── activate.ts
│   │   ├── verify.ts
│   │   ├── oss.ts
│   │   └── types.ts
│   └── s.yaml
├── docs/
├── scripts/
│   └── validate-release-version.js
└── .github/workflows/
    └── release.yml
```

## 关键环境变量

- `LOBSTER_PORT`
  - 覆盖 Web 控制台端口
- `LOBSTER_LICENSE_SERVER_URL`
  - 覆盖授权服务地址
- `LOBSTER_PURCHASE_URL`
  - 覆盖“购买激活码”链接
- `OPENCLAW_CONFIG_PATH`
  - 由龙虾助手启动 OpenClaw 时自动注入

## 购买链接

默认购买激活码链接：

- [淘宝购买链接](https://m.tb.cn/h.iW33Qi7?tk=MPQHUv32tQo%20CZ193)

## License

`UNLICENSED`
