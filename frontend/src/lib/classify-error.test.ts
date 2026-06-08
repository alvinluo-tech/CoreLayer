import { describe, it, expect } from 'vitest';
import { classifyFrontendError } from './classify-error';

describe('classifyFrontendError', () => {
  it('classifies daemon unavailable error', () => {
    const result = classifyFrontendError(new Error('failed to connect to daemon'));
    expect(result.category).toBe('daemon_unavailable');
    expect(result.retryable).toBe(true);
  });

  it('classifies timeout error', () => {
    const result = classifyFrontendError(new Error('request timed out'));
    expect(result.category).toBe('daemon_health_timeout');
    expect(result.retryable).toBe(true);
  });

  it('classifies rate limited error', () => {
    const result = classifyFrontendError(new Error('rate limit exceeded, retry after 30'));
    expect(result.category).toBe('rate_limited');
    expect(result.retryable).toBe(true);
    expect(result.retryAfter).toBe(30);
  });

  it('classifies permission denied error', () => {
    const result = classifyFrontendError(new Error('permission denied'));
    expect(result.category).toBe('permission_denied');
    expect(result.retryable).toBe(false);
  });

  it('classifies validation error', () => {
    const result = classifyFrontendError(new Error('validation failed: name required'));
    expect(result.category).toBe('validation_failed');
    expect(result.retryable).toBe(false);
  });

  it('classifies model provider error', () => {
    const result = classifyFrontendError(new Error('AI_ERROR: model not found'));
    expect(result.category).toBe('model_provider_error');
    expect(result.retryable).toBe(false);
  });

  it('classifies tool error', () => {
    const result = classifyFrontendError(new Error('tool execution failed'));
    expect(result.category).toBe('tool_failed');
    expect(result.retryable).toBe(true);
  });

  it('classifies network error', () => {
    const result = classifyFrontendError(new Error('fetch failed'));
    expect(result.category).toBe('network_error');
    expect(result.retryable).toBe(true);
  });

  it('classifies unknown error', () => {
    const result = classifyFrontendError(new Error('something weird happened'));
    expect(result.category).toBe('unknown_error');
    expect(result.retryable).toBe(false);
  });

  it('handles string errors', () => {
    const result = classifyFrontendError('connection refused');
    expect(result.category).toBe('daemon_unavailable');
  });

  it('handles non-Error objects', () => {
    const result = classifyFrontendError({ message: 'rate limit' });
    expect(result.category).toBe('rate_limited');
  });
});
