import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { StatusBadge } from './StatusBadge';
import { Mic, Volume2, Radio, Sparkles, Zap, Save, Play, Square, KeyRound } from 'lucide-react';
import { voiceProfileManager } from '@/lib/voiceProfile';
import { getVoiceStatus, type VoiceStatus } from '@/lib/tauri';
import { jarvisClient } from '@/lib/jarvisClient';

interface ProviderDef {
  id: string;
  name: string;
  kind: 'asr' | 'tts' | 'both';
  models: Array<{ id: string; name: string }>;
  voices?: Array<{ id: string; name: string }>;
  requiresApiKey: boolean;
  credentialKey: string;
  localOnly?: boolean;
  available: boolean;
  hasApiKey: boolean;
}

interface VoiceConfig {
  asrProvider: string;
  asrModel: string;
  ttsProvider: string;
  ttsModel: string;
  ttsVoice: string;
  ttsSpeed: number;
}

export function VoicePage() {
  const profile = voiceProfileManager.getActiveProfile();
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [voiceMode, setVoiceMode] = useState<'pipeline' | 'realtime'>(
    () => (localStorage.getItem('jarvis_voice_mode') as 'pipeline' | 'realtime') || 'pipeline'
  );
  const [serverTTS, setServerTTS] = useState(
    () => localStorage.getItem('jarvis_voice_server_tts') === 'true'
  );

  const [providers, setProviders] = useState<ProviderDef[]>([]);
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({
    asrProvider: '',
    asrModel: '',
    ttsProvider: '',
    ttsModel: 'mimo-v2.5-tts',
    ttsVoice: '茉莉',
    ttsSpeed: 1.0,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [showApiKeyFor, setShowApiKeyFor] = useState<string | null>(null);
  const [apiKeySaving, setApiKeySaving] = useState(false);

  const [testTtsRunning, setTestTtsRunning] = useState(false);
  const [testTtsAudio, setTestTtsAudio] = useState<HTMLAudioElement | null>(null);

  const [testAsrRunning, setTestAsrRunning] = useState(false);

  const fetchProviders = useCallback(async () => {
    try {
      const data = await jarvisClient.get<{ providers: ProviderDef[] }>('/api/voice/providers');
      setProviders(data.providers);
    } catch {
      /* ignore */
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const data = await jarvisClient.get<VoiceConfig>('/api/voice/config');
      setVoiceConfig(data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    getVoiceStatus()
      .then(setVoiceStatus)
      .catch(() => {});
    fetchProviders();
    fetchConfig();
  }, [fetchProviders, fetchConfig]);

  const asrProviders = providers.filter((p) => p.kind === 'asr' || p.kind === 'both');
  const ttsProviders = providers.filter((p) => p.kind === 'tts' || p.kind === 'both');

  const selectedAsrDef = providers.find((p) => p.id === voiceConfig.asrProvider);
  const selectedTtsDef = providers.find((p) => p.id === voiceConfig.ttsProvider);

  const updateConfig = (partial: Partial<VoiceConfig>) => {
    setVoiceConfig((prev) => ({ ...prev, ...partial }));
    setDirty(true);
    setSaveMsg('');
  };

  const handleVoiceModeChange = (mode: 'pipeline' | 'realtime') => {
    setVoiceMode(mode);
    localStorage.setItem('jarvis_voice_mode', mode);
  };

  const handleServerTTSToggle = () => {
    const next = !serverTTS;
    setServerTTS(next);
    localStorage.setItem('jarvis_voice_server_tts', String(next));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      await jarvisClient.put('/api/voice/config', voiceConfig);
      setDirty(false);
      setSaveMsg('saved');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch {
      setSaveMsg('error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveApiKey = async (providerId: string) => {
    const key = apiKeyInputs[providerId];
    if (!key?.trim()) return;
    setApiKeySaving(true);
    try {
      await jarvisClient.put('/api/voice/credentials', { providerId, apiKey: key.trim() });
      setApiKeyInputs((prev) => ({ ...prev, [providerId]: '' }));
      setShowApiKeyFor(null);
      fetchProviders();
    } catch {
      /* ignore */
    }
    setApiKeySaving(false);
  };

  const handleTestTts = async () => {
    setTestTtsRunning(true);
    try {
      const url = await jarvisClient.getDaemonUrl();
      const response = await fetch(`${url}/api/voice/test-tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: voiceConfig.ttsProvider,
          text: '你好，我是 Jarvis，正在测试语音合成功能。',
          voice: voiceConfig.ttsVoice,
          speed: voiceConfig.ttsSpeed,
        }),
      });
      if (!response.ok) throw new Error(`TTS test failed (${response.status})`);
      const blob = await response.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      setTestTtsAudio(audio);
      audio.play();
      audio.onended = () => setTestTtsAudio(null);
    } catch {
      /* ignore */
    }
    setTestTtsRunning(false);
  };

  const handleStopTestTts = () => {
    testTtsAudio?.pause();
    setTestTtsAudio(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">语音系统</h2>
          <p className="text-sm text-muted-foreground">语音配置与实时模式选择</p>
        </div>
      </div>

      {/* Voice Protocol Card */}
      <Card className="p-5 space-y-4">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          语音接入协议与模式 (Voice Mode)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => handleVoiceModeChange('pipeline')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              voiceMode === 'pipeline'
                ? 'border-primary bg-primary/[0.03] font-semibold'
                : 'border-border/60 bg-background/50 hover:border-primary/30'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Mic className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-semibold">标准串联协议 (Standard ASR + TTS)</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              分步式处理：本地/网页 ASR 录音识别 → REST 大模型 →
              语音合成播放。支持所有提供商，适合常规对话，延迟 1.5s - 2.5s。
            </p>
          </button>
          <button
            onClick={() => handleVoiceModeChange('realtime')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              voiceMode === 'realtime'
                ? 'border-primary bg-primary/[0.03] font-semibold'
                : 'border-border/60 bg-background/50 hover:border-primary/30'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Radio className="h-4 w-4 text-purple-500" />
              <span className="text-xs font-semibold">ChatGPT Realtime 极速双向流</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              极速直连：基于 WebRTC/WebSocket 建立双向持续音频流，延迟 0.2s - 0.5s。
            </p>
          </button>
        </div>
      </Card>

      {/* Server TTS Toggle */}
      <Card className="p-5 space-y-4">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          流式语音合成 (Streaming TTS)
        </h3>
        <button
          onClick={handleServerTTSToggle}
          className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
            serverTTS
              ? 'border-amber-500 bg-amber-500/[0.03]'
              : 'border-border/60 bg-background/50 hover:border-amber-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">
                {serverTTS ? '服务端流式 TTS 已启用' : '客户端逐句 TTS'}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {serverTTS
                  ? 'LLM 文本与 TTS 音频同时推送，首字播放延迟 <1s'
                  : 'LLM 输出后客户端逐句调用 TTS API，延迟 1.5s+'}
              </p>
            </div>
            <div
              className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${
                serverTTS ? 'bg-amber-500' : 'bg-muted'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  serverTTS ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
          </div>
        </button>
      </Card>

      {/* ASR Provider Config */}
      <Card className="p-5 space-y-4">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Mic className="h-4 w-4 text-emerald-500" />
          ASR 语音识别配置
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">提供者</label>
            <select
              value={voiceConfig.asrProvider}
              onChange={(e) => {
                const def = providers.find((p) => p.id === e.target.value);
                updateConfig({
                  asrProvider: e.target.value,
                  asrModel: def?.models[0]?.id ?? '',
                });
              }}
              className="w-full p-2 rounded-lg border bg-background text-sm"
            >
              <option value="">默认</option>
              {asrProviders.map((p) => (
                <option
                  key={p.id}
                  value={p.id}
                  disabled={!p.available && p.requiresApiKey && !p.hasApiKey}
                >
                  {p.name} {p.available ? '' : '(不可用)'}
                </option>
              ))}
            </select>
          </div>
          {selectedAsrDef && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">模型</label>
              <select
                value={voiceConfig.asrModel}
                onChange={(e) => updateConfig({ asrModel: e.target.value })}
                className="w-full p-2 rounded-lg border bg-background text-sm"
              >
                {selectedAsrDef.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {selectedAsrDef?.requiresApiKey && !selectedAsrDef.hasApiKey && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <KeyRound className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs text-amber-600">需要 API Key</span>
            {showApiKeyFor === selectedAsrDef.id ? (
              <div className="flex items-center gap-2 ml-auto">
                <input
                  type="password"
                  value={apiKeyInputs[selectedAsrDef.id] ?? ''}
                  onChange={(e) =>
                    setApiKeyInputs((prev) => ({ ...prev, [selectedAsrDef.id]: e.target.value }))
                  }
                  placeholder="API Key"
                  className="p-1.5 rounded border bg-background text-xs w-48"
                />
                <button
                  onClick={() => handleSaveApiKey(selectedAsrDef.id)}
                  disabled={apiKeySaving}
                  className="p-1.5 rounded bg-primary text-primary-foreground text-xs"
                >
                  {apiKeySaving ? '...' : '保存'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowApiKeyFor(selectedAsrDef.id)}
                className="text-xs text-primary underline ml-auto"
              >
                配置
              </button>
            )}
          </div>
        )}
      </Card>

      {/* TTS Provider Config */}
      <Card className="p-5 space-y-4">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-amber-500" />
          TTS 语音合成配置
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">提供者</label>
            <select
              value={voiceConfig.ttsProvider}
              onChange={(e) => {
                const def = providers.find((p) => p.id === e.target.value);
                updateConfig({
                  ttsProvider: e.target.value,
                  ttsModel: def?.models[0]?.id ?? '',
                  ttsVoice: def?.voices?.[0]?.id ?? '',
                });
              }}
              className="w-full p-2 rounded-lg border bg-background text-sm"
            >
              <option value="">默认</option>
              {ttsProviders.map((p) => (
                <option
                  key={p.id}
                  value={p.id}
                  disabled={!p.available && p.requiresApiKey && !p.hasApiKey}
                >
                  {p.name} {p.available ? '' : '(不可用)'}
                </option>
              ))}
            </select>
          </div>
          {selectedTtsDef && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">模型</label>
              <select
                value={voiceConfig.ttsModel}
                onChange={(e) => updateConfig({ ttsModel: e.target.value })}
                className="w-full p-2 rounded-lg border bg-background text-sm"
              >
                {selectedTtsDef.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {selectedTtsDef?.voices && selectedTtsDef.voices.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">音色</label>
              <select
                value={voiceConfig.ttsVoice}
                onChange={(e) => updateConfig({ ttsVoice: e.target.value })}
                className="w-full p-2 rounded-lg border bg-background text-sm"
              >
                {selectedTtsDef.voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                语速 ({voiceConfig.ttsSpeed.toFixed(1)}x)
              </label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={voiceConfig.ttsSpeed}
                onChange={(e) => updateConfig({ ttsSpeed: parseFloat(e.target.value) })}
                className="w-full mt-2"
              />
            </div>
          </div>
        )}
        {selectedTtsDef?.requiresApiKey && !selectedTtsDef.hasApiKey && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <KeyRound className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs text-amber-600">需要 API Key</span>
            {showApiKeyFor === selectedTtsDef.id ? (
              <div className="flex items-center gap-2 ml-auto">
                <input
                  type="password"
                  value={apiKeyInputs[selectedTtsDef.id] ?? ''}
                  onChange={(e) =>
                    setApiKeyInputs((prev) => ({ ...prev, [selectedTtsDef.id]: e.target.value }))
                  }
                  placeholder="API Key"
                  className="p-1.5 rounded border bg-background text-xs w-48"
                />
                <button
                  onClick={() => handleSaveApiKey(selectedTtsDef.id)}
                  disabled={apiKeySaving}
                  className="p-1.5 rounded bg-primary text-primary-foreground text-xs"
                >
                  {apiKeySaving ? '...' : '保存'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowApiKeyFor(selectedTtsDef.id)}
                className="text-xs text-primary underline ml-auto"
              >
                配置
              </button>
            )}
          </div>
        )}
      </Card>

      {/* Test & Save */}
      <Card className="p-5 space-y-4">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Play className="h-4 w-4 text-primary" />
          测试与保存
        </h3>
        <div className="flex items-center gap-3">
          <button
            onClick={testTtsRunning ? handleStopTestTts : handleTestTts}
            disabled={!voiceConfig.ttsProvider && !voiceStatus?.tts?.available}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-50"
          >
            {testTtsRunning ? (
              <>
                <Square className="h-3.5 w-3.5" />
                停止
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                测试 TTS
              </>
            )}
          </button>
          <button
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'audio/*';
              input.onchange = async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                setTestAsrRunning(true);
                try {
                  const url = await jarvisClient.getDaemonUrl();
                  const formData = new FormData();
                  formData.append('audio', file);
                  formData.append('providerId', voiceConfig.asrProvider);
                  const resp = await fetch(`${url}/api/voice/test-asr`, {
                    method: 'POST',
                    body: formData,
                  });
                  if (!resp.ok) throw new Error(`ASR test failed (${resp.status})`);
                  const result = (await resp.json()) as { text: string };
                  alert(`识别结果: ${result.text}`);
                } catch {
                  /* ignore */
                }
                setTestAsrRunning(false);
              };
              input.click();
            }}
            disabled={!voiceConfig.asrProvider && !voiceStatus?.asr}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm disabled:opacity-50"
          >
            <Mic className="h-3.5 w-3.5" />
            {testAsrRunning ? '识别中...' : '测试 ASR'}
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm ml-auto disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? '保存中...' : '保存配置'}
          </button>
          {saveMsg === 'saved' && <span className="text-xs text-emerald-500">已保存</span>}
          {saveMsg === 'error' && <span className="text-xs text-red-500">保存失败</span>}
        </div>
      </Card>

      {/* Voice Profile Card (legacy) */}
      <Card className="p-5 space-y-4">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-muted-foreground" />
          当前语音档案
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">名称</p>
            <p className="text-sm font-medium mt-0.5">{profile.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">语言</p>
            <p className="text-sm mt-0.5">{profile.language}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">模型</p>
            <p className="text-sm font-mono mt-0.5">{profile.model}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">性别</p>
            <p className="text-sm mt-0.5">
              {profile.gender === 'female' ? '女' : profile.gender === 'male' ? '男' : '中性'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">风格</p>
            <p className="text-sm mt-0.5">{profile.style}</p>
          </div>
        </div>
      </Card>

      {/* Voice System Status */}
      <Card className="p-5 space-y-3">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Radio className="h-4 w-4 text-muted-foreground" />
          系统状态
        </h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
            <div className="flex items-center gap-2">
              <Mic className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm">ASR (语音识别)</span>
            </div>
            <StatusBadge
              status={voiceStatus?.asr ? 'healthy' : 'error'}
              label={voiceStatus?.asr ? '可用' : '不可用'}
            />
          </div>
          <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
            <div className="flex items-center gap-2">
              <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm">TTS (语音合成)</span>
            </div>
            <StatusBadge
              status={voiceStatus?.tts?.available ? 'healthy' : 'error'}
              label={voiceStatus?.tts?.available ? `${voiceStatus.tts.provider}` : '不可用'}
            />
          </div>
          <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50">
            <div className="flex items-center gap-2">
              <Radio className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm">VAD (语音活动检测)</span>
            </div>
            <StatusBadge
              status={voiceStatus?.vad?.available ? 'healthy' : 'warning'}
              label={voiceStatus?.vad?.available ? '可用' : (voiceStatus?.vad?.note ?? '未知')}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
