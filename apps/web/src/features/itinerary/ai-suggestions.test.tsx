import { endpoints } from '@heremita/shared';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  failWith,
  okResponse,
  onEndpoint,
  problemResponse,
  setupApiServer,
} from '../../../test/msw/handlers';
import { renderWithProviders } from '../../../test/render';
import { buildPlaceResult } from '../place-search/test-support';
import { AiSuggestions } from './ai-suggestions';
import { buildPlan, TRIP_ID } from './test-support';

const server = setupApiServer();

const AZULEJO = buildPlaceResult();
// Already in the plan: buildPlan's first place has this key.
const IN_TRIP = buildPlaceResult({ key: 'osm:W:1001', name: 'Castelo de São Jorge' });

function renderPanel(overrides: { disabled?: boolean } = {}) {
  const onAdd = vi.fn();
  const onShowOnMap = vi.fn();
  const view = renderWithProviders(
    <AiSuggestions
      tripId={TRIP_ID}
      plan={buildPlan()}
      disabled={overrides.disabled ?? false}
      onAdd={onAdd}
      onShowOnMap={onShowOnMap}
    />,
  );
  return { ...view, onAdd, onShowOnMap };
}

async function ask(user: ReturnType<typeof renderWithProviders>['user'], prompt: string) {
  await user.click(screen.getByRole('button', { name: 'Suggest places with AI' }));
  await user.type(
    await screen.findByRole('textbox', { name: 'What are you looking for?' }),
    prompt,
  );
  await user.click(screen.getByRole('button', { name: 'Suggest' }));
}

describe('AiSuggestions', () => {
  it('sends_the_prompt_with_the_locale_and_lists_real_places_with_their_reasons', async () => {
    let body: unknown;
    server.use(
      onEndpoint(endpoints.suggestPlaces, async ({ request, params }) => {
        body = await request.json();
        expect(params.tripId).toBe(TRIP_ID);
        return okResponse(endpoints.suggestPlaces, {
          items: [
            { place: AZULEJO, reason: 'Tiles from five centuries.' },
            { place: IN_TRIP, reason: 'The castle on the hill.' },
          ],
          dropped: 2,
        });
      }),
    );
    const { user, onAdd, onShowOnMap } = renderPanel();

    await ask(user, 'Museums for a rainy day');

    const list = await screen.findByRole('list', { name: 'Suggested places' });
    expect(body).toEqual({ prompt: 'Museums for a rainy day', locale: 'en', count: 6 });
    expect(within(list).getByText('Tiles from five centuries.')).toBeInTheDocument();
    expect(
      screen.getByText('2 ideas matched no real place nearby and were left out.'),
    ).toBeInTheDocument();
    // A place the trip already holds offers no Add.
    expect(within(list).getByText('In your trip')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add Castelo de São Jorge to ideas' }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Add Museu Nacional do Azulejo to ideas' }),
    );
    expect(onAdd).toHaveBeenCalledWith(AZULEJO);

    await user.click(
      screen.getByRole('button', { name: 'Show Museu Nacional do Azulejo on the map' }),
    );
    expect(onShowOnMap).toHaveBeenCalledWith(AZULEJO);
  });

  it('explains_a_missing_destination_without_offering_a_retry', async () => {
    server.use(failWith(endpoints.suggestPlaces, 'destination_required'));
    const { user } = renderPanel();

    await ask(user, 'Anything');

    expect(
      await screen.findByText(/Give the trip a destination in its settings/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('offers_a_retry_when_the_ai_was_unavailable', async () => {
    let calls = 0;
    server.use(
      onEndpoint(endpoints.suggestPlaces, () => {
        calls += 1;
        return calls === 1
          ? problemResponse('ai_unavailable')
          : okResponse(endpoints.suggestPlaces, { items: [], dropped: 0 });
      }),
    );
    const { user } = renderPanel();

    await ask(user, 'Anything');
    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByText(
        'None of the ideas matched a real place near your trip. Try different words.',
      ),
    ).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it('is_disabled_offline', () => {
    renderPanel({ disabled: true });

    expect(screen.getByRole('button', { name: 'Suggest places with AI' })).toBeDisabled();
  });
});
