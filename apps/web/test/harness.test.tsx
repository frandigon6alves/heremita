import { endpoints } from '@heremita/shared';
import { useQuery } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { describe, expect, it } from 'vitest';
import { apiFetch } from '@/lib/api/client';
import { ApiProblemError } from '@/lib/api/problem';
import { viewerQuery } from '@/lib/api/query-keys';
import {
  buildMe,
  failWith,
  networkErrorOn,
  onEndpoint,
  okResponse,
  respondWith,
  setupApiServer,
  TEST_REQUEST_ID,
} from './msw/handlers';
import { renderWithProviders } from './render';

const server = setupApiServer();

function ViewerName() {
  const { data, isPending } = useQuery(viewerQuery());
  if (isPending) {
    return <p>loading</p>;
  }
  return <p>{data ? data.displayName : 'signed out'}</p>;
}

function DayParam() {
  const [day, setDay] = useQueryState('day', parseAsString.withOptions({ history: 'replace' }));
  return (
    <button type="button" onClick={() => void setDay('ideas')}>
      day: {day ?? 'none'}
    </button>
  );
}

function AppName() {
  const t = useTranslations('common');
  return <p>{t('nav.signUp')}</p>;
}

describe('renderWithProviders', () => {
  it('serves_the_seeded_viewer_without_calling_the_api', () => {
    renderWithProviders(<ViewerName />, { viewer: buildMe({ displayName: 'Bia' }) });

    expect(screen.getByText('Bia')).toBeInTheDocument();
  });

  it('fetches_the_viewer_through_msw_when_not_seeded', async () => {
    server.use(respondWith(endpoints.getMe, buildMe({ displayName: 'Caio' })));

    renderWithProviders(<ViewerName />);

    expect(await screen.findByText('Caio')).toBeInTheDocument();
  });

  it('reads_search_params_from_the_route_and_records_url_updates', async () => {
    const { user, urlUpdates } = renderWithProviders(<DayParam />, {
      route: '/pt-BR/trips/1?day=all',
    });
    expect(screen.getByRole('button', { name: 'day: all' })).toBeInTheDocument();

    await user.click(screen.getByRole('button'));

    expect(await screen.findByRole('button', { name: 'day: ideas' })).toBeInTheDocument();
    expect(urlUpdates.at(-1)?.queryString).toBe('?day=ideas');
    expect(urlUpdates.at(-1)?.options.history).toBe('replace');
  });

  it('renders_the_requested_locale', () => {
    renderWithProviders(<AppName />, { locale: 'pt-BR' });

    expect(screen.getByText('Criar conta')).toBeInTheDocument();
  });
});

describe('msw handlers', () => {
  it('passes_typed_path_params_to_the_resolver', async () => {
    server.use(
      onEndpoint(endpoints.getUserProfile, ({ params }) =>
        okResponse(endpoints.getUserProfile, {
          id: params.userId,
          displayName: 'Dora',
          isDemo: false,
          joinedMonth: '2026-11',
          publicTripCount: 0,
          reviewCount: 0,
        }),
      ),
    );

    const profile = await apiFetch(endpoints.getUserProfile, {
      params: { userId: '0195f0c8-0000-7000-8000-0000000000aa' },
    });

    expect(profile.id).toBe('0195f0c8-0000-7000-8000-0000000000aa');
  });

  it('answers_a_problem_with_the_status_of_its_code_and_the_request_id', async () => {
    server.use(failWith(endpoints.signUp, 'email_taken'));

    const error = await apiFetch(endpoints.signUp, {
      body: { displayName: 'Ana', email: 'ana@example.com', password: 'a long passphrase', locale: 'en' },
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiProblemError);
    expect(error).toMatchObject({ status: 409, code: 'email_taken', requestId: TEST_REQUEST_ID });
  });

  it('answers_204_endpoints_without_a_body', async () => {
    server.use(respondWith(endpoints.logOut));

    await expect(apiFetch(endpoints.logOut)).resolves.toBeUndefined();
  });

  it('fails_with_a_type_error_on_a_network_error', async () => {
    server.use(networkErrorOn(endpoints.getMe));

    await expect(apiFetch(endpoints.getMe)).rejects.toBeInstanceOf(TypeError);
  });
});
