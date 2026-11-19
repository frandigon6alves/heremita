import { z } from 'zod';
import { cleanText } from './clean-text.js';

/**
 * User free text: cleaned by `cleanText`, then length-checked on the cleaned value.
 * OpenAPI cannot see through the transform, so the bounds are restated for the document.
 */
export function textSchema(min: number, max: number) {
  return z
    .string()
    .transform(cleanText)
    .pipe(z.string().min(min).max(max))
    .meta({ override: { minLength: min, maxLength: max } });
}
