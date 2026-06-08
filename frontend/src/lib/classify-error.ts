/**
 * Frontend error classification for daemon and API errors.
 *
 * Maps raw errors from Tauri invoke or fetch into categorized types
 * that the UI can render with appropriate messaging and retry affordances.
 */

export type ErrorCategory =
  | 'daemon_unavailable'
  | 'daemon_health_timeout'
  | 'model_provider_error'
  | 'rate_limited'
  | 'permission_denied'
  | 'tool_failed'
  | 'validation_failed'
  | 'network_error'
  | 'unknown_error';

export interface ClassifiedError {
  category: ErrorCategory;
  message: string;
  retryable: boolean;
  retryAfter?: number;
  details?: unknown;
}

/**
 * Classify a raw error from Tauri invoke or fetch into a structured error.
 */
export function classifyFrontendError(err: unknown): ClassifiedError {
  const raw = extractRaw(err);

  // Daemon connection errors (from Tauri invoke failures)
  if (raw.includes('failed to connect') || raw.includes('connection refused')) {
    return {
      category: 'daemon_unavailable',
      message: '无法连接到本地运行时',
      retryable: true,
    };
  }

  if (raw.includes('timeout') || raw.includes('timed out')) {
    return {
      category: 'daemon_health_timeout',
      message: '运行时响应超时',
      retryable: true,
    };
  }

  // Rate limiting
  if (raw.includes('rate limit') || raw.includes('429')) {
    const retryAfter = parseRetryAfter(raw);
    return {
      category: 'rate_limited',
      message: '请求频率过高，请稍后重试',
      retryable: true,
      retryAfter,
    };
  }

  // Permission
  if (raw.includes('permission denied') || raw.includes('forbidden') || raw.includes('403')) {
    return {
      category: 'permission_denied',
      message: '权限不足，无法执行此操作',
      retryable: false,
    };
  }

  // Validation
  if (raw.includes('validation') || raw.includes('invalid') || raw.includes('400')) {
    return {
      category: 'validation_failed',
      message: '输入数据无效',
      retryable: false,
      details: err,
    };
  }

  // AI/model errors
  if (
    raw.includes('ai_error') ||
    raw.includes('model') ||
    raw.includes('api key') ||
    raw.includes('not configured')
  ) {
    return {
      category: 'model_provider_error',
      message: 'AI 模型服务错误',
      retryable: raw.includes('timeout') || raw.includes('network'),
    };
  }

  // Tool errors
  if (raw.includes('tool') || raw.includes('mcp')) {
    return {
      category: 'tool_failed',
      message: '工具执行失败',
      retryable: true,
    };
  }

  // Network
  if (raw.includes('network') || raw.includes('fetch failed') || raw.includes('econnrefused')) {
    return {
      category: 'network_error',
      message: '网络连接错误',
      retryable: true,
    };
  }

  return {
    category: 'unknown_error',
    message: extractMessage(err) || '发生未知错误',
    retryable: false,
  };
}

function extractRaw(err: unknown): string {
  if (err instanceof Error) return err.message.toLowerCase();
  if (typeof err === 'string') return err.toLowerCase();
  try {
    return JSON.stringify(err).toLowerCase();
  } catch {
    return '';
  }
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return '';
  }
}

function parseRetryAfter(msg: string): number | undefined {
  const match = msg.match(/retry[_\s]?after[:\s]*(\d+)/i);
  return match?.[1] ? parseInt(match[1], 10) : undefined;
}
