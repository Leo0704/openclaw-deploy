export function renderWebUiClientChannels(config: Record<string, unknown>, status: Record<string, unknown>, deps: {
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
  return `    // ============================================
    // 通知渠道
    // ============================================

    async function loadChannels() {
      state.channelsLoading = true;
      const contentEl = $('channels-content');
      if (contentEl) {
        contentEl.innerHTML = '<div style="text-align:center;padding:20px;color:#9CA3AF;">正在加载通知渠道...</div>';
      }
      const res = await api('channels/status');
      state.channelsLoading = false;
      if (!res.success) {
        toast(res.error || '无法读取通知配置', 'error');
        return;
      }
      state.channelsData = res;
      state.channelsLoaded = true;
      renderChannels();
    }

    async function refreshChannels() {
      state.channelsLoaded = false;
      state.channelsData = null;
      await loadChannels();
    }

    async function probeChannels() {
      toast('正在向 OpenClaw 请求渠道探测...', 'info');
      const res = await api('channels/probe', {}, 15000);
      if (!res.success) {
        toast(res.error || '渠道探测失败', 'error');
        return;
      }
      state.channelsData = res;
      state.channelsLoaded = true;
      renderChannels();
      toast('渠道状态已刷新');
    }

    function renderDiagnostics(items) {
      if (!Array.isArray(items) || items.length === 0) {
        return '<div class="note note-info" style="margin-top:12px">当前没有发现明显的配置缺口。</div>';
      }
      return '<div class="note note-warning" style="margin-top:12px"><ul style="margin-left:18px">' +
        items.map(item => '<li>' + item + '</li>').join('') +
      '</ul></div>';
    }

    function renderRuntime(runtime) {
      if (!runtime || !runtime.reachable) {
        return '<div class="panel-copy">OpenClaw 当前未连上网关，这里先显示配置层状态。保存后重启服务，再回来确认渠道是否真正连上。</div>';
      }
      const bits = [];
      if (runtime.accountId) bits.push('账号：<span class="mono">' + runtime.accountId + '</span>');
      if (runtime.configured !== undefined) bits.push('配置：' + (runtime.configured ? '已识别' : '未识别'));
      if (runtime.running !== undefined) bits.push('运行：' + (runtime.running ? '运行中' : '未运行'));
      if (runtime.connected !== undefined) bits.push('连接：' + (runtime.connected ? '已连通' : '未连通'));
      if (runtime.lastError) bits.push('最近错误：' + runtime.lastError);
      return '<div class="panel-copy">' + bits.join('<br>') + '</div>';
    }

    function renderGuideSteps(title, steps) {
      return [
        '<div class="panel" style="margin-bottom:16px;background:rgba(255,255,255,0.78)">',
        '  <div class="panel-title">' + title + '</div>',
        '  <div style="display:grid;gap:10px;margin-top:14px">',
             steps.map((step, index) => (
               '<div style="display:grid;grid-template-columns:32px minmax(0,1fr);gap:12px;align-items:flex-start">' +
                 '<div style="width:32px;height:32px;border-radius:999px;background:#fff0e8;color:#d75621;display:flex;align-items:center;justify-content:center;font-weight:700">' + (index + 1) + '</div>' +
                 '<div><div style="font-size:13px;font-weight:600;color:#1F2937">' + step.title + '</div><div style="font-size:13px;color:#5f6b7a;line-height:1.6;margin-top:4px">' + step.body + '</div></div>' +
               '</div>'
             )).join(''),
        '  </div>',
        '</div>',
      ].join('');
    }

    function renderTelegramGuide() {
      return renderGuideSteps('Telegram 接入顺序', [
        {
          title: '先在 Telegram 里创建 Bot',
          body: '打开 <span class="mono">@BotFather</span>，执行 <span class="mono">/newbot</span>。它会返回一个 Bot Token，这个 Token 直接填到下面的第 1 个输入框。',
        },
        {
          title: '确认谁可以给机器人发消息',
          body: '把你自己的 Telegram 用户 ID 填进 allowFrom。若你只是自己用，先填你自己的 ID 即可；若要开放给多人，再逐个补进去。',
        },
        {
          title: '决定陌生人和群聊怎么进来',
          body: '私聊策略控制陌生用户能否直接给 Bot 发消息；群聊策略控制群消息是否直接放行。默认建议保持 <span class="mono">pairing + allowlist</span>，这样最稳。',
        },
        {
          title: '群聊是否必须 @ 机器人',
          body: '建议默认开启。这样 Bot 不会在群里把所有消息都当作指令，比较接近 OpenClaw 对"群里提及才响应"的常见用法。',
        },
      ]);
    }

    function renderFeishuGuide() {
      return renderGuideSteps('飞书接入顺序', [
        {
          title: '先准备企业自建应用',
          body: '到 <a href="https://open.feishu.cn/" target="_blank" rel="noopener">飞书开放平台</a> 创建企业自建应用。你需要拿到 <span class="mono">App ID</span> 和 <span class="mono">App Secret</span>。',
        },
        {
          title: '先用 websocket，除非你已经有公网回调',
          body: '如果你只是本机自用，优先选 <span class="mono">websocket</span>。只有你明确在做公网事件回调时，才改成 <span class="mono">webhook</span> 并填写 Verification Token。',
        },
        {
          title: '决定私聊和群聊的放行策略',
          body: '私聊策略控制个人消息；群聊策略控制群消息。默认建议保持 <span class="mono">pairing + allowlist</span>，保存后再看 OpenClaw 的状态是否识别到飞书渠道。',
        },
        {
          title: '保存后确认插件是否真的加载',
          body: '这页会尽量补齐 <span class="mono">plugins.allow</span> 和 <span class="mono">plugins.entries.feishu.enabled</span>，但如果你本机没有可用的飞书插件，仍然需要后续补插件安装。',
        },
      ]);
    }

    function renderChannels() {
      const el = $('channels-content');
      if (!el || !state.channelsData) return;
      const data = state.channelsData;
      const telegram = data.channels?.telegram;
      const feishu = data.channels?.feishu;
      el.innerHTML = [
        '<div class="panel" style="margin-bottom:16px">',
        '  <div class="panel-title">通知渠道配置</div>',
        '  <div class="panel-copy">',
        '    这里直接编辑 OpenClaw 实际使用的通知配置。当前配置文件：<span class="mono">' + (data.configPath || '未找到') + '</span><br>',
             (data.gatewayReachable ? '网关在线，状态面板会优先显示 OpenClaw 当前识别到的渠道状态。' : '网关离线，当前先显示配置状态；保存后建议重启服务再确认。'),
        '  </div>',
        '  <div class="actions" style="margin-top:14px"><button class="btn btn-secondary" onclick="refreshChannels()">刷新状态</button><button class="btn btn-secondary" onclick="probeChannels()">主动探测</button></div>',
        '</div>',
        '<div class="panel" style="margin-bottom:16px">',
        '  <div class="panel-title">Telegram</div>',
        '  <div class="panel-copy">用于 Telegram 机器人私聊/群聊接入。这里按 OpenClaw 的配置语义写入 <span class="mono">channels.telegram</span>。</div>',
           renderTelegramGuide(),
        '  <div class="status-grid" style="margin-top:14px">',
        '    <div class="status-item"><div class="status-label">配置状态</div><div class="status-value ' + (telegram?.configured ? 'success' : 'error') + '">' + (telegram?.configured ? '已配置' : '未配置') + '</div></div>',
        '    <div class="status-item"><div class="status-label">启用状态</div><div class="status-value">' + (telegram?.enabled ? '已启用' : '未启用') + '</div></div>',
        '    <div class="status-item"><div class="status-label">Bot Token</div><div class="status-value" style="font-size:12px">' + (telegram?.config?.botTokenMasked || '未填写') + '</div></div>',
        '    <div class="status-item"><div class="status-label">私聊策略</div><div class="status-value">' + (telegram?.config?.dmPolicy || 'pairing') + '</div></div>',
        '  </div>',
        '  <div class="section" style="margin-top:14px">',
        '    <div class="form-group"><label class="form-label">Bot Token</label><input id="telegramBotToken" class="form-input" type="password" value="' + (telegram?.config?.botToken || '') + '" placeholder="123456:ABC..." /></div>',
        '    <div class="form-group"><label class="form-label">私聊策略</label><select id="telegramDmPolicy" class="form-select">' +
               '<option value="pairing"' + (telegram?.config?.dmPolicy === 'pairing' ? ' selected' : '') + '>pairing</option>' +
               '<option value="allowlist"' + (telegram?.config?.dmPolicy === 'allowlist' ? ' selected' : '') + '>allowlist</option>' +
               '<option value="open"' + (telegram?.config?.dmPolicy === 'open' ? ' selected' : '') + '>open</option>' +
               '<option value="disabled"' + (telegram?.config?.dmPolicy === 'disabled' ? ' selected' : '') + '>disabled</option>' +
            '</select></div>',
        '    <div class="form-group"><label class="form-label">群聊策略</label><select id="telegramGroupPolicy" class="form-select">' +
               '<option value="allowlist"' + (telegram?.config?.groupPolicy === 'allowlist' ? ' selected' : '') + '>allowlist</option>' +
               '<option value="open"' + (telegram?.config?.groupPolicy === 'open' ? ' selected' : '') + '>open</option>' +
               '<option value="disabled"' + (telegram?.config?.groupPolicy === 'disabled' ? ' selected' : '') + '>disabled</option>' +
            '</select></div>',
        '    <div class="form-group"><label class="form-label">allowFrom</label><textarea id="telegramAllowFrom" class="form-input" rows="3" placeholder="每行一个用户 ID，或用逗号分隔">' + (Array.isArray(telegram?.config?.allowFrom) ? telegram.config.allowFrom.join('\\n') : '') + '</textarea></div>',
        '    <label style="display:flex;align-items:center;gap:10px;font-size:13px;color:#374151"><input id="telegramRequireMention" type="checkbox"' + (telegram?.config?.requireMention !== false ? ' checked' : '') + '> 群聊时需要 @ 机器人</label>',
        '    <div class="actions" style="margin-top:14px"><button class="btn btn-primary" onclick="saveTelegramChannel()">保存 Telegram 配置</button></div>',
        '  </div>',
        '  <div class="divider"></div>',
        '  <div class="panel-title">运行状态</div>',
           renderRuntime(telegram?.runtime),
           renderDiagnostics(telegram?.diagnostics),
        '</div>',
        '<div class="panel">',
        '  <div class="panel-title">飞书</div>',
        '  <div class="panel-copy">用于飞书私聊/群聊接入。这里写入 <span class="mono">channels.feishu</span>，并尽量补齐插件启用信息。</div>',
           renderFeishuGuide(),
        '  <div class="status-grid" style="margin-top:14px">',
        '    <div class="status-item"><div class="status-label">配置状态</div><div class="status-value ' + (feishu?.configured ? 'success' : 'error') + '">' + (feishu?.configured ? '已配置' : '未配置') + '</div></div>',
        '    <div class="status-item"><div class="status-label">插件状态</div><div class="status-value">' + (feishu?.pluginReady ? '已启用' : '待确认') + '</div></div>',
        '    <div class="status-item"><div class="status-label">App ID</div><div class="status-value" style="font-size:12px">' + (feishu?.config?.appId || '未填写') + '</div></div>',
        '    <div class="status-item"><div class="status-label">连接模式</div><div class="status-value">' + (feishu?.config?.connectionMode || 'websocket') + '</div></div>',
        '  </div>',
        '  <div class="section" style="margin-top:14px">',
        '    <div class="form-group"><label class="form-label">App ID</label><input id="feishuAppId" class="form-input" value="' + (feishu?.config?.appId || '') + '" placeholder="cli_xxx" /></div>',
        '    <div class="form-group"><label class="form-label">App Secret</label><input id="feishuAppSecret" type="password" class="form-input" value="' + (feishu?.config?.appSecret || '') + '" placeholder="请输入 App Secret" /></div>',
        '    <div class="form-group"><label class="form-label">连接模式</label><select id="feishuConnectionMode" class="form-select">' +
               '<option value="websocket"' + (feishu?.config?.connectionMode === 'websocket' ? ' selected' : '') + '>websocket</option>' +
               '<option value="webhook"' + (feishu?.config?.connectionMode === 'webhook' ? ' selected' : '') + '>webhook</option>' +
            '</select></div>',
        '    <div class="form-group"><label class="form-label">Verification Token（仅 webhook）</label><input id="feishuVerificationToken" class="form-input" value="' + (feishu?.config?.verificationToken || '') + '" placeholder="Webhook 模式必填" /></div>',
        '    <div class="form-group"><label class="form-label">私聊策略</label><select id="feishuDmPolicy" class="form-select">' +
               '<option value="pairing"' + (feishu?.config?.dmPolicy === 'pairing' ? ' selected' : '') + '>pairing</option>' +
               '<option value="allowlist"' + (feishu?.config?.dmPolicy === 'allowlist' ? ' selected' : '') + '>allowlist</option>' +
               '<option value="open"' + (feishu?.config?.dmPolicy === 'open' ? ' selected' : '') + '>open</option>' +
               '<option value="disabled"' + (feishu?.config?.dmPolicy === 'disabled' ? ' selected' : '') + '>disabled</option>' +
            '</select></div>',
        '    <div class="form-group"><label class="form-label">群聊策略</label><select id="feishuGroupPolicy" class="form-select">' +
               '<option value="allowlist"' + (feishu?.config?.groupPolicy === 'allowlist' ? ' selected' : '') + '>allowlist</option>' +
               '<option value="open"' + (feishu?.config?.groupPolicy === 'open' ? ' selected' : '') + '>open</option>' +
               '<option value="disabled"' + (feishu?.config?.groupPolicy === 'disabled' ? ' selected' : '') + '>disabled</option>' +
            '</select></div>',
        '    <div class="form-group"><label class="form-label">allowFrom（可选）</label><textarea id="feishuAllowFrom" class="form-input" rows="3" placeholder="每行一个用户 ID，或用逗号分隔">' + (Array.isArray(feishu?.config?.allowFrom) ? feishu.config.allowFrom.join('\\n') : '') + '</textarea></div>',
        '    <label style="display:flex;align-items:center;gap:10px;font-size:13px;color:#374151"><input id="feishuRequireMention" type="checkbox"' + (feishu?.config?.requireMention !== false ? ' checked' : '') + '> 群聊时需要 @ 机器人</label>',
        '    <div class="actions" style="margin-top:14px"><button class="btn btn-primary" onclick="saveFeishuChannel()">保存飞书配置</button></div>',
        '  </div>',
        '  <div class="divider"></div>',
        '  <div class="panel-title">运行状态</div>',
           renderRuntime(feishu?.runtime),
           renderDiagnostics(feishu?.diagnostics),
        '</div>',
      ].join('');
    }

    async function saveTelegramChannel() {
      const res = await api('channels/save-telegram', {
        botToken: $('telegramBotToken')?.value || '',
        dmPolicy: $('telegramDmPolicy')?.value || 'pairing',
        groupPolicy: $('telegramGroupPolicy')?.value || 'allowlist',
        allowFrom: $('telegramAllowFrom')?.value || '',
        requireMention: !!$('telegramRequireMention')?.checked,
      });
      if (!res.success) {
        toast(res.error || '保存失败', 'error');
        return;
      }
      state.channelsData = res;
      state.channelsLoaded = true;
      renderChannels();
      toast(res.message || 'Telegram 配置已保存');
      await promptChannelRestartIfNeeded();
    }

    async function saveFeishuChannel() {
      const res = await api('channels/save-feishu', {
        appId: $('feishuAppId')?.value || '',
        appSecret: $('feishuAppSecret')?.value || '',
        connectionMode: $('feishuConnectionMode')?.value || 'websocket',
        verificationToken: $('feishuVerificationToken')?.value || '',
        dmPolicy: $('feishuDmPolicy')?.value || 'pairing',
        groupPolicy: $('feishuGroupPolicy')?.value || 'allowlist',
        allowFrom: $('feishuAllowFrom')?.value || '',
        requireMention: !!$('feishuRequireMention')?.checked,
      });
      if (!res.success) {
        toast(res.error || '保存失败', 'error');
        return;
      }
      state.channelsData = res;
      state.channelsLoaded = true;
      renderChannels();
      toast(res.message || '飞书配置已保存');
      await promptChannelRestartIfNeeded();
    }

    async function promptChannelRestartIfNeeded() {
      if (!state.status?.running) return;
      const confirmed = confirm('OpenClaw 当前正在运行。通知渠道配置通常需要重启服务后才能完整生效。现在就重启吗？');
      if (!confirmed) return;
      await stop();
      await start();
      await refreshChannels();
    }

`;
}
