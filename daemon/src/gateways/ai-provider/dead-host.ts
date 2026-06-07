/**
 * Dead host management — tracks provider failures and applies cooldown.
 *
 * After 2 consecutive failures a provider is considered "dead" for 20 seconds.
 * A successful call resets the failure counter.
 */

interface HostState {
  consecutiveFailures: number;
  consecutiveCooldowns: number;
  deadUntil: number; // epoch ms; 0 = not dead
}

const FAILURE_THRESHOLD = 2;
const COOLDOWN_MS = 20_000;

export class DeadHostManager {
  private hosts = new Map<string, HostState>();

  /** Record a failed call to `provider`. */
  recordFailure(provider: string): void {
    const state = this.getState(provider);
    state.consecutiveFailures += 1;
    if (state.consecutiveFailures >= FAILURE_THRESHOLD) {
      const backoff = Math.pow(2, Math.min(state.consecutiveCooldowns, 3));
      state.deadUntil = Date.now() + COOLDOWN_MS * backoff;
      state.consecutiveCooldowns += 1;
    }
  }

  /** Record a successful call — resets failure counter and cooldown counter. */
  recordSuccess(provider: string): void {
    this.hosts.set(provider, { consecutiveFailures: 0, consecutiveCooldowns: 0, deadUntil: 0 });
  }

  /** Returns true if the provider is in cooldown. */
  isDead(provider: string): boolean {
    const state = this.hosts.get(provider);
    if (!state) return false;
    if (state.deadUntil === 0) return false;
    if (Date.now() >= state.deadUntil) {
      // Cooldown expired — auto-recover (preserve consecutiveCooldowns for backoff progression)
      state.consecutiveFailures = 0;
      state.deadUntil = 0;
      return false;
    }
    return true;
  }

  /** Reset all state (for testing). */
  reset(): void {
    this.hosts.clear();
  }

  /** Get remaining cooldown ms (0 if not dead). */
  remainingCooldown(provider: string): number {
    const state = this.hosts.get(provider);
    if (!state || state.deadUntil === 0) return 0;
    const remaining = state.deadUntil - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  private getState(provider: string): HostState {
    let state = this.hosts.get(provider);
    if (!state) {
      state = { consecutiveFailures: 0, consecutiveCooldowns: 0, deadUntil: 0 };
      this.hosts.set(provider, state);
    }
    return state;
  }
}

export const deadHostManager = new DeadHostManager();
