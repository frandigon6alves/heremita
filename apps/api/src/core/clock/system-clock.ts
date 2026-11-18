import type { Clock } from './clock.js';

/** The real time. The only place in the API allowed to call `new Date()`. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
