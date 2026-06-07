import type { ManagedRuntime } from './managed-runtime.js';
import type { RuntimeKind } from '@jarvis/runtime-protocol';

/**
 * Registry for managing all active runtimes.
 */
export interface RuntimeRegistry {
  /** Register a runtime */
  register(runtime: ManagedRuntime): void;

  /** Unregister a runtime */
  unregister(runtimeId: string): void;

  /** Get a runtime by ID */
  get(runtimeId: string): ManagedRuntime | undefined;

  /** Get all runtimes */
  getAll(): ManagedRuntime[];

  /** Get runtimes by kind */
  getByKind(kind: RuntimeKind): ManagedRuntime[];

  /** Check if a runtime is registered */
  has(runtimeId: string): boolean;

  /** Get count of registered runtimes */
  count(): number;
}

/**
 * In-memory implementation of RuntimeRegistry.
 */
export class InMemoryRuntimeRegistry implements RuntimeRegistry {
  private runtimes = new Map<string, ManagedRuntime>();

  register(runtime: ManagedRuntime): void {
    const info = runtime.getInfo();
    this.runtimes.set(info.id, runtime);
  }

  unregister(runtimeId: string): void {
    this.runtimes.delete(runtimeId);
  }

  get(runtimeId: string): ManagedRuntime | undefined {
    return this.runtimes.get(runtimeId);
  }

  getAll(): ManagedRuntime[] {
    return Array.from(this.runtimes.values());
  }

  getByKind(kind: RuntimeKind): ManagedRuntime[] {
    return this.getAll().filter((r) => r.getInfo().kind === kind);
  }

  has(runtimeId: string): boolean {
    return this.runtimes.has(runtimeId);
  }

  count(): number {
    return this.runtimes.size;
  }
}
