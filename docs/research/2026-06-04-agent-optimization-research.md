# Agent Architecture Optimization Research

**Date**: 2026-06-04
**Source**: DeepWiki MCP analysis of 4 mainstream agents
**Reference**: [Odysseus](https://github.com/pewdiepie-archdaemon/odysseus) | [BaiLongma](https://github.com/xiaoyuanda666-ship-it/BaiLongma) | [Hermes Agent](https://github.com/nousresearch/hermes-agent) | [OpenClaw](https://github.com/openclaw/openclaw)

---

## Executive Summary

通过深入分析 4 个主流 Agent 项目，我们识别出 **6 大优化方向**，涵盖 **23 个具体改进项**。这些改进将显著提升 Jarvis 在上下文管理、工具效率、语音交互、自主运行、错误恢复和配置管理方面的能力。

| 优化方向 | 改进项数 | 优先级 | 预期收益 |
|----------|---------|--------|----------|
| 工具注入与选择 | 4 | HIGH | Token 节省 40-60%，响应速度提升 |
| 上下文与记忆管理 | 5 | HIGH | 长对话质量提升，跨会话连续性增强 |
| 语音交互优化 | 4 | HIGH | 打断体验提升，语音对话自然度增强 |
| 自主运行与后台处理 | 3 | MEDIUM | 空闲时自动整理，减少用户干预 |
| 错误恢复与容错 | 3 | MEDIUM | 系统稳定性提升， graceful degradation |
| 配置与插件系统 | 4 | LOW | 运维体验提升，可扩展性增强 |

---

## 一、工具注入与选择优化

### 现状分析

Jarvis 当前将所有注册工具的描述注入系统 prompt，随着 MCP 服务器和工具数量增长，token 消耗线性增加。

### 参考方案

| Agent | 方案 | 关键特性 |
|-------|------|---------|
| **Odysseus** | RAG 工具选择 | ChromaDB 嵌入工具描述，按查询语义相关性检索 top-K 工具 |
| **BaiLongma** | 上下文感知注入 | 根据消息意图和上下文动态选择工具子集 |
| **Hermes** | 自注册工具 | 工具文件导入时自动注册，简化发现和管理 |
| **OpenClaw** | 插件式上下文引擎 | 工具注册深度集成到 agent 生命周期 |

### 优化建议

#### 1.1 RAG 工具选择 (HIGH)

**借鉴**: Odysseus 的 ToolIndex + ChromaDB

**实施方案**:
```
当前: 所有工具描述 → 注入 system prompt (O(N) token)
优化: 工具描述 → 嵌入向量库 → 按用户查询检索 top-K → 注入 (O(K) token, K << N)
```

**具体步骤**:
- 为每个工具维护嵌入向量 (描述 + 标签名)
- 用户消息到达时，检索语义最相关的 5-8 个工具
- 保持 always-available 工具集 (bash, 文件操作等核心工具)
- 工具描述截断至 120 字符以节省 token

**预期效果**: 工具 token 消耗降低 40-60%，LLM 选择工具的准确率因减少噪声而提升。

#### 1.2 工具分类与优先级 (MEDIUM)

**借鉴**: BaiLongma 的工具路由

**实施方案**:
- 将工具分为 `core` (始终注入)、`domain` (按领域注入)、`mcp` (动态注入)
- 根据对话历史自动推断当前领域，注入对应 domain 工具
- MCP 工具按使用频率排序，低频工具降级为按需加载

#### 1.3 工具描述优化 (LOW)

**借鉴**: Odysseus 的 compact 模式

**实施方案**:
- 紧凑模式: 只列出工具名和一句话描述
- 完整模式: 包含参数 schema (仅对高相关工具)
- 根据上下文 token 预算自动选择模式

#### 1.4 自进化技能 (MEDIUM)

**借鉴**: Odysseus 的 manage_skills

**实施方案**:
- 允许 agent 创建、保存、复用自定义技能
- 技能存储为 JSON 配置 (prompt 模板 + 工具组合)
- 用户可通过 `/skill create` 命令创建技能
- 技能库持久化到 `~/.jarvis/skills/`

---

## 二、上下文与记忆管理优化

### 现状分析

Jarvis 有分层记忆系统 (preference/context/fact) 和上下文压缩，但缺乏:
- 提示词分层缓存策略
- 时间感知记忆检索
- 记忆使用频率追踪
- 压缩前的记忆快照

### 参考方案

| Agent | 方案 | 关键特性 |
|-------|------|---------|
| **Hermes** | 三层提示词 (stable/context/volatile) | 最大化 prefix cache 命中率 |
| **BaiLongma** | Focus Stack + 时间感知检索 | LIFO 上下文切换，按时间线索检索 |
| **Odysseus** | Pinned/Extended 记忆 + 混合检索 | BM25 + 向量相似度，使用频率追踪 |
| **OpenClaw** | 可插拔上下文引擎 | ingest/assemble/compact/afterTurn 四阶段生命周期 |

### 优化建议

#### 2.1 三层提示词架构 (HIGH)

**借鉴**: Hermes 的 stable/context/volatile 分层

**实施方案**:
```
Stable Tier (缓存友好):
  - Agent 身份 (Jarvis 人格、行为准则)
  - 工具使用指南
  - 环境信息 (操作系统、时间格式)

Context Tier (半稳定):
  - 项目上下文 (CLAUDE.md, AGENTS.md)
  - 当前任务目标
  - 领域知识

Volatile Tier (每次变化):
  - 记忆快照 (MEMORY.md)
  - 用户画像快照
  - 会话元数据 (时间、模型、provider)
```

**关键设计**: Stable tier 保持不变以最大化 Anthropic/OpenAI 的 prefix cache 命中。Volatile tier 放在 prompt 末尾，变化不影响缓存。

**预期效果**: 重复请求的 prompt 缓存命中率提升 60-80%，TTFT 降低 30-50%。

#### 2.2 时间感知记忆检索 (MEDIUM)

**借鉴**: BaiLongma 的 gatherTemporalRecall

**实施方案**:
- 从用户消息中提取时间线索 ("昨天", "上周", "3月的会议")
- 将时间线索映射到日期范围
- 检索对应时间范围内的记忆和对话摘要
- 注入格式: `[2026-03-15] 用户讨论了项目进度...`

#### 2.3 记忆使用追踪与淘汰 (MEDIUM)

**借鉴**: Odysseus 的 usage counter

**实施方案**:
- 为每条记忆维护 `injectCount` 和 `lastInjectedAt` 字段
- 长期未使用的记忆自动降级或归档
- 高频使用的记忆提升为 pinned 级别
- 定期清理过期记忆 (超过 90 天未使用)

#### 2.4 压缩前记忆快照 (HIGH)

**借鉴**: Hermes 的 "memory flush to disk before compression"

**实施方案**:
- 压缩触发时，先将当前对话的关键信息提取为记忆
- 搜索现有记忆，更新或创建新条目
- 确保压缩不丢失重要上下文
- 快照包含: 用户偏好、关键决策、未完成任务

#### 2.5 可插拔上下文引擎 (LOW)

**借鉴**: OpenClaw 的 ContextEngine 接口

**实施方案**:
```typescript
interface ContextEngine {
  ingest(message: Message): void;      // 新消息到达时
  assemble(budget: number): Message[]; // 组装上下文
  compact(): void;                     // 压缩历史
  afterTurn(): void;                   // 回合结束后
}
```
- 允许插件注册自定义上下文引擎
- 内置 legacy 引擎作为降级方案
- 引擎失败时自动降级到 legacy

---

## 三、语音交互优化

### 现状分析

Jarvis 有 useVoiceFSM 状态机、ASR/TTS、barge-in 和 connection health，但缺乏:
- 两级打断检测 (duck + full interrupt)
- 语音专用 prompt 工程
- ASR 错误静默处理
- 预中断音频缓冲

### 参考方案

| Agent | 方案 | 关键特性 |
|-------|------|---------|
| **BaiLongma** | 两级打断 + 语音 prompt | Duck 模式 → 完全中断，语音专用指令 |
| **Hermes** | Whisper 幻觉过滤 | 识别并过滤 ASR 幻觉文本 |
| **Odysseus** | TTS 设置管理 | 动态切换 TTS voice/provider/speed |

### 优化建议

#### 3.1 两级打断检测 (HIGH)

**借鉴**: BaiLongma 的 Duck → Full Interrupt 机制

**实施方案**:
```
阶段 1 (Duck): 检测到持续高振幅音频 (DUCK_TRIGGER_FRAMES)
  → 降低 TTS 音量 50%
  → 启动衰减计时器

阶段 2 (Full Interrupt): 高振幅持续 (DUCK_SUSTAIN_FRAMES)
  → 停止 TTS 播放
  → 保存已播放位置
  → 发送预中断音频缓冲到 ASR
  → 启动 "无语音" 计时器

衰减检测: 振幅快速下降 (DUCK_DECAY_FRAMES)
  → 恢复 TTS 音量
  → 不触发中断
```

**关键参数**:
- `DUCK_TRIGGER_FRAMES`: 3 帧 (约 90ms)
- `DUCK_SUSTAIN_FRAMES`: 8 帧 (约 240ms)
- `DUCK_DECAY_FRAMES`: 5 帧 (约 150ms)

**预期效果**: 区分环境噪音和真实打断，减少误触发。

#### 3.2 语音专用 Prompt 工程 (HIGH)

**借鉴**: BaiLongma 的 voice directions

**实施方案**:
- 检测到语音输入时，注入语音专用指令:
  ```
  [VOICE MODE]
  - 自然简洁地说话，像和人交谈，不要写文章
  - 直奔主题，避免填充词
  - 不要使用 Markdown 格式
  - 如果 ASR 明显识别错误或环境噪音，静默忽略
  - 只在输入合理地针对你时才回应
  - 单个字符破坏连贯句子时，按上下文正确词处理
  ```
- 语音响应自动截断至 200 字以内
- 避免代码块、列表等非口语化格式

#### 3.3 ASR 幻觉过滤 (MEDIUM)

**借鉴**: Hermes 的 hallucination filtering

**实施方案**:
- 维护幻觉模式列表 (如重复音节、无意义词组)
- ASR 结果匹配幻觉模式时，丢弃并重试
- 安全超时后仍无有效识别，提示用户重试
- 支持 Web Speech + Whisper 双引擎自动降级 (已有)

#### 3.4 预中断音频缓冲 (MEDIUM)

**借鉴**: BaiLongma 的 pre-interruption audio buffer

**实施方案**:
- 维护最近 500ms 的 PCM 环形缓冲区 (CircularPCMBuffer 已有)
- 打断发生时，将缓冲区音频发送到 ASR
- 捕获用户打断话语的开头部分
- 提升打断后首轮 ASR 的识别准确率

---

## 四、自主运行与后台处理

### 现状分析

Jarvis 有 scheduler (cron 任务) 和 sensors (变更检测)，但缺乏:
- 空闲时自主思考和整理
- 两级处理架构 (快速响应 + 深度后台)
- 看门狗防挂起机制
- 自动资源探测

### 参考方案

| Agent | 方案 | 关键特性 |
|-------|------|---------|
| **BaiLongma** | Consciousness Loop + L1/L2 | 持续心跳驱动，优先级调度 |
| **Hermes** | 持续目标 + 自动继续 | /goal 设定目标，自动迭代直到完成 |
| **OpenClaw** | Silent Housekeeping | NO_REPLY 模式执行后台任务 |

### 优化建议

#### 4.1 空闲自主处理 (MEDIUM)

**借鉴**: BaiLongma 的 TICK 机制

**实施方案**:
```
空闲检测 (已有 scheduler idle callback)
  → 触发 "思考 TICK"
  → L2 处理:
    - 记忆整理和压缩
    - 待办事项过期检查
    - 阅读列表状态更新
    - 对话摘要生成
  → 结果静默写入数据库
  → 不打扰用户
```

**关键设计**: 使用 OpenClaw 的 NO_REPLY 模式 — agent 输出以 `NO_REPLY` 开头时，前端静默处理不显示。

#### 4.2 持续目标系统 (MEDIUM)

**借鉴**: Hermes 的 /goal + 自动继续

**实施方案**:
- 用户可通过 `/goal` 命令设定持续目标
- 每个回合结束后，轻量级 judge 模型检查目标是否达成
- 未达成则自动注入 continuation prompt 继续工作
- 目标状态持久化到数据库
- 支持 `/goal status` 查看进度，`/goal pause` 暂停

#### 4.3 看门狗机制 (LOW)

**借鉴**: BaiLongma 的 RUN_TURN_WATCHDOG_MS

**实施方案**:
- 为每个 agent 回合设置 180s 超时
- 超时后 abort 当前 LLM 调用
- 保留已生成的部分结果
- 记录超时日志用于诊断
- 已有 stream timeout，可复用配置

---

## 五、错误恢复与容错

### 现状分析

Jarvis 有 provider retry (429/503)、dead-host 退避和 stream timeout，但缺乏:
- 强制回答机制 (agent 循环不出答案时)
- 优雅摘要 (scheduled task 无输出时)
- 文件系统检查点/回滚
- 插件隔离与降级

### 参考方案

| Agent | 方案 | 关键特性 |
|-------|------|---------|
| **Odysseus** | Force Answer + Grace Summarization | 循环不出答案时禁用工具强制输出 |
| **Hermes** | 文件系统检查点 | 破坏性操作前自动快照，/rollback 回滚 |
| **OpenClaw** | 引擎隔离降级 | 插件引擎失败时 quarantine 并降级到 legacy |

### 优化建议

#### 5.1 强制回答机制 (MEDIUM)

**借鉴**: Odysseus 的 force answer

**实施方案**:
```
Agent 循环检测:
  - 连续 3 轮只调用工具不生成文本
  - 或工具调用结果为空/错误
  → 触发 force answer:
    1. 禁用所有工具
    2. 注入 "请基于已有信息直接回答用户问题"
    3. 进行一次非流式 LLM 调用
    4. 返回综合答案
```

#### 5.2 文件系统检查点 (LOW)

**借鉴**: Hermes 的 Checkpoint Manager

**实施方案**:
- 破坏性操作 (文件删除、数据库修改) 前创建快照
- 快照存储在 `~/.jarvis/checkpoints/`
- 支持 `/rollback` 查看和恢复
- 每回合最多创建 1 个快照 per 目录
- 自动清理超过 7 天的快照

#### 5.3 插件隔离与降级 (LOW)

**借鉴**: OpenClaw 的 quarantine 机制

**实施方案**:
- MCP 工具调用失败时，标记该 MCP 服务器为 degraded
- degraded 状态下跳过该服务器的工具
- 定期尝试重连 (指数退避)
- 连接恢复后自动提升回 active 状态
- 已有 dead-host 机制，可扩展支持 MCP

---

## 六、配置与插件系统优化

### 现状分析

Jarvis 有 config-manager (文件缓存) 和 MCP 集成，但缺乏:
- 配置热重载
- Schema 验证
- 多 agent 路由
- 插件市场

### 参考方案

| Agent | 方案 | 关键特性 |
|-------|------|---------|
| **OpenClaw** | ConfigWatcher + Zod 验证 | 运行时热重载，JSON5 + 严格 schema |
| **BaiLongma** | Tool Marketplace | JS 工具沙箱安装，动态加载 |
| **Hermes** | 三层插件发现 | 用户级 + 项目级 + pip 入口点 |

### 优化建议

#### 6.1 配置热重载 (LOW)

**借鉴**: OpenClaw 的 ConfigWatcher

**实施方案**:
- 监听 `~/.jarvis/config.json` 文件变化 (已有 mtime cache)
- 检测到变化时自动 invalidate cache 并重新加载
- 需要重启的配置项 (如端口) 提示用户手动重启
- 不需重启的配置项 (如模型切换) 立即生效

#### 6.2 配置 Schema 验证 (LOW)

**借鉴**: OpenClaw 的 Zod 验证

**实施方案**:
- 使用 Zod 定义 config schema
- 启动时验证配置文件
- 缺失字段自动填充默认值
- 无效字段发出警告并忽略
- 已有类型定义，可迁移为 Zod schema

#### 6.3 多 Agent 路由 (LOW)

**借鉴**: OpenClaw 的 AgentRouter

**实施方案**:
- 支持配置多个 agent profile (如 "coding"、"writing"、"research")
- 每个 profile 有不同的 system prompt、工具集、模型配置
- 根据用户意图自动路由到合适的 agent
- 已有 model routing rules，可扩展为 agent routing

#### 6.4 插件市场 (LOW)

**借鉴**: BaiLongma 的 Tool Marketplace

**实施方案**:
- 插件目录: `~/.jarvis/plugins/`
- 每个插件包含: manifest.json + 工具定义 + 可选 prompt 模板
- `/plugin install <name>` 安装插件
- 插件工具自动注册到全局 registry
- 沙箱执行防止恶意代码

---

## 七、实施优先级与路线图

### Phase 17: 工具效率与上下文优化 (2 周)

| 任务 | 优先级 | 复杂度 | 依赖 |
|------|--------|--------|------|
| 17.1 RAG 工具选择 | HIGH | HIGH | 嵌入向量库 |
| 17.2 三层提示词架构 | HIGH | MEDIUM | 无 |
| 17.3 压缩前记忆快照 | HIGH | LOW | 无 |
| 17.4 工具分类与优先级 | MEDIUM | LOW | 无 |

### Phase 18: 语音交互增强 (2 周)

| 任务 | 优先级 | 复杂度 | 依赖 |
|------|--------|--------|------|
| 18.1 两级打断检测 | HIGH | MEDIUM | AudioContext API |
| 18.2 语音专用 Prompt | HIGH | LOW | 无 |
| 18.3 ASR 幻觉过滤 | MEDIUM | LOW | 幻觉模式库 |
| 18.4 预中断音频缓冲 | MEDIUM | LOW | CircularPCMBuffer |

### Phase 19: 自主运行与容错 (2 周)

| 任务 | 优先级 | 复杂度 | 依赖 |
|------|--------|--------|------|
| 19.1 空闲自主处理 | MEDIUM | MEDIUM | scheduler |
| 19.2 强制回答机制 | MEDIUM | LOW | 无 |
| 19.3 持续目标系统 | MEDIUM | MEDIUM | 数据库 |
| 19.4 看门狗机制 | LOW | LOW | 无 |

### Phase 20: 配置与插件 (1 周)

| 任务 | 优先级 | 复杂度 | 依赖 |
|------|--------|--------|------|
| 20.1 配置热重载 | LOW | LOW | 无 |
| 20.2 Schema 验证 | LOW | LOW | Zod |
| 20.3 时间感知记忆 | MEDIUM | MEDIUM | 无 |
| 20.4 记忆使用追踪 | MEDIUM | LOW | 无 |

---

## 八、关键设计决策

### 决策 1: RAG 工具选择 vs 全量注入

| 维度 | 全量注入 (现状) | RAG 选择 (优化) |
|------|----------------|----------------|
| Token 消耗 | O(N) 线性增长 | O(K) 固定 (K=5-8) |
| 实现复杂度 | 低 | 中 (需要嵌入库) |
| 准确率 | 可能被噪声干扰 | 语义相关性提升准确率 |
| 延迟 | 无额外延迟 | +50-100ms (嵌入检索) |

**建议**: 采用 RAG 选择。嵌入检索延迟可接受，token 节省显著。

### 决策 2: 三级打断 vs 两级打断

| 维度 | 两级 (BaiLongma) | 三级 (扩展) |
|------|-----------------|------------|
| 复杂度 | 低 | 中 |
| 误触发率 | 低 | 更低 |
| 用户体验 | 好 | 更好 |

**建议**: 先实现两级，观察效果后再决定是否需要三级。

### 决策 3: 持续目标 vs 一次性任务

| 维度 | 持续目标 (Hermes) | 一次性任务 (现状) |
|------|------------------|------------------|
| 自主性 | 高 (自动继续) | 低 (需用户触发) |
| 资源消耗 | 可能较高 | 可控 |
| 适用场景 | 长期项目 | 即时任务 |

**建议**: 两者并存。`/goal` 用于长期项目，普通对话用于即时任务。

---

## 九、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| RAG 工具选择遗漏关键工具 | 功能缺失 | 保持 always-available 核心工具集 |
| 两级打断误触发 | 用户体验差 | 可调参数 + 用户配置 |
| 空闲处理消耗资源 | 性能下降 | 限制 TICK 频率 + 资源预算 |
| 配置热重载导致状态不一致 | 数据丢失 | 原子更新 + 回滚机制 |
| 插件安全风险 | 系统 compromised | 沙箱执行 + 权限控制 |

---

## 十、总结

通过借鉴 Odysseus、BaiLongma、Hermes 和 OpenClaw 的优秀设计，Jarvis 可以在以下方面实现显著提升:

1. **工具效率**: RAG 选择 + 分类注入，token 消耗降低 40-60%
2. **上下文质量**: 三层提示词 + 压缩前快照，长对话质量提升
3. **语音体验**: 两级打断 + 语音 prompt，打断准确率提升
4. **自主能力**: 空闲处理 + 持续目标，减少用户干预
5. **系统稳定**: 强制回答 + 检查点回滚，graceful degradation
6. **运维体验**: 热重载 + Schema 验证，配置管理现代化

这些优化将使 Jarvis 从一个功能完整的语音助手进化为一个真正的自主 AI 代理。
