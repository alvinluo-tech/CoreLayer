/**
 * Tool Discovery — meta-tool allowing agents to inspect and discover unmounted tools.
 *
 * In a large ecosystem with dozens or hundreds of MCP/domain tools, presenting all schemas
 * directly to the LLM exhausts token budgets and causes function-calling confusion.
 * The `search_tools` meta-tool enables on-demand capability lookup: the model can
 * search for tools by keyword or domain intent, see their signatures and descriptions,
 * and decide how to proceed.
 */

import { tool } from "ai";
import { z } from "zod";
import { registerTool, getAllJarvisTools } from "./registry.js";
import { getDynamicToolRouter } from "../../routing/tool-router.js";

interface SearchToolsArgs {
  query: string;
  limit?: number;
}

export function registerToolDiscoveryTools(): number {
  registerTool(
    "search_tools",
    tool({
      description:
        "Search the full catalog of available tools (including all MCP, domain, and external tools). " +
        "Use this when standard core tools cannot fulfill the user's request and you need to " +
        "discover specialized capabilities, inspect their parameters, and plan their usage.",
      parameters: z.object({
        query: z
          .string()
          .min(1)
          .describe("Capability, domain, or keyword to search for (e.g. 'github pr', 'database query', 'weather')"),
        limit: z
          .number()
          .int()
          .positive()
          .max(20)
          .optional()
          .describe("Maximum number of tools to return (default 5)"),
      }),
      execute: async (args: SearchToolsArgs) => {
        const limit = args.limit ?? 5;
        const allJarvis = getAllJarvisTools();

        if (allJarvis.length === 0) {
          return {
            query: args.query,
            totalFound: 0,
            tools: [],
            note: "No tools are currently registered in the runtime catalog.",
          };
        }

        const router = getDynamicToolRouter();
        const scored = router.searchJarvisTools(allJarvis, args.query, limit);
        const matches = scored
          .filter((s) => s.score > 0)
          .map((s) => ({
            id: s.tool.id,
            name: s.tool.name,
            title: s.tool.title,
            description: s.tool.description,
            source: s.tool.source,
            category: s.tool.category,
            inputSchema: s.tool.inputSchema,
            score: Number(s.score.toFixed(3)),
          }));

        return {
          query: args.query,
          totalFound: matches.length,
          tools: matches,
          note:
            matches.length > 0
              ? `Found ${matches.length} matching tool(s). You may reference them in your execution plan.`
              : `No tools matched query "${args.query}". Try a different keyword or check available system tools.`,
        };
      },
    } as never),
  );

  return 1;
}
