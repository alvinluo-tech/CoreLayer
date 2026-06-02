export interface ProviderPreset {
  id: string;
  name: string;
  nameCN: string;
  type: 'openai_compatible' | 'ollama';
  defaultBaseURL: string;
  requiresApiKey: boolean;
  popularModels: { id: string; name: string }[];
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    nameCN: 'OpenAI',
    type: 'openai_compatible',
    defaultBaseURL: 'https://api.openai.com/v1',
    requiresApiKey: true,
    popularModels: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'o3-mini', name: 'o3-mini' },
      { id: 'gpt-4.1', name: 'GPT-4.1' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    nameCN: 'Anthropic',
    type: 'openai_compatible',
    defaultBaseURL: 'https://api.anthropic.com/v1',
    requiresApiKey: true,
    popularModels: [
      { id: 'claude-sonnet-4', name: 'Claude Sonnet 4' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
      { id: 'claude-opus-4', name: 'Claude Opus 4' },
    ],
  },
  {
    id: 'google',
    name: 'Google Gemini',
    nameCN: 'Google Gemini',
    type: 'openai_compatible',
    defaultBaseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    requiresApiKey: true,
    popularModels: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    nameCN: 'DeepSeek (深度求索)',
    type: 'openai_compatible',
    defaultBaseURL: 'https://api.deepseek.com/v1',
    requiresApiKey: true,
    popularModels: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    nameCN: 'Groq',
    type: 'openai_compatible',
    defaultBaseURL: 'https://api.groq.com/openai/v1',
    requiresApiKey: true,
    popularModels: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
      { id: 'gemma2-9b-it', name: 'Gemma 2 9B' },
    ],
  },
  {
    id: 'qwen',
    name: 'Qwen',
    nameCN: '通义千问',
    type: 'openai_compatible',
    defaultBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    requiresApiKey: true,
    popularModels: [
      { id: 'qwen-max', name: 'Qwen Max' },
      { id: 'qwen-plus', name: 'Qwen Plus' },
      { id: 'qwen-turbo', name: 'Qwen Turbo' },
      { id: 'qwen-long', name: 'Qwen Long' },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    nameCN: 'OpenRouter',
    type: 'openai_compatible',
    defaultBaseURL: 'https://openrouter.ai/api/v1',
    requiresApiKey: true,
    popularModels: [
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4' },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
    ],
  },
  {
    id: 'mimo',
    name: 'MiMo',
    nameCN: 'MiMo (小米)',
    type: 'openai_compatible',
    defaultBaseURL: 'https://token-plan-ams.xiaomimimo.com/v1',
    requiresApiKey: true,
    popularModels: [
      { id: 'mimo-v2.5-pro', name: 'MiMo v2.5 Pro' },
      { id: 'mimo-2.5', name: 'MiMo 2.5' },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    nameCN: 'Ollama (本地)',
    type: 'ollama',
    defaultBaseURL: 'http://localhost:11434/v1',
    requiresApiKey: false,
    popularModels: [
      { id: 'llama3.2', name: 'Llama 3.2' },
      { id: 'qwen2.5', name: 'Qwen 2.5' },
      { id: 'deepseek-r1', name: 'DeepSeek R1' },
      { id: 'mistral', name: 'Mistral' },
    ],
  },
];
