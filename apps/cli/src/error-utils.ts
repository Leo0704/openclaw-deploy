/**
 * 错误处理基础设施
 * 提供统一的错误类型、错误类和用户友好的错误消息
 */

// ============================================
// 错误类型枚举
// ============================================

export enum ErrorType {
  NETWORK = 'NETWORK',           // 网络错误
  FILE_SYSTEM = 'FILE_SYSTEM',   // 文件系统错误
  CONFIGURATION = 'CONFIGURATION', // 配置错误
  VALIDATION = 'VALIDATION',     // 验证错误
  EXTERNAL_API = 'EXTERNAL_API', // 外部API错误
  SYSTEM = 'SYSTEM',             // 系统资源错误
  BROWSER = 'BROWSER',           // 浏览器错误
  PROCESS = 'PROCESS',           // 进程错误
  DEPLOYMENT = 'DEPLOYMENT',     // 部署错误
  PERMISSION = 'PERMISSION',     // 权限错误
}

// ============================================
// 错误严重级别
// ============================================

export enum ErrorSeverity {
  LOW = 'LOW',           // 低严重性，可忽略
  MEDIUM = 'MEDIUM',     // 中等严重性，需要警告
  HIGH = 'HIGH',         // 高严重性，需要处理
  CRITICAL = 'CRITICAL', // 严重错误，阻止操作
}

// ============================================
// 自定义错误类
// ============================================

export interface AppErrorOptions {
  type: ErrorType;
  code?: string;
  userMessage: string;
  recoverable?: boolean;
  suggestions?: string[];
  severity?: ErrorSeverity;
  cause?: Error;
  context?: Record<string, unknown>;
}

export class AppError extends Error {
  type: ErrorType;
  code?: string;
  userMessage: string;
  recoverable: boolean;
  suggestions?: string[];
  severity: ErrorSeverity;
  context?: Record<string, unknown>;
  timestamp: Date;

  constructor(options: AppErrorOptions) {
    super(options.userMessage);
    this.name = 'AppError';
    this.type = options.type;
    this.code = options.code;
    this.userMessage = options.userMessage;
    this.recoverable = options.recoverable ?? true;
    this.suggestions = options.suggestions;
    this.severity = options.severity ?? ErrorSeverity.MEDIUM;
    this.context = options.context;
    this.timestamp = new Date();

    if (options.cause) {
      this.cause = options.cause;
    }

    // 保持正确的堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      type: this.type,
      code: this.code,
      message: this.userMessage,
      recoverable: this.recoverable,
      suggestions: this.suggestions,
      severity: this.severity,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

// ============================================
// 错误消息映射（错误码 -> 用户友好消息）
// ============================================

export const ERROR_MESSAGES: Record<string, { message: string; suggestions: string[] }> = {
  // 网络错误
  'ENOTFOUND': {
    message: '无法连接到服务器，请检查网络连接',
    suggestions: ['检查您的网络连接是否正常', '确认域名是否正确', '尝试刷新DNS缓存'],
  },
  'ECONNREFUSED': {
    message: '服务被拒绝连接，请检查服务是否正常运行',
    suggestions: ['确认目标服务是否已启动', '检查端口是否正确', '查看防火墙设置'],
  },
  'ETIMEDOUT': {
    message: '连接超时，请检查网络后重试',
    suggestions: ['检查网络连接稳定性', '稍后重试', '检查是否需要代理'],
  },
  'ECONNRESET': {
    message: '连接被重置，请重试',
    suggestions: ['网络可能不稳定，请重试', '检查网络连接'],
  },
  'EPROTO': {
    message: 'SSL/TLS 协议错误',
    suggestions: ['检查系统时间是否正确', '更新系统证书', '尝试使用其他网络'],
  },
  'CERT_HAS_EXPIRED': {
    message: 'SSL 证书已过期',
    suggestions: ['检查系统时间是否正确', '更新系统证书'],
  },

  // 文件系统错误
  'EACCES': {
    message: '权限不足，请检查文件权限',
    suggestions: ['以管理员权限运行', '检查文件/目录权限', '确认文件未被其他程序占用'],
  },
  'ENOENT': {
    message: '文件或目录不存在',
    suggestions: ['确认路径是否正确', '检查文件是否已被删除或移动'],
  },
  'ENOSPC': {
    message: '磁盘空间不足，请清理后重试',
    suggestions: ['清理磁盘空间', '删除临时文件', '检查磁盘配额'],
  },
  'EEXIST': {
    message: '文件或目录已存在',
    suggestions: ['使用不同的名称', '先删除现有文件'],
  },
  'EPERM': {
    message: '操作不被允许',
    suggestions: ['以管理员权限运行', '检查文件属性', '关闭占用该文件的程序'],
  },
  'EROFS': {
    message: '文件系统是只读的',
    suggestions: ['检查磁盘是否损坏', '确认没有挂载为只读模式'],
  },

  // 系统错误
  'EADDRINUSE': {
    message: '端口已被占用，请更换其他端口',
    suggestions: ['更换端口号', '关闭占用端口的程序', '使用 lsof 或 netstat 查看端口占用'],
  },
  'EMFILE': {
    message: '打开的文件过多',
    suggestions: ['关闭其他应用程序', '增加系统文件描述符限制'],
  },
  'ENOMEM': {
    message: '内存不足',
    suggestions: ['关闭其他应用程序', '重启电脑', '增加虚拟内存'],
  },

  // 进程错误
  'SIGKILL': {
    message: '进程被强制终止',
    suggestions: ['检查系统资源使用情况', '查看是否有进程监控工具'],
  },
  'SIGTERM': {
    message: '进程被终止',
    suggestions: ['正常终止，无需处理'],
  },

  // Git 错误
  'GIT_NOT_FOUND': {
    message: '未找到 Git，请先安装 Git',
    suggestions: ['安装 Git: https://git-scm.com', '确认 Git 在 PATH 环境变量中'],
  },
  'GIT_AUTH_FAILED': {
    message: 'Git 认证失败',
    suggestions: ['检查 Git 凭据', '配置 SSH 密钥或个人访问令牌'],
  },
  'GIT_NETWORK_ERROR': {
    message: 'Git 网络操作失败',
    suggestions: ['检查网络连接', '配置 Git 代理', '使用镜像源'],
  },

  // NPM/pnpm 错误
  'NPM_NOT_FOUND': {
    message: '未找到 npm/pnpm，请先安装 Node.js',
    suggestions: ['安装 Node.js: https://nodejs.org', '确认 npm 在 PATH 环境变量中'],
  },
  'NPM_INSTALL_FAILED': {
    message: '依赖安装失败',
    suggestions: ['检查网络连接', '清除 npm 缓存', '删除 node_modules 后重试'],
  },

  // 自定义错误
  'INVALID_API_KEY': {
    message: 'API Key 无效',
    suggestions: ['检查 API Key 是否正确', '确认 API Key 是否已过期', '重新生成 API Key'],
  },
  'INVALID_CONFIG': {
    message: '配置无效',
    suggestions: ['检查配置文件格式', '重置为默认配置'],
  },
  'DEPLOYMENT_FAILED': {
    message: '部署失败',
    suggestions: ['查看详细错误日志', '检查网络和磁盘空间', '尝试重新部署'],
  },
  'BROWSER_OPEN_FAILED': {
    message: '无法自动打开浏览器',
    suggestions: ['手动打开显示的链接', '检查默认浏览器设置'],
  },
  'UPDATE_FAILED': {
    message: '更新失败',
    suggestions: ['检查网络连接', '稍后重试', '手动下载最新版本'],
  },
  'ACTIVATION_FAILED': {
    message: '激活失败',
    suggestions: ['检查激活码是否正确', '确认激活码未被使用', '联系客服'],
  },
};

// ============================================
// 工具函数
// ============================================

/**
 * 创建标准化错误
 */
export function createError(
  type: ErrorType,
  code: string,
  overrides: Partial<AppErrorOptions> = {}
): AppError {
  const errorInfo = ERROR_MESSAGES[code] || {
    message: overrides.userMessage || `未知错误: ${code}`,
    suggestions: [],
  };

  return new AppError({
    type,
    code,
    userMessage: overrides.userMessage || errorInfo.message,
    suggestions: overrides.suggestions || errorInfo.suggestions,
    ...overrides,
  });
}

/**
 * 从原生错误创建 AppError
 */
export function fromNativeError(error: Error, type?: ErrorType, context?: Record<string, unknown>): AppError {
  const errorCode = (error as NodeJS.ErrnoException).code || 'UNKNOWN';
  const errorInfo = ERROR_MESSAGES[errorCode];

  return new AppError({
    type: type || inferErrorType(error),
    code: errorCode,
    userMessage: errorInfo?.message || error.message,
    suggestions: errorInfo?.suggestions,
    cause: error,
    context,
    severity: ErrorSeverity.HIGH,
  });
}

/**
 * 从错误信息推断错误类型
 */
function inferErrorType(error: Error): ErrorType {
  const code = (error as NodeJS.ErrnoException).code;
  const message = error.message.toLowerCase();

  if (code) {
    if (['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EPROTO'].includes(code)) {
      return ErrorType.NETWORK;
    }
    if (['ENOENT', 'EACCES', 'ENOSPC', 'EEXIST', 'EPERM', 'EROFS'].includes(code)) {
      return ErrorType.FILE_SYSTEM;
    }
    if (['EADDRINUSE'].includes(code)) {
      return ErrorType.SYSTEM;
    }
  }

  if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
    return ErrorType.NETWORK;
  }
  if (message.includes('permission') || message.includes('access')) {
    return ErrorType.PERMISSION;
  }
  if (message.includes('config')) {
    return ErrorType.CONFIGURATION;
  }
  if (message.includes('spawn') || message.includes('process')) {
    return ErrorType.PROCESS;
  }

  return ErrorType.SYSTEM;
}

/**
 * 获取用户友好的错误信息
 */
export function getUserFriendlyMessage(error: Error | AppError): string {
  if (error instanceof AppError) {
    let message = error.userMessage;

    if (error.suggestions && error.suggestions.length > 0) {
      message += '\n\n建议:\n' + error.suggestions.map(s => `• ${s}`).join('\n');
    }

    return message;
  }

  const code = (error as NodeJS.ErrnoException).code;
  if (code && ERROR_MESSAGES[code]) {
    return ERROR_MESSAGES[code].message;
  }

  return error.message || '发生未知错误';
}

/**
 * 格式化错误日志
 */
export function formatErrorLog(error: Error | AppError, context?: string): string {
  const timestamp = new Date().toISOString();
  const prefix = context ? `[${context}]` : '';

  if (error instanceof AppError) {
    return `${timestamp} ${prefix}[${error.type}${error.code ? `:${error.code}` : ''}] ${error.userMessage}`;
  }

  const code = (error as NodeJS.ErrnoException).code;
  return `${timestamp} ${prefix}${code ? `[${code}] ` : ''}${error.message}`;
}

/**
 * 记录错误日志
 */
export function logError(error: Error | AppError, context?: string): void {
  const formattedLog = formatErrorLog(error, context);
  console.error(formattedLog);

  // 如果是严重错误，可以添加额外的处理
  if (error instanceof AppError && error.severity === ErrorSeverity.CRITICAL) {
    console.error('!!! 严重错误，程序可能无法继续运行 !!!');
  }
}

/**
 * 判断错误是否可恢复
 */
export function isRecoverable(error: Error | AppError): boolean {
  if (error instanceof AppError) {
    return error.recoverable;
  }

  const code = (error as NodeJS.ErrnoException).code;
  if (!code) return true;

  // 不可恢复的错误码
  const nonRecoverableCodes = ['ENOMEM', 'EMFILE'];
  return !nonRecoverableCodes.includes(code);
}

/**
 * 判断是否应该重试
 */
export function shouldRetry(error: Error | AppError, attempt: number, maxAttempts: number): boolean {
  if (attempt >= maxAttempts) return false;

  if (error instanceof AppError) {
    // 网络错误通常可以重试
    if (error.type === ErrorType.NETWORK) return true;
    // 系统资源临时不足可能可以重试
    if (error.type === ErrorType.SYSTEM && error.recoverable) return true;
  }

  const code = (error as NodeJS.ErrnoException).code;
  if (!code) return false;

  // 可重试的错误码
  const retryableCodes = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND'];
  return retryableCodes.includes(code);
}

// ============================================
// 常用错误工厂函数
// ============================================

export const Errors = {
  network: (message: string, cause?: Error) =>
    createError(ErrorType.NETWORK, 'NETWORK_ERROR', { userMessage: message, cause, severity: ErrorSeverity.HIGH }),

  fileSystem: (code: string, path?: string) =>
    createError(ErrorType.FILE_SYSTEM, code, { context: { path } }),

  configuration: (message: string) =>
    createError(ErrorType.CONFIGURATION, 'INVALID_CONFIG', { userMessage: message }),

  validation: (message: string, field?: string) =>
    createError(ErrorType.VALIDATION, 'VALIDATION_ERROR', { userMessage: message, context: { field } }),

  browser: (url?: string) =>
    createError(ErrorType.BROWSER, 'BROWSER_OPEN_FAILED', { context: { url }, recoverable: true }),

  deployment: (message: string, cause?: Error) =>
    createError(ErrorType.DEPLOYMENT, 'DEPLOYMENT_FAILED', { userMessage: message, cause, severity: ErrorSeverity.HIGH }),

  process: (message: string, cmd?: string) =>
    createError(ErrorType.PROCESS, 'PROCESS_ERROR', { userMessage: message, context: { cmd } }),

  permission: (message: string) =>
    createError(ErrorType.PERMISSION, 'PERMISSION_ERROR', { userMessage: message, severity: ErrorSeverity.HIGH }),

  invalidApiKey: () =>
    createError(ErrorType.VALIDATION, 'INVALID_API_KEY', { severity: ErrorSeverity.HIGH }),

  activationFailed: (reason?: string) =>
    createError(ErrorType.VALIDATION, 'ACTIVATION_FAILED', { userMessage: reason || '激活失败' }),

  updateFailed: (reason?: string) =>
    createError(ErrorType.SYSTEM, 'UPDATE_FAILED', { userMessage: reason || '更新失败', recoverable: true }),
};
