import { config } from 'zod/v4/core';

/**
 * Turns zod's JIT off. The browser must call it before the first schema is
 * built: zod decides whether to compile parsers while building object schemas,
 * by probing `Function("")`, which a CSP without 'unsafe-eval' blocks and
 * reports as a `securitypolicyviolation`. The API keeps the JIT.
 */
export function disableZodJit(): void {
  config({ jitless: true });
}
