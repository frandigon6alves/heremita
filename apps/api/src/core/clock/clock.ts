/** Source of the current time. Inject it (`@Inject(CLOCK)`) instead of calling `new Date()`. */
export interface Clock {
  now(): Date;
}

/** Injection token of the `Clock`. */
export const CLOCK = Symbol('CLOCK');
