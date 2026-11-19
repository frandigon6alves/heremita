import type { Locale } from '@heremita/shared';
import { seedId } from './ids.js';

export type SeedUserHandle = 'demo' | 'ana' | 'bruno' | 'carla' | 'diego' | 'elena' | 'nuria';

export interface SeedUser {
  id: string;
  email: string;
  displayName: string;
  locale: Locale;
  role: 'user' | 'moderator';
  createdAt: Date;
}

// Invented names on example.com (RFC 2606); the "-Test", "-Prueba" and "-Teste"
// suffixes keep them from passing for real people. All of them are flagged
// is_demo. Each UI locale has at least one user, so seeded reviews come in all three.
export const SEED_USERS: Record<SeedUserHandle, SeedUser> = {
  demo: {
    id: seedId('user', 1),
    email: 'demo@example.com',
    displayName: 'Demo Traveller',
    locale: 'en',
    role: 'user',
    createdAt: new Date('2026-01-05T09:00:00.000Z'),
  },
  ana: {
    id: seedId('user', 2),
    email: 'ana@example.com',
    displayName: 'Ana Ribeiro-Teste',
    locale: 'pt-BR',
    role: 'moderator',
    createdAt: new Date('2026-01-06T10:15:00.000Z'),
  },
  bruno: {
    id: seedId('user', 3),
    email: 'bruno@example.com',
    displayName: 'Bruno Cavalcanti-Teste',
    locale: 'pt-BR',
    role: 'user',
    createdAt: new Date('2026-01-12T18:40:00.000Z'),
  },
  carla: {
    id: seedId('user', 4),
    email: 'carla@example.com',
    displayName: 'Carla Mendes-Teste',
    locale: 'pt-BR',
    role: 'user',
    createdAt: new Date('2026-02-02T08:05:00.000Z'),
  },
  diego: {
    id: seedId('user', 5),
    email: 'diego@example.com',
    displayName: 'Diego Lorenzo-Prueba',
    locale: 'es',
    role: 'user',
    createdAt: new Date('2026-02-20T21:30:00.000Z'),
  },
  elena: {
    id: seedId('user', 6),
    email: 'elena@example.com',
    displayName: 'Elena Hart-Test',
    locale: 'en',
    role: 'user',
    createdAt: new Date('2026-03-03T14:00:00.000Z'),
  },
  nuria: {
    id: seedId('user', 7),
    email: 'nuria@example.com',
    displayName: 'Núria Ferrer-Prueba',
    locale: 'es',
    role: 'user',
    createdAt: new Date('2026-03-25T11:30:00.000Z'),
  },
};

/** The fixed demo login (password: DEMO_PASSWORD). */
export const DEMO_USER = SEED_USERS.demo;
