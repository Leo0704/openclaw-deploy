const os = require('os') as typeof import('os');
const path = require('path') as typeof import('path');
const { isOpenClawProjectDir } = require('./openclaw-project') as typeof import('./openclaw-project');
const { ANTHROPIC_API_FORMAT, buildEndpointIdFromUrl } = require('./provider-utils') as typeof import('./provider-utils');
const { OPENCLAW_MIN_NODE_VERSION } = require('./system-check') as typeof import('./system-check');
const { WEB_UI_STYLE } = require('./web-ui-style') as typeof import('./web-ui-style');
const { renderWebUiClientScript } = require('./web-ui-client-script') as typeof import('./web-ui-client-script');

export function getHTML(config: Record<string, unknown>, status: Record<string, unknown>, deps: {
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
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🦞 龙虾助手</title>
  <style>${WEB_UI_STYLE}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-main">
        <div class="logo" aria-label="OpenClaw logo">
          <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <linearGradient id="openclaw-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ff4d4d"/>
                <stop offset="100%" stop-color="#991b1b"/>
              </linearGradient>
            </defs>
            <path d="M60 10 C30 10 15 35 15 55 C15 75 30 95 45 100 L45 110 L55 110 L55 100 C55 100 60 102 65 100 L65 110 L75 110 L75 100 C90 95 105 75 105 55 C105 35 90 10 60 10Z" fill="url(#openclaw-logo-gradient)"/>
            <path d="M20 45 C5 40 0 50 5 60 C10 70 20 65 25 55 C28 48 25 45 20 45Z" fill="url(#openclaw-logo-gradient)"/>
            <path d="M100 45 C115 40 120 50 115 60 C110 70 100 65 95 55 C92 48 95 45 100 45Z" fill="url(#openclaw-logo-gradient)"/>
            <path d="M45 15 Q35 5 30 8" stroke="#ff4d4d" stroke-width="3" stroke-linecap="round"/>
            <path d="M75 15 Q85 5 90 8" stroke="#ff4d4d" stroke-width="3" stroke-linecap="round"/>
            <circle cx="45" cy="35" r="6" fill="#050810"/>
            <circle cx="75" cy="35" r="6" fill="#050810"/>
            <circle cx="46" cy="34" r="2.5" fill="#00e5cc"/>
            <circle cx="76" cy="34" r="2.5" fill="#00e5cc"/>
          </svg>
        </div>
        <div>
          <div class="title">龙虾助手</div>
          <div class="subtitle">把 OpenClaw 的授权、部署、配置和运行都收进一个本地控制台。</div>
          <div class="version">v${VERSION}</div>
        </div>
      </div>
      <div class="header-badges">
        <div class="badge">本地控制台</div>
        <div class="badge">自动更新</div>
        <div class="badge">OpenClaw 引导式配置</div>
      </div>
    </div>
    <div id="main-card" class="card"></div>
    <div class="footer">© 2026 龙虾助手 · 让 AI 触手可及</div>
  </div>
  <div id="toast"></div>
  <script>${renderWebUiClientScript(config, status, deps)}</script>
</body>
</html>`;
}
