const fs = require('fs') as typeof import('fs');

const {
  isOpenClawProjectDir,
  readManagedOpenClawConfig,
  writeManagedOpenClawConfig,
} = require('./openclaw-project') as typeof import('./openclaw-project');

const {
  buildGatewayCallCommand,
  getGatewayHealthStatus,
  getInstalledOpenClawSkillsFromStatus,
  getNotificationChannelsStatus,
  getOpenClawSkillStatusEntry,
  getManagedOpenClawEnv,
  normalizeSkillInstallOptions,
  parseAllowFromInput,
  readGatewayToken,
  resolveGatewayToken,
  resolveRemovableSkillPath,
} = require('./openclaw-runtime') as typeof import('./openclaw-runtime');

const {
  runCommandArgs,
} = require('./process-utils') as typeof import('./process-utils');

const DEFAULT_GATEWAY_PORT = 18789;

function mergeChannelConfig(
  config: Record<string, unknown>,
  channelId: 'telegram' | 'feishu',
  nextChannelConfig: Record<string, unknown>
): Record<string, unknown> {
  const snapshot = readManagedOpenClawConfig(config);
  const nextConfig = { ...snapshot.config };
  const channels = { ...((nextConfig.channels as Record<string, unknown>) || {}) };
  const currentChannel = (channels[channelId] as Record<string, unknown> | undefined) || {};
  channels[channelId] = {
    ...currentChannel,
    ...nextChannelConfig,
  };
  nextConfig.channels = channels;
  writeManagedOpenClawConfig(config, nextConfig);
  return nextConfig;
}

export function handleSaveTelegramChannel(data: Record<string, unknown>, config: Record<string, unknown>): Record<string, unknown> {
  const botToken = String(data.botToken || '').trim();
  const dmPolicy = String(data.dmPolicy || 'pairing').trim();
  const groupPolicy = String(data.groupPolicy || 'allowlist').trim();
  const allowFrom = parseAllowFromInput(data.allowFrom);
  const requireMention = data.requireMention !== false;

  if (!botToken) {
    return { success: false, error: '请输入 Telegram Bot Token' };
  }
  if (!['pairing', 'allowlist', 'open', 'disabled'].includes(dmPolicy)) {
    return { success: false, error: 'Telegram 私聊策略不正确' };
  }
  if (!['allowlist', 'open', 'disabled'].includes(groupPolicy)) {
    return { success: false, error: 'Telegram 群聊策略不正确' };
  }
  if (dmPolicy === 'allowlist' && allowFrom.length === 0) {
    return { success: false, error: '私聊策略为“仅允许名单”时，请至少填写一个 allowFrom' };
  }
  if (dmPolicy === 'open' && !allowFrom.includes('*')) {
    return { success: false, error: '私聊策略为“全部放行”时，allowFrom 需要包含 *' };
  }

  const snapshot = readManagedOpenClawConfig(config);
  const existingTelegram =
    ((snapshot.config.channels as Record<string, unknown> | undefined)?.telegram as Record<string, unknown> | undefined) || {};
  const existingGroups = (existingTelegram.groups as Record<string, unknown> | undefined) || {};
  const existingWildcardGroup = (existingGroups['*'] as Record<string, unknown> | undefined) || {};

  mergeChannelConfig(config, 'telegram', {
    enabled: true,
    botToken,
    dmPolicy,
    groupPolicy,
    allowFrom,
    groups: {
      ...existingGroups,
      '*': {
        ...existingWildcardGroup,
        requireMention,
      },
    },
  });

  const status = getNotificationChannelsStatus(config);
  return {
    ...status,
    message: 'Telegram 配置已保存。若 OpenClaw 正在运行，建议重启一次服务让渠道配置完整生效。',
  };
}

export function handleSaveFeishuChannel(data: Record<string, unknown>, config: Record<string, unknown>): Record<string, unknown> {
  const appId = String(data.appId || '').trim();
  const appSecret = String(data.appSecret || '').trim();
  const connectionMode = String(data.connectionMode || 'websocket').trim();
  const verificationToken = String(data.verificationToken || '').trim();
  const dmPolicy = String(data.dmPolicy || 'pairing').trim();
  const groupPolicy = String(data.groupPolicy || 'allowlist').trim();
  const requireMention = data.requireMention !== false;
  const allowFrom = parseAllowFromInput(data.allowFrom);

  if (!appId) {
    return { success: false, error: '请输入飞书 App ID' };
  }
  if (!appSecret) {
    return { success: false, error: '请输入飞书 App Secret' };
  }
  if (!['websocket', 'webhook'].includes(connectionMode)) {
    return { success: false, error: '飞书连接模式不正确' };
  }
  if (connectionMode === 'webhook' && !verificationToken) {
    return { success: false, error: 'Webhook 模式需要填写 Verification Token' };
  }
  if (!['pairing', 'allowlist', 'open', 'disabled'].includes(dmPolicy)) {
    return { success: false, error: '飞书私聊策略不正确' };
  }
  if (!['allowlist', 'open', 'disabled'].includes(groupPolicy)) {
    return { success: false, error: '飞书群聊策略不正确' };
  }

  const snapshot = readManagedOpenClawConfig(config);
  const existingFeishu =
    ((snapshot.config.channels as Record<string, unknown> | undefined)?.feishu as Record<string, unknown> | undefined) || {};

  const nextConfig = mergeChannelConfig(config, 'feishu', {
    enabled: true,
    appId,
    appSecret,
    connectionMode,
    ...(connectionMode === 'webhook'
      ? { verificationToken }
      : existingFeishu.verificationToken !== undefined
        ? { verificationToken: existingFeishu.verificationToken }
        : {}),
    dmPolicy,
    groupPolicy,
    requireMention,
    ...(allowFrom.length > 0 ? { allowFrom } : {}),
  });

  const plugins = { ...((nextConfig.plugins as Record<string, unknown>) || {}) };
  const allow = Array.isArray(plugins.allow)
    ? plugins.allow.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];
  if (!allow.includes('feishu')) {
    allow.push('feishu');
  }
  plugins.allow = allow;
  const entries = { ...((plugins.entries as Record<string, unknown>) || {}) };
  entries.feishu = { ...((entries.feishu as Record<string, unknown>) || {}), enabled: true };
  plugins.entries = entries;
  nextConfig.plugins = plugins;
  writeManagedOpenClawConfig(config, nextConfig);

  const status = getNotificationChannelsStatus(config);
  return {
    ...status,
    message: '飞书配置已保存。若 OpenClaw 还未加载 feishu 插件，请先确认插件可用，再重启服务。',
  };
}

function validateSkillInstallRequest(data: Record<string, unknown>, config: Record<string, unknown>): { skillId?: string; error?: string } {
  const skillId = String(data.skill || '').trim();
  if (!skillId) {
    return { error: '请指定技能名称' };
  }
  if (!/^[a-z0-9][a-z0-9-_./]{0,127}$/i.test(skillId)) {
    return { error: '技能名称格式不正确' };
  }
  if (!config.installPath || !fs.existsSync(config.installPath as string)) {
    return { error: '请先部署 OpenClaw' };
  }
  if (!isOpenClawProjectDir(config.installPath as string)) {
    return { error: '当前安装路径不是有效的 OpenClaw 项目，请重新部署' };
  }
  return { skillId };
}

function getGatewayTokenMissingMessage(config: Record<string, unknown>): string {
  const tokenResolution = resolveGatewayToken(config);
  if (tokenResolution.secretRefConfigured) {
    return '当前 gateway token 由 SecretRef 管理，龙虾助手无法直接读取它来执行网关调用。请在启动龙虾助手的环境里提供 OPENCLAW_GATEWAY_TOKEN 后再试。';
  }
  return '技能安装需要先启动 OpenClaw 服务，生成网关访问令牌后才能继续';
}

export function handleSkillInstallOptions(data: Record<string, unknown>, config: Record<string, unknown>): Record<string, unknown> {
  const validation = validateSkillInstallRequest(data, config);
  if (validation.error) {
    return { success: false, error: validation.error };
  }

  const skill = getOpenClawSkillStatusEntry(config, validation.skillId as string);
  if (!skill) {
    return {
      success: false,
      error: `OpenClaw 当前技能目录里没有找到 "${validation.skillId}"，请先在 ClawHub 确认 skill id 是否正确`,
    };
  }

  const options = normalizeSkillInstallOptions(skill);
  if (options.length === 0) {
    return { success: false, error: `技能 "${validation.skillId}" 当前没有可用的自动安装方式` };
  }

  return {
    success: true,
    skill: validation.skillId,
    options,
    preferredInstallId: options.length === 1 ? String(options[0].id || '') : '',
    recommendedInstallId: '',
  };
}

export async function handleSkillInstall(data: Record<string, unknown>, config: Record<string, unknown>): Promise<Record<string, unknown>> {
  const validation = validateSkillInstallRequest(data, config);
  if (validation.error) {
    return { success: false, error: validation.error };
  }
  const skillId = validation.skillId as string;

  try {
    const gatewayPort = Number(config.gatewayPort || DEFAULT_GATEWAY_PORT);
    const gatewayToken = readGatewayToken(config);
    if (!gatewayToken) {
      return { success: false, error: getGatewayTokenMissingMessage(config) };
    }

    const gatewayHealthy = await getGatewayHealthStatus(config);
    if (!gatewayHealthy) {
      return { success: false, error: '技能安装需要 OpenClaw 服务正在运行，请先启动服务后再安装' };
    }

    const skill = getOpenClawSkillStatusEntry(config, skillId);
    if (!skill) {
      return { success: false, error: `OpenClaw 当前技能目录里没有找到 "${skillId}"，请先在 ClawHub 确认 skill id 是否正确` };
    }

    const options = normalizeSkillInstallOptions(skill);
    const installId = String(data.installId || '').trim();
    if (!installId) {
      if (options.length > 1) {
        return {
          success: false,
          error: `技能 "${skillId}" 有多种安装方式，请先明确选择 install id 后再安装`,
          needsInstallChoice: true,
          options,
        };
      }
      return { success: false, error: `技能 "${skillId}" 缺少 install id，请重新选择安装方式` };
    }
    if (!options.some((option) => String(option.id || '').trim() === installId)) {
      return { success: false, error: `技能 "${skillId}" 不存在 install id "${installId}"` };
    }

    console.log(`[技能] 正在安装: ${skillId} (${installId})`);
    const installCall = buildGatewayCallCommand(
      config.installPath as string,
      gatewayPort,
      gatewayToken,
      'skills.install',
      { name: skillId, installId, timeoutMs: 120000 }
    );
    const result = runCommandArgs(installCall.file, config.installPath as string, {
      args: installCall.args,
      timeout: 180000,
      ignoreError: true,
      silent: true,
    });

    if (!result.success) {
      return { success: false, error: result.stderr || '安装失败' };
    }

    const installedSkills = await getInstalledOpenClawSkillsFromStatus(config);
    const installed = installedSkills.find((entry) => entry.id === skillId);
    if (!installed) {
      return {
        success: false,
        error: `OpenClaw 已执行技能安装，但当前技能状态里还没有识别到 "${skillId}"。请稍后刷新，或在 OpenClaw 里执行一次技能检查。`,
      };
    }

    console.log(`[技能] 安装成功: ${skillId}`);
    return { success: true, message: `技能 "${skillId}" 安装成功，来源：${installed.source}` };
  } catch (e) {
    const error = e as Error;
    console.error(`[技能] 安装失败: ${error.message}`);
    return { success: false, error: `安装失败: ${error.message}` };
  }
}

export async function handleSkillUninstall(data: Record<string, unknown>, config: Record<string, unknown>): Promise<Record<string, unknown>> {
  const skillId = String(data.skill || '').trim();
  if (!skillId) {
    return { success: false, error: '请指定技能名称' };
  }
  if (!/^[a-z0-9][a-z0-9-_./]{0,127}$/i.test(skillId) || skillId.includes('..')) {
    return { success: false, error: '技能名称格式不正确' };
  }
  if (!config.installPath) {
    return { success: false, error: '请先部署 OpenClaw' };
  }
  if (!isOpenClawProjectDir(config.installPath as string)) {
    return { success: false, error: '当前安装路径不是有效的 OpenClaw 项目，请重新部署' };
  }

  try {
    const installedSkill = (await getInstalledOpenClawSkillsFromStatus(config)).find((skill) => skill.id === skillId);
    if (!installedSkill) {
      return { success: false, error: '技能未安装' };
    }
    if (!installedSkill.removable) {
      return { success: false, error: `技能 "${skillId}" 来自 ${installedSkill.source}，当前不支持在龙虾助手里直接卸载` };
    }

    const resolved = resolveRemovableSkillPath(config, skillId);
    if (!resolved) {
      return { success: false, error: `已识别到技能 "${skillId}"，但未找到可删除的技能目录` };
    }

    fs.rmSync(resolved.path, { recursive: true, force: true });
    console.log(`[技能] 已卸载: ${skillId}`);
    return { success: true, message: `技能 "${skillId}" 已从 ${resolved.source} 卸载` };
  } catch (e) {
    const error = e as Error;
    return { success: false, error: `卸载失败: ${error.message}` };
  }
}
