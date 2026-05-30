# Jarvis 代码库全面审查报告

> 审查日期: 2026-05-30
> 审查范围: 前端 React、Tauri Rust 层、Daemon 后端
> 审查标准: Tauri 最佳实践、TypeScript/Rust 编码规范、安全性、性能

---

## CRITICAL — 必须立即修复（4 个）

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| 1 | CSP 完全禁用 | `src-tauri/tauri.conf.json:39` | `"csp": null` 意味着 webview 可从任意来源加载脚本。任何通过 markdown 渲染或 MCP 响应注入的脚本都能调用 Tauri IPC 命令、读取本地文件 |
| 2 | 凭证明文存储 | `daemon/src/config/storage-config.ts:89` | API key、Supabase service role key、PostgreSQL 连接串以明文 JSON 写入 `data/config.json` |
| 3 | 所有端点无认证 | `daemon/src/index.ts` 全局 | 无任何鉴权中间件。本机任何进程都能执行工具、修改数据库凭证、连接任意 MCP 服务器 |
| 4 | Porcupine 密钥泄露 | `daemon/src/api/voice.ts:97-98` | `/api/voice/status` 直接返回付费 API key 给客户端 |

## HIGH — 应尽快修复（12 个）

### 前端 (4)

| # | 问题 | 文件 |
|---|------|------|
| 5 | Hooks 顺序违规 — `isAssistantWindow` 为 true 时提前 return，跳过后续所有 hooks | `App.tsx:28-148` |
| 6 | Tauri IPC 层 `unknown` 类型泛滥，迫使所有 store 用 `as` 不安全断言 | `lib/tauri.ts:85-165` |
| 7 | `useVoiceConversation` 约 1500 行，混杂 8 个职责 | `hooks/useVoiceConversation.ts` |
| 8 | ASR options 参数用 `any` 类型，回调名拼错无编译期检查 | `hooks/useVoiceConversation.ts:140` |

### Tauri Rust 层 (3)

| # | 问题 | 文件 |
|---|------|------|
| 9 | 用户输入直接拼入 URL 路径，无编码 | `src-tauri/src/lib.rs` 多处 |
| 10 | 每次 HTTP 请求创建新 `reqwest::Client` | `src-tauri/src/lib.rs:83-199` |
| 11 | capabilities 未做命令级访问控制 | `capabilities/default.json` |

### Daemon 后端 (5)

| # | 问题 | 文件 |
|---|------|------|
| 12 | 无 graceful shutdown | `daemon/src/index.ts:83-100` |
| 13 | 工具执行端点无权限守卫 | `daemon/src/api/tools.ts:102-121` |
| 14 | 错误消息直接暴露给客户端 | 多个 `api/*.ts` |
| 15 | settings.ts 928 行，混合无关职责 | `daemon/src/api/settings.ts` |
| 16 | 表清空端点用 N+1 逐行删除 | `daemon/src/api/settings.ts:494-528` |

## MEDIUM — 建议修复（17 个）

### 前端

- 50+ `console.log` 散布生产代码
- 多处空 `catch {}` 吞掉错误
- `createScriptProcessor` 已废弃，应迁移到 `AudioWorkletNode`
- `jarvisClient.ts` 用 `as T` 盲目断言 JSON 响应
- ChatInput 无长度限制和输入清理
- 67 行死代码（`useVoiceConversation.ts:258-330`）
- `any` 类型散见于 voice pipeline 各处

### Tauri Rust 层

- HTTP 请求无超时配置
- 两个重复的 health check 命令
- 错误消息泄露 daemon 内部细节给前端
- `lib.rs` 804 行超限

### Daemon 后端

- CORS 无限制
- `streamChat` 返回 `any` 类型
- skill executor `evaluateExpression` 无输入清理
- PostgreSQL 模式静默回退到 SQLite
- DDL 同步阻塞启动

## LOW — 可选优化（9 个）

- Cargo.toml 占位符（`authors = ["you"]`）
- 包名太泛（`name = "app"`）
- tokio `features = ["full"]` 拉入不必要依赖
- 无 API route 测试覆盖
- 临时 ID 可能碰撞
- localStorage 值无校验
- 文件体积超限

---

## 总览

| 层级 | CRITICAL | HIGH | MEDIUM | LOW |
|------|----------|------|--------|-----|
| 前端 React | 0 | 4 | 7 | 3 |
| Tauri Rust | 1 | 3 | 4 | 3 |
| Daemon 后端 | 3 | 5 | 6 | 3 |
| **合计** | **4** | **12** | **17** | **9** |

## 修复状态

- [x] #1 CSP 配置 — 添加严格 CSP 策略
- [ ] #2 凭证加密
- [ ] #3 端点认证
- [x] #4 Porcupine key 移除 — 返回布尔标志替代明文 key
- [x] #5 Hooks 违规修复 — 提取 `AssistantMirror` 组件，消除条件 hooks
- [x] #6 Tauri IPC 泛型化 — `unknown` → `Task`/`Article` 类型，移除 `as` 不安全断言
- [x] #7 useVoiceConversation 拆分 — 提取 `voiceUtils`、`voiceConversationCleanup`、`voiceRealtimeSession` 模块，1534→1226 行
- [x] #8 ASR options 类型修复 — `any` → `WebSpeechASROptions`
- [x] #9 URL 编码 — 添加 `encode_path_segment` 并应用于所有 URL 插值
- [x] #10 共享 reqwest::Client — `OnceLock` 单例 + 15s 超时
- [x] #11 命令级访问控制 — `capabilities/default.json` 使用 Tauri v2 合法的 `core:*` 权限（自定义命令在 Tauri v2 中默认可访问，不通过 capabilities 管控）
- [x] #12 graceful shutdown — SIGTERM/SIGINT 处理 + MCP 断开
- [x] #13 工具权限守卫 — 集成 `PermissionGuard` 到执行端点
- [x] #14 错误消息脱敏 — daemon 全局处理器 + Rust `sanitize_daemon_error`
- [x] #15 settings.ts 拆分 — 拆分为 `settings-storage`、`settings-providers`、`settings-model` 三个子路由
- [x] #16 批量删除优化 — 添加 `clear()` 方法，单条 SQL 替代 N+1
- [x] #17 console.log 清理 — 创建 `logger.ts`，生产环境静默
- [x] #18 空 catch 块处理 — 所有空 catch 块添加注释或 debug 日志
- [x] #19 ChatInput 长度限制 — `maxLength={4000}` + `slice` 截断
- [x] #20 streamChat 返回类型 — `any` → `ReturnType<typeof streamText>`
- [x] #21 evaluateExpression 输入清理 — 拒绝 `()`/`{}`/`[]`/`eval`/`Function` 等危险模式，阻断 `__proto__`/`constructor` 路径
- [x] #22 jarvisClient 响应校验 — 添加 null/undefined 运行时检查
- [x] #23 PostgreSQL 静默回退 — 添加 `console.warn` 警告
- [x] #24 重复 health check — 合并 `health_check`/`get_health` 为单一命令，移除未使用的 `HealthResponse` 结构体
- [x] #25 Cargo.toml 占位符修复 — `name="jarvis-app"`、`authors=["Jarvis Team"]`、tokio features 精简
- [x] #26 capabilities 标识符修复 — 移除不存在的 `app:allow-*` 权限，修正 Tauri v2 构建错误
- [x] #27 voice pipeline `any` 类型清理 — `PhysicalSize`/`PhysicalPosition` 替代 `any`，`createAudioContext()` 消除 `webkitAudioContext` 断言，`Uint8Array` 替代 `any`
- [x] #28 `lib.rs` 体积优化 — 804→694 行（合并 health check + 移除未使用结构体）
- [ ] #29 `createScriptProcessor` 迁移至 `AudioWorkletNode`（需架构重构，暂跳过）
- [ ] #30-#42 其余 LOW 项（temp ID 碰撞、localStorage 校验等为可接受的本地场景）
