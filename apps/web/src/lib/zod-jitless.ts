import { disableZodJit } from '@heremita/shared/zod-config';

// Imported first by every browser path to a zod schema (`schemas.ts`,
// `api/problem-schema.ts`): ES modules run their imports in order, so this runs
// before the shared modules build their schemas. See `disableZodJit`.
disableZodJit();
