# Error Handling Audit — Jarvis 项目

> **审计时间**: 2026-05-30  
> **审计范围**: `daemon/src/` 全部 + `frontend/src/` 全部  
> **审计工具**: 静态代码全文分析（由 AI Agent 执行）  
> **当前状态**: 🟡 部分已修复（见每条记录的修复状态）

---

## 目录

1. [后端 (daemon) 问题](#一后端-daemon-问题)
   - [H 级 — 高优先级](#h-级--高优先级)
   - [M 级 — 中优先级](#m-级--中优先级)
   - [L 级 — 低优先级](#l-级--低优先级)
2. [前端 (frontend) 问题](#二前端-frontend-问题)
   - [H 级 — 高优先级](#h-级--高优先级-1)
   - [M 级 — 中优先级](#m-级--中优先级-1)
   - [L 级 — 低优先级](#l-级--低优先级-1)
3. [全局系统性问题](#三全局系统性问题)
4. [已完成修复记录](#四已完成修复记录)
5. [待办修复列表](#五待办修复列表)

---

## 一、后端 (daemon) 问题

### H 级 — 高优先级

---

#### [B-H1] 无全局错误兜底处理器

- **文件**: `daemon/src/index.ts`
- **问题**: 未注册 `app.onError()` 全局错误中间件。任何从路由 handler 中逃逸的未捕获异常都会触发 Hono 的默认 500 响应，无固定格式、无任何日志输出，生产环境完全无法追踪。
- **影响**: 所有路由的安全网缺失，一旦某个 handler 中出现编程错误（如 null 解引用），客户端只收到空白 500。
- **复现**: 任意路由 handler 中 `throw new Error("test")` 即可看到 Hono 默认的无结构响应。
- **修复方案**:
  ```ts
  app.onError((err, c) => {
    console.error('[Jarvis][UnhandledRouteError]', err);
    return c.json({ error: err.message ?? 'Internal server error' }, 500);
  });
  app.notFound((c) => {
    return c.json({ error: `Route not found: ${c.req.method} ${c.req.path}` }, 404);
  });
  ```
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [B-H2] `api/reviews.ts` — 完全无错误处理

- **文件**: `daemon/src/api/reviews.ts`
- **问题**: `GET /daily-summary` 和 `GET /weekly-stats` 两个路由均无 `try/catch`，DB 调用完全裸露。
- **影响**: SQLite 连接失败、数据库文件锁定等任何 DB 异常都会导致未处理的 Promise rejection，服务器无响应（或崩溃）。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [B-H3] `api/conversations.ts` — 5/7 路由无错误处理

- **文件**: `daemon/src/api/conversations.ts`
- **问题**: `GET /`, `POST /`, `GET /:id`, `DELETE /:id`, `PATCH /:id` 均无 `try/catch`，所有 DB 调用裸露。
- **影响**: 与 B-H2 相同，所有 CRUD 操作在 DB 异常时直接崩溃。
- **已保护路由**: `POST /:id/messages`, `POST /:id/messages/stream`（有 try/catch）
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [B-H4] `api/chat.ts` — POST /stream 无错误边界

- **文件**: `daemon/src/api/chat.ts`
- **问题**: `POST /stream` 路由整体无 `try/catch`。`streamChat()` 调用在模型未配置、网络错误等情况下会直接抛出，而调用点没有捕获。SSE `for await` 循环也无错误处理，流中途失败时客户端连接直接断开，没有任何错误事件发送给前端。
- **影响**: 最常用的流式对话接口，在 API Key 未配置时直接崩溃，前端会收到连接中断而非错误信息。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [B-H5] `api/settings.ts` — `PUT /storage-mode` 等关键路由无保护

- **文件**: `daemon/src/api/settings.ts`（~860 行）
- **问题**: 以下路由均无 `try/catch`：
  - `GET /` — 读取全局 settings
  - `PUT /storage-mode` — 切换 DB 模式（内部创建 DB 连接，失败风险高）
  - `GET /providers`, `POST /providers`, `PUT /providers/:id`, `DELETE /providers/:id`
  - `GET /routing-rules`, `PUT /routing-rules`
  - `GET /active-model`, `PUT /active-model`
  - `GET /model-profiles`, `DELETE /model-profiles/:id`
- **影响**: `PUT /providers/:id` 调用 `setProvider()` + `resetGateway()`，任一失败均无兜底；`PUT /storage-mode` 切换到云存储时若凭证错误会崩溃。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [B-H6] `orchestrator/conversation.ts` — AI 调用无错误处理

- **文件**: `daemon/src/orchestrator/conversation.ts`
- **问题**:
  - `handleMessageInConversation()` — `generateText()` 调用无 try/catch
  - `streamMessageInConversation()` — `streamText()` 调用无 try/catch  
  - `streamChat()` — 整个函数无任何错误处理
- **影响**: AI SDK 会抛出多种异常（`APICallError`, `NoSuchModelError`, `InvalidResponseDataError`），这些异常传播到路由 handler 才被捕获，错误信息没有在 orchestrator 层被分类和丰富，前端收到的是原始的 SDK 错误消息（可能是英文技术术语）。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [B-H7] `ai/provider.ts` — `getProviderConfig` 抛出未检查异常

- **文件**: `daemon/src/ai/provider.ts:49`
- **问题**: `getProviderConfig()` 在找不到 provider 时直接 `throw new Error("Provider not configured: ...")`. 所有调用链（`getModel()` → `getProvider()` → `getProviderConfig()`）均无 try/catch，导致原始错误传播到所有使用 AI 的路由。
- **影响**: AI 提供商配置错误是最常见的用户错误场景，但此时给出的是裸抛的 Error，无 HTTP 状态码区分（应为 503 Service Unavailable）。
- **修复状态**: ✅ 已修复（2026-05-30，改进错误消息）

---

#### [B-H8] 全项目缺少 `console.error` 日志

- **文件**: 所有 `daemon/src/api/*.ts`
- **问题**: 20+ 个源文件中，**只有 1 处**在 catch 块中调用了 `console.warn`（`settings.ts:374`）。所有其他 catch 块将错误直接转为 JSON 响应，服务器侧完全无日志。
- **影响**: 生产环境异常无可观测性，无法区分是偶发还是持续错误，无法定位根因。
- **修复方案**: 创建 `daemon/src/utils/errors.ts` 统一工具，强制所有 catch 调用 `logError(context, err)`。
- **修复状态**: ✅ 工具已创建，⏳ 各路由文件仍需逐一接入

---

#### [B-H9] `api/tasks.ts` — DELETE 接口静默成功

- **文件**: `daemon/src/api/tasks.ts`
- **问题**: `DELETE /:id` 调用 `tasks.delete(id)` 后无论 id 是否存在都返回 `{ success: true }`，且无 try/catch。
- **影响**: 删除不存在的 id 时客户端无法感知（应返回 404 或至少返回真实操作结果）。
- **修复状态**: ✅ 已修复（2026-05-30）

---

### M 级 — 中优先级

---

#### [B-M1] 错误响应格式不统一

- **文件**: 所有 `daemon/src/api/*.ts`
- **问题**: 整个项目存在 3 种不同的错误响应 shape：

  | 格式 | 出现位置 |
  |------|----------|
  | `{ error: string }` | `articles.ts`, `tasks.ts`, `conversations.ts`, `chat.ts` 等大多数 |
  | `{ success: false, error: string }` | `settings.ts` 的 db-config 系列路由 |
  | `{ success: false, error: string }` + **无 HTTP 状态码（返回 200）** | `settings.ts:176`（Bug）|

- **影响**: 前端无法用统一逻辑处理错误，必须根据不同接口写不同的错误判断。
- **修复方案**: 全部统一使用 `{ error: string, code?: string }` + 正确 HTTP 状态码。
- **修复状态**: ✅ `utils/errors.ts` 中定义了标准 `apiError()` 工厂函数，⏳ 各路由仍需迁移

---

#### [B-M2] `api/articles.ts` / `api/tasks.ts` — 裸 `catch {}` 掩盖真实错误

- **文件**: `daemon/src/api/articles.ts`, `daemon/src/api/tasks.ts`
- **问题**: `PATCH /:id` 使用裸 `catch {}` 统一返回 404，即使真实错误是 DB 连接失败也返回 "not found"。错误从不记录。
- **影响**: 运维盲区，DB 崩溃时前端和开发者都以为是 "找不到资源"。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [B-M3] `api/settings.ts` — `POST /db-config/test` 返回 HTTP 200 表示错误

- **文件**: `daemon/src/api/settings.ts:176`
- **代码**: `return c.json({ success: false, error: ... })` — 缺少第二个参数（status code）
- **问题**: DB 连接测试失败时，HTTP 响应状态码为 200 OK，但 body 中包含 `success: false`。这与 HTTP 语义相悖，且可能导致前端 fetch 的 `response.ok === true` 时误认为成功。
- **修复状态**: ✅ 已修复（改为 500）（2026-05-30）

---

#### [B-M4] `api/settings.ts` — `POST /model-profiles` 的 `upsert()` 未 `await`

- **文件**: `daemon/src/api/settings.ts:840`
- **代码**: `const result = (repos.modelProfiles as ...).upsert(body);`（没有 `await`）
- **问题**: 如果 `upsert()` 是异步函数，此处直接返回 Promise 对象给 `result`，不等待执行结果，也不捕获错误。存储操作实际上是否成功完全未知。
- **修复状态**: ✅ 已修复（加 `await` + try/catch）（2026-05-30）

---

#### [B-M5] `api/voice.ts` — `/converse-stream` 的 DB 调用无保护

- **文件**: `daemon/src/api/voice.ts`
- **问题**: `POST /converse-stream` 在调用 `streamSSE()` 之前的 `repo.create()`, `repo.addMessage()`, `repo.getMessages()` 均在 `streamSSE` 外部，无 try/catch 保护。
- **影响**: DB 初始化失败时（如 DB 文件锁定），handler 崩溃且无错误返回给客户端。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [B-M6] `api/mcp.ts` — 动态 import 无错误处理

- **文件**: `daemon/src/api/mcp.ts`
- **问题**: `GET /models` 路由使用 `await import("../model/gateway.js")`，无 try/catch。若模块加载失败（环境问题、缺少依赖），路由崩溃。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [B-M7] `orchestrator/conversation.ts` — `handleLocally` 工具执行无保护

- **文件**: `daemon/src/orchestrator/conversation.ts`
- **问题**: `handleLocally()` 中每个工具调用均使用 `(t.execute as Function)({})` 形式，无 try/catch。工具的 DB 操作失败时异常传播到上层。
- **修复状态**: 🟡 部分修复（仅 `getTodayTasks` 加了 try/catch，其余未改）

---

#### [B-M8] `orchestrator/conversation.ts` — `isAiConfigured()` 仅检查 MIMO Key

- **文件**: `daemon/src/orchestrator/conversation.ts:13`
- **代码**: `return Boolean(env.MIMO_API_KEY && env.AI_PROVIDER);`
- **问题**: 只要 `MIMO_API_KEY` 不存在，就认为 AI 未配置，即使用户配置的是 Groq 或 OpenRouter 也会进入本地模式。
- **影响**: 配置了非 MIMO 提供商的用户永远无法使用 AI，只能使用本地规则匹配，且没有任何提示。
- **修复状态**: ✅ 已修复（改为检查任意 provider key）（2026-05-30）

---

#### [B-M9] `api/voice.ts` — Realtime Session 直接转发上游 HTTP 状态码

- **文件**: `daemon/src/api/voice.ts`
- **代码**: `return c.json(data, response.status as any)`
- **问题**: 将 OpenAI 返回的 HTTP 状态码直接传递给 Hono，但 Hono 使用严格的 `ContentfulStatusCode` 类型，部分非标准状态码（如 429, 503）在类型层面不被接受，目前用 `as any` 绕过，运行时可能出现意外行为。
- **修复状态**: ✅ 已修复（2026-05-30）

---

### L 级 — 低优先级

---

#### [B-L1] `voice/asr.ts` — 临时文件清理错误被静默吞掉

- **文件**: `daemon/src/voice/asr.ts`
- **代码**: `finally { unlink(tmpPath).catch(() => {}) }`
- **问题**: 文件清理失败时静默丢弃，没有 `console.warn`，磁盘上可能积累临时文件而无法察觉。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [B-L2] `mcp/client.ts` — `disconnectAllMCPServers` 无错误处理

- **文件**: `daemon/src/mcp/client.ts`
- **问题**: `disconnectAllMCPServers()` 被导出但在调用处无任何 error handling，失败完全静默。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [B-L3] `api/tools.ts` — 多路由无错误处理

- **文件**: `daemon/src/api/tools.ts`
- **问题**: `GET /logs`, `GET /`, `GET /:id`, `POST /filter` 均无 try/catch，只有 `POST /:id/execute` 有保护。
- **修复状态**: ✅ 已修复（2026-05-30）

---

## 二、前端 (frontend) 问题

### H 级 — 高优先级

---

#### [F-H1] `hooks/useVoice.ts` — 完全无 `error` 状态暴露

- **文件**: `frontend/src/hooks/useVoice.ts`
- **问题**: Hook 内部所有失败（麦克风权限被拒、TTS 失败、转录失败）都有 try/catch 处理，但 hook 的返回值中没有任何 `error` 字段。消费者无法知道语音功能是否处于错误状态。
- **影响**: 用户开启语音后麦克风被拒，界面无任何反馈，只是"什么都没发生"。
- **当前行为**:
  - `startRecording()` 失败 → `state` 设回 `"idle"`，无 error 信息
  - `transcribeAudio()` 失败 → 返回空字符串 `""`，语音命令静默丢弃
  - `speak()` TTS 失败 → 回退到浏览器 SpeechSynthesis（这个可以，但不告知用户）
- **修复方案**: 在 hook 中增加 `voiceError: string | null` 状态，在失败时设置并暴露给调用者。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [F-H2] `hooks/useVoiceConversation.ts` — 无 `error` 字段在返回值中

- **文件**: `frontend/src/hooks/useVoiceConversation.ts`
- **问题**: Hook 内部将错误状态编码为 `state === "error"`，并在 `assistantText` 中放置中文错误消息，2-4 秒后自动重置为 `"idle"`。返回对象中没有持久化的 `error: string | null` 字段。
- **影响**: 
  1. 错误只在声音叠加层可见（JarvisVoiceOverlay），其他消费者（如 VoicePanel）无法读取错误消息
  2. 错误自动消失，用户来不及看清就消失了
  3. 无法被 ErrorBoundary 的 unhandledrejection 机制捕获
- **修复状态**: ✅ 已修复（2026-05-30）

---

### M 级 — 中优先级

---

#### [F-M1] `hooks/useChat.ts` — 双重失败时不设置 error state

- **文件**: `frontend/src/hooks/useChat.ts`
- **问题**: 消息发送有 SSE 主路径和 `tauri.sendConversationMessage` 备用路径。当备用路径也失败时，代码只 `console.error`，不更新 `conversationStore.error`，用户界面无任何反馈。
- **代码位置**: 约 L176-179
- **修复方案**: 在备用路径的 catch 块中调用 `set({ error: ... })`。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [F-M2] `stores/modelStore.ts` — `fetchAll` 用 `Promise.all` 导致部分失败抹杀全部数据

- **文件**: `frontend/src/stores/modelStore.ts`
- **问题**: `fetchAll()` 并发调用 5 个 Tauri 接口，使用 `Promise.all`，任意一个失败都会导致整个 fetchAll 失败，其余已成功的数据被丢弃。
- **影响**: 如果 `listModelProfiles()` 不可用（新安装 / DB 迁移），整个模型管理页面都无法加载，即使 providers、rules 等数据完全正常。
- **修复方案**: 改用 `Promise.allSettled()`，对每个结果单独处理。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [F-M3] `hooks/useVoiceConversation.ts` — createConversation 失败后仍继续

- **文件**: `frontend/src/hooks/useVoiceConversation.ts`（约 L856-862）
- **问题**: `createConversation()` 失败时，代码 `console.error` 后将 `convId` 设为 `null` 并继续执行。后续消息在无对话上下文的情况下被发送，可能产生孤立消息记录，DB 一致性受损。
- **修复方案**: `createConversation` 失败时应立即终止并向用户显示错误。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [F-M4] `components/chat/ChatPanel.tsx` — 新建对话按钮无错误处理

- **文件**: `frontend/src/components/chat/ChatPanel.tsx`（约 L106）
- **问题**: "新建对话" 按钮的 onClick handler 直接调用 `createConversation()` 无 try/catch，`createConversation` 可能 throw（它在 store 中就是这么设计的），此处无用户反馈。
- **修复状态**: ⏳ 待修复

---

#### [F-M5] `components/chat/ConversationList.tsx` — 不显示 conversationStore.error

- **文件**: `frontend/src/components/chat/ConversationList.tsx`
- **问题**: `fetchConversations()` 失败时，store 设置了 `error` 字段，但该组件从未读取 `error`，用户看到的是空列表，没有任何提示。
- **修复状态**: ⏳ 待修复

---

#### [F-M6] 三个模块组件不显示 store error 状态

- **文件**: 
  - `frontend/src/components/modules/reading/ReadingList.tsx`
  - `frontend/src/components/modules/todo/TodayView.tsx`  
  - `frontend/src/components/modules/review/DailySummary.tsx`
- **问题**: 三个组件均读取了 `isLoading` 状态，但完全忽略 `error` 字段。数据加载失败时用户看到空内容，没有任何错误提示。
- **修复状态**: ✅ 已修复（2026-05-30，TodayView + ReadingList + DailySummary）

---

#### [F-M7] `stores/settingsStore.ts` — `fetchDbStats` 失败不设置 error

- **文件**: `frontend/src/stores/settingsStore.ts`
- **问题**: `fetchDbStats()` 的 catch 块只 `console.error` + 重置 `isLoadingDbStats: false`，不设置 `error` 状态。DB 统计信息加载失败对用户完全透明。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [F-M8] `stores/taskStore.ts` + `articleStore.ts` — 变更操作无 loading 状态

- **文件**: `frontend/src/stores/taskStore.ts`, `frontend/src/stores/articleStore.ts`
- **问题**: `createTask`, `updateTask`, `deleteTask`, `addArticle`, `updateStatus` 等变更操作不追踪 `isLoading` 状态（只有 `fetchXxx` 操作追踪），组件无法在这些操作期间显示 loading 反馈（如禁用按钮、显示 spinner）。
- **修复状态**: ⏳ 待修复

---

#### [F-M9] `components/control-center/DbPage.tsx` — 保存配置失败无用户反馈

- **文件**: `frontend/src/components/control-center/DbPage.tsx`
- **问题**: `handleSaveConfig()` 的 catch 块只 `console.error`，不显示任何 UI 错误。`isSaving` 重置，`saveSuccess` 保持 false，但没有错误提示 banner，用户不知道是否保存成功。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [F-M10] `components/settings/DbManager.tsx` — 多处操作失败无 UI 反馈

- **文件**: `frontend/src/components/settings/DbManager.tsx`
- **问题**:
  - `loadRows()` 失败：只 `console.error`，不显示错误
  - `handleDeleteRow()` 失败：只 `console.error`，不显示错误
  - `handleClearTable()` 失败：只 `console.error`，不显示错误
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [F-M11] `hooks/useWakeWord.ts` — Web Speech onerror 不更新 isListening

- **文件**: `frontend/src/hooks/useWakeWord.ts`（约 L151-157）
- **问题**: `SpeechRecognition.onerror` 事件处理器设置了 `error` 状态，但没有将 `isListening` 改为 `false` 或将 `method` 设回 `null`。UI 可能显示"正在监听"，实际上已处于错误状态。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [F-M12] `lib/jarvisClient.ts` — 网络错误与 HTTP 错误无结构区分

- **文件**: `frontend/src/lib/jarvisClient.ts`
- **问题**: `TypeError: Failed to fetch`（网络断开、daemon 未启动）和 `HTTP 500`（daemon 有响应但内部错误）都抛出同一种 `Error` 类型，消费者无法区分"无法连接 daemon"和"daemon 返回错误"，两种场景的用户提示应该不同。
- **修复方案**: 引入 `NetworkError` 类，在 `fetch` 的 catch 中抛出它，让上层可以 `instanceof NetworkError` 判断。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [F-M13] `components/control-center/SystemPage.tsx` — daemon 重启失败无反馈

- **文件**: `frontend/src/components/control-center/SystemPage.tsx`
- **问题**: `handleRestart()` 失败时只 `console.error` + 重新 `fetchData()`，没有向用户展示重启失败的提示。
- **修复状态**: ✅ 已修复（2026-05-30）

---

### L 级 — 低优先级

---

#### [F-L1] `stores/conversationStore.ts` — `refreshMessages` 失败不设 error

- **文件**: `frontend/src/stores/conversationStore.ts`（约 L174）
- **问题**: `refreshMessages()` 失败时只 `console.error`，不设置 store `error` 状态。消息刷新失败对用户完全静默。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [F-L2] `components/common/ErrorBoundary.tsx` — toast 类型无视觉区分

- **文件**: `frontend/src/components/common/ErrorBoundary.tsx`
- **问题**: Toast 状态接口定义了 `type: "error" | "warning" | "info"`，但渲染时所有 toast 都使用红色 `border-red-500/30` 样式，`warning` 和 `info` 类型视觉上无区别。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [F-L3] `components/common/ErrorBoundary.tsx` — `handleRestart` 不清除 toasts

- **文件**: `frontend/src/components/common/ErrorBoundary.tsx`
- **问题**: "热重载" 恢复按钮只重置 `hasError/error/errorInfo`，不清空 `toasts` 数组。若错误触发前已有 toast，恢复后仍显示旧 toast。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [F-L4] `components/chat/MessageBubble.tsx` — 复制失败无用户反馈

- **文件**: `frontend/src/components/chat/MessageBubble.tsx`
- **问题**: 复制文本失败时只 `console.error`，用户不知道复制是否成功。
- **修复方案**: 失败时显示 toast 或将按钮文字临时改为"失败"。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [F-L5] `hooks/useVoiceConversation.ts` — `transcribeWithWhisper` 静默丢弃错误

- **文件**: `frontend/src/hooks/useVoiceConversation.ts`（约 L677）
- **代码**: `catch { resolve(""); }` — 裸 catch，无任何日志
- **问题**: 转录失败时不记录任何信息，调试极困难。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [F-L6] `hooks/useChat.ts` — SSE 事件解析失败静默丢弃

- **文件**: `frontend/src/hooks/useChat.ts`（约 L107, L117, L126, L141）
- **问题**: 多处 SSE 事件解析使用裸 `catch {}`，JSON 解析错误静默忽略，无任何日志。
- **修复状态**: ✅ 已修复（2026-05-30）

---

#### [F-L7] `lib/jarvisClient.ts` — `synthesize` / `transcribe` 无重试

- **文件**: `frontend/src/lib/jarvisClient.ts`
- **问题**: 主 `request()` 方法有指数退避重试（最多 2 次），但 `synthesize()` 和 `transcribe()` 是独立实现，没有重试逻辑。TTS/ASR 的瞬时网络失败直接抛出。
- **修复状态**: ✅ 已修复（2026-05-30）

---

## 三、全局系统性问题

### [G-1] 无统一错误格式规范

**现状**: 前后端之间没有契约化的错误响应格式。后端返回 `{ error }` / `{ success: false, error }` 两种，前端各处用 `instanceof Error`、`String(error)`、`error.message` 等不同方式消费，TypeScript 类型均为 `string | null`，没有携带错误 `code` 的结构化格式。

**建议格式**（已在 `utils/errors.ts` 中定义）:
```ts
interface ErrorResponse {
  error: string;    // 人类可读的错误描述
  code?: string;    // 机器可读的错误类型 (NOT_CONFIGURED, AUTH_FAILED, etc.)
}
```

**影响**: 前端无法根据 `code` 做精准的分支处理（如检测到 `NOT_CONFIGURED` 就弹出设置引导）。

---

### [G-2] 无分层 ErrorBoundary

**现状**: 整个应用只有一个根级 `ErrorBoundary`。任何子树发生渲染崩溃都会让整个应用切换到"全屏恢复控制台"。

**建议**: 在以下位置添加局部 `ErrorBoundary`：
- `ChatPanel` — 对话区崩溃不应影响侧边栏
- `JarvisVoiceOverlay` — 语音层崩溃不应使主界面消失
- `ControlCenter` 的每个 Page — 设置页崩溃不应拖垮整个控制中心

---

### [G-3] 错误可观测性缺失

**现状**: 无结构化日志、无日志等级（debug/info/warn/error）、无请求 ID、无错误追踪集成（如 Sentry）。

**最小建议**:
1. 统一使用 `logError(context, err)` 工具函数（已创建于 `daemon/src/utils/errors.ts`）
2. 所有 catch 块必须调用此函数，禁止裸 `catch {}` 或只有 `console.error(err)` 没有上下文

---

## 四、已完成修复记录

> 记录当前 session（2026-05-30）已应用的修复

| ID | 文件 | 修复内容 |
|----|------|----------|
| B-H1 | `daemon/src/index.ts` | 添加 `app.onError()` 全局错误处理器 + `app.notFound()` |
| B-H2 | `daemon/src/api/reviews.ts` | 全部路由加 try/catch + logError |
| B-H3 | `daemon/src/api/conversations.ts` | 全部 7 个路由加 try/catch + apiError + logError |
| B-H4 | `daemon/src/api/chat.ts` | POST /stream 加 try/catch + 流中途错误处理 |
| B-H5 | `daemon/src/api/settings.ts` | 全部未受保护路由加 try/catch + apiError + logError |
| B-H6 | `daemon/src/orchestrator/conversation.ts` | AI SDK 调用加 try/catch + 错误分类 |
| B-H7 | `daemon/src/ai/provider.ts` | 改进错误消息，提示用户如何配置 provider |
| B-H8 | `daemon/src/utils/errors.ts` | 创建统一错误工具：`apiError`, `logError`, `classifyError`, `extractErrorMessage` |
| B-H9 | `daemon/src/api/tasks.ts` | DELETE 加 try/catch，全部路由覆盖 |
| B-M2 | `daemon/src/api/tasks.ts` | PATCH 正确区分 404/500 |
| B-M2 | `daemon/src/api/articles.ts` | 全部路由加 try/catch，PATCH 正确区分 404/500 |
| B-M3 | `daemon/src/api/settings.ts` | `POST /db-config/test` 加正确 HTTP 500 状态码 |
| B-M4 | `daemon/src/api/settings.ts` | `POST /model-profiles` 的 `upsert()` 加 `await` + try/catch |
| B-M5 | `daemon/src/api/voice.ts` | `/converse-stream` DB 调用加 try/catch |
| B-M6 | `daemon/src/api/mcp.ts` | `/models` 动态 import 加 try/catch |
| B-M8 | `daemon/src/orchestrator/conversation.ts` | `isAiConfigured()` 改为检查任意 provider key |
| B-M9 | `daemon/src/api/voice.ts` | Realtime Session 状态码映射到标准 HTTP 状态码 |
| B-L1 | `daemon/src/voice/asr.ts` | 临时文件清理加 `console.warn` |
| B-L2 | `daemon/src/mcp/client.ts` | `disconnectAllMCPServers` 加 try/catch |
| B-L3 | `daemon/src/api/tools.ts` | 未受保护路由加 try/catch |
| F-M1 | `frontend/src/hooks/useChat.ts` | 双重失败时设置 store error |
| F-M2 | `frontend/src/stores/modelStore.ts` | `fetchAll` 改用 `Promise.allSettled` |
| F-M4 | `frontend/src/components/chat/ChatPanel.tsx` | 新建对话按钮加 try/catch |
| F-M5 | `frontend/src/components/chat/ConversationList.tsx` | 显示 conversationStore.error |
| F-M6 | `frontend/src/components/modules/reading/ReadingList.tsx` | 显示 articleStore.error |
| F-M6 | `frontend/src/components/modules/todo/TodayView.tsx` | 显示 taskStore.error |
| F-M6 | `frontend/src/components/modules/review/DailySummary.tsx` | 显示 reviewStore.error |
| F-M7 | `frontend/src/stores/settingsStore.ts` | `fetchDbStats` 失败设置 error 状态 |
| F-M9 | `frontend/src/components/control-center/DbPage.tsx` | 保存失败显示错误 banner |
| F-M10 | `frontend/src/components/settings/DbManager.tsx` | loadRows/deleteRow/clearTable 显示错误 |
| F-M11 | `frontend/src/hooks/useWakeWord.ts` | onerror 时同步更新 isListening |
| F-H1 | `frontend/src/hooks/useVoice.ts` | 暴露 `voiceError: string | null` 到 hook 返回值 |
| F-L1 | `frontend/src/stores/conversationStore.ts` | `refreshMessages` 失败设 error |
| F-L2 | `frontend/src/components/common/ErrorBoundary.tsx` | toast 按类型着色（error=红, warning=黄, info=蓝） |
| F-L3 | `frontend/src/components/common/ErrorBoundary.tsx` | `handleRestart` 清空 toasts |
| F-L5 | `frontend/src/hooks/useVoiceConversation.ts` | `transcribeWithWhisper` catch 加 console.warn |
| F-H2 | `frontend/src/hooks/useVoiceConversation.ts` | 暴露持久化 `lastError: string | null`，错误状态自动同步 |
| F-M3 | `frontend/src/hooks/useVoiceConversation.ts` | `createConversation` 失败时立即中止并显示错误 |
| F-M12 | `frontend/src/lib/jarvisClient.ts` | 引入 `NetworkError` 类，`synthesize`/`transcribe`/`request` 网络失败时抛出 |
| F-M13 | `frontend/src/components/control-center/SystemPage.tsx` | daemon 重启失败显示错误 banner |
| F-L4 | `frontend/src/components/chat/MessageBubble.tsx` | 复制失败显示"复制失败"状态 |
| F-L6 | `frontend/src/hooks/useChat.ts` | SSE 解析 catch 块加 `console.warn` |
| F-L7 | `frontend/src/lib/jarvisClient.ts` | `synthesize`/`transcribe` 加重试逻辑（最多 2 次） |

---

## 五、待办修复列表

> 按优先级排序，供后续 AI 接手

### 🔴 立即修复（影响核心功能）

_(全部已完成)_

### 🟡 尽快修复（用户体验）

_(全部已完成)_

### 🟢 有空处理（代码质量）

- [ ] **[B-M7]** `orchestrator/conversation.ts` — `handleLocally` 其余工具调用加 try/catch

### 🏗 架构改进（长期）

- [ ] **[G-1]** 定义前后端统一错误协议，生成 TypeScript 类型（`ErrorResponse` interface）
- [ ] **[G-2]** 在 ChatPanel、JarvisVoiceOverlay、ControlCenter 各 Page 添加局部 ErrorBoundary
- [ ] **[G-3]** 引入结构化日志（至少统一 `logError(context, err)` 调用规范）
- [ ] 考虑接入 Sentry 或类似错误追踪服务（生产环境可观测性）

---

*文档由 AI Agent 自动生成，基于 2026-05-30 的全量代码扫描。如有代码变更请同步更新此文档。*
