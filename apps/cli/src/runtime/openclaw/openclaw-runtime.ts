/**
 * OpenClaw 运行时服务
 * 负责 OpenClaw 运行态交互、技能管理、渠道状态等
 */

const fs = require('fs') as typeof import('fs');
const os = require('os') as typeof import('os');
const path = require('path') as typeof import('path');

const { fetchWithTimeout } = require('../../shared/network/network-utils') as typeof import('../../shared/network/network-utils');
const { getCommandLookupEnv } = require('../../core/diagnostics/system-check') as typeof import('../../core/diagnostics/system-check');
const {
  detectProjectPackageManager,
  getManagedOpenClawConfigPath,
  getManagedOpenClawSkillsDir,
  getManagedOpenClawStateDir,
  getPnpmInvocation,
  isOpenClawProjectDir,
  normalizeProjectPath,
  getOpenClawProjectPath,
  readManagedOpenClawConfig,
  readOpenClawRuntimeConfig,
  resolveOpenClawWorkspaceDir,
} = require('./openclaw-project') as typeof import('./openclaw-project');
const {
  checkCommand,
  runCommandArgs,
} = require('../../shared/process/process-utils') as typeof import('../../shared/process/process-utils');

const DEFAULT_GATEWAY_PORT = 18789;

export type InstalledSkillEntry = {
  id: string;
  name: string;
  source: string;
  removable: boolean;
};

export type OpenClawSkillStatusReport = {
  skills?: Array<{
    name?: string;
    source?: string;
    bundled?: boolean;
    install?: Array<{
      id?: string;
      kind?: string;
      label?: string;
      bins?: string[];
    }>;
  }>;
};

type GatewayChannelsStatusReport = {
  channels?: Record<string, Record<string, unknown>>;
  channelAccounts?: Record<string, Array<Record<string, unknown>>>;
  channelDefaultAccountId?: Record<string, string>;
};

export type SkillInstallOptionSummary = {
  id: string;
  kind: string;
  label: string;
  bins: string[];
};

export type NotificationChannelStatus = {
  id: 'telegram' | 'feishu';
  title: string;
  configured: boolean;
  enabled: boolean;
  pluginReady: boolean;
  diagnostics: string[];
  runtime: {
    reachable: boolean;
    configured?: boolean;
    running?: boolean;
    connected?: boolean;
    lastError?: string;
    accountId?: string;
  };
  config: Record<string, unknown>;
};

export type GatewayTokenResolution = {
  token: string | null;
  configured: boolean;
  secretRefConfigured: boolean;
  unavailableReason?: string;
};

export function getManagedOpenClawEnv(config: Record<string, unknown>): NodeJS.ProcessEnv {
  return {
    ...getCommandLookupEnv(),
    OPENCLAW_STATE_DIR: getManagedOpenClawStateDir(config),
    OPENCLAW_CONFIG_PATH: getManagedOpenClawConfigPath(config),
  };
}

function mapOpenClawSkillSource(source: string, bundled?: boolean): { source: string; removable: boolean } {
  switch (source) {
    case 'openclaw-workspace':
      return { source: '工作区', removable: true };
    case 'openclaw-managed':
      return { source: 'OpenClaw 已管理', removable: true };
    case 'agents-skills-personal':
      return { source: '个人 .agents', removable: true };
    case 'agents-skills-project':
      return { source: '项目 .agents', removable: true };
    case 'openclaw-extra':
      return { source: '额外目录', removable: false };
    case 'openclaw-bundled':
      return { source: bundled ? 'OpenClaw 内置' : '打包技能', removable: false };
    default:
      return { source: source || '未知', removable: false };
  }
}

function mapSkillStatusReport(report: OpenClawSkillStatusReport | null | undefined): InstalledSkillEntry[] {
  const entries = Array.isArray(report?.skills) ? report.skills : [];
  const merged = new Map<string, InstalledSkillEntry>();
  for (const entry of entries) {
    const id = String(entry?.name || '').trim();
    if (!id) {
      continue;
    }
    const mapped = mapOpenClawSkillSource(String(entry?.source || '').trim(), entry?.bundled === true);
    merged.set(id, {
      id,
      name: id,
      source: mapped.source,
      removable: mapped.removable,
    });
  }
  return Array.from(merged.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function getStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];
}

export function parseAllowFromInput(raw: unknown): string[] {
  return String(raw || '')
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function maskSecret(value: unknown): string {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= 8) return `${text.slice(0, 2)}***`;
  return `${text.slice(0, 4)}***${text.slice(-3)}`;
}

function buildChannelRuntimeSummary(
  report: GatewayChannelsStatusReport | null,
  channelId: 'telegram' | 'feishu'
): NotificationChannelStatus['runtime'] {
  if (!report) {
    return { reachable: false };
  }
  const accountsMap = report.channelAccounts || {};
  const accounts = Array.isArray(accountsMap[channelId]) ? accountsMap[channelId] : [];
  const defaultAccountId =
    String(report.channelDefaultAccountId?.[channelId] || '').trim() ||
    String(accounts[0]?.accountId || '').trim();
  const account =
    accounts.find((entry) => String(entry?.accountId || '').trim() === defaultAccountId) ||
    accounts[0] ||
    null;

  if (!account) {
    return { reachable: true };
  }

  return {
    reachable: true,
    accountId: String(account.accountId || ''),
    configured: account.configured === true,
    running: account.running === true,
    connected: account.connected === true,
    lastError: typeof account.lastError === 'string' ? account.lastError : undefined,
  };
}

function isPluginConfigured(rawConfig: Record<string, unknown>, pluginId: string): boolean {
  const plugins = rawConfig.plugins as Record<string, unknown> | undefined;
  const allow = Array.isArray(plugins?.allow) ? plugins?.allow.map((entry) => String(entry || '').trim()) : [];
  if (allow.includes(pluginId)) return true;

  const entries = plugins?.entries as Record<string, unknown> | undefined;
  const entry = entries?.[pluginId] as Record<string, unknown> | undefined;
  if (entry && entry.enabled !== false) return true;

  const installs = plugins?.installs as Record<string, unknown> | undefined;
  if (installs?.[pluginId]) return true;

  const load = plugins?.load as Record<string, unknown> | undefined;
  const paths = Array.isArray(load?.paths) ? load.paths.map((entry) => String(entry || '').trim()) : [];
  return paths.some((entry) => entry.toLowerCase().includes(pluginId.toLowerCase()));
}

function buildTelegramChannelStatus(
  rawConfig: Record<string, unknown>,
  runtimeReport: GatewayChannelsStatusReport | null
): NotificationChannelStatus {
  const telegram = (rawConfig.channels as Record<string, unknown> | undefined)?.telegram as Record<string, unknown> | undefined;
  const diagnostics: string[] = [];
  const botToken = String(telegram?.botToken || '').trim();
  const allowFrom = getStringList(telegram?.allowFrom);
  const dmPolicy = String(telegram?.dmPolicy || 'pairing');
  const groupPolicy = String(telegram?.groupPolicy || 'allowlist');
  const requireMention = (((telegram?.groups as Record<string, unknown> | undefined)?.['*'] as Record<string, unknown> | undefined)?.requireMention) !== false;
  const enabled = telegram?.enabled !== false && Boolean(telegram);

  if (enabled && !botToken) diagnostics.push('缺少 Bot Token。');
  if (dmPolicy === 'allowlist' && allowFrom.length === 0) diagnostics.push('私聊策略设为"仅允许名单"，但还没有填写 allowFrom。');
  if (dmPolicy === 'open' && !allowFrom.includes('*')) diagnostics.push('私聊策略设为"全部放行"时，allowFrom 需要包含 *。');
  if (groupPolicy === 'allowlist' && allowFrom.length === 0) diagnostics.push('群聊策略设为"仅允许名单"时，建议同步配置 allowFrom。');

  return {
    id: 'telegram',
    title: 'Telegram',
    configured: Boolean(botToken),
    enabled,
    pluginReady: true,
    diagnostics,
    runtime: buildChannelRuntimeSummary(runtimeReport, 'telegram'),
    config: {
      enabled,
      botTokenMasked: maskSecret(botToken),
      botToken,
      dmPolicy,
      groupPolicy,
      allowFrom,
      requireMention,
    },
  };
}

function buildFeishuChannelStatus(
  rawConfig: Record<string, unknown>,
  runtimeReport: GatewayChannelsStatusReport | null
): NotificationChannelStatus {
  const feishu = (rawConfig.channels as Record<string, unknown> | undefined)?.feishu as Record<string, unknown> | undefined;
  const diagnostics: string[] = [];
  const appId = String(feishu?.appId || '').trim();
  const appSecret = String(feishu?.appSecret || '').trim();
  const connectionMode = String(feishu?.connectionMode || 'websocket');
  const verificationToken = String(feishu?.verificationToken || '').trim();
  const dmPolicy = String(feishu?.dmPolicy || 'pairing');
  const groupPolicy = String(feishu?.groupPolicy || 'allowlist');
  const requireMention = feishu?.requireMention !== false;
  const allowFrom = getStringList(feishu?.allowFrom);
  const enabled = feishu?.enabled !== false && Boolean(feishu);
  const pluginReady = isPluginConfigured(rawConfig, 'feishu');

  if (!pluginReady) diagnostics.push('当前配置里还没有明显的飞书插件启用信息，保存配置后仍需确认 OpenClaw 已加载 feishu 插件。');
  if (enabled && !appId) diagnostics.push('缺少 App ID。');
  if (enabled && !appSecret) diagnostics.push('缺少 App Secret。');
  if (connectionMode === 'webhook' && !verificationToken) diagnostics.push('Webhook 模式需要填写 Verification Token。');
  if (dmPolicy === 'allowlist' && allowFrom.length === 0) diagnostics.push('私聊策略设为"仅允许名单"时，建议填写 allowFrom。');

  return {
    id: 'feishu',
    title: '飞书',
    configured: Boolean(appId && appSecret),
    enabled,
    pluginReady,
    diagnostics,
    runtime: buildChannelRuntimeSummary(runtimeReport, 'feishu'),
    config: {
      enabled,
      appId,
      appSecretMasked: maskSecret(appSecret),
      appSecret,
      connectionMode,
      verificationToken,
      verificationTokenMasked: maskSecret(verificationToken),
      dmPolicy,
      groupPolicy,
      requireMention,
      allowFrom,
    },
  };
}

export function getOpenClawCliCommand(projectPath: string, args: string[]): { file: string; args: string[] } {
  const pm = detectProjectPackageManager(projectPath);
  if (pm === 'pnpm') {
    const invocation = getPnpmInvocation();
    return { file: invocation.file, args: [...invocation.args, 'openclaw', ...args] };
  }
  return { file: 'npm', args: ['run', 'openclaw', '--', ...args] };
}

export function buildGatewayCallCommand(projectPath: string, gatewayPort: number, gatewayToken: string, method: string, params: Record<string, unknown>) {
  return getOpenClawCliCommand(projectPath, [
    'gateway',
    'call',
    method,
    '--json',
    '--url',
    `ws://127.0.0.1:${gatewayPort}`,
    '--token',
    gatewayToken,
    '--params',
    JSON.stringify(params),
  ]);
}

function tryParseJsonObject(raw: string | undefined): Record<string, unknown> | null {
  const text = String(raw || '').trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getOpenClawGatewayChannelsReport(
  config: Record<string, unknown>,
  options: { probe?: boolean; timeoutMs?: number } = {}
): GatewayChannelsStatusReport | null {
  const projectPath = getOpenClawProjectPath(config);
  if (!projectPath || !isOpenClawProjectDir(projectPath)) {
    return null;
  }
  const gatewayPort = Number(config.gatewayPort || DEFAULT_GATEWAY_PORT);
  const gatewayToken = readGatewayToken(config);
  if (!gatewayToken) {
    return null;
  }

  const gatewayCall = buildGatewayCallCommand(projectPath, gatewayPort, gatewayToken, 'channels.status', {
    probe: options.probe === true,
    timeoutMs: options.timeoutMs || 3000,
  });
  const result = runCommandArgs(gatewayCall.file, projectPath, {
    args: gatewayCall.args,
    env: getManagedOpenClawEnv(config),
    timeout: 20000,
    ignoreError: true,
    silent: true,
  });
  if (!result.success) {
    return null;
  }

  const parsed = tryParseJsonObject(result.stdout);
  if (!parsed) {
    return null;
  }

  return parsed as GatewayChannelsStatusReport;
}

export function getNotificationChannelsStatus(config: Record<string, unknown>, options: { probe?: boolean } = {}) {
  const snapshot = readManagedOpenClawConfig(config);
  const runtimeReport = getOpenClawGatewayChannelsReport(config, {
    probe: options.probe === true,
    timeoutMs: options.probe === true ? 8000 : 3000,
  });
  const telegram = buildTelegramChannelStatus(snapshot.config, runtimeReport);
  const feishu = buildFeishuChannelStatus(snapshot.config, runtimeReport);

  return {
    success: true,
    configPath: snapshot.path,
    configExists: snapshot.exists,
    gatewayReachable: !!runtimeReport,
    channels: {
      telegram,
      feishu,
    },
  };
}

function listSkillsFromRoot(rootDir: string, source: string, removable: boolean): InstalledSkillEntry[] {
  if (!rootDir || !fs.existsSync(rootDir)) {
    return [];
  }
  try {
    return fs.readdirSync(rootDir).flatMap((entryName: string) => {
      const entryPath = path.join(rootDir, entryName);
      if (!fs.statSync(entryPath).isDirectory()) {
        return [];
      }
      if (!fs.existsSync(path.join(entryPath, 'SKILL.md'))) {
        return [];
      }
      return [{
        id: entryName,
        name: entryName,
        source,
        removable,
      }];
    });
  } catch {
    return [];
  }
}

function getInstalledOpenClawSkills(config: Record<string, unknown>): InstalledSkillEntry[] {
  const projectPath = getOpenClawProjectPath(config);
  if (!projectPath || !isOpenClawProjectDir(projectPath)) {
    return [];
  }

  const workspaceDir = resolveOpenClawWorkspaceDir(config);
  const runtimeConfig = readOpenClawRuntimeConfig(config);
  const skills = runtimeConfig.skills as Record<string, unknown> | undefined;
  const load = skills?.load as Record<string, unknown> | undefined;
  const extraDirs = Array.isArray(load?.extraDirs)
    ? load?.extraDirs
      .map((dir) => String(dir || '').trim())
      .filter(Boolean)
    : [];

  const sources: Array<{ dir: string; source: string; removable: boolean }> = [
    { dir: path.join(projectPath, 'skills'), source: 'OpenClaw 内置', removable: false },
    { dir: getManagedOpenClawSkillsDir(config), source: 'OpenClaw 已管理', removable: true },
    { dir: path.join(os.homedir(), '.agents', 'skills'), source: '个人 .agents', removable: true },
    { dir: path.join(workspaceDir, '.agents', 'skills'), source: '项目 .agents', removable: true },
    { dir: path.join(workspaceDir, 'skills'), source: '工作区', removable: true },
    ...extraDirs.map((dir) => ({ dir: path.resolve(dir), source: '额外目录', removable: false })),
  ];

  const merged = new Map<string, InstalledSkillEntry>();
  for (const source of sources) {
    for (const skill of listSkillsFromRoot(source.dir, source.source, source.removable)) {
      merged.set(skill.id, skill);
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.id.localeCompare(b.id));
}

export async function getInstalledOpenClawSkillsFromStatus(config: Record<string, unknown>): Promise<InstalledSkillEntry[]> {
  const projectPath = getOpenClawProjectPath(config);
  if (!projectPath || !isOpenClawProjectDir(projectPath)) {
    return [];
  }
  const gatewayPort = Number(config.gatewayPort || DEFAULT_GATEWAY_PORT);
  const gatewayToken = readGatewayToken(config);

  if (gatewayToken) {
    const gatewayCall = buildGatewayCallCommand(projectPath, gatewayPort, gatewayToken, 'skills.status', {});
    const gatewayResult = runCommandArgs(gatewayCall.file, projectPath, {
      args: gatewayCall.args,
      env: getManagedOpenClawEnv(config),
      timeout: 30000,
      ignoreError: true,
      silent: true,
    });
    if (gatewayResult.success) {
      const parsed = tryParseJsonObject(gatewayResult.stdout);
      if (parsed && Array.isArray((parsed as OpenClawSkillStatusReport).skills)) {
        return mapSkillStatusReport(parsed as OpenClawSkillStatusReport);
      }
    }
  }

  const listCommand = getOpenClawCliCommand(projectPath, ['skills', 'list', '--json']);
  const listResult = runCommandArgs(listCommand.file, projectPath, {
    args: listCommand.args,
    env: getManagedOpenClawEnv(config),
    timeout: 30000,
    ignoreError: true,
    silent: true,
  });
  if (listResult.success) {
    const parsed = tryParseJsonObject(listResult.stdout);
    if (parsed && Array.isArray((parsed as OpenClawSkillStatusReport).skills)) {
      return mapSkillStatusReport(parsed as OpenClawSkillStatusReport);
    }
  }

  return getInstalledOpenClawSkills(config);
}

function getOpenClawGatewaySkillReport(config: Record<string, unknown>): OpenClawSkillStatusReport | null {
  const projectPath = getOpenClawProjectPath(config);
  if (!projectPath || !isOpenClawProjectDir(projectPath)) {
    return null;
  }
  const gatewayPort = Number(config.gatewayPort || DEFAULT_GATEWAY_PORT);
  const gatewayToken = readGatewayToken(config);
  if (!gatewayToken) {
    return null;
  }

  const gatewayCall = buildGatewayCallCommand(projectPath, gatewayPort, gatewayToken, 'skills.status', {});
  const gatewayResult = runCommandArgs(gatewayCall.file, projectPath, {
    args: gatewayCall.args,
    env: getManagedOpenClawEnv(config),
    timeout: 30000,
    ignoreError: true,
    silent: true,
  });
  if (!gatewayResult.success) {
    return null;
  }

  const parsed = tryParseJsonObject(gatewayResult.stdout);
  if (!parsed || !Array.isArray((parsed as OpenClawSkillStatusReport).skills)) {
    return null;
  }
  return parsed as OpenClawSkillStatusReport;
}

export function getOpenClawSkillStatusEntry(
  config: Record<string, unknown>,
  skillId: string
): Record<string, unknown> | null {
  const projectPath = getOpenClawProjectPath(config);
  if (!projectPath || !isOpenClawProjectDir(projectPath)) {
    return null;
  }

  const normalizedSkillId = String(skillId || '').trim();
  if (!normalizedSkillId) {
    return null;
  }

  const gatewayReport = getOpenClawGatewaySkillReport(config);
  const gatewayEntry = Array.isArray(gatewayReport?.skills)
    ? gatewayReport!.skills.find((entry) => String(entry?.name || '').trim() === normalizedSkillId)
    : null;
  if (gatewayEntry) {
    return gatewayEntry as Record<string, unknown>;
  }

  const infoCommand = getOpenClawCliCommand(projectPath, ['skills', 'info', normalizedSkillId, '--json']);
  const infoResult = runCommandArgs(infoCommand.file, projectPath, {
    args: infoCommand.args,
    env: getManagedOpenClawEnv(config),
    timeout: 30000,
    ignoreError: true,
    silent: true,
  });
  if (!infoResult.success) {
    return null;
  }

  const parsed = tryParseJsonObject(infoResult.stdout);
  if (!parsed || String(parsed.name || '').trim() !== normalizedSkillId) {
    return null;
  }

  return parsed;
}

export function resolveRemovableSkillPath(config: Record<string, unknown>, skillId: string): { path: string; source: string } | null {
  const projectPath = getOpenClawProjectPath(config);
  if (!projectPath || !isOpenClawProjectDir(projectPath)) {
    return null;
  }

  const workspaceDir = resolveOpenClawWorkspaceDir(config);
  const candidates = [
    { path: path.join(workspaceDir, 'skills', skillId), source: '工作区' },
    { path: path.join(workspaceDir, '.agents', 'skills', skillId), source: '项目 .agents' },
    { path: path.join(os.homedir(), '.agents', 'skills', skillId), source: '个人 .agents' },
    { path: path.join(getManagedOpenClawSkillsDir(config), skillId), source: 'OpenClaw 已管理' },
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate.path, 'SKILL.md'))) {
      return candidate;
    }
  }

  return null;
}

function isSecretRefLike(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.source === 'string' && typeof record.id === 'string';
}

export function resolveGatewayToken(config?: Record<string, unknown>): GatewayTokenResolution {
  const envSource = config ? getManagedOpenClawEnv(config) : process.env;
  const envToken = String(envSource.OPENCLAW_GATEWAY_TOKEN || envSource.CLAWDBOT_GATEWAY_TOKEN || '').trim();
  if (envToken) {
    return {
      token: envToken,
      configured: true,
      secretRefConfigured: false,
    };
  }

  const configJson = readOpenClawRuntimeConfig(config);
  const gateway = configJson?.gateway as Record<string, unknown> | undefined;
  const auth = gateway?.auth as Record<string, unknown> | undefined;
  const configuredToken = auth?.token;

  if (typeof configuredToken === 'string') {
    const token = configuredToken.trim();
    return {
      token: token || null,
      configured: !!token,
      secretRefConfigured: false,
    };
  }

  if (isSecretRefLike(configuredToken)) {
    return {
      token: null,
      configured: true,
      secretRefConfigured: true,
      unavailableReason:
        'gateway.auth.token 由 SecretRef 管理，龙虾助手不会直接读取它。若需自动认证或网关调用，请在启动环境中提供 OPENCLAW_GATEWAY_TOKEN。',
    };
  }

  return {
    token: null,
    configured: false,
    secretRefConfigured: false,
  };
}

export function readGatewayToken(config?: Record<string, unknown>): string | null {
  return resolveGatewayToken(config).token;
}

export function choosePreferredSkillInstallOption(
  options: Array<Record<string, unknown>>
): Record<string, unknown> | undefined {
  if (!Array.isArray(options) || options.length === 0) {
    return undefined;
  }

  const ranked = options
    .map((option, index) => {
      const kind = String(option.kind || '').trim();
      let score = 100 + index;
      if (kind === 'node' && (checkCommand('pnpm') || checkCommand('npm'))) score = 10 + index;
      else if (kind === 'brew' && process.platform === 'darwin' && checkCommand('brew')) score = 20 + index;
      else if (kind === 'uv' && checkCommand('uv')) score = 30 + index;
      else if (kind === 'go' && checkCommand('go')) score = 40 + index;
      else if (kind === 'download') score = 90 + index;
      return { option, score };
    })
    .sort((a, b) => a.score - b.score);

  return ranked[0]?.option;
}

export function normalizeSkillInstallOptions(skill: Record<string, unknown> | null | undefined): SkillInstallOptionSummary[] {
  if (!skill || !Array.isArray(skill.install)) {
    return [];
  }

  return skill.install
    .map((option) => {
      const record = option as Record<string, unknown>;
      const id = String(record.id || '').trim();
      if (!id) {
        return null;
      }

      const kind = String(record.kind || '').trim();
      const label = String(record.label || kind || id).trim();
      const bins = Array.isArray(record.bins)
        ? record.bins.map((bin) => String(bin || '').trim()).filter(Boolean)
        : [];

      return {
        id,
        kind,
        label,
        bins,
      };
    })
    .filter((option): option is SkillInstallOptionSummary => option !== null);
}

export async function getGatewayHealthStatus(config: Record<string, unknown>): Promise<boolean> {
  const gatewayPort = Number(config.gatewayPort || DEFAULT_GATEWAY_PORT);
  const result = await fetchWithTimeout(`http://127.0.0.1:${gatewayPort}/health`, { method: 'GET' }, 2000);
  return !!result.success;
}
