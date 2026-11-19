import { REVIEW_SORTS } from '@heremita/shared/plain';
import { parseAsStringLiteral, useQueryState } from 'nuqs';

/** Place page `?sort=` (recent | lowest), replaced in history, never a server round trip. */
export function useReviewSort() {
  return useQueryState(
    'sort',
    parseAsStringLiteral(REVIEW_SORTS)
      .withDefault('recent')
      .withOptions({ history: 'replace', shallow: true }),
  );
}
