import type { Clock } from '../../core/clock/clock.js';

export interface TokenBucketConfig {
  /** Tokens available at once (burst). */
  capacity: number;
  /** One token comes back every `intervalMs`. */
  intervalMs: number;
}

/** Classic token bucket on an injected clock. Starts full. */
export class TokenBucket {
  private tokens: number;
  private updatedAt: number;

  constructor(
    private readonly config: TokenBucketConfig,
    private readonly clock: Clock,
  ) {
    this.tokens = config.capacity;
    this.updatedAt = clock.now().getTime();
  }

  /** Takes a token and returns 0, or takes nothing and returns the ms until one is available. */
  tryTake(): number {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }
    return Math.ceil((1 - this.tokens) * this.config.intervalMs);
  }

  private refill(): void {
    const now = this.clock.now().getTime();
    const earned = (now - this.updatedAt) / this.config.intervalMs;
    this.tokens = Math.min(this.config.capacity, this.tokens + earned);
    this.updatedAt = now;
  }
}
