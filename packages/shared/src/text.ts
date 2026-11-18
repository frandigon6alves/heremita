import { z } from 'zod';

// C0 controls except LF (U+000A), DEL, and C1 controls. CR goes too, so CRLF becomes LF.
// eslint-disable-next-line no-control-regex -- matching control characters is the purpose
const CONTROL_CHARS = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;
// Bidi embeddings, overrides and isolates: they let a display name spoof the text around it.
const BIDI_CONTROLS = /[‪-‮⁦-⁩]/g;
// Three or more blank lines (whitespace-only lines count as blank).
const EXCESS_BLANK_LINES = /\n(?:[^\S\n]*\n){3,}/g;

/**
 * Normalises user free text before any length check: NFC, control and bidi
 * characters removed, at most two consecutive blank lines, trimmed.
 */
export function cleanText(text: string): string {
  return text
    .normalize('NFC')
    .replace(CONTROL_CHARS, '')
    .replace(BIDI_CONTROLS, '')
    .replace(EXCESS_BLANK_LINES, '\n\n\n')
    .trim();
}

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
