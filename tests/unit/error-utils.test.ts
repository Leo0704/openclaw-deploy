import { describe, it, expect } from 'vitest';
import {
  ErrorType,
  ErrorSeverity,
  AppError,
  createError,
  fromNativeError,
  getUserFriendlyMessage,
  formatErrorLog,
  isRecoverable,
  shouldRetry,
  Errors,
} from '../../apps/cli/src/shared/errors/error-utils';

describe('ErrorType', () => {
  it('should have all expected error types', () => {
    expect(ErrorType.NETWORK).toBe('NETWORK');
    expect(ErrorType.FILE_SYSTEM).toBe('FILE_SYSTEM');
    expect(ErrorType.CONFIGURATION).toBe('CONFIGURATION');
    expect(ErrorType.VALIDATION).toBe('VALIDATION');
    expect(ErrorType.EXTERNAL_API).toBe('EXTERNAL_API');
    expect(ErrorType.SYSTEM).toBe('SYSTEM');
    expect(ErrorType.BROWSER).toBe('BROWSER');
    expect(ErrorType.PROCESS).toBe('PROCESS');
    expect(ErrorType.DEPLOYMENT).toBe('DEPLOYMENT');
    expect(ErrorType.PERMISSION).toBe('PERMISSION');
  });
});

describe('ErrorSeverity', () => {
  it('should have all expected severity levels', () => {
    expect(ErrorSeverity.LOW).toBe('LOW');
    expect(ErrorSeverity.MEDIUM).toBe('MEDIUM');
    expect(ErrorSeverity.HIGH).toBe('HIGH');
    expect(ErrorSeverity.CRITICAL).toBe('CRITICAL');
  });
});

describe('AppError', () => {
  it('should create an error with all properties', () => {
    const error = new AppError({
      type: ErrorType.NETWORK,
      code: 'ENOTFOUND',
      userMessage: 'Network error occurred',
      recoverable: true,
      suggestions: ['Check network'],
      severity: ErrorSeverity.HIGH,
      context: { url: 'https://example.com' },
    });

    expect(error.name).toBe('AppError');
    expect(error.type).toBe(ErrorType.NETWORK);
    expect(error.code).toBe('ENOTFOUND');
    expect(error.userMessage).toBe('Network error occurred');
    expect(error.recoverable).toBe(true);
    expect(error.suggestions).toEqual(['Check network']);
    expect(error.severity).toBe(ErrorSeverity.HIGH);
    expect(error.context).toEqual({ url: 'https://example.com' });
    expect(error.timestamp).toBeInstanceOf(Date);
  });

  it('should have default values for optional properties', () => {
    const error = new AppError({
      type: ErrorType.SYSTEM,
      userMessage: 'Test error',
    });

    expect(error.recoverable).toBe(true);
    expect(error.severity).toBe(ErrorSeverity.MEDIUM);
    expect(error.code).toBeUndefined();
    expect(error.suggestions).toBeUndefined();
  });

  it('should serialize to JSON correctly', () => {
    const error = new AppError({
      type: ErrorType.NETWORK,
      code: 'ECONNREFUSED',
      userMessage: 'Connection refused',
      severity: ErrorSeverity.HIGH,
    });

    const json = error.toJSON();

    expect(json.name).toBe('AppError');
    expect(json.type).toBe('NETWORK');
    expect(json.code).toBe('ECONNREFUSED');
    expect(json.message).toBe('Connection refused');
    expect(json.severity).toBe('HIGH');
    expect(json.timestamp).toBeDefined();
  });
});

describe('createError', () => {
  it('should create error with predefined message', () => {
    const error = createError(ErrorType.NETWORK, 'ENOTFOUND');

    expect(error.type).toBe(ErrorType.NETWORK);
    expect(error.code).toBe('ENOTFOUND');
    expect(error.userMessage).toBeTruthy();
    expect(error.suggestions).toBeDefined();
  });

  it('should override message when provided', () => {
    const customMessage = 'Custom error message';
    const error = createError(ErrorType.NETWORK, 'ENOTFOUND', {
      userMessage: customMessage,
    });

    expect(error.userMessage).toBe(customMessage);
  });

  it('should use default message for unknown error code', () => {
    const error = createError(ErrorType.SYSTEM, 'UNKNOWN_CODE');

    expect(error.userMessage).toContain('未知错误');
  });
});

describe('fromNativeError', () => {
  it('should convert native error to AppError', () => {
    const nativeError = new Error('Connection refused');
    (nativeError as NodeJS.ErrnoException).code = 'ECONNREFUSED';
    const appError = fromNativeError(nativeError, ErrorType.NETWORK);

    expect(appError.type).toBe(ErrorType.NETWORK);
    expect(appError.code).toBe('ECONNREFUSED');
    expect(appError.cause).toBe(nativeError);
    expect(appError.severity).toBe(ErrorSeverity.HIGH);
  });

  it('should infer error type from native error', () => {
    const nativeError = new Error('timeout');
    (nativeError as NodeJS.ErrnoException).code = 'ETIMEDOUT';

    const appError = fromNativeError(nativeError);

    expect(appError.type).toBe(ErrorType.NETWORK);
  });

  it('should handle errors without code', () => {
    const nativeError = new Error('Some error');

    const appError = fromNativeError(nativeError);

    expect(appError.code).toBe('UNKNOWN');
  });
});

describe('getUserFriendlyMessage', () => {
  it('should return user message from AppError', () => {
    const error = new AppError({
      type: ErrorType.NETWORK,
      code: 'ENOTFOUND',
      userMessage: 'Custom message',
      suggestions: ['Suggestion 1'],
    });

    const message = getUserFriendlyMessage(error);

    expect(message).toContain('Custom message');
    expect(message).toContain('Suggestion 1');
  });

  it('should return predefined message for known error code', () => {
    const error = new Error('test');
    (error as NodeJS.ErrnoException).code = 'ENOENT';

    const message = getUserFriendlyMessage(error);

    expect(message).toBeTruthy();
    expect(message).toContain('文件或目录不存在');
  });

  it('should return original message for unknown errors', () => {
    const error = new Error('Unknown error message');

    const message = getUserFriendlyMessage(error);

    expect(message).toBe('Unknown error message');
  });
});

describe('formatErrorLog', () => {
  it('should format AppError correctly', () => {
    const error = new AppError({
      type: ErrorType.NETWORK,
      code: 'ENOTFOUND',
      userMessage: 'Network error',
    });

    const log = formatErrorLog(error, 'test-context');

    expect(log).toContain('[NETWORK:ENOTFOUND]');
    expect(log).toContain('Network error');
    expect(log).toContain('test-context');
  });

  it('should format native error correctly', () => {
    const error = new Error('Connection refused');
    (error as NodeJS.ErrnoException).code = 'ECONNREFUSED';

    const log = formatErrorLog(error);

    expect(log).toContain('[ECONNREFUSED]');
    expect(log).toContain('Connection refused');
  });

  it('should handle missing context', () => {
    const error = new Error('Test');

    const log = formatErrorLog(error);

    expect(log).toContain('Test');
  });
});

describe('isRecoverable', () => {
  it('should return recoverable from AppError', () => {
    const error = new AppError({
      type: ErrorType.NETWORK,
      userMessage: 'Test',
      recoverable: false,
    });

    expect(isRecoverable(error)).toBe(false);
  });

  it('should return false for non-recoverable codes', () => {
    const error = new Error('Out of memory');
    (error as NodeJS.ErrnoException).code = 'ENOMEM';

    expect(isRecoverable(error)).toBe(false);
  });

  it('should return true for recoverable errors', () => {
    const error = new Error('Timeout');
    (error as NodeJS.ErrnoException).code = 'ETIMEDOUT';

    expect(isRecoverable(error)).toBe(true);
  });
});

describe('shouldRetry', () => {
  it('should return false when max attempts reached', () => {
    const error = new Error('timeout');
    (error as NodeJS.ErrnoException).code = 'ETIMEDOUT';

    expect(shouldRetry(error, 5, 5)).toBe(false);
  });

  it('should return true for network errors', () => {
    const error = new AppError({
      type: ErrorType.NETWORK,
      userMessage: 'Network error',
    });

    expect(shouldRetry(error, 0, 3)).toBe(true);
  });

  it('should return true for retryable error codes', () => {
    const error = new Error('timeout');
    (error as NodeJS.ErrnoException).code = 'ETIMEDOUT';

    expect(shouldRetry(error, 0, 3)).toBe(true);
  });

  it('should return false for non-retryable errors', () => {
    const error = new Error('permission denied');
    (error as NodeJS.ErrnoException).code = 'EACCES';

    expect(shouldRetry(error, 0, 3)).toBe(false);
  });
});

describe('Errors factory', () => {
  it('should create network error', () => {
    const error = Errors.network('Network failed', new Error('cause'));

    expect(error.type).toBe(ErrorType.NETWORK);
    expect(error.userMessage).toBe('Network failed');
    expect(error.cause).toBeDefined();
    expect(error.severity).toBe(ErrorSeverity.HIGH);
  });

  it('should create file system error', () => {
    const error = Errors.fileSystem('ENOENT', '/path/to/file');

    expect(error.type).toBe(ErrorType.FILE_SYSTEM);
    expect(error.context?.path).toBe('/path/to/file');
  });

  it('should create configuration error', () => {
    const error = Errors.configuration('Invalid config');

    expect(error.type).toBe(ErrorType.CONFIGURATION);
    expect(error.userMessage).toBe('Invalid config');
  });

  it('should create validation error', () => {
    const error = Errors.validation('Invalid email', 'email');

    expect(error.type).toBe(ErrorType.VALIDATION);
    expect(error.context?.field).toBe('email');
  });

  it('should create deployment error', () => {
    const error = Errors.deployment('Deploy failed');

    expect(error.type).toBe(ErrorType.DEPLOYMENT);
    expect(error.severity).toBe(ErrorSeverity.HIGH);
  });

  it('should create invalid API key error', () => {
    const error = Errors.invalidApiKey();

    expect(error.type).toBe(ErrorType.VALIDATION);
    expect(error.code).toBe('INVALID_API_KEY');
    expect(error.severity).toBe(ErrorSeverity.HIGH);
  });
});
