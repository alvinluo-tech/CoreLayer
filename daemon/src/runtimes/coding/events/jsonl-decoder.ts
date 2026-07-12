export interface DecodedCliEvent {
  text: string;
  native: Record<string, unknown>;
}

export class JsonlEventDecoder {
  private buffer = "";

  push(chunk: string): DecodedCliEvent[] {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";
    return lines.flatMap((line) => this.decodeLine(line));
  }

  flush(): DecodedCliEvent[] {
    const tail = this.buffer;
    this.buffer = "";
    return this.decodeLine(tail);
  }

  private decodeLine(line: string): DecodedCliEvent[] {
    const trimmed = line.trim();
    if (!trimmed) return [];
    try {
      const native = JSON.parse(trimmed) as Record<string, unknown>;
      const item = native.item && typeof native.item === "object"
        ? native.item as Record<string, unknown>
        : undefined;
      const part = native.part && typeof native.part === "object"
        ? native.part as Record<string, unknown>
        : undefined;
      const text = [native.text, native.result, native.message, item?.text, part?.text]
        .find((value): value is string => typeof value === "string") ?? trimmed;
      return [{ text, native }];
    } catch {
      return [{ text: trimmed, native: { raw: trimmed } }];
    }
  }
}
