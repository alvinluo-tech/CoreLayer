/**
 * Dynamic Tool Router — prevents tool spillover and schema token explosion.
 *
 * Problem:
 * When an agent runtime registers 50+ or 100+ tools (especially with rich MCP ecosystems),
 * passing the entire tool schema dictionary to the LLM consumes tens of thousands of tokens
 * per turn and degrades the model's function-calling accuracy.
 *
 * Solution (Two-Level Routing):
 * 1. Tier 1 (Core Tools): Essential OS, file, coding, delegation, and meta-discovery tools
 *    are ALWAYS mounted in the schema.
 * 2. Tier 2 (On-Demand Tools): MCP and specialized domain tools are dynamically recalled
 *    via semantic keyword matching (TF-IDF) against the user's intent.
 * 3. Hard Capacity Cap: The final tool dictionary passed to LLMs is strictly capped at
 *    `MAX_ACTIVE_TOOLS = 16` tools per turn.
 */

import type { JarvisTool } from "@jarvis/types";

export const CORE_TOOL_SET = new Set([
  "bash",
  "readFile",
  "writeFile",
  "editFile",
  "glob",
  "grep",
  "get_code_skeleton",
  "dispatch_agent",
  "run_task_graph",
  "search_tools",
  "deleteConversation",
  "previewConversationCleanup",
]);

export const DEFAULT_MAX_ACTIVE_TOOLS = 16;
export const DEFAULT_DYNAMIC_TOP_K = 6;

export interface RouteToolsOptions<T = unknown> {
  /** The full dictionary of registered tools in the runtime. */
  allTools: Record<string, T>;
  /** The user prompt or active turn objective used for intent matching. */
  query?: string;
  /** Full metadata objects for registered tools (if available). */
  jarvisTools?: JarvisTool[];
  /** Maximum tools to expose to the model in this turn. Default 16. */
  maxTools?: number;
}

export class DynamicToolRouter {
  private maxActiveTools: number;

  constructor(maxActiveTools = DEFAULT_MAX_ACTIVE_TOOLS) {
    this.maxActiveTools = maxActiveTools;
  }

  /**
   * Filters all registered tools down to a high-density, context-relevant subset.
   */
  public routeTools<T = unknown>(options: RouteToolsOptions<T>): Record<string, T> {
    const { allTools, query, jarvisTools, maxTools = this.maxActiveTools } = options;
    const allToolKeys = Object.keys(allTools);

    // Fast path: if total registered tools is already under the threshold, no filtering needed
    if (allToolKeys.length <= maxTools) {
      return allTools;
    }

    const activeTools: Record<string, T> = {};
    const remainingCandidateKeys = new Set<string>();

    // 1. Always retain active core tools
    for (const key of allToolKeys) {
      if (CORE_TOOL_SET.has(key) || this.isCorePattern(key)) {
        activeTools[key] = allTools[key];
      } else {
        remainingCandidateKeys.add(key);
      }
    }

    // Capacity check after core retention
    let remainingBudget = maxTools - Object.keys(activeTools).length;
    if (remainingBudget <= 0) {
      return activeTools;
    }

    // 2. Dynamic recall based on query intent
    const recalledKeys = this.recallRelevantToolKeys(
      Array.from(remainingCandidateKeys),
      query,
      jarvisTools,
      remainingBudget,
    );

    for (const key of recalledKeys) {
      activeTools[key] = allTools[key];
      remainingCandidateKeys.delete(key);
      remainingBudget--;
      if (remainingBudget <= 0) break;
    }

    // 3. Fallback padding if budget remains and query didn't match enough tools
    if (remainingBudget > 0 && remainingCandidateKeys.size > 0) {
      const sortedRemaining = Array.from(remainingCandidateKeys).sort();
      for (const key of sortedRemaining) {
        activeTools[key] = allTools[key];
        remainingBudget--;
        if (remainingBudget <= 0) break;
      }
    }

    return activeTools;
  }

  /**
   * Semantic TF-IDF search across JarvisTool metadata objects.
   */
  public searchJarvisTools(
    tools: JarvisTool[],
    query: string,
    topK = 5,
  ): Array<{ tool: JarvisTool; score: number }> {
    if (!query || query.trim().length === 0 || tools.length === 0) {
      return tools.slice(0, topK).map((tool) => ({ tool, score: 0 }));
    }

    const df = new Map<string, number>();
    const docTerms: string[][] = [];

    for (const tool of tools) {
      const text = `${tool.name} ${tool.title} ${tool.description} ${tool.category ?? ""}`;
      const terms = tokenize(text);
      docTerms.push(terms);
      const uniqueTerms = new Set(terms);
      for (const term of uniqueTerms) {
        df.set(term, (df.get(term) ?? 0) + 1);
      }
    }

    const N = tools.length;
    const idf = new Map<string, number>();
    for (const [term, count] of df) {
      idf.set(term, Math.log((N + 1) / (count + 1)) + 1);
    }

    const queryTerms = tokenize(query);
    const queryTfidf = computeTfIdf(queryTerms, idf);

    const scored = tools
      .map((tool, idx) => {
        const docTfidf = computeTfIdf(docTerms[idx], idf);
        return {
          tool,
          score: cosineSimilarity(queryTfidf, docTfidf),
        };
      })
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, topK);
  }

  private isCorePattern(name: string): boolean {
    const lower = name.toLowerCase();
    return (
      lower.includes("readfile") ||
      lower.includes("writefile") ||
      lower.includes("editfile") ||
      lower === "bash" ||
      lower === "glob" ||
      lower === "grep" ||
      lower === "search_tools" ||
      lower === "get_code_skeleton"
    );
  }

  private recallRelevantToolKeys(
    candidateKeys: string[],
    query: string | undefined,
    jarvisTools: JarvisTool[] | undefined,
    topK: number,
  ): string[] {
    if (!query || query.trim().length === 0) {
      return candidateKeys.slice(0, topK);
    }

    if (jarvisTools && jarvisTools.length > 0) {
      const candidateJarvis = jarvisTools.filter(
        (jt) => candidateKeys.includes(jt.name) || candidateKeys.includes(jt.id),
      );
      if (candidateJarvis.length > 0) {
        const searchResults = this.searchJarvisTools(candidateJarvis, query, topK);
        const scoredKeys = searchResults
          .filter((res) => res.score > 0)
          .map((res) => (candidateKeys.includes(res.tool.name) ? res.tool.name : res.tool.id));
        if (scoredKeys.length > 0) {
          return scoredKeys;
        }
      }
    }

    // Simple keyword token matching fallback
    const queryTokens = query.toLowerCase().split(/[\s,._-]+/).filter((t) => t.length > 1);
    if (queryTokens.length === 0) {
      return candidateKeys.slice(0, topK);
    }

    const scored = candidateKeys.map((key) => {
      const keyLower = key.toLowerCase();
      let matchCount = 0;
      for (const token of queryTokens) {
        if (keyLower.includes(token)) matchCount++;
      }
      return { key, score: matchCount };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.filter((s) => s.score > 0).slice(0, topK).map((s) => s.key);
  }
}

function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  const words = lower.split(/[^a-zA-Z0-9_\u4e00-\u9fa5]+/);
  for (const w of words) {
    if (w.length > 1) tokens.push(w);
  }
  return tokens;
}

function computeTfIdf(terms: string[], idf: Map<string, number>): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of terms) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  const tfidf = new Map<string, number>();
  for (const [t, count] of tf) {
    const termFreq = count / terms.length;
    const invFreq = idf.get(t) ?? 1;
    tfidf.set(t, termFreq * invFreq);
  }
  return tfidf;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (const [term, valA] of a) {
    normA += valA * valA;
    const valB = b.get(term);
    if (valB !== undefined) {
      dotProduct += valA * valB;
    }
  }
  for (const valB of b.values()) {
    normB += valB * valB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

let routerInstance: DynamicToolRouter | null = null;

export function getDynamicToolRouter(): DynamicToolRouter {
  if (!routerInstance) {
    routerInstance = new DynamicToolRouter();
  }
  return routerInstance;
}
