// OSM class/type (Photon `osm_key`/`osm_value`, Nominatim `category`/`type`) → Heremita category.
// Evaluation order: exact `key=value`, then the key's default, then `other`.
import type { PlaceCategory } from '@heremita/shared';

type Rules = Partial<Record<PlaceCategory, Record<string, readonly string[]>>>;

const EXACT_RULES: Rules = {
  sight: {
    tourism: ['attraction', 'viewpoint', 'artwork'],
    amenity: ['place_of_worship', 'fountain', 'monastery'],
    man_made: ['tower', 'lighthouse', 'watermill', 'pier', 'bridge'],
    building: ['cathedral', 'church', 'chapel', 'mosque', 'temple', 'synagogue', 'castle'],
    bridge: ['yes'],
  },
  food: { amenity: ['restaurant', 'fast_food', 'food_court'] },
  cafe: {
    amenity: ['cafe', 'ice_cream'],
    shop: ['bakery', 'pastry', 'coffee', 'tea', 'confectionery', 'ice_cream'],
  },
  nightlife: {
    amenity: [
      'bar',
      'pub',
      'nightclub',
      'biergarten',
      'casino',
      'stripclub',
      'hookah_lounge',
      'karaoke_box',
    ],
  },
  lodging: {
    tourism: [
      'hotel',
      'hostel',
      'guest_house',
      'motel',
      'apartment',
      'chalet',
      'alpine_hut',
      'wilderness_hut',
      'camp_site',
      'caravan_site',
    ],
    leisure: ['resort'],
    building: ['hotel'],
  },
  shopping: { amenity: ['marketplace'] },
  nature: {
    leisure: ['park', 'garden', 'nature_reserve'],
    boundary: ['national_park', 'protected_area'],
    waterway: ['waterfall'],
    landuse: ['forest'],
    tourism: ['picnic_site'],
  },
  beach: { natural: ['beach'], leisure: ['beach_resort'] },
  culture: {
    tourism: ['museum', 'gallery'],
    amenity: [
      'theatre',
      'arts_centre',
      'cinema',
      'library',
      'planetarium',
      'concert_hall',
      'exhibition_centre',
    ],
  },
  transport: {
    amenity: [
      'bus_station',
      'ferry_terminal',
      'taxi',
      'car_rental',
      'bicycle_rental',
      'parking',
      'fuel',
      'charging_station',
    ],
    highway: ['bus_stop'],
    building: ['train_station'],
  },
  activity: {
    tourism: ['theme_park', 'zoo', 'aquarium', 'wine_cellar'],
    craft: ['winery', 'brewery'],
    amenity: ['public_bath', 'dive_centre', 'spa'],
  },
  // Things under generous key defaults that are not travel categories.
  other: {
    tourism: ['information'],
    leisure: ['playground', 'dog_park'],
    natural: ['tree', 'tree_row'],
    railway: ['level_crossing', 'crossing', 'switch', 'rail', 'signal'],
  },
};

const KEY_DEFAULTS: Record<string, PlaceCategory> = {
  historic: 'sight',
  tourism: 'sight',
  shop: 'shopping',
  natural: 'nature',
  railway: 'transport',
  aeroway: 'transport',
  public_transport: 'transport',
  aerialway: 'transport',
  leisure: 'activity',
  sport: 'activity',
};

const EXACT = new Map<string, PlaceCategory>(
  Object.entries(EXACT_RULES).flatMap(([category, byKey]) =>
    Object.entries(byKey).flatMap(([key, values]) =>
      values.map((value) => [`${key}=${value}`, category as PlaceCategory] as const),
    ),
  ),
);

export function categoryFromOsm(key: string | undefined, value: string | undefined): PlaceCategory {
  if (!key) {
    return 'other';
  }
  return EXACT.get(`${key}=${value ?? ''}`) ?? KEY_DEFAULTS[key] ?? 'other';
}
