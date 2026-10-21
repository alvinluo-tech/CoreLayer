/**
 * Code Intelligence Tools — AST symbol skeleton extraction and adaptive context pruning.
 *
 * Exposes `get_code_skeleton` as a native tool for coding agents. Instead of
 * reading massive files using `readFile` (which exhausts token budgets and dilutes attention),
 * the agent can fetch high-density AST skeletons that preserve all type definitions,
 * function signatures, and JSDoc contracts while collapsing raw implementations.
 */

import { tool } from "ai";
import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { registerTool } from "./registry.js";
import { buildAdaptiveCodeContext } from "../../../../context/symbol-graph/pruning-service.js";

interface GetCodeSkeletonArgs {
  filePath: string;
  content?: string;
  focalSymbol?: string;
  maxTokens?: number;
}

export function registerCodeIntelligenceTools(): number {
  registerTool(
    "get_code_skeleton",
    tool({
      description:
        "Extract an AST-pruned code skeleton for a file or a specific focal symbol. " +
        "Preserves 100% of interfaces, types, parameters, and signatures while collapsing " +
        "irrelevant function bodies into '/* [body pruned] */'. " +
        "Achieves 80%-95% token savings compared to reading full files.",
      parameters: z.object({
        filePath: z
          .string()
          .min(1)
          .describe("Relative or absolute path to the TypeScript/JavaScript source file"),
        content: z
          .string()
          .optional()
          .describe("Optional inline source code. If omitted, reads the file from disk"),
        focalSymbol: z
          .string()
          .optional()
          .describe(
            "Optional specific function or class name to focus on. If specified, returns " +
            "100% full implementation for this symbol and collapses its 1-hop callers and callees",
          ),
        maxTokens: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Token budget ceiling for the output skeleton (default 4000)"),
      }),
      execute: async (args: GetCodeSkeletonArgs) => {
        let sourceCode = args.content;

        if (!sourceCode) {
          const absPath = resolve(process.cwd(), args.filePath);
          if (!existsSync(absPath)) {
            return {
              error: `File not found: ${args.filePath}`,
              skeleton: "",
              tokenCount: 0,
              compressionRatio: 0.0,
            };
          }
          try {
            sourceCode = readFileSync(absPath, "utf-8");
          } catch (err) {
            return {
              error: `Failed to read file ${args.filePath}: ${err instanceof Error ? err.message : String(err)}`,
              skeleton: "",
              tokenCount: 0,
              compressionRatio: 0.0,
            };
          }
        }

        const summary = buildAdaptiveCodeContext({
          filePath: args.filePath,
          sourceCode,
          focalSymbolName: args.focalSymbol,
          maxTokens: args.maxTokens,
        });

        const percent = Math.round(summary.compressionRatio * 100);

        return {
          mode: summary.mode,
          targetName: summary.targetName,
          skeleton: summary.markdown,
          tokenCount: summary.tokenCount,
          compressionRatio: summary.compressionRatio,
          note: `Extracted ${summary.mode} (~${summary.tokenCount} tokens, ${percent}% compressed vs full unpruned source).`,
        };
      },
    } as never),
  );

  return 1;
}
