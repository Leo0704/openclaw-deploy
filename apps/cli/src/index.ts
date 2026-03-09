#!/usr/bin/env node
// @ts-nocheck

/**
 * 龙虾助手
 * 双击运行 → 自动打开浏览器 → 在网页上操作
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { URL } = require('url');

const VERSION = '1.0.0';
const DEFAULT_WEB_PORT = 18790;
const DEFAULT_GATEWAY_PORT = 18789;
const DEFAULT_REPO = 'https://github.com/openclaw/openclaw.git';

// API 提供商配置
const PROVIDERS = {
  anthropic: {
    name: 'Anthropic (Claude)',
    icon: '🟠',
    envKey: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4 (推荐)', recommended: true },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4 (最强)' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (快速)' },
    ]
  },
  openai: {
    name: 'OpenAI (GPT)',
    icon: '🟢',
    envKey: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o (推荐)', recommended: true },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'gpt-4', name: 'GPT-4' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo (快速)' },
    ]
  },
  google: {
    name: 'Google (Gemini)',
    icon: '🔵',
    envKey: 'GOOGLE_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (推荐)', recommended: true },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (快速)' },
    ]
  },
  openrouter: {
    name: 'OpenRouter (多模型)',
    icon: '🟣',
    envKey: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api',
    models: [
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4 (推荐)', recommended: true },
      { id: 'anthropic/claude-opus-4', name: 'Claude Opus 4' },
      { id: 'openai/gpt-4o', name: 'GPT-4o' },
      { id: 'google/gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash' },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat (便宜)' },
    ]
  },
  custom: {
    name: '自定义 API',
    icon: '⚙️',
    envKey: 'CUSTOM_API_KEY',
    baseUrl: '',
    models: [
      { id: 'custom', name: '自定义模型' }
    ]
  }
};

// ============================================
// 配置
// ============================================

function getConfigPath() {
  const dir = path.join(os.homedir(), '.lobster-assistant');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'config.json');
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'));
  } catch {
    return {};
  }
}

function saveConfig(config) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
}

// ============================================
// 工具函数
// ============================================

function runCommand(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    throw new Error(e.stderr || e.message);
  }
}

function checkCommand(cmd) {
  try {
    execSync(`which ${cmd} || where ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function openBrowser(url) {
  const cmd = os.platform() === 'darwin' ? 'open' : os.platform() === 'win32' ? 'start' : 'xdg-open';
  try { execSync(`${cmd} "${url}"`); } catch {}
}

// ============================================
// 状态
// ============================================

let gatewayProcess = null;
let logs = [];

// ============================================
// Web 界面 HTML
// ============================================

function getHTML(config, status) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🦞 龙虾助手</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #FF6B35 0%, #004E89 100%);
      min-height: 100vh; padding: 20px;
    }
    .container { max-width: 800px; margin: 0 auto; }
    .header { text-align: center; color: white; padding: 30px 0; }
    .logo { font-size: 60px; margin-bottom: 10px; }
    .title { font-size: 28px; font-weight: bold; margin-bottom: 5px; }
    .subtitle { opacity: 0.9; }
    .version { font-size: 12px; opacity: 0.7; margin-top: 5px; }
    .card { background: white; border-radius: 16px; padding: 24px; margin-bottom: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
    .card-title { font-size: 18px; color: #1F2937; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #E5E7EB; display: flex; align-items: center; gap: 8px; }
    .status-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    @media (max-width: 500px) { .status-grid { grid-template-columns: 1fr; } }
    .status-item { padding: 16px; background: #F9FAFB; border-radius: 8px; }
    .status-label { font-size: 12px; color: #6B7280; margin-bottom: 4px; }
    .status-value { font-size: 16px; font-weight: 600; color: #1F2937; }
    .status-value.success { color: #10B981; }
    .status-value.error { color: #EF4444; }
    .status-value.warning { color: #F59E0B; }
    .btn { padding: 12px 20px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; margin-right: 8px; margin-bottom: 8px; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; }
    .btn-primary { background: #FF6B35; color: white; }
    .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
    .btn-secondary { background: #F3F4F6; color: #1F2937; }
    .btn-secondary:hover { background: #E5E7EB; }
    .btn-danger { background: #EF4444; color: white; }
    .btn-danger:hover { opacity: 0.9; }
    .btn-small { padding: 8px 16px; font-size: 13px; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .actions { margin-top: 20px; }
    .actions-right { text-align: right; margin-top: 20px; }
    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px; }
    .form-input { width: 100%; padding: 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px; outline: none; transition: border-color 0.2s; }
    .form-input:focus { border-color: #FF6B35; }
    .form-select { width: 100%; padding: 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px; outline: none; background: white; cursor: pointer; }
    .form-select:focus { border-color: #FF6B35; }
    .logs { background: #1F2937; border-radius: 8px; padding: 16px; max-height: 300px; overflow-y: auto; font-family: 'Monaco', 'Menlo', monospace; font-size: 12px; color: #9CA3AF; }
    .log-line { margin-bottom: 4px; }
    .log-time { color: #6B7280; }
    .log-info { color: #9CA3AF; }
    .log-error { color: #F87171; }
    .log-success { color: #34D399; }
    .log-warning { color: #FBBF24; }
    .note { background: #FEF3C7; border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 14px; color: #92400E; }
    .note-info { background: #DBEAFE; color: #1E40AF; }
    .footer { text-align: center; color: rgba(255,255,255,0.8); font-size: 12px; margin-top: 20px; }
    #toast { position: fixed; bottom: 20px; right: 20px; padding: 12px 24px; border-radius: 8px; color: white; font-weight: 500; opacity: 0; transition: all 0.3s; z-index: 1000; }
    #toast.show { opacity: 1; }
    #toast.success { background: #10B981; }
    #toast.error { background: #EF4444; }
    .provider-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px; }
    @media (max-width: 500px) { .provider-grid { grid-template-columns: 1fr; } }
    .provider-card { padding: 16px; border: 2px solid #E5E7EB; border-radius: 12px; cursor: pointer; transition: all 0.2s; text-align: center; }
    .provider-card:hover { border-color: #FF6B35; background: #FFF7ED; }
    .provider-card.selected { border-color: #FF6B35; background: #FFF7ED; }
    .provider-icon { font-size: 24px; margin-bottom: 8px; }
    .provider-name { font-weight: 600; color: #1F2937; }
    .model-list { margin-top: 12px; }
    .model-item { padding: 10px 14px; border: 1px solid #E5E7EB; border-radius: 6px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s; }
    .model-item:hover { border-color: #FF6B35; }
    .model-item.selected { border-color: #FF6B35; background: #FFF7ED; }
    .model-name { font-weight: 500; color: #1F2937; }
    .model-tag { font-size: 11px; padding: 2px 6px; background: #10B981; color: white; border-radius: 4px; margin-left: 8px; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 14px; font-weight: 600; color: #6B7280; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .divider { height: 1px; background: #E5E7EB; margin: 20px 0; }
    .update-section { background: #F9FAFB; border-radius: 8px; padding: 16px; margin-top: 16px; }
    .update-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #E5E7EB; }
    .update-item:last-child { border-bottom: none; }
    .update-info h4 { font-size: 14px; color: #1F2937; margin-bottom: 4px; }
    .update-info p { font-size: 12px; color: #6B7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🦞</div>
      <div class="title">龙虾助手</div>
      <div class="subtitle">OpenClaw 一键部署工具</div>
      <div class="version">v${VERSION}</div>
    </div>
    <div id="main-card" class="card"></div>
    <div class="footer">© 2024 龙虾助手 · 让 AI 触手可及</div>
  </div>
  <div id="toast"></div>
  <script>
    const PROVIDERS = ${JSON.stringify(PROVIDERS)};
    // 默认选择第一个推荐模型
    const defaultProvider = '${config.provider || 'anthropic'}';
    const defaultModel = '${config.model}' || (PROVIDERS[defaultProvider]?.models.find(m => m.recommended)?.id || PROVIDERS[defaultProvider]?.models[0]?.id || '');
    const state = { config: ${JSON.stringify(config)}, status: ${JSON.stringify(status)}, logs: [], selectedProvider: defaultProvider, selectedModel: defaultModel };

    function $(id) { return document.getElementById(id); }
    function toast(msg, type = 'success') {
      const t = $('toast'); t.textContent = msg; t.className = 'show ' + type;
      setTimeout(() => t.className = '', 3000);
    }
    async function api(action, data = {}) {
      try {
        const res = await fetch('/api/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        return await res.json();
      } catch (e) { return { success: false, error: e.message }; }
    }

    function render() {
      const card = $('main-card');
      const c = state.config, s = state.status;

      // 未激活
      if (!c.activated) {
        card.innerHTML = \`
          <h2 class="card-title">🔐 激活产品</h2>
          <div class="note note-info">请输入您购买的激活码来激活产品</div>
          <div class="form-group">
            <label class="form-label">激活码</label>
            <input type="text" id="code" class="form-input" placeholder="XXXX-XXXX-XXXX-XXXX" style="text-transform: uppercase; letter-spacing: 2px;">
          </div>
          <div class="actions">
            <button class="btn btn-primary" onclick="activate()">激活</button>
          </div>
        \`;
        return;
      }

      // 未部署
      if (!s.installed) {
        card.innerHTML = \`
          <h2 class="card-title">📦 部署 OpenClaw</h2>
          <div class="note note-info">点击开始部署，将自动下载并安装 OpenClaw 到您的电脑</div>

          <div class="section">
            <div class="section-title">选择 AI 提供商</div>
            <div class="provider-grid" id="providers">
              \${Object.entries(PROVIDERS).map(([key, p]) => \`
                <div class="provider-card \${state.selectedProvider === key ? 'selected' : ''}" onclick="selectProvider('\${key}')">
                  <div class="provider-icon">\${p.icon}</div>
                  <div class="provider-name">\${p.name}</div>
                </div>
              \`).join('')}
            </div>
          </div>

          <div class="section" id="models-section">
            \${renderModels()}
          </div>

          <div class="section">
            <div class="form-group">
              <label class="form-label">API Key</label>
              <input type="password" id="apiKey" class="form-input" value="\${c.apiKey || ''}" placeholder="请输入 API Key">
            </div>
          </div>

          <div class="divider"></div>

          <div class="section">
            <div class="form-group">
              <label class="form-label">安装路径</label>
              <input type="text" id="path" class="form-input" value="\${c.installPath || '${path.join(os.homedir(), 'openclaw')}'}">
            </div>
            <div class="form-group">
              <label class="form-label">端口号</label>
              <input type="number" id="port" class="form-input" value="\${c.gatewayPort || ${DEFAULT_GATEWAY_PORT}}">
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
        <h2 class="card-title">🎛️ 控制面板</h2>
        <div class="status-grid">
          <div class="status-item">
            <div class="status-label">服务状态</div>
            <div class="status-value \${s.running ? 'success' : 'error'}">\${s.running ? '● 运行中' : '○ 已停止'}</div>
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

        <div class="actions">
          \${s.running
            ? '<button class="btn btn-danger" onclick="stop()">⏹ 停止服务</button>'
            : '<button class="btn btn-primary" onclick="start()">▶ 启动服务</button>'
          }
          <button class="btn btn-secondary" onclick="showConfig()">⚙️ 配置</button>
          \${s.running ? '<button class="btn btn-secondary" onclick="openGateway()">🌐 打开 OpenClaw</button>' : ''}
        </div>

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

        <h3 style="font-size:14px;color:#1F2937;margin-bottom:12px">📋 运行日志</h3>
        <div class="logs" id="logs"><div class="log-line log-info">等待操作...</div></div>
      \`;

      if (s.running) pollLogs();
    }

    function renderModels() {
      const provider = PROVIDERS[state.selectedProvider];
      if (!provider) return '';
      return \`
        <div class="section-title">选择模型</div>
        <div class="model-list">
          \${provider.models.map(m => \`
            <div class="model-item \${state.selectedModel === m.id ? 'selected' : ''}" onclick="selectModel('\${m.id}')">
              <span class="model-name">\${m.name}</span>
              \${m.recommended ? '<span class="model-tag">推荐</span>' : ''}
            </div>
          \`).join('')}
        </div>
      \`;
    }

    function selectProvider(key) {
      state.selectedProvider = key;
      const provider = PROVIDERS[key];
      if (provider && provider.models.length > 0) {
        const recommended = provider.models.find(m => m.recommended);
        state.selectedModel = recommended ? recommended.id : provider.models[0].id;
      }
      render();
    }

    function selectModel(modelId) {
      state.selectedModel = modelId;
      render();
    }

    async function activate() {
      const code = $('code').value;
      if (!code) return toast('请输入激活码', 'error');
      const res = await api('activate', { code });
      if (res.success) { state.config = res.config; toast('激活成功！'); render(); }
      else toast(res.error || '激活失败', 'error');
    }

    async function deploy() {
      const installPath = $('path').value;
      const gatewayPort = parseInt($('port').value);
      const apiKey = $('apiKey').value;

      if (!apiKey) return toast('请输入 API Key', 'error');
      if (!state.selectedModel) return toast('请选择模型', 'error');

      $('main-card').innerHTML = \`
        <h2 class="card-title">📦 部署中...</h2>
        <div class="logs" id="deploy-logs" style="max-height:400px"><div class="log-line log-info">准备部署...</div></div>
      \`;

      const res = await api('deploy', {
        installPath,
        gatewayPort,
        apiKey,
        provider: state.selectedProvider,
        model: state.selectedModel
      });

      const logsEl = $('deploy-logs');
      if (res.logs) {
        logsEl.innerHTML = res.logs.map(l => \`<div class="log-line log-\${l.level || 'info'}"><span class="log-time">[\${l.time}]</span> \${l.message}</div>\`).join('');
      }

      if (res.success) {
        state.config = res.config;
        state.status = res.status;
        logsEl.innerHTML += '<div class="log-line log-success" style="margin-top:16px">🎉 部署完成！</div>';
        $('main-card').innerHTML += '<div class="actions" style="margin-top:20px"><button class="btn btn-primary" onclick="render()">进入控制面板</button></div>';
      } else {
        logsEl.innerHTML += '<div class="log-line log-error" style="margin-top:16px">❌ 部署失败: ' + (res.error || '未知错误') + '</div>';
        $('main-card').innerHTML += '<div class="actions" style="margin-top:20px"><button class="btn btn-primary" onclick="render()">重试</button></div>';
      }
    }

    async function start() {
      if (!state.config.apiKey) return toast('请先配置 API Key', 'error');
      toast('正在启动...');
      const res = await api('start');
      if (res.success) { state.status.running = true; toast('服务已启动！'); render(); }
      else toast(res.error || '启动失败', 'error');
    }

    async function stop() {
      toast('正在停止...');
      const res = await api('stop');
      if (res.success) { state.status.running = false; toast('服务已停止'); render(); }
      else toast(res.error || '停止失败', 'error');
    }

    function showConfig() {
      const card = $('main-card');
      const c = state.config;

      card.innerHTML = \`
        <h2 class="card-title">⚙️ 配置</h2>

        <div class="section">
          <div class="section-title">AI 提供商</div>
          <div class="provider-grid" id="providers">
            \${Object.entries(PROVIDERS).map(([key, p]) => \`
              <div class="provider-card \${state.selectedProvider === key ? 'selected' : ''}" onclick="selectProvider('\${key}')">
                <div class="provider-icon">\${p.icon}</div>
                <div class="provider-name">\${p.name}</div>
              </div>
            \`).join('')}
          </div>
        </div>

        <div class="section" id="models-section">
          \${renderModels()}
        </div>

        <div class="section">
          <div class="form-group">
            <label class="form-label">API Key</label>
            <input type="password" id="apiKey" class="form-input" value="\${c.apiKey || ''}" placeholder="请输入 API Key">
          </div>
          <div class="form-group">
            <label class="form-label">端口号</label>
            <input type="number" id="gport" class="form-input" value="\${c.gatewayPort || ${DEFAULT_GATEWAY_PORT}}">
          </div>
        </div>

        <div class="actions">
          <button class="btn btn-primary" onclick="saveConfig()">保存配置</button>
          <button class="btn btn-secondary" onclick="render()">取消</button>
        </div>
      \`;
    }

    async function saveConfig() {
      const res = await api('config', {
        apiKey: $('apiKey').value,
        gatewayPort: parseInt($('gport').value),
        provider: state.selectedProvider,
        model: state.selectedModel
      });
      if (res.success) { state.config = res.config; toast('配置已保存！'); render(); }
      else toast(res.error || '保存失败', 'error');
    }

    async function updateOpenClaw() {
      toast('检查更新中...');
      const res = await api('update-openclaw');
      if (res.success) toast(res.message || '更新成功！');
      else toast(res.error || '更新失败', 'error');
    }

    function openGateway() {
      window.open('http://localhost:' + (state.config.gatewayPort || ${DEFAULT_GATEWAY_PORT}), '_blank');
    }

    async function pollLogs() {
      if (!state.status.running) return;
      const res = await api('logs');
      if (res.logs) {
        const el = $('logs');
        if (el) { el.innerHTML = res.logs.map(l => \`<div class="log-line log-\${l.level || 'info'}"><span class="log-time">[\${l.time}]</span> \${l.message}</div>\`).join(''); }
      }
      setTimeout(pollLogs, 2000);
    }

    render();
    setInterval(async () => {
      const res = await api('status');
      if (res.status) { state.status = res.status; render(); }
    }, 5000);
  </script>
</body>
</html>`;
}

// ============================================
// API 处理
// ============================================

function handleAPI(action, data, config) {
  switch (action) {
    case 'activate':
      const code = data.code?.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!code || code.length < 16) return { success: false, error: '激活码格式不正确' };
      config.activated = true;
      config.activationCode = data.code;
      config.activatedAt = new Date().toISOString();
      config.deviceName = os.hostname();
      saveConfig(config);
      return { success: true, config };

    case 'deploy':
      const installPath = data.installPath || path.join(os.homedir(), 'openclaw');
      const gatewayPort = data.gatewayPort || DEFAULT_GATEWAY_PORT;
      logs = [];

      const addLog = (msg, level = 'info') => {
        logs.push({ time: new Date().toLocaleTimeString(), level, message: msg });
        if (logs.length > 100) logs.shift();
      };

      try {
        addLog('开始部署...');

        // 保存配置
        config.provider = data.provider || 'anthropic';
        config.model = data.model || '';
        config.apiKey = data.apiKey || '';
        config.gatewayPort = gatewayPort;

        // 克隆
        addLog(`克隆仓库: ${DEFAULT_REPO}`);
        if (!fs.existsSync(installPath)) {
          try {
            runCommand(`git clone --depth 1 ${DEFAULT_REPO} "${installPath}"`);
            addLog('仓库克隆成功 ✓', 'success');
          } catch (e) {
            addLog(`克隆失败: ${e.message}`, 'error');
            throw e;
          }
        } else {
          addLog('目录已存在，更新中...');
          try { runCommand('git pull', installPath); addLog('更新成功 ✓', 'success'); }
          catch { addLog('更新失败，使用现有代码', 'warning'); }
        }

        // 安装依赖
        const pm = checkCommand('pnpm') ? 'pnpm' : 'npm';
        addLog(`安装依赖 (${pm})...`);
        try {
          runCommand(`${pm} install`, installPath);
          addLog('依赖安装成功 ✓', 'success');
        } catch (e) {
          addLog(`依赖安装失败: ${e.message}`, 'error');
          throw e;
        }

        // 构建
        addLog('构建项目...');
        try { runCommand(`${pm} run build`, installPath); addLog('构建成功 ✓', 'success'); }
        catch { addLog('构建跳过（无构建脚本）', 'warning'); }

        config.installPath = installPath;
        saveConfig(config);

        addLog('🎉 部署完成！', 'success');

        return { success: true, config, status: { installed: true, running: false }, logs };
      } catch (e) {
        addLog(`❌ 部署失败: ${e.message}`, 'error');
        return { success: false, error: e.message, logs };
      }

    case 'config':
      if (data.apiKey !== undefined) config.apiKey = data.apiKey;
      if (data.gatewayPort) config.gatewayPort = data.gatewayPort;
      if (data.provider) config.provider = data.provider;
      if (data.model) config.model = data.model;
      saveConfig(config);
      return { success: true, config };

    case 'start':
      if (!config.apiKey) return { success: false, error: '请先配置 API Key' };
      if (!config.installPath || !fs.existsSync(config.installPath)) return { success: false, error: '请先部署' };

      try {
        const provider = PROVIDERS[config.provider] || PROVIDERS.anthropic;
        const env = {
          ...process.env,
          PORT: String(config.gatewayPort || DEFAULT_GATEWAY_PORT),
          [provider.envKey]: config.apiKey,
          // 通用环境变量
          API_KEY: config.apiKey,
          API_PROVIDER: config.provider,
          MODEL: config.model || '',
        };

        const pm = fs.existsSync(path.join(config.installPath, 'pnpm-lock.yaml')) ? 'pnpm' : 'npm';

        gatewayProcess = spawn(`${pm} run start`, [], { cwd: config.installPath, env, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
        gatewayProcess.stdout?.on('data', d => {
          logs.push({ time: new Date().toLocaleTimeString(), level: 'info', message: d.toString().trim() });
          if (logs.length > 100) logs.shift();
        });
        gatewayProcess.stderr?.on('data', d => {
          logs.push({ time: new Date().toLocaleTimeString(), level: 'error', message: d.toString().trim() });
          if (logs.length > 100) logs.shift();
        });

        return { success: true };
      } catch (e) { return { success: false, error: e.message }; }

    case 'stop':
      if (gatewayProcess) { gatewayProcess.kill(); gatewayProcess = null; }
      return { success: true };

    case 'status':
      return { success: true, status: { installed: !!(config.installPath && fs.existsSync(config.installPath)), running: !!gatewayProcess } };

    case 'logs':
      return { success: true, logs };

    case 'license':
      return {
        success: true,
        license: {
          activated: !!config.activated,
          activationCode: config.activationCode || null,
          deviceName: config.deviceName || null,
          activatedAt: config.activatedAt || null
        }
      };

    case 'update-openclaw':
      if (!config.installPath || !fs.existsSync(config.installPath)) return { success: false, error: '请先部署' };
      try {
        runCommand('git fetch origin', config.installPath);
        const local = runCommand('git rev-parse HEAD', config.installPath);
        const remote = runCommand('git rev-parse origin/main', config.installPath);
        if (local === remote) return { success: true, message: '已是最新版本' };
        runCommand('git reset --hard origin/main', config.installPath);
        const pm = checkCommand('pnpm') ? 'pnpm' : 'npm';
        runCommand(`${pm} install`, config.installPath);
        try { runCommand(`${pm} run build`, config.installPath); } catch {}
        return { success: true, message: 'OpenClaw 更新成功！' };
      } catch (e) { return { success: false, error: e.message }; }

    default:
      return { success: false, error: '未知操作' };
  }
}

// ============================================
// Web 服务器
// ============================================

function createServer(config) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    res.setHeader('Access-Control-Allow-Origin', '*');

    if (url.pathname.startsWith('/api/')) {
      const action = url.pathname.replace('/api/', '');
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const data = body ? JSON.parse(body) : {};
          const result = handleAPI(action, data, config);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    if (url.pathname === '/') {
      const status = { installed: !!(config.installPath && fs.existsSync(config.installPath)), running: !!gatewayProcess };
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getHTML(config, status));
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });
}

// ============================================
// 自动更新（龙虾助手本身）- 从 GitHub Releases 拉取
// ============================================

const LOBSTER_REPO = 'https://api.github.com/repos/Leo0704/lobster-releases/releases/latest';

async function checkSelfUpdate() {
  console.log('  检查更新中...');

  try {
    // 从 GitHub API 获取最新 release 信息
    const https = require('https');
    const releaseInfo = await new Promise((resolve, reject) => {
      https.get(LOBSTER_REPO, {
        headers: { 'User-Agent': 'Lobster-Assistant' }
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('解析响应失败')); }
        });
      }).on('error', reject);
    });

    if (!releaseInfo || !releaseInfo.tag_name) {
      console.log('  无法获取版本信息，跳过更新');
      return;
    }

    const latestVersion = releaseInfo.tag_name.replace(/^v/, '');
    if (latestVersion === VERSION) {
      console.log('  已是最新版本');
      return;
    }

    console.log(`  发现新版本 v${latestVersion}，正在更新...`);

    // 确定当前平台的二进制文件名
    const platform = os.platform();
    const arch = os.arch();
    let assetName;
    if (platform === 'darwin' && arch === 'arm64') {
      assetName = 'lobster-macos-arm64';
    } else if (platform === 'darwin') {
      assetName = 'lobster-macos-x64';
    } else if (platform === 'win32') {
      assetName = 'lobster-win-x64.exe';
    } else {
      assetName = 'lobster-linux-x64';
    }

    // 查找对应的 asset
    const asset = releaseInfo.assets?.find(a => a.name === assetName);
    if (!asset) {
      console.log(`  未找到 ${assetName}，跳过更新`);
      return;
    }

    // 下载新版本
    const currentExe = process.execPath;
    const newExe = currentExe + '.new';

    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(newExe);
      https.get(asset.browser_download_url, {
        headers: { 'User-Agent': 'Lobster-Assistant' }
      }, (res) => {
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(true);
        });
      }).on('error', (e) => {
        fs.unlinkSync(newExe);
        reject(e);
      });
    });

    // 设置可执行权限
    if (platform !== 'win32') {
      fs.chmodSync(newExe, 0o755);
    }

    // 替换旧文件
    const backupExe = currentExe + '.old';
    fs.renameSync(currentExe, backupExe);
    fs.renameSync(newExe, currentExe);

    console.log('  更新完成！正在重启...');

    // 重启
    const { spawn } = require('child_process');
    spawn(currentExe, process.argv.slice(1), {
      detached: true,
      stdio: 'inherit'
    });
    process.exit(0);

  } catch (e) {
    console.log(`  更新检查失败: ${e.message}`);
  }
}

// ============================================
// 启动！
// ============================================

async function main() {
  const config = loadConfig();

  // 龙虾助手自动更新（启动时检查）
  await checkSelfUpdate();

  // 每天自动检查更新
  const ONE_DAY = 24 * 60 * 60 * 1000;
  setInterval(() => {
    console.log('[自动更新] 每日检查更新...');
    checkSelfUpdate();
  }, ONE_DAY);

  const server = createServer(config);
  const port = process.env.LOBSTER_PORT || DEFAULT_WEB_PORT;

  server.listen(port, () => {
    console.log('');
    console.log('\x1b[46m\x1b[30m 🦞 龙虾助手 \x1b[0m');
    console.log('');
    console.log(`  Web 界面: \x1b[36mhttp://localhost:${port}\x1b[0m`);
    console.log('  自动更新: 每24小时检查');
    console.log('');
    console.log('  按 Ctrl+C 停止');
    console.log('');

    openBrowser(`http://localhost:${port}`);
  });
}

main().catch(console.error);
