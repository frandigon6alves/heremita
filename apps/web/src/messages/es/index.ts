import type { Messages } from '../types';
import auth from './auth.json';
import common from './common.json';
import explore from './explore.json';
import itinerary from './itinerary.json';
import legal from './legal.json';
import map from './map.json';
import placeSearch from './place-search.json';
import reviews from './reviews.json';
import settings from './settings.json';
import trips from './trips.json';

export const messages = {
  common,
  auth,
  trips,
  itinerary,
  'place-search': placeSearch,
  reviews,
  explore,
  settings,
  map,
  legal,
} satisfies Messages;
