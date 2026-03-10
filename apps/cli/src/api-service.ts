const os = require('os') as typeof import('os');
const path = require('path') as typeof import('path');

const {
  checkDependencies,
  checkPortAvailability,
  performHealthChecks,
} = require('./system-check') as typeof import('./system-check');
const {
  checkNetworkConnectivity,
} = require('./network-utils') as typeof import('./network-utils');

type Awaitable<T> = T | Promise<T>;

type GatewayLifecycleDeps = {
  appendLog: (level: 'info' | 'success' | 'error' | 'warning', message: string) => void;
  checkExternalGatewayHealth: (config: Record<string, unknown>) => Promise<boolean>;
  getGatewayProcess: () => import('child_process').ChildProcess | null;
  setGatewayProcess: (processRef: import('child_process').ChildProcess | null) => void;
  getGatewayStatus: () => 'running' | 'stopped' | 'starting' | 'stopping';
  setGatewayStatus: (status: 'running' | 'stopped' | 'starting' | 'stopping') => void;
  getGatewayRuntimeStatusAsync: (config: Record<string, unknown>) => Promise<Record<string, unknown>>;
  getUserFriendlyMessage: (error: unknown) => string;
  logError: (error: Error, context?: string) => void;
  providers: Record<string, unknown>;
  defaultGatewayPort: number;
};

type ApiHandlerDeps = {
  activateLicense: (code: string, config: Record<string, unknown>) => Promise<Record<string, unknown>>;
  handleConfigAsync: (data: Record<string, unknown>, config: Record<string, unknown>) => Awaitable<Record<string, unknown>>;
  handleDeployStart: (data: Record<string, unknown>, config: Record<string, unknown>) => Record<string, unknown>;
  getDeployTaskSnapshot: () => Record<string, unknown>;
  handleTestConnection: (
    data: Record<string, unknown>,
    config: Record<string, unknown>,
    providers: Record<string, Record<string, unknown>>
  ) => Promise<Record<string, unknown>>;
  handleStart: (config: Record<string, unknown>, deps: any) => Promise<Record<string, unknown>>;
  stopGatewayProcess: (
    config: Record<string, unknown>,
    deps: any,
    timeoutMs?: number
  ) => Promise<Record<string, unknown>>;
  getGatewayRuntimeStatusAsync: (config: Record<string, unknown>) => Promise<Record<string, unknown>>;
  verifyLicenseStatus: (config: Record<string, unknown>) => Promise<Record<string, unknown>>;
  getInstalledOpenClawSkillsFromStatus: (config: Record<string, unknown>) => Promise<unknown[]>;
  handleSkillInstallOptions: (data: Record<string, unknown>, config: Record<string, unknown>) => Awaitable<Record<string, unknown>>;
  handleSkillInstall: (data: Record<string, unknown>, config: Record<string, unknown>) => Awaitable<Record<string, unknown>>;
  handleSkillUninstall: (data: Record<string, unknown>, config: Record<string, unknown>) => Awaitable<Record<string, unknown>>;
  getNotificationChannelsStatus: (
    config: Record<string, unknown>,
    options?: { probe?: boolean }
  ) => Awaitable<Record<string, unknown>>;
  handleSaveTelegramChannel: (data: Record<string, unknown>, config: Record<string, unknown>) => Awaitable<Record<string, unknown>>;
  handleSaveFeishuChannel: (data: Record<string, unknown>, config: Record<string, unknown>) => Awaitable<Record<string, unknown>>;
  handleUninstallOpenClaw: (
    config: Record<string, unknown>,
    deps: {
      stopGatewayProcess: (config: Record<string, unknown>, timeoutMs?: number) => Promise<Record<string, unknown>>;
      getGatewayRuntimeStatus: (config: Record<string, unknown>) => Record<string, unknown>;
      logError: (error: Error, context?: string) => void;
      clearLogs: () => void;
    }
  ) => Promise<Record<string, unknown>>;
  handleUpdateOpenClaw: (
    config: Record<string, unknown>,
    deps: {
      logError: (error: Error, context?: string) => void;
      getUserFriendlyMessage: (error: unknown) => string;
    }
  ) => Record<string, unknown>;
  getGatewayRuntimeStatus: (config: Record<string, unknown>) => Record<string, unknown>;
  getGatewayLifecycleDeps: () => any;
  getLogs: () => Array<{ time: string; level: string; message: string }>;
  clearLogs: () => void;
  logError: (error: Error, context?: string) => void;
  getUserFriendlyMessage: (error: unknown) => string;
  providers: Record<string, Record<string, unknown>>;
  clawhubMarketUrl: string;
  defaultGatewayPort: number;
};

export function createApiHandlers(deps: ApiHandlerDeps) {
  async function handleAPIAsync(
    action: string,
    data: Record<string, unknown>,
    config: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    switch (action) {
      case 'activate':
        return deps.activateLicense(data.code as string, config);

      case 'config':
        return deps.handleConfigAsync(data, config);

      case 'deploy':
      case 'deploy-start':
        return deps.handleDeployStart(data, config);

      case 'deploy-status':
        return deps.getDeployTaskSnapshot();

      case 'test-connection':
        return deps.handleTestConnection(data, config, deps.providers);

      case 'health-check':
        try {
          const healthResult = await performHealthChecks({
            installPath: (data.installPath as string) || path.join(os.homedir(), 'openclaw'),
            gatewayPort: (data.gatewayPort as number) || deps.defaultGatewayPort,
            requiredDiskSpace: 500 * 1024 * 1024,
          });
          return { success: true, ...healthResult };
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }

      case 'check-port':
        try {
          const port = (data.port as number) || deps.defaultGatewayPort;
          const result = await checkPortAvailability(port);
          return { success: true, ...result };
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }

      case 'check-network':
        try {
          const results = await checkNetworkConnectivity();
          return { success: true, results };
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }

      case 'start':
        return deps.handleStart(config, deps.getGatewayLifecycleDeps());

      case 'stop':
        return deps.stopGatewayProcess(config, deps.getGatewayLifecycleDeps());

      case 'status':
        return { success: true, status: await deps.getGatewayRuntimeStatusAsync(config) };

      case 'license':
        return deps.verifyLicenseStatus(config);

      case 'skills/installed':
        return { success: true, skills: await deps.getInstalledOpenClawSkillsFromStatus(config) };

      case 'skills/install-options':
        return deps.handleSkillInstallOptions(data, config);

      case 'skills/install':
        return deps.handleSkillInstall(data, config);

      case 'skills/uninstall':
        return deps.handleSkillUninstall(data, config);

      case 'channels/status':
        return deps.getNotificationChannelsStatus(config);

      case 'channels/probe':
        return deps.getNotificationChannelsStatus(config, { probe: true });

      case 'channels/save-telegram':
        return deps.handleSaveTelegramChannel(data, config);

      case 'channels/save-feishu':
        return deps.handleSaveFeishuChannel(data, config);

      case 'uninstall-openclaw':
        return deps.handleUninstallOpenClaw(config, {
          stopGatewayProcess: (nextConfig, timeoutMs) =>
            deps.stopGatewayProcess(nextConfig, deps.getGatewayLifecycleDeps(), timeoutMs),
          getGatewayRuntimeStatus: deps.getGatewayRuntimeStatus,
          logError: deps.logError,
          clearLogs: deps.clearLogs,
        });

      default:
        return handleAPI(action, data, config);
    }
  }

  function handleAPI(action: string, _data: Record<string, unknown>, config: Record<string, unknown>): Record<string, unknown> {
    switch (action) {
      case 'logs':
        return { success: true, logs: deps.getLogs() };

      case 'update-openclaw':
        return deps.handleUpdateOpenClaw(config, {
          logError: deps.logError,
          getUserFriendlyMessage: deps.getUserFriendlyMessage,
        });

      case 'system-info':
        return {
          success: true,
          info: {
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.versions.node,
            dependencies: checkDependencies(),
          },
        };

      case 'skills/popular':
        return { success: true, skills: [], marketUrl: deps.clawhubMarketUrl };

      case 'skills/search':
        return { success: true, skills: [], marketUrl: deps.clawhubMarketUrl };

      default:
        return { success: false, error: `未知操作: ${action}` };
    }
  }

  return { handleAPI, handleAPIAsync };
}
