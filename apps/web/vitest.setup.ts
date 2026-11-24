import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
});

// jsdom has no modal dialogs: the minimum of `showModal()`/`close()` the Dialog
// component relies on (open state + `close` event). Focus trapping, Escape and
// the backdrop are covered by the browser and the e2e suite.
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(
    this: HTMLDialogElement,
    returnValue?: string,
  ) {
    if (!this.hasAttribute('open')) {
      return;
    }
    this.removeAttribute('open');
    if (returnValue !== undefined) {
      this.returnValue = returnValue;
    }
    // Browsers fire `close` from a queued task, never inside `close()`: a dialog
    // closed and reopened in one commit (Strict Mode effects) sees it reopened.
    queueMicrotask(() => this.dispatchEvent(new Event('close')));
  };
}

// jsdom has no `matchMedia`: every query reads as "no match" (the phone-first
// default) unless a test installs `installFakeMatchMedia()` to flip one.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
