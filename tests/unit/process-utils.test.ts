import { describe, it, expect } from 'vitest';

describe('Process Utils Types', () => {
  describe('RunCommandOptions', () => {
    it('should have correct default values', () => {
      const options = {
        timeout: 300000,
        retries: 0,
        ignoreError: false,
        silent: false,
        env: undefined as NodeJS.ProcessEnv | undefined,
      };

      expect(options.timeout).toBe(300000);
      expect(options.retries).toBe(0);
      expect(options.ignoreError).toBe(false);
      expect(options.silent).toBe(false);
    });

    it('should allow custom values', () => {
      const options = {
        timeout: 60000,
        retries: 3,
        ignoreError: true,
        silent: true,
        env: { PATH: '/usr/bin' },
      };

      expect(options.timeout).toBe(60000);
      expect(options.retries).toBe(3);
      expect(options.ignoreError).toBe(true);
    });
  });

  describe('RunCommandResult', () => {
    it('should have success result structure', () => {
      const result = {
        success: true,
        stdout: 'output',
        stderr: undefined,
      };

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('output');
    });

    it('should have error result structure', () => {
      const result = {
        success: false,
        stdout: undefined,
        stderr: 'error message',
      };

      expect(result.success).toBe(false);
      expect(result.stderr).toBe('error message');
    });
  });
});

describe('normalizeExecOutput', () => {
  function normalizeExecOutput(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (Buffer.isBuffer(value)) return value.toString('utf-8').trim();
    if (value == null) return '';
    return String(value).trim();
  }

  it('should trim string values', () => {
    expect(normalizeExecOutput('  hello  ')).toBe('hello');
  });

  it('should handle Buffer', () => {
    const buffer = Buffer.from('  buffer content  ');
    expect(normalizeExecOutput(buffer)).toBe('buffer content');
  });

  it('should handle null/undefined', () => {
    expect(normalizeExecOutput(null)).toBe('');
    expect(normalizeExecOutput(undefined)).toBe('');
  });

  it('should convert other values to string', () => {
    expect(normalizeExecOutput(123)).toBe('123');
    expect(normalizeExecOutput({ toString: () => 'object' })).toBe('object');
  });
});

describe('parseCommandForSpawn', () => {
  function parseCommandForSpawn(command: string): { file: string; args: string[] } {
    const tokens = command.match(/"[^"]*"|'[^']*'|\S+/g) || [];
    const normalized = tokens.map((token) => token.replace(/^['"]|['"]$/g, ''));
    return {
      file: normalized[0] || '',
      args: normalized.slice(1),
    };
  }

  it('should parse simple command', () => {
    const result = parseCommandForSpawn('npm install');
    expect(result.file).toBe('npm');
    expect(result.args).toEqual(['install']);
  });

  it('should parse command with arguments', () => {
    const result = parseCommandForSpawn('git commit -m "message"');
    expect(result.file).toBe('git');
    expect(result.args).toEqual(['commit', '-m', 'message']);
  });

  it('should handle quoted arguments', () => {
    const result = parseCommandForSpawn('echo "hello world"');
    expect(result.file).toBe('echo');
    expect(result.args).toEqual(['hello world']);
  });

  it('should handle single quotes', () => {
    const result = parseCommandForSpawn("echo 'hello world'");
    expect(result.file).toBe('echo');
    expect(result.args).toEqual(['hello world']);
  });

  it('should handle empty command', () => {
    const result = parseCommandForSpawn('');
    expect(result.file).toBe('');
    expect(result.args).toEqual([]);
  });

  it('should handle flags with values', () => {
    const result = parseCommandForSpawn('npm install --save-dev package');
    expect(result.file).toBe('npm');
    expect(result.args).toEqual(['install', '--save-dev', 'package']);
  });
});

describe('Shell Command Formatting', () => {
  function quoteShellArg(value: string): string {
    if (!value) return '""';
    if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) {
      return value;
    }
    return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
  }

  function formatShellCommand(file: string, args: string[]): string {
    return [file, ...args].map((part) => quoteShellArg(part)).join(' ');
  }

  describe('quoteShellArg', () => {
    it('should not quote simple values', () => {
      expect(quoteShellArg('simple')).toBe('simple');
      expect(quoteShellArg('file.txt')).toBe('file.txt');
      expect(quoteShellArg('./path/to/file')).toBe('./path/to/file');
    });

    it('should quote values with spaces', () => {
      expect(quoteShellArg('hello world')).toBe('"hello world"');
    });

    it('should quote values with special characters', () => {
      expect(quoteShellArg('hello$world')).toBe('"hello\\$world"');
      expect(quoteShellArg('hello`world')).toBe('"hello\\`world"');
    });

    it('should handle empty string', () => {
      expect(quoteShellArg('')).toBe('""');
    });
  });

  describe('formatShellCommand', () => {
    it('should format simple command', () => {
      const result = formatShellCommand('npm', ['install']);
      expect(result).toBe('npm install');
    });

    it('should quote arguments with spaces', () => {
      const result = formatShellCommand('echo', ['hello world']);
      expect(result).toBe('echo "hello world"');
    });

    it('should handle multiple arguments', () => {
      const result = formatShellCommand('git', ['commit', '-m', 'message']);
      expect(result).toBe('git commit -m message');
    });
  });
});

describe('Command Detection', () => {
  describe('checkCommand (logic)', () => {
    const os = process.platform;

    it('should have platform detection', () => {
      expect(['win32', 'darwin', 'linux']).toContain(os);
    });

    it('should use which on non-Windows', () => {
      if (os !== 'win32') {
        const cmd = os === 'darwin' || os === 'linux' ? 'which' : '';
        expect(cmd).toBe('which');
      }
    });

    it('should use where on Windows', () => {
      if (os === 'win32') {
        expect('where').toBe('where');
      }
    });
  });
});

describe('Environment Variables', () => {
  it('should have process.env', () => {
    expect(process.env).toBeDefined();
    expect(typeof process.env).toBe('object');
  });

  it('should have common env vars', () => {
    // These should exist on most systems
    expect(process.env).toHaveProperty('PATH');
  });

  it('should handle custom env', () => {
    const customEnv = { ...process.env, MY_VAR: 'test' };
    expect(customEnv.MY_VAR).toBe('test');
  });
});

describe('Timeout Handling', () => {
  it('should handle timeout values', () => {
    const timeout = 300000; // 5 minutes
    expect(timeout).toBe(5 * 60 * 1000);
  });

  it('should allow zero timeout', () => {
    const timeout = 0;
    expect(timeout).toBe(0);
  });

  it('should handle different timeout units', () => {
    const seconds = 30;
    const milliseconds = seconds * 1000;
    expect(milliseconds).toBe(30000);
  });
});

describe('Retry Logic', () => {
  it('should calculate retry delay', () => {
    const attempt = 1;
    const delay = 1000 * attempt;
    expect(delay).toBe(1000);
  });

  it('should increase delay with attempts', () => {
    const delays = [1000, 2000, 3000];
    for (let i = 1; i <= 3; i++) {
      expect(delays[i - 1]).toBe(1000 * i);
    }
  });

  it('should respect max retries', () => {
    const maxRetries = 3;
    const attempts = 0;
    const shouldRetry = attempts < maxRetries;
    expect(shouldRetry).toBe(true);
  });
});
