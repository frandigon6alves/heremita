type ZodGlobal = { __zod_globalConfig?: { jitless?: boolean } };

/**
 * Turns zod's JIT parser off in the browser. To decide whether it may JIT,
 * zod probes `Function("")` while the shared schemas are constructed; under
 * our CSP (no 'unsafe-eval') the probe is blocked and reported as a
 * `securitypolicyviolation`. zod keeps its config on
 * `globalThis.__zod_globalConfig` (adopting an existing object, keeping a
 * reference to it), so the flag is set on that object in place, before any
 * schema module loads. Called from
 * `instrumentation-client.ts`, which Next runs before the app's code.
 */
export function disableZodJit(target: ZodGlobal = globalThis as ZodGlobal): void {
  (target.__zod_globalConfig ??= {}).jitless = true;
}
