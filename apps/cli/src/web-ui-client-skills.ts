const os = require('os') as typeof import('os');
const path = require('path') as typeof import('path');
const { isOpenClawProjectDir } = require('./openclaw-project') as typeof import('./openclaw-project');
const { ANTHROPIC_API_FORMAT, buildEndpointIdFromUrl } = require('./provider-utils') as typeof import('./provider-utils');
const { OPENCLAW_MIN_NODE_VERSION } = require('./system-check') as typeof import('./system-check');

export function renderWebUiClientSkills(config: Record<string, unknown>, status: Record<string, unknown>, deps: {
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
    // 技能市场
    // ============================================

    let installedSkills = [];

    async function loadSkills() {
      state.skillsLoading = true;
      const el = $('installed-skills');
      if (el) {
        el.innerHTML = '<div style="text-align:center;padding:20px;color:#9CA3AF;">正在加载技能列表...</div>';
      }
      await refreshInstalledSkills();
      state.skillsLoaded = true;
      state.skillsLoading = false;
    }

    async function refreshInstalledSkills() {
      const installedRes = await api('skills/installed');
      if (installedRes.success) {
        installedSkills = Array.isArray(installedRes.skills) ? installedRes.skills : [];
        renderInstalledSkills();
      } else {
        state.skillsLoading = false;
        toast(installedRes.error || '无法读取已安装技能', 'error');
      }
    }

    function installSkillFromInput() {
      const input = $('skill-id-input');
      const skillId = (input?.value || '').trim();
      if (!skillId) {
        toast('请先输入 skill id', 'error');
        input?.focus();
        return;
      }
      installSkill(skillId);
    }

    function renderInstalledSkills() {
      const el = $('installed-skills');
      if (!el) return;

      if (installedSkills.length === 0) {
        el.innerHTML = '<div style="text-align:center;padding:20px;color:#9CA3AF;">暂无已安装的技能</div>';
        return;
      }

      el.innerHTML = installedSkills.map(skill => {
        const removable = skill.removable !== false;
        return \`
          <div class="installed-item">
            <div>
              <div class="installed-name">\${skill.name || skill.id}</div>
              <div style="font-size:12px;color:#6B7280;margin-top:4px">
                skill id: <span class="mono">\${skill.id}</span> · 来源：\${skill.source || '未知'}
              </div>
            </div>
            \${removable
              ? \`<button class="btn btn-secondary btn-small" onclick="uninstallSkill('\${skill.id}')">卸载</button>\`
              : '<span class="skill-installed">只读</span>'
            }
          </div>
        \`;
      }).join('');
    }

    async function installSkill(skillId) {
      const optionsRes = await api('skills/install-options', { skill: skillId });
      if (!optionsRes.success) {
        toast(optionsRes.error || '无法读取技能安装方式', 'error');
        return;
      }

      const options = Array.isArray(optionsRes.options) ? optionsRes.options : [];
      let installId = String(optionsRes.preferredInstallId || '').trim();

      if (options.length > 1) {
        const suggested = String(optionsRes.recommendedInstallId || installId || options[0]?.id || '').trim();
        const promptText = [
          '技能 "' + skillId + '" 有多种安装方式，请输入要使用的 install id：',
          '',
          ...options.map((option) => {
            const bits = [String(option.id || '').trim()];
            const label = String(option.label || '').trim();
            const kind = String(option.kind || '').trim();
            if (label && label !== bits[0]) bits.push('(' + label + ')');
            if (kind) bits.push('[' + kind + ']');
            return bits.join(' ');
          }),
        ].join('\\n');
        const selected = window.prompt(promptText, suggested);
        if (!selected) {
          return;
        }
        installId = selected.trim();
        if (!options.some((option) => String(option.id || '').trim() === installId)) {
          toast('安装方式无效，请重新输入列表里的 install id', 'error');
          return;
        }
      } else if (!installId && options.length === 1) {
        installId = String(options[0]?.id || '').trim();
      }

      if (!installId) {
        toast('当前技能没有可用的安装方式', 'error');
        return;
      }

      toast('正在安装技能...', 'info');
      const res = await api('skills/install', { skill: skillId, installId });
      if (res.success) {
        toast(res.message || '安装成功！');
        const input = $('skill-id-input');
        if (input) input.value = '';
        await refreshInstalledSkills();
      } else {
        toast(res.error || '安装失败', 'error');
      }
    }

    async function uninstallSkill(skillId) {
      if (!confirm('确定要卸载这个技能吗？')) return;
      toast('正在卸载...', 'info');
      const res = await api('skills/uninstall', { skill: skillId });
      if (res.success) {
        toast(res.message || '卸载成功！');
        await refreshInstalledSkills();
      } else {
        toast(res.error || '卸载失败', 'error');
      }
    }

`;
}
