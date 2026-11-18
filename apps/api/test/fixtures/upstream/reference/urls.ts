import { photonSearchUrl, osrmRouteUrl } from './mappers.ts';
console.log(photonSearchUrl('https://photon.komoot.io', {
  text: '  Pastéis   de Belém ', locale: 'pt-BR', intent: 'autocomplete',
  bias: { center: { lng: -9.20334, lat: 38.69752 }, zoom: 14.3 },
  within: { west: -9.25, south: 38.68, east: -9.12, north: 38.75 },
  categories: ['cafe', 'food'], limit: 5,
}));
console.log(osrmRouteUrl('https://routing.openstreetmap.de', 'walk', [
  { lng: -9.1366, lat: 38.7075 }, { lng: -9.1335, lat: 38.7139 }, { lng: -30.0, lat: 35.0 },
]));
