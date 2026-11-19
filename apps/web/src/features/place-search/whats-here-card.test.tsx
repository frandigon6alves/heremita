import { endpoints } from '@heremita/shared';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  failWith,
  onEndpoint,
  okResponse,
  problemResponse,
  respondWith,
  setupApiServer,
  TEST_REQUEST_ID,
} from '../../../test/msw/handlers';
import { renderWithProviders } from '../../../test/render';
import { buildPlaceResult } from './test-support';
import { WhatsHereCard, type WhatsHereCardProps } from './whats-here-card';

const server = setupApiServer();

const point = { lng: -9.133912, lat: 38.713871 };
const castle = buildPlaceResult({
  key: 'osm:W:1001',
  ref: { osmType: 'W', osmId: 1001 },
  name: 'Castelo de São Jorge',
  label: 'Rua de Santa Cruz do Castelo, Lisboa',
});
const viewpoint = buildPlaceResult({
  key: 'osm:N:2002',
  ref: { osmType: 'N', osmId: 2002 },
  name: 'Miradouro de Santa Luzia',
  label: 'Largo de Santa Luzia, Lisboa',
});

function renderCard(props: Partial<WhatsHereCardProps> = {}, locale: 'en' | 'pt-BR' = 'en') {
  const handlers = {
    onPick: vi.fn(),
    onAddCustom: vi.fn(),
    onPointChange: vi.fn(),
    onClose: vi.fn(),
  };
  const view = renderWithProviders(
    <WhatsHereCard point={point} addLabel="Add to Day 2" {...handlers} {...props} />,
    { locale },
  );
  return { ...view, ...handlers };
}

describe('WhatsHereCard', () => {
  it('lists_nearby_places_for_the_rounded_point_and_picks_one', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      onEndpoint(endpoints.reversePlaces, ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return okResponse(endpoints.reversePlaces, { items: [castle, viewpoint] });
      }),
    );
    const { user, onPick } = renderCard();

    const list = await screen.findByRole('list');
    const names = within(list)
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(names).toEqual([
      'Castelo de São JorgeRua de Santa Cruz do Castelo, Lisboa',
      'Miradouro de Santa LuziaLargo de Santa Luzia, Lisboa',
    ]);
    expect(Object.fromEntries(queries[0]!)).toEqual({
      lng: '-9.1339',
      lat: '38.7139',
      locale: 'en',
    });

    await user.click(screen.getByRole('button', { name: /Miradouro de Santa Luzia/ }));

    expect(onPick).toHaveBeenCalledWith(viewpoint);
  });

  it('shows_the_point_it_describes', () => {
    server.use(respondWith(endpoints.reversePlaces, { items: [] }));
    renderCard();

    expect(screen.getByRole('heading', { name: "What's here?" })).toBeVisible();
    expect(screen.getByText('Spot at 38.71387, -9.13391')).toBeVisible();
  });

  it('says_when_no_named_place_is_near_and_still_offers_the_exact_spot', async () => {
    server.use(respondWith(endpoints.reversePlaces, { items: [] }));
    renderCard();

    expect(
      await screen.findByRole('heading', { name: 'No named places within 150 m of this spot.' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Use this exact spot' })).toBeVisible();
  });

  it('explains_a_busy_geocoder_and_retries', async () => {
    let attempts = 0;
    server.use(
      onEndpoint(endpoints.reversePlaces, () => {
        attempts += 1;
        return attempts === 1
          ? problemResponse('geocoding_busy')
          : okResponse(endpoints.reversePlaces, { items: [castle] });
      }),
    );
    const { user } = renderCard();

    expect(await screen.findByText('Search is busy, try again in a moment.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: /Castelo de São Jorge/ })).toBeVisible();
  });

  it('quotes_code_and_request_id_of_an_unexpected_failure', async () => {
    server.use(failWith(endpoints.reversePlaces, 'internal_error'));
    renderCard();

    expect(
      await screen.findByRole('heading', { name: 'Nearby places could not be loaded.' }),
    ).toBeVisible();
    expect(screen.getByText('Code: internal_error')).toBeVisible();
    expect(screen.getByText(`Request ID: ${TEST_REQUEST_ID}`)).toBeVisible();
  });

  it('requires_a_name_for_the_exact_spot', async () => {
    server.use(respondWith(endpoints.reversePlaces, { items: [] }));
    const { user, onAddCustom } = renderCard();

    await user.click(screen.getByRole('button', { name: 'Use this exact spot' }));
    const name = screen.getByRole('textbox', { name: 'Name' });
    expect(name).toHaveFocus();
    await user.type(name, '   {Enter}');

    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Give this spot a name.');
    expect(name.getAttribute('aria-describedby')).toContain(screen.getByRole('alert').id);
    expect(onAddCustom).not.toHaveBeenCalled();
  });

  it('adds_the_exact_spot_with_the_cleaned_name', async () => {
    server.use(respondWith(endpoints.reversePlaces, { items: [] }));
    const { user, onAddCustom } = renderCard();

    await user.click(screen.getByRole('button', { name: 'Use this exact spot' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), '  Casa da avó  ');
    await user.click(screen.getByRole('button', { name: 'Add to Day 2' }));

    expect(onAddCustom).toHaveBeenCalledWith({ name: 'Casa da avó', location: point });
  });

  it('moves_the_point_to_typed_coordinates', async () => {
    server.use(respondWith(endpoints.reversePlaces, { items: [] }));
    const { user, onPointChange } = renderCard();

    await user.click(screen.getByText('Coordinates'));
    const field = screen.getByRole('textbox', { name: 'Latitude, longitude' });
    await user.type(field, 'here{Enter}');

    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Type the latitude');
    expect(onPointChange).not.toHaveBeenCalled();

    await user.clear(field);
    await user.type(field, '41.1496, -8.6110');
    await user.click(screen.getByRole('button', { name: 'Go to these coordinates' }));

    expect(onPointChange).toHaveBeenCalledWith({ lat: 41.1496, lng: -8.611 });
    expect(field).not.toHaveAttribute('aria-invalid');
  });

  it('closes', async () => {
    server.use(respondWith(endpoints.reversePlaces, { items: [] }));
    const { user, onClose } = renderCard();

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('reads_in_portuguese', async () => {
    server.use(respondWith(endpoints.reversePlaces, { items: [] }));
    renderCard({ addLabel: 'Adicionar ao Dia 2' }, 'pt-BR');

    expect(screen.getByRole('heading', { name: 'O que tem aqui?' })).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Usar este ponto exato' })).toBeVisible();
    expect(screen.getByText('Coordenadas')).toBeVisible();
  });
});
