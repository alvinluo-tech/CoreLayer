/**
 * @deprecated REST adapter types. Kept for backward compatibility.
 * New tools should be registered as native tools or MCP servers.
 */

/**
 * @deprecated External app adapter — wraps a REST API as Jarvis tools.
 */

export interface AppConfig {
  /** Unique app identifier */
  appId: string;
  /** Human-readable app name */
  name: string;
  /** Base URL of the app's API */
  baseUrl: string;
  /** Authentication token (if required) */
  authToken?: string;
}

export interface AdapterToolDef {
  /** Tool name (unique within the adapter) */
  name: string;
  /** Display title */
  title: string;
  /** Tool description */
  description: string;
  /** Risk level */
  risk: "low" | "medium" | "high" | "critical";
  /** HTTP method */
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** API path (relative to baseUrl) */
  path: string;
  /** Input schema for the tool */
  inputSchema: Record<string, unknown>;
  /** Transform response before returning */
  responseTransform?: (data: unknown) => unknown;
}
