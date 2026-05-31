import type { AuditLogEntry } from '@jarvis/types';

export class AuditLog {
  private entries: AuditLogEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries: number = 1000) {
    this.maxEntries = maxEntries;
  }

  log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
    const fullEntry: AuditLogEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };

    this.entries.push(fullEntry);

    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    return fullEntry;
  }

  getEntries(limit?: number): AuditLogEntry[] {
    const entries = [...this.entries].reverse();
    return limit ? entries.slice(0, limit) : entries;
  }

  getEntriesByTool(toolId: string, limit?: number): AuditLogEntry[] {
    const entries = this.entries.filter((e) => e.toolId === toolId).reverse();
    return limit ? entries.slice(0, limit) : entries;
  }

  getEntriesByApp(appId: string, limit?: number): AuditLogEntry[] {
    const entries = this.entries.filter((e) => e.appId === appId).reverse();
    return limit ? entries.slice(0, limit) : entries;
  }

  getDeniedEntries(limit?: number): AuditLogEntry[] {
    const entries = this.entries.filter((e) => e.result === 'denied').reverse();
    return limit ? entries.slice(0, limit) : entries;
  }

  clear(): void {
    this.entries = [];
  }

  get size(): number {
    return this.entries.length;
  }
}
