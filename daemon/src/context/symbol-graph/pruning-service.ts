/**
 * Pruning Service — high-level facade for adaptive AST context pruning.
 *
 * Provides convenient helpers for callers (e.g. tools, context builder) to obtain
 * compact, high-density code context without full-file token overhead.
 */

import { generateFileSkeleton, estimateTokens } from "./symbol-extractor.js";
import { SymbolGraph, type PrunedContextResult } from "./symbol-graph.js";

export interface AdaptiveContextOptions {
  filePath: string;
  sourceCode: string;
  /** Optional specific symbol to focus on (keeps 100% implementation body). */
  focalSymbolName?: string;
  /** Optional related files to index into the symbol topology graph. */
  relatedFiles?: Array<{ filePath: string; sourceCode: string }>;
  /** Hard token ceiling for the returned context block. Default 4000. */
  maxTokens?: number;
}

export interface AdaptiveContextSummary {
  mode: "focal_with_neighborhood" | "file_skeleton";
  targetName?: string;
  markdown: string;
  tokenCount: number;
  compressionRatio: number;
}

/**
 * Builds an adaptive code context block for an agent.
 *
 * When `focalSymbolName` is supplied, extracts the target's full implementation and
 * prunes its 1-hop callers and callees into lightweight AST skeletons.
 * When omitted, generates an interface/class signature skeleton of the whole file.
 */
export function buildAdaptiveCodeContext(
  options: AdaptiveContextOptions,
): AdaptiveContextSummary {
  const { filePath, sourceCode, focalSymbolName, relatedFiles = [], maxTokens = 4000 } = options;

  if (focalSymbolName && focalSymbolName.trim().length > 0) {
    const graph = new SymbolGraph();
    graph.addSourceFile(filePath, sourceCode);

    for (const rel of relatedFiles) {
      graph.addSourceFile(rel.filePath, rel.sourceCode);
    }

    const pruned: PrunedContextResult = graph.pruneAroundFocalSymbol(focalSymbolName.trim(), {
      maxTokens,
    });

    return {
      mode: "focal_with_neighborhood",
      targetName: focalSymbolName.trim(),
      markdown: pruned.contextMarkdown,
      tokenCount: pruned.tokenCount,
      compressionRatio: pruned.compressionRatio,
    };
  }

  // Fall back to whole-file signature skeleton
  const skeletonMarkdown = generateFileSkeleton(filePath, sourceCode);
  const actualTokens = estimateTokens(skeletonMarkdown);
  const fullTokens = estimateTokens(sourceCode);
  const savedTokens = Math.max(0, fullTokens - actualTokens);
  const compressionRatio = fullTokens > 0 ? Number((savedTokens / fullTokens).toFixed(2)) : 0.0;

  return {
    mode: "file_skeleton",
    markdown: skeletonMarkdown,
    tokenCount: actualTokens,
    compressionRatio,
  };
}
