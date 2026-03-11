/**
 * API 处理器工厂
 * 创建统一的 API 处理对象
 */

// 使用 any 类型以适应各种函数签名
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiHandlerDeps = any;

export function createApiHandlers(deps: ApiHandlerDeps) {
  async function handleAPIAsync(
    action: string,
    data: Record<string, unknown>,
    config: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    try {
      switch (action) {
        case 'status':
          return {
            success: true,
            status: await deps.getGatewayRuntimeStatusAsync(config),
          };

        case 'config':
          return deps.handleConfigAsync(data, config);

        case 'test-connection':
          return deps.handleTestConnection(data, config, deps.providers);

        case 'activate':
          return deps.activateLicense(data.code, config);

        case 'deploy-start':
          return deps.handleDeployStart(data, config);

        case 'deploy-status':
          return deps.getDeployTaskSnapshot();

        case 'health-check':
          return await deps.performHealthChecks({
            installPath: String(data.installPath || ''),
            gatewayPort: Number(data.gatewayPort) || 18789,
          });

        case 'start':
          return deps.handleStart(config, deps.getGatewayLifecycleDeps());

        case 'stop':
          return deps.stopGatewayProcess(config, deps.getGatewayLifecycleDeps());

        case 'logs':
          return { success: true, logs: deps.getLogs() };

        case 'clear-logs':
          deps.clearLogs();
          return { success: true };

        case 'uninstall-openclaw':
          return deps.handleUninstallOpenClaw(config, deps.getGatewayLifecycleDeps());

        case 'update-openclaw':
          return deps.handleUpdateOpenClaw(config, {
            logError: deps.logError,
            getUserFriendlyMessage: deps.getUserFriendlyMessage,
          });

        case 'skills/installed':
          const status = deps.getGatewayRuntimeStatus(config);
          return {
            success: true,
            skills: deps.getInstalledOpenClawSkillsFromStatus(status),
          };

        case 'skills/install-options':
          return deps.handleSkillInstallOptions(data, config);

        case 'skills/install':
          return deps.handleSkillInstall(data, config);

        case 'skills/uninstall':
          return deps.handleSkillUninstall(data, config);

        case 'channels/status':
          return deps.getNotificationChannelsStatus(config);

        case 'channels/probe':
          return { success: true, message: '渠道探测完成' };

        case 'channels/save-telegram':
          return deps.handleSaveTelegramChannel(data, config);

        case 'channels/save-feishu':
          return deps.handleSaveFeishuChannel(data, config);

        // ============================================
        // 龙虾助手更新相关 API
        // ============================================

        case 'update-status':
          return {
            success: true,
            update: deps.getUpdateState(),
          };

        case 'check-update':
          const checkResult = await deps.checkForUpdates({ force: true });
          return {
            success: true,
            update: checkResult,
          };

        case 'perform-self-update':
          return await deps.performSelfUpdate(config);

        default:
          return { success: false, error: `未知操作: ${action}` };
      }
    } catch (error) {
      deps.logError(error as Error, `api:${action}`);
      return {
        success: false,
        error: deps.getUserFriendlyMessage(error),
      };
    }
  }

  return {
    handleAPIAsync,
  };
}
