const { isOpenClawProjectDir } = require('./openclaw-project') as typeof import('./openclaw-project');
const { OPENCLAW_MIN_NODE_VERSION } = require('./system-check') as typeof import('./system-check');

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
        $('deploy-retry-btn')?.addEventListener('click', render);
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
      const installPath = String(state.config?.installPath || '');
      if (installPath && isOpenClawProjectDir(installPath)) {
        state.status = {
          ...state.status,
          installed: true,
        };
      }
      render();
    }

    async function pollDeployTask() {
      if (!state.deployPolling) return;

      const res = await api('deploy-status', {}, 30000);
      if (!state.deployPolling) return;

      if (!res.success || !res.task) {
        state.deployPolling = false;
        toast(res.error || '无法获取部署状态', 'error');
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
      renderDeployTask(res.task);
      if (res.task.state === 'succeeded') {
        toast('部署完成！');
      } else if (res.task.state === 'failed') {
        toast(res.task.error || '部署失败', 'error');
      }
    }

    async function executeDeploy(payload) {
      const res = await api('deploy-start', payload, 30000);
      if (!res.success) {
        showError('部署启动失败', res.error || '未知错误');
        return;
      }

      state.deployTask = res.task || null;
      state.deployPolling = true;
      renderDeployTask(state.deployTask || { state: 'running', logs: [] });
      await pollDeployTask();
    }

    function hasActionablePrecheckRecovery(health) {
      const checks = Array.isArray(health?.checks) ? health.checks : [];
      return checks.some(check => {
        if (check.passed) return false;
        return check.name === 'Node.js 版本' || check.name === 'Git' || check.name === '包管理器';
      });
    }

    function buildPrecheckRecoveryCards(health) {
      const cards = [];
      const checks = Array.isArray(health?.checks) ? health.checks : [];
      const hasBlockingErrors = Array.isArray(health?.errors) && health.errors.length > 0;
      const nodeCheck = checks.find(check => check.name === 'Node.js 版本' && !check.passed);
      const packageCheck = checks.find(check => check.name === '包管理器' && !check.passed);
      const gitCheck = checks.find(check => check.name === 'Git' && !check.passed);

      if (nodeCheck) {
        cards.push([
          '<div class="panel" style="margin-top:16px">',
          '  <div class="panel-title">Node.js 需要手动安装</div>',
          '  <div class="panel-copy">当前部署 OpenClaw 要求 <span class="mono">Node.js >= ${OPENCLAW_MIN_NODE_VERSION}</span>。这个依赖不会自动安装，请先手动下载安装，再回来重新点击部署。</div>',
          '  <div class="actions" style="margin-top:14px">',
          '    <a class="btn btn-primary" href="https://nodejs.org/en/download" target="_blank" rel="noopener">下载 Node.js</a>',
          '  </div>',
          '</div>',
        ].join(''));
      }

      if (gitCheck) {
        cards.push([
          '<div class="panel" style="margin-top:16px">',
          '  <div class="panel-title">Git 获取方式</div>',
          '  <div class="panel-copy">Git 缺失时，龙虾助手在进入正式部署后会优先尝试自动安装；如果自动安装失败，再用下面的下载入口手动安装。</div>',
          '  <div class="actions" style="margin-top:14px">',
          '    <a class="btn btn-secondary" href="https://git-scm.com/downloads" target="_blank" rel="noopener">下载 Git</a>',
          '  </div>',
          '</div>',
        ].join(''));
      }

      if (packageCheck) {
        cards.push([
          '<div class="panel" style="margin-top:16px">',
          '  <div class="panel-title">pnpm 获取方式</div>',
          '  <div class="panel-copy">pnpm 缺失时，龙虾助手会优先尝试自动安装；如果自动安装失败，或你想手动安装，可以直接打开官方安装说明。</div>',
          '  <div class="actions" style="margin-top:14px">',
          '    <a class="btn btn-secondary" href="https://pnpm.io/installation" target="_blank" rel="noopener">打开 pnpm 安装说明</a>',
          '  </div>',
          '</div>',
        ].join(''));
      }

      if (!cards.length && hasBlockingErrors) {
        cards.push([
          '<div class="panel" style="margin-top:16px">',
          '  <div class="panel-title">手动修复建议</div>',
          '  <div class="panel-copy">当前存在阻塞项。请先按上面的错误提示修复，再重新点击部署。</div>',
          '</div>',
        ].join(''));
      }

      return cards.join('');
    }

    async function deploy() {
      state.currentView = 'deploy';
      const installPath = $('path').value;
      const gatewayPort = parseInt($('port').value);
      const apiKey = $('apiKey').value;
      const isCustom = state.selectedProvider === 'custom';

      if (!apiKey) return toast('请输入 API Key', 'error');
      if (!isCustom && !state.selectedModel) return toast('请选择模型', 'error');

      const payload = {
        installPath,
        gatewayPort,
        apiKey,
        provider: state.selectedProvider,
        model: isCustom ? (($('deployCustomModelId')?.value || '').trim()) : state.selectedModel,
      };

      if (isCustom) {
        if (!payload.model) return toast('请输入 Model ID', 'error');
        payload.baseUrl = $('deployBaseUrl')?.value || '';
        payload.apiFormat = resolveApiFormatFromCompatibilityClient($('deployApiFormat')?.value || 'openai');
        payload.customModelId = payload.model;
      }

      $('main-card').innerHTML = \`
        <h2 class="card-title">🩺 部署前检查</h2>
        <div class="logs" id="deploy-logs" style="max-height:400px"><div class="log-line log-info">正在执行一次性预检...</div></div>
      \`;

      const health = await api('health-check', {
        installPath,
        gatewayPort,
      });

      const precheckLogsEl = $('deploy-logs');
      if (!health.success) {
        precheckLogsEl.innerHTML += '<div class="log-line log-error" style="margin-top:16px">❌ 预检失败: ' + (health.error || '未知错误') + '</div>';
        $('main-card').innerHTML += '<div class="actions" style="margin-top:20px"><button class="btn btn-primary" onclick="render()">返回</button></div>';
        return;
      }

      const checkLines = (health.checks || []).map(check => {
        const level = check.passed ? 'success' : (check.severity === 'warning' ? 'warning' : 'error');
        const icon = check.passed ? '✓' : (check.severity === 'warning' ? '!' : '✗');
        return '<div class="log-line log-' + level + '">[' + check.name + '] ' + icon + ' ' + check.message + '</div>';
      }).join('');
      precheckLogsEl.innerHTML = checkLines || '<div class="log-line log-info">未返回检查结果</div>';

      const recoveryCards = buildPrecheckRecoveryCards(health);
      const hasRecoveryActions = hasActionablePrecheckRecovery(health);

      if (health.errors && health.errors.length > 0) {
        precheckLogsEl.innerHTML += '<div class="log-line log-error" style="margin-top:16px">❌ 发现阻塞问题，已停止部署。</div>';
        $('main-card').innerHTML += recoveryCards;
        $('main-card').innerHTML += '<div class="actions" style="margin-top:20px"><button class="btn btn-primary" onclick="render()">返回修正</button></div>';
        return;
      }

      if (health.warnings && health.warnings.length > 0) {
        precheckLogsEl.innerHTML += '<div class="log-line log-warning" style="margin-top:16px">⚠️ 存在警告项，部署会继续。</div>';
      }

      if (hasRecoveryActions) {
        if (recoveryCards) {
          $('main-card').innerHTML += recoveryCards;
        }
        $('main-card').innerHTML += '<div class="actions" style="margin-top:20px"><button class="btn btn-primary" onclick="continueDeploy()">继续部署（自动尝试安装缺失依赖）</button><button class="btn btn-secondary" onclick="render()">稍后再说</button></div>';
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
