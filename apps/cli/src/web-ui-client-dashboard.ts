const os = require('os') as typeof import('os');
const path = require('path') as typeof import('path');

export function renderWebUiClientDashboard(config: Record<string, unknown>, status: Record<string, unknown>, deps: {
  version: string;
  providers: Record<string, unknown>;
  defaultWebPort: number;
  defaultGatewayPort: number;
  clawhubMarketUrl: string;
  purchaseUrl: string;
}) {
  const DEFAULT_WEB_PORT = deps.defaultWebPort;
  const DEFAULT_GATEWAY_PORT = deps.defaultGatewayPort;
  const CLAWHUB_MARKET_URL = deps.clawhubMarketUrl;
  const DEFAULT_INSTALL_PATH = JSON.stringify(path.join(os.homedir(), 'openclaw'));
  void status;
  return `
    function renderDashboard() {
      state.currentView = 'dashboard';
      state.deployPolling = false;
      state.deployTask = null;
      state.pendingDeployPayload = null;
      const card = $('main-card');
      const c = state.config, s = state.status;
      const installed = !!s.installed;
      const effectiveStatus = state.status;

      // 未激活
      if (!c.activated) {
        card.innerHTML = \`
          <h2 class="card-title">🔐 激活产品</h2>
          <div class="hero-panel">
            <div class="hero-kicker">Activation</div>
            <div class="hero-title">先完成激活，再进入部署和运行</div>
            <div class="hero-copy">输入购买得到的激活码即可完成当前设备绑定。激活成功后，会自动进入 OpenClaw 的部署与配置流程。</div>
            <div class="meta-row">
              <div class="meta-pill">一机一绑定</div>
              <div class="meta-pill">服务端校验</div>
              <div class="meta-pill">支持购买后即刻激活</div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">激活码</label>
            <input type="text" id="code" class="form-input" placeholder="XXXX-XXXX-XXXX-XXXX" style="text-transform: uppercase; letter-spacing: 2px;">
            <div class="form-helper">输入时可以带分隔符，系统会自动规范化并提交到授权服务器验证。</div>
          </div>
          <div class="actions">
            <button class="btn btn-primary" onclick="activate()">激活</button>
            <a class="btn btn-secondary" href="\${state.purchaseUrl}" target="_blank" rel="noopener noreferrer">购买激活码</a>
          </div>
          <div class="panel" style="margin-top:14px">
            <div class="panel-title">还没有激活码？</div>
            <div class="panel-copy">点击“购买激活码”会打开购买页面。购买后回到这里输入激活码即可继续，不需要额外切换到命令行。</div>
          </div>
        \`;
        return;
      }

      // 未部署
      if (!installed) {
        const deployProvider = PROVIDERS[state.selectedProvider] || PROVIDERS.custom;
        const deployIsCustom = state.selectedProvider === 'custom';
        card.innerHTML = \`
          <h2 class="card-title">📦 部署 OpenClaw</h2>
          <div class="hero-panel">
            <div class="hero-kicker">Deploy</div>
            <div class="hero-title">先确定模型接入方式，再落到本地部署</div>
            <div class="hero-copy">先选模型接入方式，再完成本地部署。常见服务可以快速配置，自定义接入则需要先完成连接验证。</div>
          </div>

          <div class="note note-info">部署前会先跑一次性环境预检，缺依赖、端口冲突、安装路径异常会在开始前集中给出。</div>

          <div class="wizard-steps">
            <div class="wizard-step">
              <div class="wizard-step-title">第 1 步：选择 Provider</div>
              <div class="wizard-step-desc">先选择你要接入的模型服务。常见服务可以直接选，自定义服务则需要手动填写连接信息。</div>
              <select id="deployProvider" class="form-select" onchange="selectProvider(this.value)">
                \${renderProviderOptions()}
              </select>
            </div>

            <div class="wizard-step">
              <div class="wizard-step-title">第 2 步：填写模型与认证</div>
              \${deployIsCustom ? \`
                <div class="wizard-step-desc">自定义接入时，请先填写地址和密钥，再确认接口类型与模型名称。</div>
                <div class="form-group">
                  <label class="form-label">API Key</label>
                  <input type="password" id="apiKey" class="form-input" value="\${c.apiKey || ''}" placeholder="请输入 API Key">
                </div>
                <div class="form-group">
                  <label class="form-label">Base URL</label>
                  <input type="text" id="deployBaseUrl" class="form-input" value="\${c.baseUrl || ''}" placeholder="例如: https://api.example.com/v1">
                </div>
                <div class="form-group">
                  <label class="form-label">接口类型</label>
                  <select id="deployApiFormat" class="form-select">
                    <option value="openai" \${normalizeCustomCompatibilityChoiceClient(c.apiFormat || 'openai') === 'openai' ? 'selected' : ''}>OpenAI-compatible</option>
                    <option value="anthropic" \${normalizeCustomCompatibilityChoiceClient(c.apiFormat) === 'anthropic' ? 'selected' : ''}>Anthropic-compatible</option>
                    <option value="unknown" \${normalizeCustomCompatibilityChoiceClient(c.apiFormat) === 'unknown' ? 'selected' : ''}>Unknown (自动探测)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Model ID</label>
                  <input type="text" id="deployCustomModelId" class="form-input" value="\${c.customModelId || c.model || ''}" placeholder="例如: glm-5">
                </div>
              \` : \`
                <div class="wizard-step-desc">常见服务只需要选模型并填写 API Key，不需要额外步骤。</div>
                <div class="form-group">
                  <label class="form-label">Model</label>
                  <select id="deployModel" class="form-select" onchange="selectModel(this.value)">
                    \${renderModelOptions(state.selectedProvider, state.selectedModel)}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">API Key</label>
                  <input type="password" id="apiKey" class="form-input" value="\${c.apiKey || ''}" placeholder="请输入 API Key">
                </div>
              \`}
            </div>

            <div class="wizard-step">
              <div class="wizard-step-title">第 3 步：部署位置与端口</div>
              <div class="form-group">
                <label class="form-label">安装路径</label>
                <input type="text" id="path" class="form-input" value="\${c.installPath || ${DEFAULT_INSTALL_PATH}}">
              </div>
              <div class="form-group">
                <label class="form-label">端口号</label>
                <input type="number" id="port" class="form-input" value="\${c.gatewayPort || ${DEFAULT_GATEWAY_PORT}}">
              </div>
            </div>
          </div>

          <div class="section">
            <div class="panel">
              <div class="panel-title">部署说明</div>
              <div class="panel-copy">
                \${deployIsCustom
                  ? '自定义接入会保留你填写的地址、接口类型、模型名称和别名，后续启动时直接沿用。'
                  : '常见服务这里会自动生成对应配置，保存后可以直接启动 OpenClaw。'}
              </div>
            </div>
          </div>

          <div class="actions">
            <button class="btn btn-primary" onclick="deploy()">开始部署</button>
          </div>
        \`;
        return;
      }

      // 控制面板
      card.innerHTML = \`
        <div class="tabs">
          <button class="tab \${state.currentTab === 'status' || !state.currentTab ? 'active' : ''}" onclick="switchTab('status')">🎛️ 服务</button>
          <button class="tab \${state.currentTab === 'channels' ? 'active' : ''}" onclick="switchTab('channels')">📢 通知</button>
          <button class="tab \${state.currentTab === 'skills' ? 'active' : ''}" onclick="switchTab('skills')">🧩 技能市场</button>
          <button class="tab \${state.currentTab === 'help' ? 'active' : ''}" onclick="switchTab('help')">❓ 使用指南</button>
        </div>

        <!-- 服务 Tab -->
        <div id="tab-status" class="tab-content \${state.currentTab === 'status' || !state.currentTab ? 'active' : ''}">
          <div class="service-hero">
            <div class="hero-panel service-actions">
              <div class="hero-kicker">Service</div>
              <div class="hero-title">\${effectiveStatus.running ? 'OpenClaw 正在运行' : 'OpenClaw 当前未启动'}</div>
              <div class="hero-copy">\${effectiveStatus.running ? '网关已经就绪，可以直接打开 OpenClaw，或者复制自动认证链接给当前浏览器会话使用。' : '先确认 API 配置无误，再启动本地网关。启动失败时，可直接在下方查看运行日志。'}</div>
              <div class="actions">
                \${effectiveStatus.running
                  ? '<button class="btn btn-danger" onclick="stop()">⏹ 停止服务</button>'
                  : '<button class="btn btn-primary" onclick="start()">▶ 启动服务</button>'
                }
                <button class="btn btn-secondary" onclick="showConfig()">⚙️ 配置</button>
                \${effectiveStatus.running ? '<button class="btn btn-secondary" onclick="openGateway()">🌐 打开 OpenClaw</button>' : ''}
              </div>
            </div>
            <div class="panel service-side">
              <div class="panel-title">当前运行要点</div>
              <div class="panel-copy">
                Web 控制台：<span class="mono">http://localhost:${DEFAULT_WEB_PORT}</span><br>
                Gateway 端口：<span class="mono">\${c.gatewayPort || ${DEFAULT_GATEWAY_PORT}}</span><br>
                模型接入：<span class="mono">\${c.provider || '未配置'} / \${c.model || '未配置'}</span>
              </div>
              \${effectiveStatus.running ? '<div class="actions" style="margin-top:14px"><button class="btn btn-secondary btn-small" onclick="copyGatewayLink()">🔗 复制自动认证链接</button></div>' : ''}
            </div>
          </div>

          <div class="status-grid">
            <div class="status-item">
              <div class="status-label">服务状态</div>
              <div class="status-value \${effectiveStatus.running ? 'success' : 'error'}">\${effectiveStatus.running ? '● 运行中' : '○ 已停止'}</div>
            </div>
            <div class="status-item">
              <div class="status-label">端口</div>
              <div class="status-value">\${c.gatewayPort || ${DEFAULT_GATEWAY_PORT}}</div>
            </div>
            <div class="status-item">
              <div class="status-label">AI 提供商</div>
              <div class="status-value">\${PROVIDERS[c.provider]?.name || '未配置'}</div>
            </div>
            <div class="status-item">
              <div class="status-label">模型</div>
              <div class="status-value" style="font-size:12px">\${c.model || '未配置'}</div>
            </div>
          </div>

          \${effectiveStatus.running && effectiveStatus.gatewayToken ? \`
            <div class="note note-info" style="margin-top:14px">
              访问令牌：<code style="word-break:break-all">\${effectiveStatus.gatewayToken}</code><br>
              使用“打开 OpenClaw”或“复制自动认证链接”时会自动带上它。只有你自己手动打开新标签页时，才需要把它填进网页设置里。
            </div>
          \` : effectiveStatus.running && effectiveStatus.gatewayTokenSecretRefConfigured ? \`
            <div class="note note-info" style="margin-top:14px">
              当前访问令牌由外部 SecretRef 管理。龙虾助手不会把它直接拼进网页链接里。<br>
              你仍然可以打开 OpenClaw，但如果网页提示输入 token，请先在启动环境中提供 <span class="mono">OPENCLAW_GATEWAY_TOKEN</span>，或使用你自己的 SecretRef 来源。
            </div>
          \` : ''}

          <div class="divider"></div>

          <div class="update-section">
            <h3 style="font-size:14px;color:#1F2937;margin-bottom:12px">🔄 更新管理</h3>
            <div class="update-item">
              <div class="update-info">
                <h4>OpenClaw</h4>
                <p>更新 AI 网关服务到最新版本</p>
              </div>
              <button class="btn btn-secondary btn-small" onclick="updateOpenClaw()">检查更新</button>
            </div>
            <div class="update-item">
              <div class="update-info">
                <h4>龙虾助手</h4>
                <p>启动时自动检查并强制更新</p>
              </div>
              <span style="color:#10B981;font-size:13px">✓ 自动更新已启用</span>
            </div>
          </div>

          <div class="divider"></div>

          <div class="panel">
            <div class="panel-title">卸载 OpenClaw</div>
            <div class="panel-copy">
              会先停止网关，再删除 OpenClaw 安装目录、<span class="mono">~/.openclaw</span> 运行缓存、临时日志目录，并清空当前部署配置。
              产品激活状态会保留，不会把龙虾助手本身一起卸掉。
            </div>
            <div class="actions" style="margin-top:14px">
              <button class="btn btn-danger" onclick="uninstallOpenClaw()">🗑️ 彻底卸载 OpenClaw</button>
            </div>
          </div>

          <div class="divider"></div>

          <h3 style="font-size:14px;color:#1F2937;margin-bottom:12px">📋 运行日志</h3>
          <div class="logs" id="logs"><div class="log-line log-info">等待操作...</div></div>
        </div>

        <!-- 通知 Tab -->
        <div id="tab-channels" class="tab-content \${state.currentTab === 'channels' ? 'active' : ''}">
          <div id="channels-content">
            <div style="text-align:center;padding:20px;color:#9CA3AF;">加载中...</div>
          </div>
        </div>

        <!-- 技能市场 Tab -->
        <div id="tab-skills" class="tab-content \${state.currentTab === 'skills' ? 'active' : ''}">
          <div class="note note-info" style="margin-bottom: 16px;">
            🧩 这里显示的是 OpenClaw 当前识别到的技能来源，不只包括你后来安装的技能，也包括 OpenClaw 自带和只读来源里的技能。
          </div>
          <div class="panel" style="margin-bottom:16px">
            <div class="panel-title">官方技能市场</div>
            <div class="panel-copy">
              直接去 <span class="mono">clawhub.ai</span> 浏览技能详情、安装说明和依赖要求。这个页面只负责执行安装和查看已安装结果，不再内置一份本地热门技能假列表。
            </div>
            <div class="actions" style="margin-top:14px">
              <a class="btn btn-primary" href="${CLAWHUB_MARKET_URL}" target="_blank" rel="noopener">打开 ClawHub</a>
              <button class="btn btn-secondary" onclick="refreshInstalledSkills()">刷新已安装</button>
            </div>
          </div>

          <div class="panel" style="margin-bottom:16px">
            <div class="panel-title">按 skill id 安装</div>
            <div class="panel-copy">
              在 ClawHub 找到技能后，把技能 id 粘贴到下面。例如 <span class="mono">tavily-search</span> 或 <span class="mono">github</span>。
            </div>
            <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;margin-top:14px">
              <input id="skill-id-input" class="input" placeholder="输入 skill id，例如 tavily-search" />
              <button class="btn btn-primary" onclick="installSkillFromInput()">安装技能</button>
            </div>
            <div style="margin-top:10px;font-size:12px;color:#6B7280">
              安装后通常需要重启 OpenClaw 服务，技能才会出现在实际会话里。
            </div>
          </div>

          <div class="divider"></div>

          <h3 style="font-size:14px;color:#1F2937;margin-bottom:12px">✅ OpenClaw 当前识别到的技能</h3>
          <div id="installed-skills">
            <div style="text-align:center;padding:20px;color:#9CA3AF;">加载中...</div>
          </div>
        </div>

        <!-- 使用指南 Tab -->
        <div id="tab-help" class="tab-content \${state.currentTab === 'help' ? 'active' : ''}"
          加载中...
        </div>
      \`;

      if (effectiveStatus.running && (state.currentTab === 'status' || !state.currentTab)) pollLogs();
      if (state.currentTab === 'channels') {
        if (state.channelsLoaded && state.channelsData) {
          renderChannels();
        } else {
          queueTabDataLoad('channels');
        }
      }
      if (state.currentTab === 'skills') {
        if (state.skillsLoaded) {
          renderInstalledSkills();
        } else {
          queueTabDataLoad('skills');
        }
      }
      if (state.currentTab === 'help') {
        if (state.helpLoaded) {
          loadHelp();
        } else {
          queueTabDataLoad('help');
        }
      }
    }

    function renderProviderOptions() {
      return Object.entries(PROVIDERS).map(([key, provider]) => {
        return '<option value="' + key + '"' + (state.selectedProvider === key ? ' selected' : '') + '>' + provider.name + '</option>';
      }).join('');
    }

    function renderModelOptions(providerKey, selectedValue) {
      const provider = PROVIDERS[providerKey];
      if (!provider || !provider.models || provider.models.length === 0) return '';
      return provider.models.map((model) => {
        const selected = selectedValue === model.id ? ' selected' : '';
        return '<option value="' + model.id + '"' + selected + '>' + model.name + '</option>';
      }).join('');
    }

    function selectProvider(key) {
      state.selectedProvider = key;
      resetCustomWizard();
      const provider = PROVIDERS[key];
      if (provider && provider.models && provider.models.length > 0) {
        if (key === 'custom') {
          state.selectedModel = state.config.customModelId || state.config.model || '';
        } else {
          const recommended = provider.models.find(m => m.recommended);
          state.selectedModel = recommended ? recommended.id : provider.models[0].id;
        }
      }
      render();
    }

    function selectModel(modelId) {
      state.selectedModel = modelId;
      render();
    }
`;
}
