import type { Clock } from '../../core/clock/clock.js';

export interface CircuitBreakerConfig {
  /** Consecutive retryable failures that open the circuit. */
  failureThreshold: number;
  /** How long the circuit stays open before one probe goes through. */
  openMs: number;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Per-host breaker: after `failureThreshold` consecutive retryable failures
 * (timeouts, network errors, 5xx) every call fails fast for `openMs`; then a
 * single probe decides between closing and another open period.
 */
export class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;
  private probing = false;

  constructor(
    private readonly config: CircuitBreakerConfig,
    private readonly clock: Clock,
  ) {}

  get state(): CircuitState {
    if (this.failures < this.config.failureThreshold) {
      return 'closed';
    }
    return this.clock.now().getTime() < this.openUntil ? 'open' : 'half-open';
  }

  /** Whether a call may go out now. In half-open state only the first caller gets through. */
  tryPass(): boolean {
    const state = this.state;
    if (state === 'closed') {
      return true;
    }
    if (state === 'open' || this.probing) {
      return false;
    }
    this.probing = true;
    return true;
  }

  /** Ms until the circuit lets a probe through (0 when it is not open). */
  remainingOpenMs(): number {
    return Math.max(0, this.openUntil - this.clock.now().getTime());
  }

  /** The host answered (any status that is not a retryable failure). */
  recordAnswer(): void {
    this.failures = 0;
    this.probing = false;
  }

  /** The probe was cancelled by its caller before the host answered: let the next one try. */
  abandonProbe(): void {
    this.probing = false;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.probing || this.failures >= this.config.failureThreshold) {
      this.failures = Math.max(this.failures, this.config.failureThreshold);
      this.openUntil = this.clock.now().getTime() + this.config.openMs;
    }
    this.probing = false;
  }
}
