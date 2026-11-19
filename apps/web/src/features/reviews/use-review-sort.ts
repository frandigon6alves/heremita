import { reviewSortSchema } from '@heremita/shared';
import { parseAsStringLiteral, useQueryState } from 'nuqs';

/** Place page `?sort=` (recent | lowest), replaced in history, never a server round trip. */
export function useReviewSort() {
  return useQueryState(
    'sort',
    parseAsStringLiteral(reviewSortSchema.options)
      .withDefault('recent')
      .withOptions({ history: 'replace', shallow: true }),
  );
}
