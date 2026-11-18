import type { Clock } from './clock.js';

/** A clock that only moves when told to, for tests. */
export class FixedClock implements Clock {
  private current: number;

  constructor(start: Date | string) {
    this.current = new Date(start).getTime();
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current += milliseconds;
  }

  set(time: Date | string): void {
    this.current = new Date(time).getTime();
  }
}
