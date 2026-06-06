import type { ModelMessage } from "ai";
import type { MessageRow, ScoredMemoryRow } from "../db/repository.js";
import { getAllJarvisTools } from "../tools/registry.js";
import type { JarvisTool } from "@jarvis/types";
import { estimateTokens, computeContextBudget, selectHistoryWithinBudget, shouldCompress } from "./context-manager.js";
import { configManager } from "../config/config-manager.js";
import { getToolIndex } from "./tool-index.js";

// ---- Types ----

export interface ContextSection {
  name: string;
  content: string;
  tokens: number;
  /** Prompt tier: stable (cache-friendly), context (semi-stable), or volatile (changes each turn) */
  tier: "stable" | "context" | "volatile";
}

export interface ContextDebugInfo {
  mode: "text" | "voice";
  modelName: string;
  sections: ContextSection[];
  tools: {
    total: number;
    selected: number;
    names: string[];
  };
  memories: {
    total: number;
    selected: number;
    items: { key: string; type: string; score: number }[];
  };
  summaryInjected: boolean;
  tokens: {
    system: number;
    memory: number;
    history: number;
    total: number;
    budget: number;
  };
  /** Token breakdown by tier for cache optimization */
  tierTokens: {
    stable: number;
    context: number;
    volatile: number;
  };
}

export interface BuiltContext {
  messages: ModelMessage[];
  historyTruncated: boolean;
  shouldCompress: boolean;
  compressionUrgency: "soft" | "hard" | "none";
  tokens: ContextDebugInfo["tokens"];
  toolsUsed: string[];
  /** Whether Anthropic prompt caching should be enabled for this context. */
  cacheEnabled: boolean;
  debug: () => ContextDebugInfo;
}

// ---- Constants ----

/** Maximum tools to include in the catalog */
const MAX_TOOLS = 16;

/** Maximum memories to inject */
const MAX_MEMORIES = 15;

/** Tier-specific memory limits */
const MAX_PREFERENCE_MEMORIES = 5;
const MAX_CONTEXT_MEMORIES = 8;
const MAX_FACT_MEMORIES = 5;

/** Maximum tokens for the tool catalog section */
const TOOL_CATALOG_TOKEN_BUDGET = 3000;

/** Maximum tokens for the memory section */
const MEMORY_SECTION_TOKEN_BUDGET = 2000;

/** Minimum relevance score for memory injection (context and fact tiers) */
export const MEMORY_MIN_SCORE = 0.3;

/** Maximum tokens for the summary section */
const SUMMARY_TOKEN_BUDGET = 1500;

/** Always-available tool names that are injected regardless of RAG selection */
const ALWAYS_AVAILABLE_TOOLS = new Set([
  "bash",
  "readFile",
  "writeFile",
  "editFile",
  "glob",
  "grep",
  "deleteConversation",
]);

/** Maximum tools from RAG selection (excluding always-available) */
const RAG_TOP_K = 8;

// ---- Tool Selection (RAG-based) ----

/**
 * Select the most relevant tools for a given query using RAG-based semantic search.
 * Always includes core tools (bash, file operations) regardless of query.
 */
function selectTools(query?: string): JarvisTool[] {
  const allTools = getAllJarvisTools();
  if (allTools.length === 0) return [];

  const index = getToolIndex();

  // Rebuild index if tools changed
  if (index.size !== allTools.length) {
    index.clear();
    index.addTools(allTools);
  }

  // Separate always-available tools from searchable tools
  const alwaysAvailable = allTools.filter((t) => ALWAYS_AVAILABLE_TOOLS.has(t.name));
  const searchableTools = allTools.filter((t) => !ALWAYS_AVAILABLE_TOOLS.has(t.name));

  // Update index with searchable tools only
  if (index.size !== searchableTools.length) {
    index.clear();
    index.addTools(searchableTools);
  }

  if (!query) {
    // No query — return always-available + first MAX_TOOLS searchable
    const fallback = searchableTools.slice(0, MAX_TOOLS - alwaysAvailable.length);
    return [...alwaysAvailable, ...fallback];
  }

  // RAG search for relevant tools
  const ragResults = index.searchTools(query, RAG_TOP_K);
  const ragTools = ragResults
    .filter((r) => r.score > 0)
    .map((r) => r.tool);

  // Combine: always-available + RAG-selected, deduplicate, limit to MAX_TOOLS
  const combined = [...alwaysAvailable, ...ragTools];
  const seen = new Set<string>();
  const result: JarvisTool[] = [];

  for (const tool of combined) {
    if (!seen.has(tool.id) && result.length < MAX_TOOLS) {
      seen.add(tool.id);
      result.push(tool);
    }
  }

  // If no relevant tools found, fall back to first MAX_TOOLS
  return result.length > 0 ? result : allTools.slice(0, MAX_TOOLS);
}

/**
 * Build a tool catalog string from a list of tools.
 */
function buildToolCatalog(tools: JarvisTool[]): string {
  if (tools.length === 0) return "- （暂无可用工具）\n";

  const groups: Record<string, { name: string; desc: string }[]> = {};
  for (const tool of tools) {
    const source =
      tool.source === "mcp"
        ? `MCP (${tool.appId})`
        : tool.source === "rest"
          ? `外部应用 (${tool.appId})`
          : "内置";
    if (!groups[source]) groups[source] = [];
    groups[source].push({ name: tool.name, desc: tool.description });
  }

  let catalog = "";
  for (const [source, sourceTools] of Object.entries(groups)) {
    catalog += `### ${source}\n`;
    for (const t of sourceTools) {
      const shortDesc =
        t.desc.length > 60 ? t.desc.slice(0, 60) + "..." : t.desc;
      catalog += `- \`${t.name}\`: ${shortDesc}\n`;
    }
    catalog += "\n";
  }
  return catalog;
}

// ---- ContextBuilder ----

export class ContextBuilder {
  private mode: "text" | "voice";
  private conversationId?: string;
  private modelName: string;
  private userMessage?: string;
  private summary?: string;
  private systemPromptOverride?: string;
  private sections: ContextSection[] = [];
  private selectedToolNames: string[] = [];
  private selectedMemoryItems: { key: string; type: string; score: number }[] =
    [];

  constructor(config: {
    mode?: "text" | "voice";
    conversationId?: string;
    modelName: string;
    userMessage?: string;
    systemPromptOverride?: string;
  }) {
    this.mode = config.mode ?? "text";
    this.conversationId = config.conversationId;
    this.modelName = config.modelName;
    this.userMessage = config.userMessage;
    this.systemPromptOverride = config.systemPromptOverride;
  }

  /**
   * Set a conversation summary to inject into context.
   */
  withSummary(summary: string): this {
    this.summary = summary;
    return this;
  }

  /**
   * Build the full context for a conversation turn.
   * Uses three-tier prompt architecture for optimal cache hit rates:
   * - Stable: Agent identity, tool guidelines, environment (cache-friendly)
   * - Context: Project context, current task, domain knowledge (semi-stable)
   * - Volatile: Memory snapshots, user profile, session metadata (changes each turn)
   */
  async build(
    memories: ScoredMemoryRow[],
    history: MessageRow[],
  ): Promise<BuiltContext> {
    // Fast path: use override system prompt directly (e.g. for TICK)
    if (this.systemPromptOverride) {
      const systemPrompt = this.systemPromptOverride;
      const systemPromptTokens = estimateTokens(systemPrompt);
      const budget = computeContextBudget(this.modelName, systemPromptTokens, 0);
      const uncompressedHistory = history.filter(
        (m) => !m.compressed && !(m.role === "system" && m.content.startsWith("[对话摘要")),
      );
      const { selected, truncated, estimatedTokens: historyTokens } =
        selectHistoryWithinBudget(uncompressedHistory, budget);
      const { shouldCompress: needsCompress, urgency } = shouldCompress(
        historyTokens, budget, selected.length,
      );
      const messages: ModelMessage[] = [{ role: "system", content: systemPrompt }];
      for (const msg of selected) {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
      const totalTokens = systemPromptTokens + historyTokens;
      const tokenInfo = { system: systemPromptTokens, memory: 0, history: historyTokens, total: totalTokens, budget: budget.maxInputTokens };
      return {
        messages,
        historyTruncated: truncated,
        shouldCompress: needsCompress,
        compressionUrgency: urgency,
        tokens: tokenInfo,
        toolsUsed: [],
        cacheEnabled: systemPrompt.length > 4000,
        debug: () => ({
          mode: this.mode,
          modelName: this.modelName,
          sections: [],
          tools: { total: 0, selected: 0, names: [] },
          memories: { total: 0, selected: 0, items: [] },
          summaryInjected: false,
          tokens: tokenInfo,
          tierTokens: { stable: systemPromptTokens, context: 0, volatile: 0 },
        }),
      };
    }

    // 1. Build all sections with tier annotations
    this.sections = [];

    // Stable tier (cache-friendly - rarely changes)
    this.sections.push(this.buildPersonaSection());
    this.sections.push(this.buildDeveloperSection());

    // Context tier (semi-stable - changes with project/task)
    const toolSection = this.buildToolSection();
    this.sections.push(toolSection);

    const summarySection = this.buildSummarySection();
    if (summarySection) {
      this.sections.push(summarySection);
    }

    // Volatile tier (changes each turn - placed at end for cache optimization)
    const memorySection = this.buildMemorySection(memories);
    this.sections.push(memorySection);

    this.sections.push(this.buildConversationInfoSection());
    this.sections.push(this.buildDateSection());

    // 2. Assemble system prompt respecting tier order (stable → context → volatile)
    const stableSections = this.sections.filter((s) => s.tier === "stable");
    const contextSections = this.sections.filter((s) => s.tier === "context");
    const volatileSections = this.sections.filter((s) => s.tier === "volatile");

    const systemPrompt = [
      ...stableSections.map((s) => s.content),
      ...contextSections.map((s) => s.content),
      ...volatileSections.map((s) => s.content),
    ].join("\n");

    const systemPromptTokens = estimateTokens(systemPrompt);

    // Compute tier token breakdown for cache optimization
    const tierTokens = {
      stable: stableSections.reduce((sum, s) => sum + s.tokens, 0),
      context: contextSections.reduce((sum, s) => sum + s.tokens, 0),
      volatile: volatileSections.reduce((sum, s) => sum + s.tokens, 0),
    };

    // Memory is embedded inside the system prompt, but we track it separately
    // for accurate budget reporting. The budget already accounts for it via
    // systemPromptTokens; memoryTokens here is for debug/reporting only.
    const memoryTokens = memorySection.tokens;

    // 3. Compute context budget — memory is part of systemPrompt, so we pass 0
    // to avoid double-counting. The budget struct's memoryTokens is intentionally 0.
    const budget = computeContextBudget(this.modelName, systemPromptTokens, 0);

    // Filter out compressed messages AND summary messages.
    // Summary messages are already injected via withSummary() into the system prompt,
    // so counting them in historyTokens would double-count their tokens.
    const uncompressedHistory = history.filter(
      (m) => !m.compressed && !(m.role === "system" && m.content.startsWith("[对话摘要")),
    );
    const { selected, truncated, estimatedTokens: historyTokens } =
      selectHistoryWithinBudget(uncompressedHistory, budget);

    const { shouldCompress: needsCompress, urgency } = shouldCompress(
      historyTokens,
      budget,
      selected.length,
    );

    // 4. Build messages array
    const messages: ModelMessage[] = [
      { role: "system", content: systemPrompt },
    ];

    for (const msg of selected) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    const totalTokens = systemPromptTokens + historyTokens;

    // Enable Anthropic prompt caching when tools are present or system prompt is large
    const cacheEnabled =
      this.selectedToolNames.length > 0 || systemPrompt.length > 4000;

    return {
      messages,
      historyTruncated: truncated,
      shouldCompress: needsCompress,
      compressionUrgency: urgency,
      tokens: {
        system: systemPromptTokens,
        memory: estimateTokens(memorySection.content),
        history: historyTokens,
        total: totalTokens,
        budget: budget.maxInputTokens,
      },
      toolsUsed: this.selectedToolNames,
      cacheEnabled,
      debug: () => this.buildDebugInfo(memories, {
        system: systemPromptTokens,
        memory: memoryTokens,
        history: historyTokens,
        total: totalTokens,
        budget: budget.maxInputTokens,
      }, tierTokens),
    };
  }

  // ---- Section Builders ----

  private buildPersonaSection(): ContextSection {
    const content =
      this.mode === "voice"
        ? this.buildVoicePersona()
        : this.buildTextPersona();
    return {
      name: "persona",
      content,
      tokens: estimateTokens(content),
      tier: "stable",
    };
  }

  private buildVoicePersona(): string {
    return `你是 Jarvis，一个个人指令中心的 AI 语音助手。你正在与用户进行**语音对话**。

## 语音对话的核心准则：
- **纯口语化与对话感**：你的回答是用于"播放给用户听"的。说话语气要自然、亲近、友好、口语化，像一个真实的个人科技管家在与用户亲切交谈。避免死板的书面语。
- **严禁使用任何表情与符号**：绝对不要在回复中包含 any Emoji 表情（如 😄, 😊）、颜表情或特殊括号标记（如 *微笑*、(高兴)）。这些符号在语音播报时会造成极其怪异的停顿、乱码音或误读！
- **严禁使用任何 Markdown 格式与符号**：绝对不要在你的回复中输出任何 Markdown 标记。例如，不要使用粗体（**）、斜体（*）、多级标题（#）、反单引号（\`）、警示块、代码块。需要列举时，必须使用纯文本和口语化的连接词（如"第一，我们...；第二，我们..."），严禁使用 Markdown 列表符号（如"-"或"1."）。表格数据必须用纯文本总结叙述。
- **言简意赅，长话短说**：语音对话中，用户容易遗忘冗长信息。你的回答必须严格控制在 200 字以内（硬性上限）。超过 200 字的回答在语音播报时用户无法完整接收。如果内容较多，先说出最核心的 1-2 点，并以互动提问的方式询问用户是否想听详细内容。
- **互动性与温暖感**：在句子结尾适当使用语气助词（如"呀"、"哈"、"哦"），并在回答后主动提问（如"需要我帮你记录下来吗？"或"你觉得这样可以吗？"），保持自然的双向互动。

## ASR 噪音处理（关键）
- 用户的语音输入来自 ASR（语音识别），可能包含噪音：重复的"啊啊啊"、无意义的单字符、识别错误的乱码等。
- **单字符处理**：当用户只说了一个字（如"啊"、"嗯"、"好"），必须根据上下文判断其含义。如果是确认语（如对上文的肯定），简短回应即可；如果是无意义噪音，直接忽略并等待下一句。
- **重复字符处理**：用户输入中连续重复的相同字符（如"嗯嗯嗯"、"啊啊"）视为语气词，按单次理解。
- **噪音过滤**：纯标点、纯数字、无意义字母组合等 ASR 噪音，直接忽略，不要回应。

## 思考/推理过程 (Thought Process) 与极速响应规范 (TTFT Optimization)
- **极速响应原则 (CRITICAL)**：语音对话要求极高实时性。**对于任何不需要调用工具的简单回复、日常问候、闲聊、确认或简短反馈（例如："你好"、"我在的，主人"、"好的，没问题"等），严禁使用 <thought> 标签，必须直接进行口语化回复！** 这样可以省去大模型输出思考过程的时间，实现毫秒级的首包延迟（TTFT）。
- **仅在需要调用工具、执行复杂逻辑或需要多步推理时，才允许并使用 <thought> 标签**。

## 工具调用原则
- 当需要数据时，主动使用工具查询，不要瞎编或猜测。
- 执行完工具后，将结果以流畅、自然的口语化语句整合到最终回复中，绝对不要输出表格！`;
  }

  private buildTextPersona(): string {
    return `你是 Jarvis，一个个人指令中心的 AI 助手。你的职责是帮助用户管理他们的任务（Todo）、阅读清单和每日/每周回顾。

## 行为准则与回复规范
- **使用中文回复**：所有回答、分析 and 提示必须使用中文。
- **回复结构化与排版**：
  - 充分利用 Markdown 的多级标题、加粗、精美列表、警示块（如 > [!NOTE]）等排版格式，让界面极为美观。
  - 对于任务、清单等多项数据，使用表格（Table）或复选框列表（Checkbox List）来展现，增加视觉可读性。
  - 对于代码，必须指明语言类型（如 \`\`\`typescript ）。
- **思考/推理过程 (Thought Process)**：
  - 在处理复杂请求、分析数据、或者执行多步工具调用前，先用 \`<thought>\` 标签包裹你的推理过程。
  - 思考过程应当简洁、专业，主要阐述逻辑，不要啰嗦。
- **工具调用原则**：
  - 当需要数据时，主动使用工具查询，不要瞎编或猜测。
  - 执行完工具后，将结果漂亮地整合到最终回复中。
- **个性化**：回答要简洁、有条理、有科技感和温暖感。`;
  }

  private buildDeveloperSection(): ContextSection {
    const content = `## 开发者与项目信息 (CRITICAL)
- **关于开发者**：如果用户问起关于你的开发者、作者、团队或你是谁创造的之类的问题，请用非常温暖和亲切的语气介绍：
  - 你的开发者名叫 **alvin luo**。
  - 他目前在**杜伦大学**（Durham University）攻读研究生学位。
  - 在不写代码（不 vibe coding）的日子里，他非常热爱生活，会去好好健身、专注学习，或者和朋友们玩耍。
- **GitHub 呼吁 (GitHub Star CTA)**：在介绍开发者时，或者在用户对你赞赏有加、表达喜欢时，请盛情邀请并呼吁用户去他的 **GitHub 仓库点一个 Star 🌟** 支持一下这个项目！`;
    return { name: "developer", content, tokens: estimateTokens(content), tier: "stable" };
  }

  private buildToolSection(): ContextSection {
    const tools = selectTools(this.userMessage);
    this.selectedToolNames = tools.map((t) => t.name);

    let catalog = buildToolCatalog(tools);

    // Truncate if over budget
    const catalogTokens = estimateTokens(catalog);
    if (catalogTokens > TOOL_CATALOG_TOKEN_BUDGET) {
      catalog = this.truncateText(catalog, TOOL_CATALOG_TOKEN_BUDGET);
    }

    const content = `## 可用工具\n${catalog}`;
    return {
      name: "tools",
      content,
      tokens: estimateTokens(content),
      tier: "context",
    };
  }

  private buildMemorySection(memories: ScoredMemoryRow[]): ContextSection {
    if (memories.length === 0) {
      return {
        name: "memory",
        content: "",
        tokens: 0,
        tier: "volatile",
      };
    }

    // Tier-specific selection: preferences always inject, others score-thresholded
    const preferences = memories
      .filter((m) => m.tier === "preference")
      .slice(0, MAX_PREFERENCE_MEMORIES);

    const minScore = configManager.getMemoryMinScore();
    const contexts = memories
      .filter((m) => m.tier === "context" && m.score >= minScore)
      .slice(0, MAX_CONTEXT_MEMORIES);

    const facts = memories
      .filter((m) => m.tier === "fact" && m.score >= minScore)
      .slice(0, MAX_FACT_MEMORIES);

    const topMemories = [...preferences, ...contexts, ...facts].slice(0, MAX_MEMORIES);

    this.selectedMemoryItems = topMemories.map((m) => ({
      key: m.key,
      type: m.type,
      score: m.score,
    }));

    let memoryText = topMemories
      .map((m) => `${m.key}: ${m.value}`)
      .join("\n");

    // Truncate if over budget
    const memTokens = estimateTokens(memoryText);
    if (memTokens > MEMORY_SECTION_TOKEN_BUDGET) {
      memoryText = this.truncateText(memoryText, MEMORY_SECTION_TOKEN_BUDGET);
    }

    const content = memoryText
      ? `## 用户记忆\n${memoryText}`
      : "";
    return {
      name: "memory",
      content,
      tokens: estimateTokens(content),
      tier: "volatile",
    };
  }

  private buildSummarySection(): ContextSection | null {
    if (!this.summary) return null;

    let summaryText = this.summary;
    const summaryTokens = estimateTokens(summaryText);
    if (summaryTokens > SUMMARY_TOKEN_BUDGET) {
      summaryText = this.truncateText(summaryText, SUMMARY_TOKEN_BUDGET);
    }

    const content = `## 之前的对话摘要\n${summaryText}`;
    return {
      name: "conversation-summary",
      content,
      tokens: estimateTokens(content),
      tier: "context",
    };
  }

  private buildConversationInfoSection(): ContextSection {
    const content = `## 当前对话信息
当前进行的对话记录 ID (conversationId) 是: \`${this.conversationId || "未知"}\`。
如果用户通过文字或语音指令要求删除当前对话、删除本轮对话、清除这个会话或删除这次聊天，你应该直接调用 \`deleteConversation\` 工具，并传入当前对话 ID 作为参数。`;
    return { name: "conversation", content, tokens: estimateTokens(content), tier: "volatile" };
  }

  private buildDateSection(): ContextSection {
    const content = `## 当前日期\n${new Date().toISOString().split("T")[0]}`;
    return { name: "date", content, tokens: estimateTokens(content), tier: "volatile" };
  }

  // ---- Helpers ----

  /**
   * Truncate text to fit within a token budget.
   * Preserves head (70%) and tail (30%) with a truncation notice.
   */
  private truncateText(text: string, maxTokens: number): string {
    // Rough char limit from token budget
    const charLimit = Math.floor(maxTokens / 0.45);
    if (text.length <= charLimit) return text;

    const headSize = Math.floor(charLimit * 0.7);
    const tailSize = Math.floor(charLimit * 0.3);
    const head = text.slice(0, headSize);
    const tail = text.slice(-tailSize);
    return `${head}\n\n[... 内容已截断 ...]\n\n${tail}`;
  }

  /**
   * Build debug information about the context assembly.
   */
  private buildDebugInfo(
    memories: ScoredMemoryRow[],
    tokens: ContextDebugInfo["tokens"],
    tierTokens?: ContextDebugInfo["tierTokens"],
  ): ContextDebugInfo {
    return {
      mode: this.mode,
      modelName: this.modelName,
      sections: this.sections,
      tools: {
        total: getAllJarvisTools().length,
        selected: this.selectedToolNames.length,
        names: this.selectedToolNames,
      },
      memories: {
        total: memories.length,
        selected: this.selectedMemoryItems.length,
        items: this.selectedMemoryItems,
      },
      summaryInjected: !!this.summary,
      tokens,
      tierTokens: tierTokens ?? { stable: 0, context: 0, volatile: 0 },
    };
  }
}
