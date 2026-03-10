const { execSync } = require('child_process') as typeof import('child_process');
const os = require('os') as typeof import('os');
const { URL: NodeURL } = require('url') as typeof import('url');

function isValidUrl(url: string): boolean {
  try {
    const parsed = new NodeURL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function openBrowser(url: string): { success: boolean; error?: string; fallbackUrl?: string } {
  if (!isValidUrl(url)) {
    return { success: false, error: '无效的URL格式' };
  }

  const platform = os.platform();
  let commands: string[] = [];

  if (platform === 'darwin') {
    commands = ['open'];
  } else if (platform === 'win32') {
    commands = ['start', ''];
  } else {
    commands = ['xdg-open', 'google-chrome', 'firefox'];
  }

  for (const cmd of commands) {
    if (!cmd) continue;
    try {
      if (platform === 'win32') {
        execSync(`start "" "${url}"`, { timeout: 5000 });
      } else {
        execSync(`${cmd} "${url}"`, { timeout: 5000 });
      }
      return { success: true };
    } catch {
      continue;
    }
  }

  console.log('');
  console.log('\x1b[33m⚠️  无法自动打开浏览器，请手动访问:\x1b[0m');
  console.log(`\x1b[36m    ${url}\x1b[0m`);
  console.log('');

  return {
    success: false,
    error: '无法自动打开浏览器',
    fallbackUrl: url,
  };
}

export { openBrowser };
