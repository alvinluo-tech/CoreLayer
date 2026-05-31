# 镜像缩放悬浮气泡形态设计与交互手册 (Single-Window Mirror-Shrink Walkthrough)

> **设计日期**: 2026-05-31  
> **面向对象**: 极客个人助理 Jarvis 语音交互层  
> **主要内容**: 详解单窗口物理变形（Morphing）模式下的界面响应、交互逻辑以及极客视效呈现。

---

## 1. Morph 视觉状态机转化模型

Jarvis 通过修改单一 `main` 窗口的操作系统边框和宽高，实现无缝的多态转换：

```
                    【 正常主窗口 (Normal State) 】
                             1200 x 800px
                   [有窗口边框 / 顶部 TitleBar / 正常排版]
                                    │
                       (用户切出页面，主窗口 Blur)
                                    ▼
                 会话活跃？(Speaking/Streaming/Listening)
                   ┌────────────────┴────────────────┐
                   ▼ 否                              ▼ 是
             [保持正常形态]                 【 镜像气泡模式 (Mirror Bubble) 】
                                                360 x 440px
                                      [无窗口边框 / AlwaysOnTop置顶]
                                      [仅渲染右下角透明 Jarvis HUD]
                                                     │
                                           (用户点击气泡，触发 Focus)
                                                     ▼
                                          【 展开还原常规全屏 】
                                              (恢复 1200x800px)
```

---

## 2. Morph 模式下的视觉层次 (JarvisVoiceOverlay)

当主窗口收缩为 `360x440px` 并移动至屏幕右下角后，`App.tsx` 在 React 层只保留了 `<JarvisVoiceOverlay layoutMode="bottom-right" />`，其余大体积界面完全不进行装载。

### A. 精美毛玻璃与动态背景色 (Glassmorphism & Glow Colors)
根据不同的语音状态，悬浮气泡具有高辨识度的科幻动态渐变呼吸灯背景：
- **🎤 LISTENING (听写中)**：
  - 青色柔和发光 (`rgba(6, 182, 212, 0.8)`)。
  - 科幻粒子雷达网底纹背景 (`bg-[#091E2A]/95`)。
- **🔄 TRANSCRIBING (转写中)**：
  - 蓝色粒子脉冲 (`rgba(59, 130, 246, 0.8)`)。
  - 深邃星空背景 (`bg-[#0A1A30]/95`)。
- **⏳ DEEP THINKING (生成中)**：
  - 琥珀金色螺旋波纹 (`rgba(245, 158, 11, 0.8)`)。
  - 暗金色背景 (`bg-[#251A0A]/95`)。
- **🔊 SPEAKING (播报中)**：
  - 紫罗兰幻彩呼吸渐变 (`rgba(139, 92, 246, 0.8)`)。
  - 深紫色粒子背景 (`bg-[#1D0E2E]/95`)。

### B. 动态波动波形 (Sine Wave Visualizer)
利用 Canvas 和 `requestAnimationFrame` 在气泡正中央渲染多层流体正弦波浪：
- **主动音量分析**: 监听 Tauri Rust 后台物理麦克风和合成 TTS 播放发出的 `voice-volume-tick` 高频音响频率。
- **动态幅频转换**: 音响大时，多条波浪线抖动剧烈，相位流动加速（流速系数可达 1.3x）；静音时，呈优雅的微弱基准流线，体验极其极客。

---

## 3. 全局高频交互细则

| 动作 | 触发源 | 状态机变化 | 屏幕视觉响应 |
| :--- | :--- | :--- | :--- |
| **失焦收缩** | 鼠标点击外部 Notepad/VS Code 等 | `isMirrorMode` 设为 `true` | 若非已经在镜像模式下，`main` 窗口瞬间卸除外部边框，收缩并滑入屏幕右下角，变为透明浮窗。 |
| **程序化聚焦** | 会话流程进入 `listening` (ASR 开启) | 标记 `isProgrammaticFocusRef` | 气泡强行夺取系统焦点以解除 Chromium 的背景安全录音锁，忽略 `Focus` 事件，继续保持右下角胶囊展示。 |
| **任务栏最小化与展开** | 鼠标点击 Windows 任务栏的 Jarvis 图标 | `isMirrorMode` 保持，触发 OS minimize / focus | 首次点击使活跃胶囊完美最小化收缩（屏蔽失焦自动重入），再次点击使胶囊 unminimize 跃迁并聚焦，瞬间切回复原 1200x800 主屏幕。 |
| **胶囊一键展开 (NEW)** | 点击胶囊右上角的 `Maximize` (最大化) 按钮 | `isMirrorMode` 设为 `false` | 胶囊调用 `onRestore` 瞬间展开复原至原始 1200x800 居中位置，体验平滑且百分百可靠，无需寻找任务栏图标。 |
| **打断 (Interrupt)** | 点击气泡上的 `INTERRUPT` 按钮 | 停止当前 TTS 合成与 ASR 倾听 | 气泡切换回常规 Normal 模式并自动展开，方便用户以打字文本方式快速继续会话。 |
| **打开设置** | 点击气泡右上角的 `Settings` 按钮 | 离开 Morph 模式，进入配置页 | 气泡瞬间自动恢复全屏 Normal 模式，并自动切入 Jarvis 的 “模型与 API 配置中心” 页面。 |
| **自然/手动关闭退出** | 会话进入 `idle` 状态，或点击右上角 `X` 叉掉 | 退出气泡，还原 Normal，根据前后台状态差异化处理 | **若从后台唤醒**：窗口静默复原并最小化至任务栏归宿；**若在前台唤醒**：窗口仅隐藏悬浮框，主屏幕平稳保持在前台打开状态，绝不会被意外最小化。 |
