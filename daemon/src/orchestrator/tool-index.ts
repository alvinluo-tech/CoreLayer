import type { JarvisTool } from "@jarvis/types";

/**
 * Lightweight TF-IDF based tool index for semantic tool selection.
 * No external embedding API required - uses local text similarity.
 *
 * Supports three-tier tool classification:
 * - core: Always injected (bash, file operations, etc.)
 * - domain: Injected based on detected conversation domain
 * - mcp: Dynamic tools from MCP servers, ranked by usage frequency
 */

/** Tool tier classification for injection strategy */
export type ToolTier = "core" | "domain" | "mcp";

interface ToolEntry {
  tool: JarvisTool;
  tfidf: Map<string, number>;
  text: string;
  tier: ToolTier;
  /** Usage count for frequency-based ranking */
  usageCount: number;
  /** Last time this tool was used */
  lastUsedAt: number;
}

// ---- Tool Tier Classification ----

/** Core tools that are always injected regardless of domain */
const CORE_TOOL_PATTERNS = new Set([
  "bash", "readfile", "writefile", "editfile", "glob", "grep",
  "deleteconversation", "read", "write", "edit",
]);

/** Domain keywords for tool classification */
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  productivity: ["task", "todo", "calendar", "schedule", "reminder", "任务", "待办", "日程", "提醒"],
  reading: ["reading", "article", "book", "阅读", "文章", "书籍", "书"],
  fitness: ["fitness", "workout", "exercise", "health", "健身", "运动", "锻炼"],
  communication: ["message", "email", "chat", "消息", "邮件", "聊天"],
  data: ["database", "query", "search", "数据", "查询", "搜索"],
  media: ["image", "video", "audio", "photo", "图片", "视频", "音频"],
  automation: ["cron", "schedule", "trigger", "定时", "调度", "触发"],
};

/** Tool tier classification result */
export interface ToolClassification {
  tier: ToolTier;
  domain?: string;
}

/**
 * Classify a tool into a tier based on its name, source, and category.
 */
export function classifyToolTier(tool: JarvisTool): ToolClassification {
  const nameLower = tool.name.toLowerCase();

  // Check if it's a core tool
  if (CORE_TOOL_PATTERNS.has(nameLower)) {
    return { tier: "core" };
  }

  // MCP tools are always dynamic
  if (tool.source === "mcp") {
    return { tier: "mcp" };
  }

  // REST tools are dynamic
  if (tool.source === "rest") {
    return { tier: "mcp" };
  }

  // Native tools: check category and name for domain
  if (tool.category) {
    const domain = tool.category.toLowerCase();
    if (DOMAIN_KEYWORDS[domain]?.some(kw => nameLower.includes(kw))) {
      return { tier: "domain", domain };
    }
  }

  // Check tool name against domain keywords
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.some(kw => nameLower.includes(kw))) {
      return { tier: "domain", domain };
    }
  }

  // Default: domain tier with no specific domain
  return { tier: "domain" };
}

/**
 * Detect the primary domain from conversation history.
 */
export function detectDomain(history: { content: string }[]): string | null {
  if (history.length === 0) return null;

  // Combine recent messages for domain detection
  const recentText = history
    .slice(-5)
    .map(m => m.content.toLowerCase())
    .join(" ");

  let bestDomain: string | null = null;
  let bestScore = 0;

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const score = keywords.filter(kw => recentText.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }

  return bestScore >= 2 ? bestDomain : null;
}

// Common stop words to ignore
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "both",
  "each", "few", "more", "most", "other", "some", "such", "no", "nor",
  "not", "only", "own", "same", "so", "than", "too", "very", "just",
  "don", "now",
  // Chinese stop words
  "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一",
  "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有",
  "看", "好", "自己", "这", "他", "她", "它", "们", "那", "被", "从",
  "把", "让", "用", "为", "以", "与", "及", "或", "但", "而", "如果",
  "虽然", "因为", "所以", "这个", "那个", "什么", "怎么", "为什么",
]);

/**
 * Check if a character is CJK (Chinese/Japanese/Korean).
 */
function isCjk(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
    (code >= 0xf900 && code <= 0xfaff)    // CJK Compatibility Ideographs
  );
}

/**
 * Tokenize text into words, lowercased and filtered.
 * Handles both English words and Chinese characters.
 */
function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];

  // Extract English words
  const englishWords = lower.match(/[a-z0-9]+/g) ?? [];
  for (const word of englishWords) {
    if (word.length > 1 && !STOP_WORDS.has(word)) {
      tokens.push(word);
    }
  }

  // Extract Chinese characters and bigrams
  const cjkChars = lower.split("").filter(isCjk);
  for (const char of cjkChars) {
    if (!STOP_WORDS.has(char)) {
      tokens.push(char);
    }
  }

  // Add Chinese bigrams for better matching
  for (let i = 0; i < cjkChars.length - 1; i++) {
    const bigram = cjkChars[i] + cjkChars[i + 1];
    if (!STOP_WORDS.has(bigram)) {
      tokens.push(bigram);
    }
  }

  return tokens;
}

/**
 * Compute TF-IDF vector for a document.
 */
function computeTfIdf(
  terms: string[],
  idf: Map<string, number>
): Map<string, number> {
  const tf = new Map<string, number>();
  for (const term of terms) {
    tf.set(term, (tf.get(term) ?? 0) + 1);
  }

  const tfidf = new Map<string, number>();
  for (const [term, count] of tf) {
    const termFreq = count / terms.length;
    const inverseFreq = idf.get(term) ?? 1;
    tfidf.set(term, termFreq * inverseFreq);
  }
  return tfidf;
}

/**
 * Compute cosine similarity between two TF-IDF vectors.
 */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [term, value] of a) {
    normA += value * value;
    const bValue = b.get(term);
    if (bValue !== undefined) {
      dotProduct += value * bValue;
    }
  }

  for (const value of b.values()) {
    normB += value * value;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class ToolIndex {
  private entries: ToolEntry[] = [];
  private idf: Map<string, number> = new Map();
  private dirty = true;

  /**
   * Add a tool to the index.
   */
  addTool(tool: JarvisTool): void {
    const text = `${tool.name} ${tool.title} ${tool.description}`.trim();
    const classification = classifyToolTier(tool);
    this.entries.push({
      tool,
      tfidf: new Map(),
      text,
      tier: classification.tier,
      usageCount: 0,
      lastUsedAt: 0,
    });
    this.dirty = true;
  }

  /**
   * Add multiple tools to the index.
   */
  addTools(tools: JarvisTool[]): void {
    for (const tool of tools) {
      this.addTool(tool);
    }
  }

  /**
   * Remove a tool from the index by ID.
   */
  removeTool(toolId: string): boolean {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.tool.id !== toolId);
    if (this.entries.length < before) {
      this.dirty = true;
      return true;
    }
    return false;
  }

  /**
   * Record a tool usage for frequency-based ranking.
   */
  recordUsage(toolId: string): void {
    const entry = this.entries.find((e) => e.tool.id === toolId);
    if (entry) {
      entry.usageCount++;
      entry.lastUsedAt = Date.now();
    }
  }

  /**
   * Get tools by tier.
   */
  getToolsByTier(tier: ToolTier): JarvisTool[] {
    return this.entries
      .filter((e) => e.tier === tier)
      .map((e) => e.tool);
  }

  /**
   * Get tools for a specific domain.
   */
  getToolsForDomain(domain: string | null): JarvisTool[] {
    if (!domain) {
      return this.entries
        .filter((e) => e.tier === "domain" && !e.tool.category)
        .map((e) => e.tool);
    }

    return this.entries
      .filter((e) => {
        if (e.tier !== "domain") return false;
        const toolDomain = e.tool.category?.toLowerCase();
        return toolDomain === domain;
      })
      .map((e) => e.tool);
  }

  /**
   * Get MCP tools sorted by usage frequency (most used first).
   */
  getMcpToolsSortedByFrequency(): JarvisTool[] {
    return this.entries
      .filter((e) => e.tier === "mcp")
      .sort((a, b) => {
        // Sort by usage count (descending), then by last used time (most recent first)
        if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
        return b.lastUsedAt - a.lastUsedAt;
      })
      .map((e) => e.tool);
  }

  /**
   * Rebuild the index (recompute IDF and TF-IDF vectors).
   */
  rebuild(): void {
    if (!this.dirty && this.entries.every((e) => e.tfidf.size > 0)) {
      return;
    }

    // Compute document frequency
    const df = new Map<string, number>();
    const allTerms: string[][] = [];

    for (const entry of this.entries) {
      const terms = tokenize(entry.text);
      allTerms.push(terms);
      const uniqueTerms = new Set(terms);
      for (const term of uniqueTerms) {
        df.set(term, (df.get(term) ?? 0) + 1);
      }
    }

    // Compute IDF
    const N = this.entries.length;
    this.idf = new Map();
    for (const [term, count] of df) {
      this.idf.set(term, Math.log((N + 1) / (count + 1)) + 1);
    }

    // Compute TF-IDF for each entry
    for (let i = 0; i < this.entries.length; i++) {
      this.entries[i].tfidf = computeTfIdf(allTerms[i], this.idf);
    }

    this.dirty = false;
  }

  /**
   * Search for tools most relevant to a query.
   * Returns top K tools sorted by relevance score.
   */
  searchTools(query: string, topK: number = 8): { tool: JarvisTool; score: number }[] {
    this.rebuild();

    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) {
      return this.entries.slice(0, topK).map((e) => ({ tool: e.tool, score: 0 }));
    }

    const queryTfidf = computeTfIdf(queryTerms, this.idf);

    const scored = this.entries
      .map((entry) => ({
        tool: entry.tool,
        score: cosineSimilarity(queryTfidf, entry.tfidf),
      }))
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, topK);
  }

  /**
   * Get all tools in the index.
   */
  getAllTools(): JarvisTool[] {
    return this.entries.map((e) => e.tool);
  }

  /**
   * Get the number of tools in the index.
   */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Clear the index.
   */
  clear(): void {
    this.entries = [];
    this.idf = new Map();
    this.dirty = true;
  }
}

// Singleton instance
let globalIndex: ToolIndex | null = null;

/**
 * Get or create the global tool index.
 */
export function getToolIndex(): ToolIndex {
  if (!globalIndex) {
    globalIndex = new ToolIndex();
  }
  return globalIndex;
}

/**
 * Reset the global tool index (for testing).
 */
export function resetToolIndex(): void {
  globalIndex = null;
}
