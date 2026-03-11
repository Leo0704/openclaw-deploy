const { URL: NodeURL } = require('url') as typeof import('url');

const SOURCE_REPO_PATH = 'openclaw/openclaw';
const RELEASE_REPO_PATH = 'Leo0704/lobster-releases';

// 镜像源列表 - 基础列表
const BASE_GITHUB_MIRRORS = [
  { name: 'GitMirror', url: 'https://hub.gitmirror.com/https://github.com', api: 'https://hub.gitmirror.com/https://api.github.com' },
  { name: 'GHProxy', url: 'https://mirror.ghproxy.com/https://github.com', api: 'https://mirror.ghproxy.com/https://api.github.com' },
  { name: 'GitHub 直连', url: 'https://github.com', api: 'https://api.github.com' },
];

// 动态排序后的镜像源（启动时探测后设置）
let sortedGithubMirrors: typeof BASE_GITHUB_MIRRORS = [...BASE_GITHUB_MIRRORS];

/**
 * 设置排序后的镜像源（由启动时探测结果决定）
 */
export function setSortedMirrors(mirrors: typeof BASE_GITHUB_MIRRORS): void {
  sortedGithubMirrors = mirrors;
}

/**
 * 获取当前有效的镜像源列表（已按网络探测结果排序）
 */
export function getGithubMirrors(): typeof BASE_GITHUB_MIRRORS {
  return sortedGithubMirrors;
}

/**
 * 根据网络探测结果重新排序镜像源
 * - GitHub 直连可达且延迟 < 500ms 时，优先直连
 * - 否则按镜像源延迟排序
 */
export function sortMirrorsByProbe(probeResult: {
  sortedSources: Array<{ name: string; connected: boolean; latency?: number }>;
  githubDirectConnected: boolean;
}): typeof BASE_GITHUB_MIRRORS {
  const { sortedSources, githubDirectConnected } = probeResult;

  // 如果 GitHub 直连可达且延迟 < 500ms，优先直连
  const githubDirect = sortedSources.find(s => s.name === 'GitHub 直连');
  if (githubDirectConnected && githubDirect && (githubDirect.latency || Infinity) < 500) {
    // 优先直连，然后是其他可用的源
    const connected = sortedSources.filter(s => s.connected && s.name !== 'GitHub 直连');
    const result = [
      githubDirect,
      ...connected
    ];

    // 映射回镜像配置
    return result
      .map(s => BASE_GITHUB_MIRRORS.find(m => m.name === s!.name))
      .filter((m): m is typeof BASE_GITHUB_MIRRORS[0] => m != null);
  }

  // 否则按探测结果排序（延迟低的优先）
  const sortedNames = sortedSources
    .filter(s => s.connected)
    .map(s => s.name);

  const sorted = sortedNames
    .map(name => BASE_GITHUB_MIRRORS.find(m => m.name === name))
    .filter((m): m is typeof BASE_GITHUB_MIRRORS[0] => m != null);

  // 添加未探测到但存在的镜像
  for (const mirror of BASE_GITHUB_MIRRORS) {
    if (!sorted.find(m => m.name === mirror.name)) {
      sorted.push(mirror);
    }
  }

  return sorted;
}

/**
 * 获取 npm registry 的推荐配置
 * - 有 VPN/直连：使用官方 npm
 * - 无 VPN：使用 npmmirror
 */
export function getNpmRegistry(probeResult?: { githubDirectConnected: boolean }): {
  registry: string;
  label: string;
} {
  // 如果有直连或不确定，用官方源（VPN 用户）
  if (probeResult?.githubDirectConnected) {
    return {
      registry: 'https://registry.npmjs.org',
      label: 'npm 官方源',
    };
  }

  // 无直连用镜像
  return {
    registry: 'https://registry.npmmirror.com',
    label: 'npmmirror 镜像',
  };
}

function getMirrorByIndex(index: number): typeof BASE_GITHUB_MIRRORS[0] {
  return sortedGithubMirrors[index] || BASE_GITHUB_MIRRORS[0];
}

function getMirrorSourceArchive(mirrorIndex: number = 0, ref: string = 'main', format: 'tar.gz' | 'zip' = 'tar.gz'): string {
  const mirror = getMirrorByIndex(mirrorIndex);
  return `${mirror.url}/${SOURCE_REPO_PATH}/archive/refs/heads/${ref}.${format}`;
}

function getMirrorRepo(mirrorIndex: number = 0): string {
  const mirror = getMirrorByIndex(mirrorIndex);
  return `${mirror.url}/${SOURCE_REPO_PATH}.git`;
}

function getMirrorReleaseApi(mirrorIndex: number = 0): string {
  const mirror = getMirrorByIndex(mirrorIndex);
  return `${mirror.api}/repos/${RELEASE_REPO_PATH}/releases/latest`;
}

function buildMirrorDownloadUrl(mirrorIndex: number, originalUrl: string): string {
  const mirror = getMirrorByIndex(mirrorIndex);

  const parsed = new NodeURL(originalUrl);

  if (parsed.origin !== 'https://github.com') {
    return originalUrl;
  }

  return `${mirror.url}${parsed.pathname}${parsed.search}`;
}

export {
  BASE_GITHUB_MIRRORS as GITHUB_MIRRORS,
  getMirrorRepo,
  getMirrorReleaseApi,
  getMirrorSourceArchive,
  buildMirrorDownloadUrl,
};
