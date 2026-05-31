import { describe, it, expect } from 'vitest';
import {
  selectModelForTask,
  inferTaskType,
  selectModelByCapabilities,
  selectModelForTaskWithFallback,
} from '../router.js';
import { DEFAULT_ROUTING_RULES, DEFAULT_PROFILES } from '../profiles.js';

describe('selectModelForTask', () => {
  it('returns fast model for short voice answers', () => {
    const modelId = selectModelForTask(
      { mode: 'voice', expectedAnswerLength: 'short' },
      DEFAULT_ROUTING_RULES,
      'mimo-2.5-pro'
    );
    expect(modelId).toBe('groq-llama');
  });

  it('returns tool agent model when tool calling is required', () => {
    const modelId = selectModelForTask(
      { requiresToolCalling: true },
      DEFAULT_ROUTING_RULES,
      'mimo-2.5-pro'
    );
    expect(modelId).toBe('mimo-2.5-pro');
  });

  it('returns reasoning model for long context tasks', () => {
    const modelId = selectModelForTask(
      { requiresLongContext: true },
      DEFAULT_ROUTING_RULES,
      'mimo-2.5-pro'
    );
    expect(modelId).toBe('mimo-2.5-pro');
  });

  it('returns local model for privacy tasks', () => {
    const modelId = selectModelForTask(
      { requiresPrivacy: true },
      DEFAULT_ROUTING_RULES,
      'mimo-2.5-pro'
    );
    expect(modelId).toBe('local-ollama');
  });

  it('returns default model for generic chat', () => {
    const modelId = selectModelForTask({ mode: 'text' }, DEFAULT_ROUTING_RULES, 'mimo-2.5-pro');
    expect(modelId).toBe('mimo-2.5-pro');
  });

  it('returns default model when no rules match', () => {
    const modelId = selectModelForTask({ mode: 'text', requiresVision: true }, [], 'mimo-2.5-pro');
    expect(modelId).toBe('mimo-2.5-pro');
  });
});

describe('inferTaskType', () => {
  it('infers fast for short voice', () => {
    expect(inferTaskType({ mode: 'voice', expectedAnswerLength: 'short' })).toBe('fast');
  });

  it('infers toolAgent when tool calling required', () => {
    expect(inferTaskType({ requiresToolCalling: true })).toBe('toolAgent');
  });

  it('infers reasoning for long context', () => {
    expect(inferTaskType({ requiresLongContext: true })).toBe('reasoning');
  });

  it('infers private for privacy tasks', () => {
    expect(inferTaskType({ requiresPrivacy: true })).toBe('private');
  });

  it('infers chat by default', () => {
    expect(inferTaskType({})).toBe('chat');
  });
});

describe('selectModelByCapabilities', () => {
  it('selects model matching all required capabilities', () => {
    const result = selectModelByCapabilities(
      { required: ['toolCalling', 'streaming'] },
      DEFAULT_PROFILES
    );
    expect(result).not.toBeNull();
    expect(result!.matchedRequired).toContain('toolCalling');
    expect(result!.matchedRequired).toContain('streaming');
  });

  it('returns null when no model matches all requirements', () => {
    const result = selectModelByCapabilities({ required: ['tts', 'audioInput'] }, DEFAULT_PROFILES);
    expect(result).toBeNull();
  });

  it('prefers model with bonus capabilities', () => {
    // Use vision as required to narrow to openrouter-default
    const result = selectModelByCapabilities(
      { required: ['text', 'vision'], bonus: ['longContext'] },
      DEFAULT_PROFILES
    );
    expect(result).not.toBeNull();
    expect(result!.modelId).toBe('openrouter-default');
    expect(result!.matchedBonus).toContain('longContext');
  });

  it('respects minimum context window', () => {
    const result = selectModelByCapabilities(
      { required: ['text'], minContextWindow: 500000 },
      DEFAULT_PROFILES
    );
    expect(result).not.toBeNull();
    // Only mimo-2.5-pro has 1M context
    expect(result!.modelId).toBe('mimo-2.5-pro');
  });

  it('factors in cost when preferLowerCost is set', () => {
    // Both mimo-2.5-pro and openrouter-default have toolCalling + longContext
    const result = selectModelByCapabilities(
      { required: ['toolCalling', 'longContext'] },
      DEFAULT_PROFILES,
      { preferLowerCost: true }
    );
    expect(result).not.toBeNull();
    // mimo-2.5-pro has cost 0, openrouter has cost 18
    expect(result!.modelId).toBe('mimo-2.5-pro');
  });
});

describe('selectModelForTaskWithFallback', () => {
  it('uses rule-based routing when rules match', () => {
    const result = selectModelForTaskWithFallback(
      { requiresToolCalling: true },
      DEFAULT_ROUTING_RULES,
      'mimo-2.5-pro',
      DEFAULT_PROFILES,
      { required: ['toolCalling'] }
    );
    expect(result).toBe('mimo-2.5-pro');
  });

  it('falls back to capability routing when no rules match', () => {
    const result = selectModelForTaskWithFallback(
      { mode: 'text' },
      [], // no rules
      'local-ollama',
      DEFAULT_PROFILES,
      { required: ['toolCalling', 'longContext'] }
    );
    // Should find mimo-2.5-pro via capabilities, not fall back to local-ollama
    expect(result).toBe('mimo-2.5-pro');
  });

  it('returns default when no rules match and no capability fallback', () => {
    const result = selectModelForTaskWithFallback({ mode: 'text' }, [], 'mimo-2.5-pro');
    expect(result).toBe('mimo-2.5-pro');
  });
});
