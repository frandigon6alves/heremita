// One-off generator for apps/api/src/providers/fake/gazetteer.ts (T13): runs the saved Photon
// answers (fixtures/upstream/responses-seed) through the reference mapper.
// Usage (from apps/api): node ../../docs/progress/t13/build-gazetteer.ts > src/providers/fake/gazetteer.ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  dedupePlaces,
  placeFromPhoton,
} from '../../../apps/api/test/fixtures/upstream/reference/mappers.ts';
import {
  PhotonEnvelope,
  PhotonFeature,
} from '../../../apps/api/test/fixtures/upstream/reference/upstream-schemas.ts';

const DIR = path.join(
  import.meta.dirname,
  '../../../apps/api/test/fixtures/upstream/responses-seed',
);
const CITY = {
  lisboa: 'lisboa',
  'sao-paulo': 'sao-paulo',
  rio: 'rio-de-janeiro',
  paris: 'paris',
} as const;

// [fileCity, query slug, OSM key wanted, constant name]
const PICKS: Array<[keyof typeof CITY, string, string, string]> = [
  ['lisboa', 'torre-de-belem', 'osm:W:24341353', 'torreDeBelem'],
  ['lisboa', 'mosteiro-dos-jeronimos', 'osm:R:3258300', 'mosteiroDosJeronimos'],
  ['lisboa', 'padrao-dos-descobrimentos', 'osm:W:152327819', 'padraoDosDescobrimentos'],
  ['lisboa', 'pasteis-de-belem', 'osm:N:398922337', 'pasteisDeBelem'],
  ['lisboa', 'pasteis-de-belem', 'osm:N:1513483139', 'manteigaria'],
  ['lisboa', 'lx-factory', 'osm:W:221960606', 'lxFactory'],
  ['lisboa', 'museu-nacional-de-arte-antiga', 'osm:W:98656587', 'museuNacionalDeArteAntiga'],
  ['lisboa', 'jardim-da-estrela', 'osm:W:23697561', 'jardimDaEstrela'],
  ['lisboa', 'praca-do-comercio', 'osm:W:677181958', 'pracaDoComercio'],
  ['lisboa', 'elevador-de-santa-justa', 'osm:W:115238861', 'elevadorDeSantaJusta'],
  ['lisboa', 'a-brasileira', 'osm:N:489736332', 'aBrasileira'],
  ['lisboa', 'se-de-lisboa', 'osm:R:19372558', 'seDeLisboa'],
  ['lisboa', 'castelo-de-sao-jorge', 'osm:W:1382432568', 'casteloDeSaoJorge'],
  ['lisboa', 'miradouro-de-santa-luzia', 'osm:N:5446794770', 'miradouroDeSantaLuzia'],
  ['lisboa', 'miradouro-da-senhora-do-monte', 'osm:N:14243536001', 'miradouroDaSenhoraDoMonte'],
  ['lisboa', 'time-out-market-lisboa', 'osm:W:1286260412', 'timeOutMarket'],
  ['lisboa', 'pensao-amor', 'osm:N:4418246289', 'pensaoAmor'],
  ['lisboa', 'pousada-de-lisboa', 'osm:W:96313090', 'pousadaDeLisboa'],
  ['lisboa', 'cervejaria-ramiro', 'osm:N:2503432815', 'cervejariaRamiro'],
  ['lisboa', 'oceanario-de-lisboa', 'osm:W:1016189633', 'oceanarioDeLisboa'],
  ['sao-paulo', 'museu-de-arte-de-sao-paulo', 'osm:W:1370081491', 'masp'],
  ['sao-paulo', 'parque-ibirapuera', 'osm:W:125450993', 'parqueIbirapuera'],
  ['sao-paulo', 'pinacoteca-do-estado', 'osm:W:231110974', 'pinacoteca'],
  ['sao-paulo', 'estacao-da-luz', 'osm:W:8105832', 'estacaoDaLuz'],
  ['sao-paulo', 'museu-do-futebol', 'osm:N:1770102280', 'museuDoFutebol'],
  ['sao-paulo', 'mercado-municipal-de-sao-paulo', 'osm:R:4602996', 'mercadoMunicipal'],
  ['sao-paulo', 'catedral-da-se-sao-paulo', 'osm:W:8093737', 'catedralDaSe'],
  ['sao-paulo', 'theatro-municipal-de-sao-paulo', 'osm:W:46927931', 'theatroMunicipal'],
  ['sao-paulo', 'bar-brahma', 'osm:N:2098302406', 'barBrahma'],
  ['sao-paulo', 'japan-house-sao-paulo', 'osm:N:4896103322', 'japanHouse'],
  ['sao-paulo', 'beco-do-batman', 'osm:N:4987322723', 'becoDoBatman'],
  ['sao-paulo', 'museu-do-ipiranga', 'osm:W:166784137', 'museuDoIpiranga'],
  ['rio', 'cristo-redentor', 'osm:N:4919986733', 'cristoRedentor'],
  ['rio', 'pao-de-acucar', 'osm:N:34582421', 'paoDeAcucar'],
  ['rio', 'praia-de-copacabana', 'osm:R:5514745', 'praiaDeCopacabana'],
  ['rio', 'praia-do-leme', 'osm:W:14585813', 'praiaDoLeme'],
  ['rio', 'praia-de-ipanema', 'osm:W:42364539', 'praiaDeIpanema'],
  ['rio', 'copacabana-palace', 'osm:R:18369001', 'copacabanaPalace'],
  ['rio', 'escadaria-selaron', 'osm:W:237171010', 'escadariaSelaron'],
  ['rio', 'arcos-da-lapa', 'osm:W:154966398', 'arcosDaLapa'],
  ['rio', 'confeitaria-colombo', 'osm:N:338511051', 'confeitariaColombo'],
  ['rio', 'museu-do-amanha', 'osm:W:372720167', 'museuDoAmanha'],
  ['rio', 'parque-lage', 'osm:R:14917255', 'parqueLage'],
  ['rio', 'mirante-dona-marta', 'osm:N:6457499744', 'miranteDonaMarta'],
  ['rio', 'estadio-do-maracana', 'osm:R:4587734', 'maracana'],
  ['paris', 'tour-eiffel', 'osm:W:5013364', 'tourEiffel'],
  ['paris', 'musee-du-louvre', 'osm:R:7515426', 'louvre'],
  ['paris', 'musee-d-orsay', 'osm:W:63178753', 'museeDOrsay'],
  ['paris', 'cathedrale-notre-dame-de-paris', 'osm:W:201611261', 'notreDame'],
  ['paris', 'sainte-chapelle', 'osm:R:3344870', 'sainteChapelle'],
  ['paris', 'pantheon-paris', 'osm:W:16407465', 'pantheon'],
  ['paris', 'jardin-du-luxembourg', 'osm:W:128206209', 'jardinDuLuxembourg'],
  ['paris', 'cafe-de-flore', 'osm:N:251699776', 'cafeDeFlore'],
  ['paris', 'shakespeare-and-company', 'osm:N:251373380', 'shakespeareAndCompany'],
  ['paris', 'centre-pompidou', 'osm:W:55503397', 'centrePompidou'],
  ['paris', 'basilique-du-sacre-c-ur', 'osm:W:23762981', 'sacreCoeur'],
  ['paris', 'arc-de-triomphe', 'osm:W:226413508', 'arcDeTriomphe'],
  ['paris', 'gare-du-nord', 'osm:N:5364676905', 'gareDuNord'],
];

function places(file: string) {
  const envelope = PhotonEnvelope.parse(JSON.parse(readFileSync(path.join(DIR, file), 'utf8')));
  return dedupePlaces(
    envelope.features.flatMap((raw) => {
      const parsed = PhotonFeature.safeParse(raw);
      return parsed.success ? [placeFromPhoton(parsed.data)] : [];
    }),
  );
}

const stripUndefined = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const keys: string[] = [];
const entries = PICKS.map(([fileCity, slug, key, constant]) => {
  const base = `seed_${fileCity}_${slug}`;
  const local = places(`${base}_default.body`).find((p) => p.key === key);
  if (!local) throw new Error(`${key} not in ${base}_default`);
  const english = places(`${base}_en.body`).find((p) => p.key === key) ?? local;
  keys.push(`  ${constant}: '${key}',`);
  const localized = (p: typeof local) => ({
    name: p.name,
    label: p.label,
    address: stripUndefined(p.address),
  });
  return stripUndefined({
    key,
    city: CITY[fileCity],
    ref: local.ref,
    category: local.category,
    kind: local.kind,
    osmKey: local.osmKey,
    osmValue: local.osmValue,
    location: local.location,
    bbox: local.bbox,
    countryCode: local.address.countryCode,
    localized: { 'pt-BR': localized(local), en: localized(english) },
  });
});

process.stdout
  .write(`// Generated from the Photon answers saved in test/fixtures/upstream/responses-seed/
// (lang=default for pt-BR, lang=en for en) through the Photon mapper. Real OpenStreetMap
// objects: © OpenStreetMap contributors, ODbL. Used by the fake geocoder and by the seed.
import type { BoundingBox, LngLat, Locale, PlaceAddress, PlaceCategory, PlaceKey } from '@heremita/shared';

export type GazetteerCity = 'lisboa' | 'sao-paulo' | 'rio-de-janeiro' | 'paris';

export interface GazetteerPlace {
  key: PlaceKey;
  city: GazetteerCity;
  ref: { osmType: 'N' | 'W' | 'R'; osmId: number };
  category: PlaceCategory;
  kind: 'poi' | 'address' | 'street' | 'area';
  osmKey: string;
  osmValue: string;
  location: LngLat;
  bbox?: BoundingBox;
  countryCode: string;
  /** Photon \`lang=default\` (local names) serves pt-BR; \`lang=en\` serves en. */
  localized: Record<Locale, { name: string; label: string; address: PlaceAddress }>;
}

export const GAZETTEER_KEYS = {
${keys.join('\n')}
} as const satisfies Record<string, PlaceKey>;

export const GAZETTEER: readonly GazetteerPlace[] = ${JSON.stringify(entries, null, 2)};
`);
