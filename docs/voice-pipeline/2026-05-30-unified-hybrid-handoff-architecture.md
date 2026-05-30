# 统一混合接力语音架构设计 (Unified Hybrid Handoff Architecture)

> **设计日期**: 2026-05-30  
> **面向对象**: 极客个人助理 Jarvis 语音管线  
> **核心痛点**: 解决在多任务切换（主窗口失焦、激活外部应用如 Notepad/Chrome 等）时，语音对话框丢失、假死卡在“聆听”状态但说话无法被识别，以及异步播放冲突等顽疾。

---

## 1. 架构演进背景与问题剖析

在设计具有双窗口（居中主界面 `main` + 右下角悬浮框 `assistant`）接力听写的 Tauri 应用时，会遇到浏览器底层（Chromium WebView2）和操作系统（Windows）的核心硬限制：

### A. 硬件锁抢占延迟 (Mic Hardware Contention)
* **现象**: 主窗口停止录音并打开助手窗口后，助手窗口经常报错 `"not-allowed"`（无麦克风权限）或直接卡死在“聆听”状态。
* **物理本质**: Chromium 的 `recognition.abort()` 或 `getUserMedia` 物理流释放是一个**异步过程**（耗时约 400ms~500ms）。如果切换窗口后没有预留充足的等待，新窗口会直接由于抢占硬件锁失败而被系统强制掐断数据输入。

### B. 浏览器后台麦克风安全机制 (Background ASR Suspension)
* **核心限制**: Chromium 安全白皮书规定：**如果一个 Webview 页面/窗口在操作系统中不持有活动聚焦状态（Active Focused State），即使其麦克风物理流已经开启，浏览器也绝对不允许其 SpeechRecognition (webkitSpeechRecognition) 运作！**
* **后果**: 当用户点击 Notepad 开始打字时，无论主窗口还是悬浮助手窗口都失去了 OS 焦点。此时任何后台的 ASR (听写识别) 都会被浏览器瞬间挂起，导致状态直接“呆滞”，说话无反应。

### C. 异步播放漏网冲突 (Async Playback Contention)
* **问题**: 唤醒 Jarvis 时，系统正异步从服务器下载 TTS 播报音频。若在下载中途切屏，旧窗口因为没检查状态而直接在后台强行播放出“我在的，主人”，导致与前台接力混乱。

---

## 2. 统一混合接力架构 (Unified Hybrid Handoff Architecture) 设计

为了突破上述硬件与沙箱安全防线，本系统重构为 **主窗口物理驱动 + 悬浮框轻量镜像 + 动态焦点重夺 + 异步校验** 的混合接力机制：

```
                   用户活动窗口 (Notepad/Chrome)
                                │
                                ▼ 失去 OS 焦点
┌──────────────────────────────────────────────────────────────────┐
│                      Tauri 宿主环境                               │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    主窗口 (Main Window)                     │  │
│  │                                                            │  │
│  │  1. 如果处于 Speaking / Streaming:                          │  │
│  │     后台持续合成并流畅播放 TTS (Chromium 不限制后台播放)        │  │
│  │     高频广播 voice-state-mirror 状态数据                     │  │
│  │  2. 如果处于 Listening (或 Speaking 完成移交):              │  │
│  │     物理释放麦克风 ──► 发射 assistant-start-listening ────┐ │  │
│  └───────────────────────────────────────────────────────────┼┘  │
│                                                              │   │
│  ┌───────────────────────────────────────────────────────────┼┘  │
│  │                  助手悬浮框 (Assistant Bubble)             │  │
│  │                                                           │  │
│  │  1. 接收到广播: 开启“视觉镜像模式”，显示波动图与字幕           │  │
│  │  2. 接收到 assistant-start-listening 或唤醒事件:             │  │
│  │     Reclaim Focus (夺回 OS 焦点) ──► 瞬间解除沙箱麦克风封锁 │  │
│  │     物理拉起 ASR，在前台完美识别用户说话！                    │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 核心子系统一：视觉镜像 (Visual Mirroring) 与 状态同步
* 当主窗口失去焦点时，若正在**思考生成（streaming）**或**语音播报（speaking）**中，**绝对不要强行切断对话**。
* 主窗口继续平稳地在后台播放语音并下载音频。同时主窗口会持续以微秒级向外广播 `"voice-state-mirror"` 状态事件。
* 浮动助手窗口醒来后，因为 AI 正在发声，它会自动进入 **“视觉镜像模式”**，自己保持静默（不占用麦克风），仅完美投影主窗口的声音波动图、实时转写和回答内容。

### 核心子系统二：动态 OS 焦点重夺 (OS-Level Focus Reclamation)
* 当 ASR 必须启动（例如 AI 在后台说完了，需要开始听写；或者用户在 Listening 时切屏）的极速微秒内：
  1. 主窗口物理切断麦克风，确保 100% 干净释放。
  2. 助手窗口通过 Tauri 接口向 Windows 操作系统发起 **强行夺回前台输入焦点的请求**：
     ```typescript
     await appWindow.show().catch(() => {});
     await appWindow.unminimize().catch(() => {});
     await appWindow.setAlwaysOnTop(true).catch(() => {});
     await appWindow.setFocus().catch(() => {}); // 夺焦黄金解！
     ```
  3. Chromium 沙箱检测到助手窗口重新成为 Active Window，**瞬间合理解锁麦克风封锁**，ASR 物理拉起，说话识别率 100%！

### 核心子系统三：异步严格校验防御 (Async Validation Protection)
* 在 ASR 和 TTS 的异步网络请求与解码阶段，添加严格的 `isActiveRef.current` 检查。如中途发生切屏，任何未完成的播报均会被瞬间擦除，绝不漏网。

---

## 3. 具体时序工作流

### 时序一：唤醒 Jarvis 播报中切屏
1. 用户在主界面触发唤醒词，`voiceConv.state` 进入 `speaking`（TTS 音频下载中）。
2. 用户点击 Notepad 开始打字，主窗口触发 `!focused`：
   * 检测到 `isConversationActive` 为 `true`，**不强行终止会话**。
   * 立刻显示右下角助手窗口。
   * 助手窗口发现 handoff 进来的状态是 `speaking`，**自动降级为“镜像模式”**，静静显示正处于播放状态并渲染声波。
   * 麦克风在这段期间处于物理关闭状态，无任何硬件冲突。
3. 主界面在后台下载 TTS 完毕，播放语音“我在的，主人”。
4. 语音播放完毕（触发 `onended`），主窗口将状态迁移至 `listening`。
5. **触发接力时机**：主窗口检测到当前非 Focus 状态，立刻终止主窗口 ASR，释放麦克风，等待 **`600ms`** 物理安全期后，派发 `"assistant-start-listening"`。
6. 助手窗口收到事件：
   * **瞬间夺取 OS 焦点** (`setFocus()`)。
   * 物理启动 ASR 开始倾听，识别率高达 100%。

### 时序二：听写状态中切屏
1. 对话处于 `listening`（听写中）。
2. 用户点击 Notepad，主窗口触发 `!focused`：
   * 检测到 `state === "listening"`。
   * 立刻执行 `voiceConv.stopConversation()`（物理释放麦克风）。
   * 延迟 **`600ms`** 后，启动助手窗口。
   * 助手窗口拉起，**瞬间夺取 OS 焦点** (`setFocus()`)，物理启动 ASR，前台开始无缝接力倾听。

---

## 4. 关键代码快照与最佳实践

### Tauri 窗口生命周期与置顶最优执行链
```typescript
// E:\code\github_project\Jarvis\frontend\src\App.tsx
// 必须严格遵守此执行序列：Show 优先 -> Sizing / Position 其次 -> 置顶 AlwaysOnTop 强加锁最后！
await assistant.show().catch(() => {});
await assistant.unminimize().catch(() => {});

const x = Math.max(workXLogical, workXLogical + workWidthLogical - ASSISTANT_WIDTH - MARGIN_RIGHT);
const y = Math.max(workYLogical, workYLogical + workHeightLogical - ASSISTANT_HEIGHT - MARGIN_BOTTOM);
await assistant.setSize(new LogicalSize(ASSISTANT_WIDTH, ASSISTANT_HEIGHT)).catch(() => {});
await assistant.setPosition(new LogicalPosition(x, y)).catch(() => {});

await assistant.setAlwaysOnTop(true).catch(() => {});
await assistant.setFocus().catch(() => {});
```

### WebSpeech 致命重启死循环阻断
```typescript
// E:\code\github_project\Jarvis\frontend\src\lib\webSpeechASR.ts
recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
  if (event.error === "no-speech" || event.error === "aborted") return;
  onError?.(event.error);

  // 致命错误（如 background-not-allowed / service-not-allowed / network）发生时
  // 必须强制擦除 active 标记并彻底 abort，断开 onend 处的无限重启死循环！
  if (event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "network") {
    active = false;
    clearSilenceTimer();
    try { recognition.abort(); } catch {}
    onEnd?.();
  }
};
```
