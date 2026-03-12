/**
 * Gateway 服务
 * 负责 OpenClaw 网关的启动、停止和生命周期管理
 *
 * 已迁移到 runtime/gateway/gateway-service.ts
 */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const os = require('os') as typeof import('os');
const crypto = require('crypto') as typeof import('crypto');
const { spawn, execSync } = require('child_process') as typeof import('child_process');

const { checkPortAvailability } = require('../../core/diagnostics/system-check') as typeof import('../../core/diagnostics/system-check');
const {
  validateInstallPathForUse,
} = require('../../platform/path/platform-paths') as typeof import('../../platform/path/platform-paths');
const {
  getManagedOpenClawConfigPath,
  getManagedOpenClawStateDir,
  getOpenClawStartCommand,
  isOpenClawProjectDir,
  mergeOpenClawConfigSections,
  normalizeProjectPath,
  readManagedOpenClawConfig,
} = require('../openclaw/openclaw-project') as typeof import('../openclaw/openclaw-project');
const {
  buildCustomProviderConfig,
  buildEndpointIdFromUrl,
  CUSTOM_PROVIDER_DEFAULT_CONTEXT_WINDOW,
  CUSTOM_PROVIDER_DEFAULT_MAX_TOKENS,
  normalizeApiFormat,
  normalizeEndpointId,
  resolveCustomBaseUrlForConfig,
} = require('../../core/providers/provider-utils') as typeof import('../../core/providers/provider-utils');
const { parseCommandForSpawn, resolveSpawnExecutable } = require('../../shared/process/process-utils') as typeof import('../../shared/process/process-utils');
const { checkOpenClawRuntimeReadiness } = require('../../core/deploy/deployment-service') as typeof import('../../core/deploy/deployment-service');
const { getCommandLookupEnv } = require('../../core/diagnostics/system-check') as typeof import('../../core/diagnostics/system-check');

type GatewayStatus = 'running' | 'stopped' | 'starting' | 'stopping';

type ProviderRecord = {
  envKey: string;
  baseUrl?: string;
  type?: string;
  apiFormat?: string;
  models?: Array<{ id: string; name?: string; contextWindow?: number; maxTokens?: number }>;
};

// Mutex lock for protecting critical sections in gateway lifecycle operations
class GatewayMutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

const gatewayMutex = new GatewayMutex();

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

const STARTUP_HEALTH_TIMEOUT_MS = 15000;
const STARTUP_HEALTH_POLL_INTERVAL_MS = 500;

export async function stopGatewayProcess(
  config: Record<string, unknown>,
  deps: GatewayLifecycleDeps,
  timeoutMs: number = 10000
): Promise<Record<string, unknown>> {
  // Acquire mutex lock to protect critical section
  await gatewayMutex.acquire();
  try {
    return await stopGatewayProcessInternal(config, deps, timeoutMs);
  } finally {
    gatewayMutex.release();
  }
}

async function stopGatewayProcessInternal(
  config: Record<string, unknown>,
  deps: GatewayLifecycleDeps,
  timeoutMs: number
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
      if (os.platform() === 'win32' && processRef.pid) {
        try {
          execSync(`taskkill /F /T /PID ${processRef.pid}`, { stdio: 'ignore' });
        } catch {
          processRef.kill();
        }
      } else {
        const killed = processRef.kill();
        if (!killed) {
          finish({ ok: false, error: '停止信号发送失败，请稍后重试' });
        }
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
  // Acquire mutex lock to protect critical section
  await gatewayMutex.acquire();
  try {
    return await handleStartInternal(config, deps);
  } finally {
    gatewayMutex.release();
  }
}

async function handleStartInternal(
  config: Record<string, unknown>,
  deps: GatewayLifecycleDeps
): Promise<Record<string, unknown>> {
  if (!config.apiKey) {
    return { success: false, error: '请先配置 API Key' };
  }

  // 离线包模式：openclawPath 指向 openclaw 子目录
  // 传统模式：installPath 直接指向 openclaw 项目
  const projectPath = config.useBundledNode && config.openclawPath
    ? String(config.openclawPath)
    : String(config.installPath || '').trim();

  const installPathCheck = validateInstallPathForUse(projectPath, {
    requireProject: true,
  });
  if (!installPathCheck.valid) {
    return { success: false, error: installPathCheck.error || '请先部署' };
  }
  const installPath = installPathCheck.normalizedPath;
  if (!installPath || !isOpenClawProjectDir(installPath)) {
    return { success: false, error: '请先部署' };
  }
  const currentStatus = deps.getGatewayStatus();
  if (currentStatus === 'starting' || currentStatus === 'running') {
    return { success: true, message: '服务已在运行中' };
  }

  const runtimeReadiness = checkOpenClawRuntimeReadiness(installPath, {
    useBundledNode: !!config.useBundledNode,
  });
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
        ).openclawConfig;
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
      const providerId = String(config.provider || providerKey);
      const modelRef = `${providerId}/${model}`;
      // Runtime type check for provider.models
      const providerModels = provider.models;
      const catalogModels = Array.isArray(providerModels) ? providerModels : [];
      const catalogModel = catalogModels.find((m) => typeof m === 'object' && m !== null && 'id' in m && m.id === model);

      (openclawConfig.models as Record<string, unknown>).providers = {
        [providerId]: {
          baseUrl: baseUrl || provider.baseUrl || '',
          apiKey: config.apiKey,
          api: apiFormat,
          models: [
            {
              id: model,
              name: catalogModel?.name || model,
              contextWindow: catalogModel?.contextWindow || CUSTOM_PROVIDER_DEFAULT_CONTEXT_WINDOW,
              maxTokens: catalogModel?.maxTokens || CUSTOM_PROVIDER_DEFAULT_MAX_TOKENS,
              input: ['text'],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              reasoning: false,
            },
          ],
        },
      };
      (openclawConfig as Record<string, unknown>).agents = {
        defaults: {
          model: { primary: modelRef },
        },
      };
    }

    const managedConfigPath = getManagedOpenClawConfigPath(config);
    const configDir = path.dirname(managedConfigPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // 预生成 gateway token，写入配置并通过环境变量传入
    // 这样无论 OpenClaw 是否持久化 token，龙虾助手都掌握 token
    const gatewayToken = crypto.randomBytes(24).toString('hex');
    const existingManagedConfig = readManagedOpenClawConfig(config).config;
    const configWithToken = {
      ...openclawConfig,
      gateway: {
        ...((existingManagedConfig.gateway as Record<string, unknown>) || {}),
        ...((openclawConfig.gateway as Record<string, unknown>) || {}),
        auth: {
          ...(((existingManagedConfig.gateway as Record<string, unknown>)?.auth as Record<string, unknown>) || {}),
          mode: 'token',
          token: gatewayToken,
        },
      },
    };
    const mergedOpenClawConfig = mergeOpenClawConfigSections(existingManagedConfig, configWithToken);
    fs.writeFileSync(managedConfigPath, JSON.stringify(mergedOpenClawConfig, null, 2));
    console.log(`[配置] 已写入: ${managedConfigPath}`);

    const env: NodeJS.ProcessEnv = {
      ...getCommandLookupEnv(),
      OPENCLAW_GATEWAY_PORT: String(gatewayPort),
      OPENCLAW_STATE_DIR: getManagedOpenClawStateDir(config),
      OPENCLAW_CONFIG_PATH: managedConfigPath,
      OPENCLAW_GATEWAY_TOKEN: gatewayToken,
      [provider.envKey]: String(config.apiKey || ''),
    };

    // 使用内置 Node.js（如果配置了）
    const bundledNodePath = config.useBundledNode && config.bundledNodePath
      ? String(config.bundledNodePath)
      : undefined;

    const startCommand = getOpenClawStartCommand(installPath, gatewayPort, bundledNodePath);
    deps.appendLog('info', `启动命令: ${startCommand}`);

    const isWin = os.platform() === 'win32';
    let processRef;

    if (isWin) {
      // Windows: 使用 shell 执行完整命令字符串，确保路径中的空格被正确处理
      processRef = spawn(startCommand, [], {
        cwd: installPath,
        env,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } else {
      // POSIX: 使用 parseCommandForSpawn 解析命令
      const parsedCommand = parseCommandForSpawn(startCommand);
      if (!parsedCommand.file) {
        deps.setGatewayStatus('stopped');
        return { success: false, error: '无法解析 OpenClaw 启动命令' };
      }
      parsedCommand.file = resolveSpawnExecutable(parsedCommand.file);

      processRef = spawn(parsedCommand.file, parsedCommand.args, {
        cwd: installPath,
        env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }
    deps.setGatewayProcess(processRef);
    let startupSettled = false;
    let lastStderr = '';
    let lastStdout = '';

    processRef.stdout?.on('data', (d: Buffer) => {
      const message = d.toString().trim();
      if (!message) return;
      lastStdout = message;
      deps.appendLog('info', message);
    });

    processRef.stderr?.on('data', (d: Buffer) => {
      const message = d.toString().trim();
      if (!message) return;
      lastStderr = message;
      deps.appendLog('error', message);
    });

    const startupResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      let pollTimer: NodeJS.Timeout | null = null;
      let timeoutTimer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (pollTimer) clearTimeout(pollTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        processRef.off('error', onStartupError);
        processRef.off('exit', onStartupExit);
      };

      const settle = (result: { ok: boolean; error?: string }) => {
        if (startupSettled) return;
        startupSettled = true;
        cleanup();
        resolve(result);
      };

      const onStartupError = (err: Error) => {
        settle({ ok: false, error: `进程启动失败: ${err.message}` });
      };

      const onStartupExit = (code: number | null) => {
        const details = lastStderr || lastStdout || (code !== null ? `进程已退出 (code: ${code})` : '进程启动后立即退出');
        settle({ ok: false, error: details });
      };

      const pollHealth = async () => {
        if (startupSettled) return;
        try {
          const healthy = await deps.checkExternalGatewayHealth(config);
          if (healthy) {
            settle({ ok: true });
            return;
          }
        } catch {}
        if (!startupSettled) {
          pollTimer = setTimeout(() => {
            void pollHealth();
          }, STARTUP_HEALTH_POLL_INTERVAL_MS);
        }
      };

      processRef.once('error', onStartupError);
      processRef.once('exit', onStartupExit);

      timeoutTimer = setTimeout(() => {
        const details = lastStderr || lastStdout || `等待 OpenClaw 健康检查超时 (${Math.round(STARTUP_HEALTH_TIMEOUT_MS / 1000)}s)`;
        settle({ ok: false, error: details });
      }, STARTUP_HEALTH_TIMEOUT_MS);

      void pollHealth();
    });

    // Define persistent event handlers for the process lifecycle
    const onProcessError = (err: Error) => {
      deps.setGatewayStatus('stopped');
      if (deps.getGatewayProcess() === processRef) {
        deps.setGatewayProcess(null);
      }
      deps.appendLog('error', `进程错误: ${err.message}`);
      console.error('[进程错误]', err);
    };

    const onProcessExit = (code: number | null, signal: string | null) => {
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
    };

    // Helper function to completely clean up the process
    const cleanupProcess = (removeListeners: boolean = true) => {
      if (removeListeners) {
        processRef.off('error', onProcessError);
        processRef.off('exit', onProcessExit);
        // Also remove stdout/stderr listeners to prevent memory leaks
        processRef.stdout?.removeAllListeners('data');
        processRef.stderr?.removeAllListeners('data');
      }
      if (!processRef.killed) {
        try {
          if (os.platform() === 'win32' && processRef.pid) {
            execSync(`taskkill /F /T /PID ${processRef.pid}`, { stdio: 'ignore' });
          } else {
            processRef.kill();
          }
        } catch {
          // Ignore kill errors during cleanup
        }
      }
    };

    processRef.on('error', onProcessError);
    processRef.on('exit', onProcessExit);

    if (!startupResult.ok) {
      if (deps.getGatewayProcess() === processRef) {
        deps.setGatewayProcess(null);
      }
      // Completely clean up the process and all listeners
      cleanupProcess(true);
      deps.setGatewayStatus('stopped');
      return { success: false, error: startupResult.error || 'OpenClaw 启动失败' };
    }

    deps.setGatewayStatus('running');
    return { success: true, status: await deps.getGatewayRuntimeStatusAsync(config) };
  } catch (error) {
    deps.setGatewayStatus('stopped');
    deps.logError(error as Error, 'start');
    return { success: false, error: deps.getUserFriendlyMessage(error) };
  }
}
