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

  it('maintains chronological order after multiple wrap-arounds', () => {
    const buf = new CircularPCMBuffer({ maxChunks: 3 });

    // Push 9 chunks through a buffer of size 3 — 3 full wrap-arounds
    for (let i = 1; i <= 9; i++) {
      buf.push(new Float32Array([i]));
    }

    expect(buf.size).toBe(3);
    const result = buf.flush();
    expect(result).toHaveLength(3);
    // Should contain the LAST 3 chunks in order: 7, 8, 9
    expect(Array.from(result[0]!)).toEqual([7]);
    expect(Array.from(result[1]!)).toEqual([8]);
    expect(Array.from(result[2]!)).toEqual([9]);
  });

  it('default config holds ~500ms of audio (20 chunks at 25ms/chunk)', () => {
    const buf = new CircularPCMBuffer();
    // Push 25 chunks — should only keep the last 20
    for (let i = 0; i < 25; i++) {
      buf.push(new Float32Array([i]));
    }
    expect(buf.size).toBe(20);

    const result = buf.flush();
    expect(result).toHaveLength(20);
    // Should contain chunks 5-24 (the last 20)
    expect(Array.from(result[0]!)).toEqual([5]);
    expect(Array.from(result[19]!)).toEqual([24]);
  });

  it('captures pre-interruption audio for ASR', () => {
    const buf = new CircularPCMBuffer({ maxChunks: 20 });

    // Simulate: 10 chunks of TTS-era mic noise, then 5 chunks of user speech
    for (let i = 0; i < 10; i++) {
      buf.push(new Float32Array([0.01])); // quiet noise
    }
    for (let i = 0; i < 5; i++) {
      buf.push(new Float32Array([0.8])); // loud user speech
    }

    // Flush should capture the last 15 chunks (5 speech + 10 noise)
    const audio = buf.flush();
    expect(audio).toHaveLength(15);
    // Last 5 chunks should be the loud speech (check approximate equality for float32)
    expect(audio[10]![0]).toBeCloseTo(0.8, 5);
    expect(audio[14]![0]).toBeCloseTo(0.8, 5);
  });
});
