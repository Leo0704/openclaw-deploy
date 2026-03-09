# 龙虾助手 CLI

独立可打包的命令行工具，用于 OpenClaw 一键部署。

## 开发

```bash
# 安装依赖
npm install

# 编译
npm run build

# 运行
npm start
```

## 打包二进制

```bash
# 打包当前平台
npm run build:bin

# 打包 macOS
npm run build:bin:mac

# 打包 Windows
npm run build:bin:win

# 打包所有平台
bash ../../scripts/build-cli.sh
```

## 命令

```bash
# 激活产品
lobster activate

# 部署 OpenClaw
lobster deploy

# 启动服务
lobster start

# 停止服务
lobster stop

# 查看状态
lobster status

# 更新
lobster update
```

## 用户使用流程

1. 下载对应平台的二进制文件
2. 添加执行权限 (macOS/Linux): `chmod +x lobster-*`
3. 运行: `./lobster-* activate` 激活
4. 运行: `./lobster-* deploy` 部署
5. 运行: `./lobster-* start` 启动服务
