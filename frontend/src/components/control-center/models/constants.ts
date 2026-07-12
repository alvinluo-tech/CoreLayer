export const TASK_TYPE_LABELS: Record<string, string> = {
  chat: '默认聊天',
  fast: '快速响应',
  reasoning: '深度推理',
  toolAgent: '工具调用',
  coding: '代码生成',
  voice: '语音对话',
  private: '隐私模式',
};

export const PROVIDER_COLORS: Record<
  string,
  { border: string; bg: string; text: string; dot: string }
> = {
  openai: {
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/[0.03]',
    text: 'text-emerald-600',
    dot: 'bg-emerald-500',
  },
  deepseek: {
    border: 'border-blue-500/30',
    bg: 'bg-blue-500/[0.03]',
    text: 'text-blue-600',
    dot: 'bg-blue-500',
  },
  anthropic: {
    border: 'border-orange-500/30',
    bg: 'bg-orange-500/[0.03]',
    text: 'text-orange-600',
    dot: 'bg-orange-500',
  },
  google: {
    border: 'border-purple-500/30',
    bg: 'bg-purple-500/[0.03]',
    text: 'text-purple-600',
    dot: 'bg-purple-500',
  },
  ollama: {
    border: 'border-neutral-500/40',
    bg: 'bg-neutral-500/[0.04]',
    text: 'text-neutral-600 dark:text-neutral-400',
    dot: 'bg-neutral-500',
  },
  groq: {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/[0.03]',
    text: 'text-amber-600',
    dot: 'bg-amber-500',
  },
};

export const DEFAULT_PROVIDER_COLOR = {
  border: 'border-primary/20',
  bg: 'bg-primary/[0.02]',
  text: 'text-primary',
  dot: 'bg-primary',
};

export function getProviderColor(id: string) {
  return PROVIDER_COLORS[id] ?? DEFAULT_PROVIDER_COLOR;
}
