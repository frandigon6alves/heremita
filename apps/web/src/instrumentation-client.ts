import { config } from 'zod/v4/core';

// Before any app module constructs a zod schema: zod decides whether to JIT
// while building schemas, by probing `Function("")`, which our CSP (no
// 'unsafe-eval') blocks and reports as a `securitypolicyviolation`.
config({ jitless: true });
