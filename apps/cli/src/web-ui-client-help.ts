const os = require('os') as typeof import('os');
const path = require('path') as typeof import('path');
const { isOpenClawProjectDir } = require('./openclaw-project') as typeof import('./openclaw-project');
const { ANTHROPIC_API_FORMAT, buildEndpointIdFromUrl } = require('./provider-utils') as typeof import('./provider-utils');
const { OPENCLAW_MIN_NODE_VERSION } = require('./system-check') as typeof import('./system-check');

export function renderWebUiClientHelp(config: Record<string, unknown>, status: Record<string, unknown>, deps: {
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
  void os;
  void path;
  void isOpenClawProjectDir;
  void ANTHROPIC_API_FORMAT;
  void buildEndpointIdFromUrl;
  void OPENCLAW_MIN_NODE_VERSION;
  void config;
  void status;
  return `    // ============================================
    // 使用指南
    // ============================================

    async function loadHelp() {
      state.helpLoading = true;
      const el = $('tab-help');
      if (!el) return;

      el.innerHTML = \`
        <div class="support-card">
          <div>
            <div class="hero-kicker">Support</div>
            <div class="support-title">官方售后群</div>
            <div class="support-copy">
              如果你在部署、启动、模型接入或技能使用过程中遇到问题，可以直接扫码加入官方售后群。群里可以反馈问题、查看公告和获取后续支持。
            </div>
            <div class="support-group-number">QQ群：1081025282</div>
            <div class="form-helper">如果当前设备不方便扫码，也可以在 QQ 里手动搜索群号加入。</div>
          </div>
          <img src="/assets/official-support-qq.jpg" alt="龙虾助手官方售后群二维码">
        </div>

        <div class="help-section">
          <h3 style="font-size:16px;color:#1F2937;margin-bottom:16px">🧭 OpenClaw 使用总览</h3>
          <div class="help-item">
            <div class="help-title">OpenClaw 不是单纯聊天页</div>
            <div class="help-content">
              OpenClaw 更像一个本地 AI 工作台：它有网关、模型接入、技能扩展、浏览器控制和会话状态。你真正要掌握的不是“怎么打开页面”，而是“怎样让 AI 在一个稳定环境里持续完成任务”。
            </div>
          </div>
          <div class="help-item">
            <div class="help-title">建议的使用顺序</div>
            <div class="help-content">
              <ul>
                <li>先确认当前模型可正常回复，再开始长任务。</li>
                <li>再决定是否需要安装技能，不要一开始装太多。</li>
                <li>最后进入对话，让 AI 先理解目标、输出计划，再开始执行。</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="help-section">
          <h3 style="font-size:16px;color:#1F2937;margin-bottom:16px">💬 推荐对话方式</h3>
          <div class="help-item">
            <div class="help-title">1. 先给目标，再给限制</div>
            <div class="help-content">
              <ul>
                <li>"帮我整理一份这周的产品更新总结，给非技术同事看。"</li>
                <li>"不要泛泛而谈，按变化点、影响、风险三段输出。"</li>
                <li>"如果信息不够，先问我最多 3 个补充问题。"</li>
              </ul>
            </div>
          </div>
          <div class="help-item">
            <div class="help-title">2. 长任务先让它给计划</div>
            <div class="help-content">
              <ul>
                <li>"先列一个执行计划，不要立刻开始改。"</li>
                <li>"把任务拆成：信息收集、方案、执行、验证。"</li>
                <li>"每完成一段给我一个可检查的结果。"</li>
              </ul>
            </div>
          </div>
          <div class="help-item">
            <div class="help-title">3. 让 AI 用结构化格式回答</div>
            <div class="help-content">
              <ul>
                <li>"按问题、原因、建议三列输出。"</li>
                <li>"最后只给我可执行结论，不要铺垫。"</li>
                <li>"如果存在不确定性，请单独列出。"</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="help-section">
          <h3 style="font-size:16px;color:#1F2937;margin-bottom:16px">🧩 技能与能力边界</h3>
          <div class="help-item">
            <div class="help-title">什么时候该装技能</div>
            <div class="help-content">
              如果你只是普通问答、写作、总结、翻译，通常不需要额外技能。只有当你希望 OpenClaw 去搜索网页、读写特定资源、连接第三方服务时，技能才真正有价值。
            </div>
          </div>
          <div class="help-item">
            <div class="help-title">技能装完以后怎么用</div>
            <div class="help-content">
              技能不是菜单按钮。正确方式是在对话里直接说需求，例如：
              <ul>
                <li>"搜索最近三天关于 Anthropic 的发布更新。"</li>
                <li>"把这个网页总结成 5 条给老板看的要点。"</li>
                <li>"检查这个仓库里和认证相关的代码。"</li>
              </ul>
              模型会自行决定是否调用已安装技能。
            </div>
          </div>
          <div class="help-item">
            <div class="help-title">为什么技能装了却像没生效</div>
            <div class="help-content">
              常见原因有三个：
              <ul>
                <li>安装后没有重启 OpenClaw。</li>
                <li>当前模型本身工具调用能力偏弱。</li>
                <li>你的提问方式太像普通聊天，没有明确需要外部能力。</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="help-section">
          <h3 style="font-size:16px;color:#1F2937;margin-bottom:16px">🧠 模型选择与切换</h3>
          <div class="help-item">
            <div class="help-title">什么时候切模型</div>
            <div class="help-content">
              <ul>
                <li>需要稳定工具调用和长上下文时，优先选更稳的主力模型。</li>
                <li>需要便宜、快、批量处理时，再换轻量模型。</li>
                <li>遇到回答飘、工具不触发、长任务跑偏时，先换模型再怀疑技能。</li>
              </ul>
            </div>
          </div>
          <div class="help-item">
            <div class="help-title">自定义模型接入怎么理解</div>
            <div class="help-content">
              自定义接入不是“随便填个代理地址”。正确顺序是：
              <ul>
                <li>先填 Base URL 和 API Key。</li>
                <li>再选接口类型。</li>
                <li>再填 Model ID 并验证。</li>
                <li>验证通过后再保存连接名称和模型别名。</li>
              </ul>
              如果验证不过，不要继续往下配，否则后面所有问题都会混在一起。
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="help-section">
          <h3 style="font-size:16px;color:#1F2937;margin-bottom:16px">🔐 Gateway Token 与浏览器会话</h3>
          <div class="help-item">
            <div class="help-title">为什么有时会提示缺少访问令牌</div>
            <div class="help-content">
              OpenClaw 网页和本地网关之间需要访问令牌。如果你不是从“打开 OpenClaw”按钮进入，而是自己手动输入地址打开新标签页，就可能没有把令牌一起带上。
            </div>
          </div>
          <div class="help-item">
            <div class="help-title">推荐打开方式</div>
            <div class="help-content">
              优先使用“打开 OpenClaw”或“复制自动认证链接”。这样浏览器会自动带上 token，不需要你手动去设置里粘贴。
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="help-section">
          <h3 style="font-size:16px;color:#1F2937;margin-bottom:16px">🛠️ 进阶排查</h3>
          <div class="help-item">
            <div class="help-title">启动失败时先看什么</div>
            <div class="help-content">
              先看服务页日志，不要直接猜。
              <ul>
                <li>如果是 API Key / Base URL 问题，通常会在启动早期看到认证或连接错误。</li>
                <li>如果是端口问题，会看到端口被占用或进程立即退出。</li>
                <li>如果是技能或依赖问题，往往发生在网关起来之后的初始化阶段。</li>
              </ul>
            </div>
          </div>
          <div class="help-item">
            <div class="help-title">最常见的三种误判</div>
            <div class="help-content">
              <ul>
                <li>模型能聊天，不代表技能一定可用。</li>
                <li>服务启动了，不代表浏览器会话已经带上 token。</li>
                <li>更新成功，不代表你当前配置一定还适配新版本模型接口。</li>
              </ul>
            </div>
          </div>
          <div class="help-item">
            <div class="help-title">一套稳妥的恢复流程</div>
            <div class="help-content">
              如果你把当前环境折腾乱了，建议按这个顺序恢复：
              <ul>
                <li>先停止服务。</li>
                <li>重新验证 API 配置。</li>
                <li>只保留必要技能。</li>
                <li>再启动服务并观察日志前 30 秒。</li>
                <li>如果仍然异常，再考虑更新或彻底卸载重装。</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="help-section">
          <h3 style="font-size:16px;color:#1F2937;margin-bottom:16px">📌 常见高质量提问模板</h3>
          <div class="faq-item">
            <div class="faq-q">研究型任务</div>
            <div class="faq-a">"帮我研究这个主题，先列出信息来源和判断框架，再给结论。不要只给一段概述。"</div>
          </div>
          <div class="faq-item">
            <div class="faq-q">文档处理</div>
            <div class="faq-a">"先提炼结构，再按目标读者重写，最后列出你删掉了哪些冗余内容。"</div>
          </div>
          <div class="faq-item">
            <div class="faq-q">代码分析</div>
            <div class="faq-a">"先定位文件和调用链，再按 bug、风险、修复建议输出，不要先讲背景。"</div>
          </div>
          <div class="faq-item">
            <div class="faq-q">连续协作</div>
            <div class="faq-a">"每次只做一步，做完给我当前状态和下一步建议，不要一次性跑满。"</div>
          </div>
        </div>
      \`;

      state.helpLoaded = true;
      state.helpLoading = false;
    }

`;
}
