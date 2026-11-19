import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { messages } from '@/messages/en';
import { clientNamespaces } from './client-graph.test-support';
import { ROOT_NAMESPACES } from './client-messages';

const APP = path.join(import.meta.dirname, '..', 'app');
const ENTRIES = globSync('**/{page,layout,loading,error,not-found,global-error,template}.tsx', {
  cwd: APP,
}).sort();
const DECLARED = /<ClientMessages\s+namespaces=\{\[([^\]]*)\]\}/;

/** Namespaces a file's own `<ClientMessages namespaces={[…]}>` adds; `null` when it has none. */
function declaredIn(file: string): string[] | null {
  const match = DECLARED.exec(readFileSync(path.join(APP, file), 'utf8'));
  return match ? [...(match[1] ?? '').matchAll(/'([^']+)'/g)].map((name) => name[1] ?? '') : null;
}

/**
 * What the client components of a route file receive: the innermost provider
 * wins (a nested provider replaces its parent's messages). A page's own
 * provider covers the page; a layout's covers its folder (loading, error,
 * not-found, page) and every folder below.
 */
function providedTo(file: string): Set<string> {
  const own = path.basename(file) === 'page.tsx' ? declaredIn(file) : null;
  let innermost = own;
  for (let dir = path.dirname(file); innermost === null && dir !== '.'; dir = path.dirname(dir)) {
    const layout = path.join(dir, 'layout.tsx');
    if (ENTRIES.includes(layout)) {
      innermost = declaredIn(layout);
    }
  }
  return new Set([...ROOT_NAMESPACES, ...(innermost ?? [])]);
}

describe('client messages', () => {
  it('finds_the_route_files', () => {
    expect(ENTRIES).toContain('[locale]/layout.tsx');
    expect(ENTRIES.length).toBeGreaterThan(30);
  });

  it.each(ENTRIES)('%s_hands_its_client_components_every_namespace_they_use', (file) => {
    const used = clientNamespaces(path.join(APP, file));
    const provided = providedTo(file);

    expect([...used].filter((namespace) => !provided.has(namespace))).toEqual([]);
  });

  it('declares_only_namespaces_of_the_catalogue', () => {
    const known = new Set(Object.keys(messages));
    const declared = ENTRIES.flatMap((file) => declaredIn(file) ?? []);

    expect(declared.filter((namespace) => !known.has(namespace))).toEqual([]);
    expect(declared.length).toBeGreaterThan(0);
  });

  it('sees_useTranslations_calls_without_a_namespace_as_needing_everything', () => {
    // A bare `useTranslations()` reads as '*', which no provider lists, so the
    // check above fails for it instead of passing silently.
    expect(providedTo('[locale]/layout.tsx').has('*')).toBe(false);
  });
});
