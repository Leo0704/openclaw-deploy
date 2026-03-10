const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const { spawn } = require('child_process') as typeof import('child_process');

const { checkPortAvailability } = require('./system-check') as typeof import('./system-check');
const {
  getManagedOpenClawConfigPath,
  getManagedOpenClawStateDir,
  getOpenClawStartCommand,
  isOpenClawProjectDir,
  mergeOpenClawConfigSections,
  readManagedOpenClawConfig,
} = require('./openclaw-project') as typeof import('./openclaw-project');
const {
  buildCustomProviderConfig,
  buildEndpointIdFromUrl,
  CUSTOM_PROVIDER_DEFAULT_CONTEXT_WINDOW,
  CUSTOM_PROVIDER_DEFAULT_MAX_TOKENS,
  normalizeApiFormat,
  normalizeEndpointId,
  resolveCustomBaseUrlForConfig,
} = require('./provider-utils') as typeof import('./provider-utils');
const { parseCommandForSpawn, resolveSpawnExecutable } = require('./process-utils') as typeof import('./process-utils');
const { checkOpenClawRuntimeReadiness } = require('./deployment-service') as typeof import('./deployment-service');
const { getCommandLookupEnv } = require('./system-check') as typeof import('./system-check');

type GatewayStatus = 'running' | 'stopped' | 'starting' | 'stopping';

type ProviderRecord = {
  envKey: string;
  baseUrl?: string;
  type?: string;
  apiFormat?: string;
};

type GatewayStateDeps = {
  getGatewayProcess: () => import('child_process').ChildProcess | null;
  setGatewayProcess: (processRef: import('child_process').ChildProcess | null) => void;
  getGatewayStatus: () => GatewayStatus;
  setGatewayStatus: (status: GatewayStatus) => void;
};

type GatewayLifecycleDeps = GatewayStateDeps & {
  appendLog: (level: 'info' | 'success' | 'error' | 'warning', message: string) => void;
  checkExternalGatewayHealth: (config: Record<string, unknown>) => Promise<boolean>;
  getGatewayRuntimeStatusAsync: (config: Record<string, unknown>) => Promise<Record<string, unknown>>;
  getUserFriendlyMessage: (error: unknown) => string;
  logError: (error: Error, context?: string) => void;
  providers: Record<string, ProviderRecord>;
  defaultGatewayPort: number;
};

export async function stopGatewayProcess(
  config: Record<string, unknown>,
  deps: GatewayLifecycleDeps,
  timeoutMs: number = 10000
): Promise<Record<string, unknown>> {
  const gatewayProcess = deps.getGatewayProcess();
  if (!gatewayProcess) {
    const externallyRunning = await deps.checkExternalGatewayHealth(config);
    if (externallyRunning) {
      deps.setGatewayStatus('running');
      return {
        success: false,
        error: '检测到 OpenClaw 仍在运行，但不是由当前龙虾助手进程启动。请先关闭外部实例后再试。',
      };
    }
    deps.setGatewayStatus('stopped');
    return { success: true };
  }

  const processRef = gatewayProcess;
  deps.setGatewayStatus('stopping');

  const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      cleanup();
      resolve({ ok: false, error: '等待 OpenClaw 进程退出超时，请稍后重试' });
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      processRef.off('exit', onExit);
      processRef.off('error', onError);
    };

    const finish = (next: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(next);
    };

    const onExit = () => finish({ ok: true });
    const onError = (err: Error) => finish({ ok: false, error: err.message });

    processRef.once('exit', onExit);
    processRef.once('error', onError);

    try {
      const killed = processRef.kill();
      if (!killed) {
        finish({ ok: false, error: '停止信号发送失败，请稍后重试' });
      }
    } catch (error) {
      finish({ ok: false, error: `停止失败: ${(error as Error).message}` });
    }
  });

  if (!result.ok) {
    if (deps.getGatewayProcess() === processRef) {
      deps.setGatewayStatus('running');
    }
    return { success: false, error: result.error || '停止失败' };
  }

  if (deps.getGatewayProcess() === processRef) {
    deps.setGatewayProcess(null);
  }
  deps.setGatewayStatus('stopped');
  deps.appendLog('info', '服务已停止');
  return { success: true };
}

export async function handleStart(
  config: Record<string, unknown>,
  deps: GatewayLifecycleDeps
): Promise<Record<string, unknown>> {
  if (!config.apiKey) {
    return { success: false, error: '请先配置 API Key' };
  }
  if (!config.installPath || !isOpenClawProjectDir(config.installPath as string)) {
    return { success: false, error: '请先部署' };
  }
  const currentStatus = deps.getGatewayStatus();
  if (currentStatus === 'starting' || currentStatus === 'running') {
    return { success: true, message: '服务已在运行中' };
  }

  const runtimeReadiness = checkOpenClawRuntimeReadiness(config.installPath as string);
  if (!runtimeReadiness.ready) {
    return { success: false, error: runtimeReadiness.error || 'OpenClaw 运行环境未就绪' };
  }

  try {
    deps.setGatewayStatus('starting');
    const providerKey = String(config.provider || 'custom');
    const provider = deps.providers[providerKey] || deps.providers.custom;
    const baseUrl = String(config.baseUrl || provider.baseUrl || '');
    const apiFormat = normalizeApiFormat(config.apiFormat || provider.apiFormat || 'openai-completions');
    const model = String(config.model || config.customModelId || '');
    const customModelAlias = String(config.customModelAlias || '').trim();
    const gatewayPort = Number(config.gatewayPort || deps.defaultGatewayPort);

    const availability = await checkPortAvailability(gatewayPort);
    if (!availability.available) {
      deps.setGatewayStatus('stopped');
      return { success: false, error: availability.message || '端口已被占用，请更换后重试' };
    }

    let openclawConfig: Record<string, unknown> = {
      models: {
        mode: 'merge',
        providers: {} as Record<string, unknown>,
      },
    };

    if (config.provider === 'custom' || provider.type === 'proxy') {
      const providerBaseUrl = resolveCustomBaseUrlForConfig(baseUrl, model);
      if (config.provider === 'custom') {
        openclawConfig = buildCustomProviderConfig(
          {
            ...config,
            apiFormat,
            baseUrl: providerBaseUrl,
            customModelAlias,
          },
          providerBaseUrl,
          model
        );
      } else {
        const proxyProviderId = normalizeEndpointId(config.customEndpointId) || buildEndpointIdFromUrl(providerBaseUrl) || 'custom';
        (openclawConfig.models as Record<string, unknown>).providers = {
          [proxyProviderId]: {
            baseUrl: providerBaseUrl,
            apiKey: config.apiKey,
            api: apiFormat,
            models: [
              {
                id: model,
                name: model,
                contextWindow: CUSTOM_PROVIDER_DEFAULT_CONTEXT_WINDOW,
                maxTokens: CUSTOM_PROVIDER_DEFAULT_MAX_TOKENS,
                input: ['text'],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                reasoning: false,
              },
            ],
          },
        };
      }
    } else {
      (openclawConfig.models as Record<string, unknown>).providers = {
        default: {
          provider: config.provider,
          modelId: model,
        },
      };
    }

    const managedConfigPath = getManagedOpenClawConfigPath(config);
    const configDir = path.dirname(managedConfigPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    const existingManagedConfig = readManagedOpenClawConfig(config).config;
    const mergedOpenClawConfig = mergeOpenClawConfigSections(existingManagedConfig, openclawConfig);
    fs.writeFileSync(managedConfigPath, JSON.stringify(mergedOpenClawConfig, null, 2));
    console.log(`[配置] 已写入: ${managedConfigPath}`);

    const env: NodeJS.ProcessEnv = {
      ...getCommandLookupEnv(),
      PORT: String(gatewayPort),
      OPENCLAW_STATE_DIR: getManagedOpenClawStateDir(config),
      OPENCLAW_CONFIG_PATH: managedConfigPath,
      [provider.envKey]: String(config.apiKey || ''),
      OPENAI_BASE_URL: baseUrl,
      API_KEY: String(config.apiKey || ''),
      API_PROVIDER: String(config.provider || ''),
      MODEL: model,
    };

    if (provider.envKey !== 'OPENAI_API_KEY') {
      env.OPENAI_API_KEY = String(config.apiKey || '');
    }

    const startCommand = getOpenClawStartCommand(config.installPath as string, gatewayPort);
    deps.appendLog('info', `启动命令: ${startCommand}`);

    const parsedCommand = parseCommandForSpawn(startCommand);
    if (!parsedCommand.file) {
      deps.setGatewayStatus('stopped');
      return { success: false, error: '无法解析 OpenClaw 启动命令' };
    }
    parsedCommand.file = resolveSpawnExecutable(parsedCommand.file);

    const processRef = spawn(parsedCommand.file, parsedCommand.args, {
      cwd: config.installPath as string,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    deps.setGatewayProcess(processRef);
    let startupSettled = false;
    let lastStderr = '';

    const startupResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const settle = (result: { ok: boolean; error?: string }) => {
        if (startupSettled) return;
        startupSettled = true;
        resolve(result);
      };

      processRef.once('error', (err: Error) => {
        settle({ ok: false, error: `进程启动失败: ${err.message}` });
      });

      processRef.once('exit', (code: number | null) => {
        const details = lastStderr || (code !== null ? `进程已退出 (code: ${code})` : '进程启动后立即退出');
        settle({ ok: false, error: details });
      });

      setTimeout(() => settle({ ok: true }), 1200);
    });

    processRef.stdout?.on('data', (d: Buffer) => {
      deps.appendLog('info', d.toString().trim());
    });

    processRef.stderr?.on('data', (d: Buffer) => {
      lastStderr = d.toString().trim() || lastStderr;
      deps.appendLog('error', d.toString().trim());
    });

    processRef.on('spawn', () => {
      deps.setGatewayStatus('running');
    });

    processRef.on('error', (err: Error) => {
      deps.setGatewayStatus('stopped');
      if (deps.getGatewayProcess() === processRef) {
        deps.setGatewayProcess(null);
      }
      deps.appendLog('error', `进程错误: ${err.message}`);
      console.error('[进程错误]', err);
    });

    processRef.on('exit', (code: number | null, signal: string | null) => {
      if (deps.getGatewayProcess() === processRef) {
        deps.setGatewayProcess(null);
      }
      deps.setGatewayStatus('stopped');
      if (code !== 0 && code !== null) {
        deps.appendLog('warning', `进程已退出 (code: ${code})`);
      }
      if (signal) {
        deps.appendLog('info', `进程已结束 (signal: ${signal})`);
      }
    });

    if (!startupResult.ok) {
      if (deps.getGatewayProcess() === processRef) {
        deps.setGatewayProcess(null);
      }
      deps.setGatewayStatus('stopped');
      return { success: false, error: startupResult.error || 'OpenClaw 启动失败' };
    }

    return { success: true, status: await deps.getGatewayRuntimeStatusAsync(config) };
  } catch (error) {
    deps.setGatewayStatus('stopped');
    deps.logError(error as Error, 'start');
    return { success: false, error: deps.getUserFriendlyMessage(error) };
  }
}
