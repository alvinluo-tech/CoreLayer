import { describe, it, expect } from 'vitest';
import { BargeInStateMachine } from './bargeInStateMachine.js';

describe('BargeInStateMachine', () => {
  it('starts in idle state', () => {
    const sm = new BargeInStateMachine();
    expect(sm.getState()).toBe('idle');
  });

  it('stays idle when volume is below threshold', () => {
    const sm = new BargeInStateMachine();
    const action = sm.feed(30, 100); // below default threshold of 62
    expect(action).toBe('none');
    expect(sm.getState()).toBe('idle');
  });

  it('transitions to ducking after sustained voice exceeds duckTriggerMs', () => {
    const sm = new BargeInStateMachine({ threshold: 50, duckTriggerMs: 50, confirmMs: 160 });

    // Feed voice samples over 60ms (exceeds 50ms duckTrigger)
    let action = sm.feed(80, 0);
    expect(action).toBe('none');
    expect(sm.getState()).toBe('idle');

    action = sm.feed(80, 30);
    expect(action).toBe('none');

    action = sm.feed(80, 60);
    expect(action).toBe('duck');
    expect(sm.getState()).toBe('ducking');
  });

  it('transitions to confirmed after sustained voice exceeds confirmMs', () => {
    const sm = new BargeInStateMachine({ threshold: 50, duckTriggerMs: 50, confirmMs: 160 });

    // Reach ducking state
    sm.feed(80, 0);
    sm.feed(80, 30);
    sm.feed(80, 60); // -> ducking

    // Continue feeding voice to reach confirmation
    sm.feed(80, 100);
    sm.feed(80, 140);
    const action = sm.feed(80, 180); // 180ms total > 160ms confirmMs
    expect(action).toBe('barge-in');
    expect(sm.getState()).toBe('confirmed');
  });

  it('resets to idle on silence during ducking', () => {
    const sm = new BargeInStateMachine({
      threshold: 50,
      duckTriggerMs: 50,
      confirmMs: 160,
      silenceResetMs: 100,
    });

    // Reach ducking
    sm.feed(80, 0);
    sm.feed(80, 30);
    sm.feed(80, 60); // -> ducking

    // Feed silence for > silenceResetMs
    sm.feed(10, 100);
    sm.feed(10, 170); // 110ms silence > 100ms reset

    expect(sm.getState()).toBe('idle');
  });

  it('confirmed is terminal until reset()', () => {
    const sm = new BargeInStateMachine({ threshold: 50, duckTriggerMs: 50, confirmMs: 160 });

    // Reach confirmed
    sm.feed(80, 0);
    sm.feed(80, 60);
    sm.feed(80, 180); // -> confirmed

    // Subsequent feeds still return barge-in
    expect(sm.feed(10, 200)).toBe('barge-in');
    expect(sm.feed(10, 220)).toBe('barge-in');

    // Reset returns to idle
    sm.reset();
    expect(sm.getState()).toBe('idle');
    expect(sm.feed(80, 300)).toBe('none');
  });

  it('uses default config when none provided', () => {
    // Default threshold is 62, duckTriggerMs is 50, confirmMs is 160
    const sm1 = new BargeInStateMachine();
    expect(sm1.getState()).toBe('idle');

    // Volume below 62 should not trigger
    sm1.feed(60, 0);
    sm1.feed(60, 100);
    expect(sm1.getState()).toBe('idle');

    // Volume above 62 with fresh instance — should start accumulating
    const sm2 = new BargeInStateMachine();
    sm2.feed(80, 0);
    sm2.feed(80, 60); // 60ms > 50ms duckTrigger
    expect(sm2.getState()).toBe('ducking');
  });

  it('handles partial silence during ducking without reset', () => {
    const sm = new BargeInStateMachine({
      threshold: 50,
      duckTriggerMs: 50,
      confirmMs: 160,
      silenceResetMs: 100,
    });

    // Reach ducking
    sm.feed(80, 0);
    sm.feed(80, 30);
    sm.feed(80, 60); // -> ducking

    // Short silence (below reset threshold) then voice again
    sm.feed(10, 80); // 20ms silence
    sm.feed(80, 100); // voice resumes

    // Should still be ducking
    expect(sm.getState()).toBe('ducking');

    // Continue to confirm
    const action = sm.feed(80, 220);
    expect(action).toBe('barge-in');
    expect(sm.getState()).toBe('confirmed');
  });

  it('handles rapid feed calls correctly', () => {
    const sm = new BargeInStateMachine({ threshold: 50, duckTriggerMs: 50, confirmMs: 160 });

    // Feed many samples at same timestamp
    for (let i = 0; i < 10; i++) {
      sm.feed(80, 0);
    }
    // No time has passed, so should still be idle
    expect(sm.getState()).toBe('idle');

    // Now advance time
    sm.feed(80, 60);
    expect(sm.getState()).toBe('ducking');
  });
});
