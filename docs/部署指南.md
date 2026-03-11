# 部署指南

## 系统要求

### 用户端

- **macOS**: 10.13 或更高版本
- **Windows**: Windows 10 或更高版本
- **Linux**: Ubuntu 18.04+ / Debian 10+ / Fedora 30+

### 开发端

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Rust >= 1.70.0 (用于 Tauri)

## 构建流程

### 1. 安装依赖

```bash
pnpm install
```

### 2. 构建所有包

```bash
pnpm build
```

### 3. 构建桌面应用

```bash
cd apps/desktop
pnpm tauri:build
```

构建产物位于：
- **macOS**: `src-tauri/target/release/bundle/dmg/`
- **Windows**: `src-tauri/target/release/bundle/msi/`
- **Linux**: `src-tauri/target/release/bundle/deb/` 和 `appimage/`

## 代码签名

### macOS

1. 获取 Apple Developer 证书
2. 配置 `tauri.conf.json`:

```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Your Name (TEAM_ID)",
      "providerShortName": "TEAM_ID"
    }
  }
}
```

3. 公证：

```bash
xcrun notarytool submit app.dmg --apple-id "your@email.com" --password "app-specific-password" --team-id "TEAM_ID" --wait
```

### Windows

1. 获取代码签名证书
2. 配置 `tauri.conf.json`:

```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "YOUR_CERT_THUMBPRINT",
      "digestAlgorithm": "sha256"
    }
  }
}
```

## 自动更新

### 配置更新服务器

1. 设置更新端点：

```json
{
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": ["https://releases.lobster-assistant.com/{{target}}/{{arch}}/{{current_version}}"]
    }
  }
}
```

2. 生成签名密钥：

```bash
pnpm tauri signer generate
```

3. 构建时设置环境变量：

```bash
TAURI_SIGNING_PRIVATE_KEY="..." TAURI_SIGNING_PRIVATE_KEY_PASSWORD="..." pnpm tauri:build
```

## 激活服务器部署

### 使用 Supabase

1. 创建 Supabase 项目
2. 执行 SQL 创建表
3. 配置 Edge Functions 处理激活请求

### 自建服务器

使用 Node.js + Express：

```javascript
import express from 'express';
import { Pool } from 'pg';

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.post('/api/v1/license/activate', async (req, res) => {
  const { activationCode, deviceFingerprint, deviceName, productId } = req.body;

  // 验证激活码
  const result = await pool.query(
    'SELECT * FROM licenses WHERE activation_code = $1',
    [activationCode]
  );

  if (result.rows.length === 0) {
    return res.json({ success: false, message: '激活码无效' });
  }

  const license = result.rows[0];

  // 检查是否已激活
  if (license.status === 'active' && license.device_fingerprint !== deviceFingerprint) {
    return res.json({ success: false, message: '激活码已绑定其他设备' });
  }

  // 绑定设备
  await pool.query(
    'UPDATE licenses SET device_fingerprint = $1, device_name = $2, activated_at = NOW(), status = $3 WHERE id = $4',
    [deviceFingerprint, deviceName, 'active', license.id]
  );

  res.json({
    success: true,
    message: '激活成功',
    license: {
      productId,
      activationCode,
      activatedAt: new Date().toISOString(),
    },
  });
});

app.listen(3000);
```

## 监控和日志

### 应用监控

使用 Sentry 或类似服务：

```typescript
import * as Sentry from '@sentry/electron';

Sentry.init({
  dsn: 'YOUR_DSN',
});
```

### 日志收集

配置日志服务器：

```typescript
import { writeLog } from '@lobster-assistant/core';

// 日志会自动写入本地文件
// 可以定期上传到日志服务器
```

## 故障排除

### 常见问题

1. **构建失败**: 检查 Rust 版本和依赖
2. **签名失败**: 检查证书配置
3. **激活失败**: 检查网络连接和激活服务器状态

### 调试模式

```bash
TAURI_DEBUG=1 pnpm tauri:dev
```
