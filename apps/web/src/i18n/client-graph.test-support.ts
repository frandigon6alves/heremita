// Test support: which message namespaces the client components reachable from
// a file use (`useTranslations('ns…')`), from a static walk of the imports.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC = path.join(import.meta.dirname, '..');
const EXTENSIONS = ['.tsx', '.ts', '/index.tsx', '/index.ts'];
const IMPORT =
  /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const TYPE_ONLY = /^(?:import|export)\s+type\s/;
const TRANSLATIONS = /useTranslations\(\s*(?:'([^'.]+)[^']*'|"([^".]+)[^"]*")?\s*\)/g;

function resolve(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) {
    base = path.join(SRC, specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    base = path.resolve(path.dirname(from), specifier);
  } else {
    return null;
  }
  if (existsSync(base) && statSync(base).isFile()) {
    return base;
  }
  const found = EXTENSIONS.map((extension) => base + extension).find((file) => existsSync(file));
  return found ?? null;
}

interface ModuleInfo {
  client: boolean;
  imports: string[];
  /** First segment of every `useTranslations` namespace; '*' for a call without one. */
  namespaces: string[];
}

const cache = new Map<string, ModuleInfo>();

function info(file: string): ModuleInfo {
  const known = cache.get(file);
  if (known) {
    return known;
  }
  const source = readFileSync(file, 'utf8');
  const imports: string[] = [];
  for (const match of source.matchAll(IMPORT)) {
    if (TYPE_ONLY.test(match[0])) {
      continue;
    }
    const target = resolve(file, match[1] ?? match[2] ?? '');
    if (target !== null) {
      imports.push(target);
    }
  }
  const namespaces = [...source.matchAll(TRANSLATIONS)].map((match) => match[1] ?? match[2] ?? '*');
  const client = /^\s*['"]use client['"]/.test(source);
  const result = { client, imports, namespaces };
  cache.set(file, result);
  return result;
}

/**
 * Namespaces the client part of `entry`'s module graph translates with: every
 * module at or below a `'use client'` file (dynamic imports included).
 */
export function clientNamespaces(entry: string): Set<string> {
  const namespaces = new Set<string>();
  const seen = new Set<string>();
  const visit = (file: string, inClient: boolean) => {
    const key = `${file}:${inClient}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const found = info(file);
    const client = inClient || found.client;
    if (client) {
      found.namespaces.forEach((namespace) => namespaces.add(namespace));
    }
    found.imports.forEach((target) => visit(target, client));
  };
  visit(entry, false);
  return namespaces;
}
