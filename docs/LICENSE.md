# 授权系统文档

## 概述

龙虾助手采用设备绑定激活码的授权模式，每个激活码仅限绑定一台设备。

## 授权流程

```
用户输入激活码 → 本地生成设备指纹 → 请求激活服务器
      ↓
服务器验证激活码 → 绑定设备指纹 → 返回授权凭证
      ↓
本地加密存储凭证 → 每次启动验证
```

## 设备指纹

设备指纹基于以下信息生成：

- 主机名
- CPU 信息
- MAC 地址
- 平台特定硬件 ID (macOS: IOPlatformUUID, Windows: 主板序列号, Linux: machine-id)

## 本地存储

授权信息加密存储在：

- **macOS**: `~/Library/Application Support/LobsterAssistant/license.enc`
- **Windows**: `%APPDATA%/LobsterAssistant/license.enc`
- **Linux**: `~/.lobster-assistant/license.enc`

## API

### 检查授权状态

```typescript
import { verifyLicense } from '@lobster-assistant/license';

const status = await verifyLicense();
if (status.isValid) {
  console.log('授权有效');
  console.log('设备:', status.license?.deviceName);
}
```

### 激活产品

```typescript
import { activate, DEFAULT_LICENSE_CONFIG } from '@lobster-assistant/license';

const result = await activate('XXXX-XXXX-XXXX-XXXX', {
  ...DEFAULT_LICENSE_CONFIG,
  serverUrl: 'https://license.lobster-assistant.com',
});

if (result.success) {
  console.log('激活成功');
}
```

### 解绑设备

```typescript
import { deactivate, DEFAULT_LICENSE_CONFIG } from '@lobster-assistant/license';

const success = await deactivate(DEFAULT_LICENSE_CONFIG);
```

## 激活服务器 API

### 激活端点

```
POST /api/v1/license/activate
```

请求体：
```json
{
  "activationCode": "XXXX-XXXX-XXXX-XXXX",
  "deviceFingerprint": "abc123...",
  "deviceName": "My Computer",
  "productId": "lobster-assistant-desktop"
}
```

响应：
```json
{
  "success": true,
  "message": "激活成功",
  "license": {
    "productId": "lobster-assistant-desktop",
    "activationCode": "XXXX-XXXX-XXXX-XXXX",
    "activatedAt": "2024-01-01T00:00:00Z",
    "expiresAt": null
  },
  "token": "..."
}
```

### 验证端点

```
POST /api/v1/license/verify
```

### 解绑端点

```
POST /api/v1/license/deactivate
```

## 数据库设计

```sql
CREATE TABLE licenses (
  id SERIAL PRIMARY KEY,
  activation_code VARCHAR(19) UNIQUE NOT NULL,
  device_fingerprint VARCHAR(64),
  device_name VARCHAR(255),
  activated_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_activation_code ON licenses(activation_code);
CREATE INDEX idx_device_fingerprint ON licenses(device_fingerprint);
```

## 安全考虑

1. 激活码格式验证
2. 设备指纹防篡改
3. 本地存储加密
4. 服务器通信 HTTPS
5. 激活次数限制
