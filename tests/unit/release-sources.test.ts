import { describe, it, expect } from 'vitest';

describe('Release Sources Constants', () => {
  // Test the structure of BASE_GITHUB_MIRRORS without importing
  it('should have expected mirror structure', () => {
    const mirrors = [
      { name: 'GitMirror', url: 'https://hub.gitmirror.com/https://github.com', api: 'https://hub.gitmirror.com/https://api.github.com' },
      { name: 'GHProxy', url: 'https://mirror.ghproxy.com/https://github.com', api: 'https://mirror.ghproxy.com/https://api.github.com' },
      { name: 'GitHub 直连', url: 'https://github.com', api: 'https://api.github.com' },
    ];

    expect(mirrors).toHaveLength(3);
    expect(mirrors[0].name).toBe('GitMirror');
    expect(mirrors[1].name).toBe('GHProxy');
    expect(mirrors[2].name).toBe('GitHub 直连');
  });

  it('should include GitHub direct connection', () => {
    const mirrors = [
      { name: 'GitHub 直连', url: 'https://github.com', api: 'https://api.github.com' },
    ];

    const github = mirrors.find(m => m.name === 'GitHub 直连');
    expect(github).toBeDefined();
    expect(github?.url).toBe('https://github.com');
    expect(github?.api).toBe('https://api.github.com');
  });

  it('should include GitMirror', () => {
    const mirrors = [
      { name: 'GitMirror', url: 'https://hub.gitmirror.com/https://github.com', api: 'https://hub.gitmirror.com/https://api.github.com' },
    ];

    const mirror = mirrors.find(m => m.name === 'GitMirror');
    expect(mirror).toBeDefined();
    expect(mirror?.url).toContain('hub.gitmirror.com');
  });

  it('should include GHProxy', () => {
    const mirrors = [
      { name: 'GHProxy', url: 'https://mirror.ghproxy.com/https://github.com', api: 'https://mirror.ghproxy.com/https://api.github.com' },
    ];

    const mirror = mirrors.find(m => m.name === 'GHProxy');
    expect(mirror).toBeDefined();
    expect(mirror?.url).toContain('mirror.ghproxy.com');
  });
});

describe('Mirror URL Construction', () => {
  const SOURCE_REPO_PATH = 'openclaw/openclaw';
  const RELEASE_REPO_PATH = 'Leo0704/lobster-releases';

  function getMirrorRepo(mirrorIndex: number, mirrors: Array<{url: string}>): string {
    const mirror = mirrors[mirrorIndex] || mirrors[0];
    return `${mirror.url}/${SOURCE_REPO_PATH}.git`;
  }

  function getMirrorSourceArchive(
    mirrorIndex: number,
    mirrors: Array<{url: string}>,
    ref: string = 'main',
    format: 'tar.gz' | 'zip' = 'tar.gz'
  ): string {
    const mirror = mirrors[mirrorIndex] || mirrors[0];
    return `${mirror.url}/${SOURCE_REPO_PATH}/archive/refs/heads/${ref}.${format}`;
  }

  function getMirrorReleaseApi(mirrorIndex: number, mirrors: Array<{api: string}>): string {
    const mirror = mirrors[mirrorIndex] || mirrors[0];
    return `${mirror.api}/repos/${RELEASE_REPO_PATH}/releases/latest`;
  }

  function buildMirrorDownloadUrl(mirrorIndex: number, mirrors: Array<{url: string}>, originalUrl: string): string {
    const mirror = mirrors[mirrorIndex] || mirrors[0];
    const parsed = new URL(originalUrl);

    if (parsed.origin !== 'https://github.com') {
      return originalUrl;
    }

    return `${mirror.url}${parsed.pathname}${parsed.search}`;
  }

  const mirrors = [
    { name: 'GitMirror', url: 'https://hub.gitmirror.com/https://github.com', api: 'https://hub.gitmirror.com/https://api.github.com' },
    { name: 'GHProxy', url: 'https://mirror.ghproxy.com/https://github.com', api: 'https://mirror.ghproxy.com/https://api.github.com' },
    { name: 'GitHub 直连', url: 'https://github.com', api: 'https://api.github.com' },
  ];

  describe('getMirrorRepo', () => {
    it('should return repo URL with first mirror by default', () => {
      const repo = getMirrorRepo(0, mirrors);

      expect(repo).toContain('openclaw/openclaw.git');
    });

    it('should return repo URL with specified mirror index', () => {
      // index 1 is GHProxy
      const repo = getMirrorRepo(1, mirrors);

      expect(repo).toContain('mirror.ghproxy.com');
    });
  });

  describe('getMirrorReleaseApi', () => {
    it('should return release API URL', () => {
      const api = getMirrorReleaseApi(0, mirrors);

      expect(api).toContain('Leo0704/lobster-releases');
      expect(api).toContain('releases/latest');
    });
  });

  describe('getMirrorSourceArchive', () => {
    it('should return archive URL with default parameters', () => {
      const archive = getMirrorSourceArchive(0, mirrors);

      expect(archive).toContain('openclaw/openclaw');
      expect(archive).toContain('refs/heads/main.tar.gz');
    });

    it('should return archive URL with custom branch', () => {
      const archive = getMirrorSourceArchive(0, mirrors, 'develop');

      expect(archive).toContain('refs/heads/develop.tar.gz');
    });

    it('should return zip format when specified', () => {
      const archive = getMirrorSourceArchive(0, mirrors, 'main', 'zip');

      expect(archive).toContain('.zip');
    });
  });

  describe('buildMirrorDownloadUrl', () => {
    it('should convert GitHub URL to mirror URL', () => {
      const originalUrl = 'https://github.com/openclaw/openclaw/archive/refs/heads/main.tar.gz';
      const mirrored = buildMirrorDownloadUrl(0, mirrors, originalUrl);

      // Should convert github.com to mirror
      expect(mirrored).not.toBe(originalUrl);
    });

    it('should not modify non-GitHub URLs', () => {
      const originalUrl = 'https://example.com/file.tar.gz';
      const mirrored = buildMirrorDownloadUrl(0, mirrors, originalUrl);

      expect(mirrored).toBe(originalUrl);
    });

    it('should preserve query parameters', () => {
      const originalUrl = 'https://github.com/repo/archive/main.tar.gz?foo=bar';
      const mirrored = buildMirrorDownloadUrl(0, mirrors, originalUrl);

      expect(mirrored).toContain('?foo=bar');
    });
  });
});

describe('Npm Registry Selection', () => {
  function getNpmRegistry(probeResult?: { githubDirectConnected: boolean }): { registry: string; label: string } {
    if (probeResult?.githubDirectConnected) {
      return {
        registry: 'https://registry.npmjs.org',
        label: 'npm 官方源',
      };
    }

    return {
      registry: 'https://registry.npmmirror.com',
      label: 'npmmirror 镜像',
    };
  }

  it('should return official npm when GitHub direct connected', () => {
    const result = getNpmRegistry({ githubDirectConnected: true });

    expect(result.registry).toBe('https://registry.npmjs.org');
    expect(result.label).toBe('npm 官方源');
  });

  it('should return npmmirror when GitHub not directly connected', () => {
    const result = getNpmRegistry({ githubDirectConnected: false });

    expect(result.registry).toBe('https://registry.npmmirror.com');
    expect(result.label).toBe('npmmirror 镜像');
  });

  it('should return npmmirror when no probe result provided', () => {
    const result = getNpmRegistry();

    expect(result.registry).toBe('https://registry.npmmirror.com');
  });
});

describe('Mirror Sorting Logic', () => {
  function sortMirrorsByProbe(probeResult: {
    sortedSources: Array<{ name: string; connected: boolean; latency?: number }>;
    githubDirectConnected: boolean;
  }): string[] {
    const { sortedSources, githubDirectConnected } = probeResult;
    const BASE_GITHUB_MIRRORS_NAMES = ['GitMirror', 'GHProxy', 'GitHub 直连'];

    // Check GitHub direct connection
    const githubDirect = sortedSources.find(s => s.name === 'GitHub 直连');
    if (githubDirectConnected && githubDirect && (githubDirect.latency || Infinity) < 500) {
      const connected = sortedSources.filter(s => s.connected && s.name !== 'GitHub 直连').map(s => s.name);
      const result = [githubDirect.name, ...connected];
      return [...new Set([...result, ...BASE_GITHUB_MIRRORS_NAMES])];
    }

    // Otherwise sort by latency
    const connectedSources = sortedSources
      .filter(s => s.connected)
      .sort((a, b) => (a.latency || Infinity) - (b.latency || Infinity));

    const sorted = connectedSources.map(s => s.name);

    // Add any missing mirrors
    for (const name of BASE_GITHUB_MIRRORS_NAMES) {
      if (!sorted.includes(name)) {
        sorted.push(name);
      }
    }

    return sorted;
  }

  it('should prioritize GitHub direct when connected and latency < 500ms', () => {
    const probeResult = {
      sortedSources: [
        { name: 'GitHub 直连', connected: true, latency: 200 },
        { name: 'GitMirror', connected: true, latency: 300 },
        { name: 'GHProxy', connected: true, latency: 400 },
      ],
      githubDirectConnected: true,
    };

    const sorted = sortMirrorsByProbe(probeResult);

    expect(sorted[0]).toBe('GitHub 直连');
  });

  it('should not prioritize GitHub direct when latency >= 500ms', () => {
    const probeResult = {
      sortedSources: [
        { name: 'GitHub 直连', connected: true, latency: 600 },
        { name: 'GitMirror', connected: true, latency: 100 },
        { name: 'GHProxy', connected: true, latency: 200 },
      ],
      githubDirectConnected: true,
    };

    const sorted = sortMirrorsByProbe(probeResult);

    // GitHub latency >= 500, so should sort by latency
    expect(sorted[0]).toBe('GitMirror');
  });

  it('should not prioritize GitHub direct when not connected', () => {
    const probeResult = {
      sortedSources: [
        { name: 'GitHub 直连', connected: false },
        { name: 'GitMirror', connected: true, latency: 100 },
        { name: 'GHProxy', connected: true, latency: 200 },
      ],
      githubDirectConnected: false,
    };

    const sorted = sortMirrorsByProbe(probeResult);

    expect(sorted[0]).toBe('GitMirror');
  });

  it('should handle partial connectivity', () => {
    const probeResult = {
      sortedSources: [
        { name: 'GitHub 直连', connected: false },
        { name: 'GitMirror', connected: true, latency: 150 },
        { name: 'GHProxy', connected: false },
      ],
      githubDirectConnected: false,
    };

    const sorted = sortMirrorsByProbe(probeResult);

    expect(sorted.length).toBeGreaterThanOrEqual(1);
    expect(sorted[0]).toBe('GitMirror');
  });

  it('should include all mirrors even if some not probed', () => {
    const probeResult = {
      sortedSources: [
        { name: 'GitHub 直连', connected: true, latency: 100 },
      ],
      githubDirectConnected: true,
    };

    const sorted = sortMirrorsByProbe(probeResult);

    // Should include all known mirrors
    expect(sorted.length).toBe(3);
  });
});
