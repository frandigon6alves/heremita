import { readFileSync } from 'node:fs';

const RESPONSES = new URL('../fixtures/upstream/responses/', import.meta.url);

export interface SavedResponse {
  status: number;
  text: string;
  body: unknown;
}

/** A saved real upstream answer (`<name>.hdr` status line + `<name>.body`), for offline tests. */
export function savedResponse(name: string): SavedResponse {
  const header = readFileSync(new URL(`${name}.hdr`, RESPONSES), 'utf8');
  const status = Number(/^HTTP\/[\d.]+ (\d{3})/.exec(header)?.[1]);
  const text = readFileSync(new URL(`${name}.body`, RESPONSES), 'utf8');
  return { status, text, body: JSON.parse(text) as unknown };
}
