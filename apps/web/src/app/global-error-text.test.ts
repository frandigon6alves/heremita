import { describe, expect, it } from 'vitest';
import en from '@/messages/en/common.json';
import es from '@/messages/es/common.json';
import ptBR from '@/messages/pt-BR/common.json';
import { GLOBAL_ERROR_TEXT } from './global-error-text';

describe('GLOBAL_ERROR_TEXT', () => {
  it.each([
    ['en', en],
    ['es', es],
    ['pt-BR', ptBR],
  ] as const)('matches_the_%s_common_catalogue', (locale, common) => {
    expect(GLOBAL_ERROR_TEXT[locale]).toEqual({
      title: common.error.title,
      body: common.error.body,
      retry: common.actions.retry,
      home: common.notFound.home,
    });
  });
});
