# Bug: 语音管线多个问题（TTS 404、VAD 误触发、录音无法打断）

**日期:** 2026-05-28
**严重程度:** High（语音功能基本不可用）
**影响范围:** 语音输入、TTS 播报、录音打断
**状态:** 已修复

---

## Bug 1: MiMo TTS API 返回 404

### 现象
TTS 播报失败，静默回退到浏览器 Web Speech API，声音呆板。

### 根因
MiMo TTS 不使用 OpenAI 标准端点 `/v1/audio/speech`，而是通过 `/v1/chat/completions` 调用，音频数据在 `choices[0].message.audio.data` 中以 base64 编码的 WAV 返回。

```typescript
// 错误：使用 OpenAI 标准端点
const url = `${env.MIMO_API_URL}/audio/speech`; // 404

// 正确：使用 chat completions 端点
const url = `${env.MIMO_API_URL}/chat/completions`;
// 请求体需要 assistant role 包含要播报的文本
body: JSON.stringify({
  model: "mimo-v2.5-tts",
  messages: [
    { role: "user", content: "请用自然的语气说话" },
    { role: "assistant", content: text },
  ],
})
// 响应：choices[0].message.audio.data (base64 WAV)
```

### 修复
- `daemon/src/voice/tts.ts` — 改用 `/chat/completions` 端点，解析 base64 音频
- `daemon/src/api/voice.ts` — Content-Type 从 `audio/mpeg` 改为 `audio/wav`

---

## Bug 2: Groq Whisper 拒绝 webm 格式

### 现象
语音转写返回 500 错误：`file must be one of the following types: [flac mp3 mp4 mpeg mpga m4a ogg opus wav webm]`

### 根因
浏览器 MediaRecorder 产生的 webm 编码（opus codec）不被 Groq Whisper API 正确识别。虽然 webm 在支持列表中，但 Groq 对 webm 的 codec 有严格要求。

### 修复
在前端用 Web Audio API 将 webm 转成标准 WAV（16-bit PCM）再发送：

```typescript
// frontend/src/hooks/useVoice.ts
const convertToWav = async (blob: Blob): Promise<Blob> => {
  const audioCtx = new AudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  // 编码为 WAV 格式...
  return new Blob([buffer], { type: "audio/wav" });
};
```

---

## Bug 3: VAD AudioContext 泄漏导致多个录音循环

### 现象
TTS 播报结束后，录音状态异常，无法正常停止录音。

### 根因
每次 `startRecording()` 创建新的 AudioContext 用于 VAD 检测，但从不清理。TTS 结束后重启录音时，多个 VAD 循环同时运行，导致状态混乱。

### 修复
- 新增 `cleanupVAD()` 函数，用 ref 追踪 AudioContext 和 requestAnimationFrame
- `stopRecording()` 中调用 `cleanupVAD()`
- `startRecording()` 开始前先清理上一次的 VAD

---

## Bug 4: Whisper 在静音时产生幻觉文本

### 现象
用户未说话时，Whisper 返回 "请不吝点赞 订阅 转发 打赏支持明镜与点点栏目" 等幻觉文本。

### 根因
Groq Whisper 在处理静音或噪音音频时会产生幻觉输出，这是 Whisper 模型的已知问题。

### 修复
添加幻觉文本过滤：

```typescript
const HALLUCINATION_PATTERNS = [
  "请不吝点赞", "订阅", "转发", "打赏", "支持", "栏目",
  "字幕", "谢谢观看", "谢谢收看", "感谢观看", "下集",
  "拜拜", "再见", "字幕由", "制作", "敬请关注",
];
const isHallucination = text && HALLUCINATION_PATTERNS.some((p) => text.includes(p));
```

---

## Bug 5: 点击按钮无法打断录音（进入处理状态）

### 现象
聆听状态下点击按钮，状态变成"处理中"而不是停止。

### 根因
`stopListening()` 停止 MediaRecorder 后，`onstop` 回调仍然会处理已录制的音频并发送转写，触发 AI 响应。

### 修复
新增 `cancelledRef` 标志：

```typescript
const cancelledRef = useRef(false);

// stopRecording 中设置
cancelledRef.current = true;

// onstop 中检查
if (cancelledRef.current) {
  cancelledRef.current = false;
  setState("idle");
  return; // 跳过转写处理
}
```

---

## 经验教训

1. **MiMo API 不完全兼容 OpenAI** — TTS 使用 chat completions 端点而非 audio/speech，需要实际测试 API 而非假设兼容
2. **浏览器 MediaRecorder 编码不统一** — webm 的 codec 实现在浏览器间不同，转成 WAV 是最安全的跨平台方案
3. **AudioContext 必须手动清理** — 每次创建的 AudioContext 都需要显式关闭，否则会泄漏
4. **Whisper 幻觉需要过滤** — 静音/噪音输入会产生幻觉输出，需要文本级过滤
5. **异步回调需要取消机制** — MediaRecorder.onstop 是异步的，用户取消操作后需要跳过后续处理
