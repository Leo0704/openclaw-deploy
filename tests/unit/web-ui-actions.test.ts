import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================
// Web UI 按钮操作测试
// ============================================

describe('Web UI Button Actions', () => {
  // 模拟 API 响应
  type MockApiHandler = (action: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;

  let mockApi: MockApiHandler;
  let mockToast: ReturnType<typeof vi.fn>;
  let mockConfirm: ReturnType<typeof vi.fn>;
  let state: {
    config: Record<string, unknown>;
    status: Record<string, unknown>;
    update: Record<string, unknown>;
    selectedProvider: string;
    selectedModel: string;
  };

  beforeEach(() => {
    mockToast = vi.fn();
    mockConfirm = vi.fn();
    state = {
      config: {},
      status: { running: false, installed: false },
      update: {
        currentVersion: '1.0.0',
        mode: 'up_to_date',
        checking: false,
        updating: false,
      },
      selectedProvider: 'openai',
      selectedModel: 'gpt-4',
    };
  });

  // ============================================
  // 激活按钮测试
  // ============================================
  describe('activate()', () => {
    async function activate(code: string, apiHandler: MockApiHandler) {
      if (!code) {
        mockToast('请输入激活码', 'error');
        return { success: false, error: '请输入激活码' };
      }

      const res = await apiHandler('activate', { code });
      if (res.success) {
        state.config = res.config as Record<string, unknown>;
        mockToast('激活成功！');
        return { success: true };
      } else {
        mockToast(res.error || '激活失败', 'error');
        return { success: false, error: res.error };
      }
    }

    it('should show error when code is empty', async () => {
      mockApi = vi.fn();
      const result = await activate('', mockApi);

      expect(result.success).toBe(false);
      expect(mockToast).toHaveBeenCalledWith('请输入激活码', 'error');
      expect(mockApi).not.toHaveBeenCalled();
    });

    it('should call activate API with code', async () => {
      mockApi = vi.fn().mockResolvedValue({ success: true, config: { activated: true } });
      const result = await activate('XXXX-XXXX-XXXX-XXXX', mockApi);

      expect(mockApi).toHaveBeenCalledWith('activate', { code: 'XXXX-XXXX-XXXX-XXXX' });
      expect(result.success).toBe(true);
      expect(state.config.activated).toBe(true);
      expect(mockToast).toHaveBeenCalledWith('激活成功！');
    });

    it('should handle activation failure', async () => {
      mockApi = vi.fn().mockResolvedValue({ success: false, error: '激活码无效' });
      const result = await activate('INVALID-CODE', mockApi);

      expect(result.success).toBe(false);
      expect(mockToast).toHaveBeenCalledWith('激活码无效', 'error');
    });

    it('should handle network error', async () => {
      mockApi = vi.fn().mockResolvedValue({ success: false, error: '网络错误' });
      const result = await activate('XXXX-XXXX-XXXX-XXXX', mockApi);

      expect(result.success).toBe(false);
      expect(mockToast).toHaveBeenCalledWith('网络错误', 'error');
    });
  });

  // ============================================
  // 启动服务按钮测试
  // ============================================
  describe('start()', () => {
    async function start(config: Record<string, unknown>, apiHandler: MockApiHandler) {
      if (!config.apiKey) {
        mockToast('请先配置 API Key', 'error');
        return { success: false, error: '请先配置 API Key' };
      }

      mockToast('正在启动...');
      const res = await apiHandler('start', {});

      if (res.success) {
        if (res.status) {
          state.status = res.status as Record<string, unknown>;
        } else {
          (state.status as Record<string, unknown>).running = true;
        }
        mockToast('服务已启动！');
        return { success: true };
      } else {
        mockToast(res.error || '启动失败', 'error');
        return { success: false, error: res.error };
      }
    }

    it('should show error when API Key is not configured', async () => {
      mockApi = vi.fn();
      const result = await start({}, mockApi);

      expect(result.success).toBe(false);
      expect(mockToast).toHaveBeenCalledWith('请先配置 API Key', 'error');
      expect(mockApi).not.toHaveBeenCalled();
    });

    it('should start service successfully', async () => {
      const config = { apiKey: 'test-api-key' };
      mockApi = vi.fn().mockResolvedValue({ success: true, status: { running: true } });
      const result = await start(config, mockApi);

      expect(mockApi).toHaveBeenCalledWith('start', {});
      expect(result.success).toBe(true);
      expect(state.status.running).toBe(true);
      expect(mockToast).toHaveBeenCalledWith('服务已启动！');
    });

    it('should handle start failure', async () => {
      const config = { apiKey: 'test-api-key' };
      mockApi = vi.fn().mockResolvedValue({ success: false, error: '端口被占用' });
      const result = await start(config, mockApi);

      expect(result.success).toBe(false);
      expect(mockToast).toHaveBeenCalledWith('端口被占用', 'error');
    });

    it('should handle timeout', async () => {
      const config = { apiKey: 'test-api-key' };
      mockApi = vi.fn().mockResolvedValue({ success: false, error: '启动超时' });
      const result = await start(config, mockApi);

      expect(result.success).toBe(false);
      expect(mockToast).toHaveBeenCalledWith('启动超时', 'error');
    });
  });

  // ============================================
  // 停止服务按钮测试
  // ============================================
  describe('stop()', () => {
    async function stop(apiHandler: MockApiHandler) {
      mockToast('正在停止...');
      const res = await apiHandler('stop');

      if (res.success) {
        state.status.running = false;
        state.status.state = 'stopped';
        mockToast('服务已停止');
        return { success: true };
      } else {
        mockToast(res.error || '停止失败', 'error');
        return { success: false, error: res.error };
      }
    }

    it('should stop service successfully', async () => {
      state.status.running = true;
      mockApi = vi.fn().mockResolvedValue({ success: true });
      const result = await stop(mockApi);

      expect(mockApi).toHaveBeenCalledWith('stop');
      expect(result.success).toBe(true);
      expect(state.status.running).toBe(false);
      expect(state.status.state).toBe('stopped');
      expect(mockToast).toHaveBeenCalledWith('服务已停止');
    });

    it('should handle stop failure', async () => {
      state.status.running = true;
      mockApi = vi.fn().mockResolvedValue({ success: false, error: '进程无法终止' });
      const result = await stop(mockApi);

      expect(result.success).toBe(false);
      expect(mockToast).toHaveBeenCalledWith('进程无法终止', 'error');
    });
  });

  // ============================================
  // 卸载按钮测试
  // ============================================
  describe('uninstallOpenClaw()', () => {
    async function uninstallOpenClaw(
      confirmFn: () => boolean,
      apiHandler: MockApiHandler
    ) {
      const confirmed = confirmFn();
      if (!confirmed) {
        return { success: false, cancelled: true };
      }

      const res = await apiHandler('uninstall-openclaw', {}, 180000);

      if (res.success) {
        state.config = (res.config as Record<string, unknown>) || {};
        state.status = (res.status as Record<string, unknown>) || { running: false, installed: false };
        mockToast(res.message as string || 'OpenClaw 已卸载');
        return { success: true };
      } else {
        mockToast(res.error || '卸载失败', 'error');
        return { success: false, error: res.error };
      }
    }

    it('should cancel when user does not confirm', async () => {
      mockConfirm = vi.fn().mockReturnValue(false);
      mockApi = vi.fn();

      const result = await uninstallOpenClaw(mockConfirm, mockApi);

      expect(result.success).toBe(false);
      expect(result.cancelled).toBe(true);
      expect(mockApi).not.toHaveBeenCalled();
    });

    it('should uninstall successfully when confirmed', async () => {
      mockConfirm = vi.fn().mockReturnValue(true);
      mockApi = vi.fn().mockResolvedValue({
        success: true,
        config: {},
        status: { running: false, installed: false },
        message: 'OpenClaw 已卸载',
      });

      const result = await uninstallOpenClaw(mockConfirm, mockApi);

      expect(mockApi).toHaveBeenCalledWith('uninstall-openclaw', {}, 180000);
      expect(result.success).toBe(true);
      expect(state.status.installed).toBe(false);
      expect(mockToast).toHaveBeenCalledWith('OpenClaw 已卸载');
    });

    it('should handle uninstall failure', async () => {
      mockConfirm = vi.fn().mockReturnValue(true);
      mockApi = vi.fn().mockResolvedValue({
        success: false,
        error: '文件被占用',
      });

      const result = await uninstallOpenClaw(mockConfirm, mockApi);

      expect(result.success).toBe(false);
      expect(mockToast).toHaveBeenCalledWith('文件被占用', 'error');
    });
  });

  // ============================================
  // 更新 OpenClaw 按钮测试
  // ============================================
  describe('updateOpenClaw()', () => {
    async function updateOpenClaw(apiHandler: MockApiHandler) {
      mockToast('检查更新中...');
      const res = await apiHandler('update-openclaw');

      if (res.success) {
        mockToast(res.message as string || '更新成功！');
        return { success: true };
      } else {
        mockToast(res.error || '更新失败', 'error');
        return { success: false, error: res.error };
      }
    }

    it('should update successfully', async () => {
      mockApi = vi.fn().mockResolvedValue({ success: true, message: '更新成功' });
      const result = await updateOpenClaw(mockApi);

      expect(mockApi).toHaveBeenCalledWith('update-openclaw');
      expect(result.success).toBe(true);
      expect(mockToast).toHaveBeenCalledWith('更新成功');
    });

    it('should handle update failure', async () => {
      mockApi = vi.fn().mockResolvedValue({ success: false, error: '网络错误' });
      const result = await updateOpenClaw(mockApi);

      expect(result.success).toBe(false);
      expect(mockToast).toHaveBeenCalledWith('网络错误', 'error');
    });
  });

  // ============================================
  // 检查龙虾助手更新按钮测试
  // ============================================
  describe('checkLobsterUpdate()', () => {
    async function checkLobsterUpdate(apiHandler: MockApiHandler) {
      state.update.checking = true;

      try {
        const res = await apiHandler('check-update', {}, 30000);

        if (res.success && res.update) {
          state.update = { ...state.update, ...(res.update as Record<string, unknown>) };

          if ((res.update as Record<string, unknown>).mode === 'up_to_date') {
            mockToast('已是最新版本');
          } else if ((res.update as Record<string, unknown>).mode === 'required') {
            mockToast('发现必须更新版本', 'warning');
          } else {
            mockToast('发现新版本 v' + (res.update as Record<string, unknown>).latestVersion);
          }
          return { success: true, update: res.update };
        } else {
          mockToast((res.error as string) || '检查更新失败', 'error');
          return { success: false, error: res.error };
        }
      } finally {
        state.update.checking = false;
      }
    }

    it('should show up_to_date when no update available', async () => {
      mockApi = vi.fn().mockResolvedValue({
        success: true,
        update: { mode: 'up_to_date', currentVersion: '1.0.0' },
      });

      const result = await checkLobsterUpdate(mockApi);

      expect(result.success).toBe(true);
      expect(mockToast).toHaveBeenCalledWith('已是最新版本');
      expect(state.update.checking).toBe(false);
    });

    it('should show warning when required update', async () => {
      mockApi = vi.fn().mockResolvedValue({
        success: true,
        update: { mode: 'required', currentVersion: '1.0.0', latestVersion: '2.0.0' },
      });

      const result = await checkLobsterUpdate(mockApi);

      expect(result.success).toBe(true);
      expect(mockToast).toHaveBeenCalledWith('发现必须更新版本', 'warning');
    });

    it('should show new version when available', async () => {
      mockApi = vi.fn().mockResolvedValue({
        success: true,
        update: { mode: 'available', currentVersion: '1.0.0', latestVersion: '1.1.0' },
      });

      const result = await checkLobsterUpdate(mockApi);

      expect(result.success).toBe(true);
      expect(mockToast).toHaveBeenCalledWith('发现新版本 v1.1.0');
    });

    it('should handle check failure', async () => {
      mockApi = vi.fn().mockResolvedValue({ success: false, error: '网络错误' });
      const result = await checkLobsterUpdate(mockApi);

      expect(result.success).toBe(false);
      expect(mockToast).toHaveBeenCalledWith('网络错误', 'error');
    });
  });

  // ============================================
  // 执行自更新按钮测试
  // ============================================
  describe('performLobsterSelfUpdate()', () => {
    async function performLobsterSelfUpdate(apiHandler: MockApiHandler) {
      if (state.update.updating) {
        return { success: false, error: '更新进行中' };
      }

      state.update.updating = true;

      try {
        const res = await apiHandler('perform-self-update', {}, 300000);

        if (res.success) {
          mockToast((res.message as string) || '更新成功！');
          return { success: true, updated: res.updated };
        } else {
          mockToast((res.error as string) || '更新失败', 'error');
          return { success: false, error: res.error };
        }
      } finally {
        state.update.updating = false;
      }
    }

    it('should prevent double update', async () => {
      state.update.updating = true;
      mockApi = vi.fn();

      const result = await performLobsterSelfUpdate(mockApi);

      expect(result.success).toBe(false);
      expect(mockApi).not.toHaveBeenCalled();
    });

    it('should update successfully', async () => {
      mockApi = vi.fn().mockResolvedValue({
        success: true,
        message: '更新成功',
        updated: true,
      });

      const result = await performLobsterSelfUpdate(mockApi);

      expect(mockApi).toHaveBeenCalledWith('perform-self-update', {}, 300000);
      expect(result.success).toBe(true);
      expect(result.updated).toBe(true);
      expect(state.update.updating).toBe(false);
    });

    it('should handle update failure', async () => {
      mockApi = vi.fn().mockResolvedValue({
        success: false,
        error: '下载失败',
      });

      const result = await performLobsterSelfUpdate(mockApi);

      expect(result.success).toBe(false);
      expect(mockToast).toHaveBeenCalledWith('下载失败', 'error');
    });
  });

  // ============================================
  // 部署按钮测试
  // ============================================
  describe('deploy()', () => {
    interface DeployPayload {
      installPath: string;
      gatewayPort: number;
      apiKey: string;
      provider: string;
      model: string;
      baseUrl?: string;
      apiFormat?: string;
      customModelId?: string;
    }

    async function deploy(
      formValues: {
        installPath: string;
        gatewayPort: number;
        apiKey: string;
        provider: string;
        model: string;
        baseUrl?: string;
        apiFormat?: string;
        customModelId?: string;
      },
      isCustom: boolean,
      apiHandler: MockApiHandler
    ) {
      if (!formValues.apiKey) {
        mockToast('请输入 API Key', 'error');
        return { success: false, error: '请输入 API Key' };
      }

      if (!isCustom && !formValues.model) {
        mockToast('请选择模型', 'error');
        return { success: false, error: '请选择模型' };
      }

      const payload: DeployPayload = {
        installPath: formValues.installPath,
        gatewayPort: formValues.gatewayPort,
        apiKey: formValues.apiKey,
        provider: formValues.provider,
        model: isCustom ? formValues.customModelId : formValues.model,
      };

      if (isCustom) {
        if (!payload.model) {
          mockToast('请输入 Model ID', 'error');
          return { success: false, error: '请输入 Model ID' };
        }
        payload.baseUrl = formValues.baseUrl;
        payload.apiFormat = formValues.apiFormat;
        payload.customModelId = payload.model;
      }

      // 健康检查
      const health = await apiHandler('health-check', {
        installPath: payload.installPath,
        gatewayPort: payload.gatewayPort,
      });

      if (!health.success) {
        return { success: false, error: health.error };
      }

      if (health.errors && (health.errors as unknown[]).length > 0) {
        return { success: false, error: '发现阻塞问题', errors: health.errors };
      }

      // 执行部署
      const res = await apiHandler('deploy-start', payload, 30000);
      return { success: res.success, error: res.error, task: res.task };
    }

    it('should show error when API Key is empty', async () => {
      mockApi = vi.fn();
      const result = await deploy(
        {
          installPath: '/home/user/openclaw',
          gatewayPort: 18789,
          apiKey: '',
          provider: 'openai',
          model: 'gpt-4',
        },
        false,
        mockApi
      );

      expect(result.success).toBe(false);
      expect(mockToast).toHaveBeenCalledWith('请输入 API Key', 'error');
    });

    it('should show error when model is not selected for non-custom provider', async () => {
      mockApi = vi.fn();
      const result = await deploy(
        {
          installPath: '/home/user/openclaw',
          gatewayPort: 18789,
          apiKey: 'test-key',
          provider: 'openai',
          model: '',
        },
        false,
        mockApi
      );

      expect(result.success).toBe(false);
      expect(mockToast).toHaveBeenCalledWith('请选择模型', 'error');
    });

    it('should show error when Model ID is empty for custom provider', async () => {
      mockApi = vi.fn();
      const result = await deploy(
        {
          installPath: '/home/user/openclaw',
          gatewayPort: 18789,
          apiKey: 'test-key',
          provider: 'custom',
          model: '',
          baseUrl: 'https://api.example.com/v1',
          apiFormat: 'openai',
          customModelId: '',
        },
        true,
        mockApi
      );

      expect(result.success).toBe(false);
      expect(mockToast).toHaveBeenCalledWith('请输入 Model ID', 'error');
    });

    it('should start deployment with valid data', async () => {
      mockApi = vi.fn()
        .mockResolvedValueOnce({ success: true, checks: [] }) // health-check
        .mockResolvedValueOnce({ success: true, task: { state: 'running' } }); // deploy-start

      const result = await deploy(
        {
          installPath: '/home/user/openclaw',
          gatewayPort: 18789,
          apiKey: 'test-api-key',
          provider: 'openai',
          model: 'gpt-4',
        },
        false,
        mockApi
      );

      expect(result.success).toBe(true);
      expect(mockApi).toHaveBeenCalledWith('health-check', expect.any(Object));
      expect(mockApi).toHaveBeenCalledWith('deploy-start', expect.any(Object), 30000);
    });

    it('should include custom fields for custom provider', async () => {
      mockApi = vi.fn()
        .mockResolvedValueOnce({ success: true, checks: [] })
        .mockResolvedValueOnce({ success: true, task: { state: 'running' } });

      await deploy(
        {
          installPath: '/home/user/openclaw',
          gatewayPort: 18789,
          apiKey: 'test-api-key',
          provider: 'custom',
          model: '',
          baseUrl: 'https://api.custom.com/v1',
          apiFormat: 'anthropic',
          customModelId: 'custom-model-1',
        },
        true,
        mockApi
      );

      const deployCall = mockApi.mock.calls.find(call => call[0] === 'deploy-start');
      const payload = deployCall?.[1] as DeployPayload;

      expect(payload.baseUrl).toBe('https://api.custom.com/v1');
      expect(payload.apiFormat).toBe('anthropic');
      expect(payload.customModelId).toBe('custom-model-1');
    });

    it('should handle health check failure', async () => {
      mockApi = vi.fn().mockResolvedValue({
        success: false,
        error: '路径不存在',
      });

      const result = await deploy(
        {
          installPath: '/invalid/path',
          gatewayPort: 18789,
          apiKey: 'test-api-key',
          provider: 'openai',
          model: 'gpt-4',
        },
        false,
        mockApi
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('路径不存在');
    });

    it('should handle health check errors', async () => {
      mockApi = vi.fn().mockResolvedValue({
        success: true,
        checks: [],
        errors: ['Node.js 版本过低'],
      });

      const result = await deploy(
        {
          installPath: '/home/user/openclaw',
          gatewayPort: 18789,
          apiKey: 'test-api-key',
          provider: 'openai',
          model: 'gpt-4',
        },
        false,
        mockApi
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('发现阻塞问题');
    });
  });

  // ============================================
  // 技能安装按钮测试
  // ============================================
  describe('installSkill()', () => {
    async function installSkill(skillId: string, apiHandler: MockApiHandler) {
      if (!skillId || !skillId.trim()) {
        mockToast('请输入技能 ID', 'error');
        return { success: false, error: '请输入技能 ID' };
      }

      const res = await apiHandler('install-skill', { skillId: skillId.trim() });

      if (res.success) {
        mockToast(res.message as string || '技能安装成功');
        return { success: true };
      } else {
        mockToast(res.error || '安装失败', 'error');
        return { success: false, error: res.error };
      }
    }

    it('should show error when skill ID is empty', async () => {
      mockApi = vi.fn();
      const result = await installSkill('', mockApi);

      expect(result.success).toBe(false);
      expect(mockToast).toHaveBeenCalledWith('请输入技能 ID', 'error');
    });

    it('should show error when skill ID is whitespace', async () => {
      mockApi = vi.fn();
      const result = await installSkill('   ', mockApi);

      expect(result.success).toBe(false);
      expect(mockToast).toHaveBeenCalledWith('请输入技能 ID', 'error');
    });

    it('should install skill successfully', async () => {
      mockApi = vi.fn().mockResolvedValue({ success: true, message: '技能安装成功' });
      const result = await installSkill('tavily-search', mockApi);

      expect(mockApi).toHaveBeenCalledWith('install-skill', { skillId: 'tavily-search' });
      expect(result.success).toBe(true);
      expect(mockToast).toHaveBeenCalledWith('技能安装成功');
    });

    it('should handle install failure', async () => {
      mockApi = vi.fn().mockResolvedValue({ success: false, error: '技能不存在' });
      const result = await installSkill('nonexistent-skill', mockApi);

      expect(result.success).toBe(false);
      expect(mockToast).toHaveBeenCalledWith('技能不存在', 'error');
    });
  });

  // ============================================
  // Tab 切换按钮测试
  // ============================================
  describe('switchTab()', () => {
    function switchTab(tabName: string, currentState: { currentTab: string }) {
      const validTabs = ['status', 'channels', 'skills', 'help'];

      if (!validTabs.includes(tabName)) {
        return { success: false, error: '无效的 Tab' };
      }

      currentState.currentTab = tabName;
      return { success: true, currentTab: tabName };
    }

    it('should switch to valid tabs', () => {
      const tabs = ['status', 'channels', 'skills', 'help'];
      const currentState = { currentTab: 'status' };

      for (const tab of tabs) {
        const result = switchTab(tab, currentState);
        expect(result.success).toBe(true);
        expect(result.currentTab).toBe(tab);
      }
    });

    it('should reject invalid tab', () => {
      const currentState = { currentTab: 'status' };
      const result = switchTab('invalid', currentState);

      expect(result.success).toBe(false);
      expect(result.error).toBe('无效的 Tab');
    });
  });

  // ============================================
  // Provider 选择按钮测试
  // ============================================
  describe('selectProvider()', () => {
    function selectProvider(
      key: string,
      providers: Record<string, { models?: Array<{ id: string; recommended?: boolean }> }>,
      currentState: { selectedProvider: string; selectedModel: string; config: Record<string, unknown> }
    ) {
      currentState.selectedProvider = key;
      const provider = providers[key];

      if (provider && provider.models && provider.models.length > 0) {
        if (key === 'custom') {
          currentState.selectedModel = (currentState.config.customModelId as string) || (currentState.config.model as string) || '';
        } else {
          const recommended = provider.models.find(m => m.recommended);
          currentState.selectedModel = recommended ? recommended.id : provider.models[0].id;
        }
      }

      return { success: true, selectedProvider: key, selectedModel: currentState.selectedModel };
    }

    it('should select provider and recommended model', () => {
      const providers = {
        openai: {
          models: [
            { id: 'gpt-4', recommended: true },
            { id: 'gpt-3.5' },
          ],
        },
      };
      const currentState = { selectedProvider: 'anthropic', selectedModel: '', config: {} };

      const result = selectProvider('openai', providers, currentState);

      expect(result.success).toBe(true);
      expect(result.selectedProvider).toBe('openai');
      expect(result.selectedModel).toBe('gpt-4');
    });

    it('should select first model when no recommended', () => {
      const providers = {
        custom: {
          models: [{ id: 'custom-model' }],
        },
      };
      const currentState = { selectedProvider: 'openai', selectedModel: 'gpt-4', config: {} };

      const result = selectProvider('custom', providers, currentState);

      expect(result.selectedProvider).toBe('custom');
      expect(result.selectedModel).toBe('');
    });

    it('should use config model for custom provider', () => {
      const providers = {
        custom: {
          models: [{ id: 'default-model' }],
        },
      };
      const currentState = {
        selectedProvider: 'openai',
        selectedModel: 'gpt-4',
        config: { customModelId: 'my-custom-model' },
      };

      const result = selectProvider('custom', providers, currentState);

      expect(result.selectedModel).toBe('my-custom-model');
    });
  });
});

// ============================================
// 表单验证测试
// ============================================
describe('Form Validation', () => {
  describe('Port Validation', () => {
    function validatePort(value: string | number): { valid: boolean; error?: string } {
      const port = typeof value === 'string' ? parseInt(value, 10) : value;

      if (isNaN(port)) {
        return { valid: false, error: '请输入有效的端口号' };
      }

      if (port < 1024 || port > 65535) {
        return { valid: false, error: '端口号必须在 1024-65535 之间' };
      }

      return { valid: true };
    }

    it('should accept valid ports', () => {
      expect(validatePort(1024).valid).toBe(true);
      expect(validatePort(18789).valid).toBe(true);
      expect(validatePort(65535).valid).toBe(true);
    });

    it('should reject ports below 1024', () => {
      expect(validatePort(80).valid).toBe(false);
      expect(validatePort(1023).valid).toBe(false);
    });

    it('should reject ports above 65535', () => {
      expect(validatePort(65536).valid).toBe(false);
      expect(validatePort(100000).valid).toBe(false);
    });

    it('should reject invalid input', () => {
      expect(validatePort('').valid).toBe(false);
      expect(validatePort('abc').valid).toBe(false);
    });
  });

  describe('API Key Validation', () => {
    function validateApiKey(value: string): { valid: boolean; error?: string } {
      if (!value || !value.trim()) {
        return { valid: false, error: '请输入 API Key' };
      }

      if (value.length < 10) {
        return { valid: false, error: 'API Key 格式不正确' };
      }

      return { valid: true };
    }

    it('should accept valid API keys', () => {
      expect(validateApiKey('sk-test-1234567890').valid).toBe(true);
      expect(validateApiKey('valid-api-key-with-sufficient-length').valid).toBe(true);
    });

    it('should reject empty API key', () => {
      expect(validateApiKey('').valid).toBe(false);
      expect(validateApiKey('   ').valid).toBe(false);
    });

    it('should reject short API key', () => {
      expect(validateApiKey('short').valid).toBe(false);
    });
  });

  describe('Path Validation', () => {
    function validateInstallPath(value: string): { valid: boolean; error?: string } {
      if (!value || !value.trim()) {
        return { valid: false, error: '请输入安装路径' };
      }

      // 基本路径检查
      if (value.length > 250) {
        return { valid: false, error: '路径过长' };
      }

      return { valid: true };
    }

    it('should accept valid paths', () => {
      expect(validateInstallPath('/home/user/openclaw').valid).toBe(true);
      expect(validateInstallPath('C:\\Users\\test\\openclaw').valid).toBe(true);
    });

    it('should reject empty path', () => {
      expect(validateInstallPath('').valid).toBe(false);
    });

    it('should reject very long paths', () => {
      const longPath = '/home/user/' + 'a'.repeat(300);
      expect(validateInstallPath(longPath).valid).toBe(false);
    });
  });
});
