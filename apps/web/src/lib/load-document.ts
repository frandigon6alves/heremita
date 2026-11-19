/**
 * Leaves for `url` with a full page load, for a change the client router
 * cannot make in place (the locale: `<html lang>`, the messages and the
 * `NEXT_LOCALE` cookie all change with it).
 */
export function loadDocument(url: string): void {
  window.location.assign(url);
}
