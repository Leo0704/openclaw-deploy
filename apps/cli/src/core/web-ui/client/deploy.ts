import { OPENCLAW_MIN_NODE_VERSION } from '../../../core/diagnostics/system-check';

export function renderWebUiClientDeploy(config: Record<string, unknown>, status: Record<string, unknown>, deps: {
  version: string;
  providers: Record<string, unknown>;
  defaultWebPort: number;
  defaultGatewayPort: number;
  clawhubMarketUrl: string;
  purchaseUrl: string;
}) {
  const VERSION = deps.version;
  const PROVIDERS = deps.providers;
  const DEFAULT_WEB_PORT = deps.defaultWebPort;
  const DEFAULT_GATEWAY_PORT = deps.defaultGatewayPort;
  const CLAWHUB_MARKET_URL = deps.clawhubMarketUrl;
  const purchaseUrl = deps.purchaseUrl;
  void VERSION;
  void PROVIDERS;
  void DEFAULT_WEB_PORT;
  void DEFAULT_GATEWAY_PORT;
  void CLAWHUB_MARKET_URL;
  void purchaseUrl;
  void config;
  void status;
  return `    async function activate() {
      const code = $('code').value;
      if (!code) return toast('请输入激活码', 'error');
      const res = await api('activate', { code });
      if (res.success) { state.config = res.config; toast('激活成功！'); render(); }
      else toast(res.error || '激活失败', 'error');
    }

    function renderDeployTask(task) {
      state.currentView = 'deploy';
      if (!$('deploy-logs') || !$('deploy-actions')) {
        $('main-card').innerHTML = \`
          <h2 class="card-title">📦 部署中...</h2>
          <div class="logs" id="deploy-logs" style="max-height:400px"><div class="log-line log-info">准备部署...</div></div>
          <div class="actions" id="deploy-actions" style="margin-top:20px"></div>
        \`;
      }

      const logsEl = $('deploy-logs');
      const previousScrollTop = logsEl.scrollTop;
      const wasNearBottom = logsEl.scrollTop + logsEl.clientHeight >= logsEl.scrollHeight - 24;
      const deployLogs = Array.isArray(task?.logs) ? task.logs : [];
      logsEl.innerHTML = deployLogs.length
        ? deployLogs.map(l => \`<div class="log-line log-\${l.level || 'info'}"><span class="log-time">[\${l.time}]</span> \${l.message}</div>\`).join('')
        : '<div class="log-line log-info">准备部署...</div>';
      if (wasNearBottom) {
        logsEl.scrollTop = logsEl.scrollHeight;
      } else {
        logsEl.scrollTop = previousScrollTop;
      }

      const actionsEl = $('deploy-actions');
      const taskState = task?.state || 'idle';
      if (taskState === 'succeeded') {
        actionsEl.innerHTML = '<button class="btn btn-primary" id="enter-dashboard-btn">进入控制面板</button>';
        $('enter-dashboard-btn')?.addEventListener('click', enterDashboardAfterDeploy);
      } else if (taskState === 'failed') {
        actionsEl.innerHTML = '<button class="btn btn-primary" id="deploy-retry-btn">返回重试</button>';
        $('deploy-retry-btn')?.addEventListener('click', goDashboard);
      } else {
        actionsEl.innerHTML = '<button class="btn btn-secondary" disabled>部署进行中...</button>';
      }
    }

    function enterDashboardAfterDeploy() {
      if (state.deployTask?.config) {
        state.config = state.deployTask.config;
      }
      if (state.deployTask?.status) {
        state.status = state.deployTask.status;
      }
      // 部署成功后，服务端返回的 status 应该已包含 installed: true
      // 如果没有，手动设置（兼容旧逻辑）
      if (state.status && !state.status.installed) {
        state.status = {
          ...state.status,
          installed: true,
        };
      }
      goDashboard();
    }

    async function pollDeployTask() {
      if (!state.deployPolling) return;

      const res = await api('deploy-status', {}, 30000);
      if (!state.deployPolling) return;

      // 超时或失败时继续重试，不停止轮询
      if (!res.success || !res.task) {
        console.warn('获取部署状态失败，1秒后重试:', res.error);
        setTimeout(pollDeployTask, 1000);
        return;
      }

      // 检查是否需要下载
      if (res.task.needDownload && res.task.bundleInfo) {
        state.deployPolling = false;
        renderDownloadGuide(res.task.bundleInfo);
        return;
      }

      if (res.task.config) {
        state.config = res.task.config;
      }
      if (res.task.status) {
        state.status = res.task.status;
      }
      if (res.task.state === 'running') {
        state.deployTask = res.task;
        renderDeployTask(res.task);
        setTimeout(pollDeployTask, 1500);
        return;
      }

      state.deployPolling = false;
      state.deployTask = res.task;
      if (res.task.state === 'succeeded') {
        toast('部署完成！');
        // 自动进入控制面板
        enterDashboardAfterDeploy();
      } else if (res.task.state === 'failed') {
        renderDeployTask(res.task);
        toast(res.task.error || '部署失败', 'error');
      } else {
        renderDeployTask(res.task);
      }
    }

    async function executeDeploy(payload) {
      state.pendingDeployPayload = payload;

      const res = await api('deploy-start', payload, 30000);
      if (!res.success) {
        // 检查是否需要下载
        if (res.needDownload && res.bundleInfo) {
          renderDownloadGuide(res.bundleInfo);
          return;
        }
        showError('部署失败', res.error || '未知错误');
        return;
      }

      state.deployTask = res.task || null;
      state.deployPolling = true;
      state.pendingDeployPayload = null;
      renderDeployTask(state.deployTask || { state: 'running', logs: [] });
      await pollDeployTask();
    }

    function hasActionablePrecheckRecovery(health) {
      // 离线包模式不再需要这些预检恢复
      return false;
    }

    function buildPrecheckRecoveryCards(health) {
      // 离线包模式不再需要这些
      return '';
    }

    function renderDownloadGuide(bundleInfo) {
      const mainCard = $('main-card');
      mainCard.innerHTML = \`
        <h2 class="card-title">需要 OpenClaw 安装包</h2>
        <div class="note note-info" style="margin-bottom:16px">
          💡 如果您下载的是"龙虾助手+离线包"压缩包，请先解压，然后直接点击"开始部署"，系统会自动检测同目录下的离线包。
        </div>
        <div class="panel" style="margin-top:16px">
          <div class="panel-title">手动选择安装包</div>
          <div class="panel-copy">
            如果自动检测失败，您可以手动选择已下载的安装包文件。
            <br><br>
            <strong>文件名：</strong><span class="mono">\${bundleInfo.fileName}</span>
            <br>
            <strong>平台：</strong>\${bundleInfo.platform}
            <br>
            <strong>版本：</strong>v\${bundleInfo.version}
          </div>
          <div class="actions" style="margin-top:14px">
            <button class="btn btn-secondary" id="select-bundle-btn">选择安装包文件</button>
            <input type="file" id="bundle-file-input" style="display:none" accept=".zip,.tar.gz,.gz">
          </div>
          <div id="selected-file" style="margin-top:12px;color:var(--text-secondary);font-size:13px"></div>
        </div>
        <div class="actions" style="margin-top:20px">
          <button class="btn btn-primary" id="redeploy-btn" disabled>继续部署</button>
          <button class="btn btn-secondary" onclick="goDashboard()">稍后再说</button>
        </div>
      \`;

      const fileInput = $('bundle-file-input');
      const selectedFile = $('selected-file');
      const redeployBtn = $('redeploy-btn');

      $('select-bundle-btn')?.addEventListener('click', () => {
        fileInput?.click();
      });

      fileInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          state.selectedBundlePath = file.path || file.name;
          selectedFile.innerHTML = \`已选择: <span class="mono">\${file.name}</span>\`;
          redeployBtn.disabled = false;
        }
      });

      redeployBtn?.addEventListener('click', () => {
        const payload = state.pendingDeployPayload || {
          installPath: state.config.installPath,
          apiKey: state.config.apiKey,
          model: state.config.model,
          provider: state.config.provider,
        };
        payload.bundlePath = state.selectedBundlePath;
        executeDeploy(payload);
      });
    }

    async function deploy() {
      state.currentView = 'deploy';
      const installPath = $('path').value;
      const gatewayPort = parseInt($('port').value);
      const apiKey = $('apiKey').value;
      const baseUrl = $('baseUrl')?.value || state.config.baseUrl || '';
      const model = $('customModelId')?.value || state.config.customModelId || state.config.model || '';

      if (!apiKey) return toast('请输入 API Key', 'error');
      if (!baseUrl) return toast('请输入 Base URL', 'error');
      if (!model) return toast('请输入 Model ID', 'error');

      const payload = {
        installPath,
        gatewayPort,
        apiKey,
        provider: 'custom',
        model,
        baseUrl,
        apiFormat: resolveApiFormatFromCompatibilityClient($('deployApiFormat')?.value || state.config.apiFormat || 'openai'),
        customModelId: model,
        customEndpointId: $('customEndpointId')?.value || state.config.customEndpointId || '',
        customModelAlias: $('customModelAlias')?.value || state.config.customModelAlias || '',
      };

      $('main-card').innerHTML = \`
        <h2 class="card-title">🩺 部署前检查</h2>
        <div class="logs" id="deploy-logs" style="max-height:400px"><div class="log-line log-info">正在执行一次性预检...</div></div>
      \`;

      const health = await api('health-check', {
        installPath,
        gatewayPort,
      });

      // 如果健康检查返回了可用端口，使用该端口
      const actualPort = health.availablePort || gatewayPort;
      if (actualPort !== gatewayPort) {
        // 更新页面显示的端口
        $('port').value = String(actualPort);
        // 更新 payload 中的端口
        payload.gatewayPort = actualPort;
      }

      const precheckLogsEl = $('deploy-logs');
      if (!health.success) {
        precheckLogsEl.innerHTML += '<div class="log-line log-error" style="margin-top:16px">❌ 预检失败: ' + (health.error || '未知错误') + '</div>';
        $('main-card').innerHTML += '<div class="actions" style="margin-top:20px"><button class="btn btn-primary" onclick="goDashboard()">返回</button></div>';
        return;
      }

      const checkLines = (health.checks || []).map(check => {
        const level = check.passed ? 'success' : (check.severity === 'warning' ? 'warning' : 'error');
        const icon = check.passed ? '✓' : (check.severity === 'warning' ? '!' : '✗');
        let message = check.message;
        // 为特定检查项添加自动修复提示
        if (!check.passed && check.name === '包管理器') {
          message += ' （系统将自动尝试通过 corepack/npm exec 安装）';
        } else if (!check.passed && check.name === 'Git') {
          message += ' （仅影响在线更新，不影响部署）';
        }
        return '<div class="log-line log-' + level + '">[' + check.name + '] ' + icon + ' ' + message + '</div>';
      }).join('');
      precheckLogsEl.innerHTML = checkLines || '<div class="log-line log-info">未返回检查结果</div>';

      const recoveryCards = buildPrecheckRecoveryCards(health);
      const hasRecoveryActions = hasActionablePrecheckRecovery(health);

      if (health.errors && health.errors.length > 0) {
        precheckLogsEl.innerHTML += '<div class="log-line log-error" style="margin-top:16px">❌ 发现阻塞问题，已停止部署。</div>';
        $('main-card').insertAdjacentHTML('beforeend', recoveryCards);
        $('main-card').insertAdjacentHTML('beforeend', '<div class="actions" style="margin-top:20px"><button class="btn btn-primary" onclick="goDashboard()">返回修正</button></div>');
        return;
      }

      if (health.warnings && health.warnings.length > 0) {
        precheckLogsEl.innerHTML += '<div class="log-line log-info" style="margin-top:16px">💡 系统将自动尝试修复上述问题，如失败会切换备用方案重试。</div>';
      }

      if (hasRecoveryActions) {
        if (recoveryCards) {
          $('main-card').insertAdjacentHTML('beforeend', recoveryCards);
        }
        $('main-card').insertAdjacentHTML('beforeend', '<div class="log-line log-info" style="margin-top:16px">💡 点击继续后，系统将自动尝试安装缺失依赖（pnpm/corepack/npm exec）。</div>');
        $('main-card').insertAdjacentHTML('beforeend', '<div class="actions" style="margin-top:20px"><button class="btn btn-primary" onclick="continueDeploy()">继续部署（自动修复）</button><button class="btn btn-secondary" onclick="goDashboard()">稍后再说</button></div>');
        state.pendingDeployPayload = payload;
        return;
      }

      await executeDeploy(payload);
    }

    async function continueDeploy() {
      if (!state.pendingDeployPayload) {
        toast('没有待继续的部署任务', 'error');
        return;
      }
      const payload = state.pendingDeployPayload;
      state.pendingDeployPayload = null;
      await executeDeploy(payload);
    }
`;
}
