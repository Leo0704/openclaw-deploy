const { URL: NodeURL } = require('url') as typeof import('url');

const SOURCE_REPO_PATH = 'openclaw/openclaw';
const RELEASE_REPO_PATH = 'Leo0704/lobster-releases';

const GITHUB_MIRRORS = [
  { name: 'GitHub 直连', url: 'https://github.com', api: 'https://api.github.com' },
  { name: 'GitMirror', url: 'https://hub.gitmirror.com/https://github.com', api: 'https://hub.gitmirror.com/https://api.github.com' },
  { name: 'GHProxy', url: 'https://mirror.ghproxy.com/https://github.com', api: 'https://mirror.ghproxy.com/https://api.github.com' },
];

function getMirrorSourceArchive(mirrorIndex: number = 0, ref: string = 'main', format: 'tar.gz' | 'zip' = 'tar.gz'): string {
  const mirror = GITHUB_MIRRORS[mirrorIndex] || GITHUB_MIRRORS[0];
  return `${mirror.url}/${SOURCE_REPO_PATH}/archive/refs/heads/${ref}.${format}`;
}

function getMirrorRepo(mirrorIndex: number = 0): string {
  const mirror = GITHUB_MIRRORS[mirrorIndex] || GITHUB_MIRRORS[0];
  return `${mirror.url}/${SOURCE_REPO_PATH}.git`;
}

function getMirrorReleaseApi(mirrorIndex: number = 0): string {
  const mirror = GITHUB_MIRRORS[mirrorIndex] || GITHUB_MIRRORS[0];
  return `${mirror.api}/repos/${RELEASE_REPO_PATH}/releases/latest`;
}

function buildMirrorDownloadUrl(mirrorIndex: number, originalUrl: string): string {
  if (mirrorIndex === 0) {
    return originalUrl;
  }

  const mirror = GITHUB_MIRRORS[mirrorIndex] || GITHUB_MIRRORS[0];
  const parsed = new NodeURL(originalUrl);

  if (parsed.origin !== 'https://github.com') {
    return originalUrl;
  }

  return `${mirror.url}${parsed.pathname}${parsed.search}`;
}

export {
  GITHUB_MIRRORS,
  getMirrorRepo,
  getMirrorReleaseApi,
  getMirrorSourceArchive,
  buildMirrorDownloadUrl,
};
