import { endpoints } from '@heremita/shared';
import { screen, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import {
  failWith,
  networkErrorOn,
  onEndpoint,
  okResponse,
  setupApiServer,
  TEST_REQUEST_ID,
} from '../../../test/msw/handlers';
import { renderWithProviders } from '../../../test/render';
import { PlaceSearch } from './place-search';
import { buildPlaceResult } from './test-support';

const server = setupApiServer();

const azulejo = buildPlaceResult();
const jeronimos = buildPlaceResult({
  key: 'osm:W:23005112',
  ref: { osmType: 'W', osmId: 23005112 },
  name: 'Mosteiro dos Jerónimos',
  label: 'Praça do Império, Lisboa',
});

/** Answers E42 with `items` and records the query string of every call. */
function recordSearches(items = [azulejo, jeronimos]) {
  const calls: URLSearchParams[] = [];
  server.use(
    onEndpoint(endpoints.searchPlaces, ({ request }) => {
      calls.push(new URL(request.url).searchParams);
      return okResponse(endpoints.searchPlaces, { items });
    }),
  );
  return calls;
}

async function statusSays(text: string) {
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(text));
}

function renderSearch(props: Partial<Parameters<typeof PlaceSearch>[0]> = {}) {
  const onSelect = vi.fn();
  const view = renderWithProviders(<PlaceSearch onSelect={onSelect} {...props} />);
  return { ...view, onSelect, input: screen.getByRole('combobox', { name: 'Search places' }) };
}

describe('PlaceSearch', () => {
  it('searches_once_after_typing_pauses_with_the_whole_text', async () => {
    const calls = recordSearches();
    const { user, input } = renderSearch({ near: { lng: -9.13934, lat: 38.72226 }, zoom: 13 });

    await user.type(input, 'museu');

    expect(await screen.findByRole('option', { name: /Museu Nacional do Azulejo/ })).toBeVisible();
    expect(calls).toHaveLength(1);
    expect(Object.fromEntries(calls[0]!)).toEqual({
      q: 'museu',
      locale: 'en',
      intent: 'autocomplete',
      near: '-9.14,38.72',
      zoom: '13',
    });
  });

  it('asks_for_three_characters_and_sends_nothing_before', async () => {
    const calls = recordSearches();
    const { user, input } = renderSearch();

    await user.type(input, 'mu');

    await statusSays('Type at least 3 characters.');
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(calls).toHaveLength(0);
  });

  it('aborts_the_superseded_search_when_the_text_changes', async () => {
    const aborted: string[] = [];
    server.use(
      onEndpoint(endpoints.searchPlaces, async ({ request }) => {
        const q = new URL(request.url).searchParams.get('q') ?? '';
        if (q === 'mus') {
          request.signal.addEventListener('abort', () => aborted.push(q));
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        return okResponse(endpoints.searchPlaces, { items: [azulejo] });
      }),
    );
    const { user, input } = renderSearch();

    await user.type(input, 'mus');
    await waitFor(() => expect(input).toHaveAttribute('aria-busy', 'true'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    await user.type(input, 'eu');

    expect(await screen.findByRole('option', { name: /Museu Nacional/ })).toBeVisible();
    expect(aborted).toEqual(['mus']);
  });

  it('selects_the_highlighted_result_with_arrow_and_enter', async () => {
    recordSearches();
    const { user, input, onSelect } = renderSearch();

    await user.type(input, 'lisboa');
    await screen.findByRole('option', { name: /Mosteiro/ });
    await user.keyboard('{ArrowDown}{ArrowDown}');

    expect(input).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: /Mosteiro/ }).id,
    );
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledWith(jeronimos);
    expect(input).toHaveValue('Mosteiro dos Jerónimos');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('selects_a_result_on_click', async () => {
    recordSearches();
    const { user, input, onSelect } = renderSearch();

    await user.type(input, 'museu');
    await user.click(await screen.findByRole('option', { name: /Museu Nacional/ }));

    expect(onSelect).toHaveBeenCalledWith(azulejo);
  });

  it('keeps_text_typed_after_a_pick', async () => {
    recordSearches();
    const { user, input } = renderSearch();
    await user.type(input, 'museu');
    await user.click(await screen.findByRole('option', { name: /Museu Nacional/ }));

    await user.type(input, ' x');

    expect(input).toHaveValue(`${azulejo.name} x`);
  });

  it('submits_the_text_on_enter_without_waiting_for_the_pause', async () => {
    const calls = recordSearches();
    const { user, input } = renderSearch();

    await user.type(input, 'torre de belem{Enter}');

    await waitFor(() => expect(calls.some((call) => call.get('intent') === 'submit')).toBe(true));
    const submit = calls.find((call) => call.get('intent') === 'submit');
    expect(submit?.get('q')).toBe('torre de belem');
    expect(await screen.findByRole('option', { name: /Museu Nacional/ })).toBeVisible();
  });

  it('says_when_nothing_matches', async () => {
    recordSearches([]);
    const { user, input } = renderSearch();

    await user.type(input, 'xyzzy');

    expect(
      await screen.findByText(
        'No places found for “xyzzy”. Check the spelling or try another name.',
      ),
    ).toBeVisible();
  });

  it('explains_a_busy_search_under_the_field', async () => {
    server.use(failWith(endpoints.searchPlaces, 'geocoding_busy', {}, { 'Retry-After': '1' }));
    const { user, input } = renderSearch();

    await user.type(input, 'museu');

    await statusSays('Search is busy, try again in a moment.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('explains_an_unavailable_search', async () => {
    server.use(failWith(endpoints.searchPlaces, 'geocoding_unavailable'));
    const { user, input } = renderSearch();

    await user.type(input, 'museu');

    await statusSays('Search is unavailable right now. Try again later.');
  });

  it('retries_after_an_unexpected_failure_and_quotes_the_request_id', async () => {
    let attempts = 0;
    server.use(
      onEndpoint(endpoints.searchPlaces, () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.json({}, { status: 502, headers: { 'X-Request-Id': TEST_REQUEST_ID } })
          : okResponse(endpoints.searchPlaces, { items: [azulejo] });
      }),
    );
    const { user, input } = renderSearch();

    await user.type(input, 'museu');
    await statusSays(`Search failed. Request ID: ${TEST_REQUEST_ID}`);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('option', { name: /Museu Nacional/ })).toBeVisible();
  });

  it('says_search_needs_a_connection_when_offline', async () => {
    server.use(networkErrorOn(endpoints.searchPlaces));
    const { user, input } = renderSearch();

    await user.type(input, 'museu');

    await statusSays('You are offline. Search needs a connection.');
  });

  it('clears_the_text_and_keeps_focus_in_the_field', async () => {
    recordSearches();
    const { user, input } = renderSearch();

    await user.type(input, 'museu');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });

  it('reads_in_portuguese', async () => {
    recordSearches([]);
    const onSelect = vi.fn();
    const { user } = renderWithProviders(<PlaceSearch onSelect={onSelect} />, { locale: 'pt-BR' });

    await user.type(screen.getByRole('combobox', { name: 'Buscar lugares' }), 'xyz');

    expect(await screen.findByText(/Nenhum lugar encontrado para “xyz”/)).toBeVisible();
  });
});
