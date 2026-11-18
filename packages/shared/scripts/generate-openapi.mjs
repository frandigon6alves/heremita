// Writes packages/shared/openapi.json from the compiled endpoint table.
// Run through `pnpm --filter @heremita/shared openapi:generate`, which builds dist first
// and formats the file with Prettier afterwards.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildOpenApiDocument } from '../dist/openapi/document.js';

const target = fileURLToPath(new URL('../openapi.json', import.meta.url));
writeFileSync(target, JSON.stringify(buildOpenApiDocument()));
process.stdout.write(`Wrote ${target}\n`);
