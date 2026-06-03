import { describe, it, expect } from 'vitest';
import { CircularPCMBuffer } from './circularPCMBuffer.js';

describe('CircularPCMBuffer', () => {
  it('starts empty', () => {
    const buf = new CircularPCMBuffer();
    expect(buf.size).toBe(0);
    expect(buf.isEmpty).toBe(true);
    expect(buf.flush()).toEqual([]);
  });

  it('pushes and flushes chunks in order', () => {
    const buf = new CircularPCMBuffer({ maxChunks: 4 });

    const chunk1 = new Float32Array([1, 2, 3]);
    const chunk2 = new Float32Array([4, 5, 6]);
    const chunk3 = new Float32Array([7, 8, 9]);

    buf.push(chunk1);
    buf.push(chunk2);
    buf.push(chunk3);

    expect(buf.size).toBe(3);
    expect(buf.isEmpty).toBe(false);

    const result = buf.flush();
    expect(result).toHaveLength(3);
    expect(Array.from(result[0]!)).toEqual([1, 2, 3]);
    expect(Array.from(result[1]!)).toEqual([4, 5, 6]);
    expect(Array.from(result[2]!)).toEqual([7, 8, 9]);

    // Buffer is cleared after flush
    expect(buf.size).toBe(0);
    expect(buf.isEmpty).toBe(true);
  });

  it('overwrites oldest chunks when full', () => {
    const buf = new CircularPCMBuffer({ maxChunks: 3 });

    buf.push(new Float32Array([1]));
    buf.push(new Float32Array([2]));
    buf.push(new Float32Array([3]));
    buf.push(new Float32Array([4])); // overwrites chunk [1]

    expect(buf.size).toBe(3);

    const result = buf.flush();
    expect(result).toHaveLength(3);
    expect(Array.from(result[0]!)).toEqual([2]);
    expect(Array.from(result[1]!)).toEqual([3]);
    expect(Array.from(result[2]!)).toEqual([4]);
  });

  it('clear empties the buffer', () => {
    const buf = new CircularPCMBuffer({ maxChunks: 3 });

    buf.push(new Float32Array([1]));
    buf.push(new Float32Array([2]));
    expect(buf.size).toBe(2);

    buf.clear();
    expect(buf.size).toBe(0);
    expect(buf.isEmpty).toBe(true);
    expect(buf.flush()).toEqual([]);
  });

  it('returns copies on flush (not references)', () => {
    const buf = new CircularPCMBuffer({ maxChunks: 3 });

    const original = new Float32Array([1, 2, 3]);
    buf.push(original);

    // Mutate original after push
    original[0] = 999;

    const result = buf.flush();
    expect(Array.from(result[0]!)).toEqual([1, 2, 3]); // original value preserved
  });

  it('handles maxChunks of 1', () => {
    const buf = new CircularPCMBuffer({ maxChunks: 1 });

    buf.push(new Float32Array([1]));
    buf.push(new Float32Array([2])); // overwrites

    expect(buf.size).toBe(1);
    const result = buf.flush();
    expect(Array.from(result[0]!)).toEqual([2]);
  });
});
