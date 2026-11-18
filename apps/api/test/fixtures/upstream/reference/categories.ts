// OSM class/type (Photon: osm_key/osm_value, Nominatim: category/type) -> Heremita category.
// Order of evaluation: exact "key=value" rule, then key default, then "other".

export const PLACE_CATEGORIES = [
  'sight', 'food', 'cafe', 'nightlife', 'lodging', 'shopping',
  'nature', 'beach', 'culture', 'transport', 'activity', 'other',
] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

const EXACT: Record<string, PlaceCategory> = {
  // beach
  'natural=beach': 'beach', 'leisure=beach_resort': 'beach',
  // culture
  'tourism=museum': 'culture', 'tourism=gallery': 'culture', 'amenity=theatre': 'culture',
  'amenity=arts_centre': 'culture', 'amenity=cinema': 'culture', 'amenity=library': 'culture',
  'amenity=planetarium': 'culture', 'amenity=concert_hall': 'culture', 'amenity=exhibition_centre': 'culture',
  // sight
  'tourism=attraction': 'sight', 'tourism=viewpoint': 'sight', 'tourism=artwork': 'sight',
  'amenity=place_of_worship': 'sight', 'amenity=fountain': 'sight', 'amenity=monastery': 'sight',
  'man_made=tower': 'sight', 'man_made=lighthouse': 'sight', 'man_made=watermill': 'sight',
  'man_made=pier': 'sight', 'building=cathedral': 'sight', 'building=church': 'sight',
  'building=chapel': 'sight', 'building=mosque': 'sight', 'building=temple': 'sight',
  'building=synagogue': 'sight', 'building=castle': 'sight', 'bridge=yes': 'sight',
  // food
  'amenity=restaurant': 'food', 'amenity=fast_food': 'food', 'amenity=food_court': 'food',
  // cafe (coffee, bakeries, sweets)
  'amenity=cafe': 'cafe', 'amenity=ice_cream': 'cafe', 'shop=bakery': 'cafe', 'shop=pastry': 'cafe',
  'shop=coffee': 'cafe', 'shop=tea': 'cafe', 'shop=confectionery': 'cafe', 'shop=ice_cream': 'cafe',
  // nightlife
  'amenity=bar': 'nightlife', 'amenity=pub': 'nightlife', 'amenity=nightclub': 'nightlife',
  'amenity=biergarten': 'nightlife', 'amenity=casino': 'nightlife', 'amenity=stripclub': 'nightlife',
  'amenity=hookah_lounge': 'nightlife', 'amenity=karaoke_box': 'nightlife',
  // lodging
  'tourism=hotel': 'lodging', 'tourism=hostel': 'lodging', 'tourism=guest_house': 'lodging',
  'tourism=motel': 'lodging', 'tourism=apartment': 'lodging', 'tourism=chalet': 'lodging',
  'tourism=alpine_hut': 'lodging', 'tourism=wilderness_hut': 'lodging', 'tourism=camp_site': 'lodging',
  'tourism=caravan_site': 'lodging', 'leisure=resort': 'lodging', 'building=hotel': 'lodging',
  // shopping (shop=* falls through to the key default)
  'amenity=marketplace': 'shopping',
  // nature (natural=* falls through to the key default)
  'leisure=park': 'nature', 'leisure=garden': 'nature', 'leisure=nature_reserve': 'nature',
  'boundary=national_park': 'nature', 'boundary=protected_area': 'nature', 'waterway=waterfall': 'nature',
  'landuse=forest': 'nature', 'tourism=picnic_site': 'nature',
  // transport (railway/aeroway/public_transport/aerialway fall through to key defaults)
  'amenity=bus_station': 'transport', 'amenity=ferry_terminal': 'transport', 'amenity=taxi': 'transport',
  'amenity=car_rental': 'transport', 'amenity=bicycle_rental': 'transport', 'amenity=parking': 'transport',
  'amenity=fuel': 'transport', 'amenity=charging_station': 'transport', 'highway=bus_stop': 'transport',
  'building=train_station': 'transport',
  // activity (sport/leisure fall through to key defaults)
  'tourism=theme_park': 'activity', 'tourism=zoo': 'activity', 'tourism=aquarium': 'activity',
  'tourism=wine_cellar': 'activity', 'craft=winery': 'activity', 'craft=brewery': 'activity',
  'amenity=public_bath': 'activity', 'amenity=dive_centre': 'activity', 'amenity=spa': 'activity',
  // things under generous key defaults that are NOT travel categories
  'tourism=information': 'other', 'leisure=playground': 'other', 'leisure=dog_park': 'other',
  'natural=tree': 'other', 'natural=tree_row': 'other', 'railway=level_crossing': 'other',
  'railway=crossing': 'other', 'railway=switch': 'other', 'railway=rail': 'other', 'railway=signal': 'other',
  'man_made=bridge': 'sight',
};

const KEY_DEFAULT: Record<string, PlaceCategory> = {
  historic: 'sight',
  shop: 'shopping',
  natural: 'nature',
  railway: 'transport', aeroway: 'transport', public_transport: 'transport', aerialway: 'transport',
  leisure: 'activity', sport: 'activity',
  tourism: 'sight',
};

export function categoryFromOsm(key: string | undefined, value: string | undefined): PlaceCategory {
  if (!key) return 'other';
  return EXACT[`${key}=${value ?? ''}`] ?? KEY_DEFAULT[key] ?? 'other';
}

// Reverse direction: Heremita category -> Photon `include` filters (verified syntax: osm.<key>.<value>,
// comma = OR, partial label path such as osm.historic allowed).
export const PHOTON_INCLUDE: Record<Exclude<PlaceCategory, 'other'>, string[]> = {
  sight: ['osm.tourism.attraction', 'osm.tourism.viewpoint', 'osm.tourism.artwork', 'osm.historic', 'osm.amenity.place_of_worship', 'osm.man_made.tower', 'osm.man_made.lighthouse'],
  food: ['osm.amenity.restaurant', 'osm.amenity.fast_food', 'osm.amenity.food_court'],
  cafe: ['osm.amenity.cafe', 'osm.amenity.ice_cream', 'osm.shop.bakery', 'osm.shop.pastry', 'osm.shop.coffee'],
  nightlife: ['osm.amenity.bar', 'osm.amenity.pub', 'osm.amenity.nightclub', 'osm.amenity.biergarten'],
  lodging: ['osm.tourism.hotel', 'osm.tourism.hostel', 'osm.tourism.guest_house', 'osm.tourism.motel', 'osm.tourism.apartment', 'osm.tourism.camp_site'],
  shopping: ['osm.shop', 'osm.amenity.marketplace'],
  // waterfalls are waterway=waterfall in OSM; osm.natural.waterfall only matched a few mis-tagged ones (2026-11-18)
  nature: ['osm.leisure.park', 'osm.leisure.garden', 'osm.leisure.nature_reserve', 'osm.natural.peak', 'osm.waterway.waterfall', 'osm.boundary.national_park'],
  beach: ['osm.natural.beach', 'osm.leisure.beach_resort'],
  culture: ['osm.tourism.museum', 'osm.tourism.gallery', 'osm.amenity.theatre', 'osm.amenity.arts_centre', 'osm.amenity.cinema', 'osm.amenity.library'],
  transport: ['osm.railway.station', 'osm.amenity.bus_station', 'osm.amenity.ferry_terminal', 'osm.aeroway.aerodrome', 'osm.railway.tram_stop'],
  activity: ['osm.tourism.theme_park', 'osm.tourism.zoo', 'osm.tourism.aquarium', 'osm.leisure.water_park', 'osm.leisure.stadium', 'osm.leisure.sports_centre'],
};
