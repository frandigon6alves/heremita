import 'server-only';
import { parseServerEnv } from './env.schema';

/** Server-side environment, validated once when the server loads this module. */
export const env = parseServerEnv(process.env);
