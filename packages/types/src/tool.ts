/**
 * Simplified JSON Schema type for tool input/output definitions.
 */
export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  description?: string;
  default?: unknown;
  [key: string]: unknown;
}

export type ToolSource = "mcp" | "native" | "skill" | "rest";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type ToolCategory =
  | "productivity"
  | "communication"
  | "system"
  | "data"
  | "media"
  | "automation"
  | "other";

export type ToolDisplayMode = "inline" | "card" | "silent" | "confirm";

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface JarvisTool {
  id: string;
  appId: string;
  source: ToolSource;
  name: string;
  title: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
  risk: RiskLevel;
  permissions: string[];
  requiresConfirmation: boolean;
  execute: (args: unknown) => Promise<ToolResult>;
  timeoutMs?: number;
  idempotent?: boolean;
  cancellable?: boolean;
  category?: ToolCategory;
  displayMode?: ToolDisplayMode;
}

export interface ToolCallLog {
  id: string;
  toolId: string;
  toolName: string;
  appId: string;
  source: ToolSource;
  args: unknown;
  result: ToolResult;
  risk: RiskLevel;
  confirmedByUser: boolean;
  durationMs: number;
  timestamp: string;
}

export interface ToolFilter {
  appId?: string;
  source?: ToolSource;
  risk?: RiskLevel;
  search?: string;
  category?: ToolCategory;
}
