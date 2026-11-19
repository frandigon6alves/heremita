import type { UserCard } from '@heremita/shared';

/** A person in the viewer's blocked list (E12). */
export function buildUserCard(overrides: Partial<UserCard> = {}): UserCard {
  return {
    id: '0195f0c8-0000-7000-8000-0000000000b1',
    displayName: 'Bruno',
    isDemo: false,
    ...overrides,
  };
}
