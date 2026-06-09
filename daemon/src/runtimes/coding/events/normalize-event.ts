/**
 * Shared event emitter for coding adapters.
 *
 * Extracts the duplicated emitEvent + eventQueues + sequenceCounter
 * pattern from individual adapters into a reusable class.
 */

import type {
  CodingRunEvent,
  NormalizedEvent,
} from "./coding-event.js";
import { getRepositories } from "../../../persistence/factory.js";

/** In-memory event queue for streaming */
interface EventQueue {
  events: NormalizedEvent[];
  resolve: () => void;
}

/**
 * Emit normalized events for a coding run.
 * Handles sequence numbering, in-memory streaming, and DB persistence.
 */
export class CodingEventEmitter {
  private sequenceCounter = 0;
  private eventQueues = new Map<string, EventQueue>();

  /**
   * Emit an event for a run.
   * Returns the normalized event for callers that need it.
   */
  emit(runId: string, event: CodingRunEvent): NormalizedEvent {
    const seq = ++this.sequenceCounter;
    const normalized: NormalizedEvent = {
      runId,
      sequence: seq,
      event,
      createdAt: new Date().toISOString(),
    };

    // In-memory streaming
    const queue = this.eventQueues.get(runId);
    if (queue) {
      queue.events.push(normalized);
      queue.resolve();
    }

    // Persist to agent_run_events table (best-effort)
    try {
      const { agentRunEvents } = getRepositories();
      agentRunEvents.create({
        runId,
        sequence: seq,
        type: event.type,
        payload: event,
      }).catch(() => {});
    } catch {
      // DB persistence is best-effort
    }

    return normalized;
  }

  /**
   * Set up an event queue for streaming events from a run.
   * Returns an async iterable that yields events as they arrive.
   */
  createStream(runId: string): {
    queue: EventQueue;
    iterable: AsyncIterable<NormalizedEvent>;
  } {
    let resolve: (() => void) | null = null;

    const queue: EventQueue = {
      events: [],
      resolve: () => resolve?.(),
    };
    this.eventQueues.set(runId, queue);

    const iterable: AsyncIterable<NormalizedEvent> = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            // Yield queued events
            if (queue.events.length > 0) {
              return { done: false, value: queue.events.shift()! };
            }

            // Wait for new events or timeout
            await new Promise<void>((r) => {
              resolve = r;
              setTimeout(r, 500);
            });

            if (queue.events.length > 0) {
              return { done: false, value: queue.events.shift()! };
            }

            return { done: true, value: undefined };
          },
        };
      },
    };

    return { queue, iterable };
  }

  /**
   * Clean up the event queue for a run.
   */
  cleanup(runId: string): void {
    this.eventQueues.delete(runId);
  }
}
