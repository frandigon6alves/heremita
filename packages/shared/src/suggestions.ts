import { z } from 'zod';
import { localeSchema } from './common.js';
import { LIMITS } from './limits.js';
import { placeResultSchema } from './places.js';
import { textSchema } from './text.js';

/** E52: what the owner asks for ("street food and viewpoints, little walking"). */
export const suggestPlacesBodySchema = z
  .strictObject({
    prompt: textSchema(3, LIMITS.SUGGEST_PROMPT_MAX),
    /** Language of the reasons, and of the place names the geocoder answers with. */
    locale: localeSchema,
    count: z.int().min(1).max(LIMITS.SUGGEST_COUNT.max).default(LIMITS.SUGGEST_COUNT.default),
  })
  .meta({ id: 'SuggestPlacesBody' });
export type SuggestPlacesBody = z.input<typeof suggestPlacesBodySchema>;

/** A real place the geocoder found for one of the model's ideas, with the model's reason for it. */
export const placeSuggestionSchema = z
  .object({ place: placeResultSchema, reason: z.string() })
  .meta({ id: 'PlaceSuggestion' });
export type PlaceSuggestion = z.infer<typeof placeSuggestionSchema>;

/** `dropped` counts the ideas no real place nearby matched (never shown). */
export const placeSuggestionsSchema = z
  .object({ items: z.array(placeSuggestionSchema), dropped: z.int().min(0) })
  .meta({ id: 'PlaceSuggestions' });
export type PlaceSuggestions = z.infer<typeof placeSuggestionsSchema>;
