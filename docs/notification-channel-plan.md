# 通知配置中心实现说明

## 1. 目标

在龙虾助手里增加一个“通知”页，用来配置 OpenClaw 的通知渠道，而不是再让用户手动编辑 JSON。

这份设计以 **OpenClaw 现有源码语义** 为准，不单独发明新的配置结构。

当前优先支持：

- Telegram
- 飞书

## 2. 设计原则

1. 配置结构与 OpenClaw 一致
2. 配置文件路径与当前脚本实际读写路径一致
3. 运行状态优先以 OpenClaw Gateway 的 `channels.status` 为准
4. 网关不可用时，退回到配置层诊断

## 3. 当前脚本中的配置路径约定

OpenClaw 源码默认配置路径是：

- `~/.openclaw/openclaw.json`
- 或 `OPENCLAW_STATE_DIR/openclaw.json`

但龙虾助手当前部署/启动链路里，实际管理的是：

- `<installPath>/.claude/openclaw.json`

因此通知配置中心这次实现采用的规则是：

1. 如果已经部署了 OpenClaw，并且 `installPath` 是有效 OpenClaw 项目目录，就优先读写：
   - `<installPath>/.claude/openclaw.json`
2. 如果还没有部署，才回退到：
   - `~/.openclaw/openclaw.json`

这样可以保证通知配置和龙虾助手当前生成的模型配置落在同一份文件里。

## 4. 与 OpenClaw 对齐的配置语义

### 4.1 Telegram

通知配置中心当前写入：

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "123456:ABC",
      "dmPolicy": "pairing",
      "groupPolicy": "allowlist",
      "allowFrom": ["123456789"],
      "groups": {
        "*": {
          "requireMention": true
        }
      }
    }
  }
}
```

字段说明：

- `botToken`
- `dmPolicy`
- `groupPolicy`
- `allowFrom`
- `groups."*".requireMention`

### 4.2 飞书

通知配置中心当前写入：

```json
{
  "channels": {
    "feishu": {
      "enabled": true,
      "appId": "cli_xxx",
      "appSecret": "xxx",
      "connectionMode": "websocket",
      "dmPolicy": "pairing",
      "groupPolicy": "allowlist",
      "requireMention": true
    }
  },
  "plugins": {
    "allow": ["feishu"],
    "entries": {
      "feishu": {
        "enabled": true
      }
    }
  }
}
```

如果连接模式是 `webhook`，还会额外写入：

- `channels.feishu.verificationToken`

## 5. 通知配置中心的 4 层范围

### 第 1 层：配置正确落盘

目标：

- Telegram / 飞书配置保存到 OpenClaw 实际读取的配置文件
- 不再让用户手工改 JSON

当前状态：

- 已实现

### 第 2 层：状态与诊断

目标：

- 能看到渠道是否已配置
- 能看到字段缺失
- 网关在线时，优先显示 OpenClaw 自己识别到的渠道状态

当前状态：

- 已实现基础版

当前逻辑：

1. 先调用 Gateway `channels.status`
2. 如果网关不可用，就只显示配置层诊断

### 第 3 层：引导式配置

目标：

- Telegram/飞书不只是填表单，而是分步骤引导

计划内容：

- Telegram Bot 创建说明
- Telegram 用户 ID 获取说明
- 飞书应用创建说明
- 飞书 websocket / webhook 模式引导

当前状态：

- 已实现基础版

已实现：

- Telegram 配置页按实际操作顺序给出步骤说明
- 飞书配置页按 websocket / webhook 选择顺序给出步骤说明
- 页面里直接说明每个字段在真实接入流程里的位置

未实现：

- 完整的分步 Wizard
- 自动探测用户当前缺在哪一步
- 渠道专属测试连接与配置回填

### 第 4 层：运行时联动

目标：

- 保存配置后能联动 OpenClaw 当前运行状态
- 必要时给出“需要重启服务”的提示
- 后续可加测试连接、插件检查、热刷新

当前状态：

- 部分实现

已实现：

- 读取 `channels.status`
- 保存后提示重启

未实现：

- 测试连接
- 自动安装飞书插件
- 渠道级热重载

## 6. 当前 Web 页能力

“通知”页目前包含：

- Telegram 配置
  - Bot Token
  - 私聊策略
  - 群聊策略
  - allowFrom
  - 群聊是否要求 @
- 飞书配置
  - App ID
  - App Secret
  - 连接模式
  - Verification Token
  - 私聊策略
  - 群聊策略
  - allowFrom
  - 群聊是否要求 @
- 状态面板
  - 配置是否完整
  - 网关是否识别
  - 运行/连接状态
  - 最近错误
- 诊断提示
  - 缺少必填项
  - `allowFrom` 与策略不匹配
  - 飞书插件尚未明确启用

## 7. 当前不做的内容

这一轮明确不做：

- 飞书插件自动安装
- 多账户通知渠道完整管理
- Webhook 回调地址自动生成
- 渠道测试连接按钮
- 复刻 OpenClaw CLI onboarding 的完整交互流程

这些留到后续第 3 / 第 4 层继续扩展。

## 8. 为什么这样拆

因为通知渠道如果一开始就做成“看起来很完整”，但底层配置路径、字段语义、网关状态接口都没对齐，最后只会变成另一套错误配置中心。

所以这次先保证两件事：

1. 写进去的内容是 OpenClaw 真能读懂的
2. 状态面板优先相信 OpenClaw 自己的 `channels.status`

在这两个基础之上，再继续做更完整的配置引导和运行时联动。
