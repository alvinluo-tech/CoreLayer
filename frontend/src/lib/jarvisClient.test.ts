/**
 * Regression tests for jarvisClient error handling.
 *
 * BUG-N1: NetworkError must be distinguishable from HTTP errors
 * BUG-N2: NetworkError must be instanceof Error
 * BUG-N3: NetworkError must carry the cause chain
 */

import { describe, it, expect } from 'vitest';
import { NetworkError } from './jarvisClient.js';

describe('NetworkError', () => {
  it('is instanceof Error', () => {
    const err = new NetworkError('connection failed');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(NetworkError);
  });

  it("has name property set to 'NetworkError'", () => {
    const err = new NetworkError('test');
    expect(err.name).toBe('NetworkError');
  });

  it('preserves message', () => {
    const err = new NetworkError('无法连接到 daemon');
    expect(err.message).toBe('无法连接到 daemon');
  });

  it('carries cause chain', () => {
    const original = new TypeError('Failed to fetch');
    const err = new NetworkError('connection lost', original);
    expect(err.cause).toBe(original);
    expect(err.cause).toBeInstanceOf(TypeError);
  });

  it('is distinguishable from plain Error via instanceof', () => {
    const networkErr = new NetworkError('network down');
    const httpErr = new Error('HTTP 500');

    expect(networkErr instanceof NetworkError).toBe(true);
    expect(httpErr instanceof NetworkError).toBe(false);
  });

  it('is distinguishable from TypeError via instanceof', () => {
    const networkErr = new NetworkError('network down');
    const typeErr = new TypeError('Failed to fetch');

    expect(networkErr instanceof NetworkError).toBe(true);
    expect(typeErr instanceof NetworkError).toBe(false);
  });

  it('cause is optional', () => {
    const err = new NetworkError('no cause');
    expect(err.cause).toBeUndefined();
  });
});
