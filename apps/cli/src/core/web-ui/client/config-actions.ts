import { ANTHROPIC_API_FORMAT, buildEndpointIdFromUrl } from '../../../core/providers/provider-utils';

export function renderWebUiClientConfigActions(config: Record<string, unknown>, status: Record<string, unknown>, deps: {
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
  void DEFAULT_WEB_PORT;
  void CLAWHUB_MARKET_URL;
  void purchaseUrl;
  void config;
  void status;
  void buildEndpointIdFromUrl;
  return `    function normalizeEndpointIdClient(value) {
      return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    function normalizeCustomCompatibilityChoiceClient(value) {
      const normalized = String(value || '').trim().toLowerCase();
      if (normalized === 'anthropic' || normalized === '${ANTHROPIC_API_FORMAT}') return 'anthropic';
      if (normalized === 'unknown') return 'unknown';
      return 'openai';
    }

    function resolveApiFormatFromCompatibilityClient(value) {
      return normalizeCustomCompatibilityChoiceClient(value) === 'anthropic' ? '${ANTHROPIC_API_FORMAT}' : 'openai-completions';
    }

    function buildEndpointIdFromUrlClient(baseUrl) {
      try {
        const url = new URL(baseUrl);
        const host = url.hostname.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        const port = url.port ? '-' + url.port : '';
        return normalizeEndpointIdClient('custom-' + host + port) || 'custom';
      } catch {
        return 'custom';
      }
    }

    function resetCustomWizard() {
      state.customWizard = {
        verified: false,
        verifying: false,
        message: '',
        suggestedEndpointId: '',
        retryMode: '',
      };
    }

    function chooseCustomRetry(mode) {
      state.customWizard.retryMode = mode;
      state.customWizard.verified = false;
      const resultEl = $('test-result');
      if (mode === 'baseUrl' || mode === 'both') $('baseUrl')?.focus();
      if (mode === 'model' || mode === 'both') $('customModelId')?.focus();
      if (resultEl) {
        resultEl.style.display = 'block';
        resultEl.innerHTML = '<div class="note note-info">请修改刚才失败的地址或模型名称，然后再次点击"验证连接"。</div>';
      }
    }

    function syncCustomEndpointId() {
      const endpointInput = $('customEndpointId');
      const baseUrlInput = $('baseUrl');
      if (!endpointInput || !baseUrlInput) return;
      if (!endpointInput.value || endpointInput.value === state.customWizard.suggestedEndpointId) {
        const nextId = buildEndpointIdFromUrlClient(baseUrlInput.value);
        endpointInput.value = nextId;
        state.customWizard.suggestedEndpointId = nextId;
      }
    }

    function getGatewayOpenUrl() {
      const baseUrl = state.status.gatewayUrl || ('http://localhost:' + (state.config.gatewayPort || ${DEFAULT_GATEWAY_PORT}) + '/');
      const token = state.status.gatewayToken;
      if (!token) {
        return baseUrl;
      }
      return baseUrl.replace(/#.*$/, '') + '#token=' + encodeURIComponent(token);
    }

    function showConfig() {
      state.currentView = 'config';
      const card = $('main-card');
      const c = state.config;

      card.innerHTML = \`
        <h2 class="card-title">⚙️ API 配置</h2>
        <div class="hero-panel">
          <div class="hero-kicker">Configuration</div>
          <div class="hero-title">配置模型服务</div>
          <div class="hero-copy">填写 API 地址、密钥和模型名称，验证通过后保存即可。</div>
        </div>
        <div class="wizard-steps">
          <div class="wizard-step">
            <div class="wizard-step-title">第 1 步：API 地址</div>
            <div class="wizard-step-desc">填写服务商的 API Base URL。</div>
            <div class="form-group">
              <label class="form-label">Base URL</label>
              <input type="text" id="baseUrl" class="form-input" value="\${c.baseUrl || ''}" placeholder="例如: https://api.anthropic.com 或 https://api.openai.com/v1" oninput="syncCustomEndpointId(); resetCustomWizard()">
            </div>
          </div>

          <div class="wizard-step">
            <div class="wizard-step-title">第 2 步：API Key</div>
            <div class="wizard-step-desc">填写你的 API 密钥。</div>
            <div class="form-group">
              <label class="form-label">API Key</label>
              <input type="password" id="apiKey" class="form-input" value="\${c.apiKey || ''}" placeholder="请输入 API Key" oninput="resetCustomWizard()">
            </div>
          </div>

          <div class="wizard-step">
            <div class="wizard-step-title">第 3 步：接口类型</div>
            <div class="wizard-step-desc">选择 API 接口类型，不确定可以选"自动探测"。</div>
            <div class="form-group">
              <label class="form-label">接口类型</label>
              <select id="apiFormat" class="form-select" onchange="resetCustomWizard()">
                <option value="openai" \${normalizeCustomCompatibilityChoiceClient(c.apiFormat || 'openai') === 'openai' ? 'selected' : ''}>OpenAI-compatible</option>
                <option value="anthropic" \${normalizeCustomCompatibilityChoiceClient(c.apiFormat) === 'anthropic' ? 'selected' : ''}>Anthropic-compatible</option>
                <option value="unknown" \${normalizeCustomCompatibilityChoiceClient(c.apiFormat) === 'unknown' ? 'selected' : ''}>Unknown (自动探测)</option>
              </select>
            </div>
          </div>

          <div class="wizard-step">
            <div class="wizard-step-title">第 4 步：模型配置</div>
            <div class="wizard-step-desc">填写你要使用的模型名称。</div>
            <div class="form-group">
              <label class="form-label">模型名称</label>
              <input type="text" id="customModelId" class="form-input" value="\${c.customModelId || c.model || ''}" placeholder="例如: claude-sonnet-4-20250514, gpt-4o, glm-5" oninput="resetCustomWizard()">
              <div class="form-hint">在 AI 服务官网可以找到模型名称</div>
            </div>
            <div id="custom-wizard-result" style="margin-top:12px">
              \${state.customWizard.message ? \`<div class="note" style="background:\${state.customWizard.verified ? '#D1FAE5' : '#FEF2F2'};color:\${state.customWizard.verified ? '#065F46' : '#991B1B'}">\${state.customWizard.message}</div>\` : ''}
            </div>
          </div>

          <div class="wizard-step">
            <div class="wizard-step-title">第 5 步：本地网关参数</div>
            <div class="form-group">
              <label class="form-label">服务端口号</label>
              <input type="number" id="gport" class="form-input" value="\${c.gatewayPort || ${DEFAULT_GATEWAY_PORT}}">
            </div>
          </div>
        </div>

        <div class="actions">
          <button class="btn btn-primary" onclick="saveConfig()">保存配置</button>
          <button class="btn btn-secondary" onclick="testConnection()">验证连接</button>
          <button class="btn btn-secondary" onclick="goDashboard()">取消</button>
        </div>

        <div id="test-result" style="margin-top:16px;display:none"></div>
      \`;
    }

    async function testConnection() {
      const resultEl = $('test-result');
      resultEl.style.display = 'block';
      resultEl.innerHTML = '<div style="text-align:center;padding:20px;color:#6B7280">🔄 正在测试连接...</div>';

      const requestedCompatibility = $('apiFormat')?.value || 'openai';
      const baseUrl = $('baseUrl')?.value;
      const model = $('customModelId')?.value;
      const endpointIdInput = $('customEndpointId');
      const suggestedEndpointId = buildEndpointIdFromUrlClient(baseUrl);

      if (endpointIdInput && !endpointIdInput.value) {
        endpointIdInput.value = suggestedEndpointId;
      }

      if (!baseUrl) {
        resultEl.innerHTML = \`<div class="note" style="background:#FEE2E2;color:#991B1B">❌ 请填写 Base URL</div>\`;
        return;
      }
      if (!$('apiKey')?.value) {
        resultEl.innerHTML = \`<div class="note" style="background:#FEE2E2;color:#991B1B">❌ 请填写 API Key</div>\`;
        return;
      }
      if (!model) {
        resultEl.innerHTML = \`<div class="note" style="background:#FEE2E2;color:#991B1B">❌ 请填写 Model ID</div>\`;
        return;
      }

      const attempt = async (apiFormatValue) => api('test-connection', {
        provider: 'custom',
        apiKey: $('apiKey')?.value,
        baseUrl,
        model,
        apiFormat: apiFormatValue,
      });

      let res;
      let resolvedCompatibility = requestedCompatibility;

      if (requestedCompatibility === 'unknown') {
        const openaiRes = await attempt('openai-completions');
        if (openaiRes.success) {
          res = openaiRes;
          resolvedCompatibility = 'openai';
        } else {
          const anthropicRes = await attempt('${ANTHROPIC_API_FORMAT}');
          res = anthropicRes;
          if (anthropicRes.success) {
            resolvedCompatibility = 'anthropic';
          }
        }
      } else {
        res = await attempt(resolveApiFormatFromCompatibilityClient(requestedCompatibility));
      }

      if (res.success) {
        state.customWizard.verified = true;
        state.customWizard.retryMode = '';
        state.customWizard.message = '验证成功。当前配置可以正常使用，保存后会按这组配置启动。';
        state.customWizard.suggestedEndpointId = suggestedEndpointId;
        if ($('apiFormat')) $('apiFormat').value = resolvedCompatibility;
        resultEl.innerHTML = \`<div class="note" style="background:#D1FAE5;color:#065F46">✅ 连接成功！模型响应正常</div>\`;
      } else {
        state.customWizard.verified = false;
        state.customWizard.retryMode = 'baseUrl';
        state.customWizard.message = '验证失败：' + (res.error || '未知错误');
        resultEl.innerHTML = \`
          <div class="note" style="background:#FEE2E2;color:#991B1B">❌ 连接失败：\${res.error || '未知错误'}</div>
          <div class="actions" style="margin-top:12px">
            <button class="btn btn-secondary btn-small" onclick="chooseCustomRetry('baseUrl')">修改 Base URL</button>
            <button class="btn btn-secondary btn-small" onclick="chooseCustomRetry('model')">修改 Model ID</button>
            <button class="btn btn-secondary btn-small" onclick="chooseCustomRetry('both')">同时修改两者</button>
          </div>
        \`;
      }
    }

    function showHelp() {
      switchTab('help');
    }

    async function saveConfig() {
      if (!state.customWizard.verified) {
        return toast('请先完成连接验证，再保存配置', 'error');
      }

      const configData = {
        apiKey: $('apiKey')?.value || '',
        baseUrl: $('baseUrl')?.value || '',
        gatewayPort: parseInt($('gport')?.value || String(DEFAULT_GATEWAY_PORT)),
        provider: 'custom',
        model: $('customModelId')?.value || '',
        apiFormat: resolveApiFormatFromCompatibilityClient($('apiFormat')?.value || 'openai'),
        customModelId: $('customModelId')?.value || '',
        customEndpointId: $('customEndpointId')?.value || buildEndpointIdFromUrlClient($('baseUrl')?.value || ''),
        customModelAlias: $('customModelAlias')?.value || '',
      };

      const res = await api('config', configData);
      if (res.success) { state.config = res.config; toast('配置已保存！'); goDashboard(); }
      else toast(res.error || '保存失败', 'error');
    }

    function openGateway() {
      if (state.status.gatewayTokenSecretRefConfigured && !state.status.gatewayToken) {
        toast('当前 token 由 SecretRef 管理，本次会打开未注入 token 的控制台链接。若网页提示输入 token，请在运行环境中提供 OPENCLAW_GATEWAY_TOKEN。', 'info');
      }
      window.open(getGatewayOpenUrl(), '_blank');
    }

    async function copyGatewayLink() {
      const url = getGatewayOpenUrl();
      try {
        await navigator.clipboard.writeText(url);
        toast(state.status.gatewayTokenSecretRefConfigured && !state.status.gatewayToken
          ? '已复制控制台链接。当前 token 由 SecretRef 管理，链接里不会直接附带 token。'
          : '自动认证链接已复制');
      } catch {
        toast('复制失败，请手动打开 OpenClaw', 'error');
      }
    }
`;
}
