export function renderWebUiClientState(config: Record<string, unknown>, status: Record<string, unknown>, deps: {
  version: string;
  providers: Record<string, unknown>;
  defaultWebPort: number;
  defaultGatewayPort: number;
  clawhubMarketUrl: string;
  purchaseUrl: string;
}) {
  const PROVIDERS = deps.providers;
  const purchaseUrl = deps.purchaseUrl;
  return `
    const PROVIDERS = ${JSON.stringify(PROVIDERS)};
    // 默认选择当前 provider 的默认模型
    const defaultProvider = ${JSON.stringify(String(config.provider || 'anthropic'))};
    const defaultModel = defaultProvider === 'custom'
      ? (${JSON.stringify(String(config.customModelId || config.model || ''))})
      : (${JSON.stringify(String(config.model || ''))} || (PROVIDERS[defaultProvider]?.models.find(m => m.recommended)?.id || PROVIDERS[defaultProvider]?.models[0]?.id || ''));
    const state = {
      config: ${JSON.stringify(config)},
      status: ${JSON.stringify(status)},
      purchaseUrl: ${JSON.stringify(String(purchaseUrl || ''))},
      logs: [],
      selectedProvider: defaultProvider,
      selectedModel: defaultModel,
      currentTab: 'status',
      currentView: 'dashboard',
      deployPolling: false,
      deployTask: null,
      pendingDeployPayload: null,
      selectedBundlePath: null,
      pathCandidates: [],    // 扫描到的候选安装路径
      userDirs: [],          // 用户目录列表
      skillsLoaded: false,
      skillsLoading: false,
      channelsLoaded: false,
      channelsLoading: false,
      helpLoaded: false,
      helpLoading: false,
      channelsData: null,
      customWizard: {
        verified: false,
        verifying: false,
        message: '',
        suggestedEndpointId: '',
        retryMode: '',
      },
      // 更新状态
      update: {
        currentVersion: ${JSON.stringify(deps.version)},
        latestVersion: '',
        mode: 'up_to_date',
        lastCheckedAt: '',
        lastError: '',
        checking: false,
        updating: false,
      },
    };

    function render() {
      if (state.currentView === 'config') {
        showConfig();
        return;
      }

      if (state.currentView === 'deploy') {
        if (state.deployPolling || state.deployTask) {
          renderDeployTask(state.deployTask || { state: 'running', logs: [] });
          return;
        }
      }

      renderDashboard();
    }

    function goDashboard() {
      state.currentView = 'dashboard';
      state.deployTask = null;
      state.deployPolling = false;
      state.pendingDeployPayload = null;
      render();
    }

    function $(id) { return document.getElementById(id); }
    function escapeHtml(s) {
      return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }
    function toast(msg, type = 'success') {
      const t = $('toast'); t.textContent = msg; t.className = 'show ' + type;
      setTimeout(() => t.className = '', 3000);
    }

    // 带超时的 API 请求
    async function api(action, data = {}, timeout = 60000) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const res = await fetch('/api/' + action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          if (res.status === 413) {
            return { success: false, error: '请求数据过大' };
          }
          return { success: false, error: 'HTTP ' + res.status + ': ' + res.statusText };
        }

        const result = await res.json();
        return result;
      } catch (e) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') {
          return { success: false, error: '请求超时，请稍后重试' };
        }
        return { success: false, error: e.message || '网络请求失败' };
      }
    }

    // 显示友好的错误信息
    function showError(title, error, suggestions = []) {
      const card = $('main-card');
      let html = '<h2 class="card-title">❌ ' + title + '</h2>';
      html += '<div class="note" style="background:#FEF2F2;color:#991B1B">' + (error || '未知错误') + '</div>';
      if (suggestions.length > 0) {
        html += '<div style="margin-top:16px"><strong>建议:</strong><ul style="margin:8px 0 0 20px;color:#6B7280">';
        suggestions.forEach(s => { html += '<li>' + s + '</li>'; });
        html += '</ul></div>';
      }
      html += '<div class="actions" style="margin-top:20px"><button class="btn btn-primary" onclick="goDashboard()">返回</button></div>';
      card.innerHTML = html;
    }

    // 显示加载状态
    function showLoading(message) {
      const card = $('main-card');
      card.innerHTML = '<h2 class="card-title">' + message + '</h2><div style="text-align:center;padding:40px"><div style="font-size:40px">⏳</div><p style="color:#6B7280;margin-top:12px">请稍候...</p></div>';
    }
`;
}
