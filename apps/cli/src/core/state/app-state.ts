type ChildProcess = import('child_process').ChildProcess;

type GatewayStatus = 'stopped' | 'starting' | 'running' | 'stopping';

type GatewayTokenResolution = {
  token: string | null;
  configured: boolean;
  secretRefConfigured: boolean;
  unavailableReason?: string | null;
};

type GatewayRuntimeStatus = {
  installed: boolean;
  running: boolean;
  state: GatewayStatus;
  gatewayPort: number;
  gatewayToken: string | null;
  gatewayTokenConfigured: boolean;
  gatewayTokenSecretRefConfigured: boolean;
  gatewayTokenWarning: string | null;
  gatewayUrl: string;
};

type LogEntry = { time: string; level: string; message: string };
type DeployTaskState = 'idle' | 'running' | 'succeeded' | 'failed';

let gatewayProcess: ChildProcess | null = null;
let gatewayStatus: GatewayStatus = 'stopped';
let logs: Array<{ time: string; level: string; message: string }> = [];
let deployTask: {
  state: DeployTaskState;
  logs: LogEntry[];
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  config?: Record<string, unknown>;
  status?: GatewayRuntimeStatus;
} = {
  state: 'idle',
  logs: [],
};

function getGatewayProcess() {
  return gatewayProcess;
}

function setGatewayProcess(processRef: ChildProcess | null) {
  gatewayProcess = processRef;
}

function getGatewayStatus() {
  return gatewayStatus;
}

function setGatewayStatus(status: GatewayStatus) {
  gatewayStatus = status;
}

function appendLog(level: 'info' | 'success' | 'error' | 'warning', message: string) {
  logs.push({ time: new Date().toLocaleTimeString(), level, message });
  if (logs.length > 100) logs.shift();
}

function getLogs() {
  return logs;
}

function clearLogs() {
  logs = [];
}

function makeLogEntry(level: 'info' | 'success' | 'error' | 'warning', message: string): LogEntry {
  return { time: new Date().toLocaleTimeString(), level, message };
}

function appendBufferedLog(target: LogEntry[], level: 'info' | 'success' | 'error' | 'warning', message: string) {
  target.push(makeLogEntry(level, message));
  if (target.length > 300) target.shift();
}

function startDeployTask() {
  deployTask = {
    state: 'running',
    logs: [],
    startedAt: new Date().toISOString(),
  };
}

function completeDeployTask(result: Record<string, unknown>, baseConfig: Record<string, unknown>) {
  if (result.success && result.config && typeof result.config === 'object') {
    Object.assign(baseConfig, result.config as Record<string, unknown>);
  }

  deployTask.state = result.success ? 'succeeded' : 'failed';
  deployTask.error = result.success ? undefined : String(result.error || '部署失败');
  deployTask.finishedAt = new Date().toISOString();
  if (result.config) {
    deployTask.config = result.config as Record<string, unknown>;
  }
  if (result.status) {
    deployTask.status = result.status as GatewayRuntimeStatus;
  }
}

function failDeployTask(error: Error) {
  appendBufferedLog(deployTask.logs, 'error', `❌ 部署失败: ${error.message}`);
  deployTask.state = 'failed';
  deployTask.error = error.message;
  deployTask.finishedAt = new Date().toISOString();
}

function getDeployTaskState() {
  return deployTask.state;
}

function getDeployTaskLogs() {
  return deployTask.logs;
}

function getDeployTaskSnapshot() {
  return {
    success: true,
    task: {
      state: deployTask.state,
      error: deployTask.error || null,
      startedAt: deployTask.startedAt || null,
      finishedAt: deployTask.finishedAt || null,
      logs: deployTask.logs,
      config: deployTask.config,
      status: deployTask.status,
    },
  };
}

function getGatewayRuntimeStatus(
  config: Record<string, unknown>,
  deps: {
    defaultGatewayPort: number;
    resolveGatewayToken: (config: Record<string, unknown>) => GatewayTokenResolution;
    isOpenClawProjectDir: (projectPath: string) => boolean;
  }
): GatewayRuntimeStatus {
  const gatewayPort = Number(config.gatewayPort || deps.defaultGatewayPort);
  // 离线包模式：检查 openclawPath；传统模式：检查 installPath
  const projectPath = config.useBundledNode && config.openclawPath
    ? String(config.openclawPath)
    : String(config.installPath || '');
  const tokenResolution = deps.resolveGatewayToken(config);
  return {
    installed: !!projectPath && deps.isOpenClawProjectDir(projectPath),
    running: gatewayStatus === 'running' || gatewayStatus === 'starting',
    state: gatewayStatus,
    gatewayPort,
    gatewayToken: tokenResolution.token,
    gatewayTokenConfigured: tokenResolution.configured,
    gatewayTokenSecretRefConfigured: tokenResolution.secretRefConfigured,
    gatewayTokenWarning: tokenResolution.unavailableReason || null,
    gatewayUrl: `http://localhost:${gatewayPort}/`,
  };
}

async function getGatewayRuntimeStatusAsync(
  config: Record<string, unknown>,
  deps: {
    getGatewayRuntimeStatus: (config: Record<string, unknown>) => GatewayRuntimeStatus;
    getGatewayHealthStatus: (config: Record<string, unknown>) => Promise<boolean>;
  }
): Promise<GatewayRuntimeStatus> {
  const base = deps.getGatewayRuntimeStatus(config);
  const healthy = await deps.getGatewayHealthStatus(config);
  if (healthy) {
    return {
      ...base,
      running: true,
      state: gatewayStatus === 'starting' ? 'starting' : 'running',
    };
  }
  return {
    ...base,
    running: gatewayStatus === 'starting',
    state: gatewayStatus === 'starting' ? 'starting' : 'stopped',
  };
}

export {
  appendBufferedLog,
  appendLog,
  clearLogs,
  completeDeployTask,
  failDeployTask,
  getDeployTaskLogs,
  getDeployTaskSnapshot,
  getDeployTaskState,
  getGatewayProcess,
  getGatewayRuntimeStatus,
  getGatewayRuntimeStatusAsync,
  getGatewayStatus,
  getLogs,
  setGatewayProcess,
  setGatewayStatus,
  startDeployTask,
};

export type {
  DeployTaskState,
  GatewayRuntimeStatus,
  LogEntry,
};
