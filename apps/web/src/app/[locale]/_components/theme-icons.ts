import { Monitor, Moon, Sun } from '@/shared/icons/icons';

/**
 * Icon of each theme. A plain module, not a `'use client'` one: a server
 * component importing a value from a client module gets an opaque reference
 * (no keys), which left the theme button empty.
 */
export const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon } as const;
