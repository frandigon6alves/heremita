import type { AddLayerObject } from 'maplibre-gl';

type FilterSpecification = NonNullable<Extract<AddLayerObject, { type: 'circle' }>['filter']>;

/** MapLibre's expression type, which the package does not export by name. */
export type ExpressionSpecification = Exclude<
  Extract<FilterSpecification, ['!', unknown]>[1],
  boolean
>;
