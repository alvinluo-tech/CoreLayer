import { describe, it, expect, vi } from 'vitest';
import {
  getSpokenText,
  truncateVoiceResponse,
  filterASRNoise,
  isASRNoise,
  isASRHallucination,
  transcribeWithRetry,
  ASR_NOISE_PATTERNS,
} from './voiceUtils';

// ---- getSpokenText ----

describe('getSpokenText', () => {
  it('removes thought tags and content', () => {
    expect(getSpokenText('Hello <thought>reasoning</thought> world')).toBe('Hello  world');
  });

  it('handles multiple thought blocks', () => {
    const text = 'A <thought>one</thought> B <thought>two</thought> C';
    expect(getSpokenText(text)).toBe('A  B  C');
  });

  it('returns text unchanged when no thought tags', () => {
    expect(getSpokenText('plain text')).toBe('plain text');
  });

  it('handles empty string', () => {
    expect(getSpokenText('')).toBe('');
  });
});

// ---- truncateVoiceResponse ----

describe('truncateVoiceResponse', () => {
  it('returns short text unchanged', () => {
    expect(truncateVoiceResponse('你好呀', 200)).toBe('你好呀');
  });

  it('truncates text exceeding maxChars', () => {
    const long = '这是一段很长的回复'.repeat(30);
    const result = truncateVoiceResponse(long, 200);
    expect(result.length).toBeLessThanOrEqual(203); // 200 + "..."
    expect(result).toContain('...');
  });

  it('truncates at sentence boundary when possible', () => {
    const text = '第一句话。第二句话。第三句话是很长的内容'.repeat(10);
    const result = truncateVoiceResponse(text, 200);
    // Should try to end at a sentence boundary
    expect(result.length).toBeLessThanOrEqual(203);
  });

  it('handles empty string', () => {
    expect(truncateVoiceResponse('', 200)).toBe('');
  });

  it('uses default maxChars of 200', () => {
    const long = '长'.repeat(300);
    const result = truncateVoiceResponse(long);
    expect(result.length).toBeLessThanOrEqual(203);
  });

  it('strips markdown formatting', () => {
    const text = '这是**粗体**和`代码`和[链接](url)和#标题';
    const result = truncateVoiceResponse(text, 200);
    expect(result).not.toContain('**');
    expect(result).not.toContain('`');
    expect(result).not.toContain('[');
    expect(result).not.toContain(']');
  });

  it('strips bullet points and numbered lists', () => {
    const text = '- 第一项\n- 第二项\n- 第三项';
    const result = truncateVoiceResponse(text, 200);
    expect(result).not.toContain('- ');
  });
});

// ---- ASR Noise Filtering ----

describe('ASR_NOISE_PATTERNS', () => {
  it('contains common ASR noise patterns', () => {
    expect(ASR_NOISE_PATTERNS.length).toBeGreaterThan(0);
    // Should include typical single-char noise
    expect(ASR_NOISE_PATTERNS.some((p) => p.test('啊'))).toBe(true);
    expect(ASR_NOISE_PATTERNS.some((p) => p.test('嗯'))).toBe(true);
  });

  it('does not match meaningful single characters', () => {
    // "好" is meaningful, should not be noise
    expect(ASR_NOISE_PATTERNS.some((p) => p.test('好'))).toBe(false);
  });
});

describe('isASRNoise', () => {
  it('identifies pure noise text', () => {
    expect(isASRNoise('啊')).toBe(true);
    expect(isASRNoise('嗯')).toBe(true);
    expect(isASRNoise('额')).toBe(true);
  });

  it('identifies repeated filler characters', () => {
    expect(isASRNoise('啊啊啊')).toBe(true);
    expect(isASRNoise('嗯嗯嗯')).toBe(true);
  });

  it('rejects meaningful text', () => {
    expect(isASRNoise('你好')).toBe(false);
    expect(isASRNoise('帮我查一下任务')).toBe(false);
    expect(isASRNoise('好的没问题')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isASRNoise('')).toBe(false);
  });
});

describe('filterASRNoise', () => {
  it('filters out noise from ASR results', () => {
    const results = ['啊', '帮我查任务', '嗯', '今天天气怎么样'];
    const filtered = filterASRNoise(results);
    expect(filtered).toEqual(['帮我查任务', '今天天气怎么样']);
  });

  it('returns empty array when all results are noise', () => {
    const results = ['啊', '嗯', '额'];
    expect(filterASRNoise(results)).toEqual([]);
  });

  it('returns all results when no noise', () => {
    const results = ['你好', '帮我创建任务'];
    expect(filterASRNoise(results)).toEqual(results);
  });

  it('handles empty input', () => {
    expect(filterASRNoise([])).toEqual([]);
  });
});

// ---- ASR Hallucination Filtering ----

describe('isASRHallucination', () => {
  it('identifies hallucination phrases', () => {
    expect(isASRHallucination('请不吝点赞')).toBe(true);
    expect(isASRHallucination('谢谢观看')).toBe(true);
    expect(isASRHallucination('敬请关注')).toBe(true);
  });

  it('identifies hallucination within longer text', () => {
    expect(isASRHallucination('今天天气不错，请不吝点赞')).toBe(true);
  });

  it('rejects normal text', () => {
    expect(isASRHallucination('帮我查一下任务')).toBe(false);
    expect(isASRHallucination('今天天气怎么样')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isASRHallucination('')).toBe(false);
  });
});

describe('transcribeWithRetry', () => {
  it('returns text on first attempt when no hallucination', async () => {
    const transcribeFn = vi.fn().mockResolvedValue('你好世界');
    const result = await transcribeWithRetry(transcribeFn);
    expect(result).toBe('你好世界');
    expect(transcribeFn).toHaveBeenCalledTimes(1);
  });

  it('retries once when first attempt is hallucination', async () => {
    const transcribeFn = vi
      .fn()
      .mockResolvedValueOnce('请不吝点赞')
      .mockResolvedValueOnce('正常文本');
    const result = await transcribeWithRetry(transcribeFn);
    expect(result).toBe('正常文本');
    expect(transcribeFn).toHaveBeenCalledTimes(2);
  });

  it('returns empty after exhausting retries', async () => {
    const transcribeFn = vi
      .fn()
      .mockResolvedValueOnce('请不吝点赞')
      .mockResolvedValueOnce('谢谢观看');
    const result = await transcribeWithRetry(transcribeFn);
    expect(result).toBe('');
    expect(transcribeFn).toHaveBeenCalledTimes(2);
  });

  it('returns empty for empty transcription', async () => {
    const transcribeFn = vi.fn().mockResolvedValue('');
    const result = await transcribeWithRetry(transcribeFn);
    expect(result).toBe('');
  });

  it('propagates transcription errors', async () => {
    const transcribeFn = vi.fn().mockRejectedValue(new Error('API error'));
    await expect(transcribeWithRetry(transcribeFn)).rejects.toThrow('API error');
  });
});
