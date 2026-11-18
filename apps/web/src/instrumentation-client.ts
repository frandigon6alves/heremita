import { disableZodJit } from './lib/zod-jitless';

// Before any app module constructs a zod schema (see disableZodJit).
disableZodJit();
