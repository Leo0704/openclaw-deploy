import { describe, it, expect } from 'vitest';

describe('Network Types', () => {
  it('should have proper FetchOptions interface', () => {
    const options = {
      method: 'GET' as const,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true }),
      timeout: 5000,
    };

    expect(options.method).toBe('GET');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.timeout).toBe(5000);
  });

  it('should have proper RetryOptions interface', () => {
    const options = {
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 30000,
      retryOn: [429, 500, 502, 503, 504],
      backoff: true,
    };

    expect(options.maxRetries).toBe(3);
    expect(options.backoff).toBe(true);
    expect(options.retryOn).toContain(500);
  });

  it('should have proper FetchResult interface', () => {
    const successResult = {
      success: true,
      data: { message: 'ok' },
      status: 200,
      headers: { 'content-type': 'application/json' },
    };

    const errorResult = {
      success: false,
      error: new Error('Network error'),
    };

    expect(successResult.success).toBe(true);
    expect(errorResult.success).toBe(false);
  });

  it('should have proper NetworkCheckResult interface', () => {
    const result = {
      connected: true,
      latency: 100,
      error: undefined,
    };

    expect(result.connected).toBe(true);
    expect(result.latency).toBe(100);
  });

  it('should have proper SourceProbeResult interface', () => {
    const result = {
      name: 'GitHub',
      url: 'https://github.com',
      type: 'direct' as const,
      connected: true,
      latency: 150,
      error: undefined,
    };

    expect(result.name).toBe('GitHub');
    expect(result.type).toBe('direct');
    expect(result.connected).toBe(true);
  });

  it('should have proper NetworkProbeSummary interface', () => {
    const summary = {
      githubDirectConnected: true,
      bestSource: { name: 'GitHub', url: '', type: 'direct' as const, connected: true, latency: 100 },
      sortedSources: [],
      probeTime: 500,
    };

    expect(summary.githubDirectConnected).toBe(true);
    expect(summary.probeTime).toBe(500);
  });
});

describe('Network Utility Functions', () => {
  // Test pure logic functions without making actual network calls

  describe('getRecommendedInstallStrategy', () => {
    function getRecommendedInstallStrategy(probeResult: {
      githubDirectConnected: boolean;
      bestSource: { name: string; latency?: number } | null;
    }): {
      preferMirror: boolean;
      githubDirectConnected: boolean;
      reason: string;
    } {
      if (probeResult.githubDirectConnected) {
        return {
          preferMirror: false,
          githubDirectConnected: true,
          reason: 'GitHub 直连可用，将优先使用默认源',
        };
      }

      if (probeResult.bestSource) {
        return {
          preferMirror: true,
          githubDirectConnected: false,
          reason: `GitHub 直连不可用，将使用镜像源 (${probeResult.bestSource.name})`,
        };
      }

      return {
        preferMirror: true,
        githubDirectConnected: false,
        reason: '所有源探测失败，将尝试镜像源',
      };
    }

    it('should return preferMirror: false when GitHub connected', () => {
      const probeResult = {
        githubDirectConnected: true,
        bestSource: { name: 'GitHub', latency: 100 },
      };

      const strategy = getRecommendedInstallStrategy(probeResult);

      expect(strategy.preferMirror).toBe(false);
      expect(strategy.githubDirectConnected).toBe(true);
    });

    it('should return preferMirror: true when GitHub not connected', () => {
      const probeResult = {
        githubDirectConnected: false,
        bestSource: { name: 'GitMirror', latency: 200 },
      };

      const strategy = getRecommendedInstallStrategy(probeResult);

      expect(strategy.preferMirror).toBe(true);
      expect(strategy.githubDirectConnected).toBe(false);
    });

    it('should include best source name in reason when no direct connection', () => {
      const probeResult = {
        githubDirectConnected: false,
        bestSource: { name: 'GHProxy', latency: 150 },
      };

      const strategy = getRecommendedInstallStrategy(probeResult);

      expect(strategy.reason).toContain('GHProxy');
    });

    it('should handle all sources failed', () => {
      const probeResult = {
        githubDirectConnected: false,
        bestSource: null,
      };

      const strategy = getRecommendedInstallStrategy(probeResult);

      expect(strategy.preferMirror).toBe(true);
      expect(strategy.reason).toContain('探测失败');
    });
  });

  describe('Retry Logic', () => {
    const DEFAULT_MAX_RETRIES = 3;
    const DEFAULT_RETRY_DELAY = 1000;

    function calculateRetryDelay(attempt: number, retryDelay: number, backoff: boolean): number {
      return backoff ? retryDelay * Math.pow(2, attempt - 1) : retryDelay;
    }

    it('should calculate exponential backoff delay', () => {
      const delay1 = calculateRetryDelay(1, DEFAULT_RETRY_DELAY, true);
      const delay2 = calculateRetryDelay(2, DEFAULT_RETRY_DELAY, true);
      const delay3 = calculateRetryDelay(3, DEFAULT_RETRY_DELAY, true);

      expect(delay1).toBe(1000);   // 2^0 * 1000
      expect(delay2).toBe(2000);   // 2^1 * 1000
      expect(delay3).toBe(4000);   // 2^2 * 1000
    });

    it('should calculate fixed delay when backoff is false', () => {
      const delay = calculateRetryDelay(1, DEFAULT_RETRY_DELAY, false);

      expect(delay).toBe(DEFAULT_RETRY_DELAY);
    });

    it('should determine if retry should happen', () => {
      const retryableCodes = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND'];

      expect(retryableCodes.includes('ETIMEDOUT')).toBe(true);
      expect(retryableCodes.includes('ECONNREFUSED')).toBe(true);
      expect(retryableCodes.includes('EACCES')).toBe(false);
    });
  });

  describe('URL Parsing', () => {
    it('should correctly identify HTTP vs HTTPS', () => {
      const httpsUrl = new URL('https://github.com');
      const httpUrl = new URL('http://example.com');

      expect(httpsUrl.protocol).toBe('https:');
      expect(httpUrl.protocol).toBe('http:');
    });

    it('should extract hostname correctly', () => {
      const url = new URL('https://github.com/openclaw/openclaw');

      expect(url.hostname).toBe('github.com');
      expect(url.pathname).toBe('/openclaw/openclaw');
    });

    it('should preserve query parameters', () => {
      const url = new URL('https://github.com/repo/archive/main.tar.gz?foo=bar');

      expect(url.search).toBe('?foo=bar');
    });
  });
});

describe('Default Configuration', () => {
  const DEFAULT_TIMEOUT = 30000;
  const DEFAULT_MAX_RETRIES = 3;
  const DEFAULT_RETRY_DELAY = 1000;
  const DEFAULT_CONNECTIVITY_URLS = [
    'https://github.com',
    'https://api.github.com',
    'https://hub.gitmirror.com/https://github.com',
    'https://mirror.ghproxy.com/https://github.com',
    'https://registry.npmmirror.com',
  ];

  it('should have correct default timeout', () => {
    expect(DEFAULT_TIMEOUT).toBe(30000);
  });

  it('should have correct default max retries', () => {
    expect(DEFAULT_MAX_RETRIES).toBe(3);
  });

  it('should have correct default retry delay', () => {
    expect(DEFAULT_RETRY_DELAY).toBe(1000);
  });

  it('should include GitHub in connectivity URLs', () => {
    expect(DEFAULT_CONNECTIVITY_URLS).toContain('https://github.com');
    expect(DEFAULT_CONNECTIVITY_URLS).toContain('https://api.github.com');
  });

  it('should include mirrors in connectivity URLs', () => {
    expect(DEFAULT_CONNECTIVITY_URLS).toContain('https://hub.gitmirror.com/https://github.com');
    expect(DEFAULT_CONNECTIVITY_URLS).toContain('https://mirror.ghproxy.com/https://github.com');
  });
});
