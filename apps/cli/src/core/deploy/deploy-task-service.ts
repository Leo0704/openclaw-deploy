const fs = require('fs') as typeof import('fs');
const os = require('os') as typeof import('os');
const path = require('path') as typeof import('path');
const {
  getDefaultInstallPath,
  validateInstallPathForUse,
} = require('../../platform/path/platform-paths') as typeof import('../../platform/path/platform-paths');

const {
  saveConfig,
  removePathIfExists,
} = require('../config/lobster-config') as typeof import('../config/lobster-config');
const {
  normalizeApiFormat,
  normalizeEndpointId,
} = require('../providers/provider-utils') as typeof import('../providers/provider-utils');
const {
  buildOpenClawModelsJson,
  buildOpenClawAgentsConfig,
} = require('../providers/provider-catalog') as typeof import('../providers/provider-catalog');
const {
  writeManagedOpenClawConfig,
  getManagedOpenClawConfigPath,
  getManagedOpenClawStateDir,
  readManagedOpenClawConfig,
} = require('../../platform/storage/storage-paths') as typeof import('../../platform/storage/storage-paths');
const {
  getOfflineBundleInfo,
  detectInstall,
  detectDownloadedBundle,
  checkDiskSpace,
  validateBundleFile,
  extractBundle,
  validateBundle,
  getStartCommand,
  BUNDLE_CONFIG,
} = require('./offline-bundle-service') as typeof import('./offline-bundle-service');

type DeployLogLevel = 'info' | 'success' | 'error' | 'warning';

type DeployTaskDeps = {
  defaultGatewayPort: number;
  getGatewayRuntimeStatus: (config: Record<string, unknown>) => Record<string, unknown>;
  getUserFriendlyMessage: (error: unknown) => string;
  logError: (error: Error, context?: string) => void;
  addLog: (message: string, level?: DeployLogLevel) => void;
  getUpdateState?: () => { mode: string };
};

function cleanupBeforeDeploy(
  installPath: string,
  baseConfig: Record<string, unknown>,
  addLog: (message: string, level?: DeployLogLevel) => void
): void {
  const removedPaths: string[] = [];
  const candidatePaths: string[] = [];
  const previousInstallPath = String(baseConfig.installPath || '').trim();

  if (previousInstallPath && path.resolve(previousInstallPath) !== path.resolve(installPath)) {
    candidatePaths.push(previousInstallPath);
  }
  candidatePaths.push(installPath);
  candidatePaths.push(getManagedOpenClawStateDir(baseConfig));
  candidatePaths.push(getManagedOpenClawConfigPath(baseConfig));
  candidatePaths.push(path.join(os.tmpdir(), 'openclaw'));

  const visited = new Set<string>();
  for (const target of candidatePaths) {
    const normalized = String(target || '').trim();
    if (!normalized) continue;
    const resolved = path.resolve(normalized);
    if (visited.has(resolved) || !fs.existsSync(resolved)) {
      continue;
    }
    visited.add(resolved);
    try {
      removePathIfExists(resolved, removedPaths);
      addLog(`已清理旧数据: ${resolved}`, 'info');
    } catch (error) {
      addLog(`清理失败，已跳过: ${resolved} (${(error as Error).message})`, 'warning');
    }
  }

  if (removedPaths.length === 0) {
    addLog('未检测到需要清理的旧目录/缓存/配置', 'info');
  } else {
    addLog(`部署前清理完成，共清理 ${removedPaths.length} 处旧数据`, 'success');
  }
}

export async function performDeployTask(
  data: Record<string, unknown>,
  baseConfig: Record<string, unknown>,
  deps: DeployTaskDeps
): Promise<Record<string, unknown>> {
  // 检查龙虾助手更新状态
  if (deps.getUpdateState) {
    const updateState = deps.getUpdateState();
    if (updateState.mode === 'required') {
      deps.addLog('错误: 龙虾助手版本过低，需要先更新', 'error');
      return {
        success: false,
        error: '龙虾助手版本过低，需要先更新到最新版本。',
        updateRequired: true,
      };
    }
  }

  const installPathInput = (data.installPath as string) || getDefaultInstallPath();
  const installPathValidation = validateInstallPathForUse(installPathInput, { probeWritable: true });
  if (!installPathValidation.valid) {
    deps.addLog(`错误: ${installPathValidation.error}`, 'error');
    return { success: false, error: installPathValidation.error || '安装路径无效' };
  }
  const installPath = installPathValidation.normalizedPath;
  const gatewayPort = (data.gatewayPort as number) || deps.defaultGatewayPort;
  const config = { ...baseConfig };

  try {
    deps.addLog('开始部署...');

    // 部署只需要安装路径和端口，API Key 和模型在启动前配置即可
    config.gatewayPort = gatewayPort;

    // 保存配置（如果前端传了的话，但不是强制的）
    if (data.provider !== undefined) config.provider = data.provider;
    if (data.model !== undefined) config.model = data.model;
    if (data.apiKey !== undefined) config.apiKey = data.apiKey;
    if (data.baseUrl !== undefined) config.baseUrl = data.baseUrl;
    if (data.apiFormat !== undefined) config.apiFormat = normalizeApiFormat(data.apiFormat);
    if (data.customModelId !== undefined) config.customModelId = data.customModelId;
    if (data.customEndpointId !== undefined) config.customEndpointId = normalizeEndpointId(data.customEndpointId) || 'custom';
    if (data.customModelAlias !== undefined) config.customModelAlias = String(data.customModelAlias || '').trim();
    if (data.contextWindow !== undefined) config.contextWindow = data.contextWindow;
    if (data.maxTokens !== undefined) config.maxTokens = data.maxTokens;

    // 步骤1: 检查是否已安装
    deps.addLog('检查安装状态...');
    const existingInstall = detectInstall(installPath);

    if (existingInstall.installed && !existingInstall.needUpdate) {
      deps.addLog(`已安装 OpenClaw v${existingInstall.version}`, 'success');
      config.installPath = installPath;
      config.useBundledNode = true;
      config.bundledNodePath = existingInstall.nodePath;
      config.openclawPath = existingInstall.openclawPath;
      saveConfig(config);

      // 写入 OpenClaw 原生格式配置
      await writeOpenClawNativeConfig(config, deps);

      deps.addLog('部署完成！', 'success');
      return { success: true, config, status: deps.getGatewayRuntimeStatus(config) };
    }

    if (existingInstall.installed && existingInstall.needUpdate) {
      deps.addLog(`检测到旧版本 v${existingInstall.version}，将更新到 v${BUNDLE_CONFIG.version}`, 'warning');
    }

    deps.addLog('部署前检查旧目录、缓存和配置...', 'info');
    cleanupBeforeDeploy(installPath, baseConfig, deps.addLog);
    deps.addLog('部署前检查磁盘空间（至少 20GB）...', 'info');
    const diskCheck = checkDiskSpace(installPath);
    if (!diskCheck.sufficient) {
      const availableGb = ((diskCheck.available || 0) / 1024 / 1024 / 1024).toFixed(2);
      const requiredGb = (diskCheck.required / 1024 / 1024 / 1024).toFixed(0);
      const diskSpaceError = `当前部署目录可用空间 ${availableGb}GB，不足 ${requiredGb}GB。请切换部署目录到剩余空间不少于 ${requiredGb}GB 的磁盘后重试`;
      deps.addLog(diskSpaceError, 'error');
      return { success: false, error: diskSpaceError };
    }
    const availableGb = ((diskCheck.available || 0) / 1024 / 1024 / 1024).toFixed(2);
    deps.addLog(`磁盘空间检查通过，可用 ${availableGb}GB`, 'success');

    // 步骤2: 获取离线包信息
    const bundleInfo = getOfflineBundleInfo(data.bundleUrl as string | undefined);
    deps.addLog(`需要 OpenClaw v${bundleInfo.version} (${bundleInfo.platform})`, 'info');

    // 步骤3: 检查用户是否指定了离线包路径
    let bundlePath = data.bundlePath as string | undefined;

    // 如果没有指定路径，尝试自动检测
    if (!bundlePath) {
      deps.addLog('正在自动检测离线包...', 'info');
      const detected = detectDownloadedBundle(bundleInfo);
      if (detected.found && detected.path) {
        bundlePath = detected.path;
        deps.addLog(`自动检测到离线包: ${bundlePath}`, 'success');
      }
    }

    // 如果仍然没有找到，返回下载引导
    if (!bundlePath) {
      deps.addLog('未找到离线包', 'warning');
      return {
        success: false,
        needDownload: true,
        bundleInfo: {
          version: bundleInfo.version,
          platform: bundleInfo.platform,
          fileName: bundleInfo.fileName,
          downloadUrl: bundleInfo.downloadUrl,
        },
        error: `请先下载 OpenClaw 安装包，然后选择文件继续部署。`,
      };
    }

    // 步骤4: 验证离线包文件
    deps.addLog(`验证安装包: ${bundlePath}`);
    const fileValidation = validateBundleFile(bundlePath, bundleInfo);
    if (!fileValidation.valid) {
      deps.addLog(`安装包无效: ${fileValidation.error}`, 'error');
      return { success: false, error: fileValidation.error };
    }
    deps.addLog('安装包验证通过', 'success');

    // 步骤5: 解压安装
    const extractResult = await extractBundle(bundlePath, installPath, deps.addLog);
    if (!extractResult.success) {
      deps.addLog(`解压失败: ${extractResult.error}`, 'error');
      return { success: false, error: extractResult.error };
    }

    // 步骤6: 验证安装
    deps.addLog('验证安装完整性...');
    const validation = validateBundle(installPath);
    if (!validation.valid) {
      deps.addLog(`安装不完整: ${validation.errors.join('; ')}`, 'error');
      return { success: false, error: `安装不完整: ${validation.errors[0]}` };
    }

    // 步骤7: 获取启动命令并保存配置
    const startCmd = getStartCommand(installPath);

    config.installPath = installPath;
    config.useBundledNode = true;
    config.bundledNodePath = startCmd.nodePath;
    config.openclawPath = startCmd.openclawPath;

    // 保存龙虾助手配置
    saveConfig(config);

    // 写入 OpenClaw 原生格式配置
    await writeOpenClawNativeConfig(config, deps);

    deps.addLog('部署完成！', 'success');
    return { success: true, config, status: deps.getGatewayRuntimeStatus(config) };

  } catch (error) {
    deps.addLog(`部署失败: ${(error as Error).message}`, 'error');
    deps.logError(error as Error, 'deploy-task');
    return { success: false, error: deps.getUserFriendlyMessage(error) };
  }
}

/**
 * 写入 OpenClaw 原生格式的配置文件
 * - models.json: 模型 provider 配置
 * - openclaw.json: agents 配置（默认模型）
 */
async function writeOpenClawNativeConfig(
  config: Record<string, unknown>,
  deps: DeployTaskDeps
): Promise<void> {
  try {
    const provider = String(config.provider || '');
    const model = String(config.model || '');
    const customModelId = String(config.customModelId || '').trim();
    const apiKey = String(config.apiKey || '');

    // 检查是否配置了模型（非 custom provider 用 model，custom provider 用 customModelId）
    const hasModel = model || (provider === 'custom' && customModelId);
    if (!provider || !hasModel) {
      deps.addLog('跳过 OpenClaw 配置写入（未配置模型）', 'info');
      return;
    }

    // 处理 custom provider 的特殊情况
    let finalModel = model;
    let baseUrl = String(config.baseUrl || '');

    // 如果是 custom provider，使用 customModelId 作为模型 ID
    if (provider === 'custom') {
      const customModelId = String(config.customModelId || '').trim();
      if (customModelId) {
        finalModel = customModelId;
      }
    }

    // 获取 API 格式
    const apiFormat = String(config.apiFormat || '');
    const customModelAlias = String(config.customModelAlias || '');

    // 生成 models.json 配置
    const modelsConfig = buildOpenClawModelsJson(provider, finalModel, apiKey, baseUrl, apiFormat);
    deps.addLog(`生成模型配置: ${provider}/${finalModel}`, 'info');

    // 生成 agents 配置（包含自定义模型别名）
    const agentsConfig = buildOpenClawAgentsConfig(provider, finalModel, customModelAlias);

    // 读取现有配置
    const existingConfig = readManagedOpenClawConfig(config);
    const existingModels = (existingConfig.config.models as Record<string, unknown>) || {};
    const existingAgents = (existingConfig.config.agents as Record<string, unknown>) || {};

    // 合并配置
    const modelsProviders = (modelsConfig.providers as Record<string, unknown>) || {};
    const agentsData = (agentsConfig.agents as Record<string, unknown>) || {};
    const agentsDefaults = (agentsData.defaults as Record<string, unknown>) || {};

    const mergedModels = {
      ...existingModels,
      providers: {
        ...((existingModels.providers as Record<string, unknown>) || {}),
        ...modelsProviders,
      },
    };

    const mergedAgents = {
      ...existingAgents,
      defaults: {
        ...((existingAgents.defaults as Record<string, unknown>) || {}),
        model: agentsDefaults.model || ((existingAgents.defaults as Record<string, unknown>)?.model as Record<string, unknown>) || {},
        models: {
          ...((existingAgents.defaults as Record<string, unknown>)?.models as Record<string, unknown>) || {},
          ...(agentsDefaults.models as Record<string, unknown>) || {},
        },
      },
    };

    // 写入合并后的配置
    const finalConfig = {
      ...existingConfig.config,
      models: mergedModels,
      agents: mergedAgents,
    };

    writeManagedOpenClawConfig(config, finalConfig);
    deps.addLog('已写入 OpenClaw 原生配置 ✓', 'success');

  } catch (error) {
    deps.addLog(`写入 OpenClaw 配置失败: ${error instanceof Error ? error.message : '未知错误'}`, 'warning');
  }
}
