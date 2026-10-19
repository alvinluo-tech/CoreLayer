/**
 * Decode acpx `--format json` output.
 *
 * acpx emits raw ACP JSON-RPC messages, one per line, with no envelope. Both
 * directions are on the same stream: requests to the agent (`"id"` +
 * `"method"`), responses (`"id"` + `"result"`/`"error"`), and notifications
 * (`"method"` without `"id"`). Non-JSON lines can still appear on stdout when
 * strict mode is off, so unparseable lines are ignored rather than fatal.
 */

export interface AcpJsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string; data?: unknown };
}

export class AcpStreamDecoder {
  private buffer = "";

  push(chunk: string): AcpJsonRpcMessage[] {
    this.buffer += chunk;
    const messages: AcpJsonRpcMessage[] = [];

    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line) {
        const parsed = parseLine(line);
        if (parsed) messages.push(parsed);
      }
      newlineIndex = this.buffer.indexOf("\n");
    }

    return messages;
  }

  /** Flush a trailing partial line at process exit. */
  flush(): AcpJsonRpcMessage[] {
    const line = this.buffer.trim();
    this.buffer = "";
    if (!line) return [];
    const parsed = parseLine(line);
    return parsed ? [parsed] : [];
  }
}

function parseLine(line: string): AcpJsonRpcMessage | undefined {
  // acpx text-mode notices may be interleaved; only JSON objects are protocol.
  if (!line.startsWith("{")) return undefined;
  try {
    const value = JSON.parse(line) as AcpJsonRpcMessage;
    if (!value || typeof value !== "object") return undefined;
    return value;
  } catch {
    return undefined;
  }
}

/** True when the message is a `session/update` notification. */
export function isSessionUpdate(message: AcpJsonRpcMessage): boolean {
  return message.method === "session/update" && !hasId(message);
}

/** True when the message is a `session/request_permission` client request. */
export function isPermissionRequest(message: AcpJsonRpcMessage): boolean {
  return message.method === "session/request_permission" && hasId(message);
}

/** True when the message answers the `session/prompt` request. */
export function isPromptResponse(message: AcpJsonRpcMessage): boolean {
  return message.method === undefined && (message.result !== undefined || message.error !== undefined);
}

/** True when the message is a JSON-RPC error. */
export function isErrorResponse(message: AcpJsonRpcMessage): boolean {
  return message.method === undefined && message.error !== undefined;
}

function hasId(message: AcpJsonRpcMessage): boolean {
  return message.id !== undefined && message.id !== null;
}
