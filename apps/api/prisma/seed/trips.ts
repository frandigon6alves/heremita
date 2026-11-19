import { GAZETTEER_KEYS } from '../../src/providers/fake/gazetteer.js';
import { seedId } from './ids.js';
import type { SeedUserHandle } from './users.js';

export type GazetteerName = keyof typeof GAZETTEER_KEYS;
type Mode = 'walk' | 'bike' | 'drive';

export interface SeedStop {
  place: GazetteerName;
  modeToNext?: Mode;
}

export interface SeedDay {
  modeOverride?: Mode;
  stops: SeedStop[];
}

export interface SeedTrip {
  /** Row number: the trip id is seedId('trip', number). */
  number: number;
  owner: SeedUserHandle;
  title: string;
  description: string | null;
  destination: { name: string; countryCode: string; center: { lng: number; lat: number } } | null;
  startDate: string | null;
  visibility: 'private' | 'link' | 'public';
  defaultMode: Mode;
  copiedFrom: number | null;
  createdAt: string;
  updatedAt: string;
  days: SeedDay[];
  /** Trip places that are on no day. */
  ideas: GazetteerName[];
  /** Owner-private notes, by place. */
  notes: Partial<Record<GazetteerName, string>>;
}

const LISBOA = { name: 'Lisboa', countryCode: 'PT', center: { lng: -9.1393, lat: 38.7223 } };
const RIO = { name: 'Rio de Janeiro', countryCode: 'BR', center: { lng: -43.1729, lat: -22.9068 } };
const SAO_PAULO = {
  name: 'São Paulo',
  countryCode: 'BR',
  center: { lng: -46.6333, lat: -23.5505 },
};
const PARIS = { name: 'Paris', countryCode: 'FR', center: { lng: 2.3522, lat: 48.8566 } };
const BARCELONA = { name: 'Barcelona', countryCode: 'ES', center: { lng: 2.1734, lat: 41.3851 } };

const stops = (...places: GazetteerName[]): SeedStop[] => places.map((place) => ({ place }));

export const SEED_TRIPS: SeedTrip[] = [
  {
    number: 1,
    owner: 'demo',
    title: 'Lisbon in 3 days',
    description: null,
    destination: LISBOA,
    startDate: '2027-05-14',
    visibility: 'private',
    defaultMode: 'walk',
    copiedFrom: null,
    createdAt: '2026-10-01T19:00:00.000Z',
    updatedAt: '2026-10-03T21:12:00.000Z',
    days: [
      {
        stops: stops('casteloDeSaoJorge', 'miradouroDeSantaLuzia', 'seDeLisboa', 'pracaDoComercio'),
      },
      {
        stops: [
          { place: 'torreDeBelem' },
          { place: 'padraoDosDescobrimentos' },
          { place: 'mosteiroDosJeronimos' },
          { place: 'pasteisDeBelem' },
        ],
      },
      { stops: [] },
    ],
    ideas: ['timeOutMarket', 'lxFactory', 'oceanarioDeLisboa', 'pensaoAmor'],
    notes: {
      casteloDeSaoJorge: 'Buy the ticket online the day before; opens at 9:00.',
      pasteisDeBelem: 'Order to take away and eat in the garden across the road.',
      oceanarioDeLisboa: 'See if it fits into the morning of day three.',
    },
  },
  {
    number: 2,
    owner: 'demo',
    title: 'Next trip',
    description: null,
    destination: null,
    startDate: null,
    visibility: 'private',
    defaultMode: 'walk',
    copiedFrom: null,
    createdAt: '2026-10-05T12:00:00.000Z',
    updatedAt: '2026-10-05T12:00:00.000Z',
    days: [{ stops: [] }],
    ideas: [],
    notes: {},
  },
  {
    number: 3,
    owner: 'bruno',
    title: 'Lisboa clássica: Alfama e Belém',
    description:
      'Três dias a pé pelos bairros antigos, com um dia de bicicleta pela beira do rio até Belém.',
    destination: LISBOA,
    startDate: '2026-04-10',
    visibility: 'public',
    defaultMode: 'walk',
    copiedFrom: null,
    createdAt: '2026-03-20T10:00:00.000Z',
    updatedAt: '2026-04-02T08:30:00.000Z',
    days: [
      {
        stops: stops(
          'casteloDeSaoJorge',
          'miradouroDeSantaLuzia',
          'seDeLisboa',
          'elevadorDeSantaJusta',
          'aBrasileira',
        ),
      },
      {
        modeOverride: 'bike',
        stops: stops(
          'lxFactory',
          'padraoDosDescobrimentos',
          'torreDeBelem',
          'mosteiroDosJeronimos',
          'pasteisDeBelem',
        ),
      },
      {
        stops: [
          { place: 'museuNacionalDeArteAntiga' },
          { place: 'jardimDaEstrela', modeToNext: 'drive' },
          { place: 'miradouroDaSenhoraDoMonte' },
          { place: 'pensaoAmor' },
        ],
      },
    ],
    ideas: ['cervejariaRamiro'],
    notes: {
      elevadorDeSantaJusta: 'Subir a pé pelo Carmo e só usar o elevador na descida.',
      lxFactory: 'Domingo tem feira.',
    },
  },
  {
    number: 4,
    owner: 'elena',
    title: 'Classic Lisbon, short version',
    description: 'Copied from a longer plan and cut down to two days.',
    destination: LISBOA,
    startDate: null,
    visibility: 'public',
    defaultMode: 'walk',
    copiedFrom: 3,
    createdAt: '2026-05-08T16:00:00.000Z',
    updatedAt: '2026-05-09T09:45:00.000Z',
    days: [
      { stops: stops('casteloDeSaoJorge', 'miradouroDeSantaLuzia', 'seDeLisboa', 'timeOutMarket') },
      {
        stops: [
          { place: 'torreDeBelem' },
          { place: 'mosteiroDosJeronimos' },
          { place: 'pasteisDeBelem', modeToNext: 'drive' },
          { place: 'oceanarioDeLisboa' },
        ],
      },
    ],
    ideas: [],
    notes: {},
  },
  {
    number: 5,
    owner: 'carla',
    title: 'Rio de Janeiro em 4 dias',
    description: 'Praias, mirantes e o centro histórico. Carro só onde a caminhada não compensa.',
    destination: RIO,
    startDate: '2026-02-12',
    visibility: 'public',
    defaultMode: 'drive',
    copiedFrom: null,
    createdAt: '2026-02-05T13:20:00.000Z',
    updatedAt: '2026-03-01T11:00:00.000Z',
    days: [
      {
        modeOverride: 'walk',
        stops: stops('praiaDoLeme', 'praiaDeCopacabana', 'copacabanaPalace', 'praiaDeIpanema'),
      },
      { stops: stops('cristoRedentor', 'miranteDonaMarta', 'parqueLage') },
      {
        modeOverride: 'walk',
        stops: stops('arcosDaLapa', 'escadariaSelaron', 'confeitariaColombo', 'museuDoAmanha'),
      },
      { stops: stops('paoDeAcucar', 'maracana', 'copacabanaPalace') },
    ],
    ideas: [],
    notes: {
      cristoRedentor: 'Ir no primeiro trem da manhã.',
      paoDeAcucar: 'Pôr do sol: chegar uma hora antes.',
    },
  },
  {
    number: 6,
    owner: 'diego',
    title: 'Río en 2 días, versión exprés',
    description: null,
    destination: RIO,
    startDate: null,
    visibility: 'public',
    defaultMode: 'drive',
    copiedFrom: 5,
    createdAt: '2026-06-14T20:00:00.000Z',
    updatedAt: '2026-06-15T07:30:00.000Z',
    days: [
      { stops: stops('cristoRedentor', 'paoDeAcucar', 'praiaDeCopacabana') },
      {
        modeOverride: 'walk',
        stops: stops('arcosDaLapa', 'escadariaSelaron', 'confeitariaColombo', 'museuDoAmanha'),
      },
    ],
    ideas: [],
    notes: {},
  },
  {
    number: 7,
    owner: 'diego',
    title: 'Fin de semana en São Paulo',
    description: 'Sábado a pie por el centro, domingo en coche entre la Paulista y el Ibirapuera.',
    destination: SAO_PAULO,
    startDate: '2026-03-21',
    visibility: 'public',
    defaultMode: 'walk',
    copiedFrom: null,
    createdAt: '2026-03-10T09:00:00.000Z',
    updatedAt: '2026-03-18T22:10:00.000Z',
    days: [
      {
        stops: stops(
          'catedralDaSe',
          'mercadoMunicipal',
          'estacaoDaLuz',
          'pinacoteca',
          'theatroMunicipal',
          'barBrahma',
        ),
      },
      {
        modeOverride: 'drive',
        stops: stops('masp', 'japanHouse', 'becoDoBatman', 'parqueIbirapuera'),
      },
    ],
    ideas: ['museuDoFutebol'],
    notes: { mercadoMunicipal: 'Sándwich de mortadela en la planta de arriba.' },
  },
  {
    number: 8,
    owner: 'ana',
    title: 'São Paulo de museus',
    description: 'Dois dias só de museus, de carro entre eles.',
    destination: SAO_PAULO,
    startDate: null,
    visibility: 'public',
    defaultMode: 'drive',
    copiedFrom: null,
    createdAt: '2026-07-01T15:00:00.000Z',
    updatedAt: '2026-07-02T10:20:00.000Z',
    days: [
      {
        stops: [
          { place: 'masp', modeToNext: 'walk' },
          { place: 'japanHouse' },
          { place: 'museuDoFutebol' },
        ],
      },
      { stops: stops('pinacoteca', 'estacaoDaLuz', 'museuDoIpiranga') },
    ],
    ideas: [],
    notes: {},
  },
  {
    number: 9,
    owner: 'elena',
    title: 'Paris on foot',
    description: 'Three days walking between the islands, the Left Bank and Montmartre.',
    destination: PARIS,
    startDate: '2026-09-04',
    visibility: 'public',
    defaultMode: 'walk',
    copiedFrom: null,
    createdAt: '2026-08-20T18:00:00.000Z',
    updatedAt: '2026-08-28T07:15:00.000Z',
    days: [
      {
        stops: stops(
          'notreDame',
          'sainteChapelle',
          'shakespeareAndCompany',
          'pantheon',
          'jardinDuLuxembourg',
          'cafeDeFlore',
        ),
      },
      {
        stops: [
          { place: 'louvre' },
          { place: 'museeDOrsay' },
          { place: 'tourEiffel', modeToNext: 'bike' },
          { place: 'arcDeTriomphe' },
        ],
      },
      { stops: stops('gareDuNord', 'sacreCoeur', 'centrePompidou') },
    ],
    ideas: [],
    notes: { louvre: 'Book the 9:00 slot, enter through the Carrousel.' },
  },
  {
    number: 10,
    owner: 'bruno',
    title: 'Rio com a turma',
    description: null,
    destination: RIO,
    startDate: '2026-12-27',
    visibility: 'link',
    defaultMode: 'walk',
    copiedFrom: null,
    createdAt: '2026-09-15T20:45:00.000Z',
    updatedAt: '2026-09-16T08:00:00.000Z',
    days: [
      { stops: stops('praiaDeIpanema', 'praiaDeCopacabana', 'praiaDoLeme') },
      { stops: stops('arcosDaLapa', 'escadariaSelaron', 'confeitariaColombo') },
    ],
    ideas: [],
    notes: {},
  },
  {
    number: 11,
    owner: 'nuria',
    title: 'Barcelona en 2 días: Gaudí, casco antiguo y playa',
    description:
      'Dos días a pie entre las obras de Gaudí, el casco antiguo y el mar; solo un tramo en taxi para bajar de los búnkeres.',
    destination: BARCELONA,
    startDate: '2026-10-09',
    visibility: 'public',
    defaultMode: 'walk',
    copiedFrom: null,
    createdAt: '2026-09-28T17:00:00.000Z',
    updatedAt: '2026-10-02T08:40:00.000Z',
    days: [
      { stops: stops('sagradaFamilia', 'casaBatllo', 'laBoqueria', 'museuPicasso') },
      {
        stops: [
          { place: 'parcGuell' },
          { place: 'bunkersDelCarmel', modeToNext: 'drive' },
          { place: 'platjaDeLaBarceloneta' },
        ],
      },
    ],
    ideas: ['museuDeCienciesNaturals'],
    notes: {
      sagradaFamilia: 'Entradas para las 9:15. Llegar diez minutos antes por el control.',
      laBoqueria: 'Ir antes de las 11; después se llena de grupos.',
      bunkersDelCarmel: 'Subir al atardecer y llevar abrigo: arriba sopla el viento.',
    },
  },
];

export const LISBON_TRIP_ID = seedId('trip', 1);
export const BARCELONA_TRIP_ID = seedId('trip', 11);

/** Fixed 22-character share token of a seeded trip (dev data only: the seed refuses production). */
export function seedShareToken(tripNumber: number): string {
  return `demo-share-token-${tripNumber.toString().padStart(5, '0')}`;
}
