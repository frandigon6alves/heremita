import type { Locale } from '@heremita/shared';

/**
 * The only text `global-error.tsx` shows, copied from `common.json`: importing
 * the three catalogues put them in a chunk every page loads.
 * `global-error-text.test.ts` keeps these equal to the catalogues.
 */
export const GLOBAL_ERROR_TEXT: Record<
  Locale,
  { title: string; body: string; retry: string; home: string }
> = {
  en: {
    title: 'Something went wrong',
    body: 'Try again. If it keeps happening, reload the page.',
    retry: 'Try again',
    home: 'Go to the start page',
  },
  es: {
    title: 'Algo salió mal',
    body: 'Vuelve a intentarlo. Si sigue pasando, recarga la página.',
    retry: 'Reintentar',
    home: 'Ir a la página de inicio',
  },
  'pt-BR': {
    title: 'Algo deu errado',
    body: 'Tente de novo. Se continuar acontecendo, recarregue a página.',
    retry: 'Tentar de novo',
    home: 'Ir para a página inicial',
  },
};
