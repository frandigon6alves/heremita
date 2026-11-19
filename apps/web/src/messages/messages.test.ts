import type { Locale } from '@heremita/shared';
import { createFormatter, createTranslator, IntlErrorCode, type IntlError } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { buildIntlConfig, TIME_ZONE } from '@/i18n/config';
import { messages as en } from './en';
import { messages as es } from './es';
import { messages as ptBR } from './pt-BR';

type Tree = { readonly [key: string]: string | Tree };

const catalogues: Record<Locale, Tree> = { en, es, 'pt-BR': ptBR };

/** Every leaf as [dotted key, message]. */
function leaves(tree: Tree, prefix = ''): Array<[string, string]> {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    return typeof value === 'string' ? [[path, value] as [string, string]] : leaves(value, path);
  });
}

/** Keys whose message is not valid ICU syntax. */
function invalidMessages(locale: Locale, catalogue: Tree): string[] {
  const invalid: string[] = [];
  const t = createTranslator({
    locale,
    messages: catalogue,
    timeZone: TIME_ZONE,
    onError: (error: IntlError) => {
      // Missing argument values are expected here; only syntax errors matter.
      if (error.code === IntlErrorCode.INVALID_MESSAGE) {
        invalid.push(error.message);
      }
    },
  }) as unknown as (key: string, values: Record<string, never>) => string;

  return leaves(catalogue)
    .map(([key]) => key)
    .filter((key) => {
      const before = invalid.length;
      // Empty values force a compile: without them plain-looking messages are returned unparsed.
      t(key, {});
      return invalid.length > before;
    });
}

describe('message catalogues', () => {
  const keys = (tree: Tree) =>
    leaves(tree)
      .map(([key]) => key)
      .sort();

  it.each(['es', 'pt-BR'] as const)('%s_has_the_same_key_set_as_en', (locale) => {
    expect(keys(catalogues[locale])).toEqual(keys(en));
  });

  it('every_message_is_non_empty', () => {
    for (const catalogue of Object.values(catalogues)) {
      for (const [key, message] of leaves(catalogue)) {
        expect(message.trim(), key).not.toBe('');
      }
    }
  });

  it('the_icu_check_reports_a_broken_message', () => {
    expect(invalidMessages('en', { ok: 'Hi {name}', broken: '{count, plural, one {#}' })).toEqual([
      'broken',
    ]);
  });

  for (const [locale, catalogue] of Object.entries(catalogues) as Array<[Locale, Tree]>) {
    it(`${locale}: every ICU message parses`, () => {
      expect(invalidMessages(locale, catalogue)).toEqual([]);
    });

    it(`${locale}: every plural has an explicit =0 branch`, () => {
      const plurals = leaves(catalogue).filter(([, message]) => /,\s*plural\s*,/.test(message));

      for (const [key, message] of plurals) {
        expect(message, key).toMatch(/=0\s*\{/);
      }
    });
  }

  it('pt_br_zero_uses_the_zero_branch_not_one', () => {
    // Intl.PluralRules('pt-BR').select(0) is "one": without =0 this would read "0 lugar".
    const t = createTranslator({ locale: 'pt-BR', messages: ptBR, namespace: 'common.counts' });

    expect(t('places', { count: 0 })).toBe('Nenhum lugar');
    expect(t('places', { count: 1 })).toBe('1 lugar');
    expect(t('places', { count: 2 })).toBe('2 lugares');
  });
});

describe('intl request config', () => {
  it('formats_in_utc_so_dates_never_shift_a_day', async () => {
    const config = await buildIntlConfig('pt-BR');
    const format = createFormatter({ locale: config.locale, timeZone: config.timeZone });
    // 23:30 UTC is already the next day east of UTC and still the same day west of it.
    const lateEvening = new Date('2026-03-01T23:30:00Z');
    const earlyMorning = new Date('2026-03-01T00:30:00Z');

    expect(config.timeZone).toBe('UTC');
    expect(format.dateTime(lateEvening, { day: 'numeric', month: 'numeric' })).toBe('01/03');
    expect(format.dateTime(earlyMorning, { day: 'numeric', month: 'numeric' })).toBe('01/03');
  });

  it('loads_only_the_requested_catalogue', async () => {
    expect((await buildIntlConfig('en')).messages).toBe(en);
    expect((await buildIntlConfig('es')).messages).toBe(es);
    expect((await buildIntlConfig('pt-BR')).messages).toBe(ptBR);
  });
});
