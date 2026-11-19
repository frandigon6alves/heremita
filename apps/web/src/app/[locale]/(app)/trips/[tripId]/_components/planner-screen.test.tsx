import { endpoints, type TripPlanOwner } from '@heremita/shared';
import { onlineManager } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import { delay } from 'msw';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyAddStop,
  applyCreateDay,
  applyDeleteDay,
  applyDeleteTripPlace,
  applyMoveStop,
  applyRemoveStop,
} from '@/features/itinerary/apply-plan-ops';
import {
  buildDayRoute,
  buildPlan,
  buildTripPlace,
  dayId,
  stopId,
  TRIP_ID,
  tripPlaceId,
} from '@/features/itinerary/test-support';
import { buildPlaceResult } from '@/features/place-search/test-support';
import { resetToasts } from '@/shared/components/toast/toast-store';
import { Toaster } from '@/shared/components/toast/toaster';
import { installFakeMatchMedia } from '@/shared/hooks/match-media.test-support';
import { loadPlaceSearchCombobox } from '@/features/place-search/place-search';
import {
  buildMe,
  onEndpoint,
  okResponse,
  problemResponse,
  setupApiServer,
} from '../../../../../../../test/msw/handlers';
import { renderWithProviders } from '../../../../../../../test/render';
import { PlannerScreen } from './planner-screen';

vi.mock('@/shared/map/trip-map', () => ({
  TripMap: () => <div data-map-state="ready" />,
}));

const server = setupApiServer();

// The combobox loads on first focus in the app; here it is in from the start.
beforeAll(async () => {
  await loadPlaceSearchCombobox();
});

/** What the API holds: GET /plan answers it, writes that succeed change it. */
let serverPlan: TripPlanOwner;

function servePlan(plan: TripPlanOwner) {
  serverPlan = plan;
  server.use(
    onEndpoint(endpoints.getTripPlan, () => okResponse(endpoints.getTripPlan, serverPlan)),
    onEndpoint(endpoints.getDayRoute, ({ params }) =>
      okResponse(endpoints.getDayRoute, buildDayRoute(serverPlan, params.dayId)),
    ),
  );
}

/** Records the JSON body (or `null`) of every call to an endpoint. */
function record(
  def: Parameters<typeof onEndpoint>[0],
  answer: (body: unknown) => Response | Promise<Response>,
) {
  const bodies: unknown[] = [];
  server.use(
    onEndpoint(def, async ({ request }) => {
      const text = await request.text();
      const body: unknown = text === '' ? null : JSON.parse(text);
      bodies.push(body);
      return answer(body);
    }),
  );
  return bodies;
}

function renderPlanner(plan = buildPlan(), route = `/en/trips/${TRIP_ID}`) {
  servePlan(plan);
  return renderWithProviders(
    <>
      <PlannerScreen tripId={TRIP_ID} initialPlan={plan} initialUpdatedAt={Date.now()} />
      <Toaster />
    </>,
    { route, viewer: buildMe() },
  );
}

function rowNames(listName: string): string[] {
  const list = screen.getByRole('list', { name: listName });
  return within(list)
    .getAllByRole('listitem')
    .map(
      (item) => within(item).getAllByRole('button')[0]?.querySelector('span')?.textContent ?? '',
    );
}

/** A closed popover menu's item (jsdom keeps closed popovers in the tree, hidden). */
function menuItem(menuLabel: string, item: string): HTMLElement {
  const trigger = screen.getByRole('button', { name: menuLabel });
  const popover = document.getElementById(trigger.getAttribute('popovertarget') ?? '');
  if (popover === null) {
    throw new Error(`menu ${menuLabel} missing`);
  }
  return within(popover).getByRole('button', { name: item, hidden: true });
}

const rowItem = (name: string, item: string) => menuItem(`Actions for ${name}`, item);

function toast(text: string | RegExp) {
  return screen.findByText(text, { selector: 'li *, li' });
}

/** What jsdom lacks and the planner calls. */
function stubBrowser() {
  installFakeMatchMedia();
  HTMLElement.prototype.hidePopover = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
}

function unstubBrowser() {
  Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover');
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  vi.unstubAllGlobals();
}

beforeEach(stubBrowser);

afterEach(() => {
  act(() => {
    resetToasts();
    onlineManager.setOnline(true);
  });
  window.sessionStorage.clear();
  unstubBrowser();
});

describe('PlannerScreen read path', () => {
  it('opens_on_the_first_day_with_stops_in_visit_order', () => {
    renderPlanner();

    expect(screen.getByRole('heading', { level: 1, name: 'Lisboa a pé' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Day 1', pressed: true })).toBeInTheDocument();
    expect(screen.getByText('Day 1 · 3 places')).toBeInTheDocument();
    expect(rowNames('Places of day 1')).toEqual([
      'Castelo de São Jorge',
      'Miradouro da Graça',
      'Time Out Market',
    ]);
  });

  it('switching_day_replaces_the_url_and_lists_that_day', async () => {
    const { user, urlUpdates } = renderPlanner();

    await user.click(screen.getByRole('button', { name: 'Ideas' }));

    expect(rowNames('Ideas')).toEqual(['LX Factory']);
    expect(urlUpdates.at(-1)?.queryString).toBe('?day=ideas');
    expect(urlUpdates.at(-1)?.options.history).toBe('replace');
  });

  it('opening_a_place_pushes_it_and_back_returns_to_the_list', async () => {
    const { user, urlUpdates } = renderPlanner();

    await user.click(screen.getByRole('button', { name: /^Miradouro da Graça/ }));

    expect(
      screen.getByRole('heading', { level: 3, name: 'Miradouro da Graça' }),
    ).toBeInTheDocument();
    expect(urlUpdates.at(-1)?.queryString).toBe(`?place=${tripPlaceId(2)}`);
    expect(urlUpdates.at(-1)?.options.history).toBe('push');

    await user.click(screen.getByRole('button', { name: 'Back to the list' }));

    expect(rowNames('Places of day 1')).toHaveLength(3);
    expect(urlUpdates.at(-1)?.queryString).toBe('');
  });

  it('focuses_the_card_heading_only_when_opened_from_the_keyboard', async () => {
    const { user } = renderPlanner();
    screen.getByRole('button', { name: /^Time Out Market/ }).focus();

    await user.keyboard('{Enter}');

    expect(screen.getByRole('heading', { level: 3, name: 'Time Out Market' })).toHaveFocus();
  });

  it('reads_a_selected_place_from_the_url', () => {
    renderPlanner(buildPlan(), `/en/trips/${TRIP_ID}?day=${dayId(2)}&place=${tripPlaceId(4)}`);

    expect(screen.getByRole('heading', { level: 3, name: 'Belém Tower' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Day: Day 2' })).toBeInTheDocument();
  });

  it('stays_on_the_opening_day_when_its_last_stop_is_removed', async () => {
    const plan = applyRemoveStop(applyRemoveStop(buildPlan(), stopId(2)), stopId(3));
    record(endpoints.deleteStop, () => {
      serverPlan = applyRemoveStop(serverPlan, stopId(1));
      return okResponse(endpoints.deleteStop, { planVersion: 8 });
    });
    const { user } = renderPlanner(plan);
    await screen.findByRole('button', { name: 'Actions for Castelo de São Jorge' });

    await user.click(rowItem('Castelo de São Jorge', 'Remove from day'));

    expect(screen.getByRole('button', { name: 'Day 1', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No places on this day yet' })).toBeInTheDocument();
  });

  it('explains_an_empty_day', async () => {
    const plan = buildPlan();
    const { user } = renderPlanner(applyRemoveStop(plan, stopId(4)));

    await user.click(screen.getByRole('button', { name: 'Day 2' }));

    expect(screen.getByRole('heading', { name: 'No places on this day yet' })).toBeInTheDocument();
  });

  it('lists_every_day_under_its_heading_for_all', async () => {
    const { user } = renderPlanner();

    await user.click(screen.getByRole('button', { name: 'All' }));

    expect(screen.getByRole('heading', { level: 3, name: 'Day 2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Ideas' })).toBeInTheDocument();
  });
});

describe('PlannerScreen moves', () => {
  it('move_down_reorders_at_once_announces_and_saves_the_placement', async () => {
    const bodies = record(endpoints.putStopPlacement, () => {
      serverPlan = applyMoveStop(serverPlan, stopId(1), dayId(1), 1);
      return okResponse(endpoints.putStopPlacement, { planVersion: 8 });
    });
    const { user } = renderPlanner();

    await user.click(rowItem('Castelo de São Jorge', 'Move down'));

    expect(rowNames('Places of day 1').slice(0, 2)).toEqual([
      'Miradouro da Graça',
      'Castelo de São Jorge',
    ]);
    expect(screen.getByText('Castelo de São Jorge, now 2 of 3 on day 1')).toBeInTheDocument();
    await waitFor(() => expect(bodies).toEqual([{ dayId: dayId(1), index: 1 }]));
  });

  it('a_failed_move_restores_the_exact_order_and_retry_sends_it_again', async () => {
    const bodies = record(endpoints.putStopPlacement, async () => {
      await delay(300);
      return problemResponse('internal_error');
    });
    const { user } = renderPlanner();

    await user.click(rowItem('Time Out Market', 'Move to the start'));
    expect(rowNames('Places of day 1')[0]).toBe('Time Out Market');

    await toast('Could not move Time Out Market.');
    expect(rowNames('Places of day 1')).toEqual([
      'Castelo de São Jorge',
      'Miradouro da Graça',
      'Time Out Market',
    ]);

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ dayId: dayId(1), index: 0 });
  });

  it('shows_saving_in_the_app_bar_only_once_a_save_takes_long', async () => {
    record(endpoints.putStopPlacement, async () => {
      await delay(900);
      return okResponse(endpoints.putStopPlacement, { planVersion: 8 });
    });
    const { user } = renderPlanner();

    await user.click(rowItem('Castelo de São Jorge', 'Move down'));

    expect(screen.queryByText('Saving…')).not.toBeInTheDocument();
    expect(await screen.findByText('Saving…', {}, { timeout: 800 })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Saving…')).not.toBeInTheDocument(), {
      timeout: 1500,
    });
  });

  it('moving_to_a_full_day_says_so', async () => {
    record(endpoints.putStopPlacement, () => problemResponse('day_full'));
    const { user } = renderPlanner();

    await user.click(rowItem('Castelo de São Jorge', 'Day 2'));

    expect(await toast('Day 2 is full.')).toBeInTheDocument();
  });

  it('dragging_with_the_keyboard_saves_the_new_position', async () => {
    const bodies = record(endpoints.putStopPlacement, () =>
      okResponse(endpoints.putStopPlacement, { planVersion: 8 }),
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function rect(
      this: HTMLElement,
    ) {
      const row = this.closest('li');
      const index = row?.parentElement ? Array.from(row.parentElement.children).indexOf(row) : 0;
      const top = index * 56;
      return {
        x: 0,
        y: top,
        top,
        left: 0,
        width: 320,
        height: 56,
        right: 320,
        bottom: top + 56,
        toJSON: () => ({}),
      };
    });
    const { user } = renderPlanner();
    screen.getByRole('button', { name: 'Move Castelo de São Jorge' }).focus();

    await user.keyboard(' ');
    await waitFor(async () => {
      await user.keyboard('{ArrowDown}');
      expect(document.querySelector('[id^="DndLiveRegion"]')).toHaveTextContent(
        'Castelo de São Jorge moved to position 2 of 3.',
      );
    });
    await user.keyboard(' ');

    await waitFor(() => expect(bodies).toEqual([{ dayId: dayId(1), index: 1 }]));
    vi.restoreAllMocks();
  });
});

describe('PlannerScreen removals', () => {
  it('remove_from_day_takes_the_row_off_and_undo_puts_it_back_at_its_index', async () => {
    record(endpoints.deleteStop, () => {
      serverPlan = applyRemoveStop(serverPlan, stopId(2));
      return okResponse(endpoints.deleteStop, { planVersion: 8 });
    });
    const restores = record(endpoints.addStop, () =>
      okResponse(endpoints.addStop, {
        stop: { id: stopId(9), tripPlaceId: tripPlaceId(2), modeToNext: null },
        planVersion: 9,
      }),
    );
    const { user } = renderPlanner();

    await user.click(rowItem('Miradouro da Graça', 'Remove from day'));
    expect(rowNames('Places of day 1')).toEqual(['Castelo de São Jorge', 'Time Out Market']);

    await toast('Miradouro da Graça removed from day 1');
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(restores).toEqual([{ tripPlaceId: tripPlaceId(2), index: 1 }]));
  });

  it('delete_from_trip_undo_re_adds_the_place_with_its_note_on_its_day', async () => {
    const plan = buildPlan();
    const noted = {
      ...plan,
      places: plan.places.map((place) =>
        place.id === tripPlaceId(1) ? { ...place, note: 'Go early' } : place,
      ),
    };
    record(endpoints.deleteTripPlace, () => {
      serverPlan = applyDeleteTripPlace(serverPlan, tripPlaceId(1));
      return okResponse(endpoints.deleteTripPlace, { planVersion: 8 });
    });
    const readds = record(endpoints.addTripPlace, () =>
      okResponse(endpoints.addTripPlace, {
        tripPlace: { ...buildTripPlace(1), id: tripPlaceId(9) },
        stopId: stopId(9),
        planVersion: 9,
      }),
    );
    const { user } = renderPlanner(noted);

    await user.click(rowItem('Castelo de São Jorge', 'Delete from trip'));
    expect(rowNames('Places of day 1')).toEqual(['Miradouro da Graça', 'Time Out Market']);

    await toast('Castelo de São Jorge deleted from the trip');
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() =>
      expect(readds).toEqual([
        {
          place: { type: 'osm', key: 'osm:W:1001' },
          note: 'Go early',
          schedule: { dayId: dayId(1), index: 0 },
        },
      ]),
    );
  });
});

describe('PlannerScreen focus after a row leaves', () => {
  it('moves_focus_to_the_next_row_when_a_stop_is_removed', async () => {
    record(endpoints.deleteStop, () => okResponse(endpoints.deleteStop, { planVersion: 8 }));
    const { user } = renderPlanner();
    await screen.findByRole('button', { name: 'Actions for Miradouro da Graça' });

    await user.click(rowItem('Miradouro da Graça', 'Remove from day'));

    expect(screen.getByRole('button', { name: /^Time Out Market/ })).toHaveFocus();
  });

  it('moves_focus_to_the_previous_row_when_the_last_stop_moves_to_another_day', async () => {
    record(endpoints.putStopPlacement, () =>
      okResponse(endpoints.putStopPlacement, { planVersion: 8 }),
    );
    const { user } = renderPlanner();
    await screen.findByRole('button', { name: 'Actions for Time Out Market' });

    await user.click(rowItem('Time Out Market', 'Day 2'));

    expect(screen.getByRole('button', { name: /^Miradouro da Graça/ })).toHaveFocus();
  });

  it('moves_focus_to_the_day_chip_when_the_only_idea_is_scheduled', async () => {
    record(endpoints.addStop, () =>
      okResponse(endpoints.addStop, {
        stop: { id: stopId(9), tripPlaceId: tripPlaceId(5), modeToNext: null },
        planVersion: 8,
      }),
    );
    const { user } = renderPlanner(buildPlan(), `/en/trips/${TRIP_ID}?day=ideas`);

    await user.click(rowItem('LX Factory', 'Day 1'));

    expect(screen.getByRole('button', { name: 'Ideas', pressed: true })).toHaveFocus();
  });
});

describe('PlannerScreen undo of a delete', () => {
  it('keeps_the_restored_place_when_a_later_day_refuses_it_and_retries_only_that_day', async () => {
    const twoDays = applyAddStop(buildPlan(), dayId(2), {
      id: stopId(8),
      tripPlaceId: tripPlaceId(1),
      modeToNext: null,
    });
    record(endpoints.deleteTripPlace, () =>
      okResponse(endpoints.deleteTripPlace, { planVersion: 8 }),
    );
    const readds = record(endpoints.addTripPlace, () =>
      okResponse(endpoints.addTripPlace, {
        tripPlace: { ...buildTripPlace(1), id: tripPlaceId(9) },
        stopId: stopId(9),
        planVersion: 9,
      }),
    );
    let refuse = true;
    const extras = record(endpoints.addStop, () =>
      refuse
        ? problemResponse('internal_error')
        : okResponse(endpoints.addStop, {
            stop: { id: stopId(10), tripPlaceId: tripPlaceId(9), modeToNext: null },
            planVersion: 10,
          }),
    );
    const { user } = renderPlanner(twoDays);
    await screen.findByRole('button', { name: 'Actions for Castelo de São Jorge' });

    await user.click(rowItem('Castelo de São Jorge', 'Delete from trip'));
    await toast('Castelo de São Jorge deleted from the trip');
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(
      await toast('Castelo de São Jorge is back, but not on every day it was on.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Could not add Castelo de São Jorge.')).not.toBeInTheDocument();
    refuse = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() =>
      expect(extras).toEqual([
        { tripPlaceId: tripPlaceId(9), index: 1 },
        { tripPlaceId: tripPlaceId(9), index: 1 },
      ]),
    );
    expect(readds).toHaveLength(1);
  });
});

describe('PlannerScreen adds', () => {
  function serveSearch() {
    const result = buildPlaceResult({ name: 'Museu do Azulejo' });
    server.use(
      onEndpoint(endpoints.searchPlaces, () =>
        okResponse(endpoints.searchPlaces, { items: [result] }),
      ),
    );
    return result;
  }

  async function chooseResult(user: ReturnType<typeof renderPlanner>['user']) {
    await user.type(screen.getByRole('combobox', { name: 'Search places' }), 'azulejo');
    await user.click(await screen.findByRole('option', { name: /Museu do Azulejo/ }));
  }

  it('adds_a_search_result_to_the_selected_day_and_opens_it', async () => {
    const result = serveSearch();
    const created = {
      ...buildTripPlace(6),
      place: { ...buildTripPlace(6).place, name: result.name },
    };
    const bodies = record(endpoints.addTripPlace, () => {
      serverPlan = applyAddStop(
        { ...serverPlan, places: [...serverPlan.places, created] },
        dayId(1),
        { id: stopId(6), tripPlaceId: created.id, modeToNext: null },
      );
      return okResponse(endpoints.addTripPlace, {
        tripPlace: created,
        stopId: stopId(6),
        planVersion: 8,
      });
    });
    const { user, urlUpdates } = renderPlanner();

    await chooseResult(user);
    await user.click(screen.getByRole('button', { name: 'Add to day 1' }));

    await waitFor(() =>
      expect(bodies).toEqual([
        { place: { type: 'osm', key: result.key }, note: null, schedule: { dayId: dayId(1) } },
      ]),
    );
    expect(await toast('Museu do Azulejo added to day 1')).toBeInTheDocument();
    await waitFor(() => expect(urlUpdates.at(-1)?.queryString).toBe(`?place=${created.id}`));
  });

  it('a_result_picked_with_the_keyboard_takes_focus_to_its_card', async () => {
    serveSearch();
    const { user } = renderPlanner();

    await user.type(screen.getByRole('combobox', { name: 'Search places' }), 'azulejo');
    await screen.findByRole('option', { name: /Museu do Azulejo/ });
    await user.keyboard('{ArrowDown}{Enter}');

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Museu do Azulejo' }),
    ).toHaveFocus();
  });

  it('a_result_picked_with_a_tap_leaves_focus_in_the_search', async () => {
    serveSearch();
    const { user } = renderPlanner();

    await chooseResult(user);

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Museu do Azulejo' }),
    ).not.toHaveFocus();
  });

  it('a_place_already_in_the_trip_is_put_on_the_day_instead', async () => {
    serveSearch();
    record(endpoints.addTripPlace, () =>
      problemResponse('place_already_in_trip', { tripPlaceId: tripPlaceId(5) }),
    );
    const stops = record(endpoints.addStop, () =>
      okResponse(endpoints.addStop, {
        stop: { id: stopId(9), tripPlaceId: tripPlaceId(5), modeToNext: null },
        planVersion: 8,
      }),
    );
    const { user } = renderPlanner();

    await chooseResult(user);
    await user.click(screen.getByRole('button', { name: 'Add to day 1' }));

    await waitFor(() => expect(stops).toEqual([{ tripPlaceId: tripPlaceId(5) }]));
  });

  it('a_failed_add_rolls_back_and_keeps_the_result_for_retry', async () => {
    serveSearch();
    record(endpoints.addTripPlace, async () => {
      await delay(300);
      return problemResponse('internal_error');
    });
    const { user } = renderPlanner();

    await chooseResult(user);
    await user.click(screen.getByRole('button', { name: 'Add to day 1' }));

    expect(await toast('Could not add Museu do Azulejo.')).toBeInTheDocument();
    expect(screen.getByText(/^Day 1 · 3 places/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Museu do Azulejo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('PlannerScreen note', () => {
  it('saves_the_note_after_typing_pauses_and_says_saved', async () => {
    const bodies = record(endpoints.updateTripPlace, (body) =>
      okResponse(endpoints.updateTripPlace, {
        tripPlace: { ...buildTripPlace(1), note: (body as { note: string }).note },
        planVersion: 7,
      }),
    );
    const { user } = renderPlanner(buildPlan(), `/en/trips/${TRIP_ID}?place=${tripPlaceId(1)}`);

    await user.type(screen.getByRole('textbox', { name: 'Your note' }), 'Go early');

    await waitFor(() => expect(bodies).toEqual([{ note: 'Go early' }]), { timeout: 2000 });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(`hm-draft:note:${tripPlaceId(1)}`)).toBeNull();
  });

  it('a_failed_save_keeps_the_text_and_mirrors_it_for_a_reload', async () => {
    record(endpoints.updateTripPlace, () => problemResponse('internal_error'));
    const { user } = renderPlanner(buildPlan(), `/en/trips/${TRIP_ID}?place=${tripPlaceId(1)}`);
    const note = screen.getByRole('textbox', { name: 'Your note' });

    await user.type(note, 'Tickets');
    await user.tab();

    expect(await screen.findByText('Not saved')).toBeInTheDocument();
    expect(note).toHaveValue('Tickets');
    expect(window.sessionStorage.getItem(`hm-draft:note:${tripPlaceId(1)}`)).toBe('Tickets');
  });
});

describe('PlannerScreen note draft', () => {
  const draftKey = `hm-draft:note:${tripPlaceId(1)}`;

  it('saves_a_draft_left_by_an_earlier_visit', async () => {
    window.sessionStorage.setItem(draftKey, 'Book a table');
    const bodies = record(endpoints.updateTripPlace, (body) =>
      okResponse(endpoints.updateTripPlace, {
        tripPlace: { ...buildTripPlace(1), note: (body as { note: string }).note },
        planVersion: 7,
      }),
    );
    renderPlanner(buildPlan(), `/en/trips/${TRIP_ID}?place=${tripPlaceId(1)}`);

    expect(await screen.findByRole('textbox', { name: 'Your note' })).toHaveValue('Book a table');
    await waitFor(() => expect(bodies).toEqual([{ note: 'Book a table' }]), { timeout: 2000 });
    await waitFor(() => expect(window.sessionStorage.getItem(draftKey)).toBeNull());
  });

  it('drops_a_draft_the_server_already_has', async () => {
    const plan = buildPlan();
    const noted = {
      ...plan,
      places: plan.places.map((place) =>
        place.id === tripPlaceId(1) ? { ...place, note: 'Go early' } : place,
      ),
    };
    window.sessionStorage.setItem(draftKey, 'Go early');
    renderPlanner(noted, `/en/trips/${TRIP_ID}?place=${tripPlaceId(1)}`);

    expect(await screen.findByRole('textbox', { name: 'Your note' })).toHaveValue('Go early');
    await waitFor(() => expect(window.sessionStorage.getItem(draftKey)).toBeNull());
  });
});

describe('PlannerScreen days', () => {
  it('adds_a_day_at_the_end', async () => {
    const created = {
      id: dayId(3),
      number: 3,
      date: null,
      mode: 'walk' as const,
      modeOverride: null,
      stops: [],
    };
    const bodies = record(endpoints.createDay, () => {
      serverPlan = applyCreateDay(serverPlan, created);
      return okResponse(endpoints.createDay, { day: created, planVersion: 8 });
    });
    const { user } = renderPlanner();

    await user.click(screen.getByRole('button', { name: 'Add a day' }));

    expect(screen.getByRole('button', { name: 'Day 3' })).toBeInTheDocument();
    await waitFor(() => expect(bodies).toEqual([{}]));
  });

  it('deleting_a_day_with_stops_asks_first', async () => {
    const deletes = record(endpoints.deleteDay, () => {
      serverPlan = applyDeleteDay(serverPlan, dayId(1));
      return okResponse(endpoints.deleteDay, { planVersion: 8 });
    });
    const { user } = renderPlanner();

    await user.click(menuItem('Options for day 1', 'Delete day 1'));
    const dialog = screen.getByRole('dialog', { name: 'Delete day 1?' });
    expect(within(dialog).getByText(/Its 3 places go back to Ideas/)).toBeInTheDocument();
    expect(deletes).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Delete day 1' }));

    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(screen.queryByRole('button', { name: 'Day 2' })).not.toBeInTheDocument();
  });

  it('deleting_an_empty_day_needs_no_confirmation', async () => {
    const deletes = record(endpoints.deleteDay, () =>
      okResponse(endpoints.deleteDay, { planVersion: 8 }),
    );
    const { user } = renderPlanner(
      applyRemoveStop(buildPlan(), stopId(4)),
      `/en/trips/${TRIP_ID}?day=${dayId(2)}`,
    );

    await user.click(menuItem('Options for day 2', 'Delete day 2'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(deletes).toHaveLength(1));
  });
});

describe('PlannerScreen offline', () => {
  it('disables_edit_controls_while_offline_and_enables_them_again', () => {
    renderPlanner();

    act(() => onlineManager.setOnline(false));

    expect(screen.getByRole('button', { name: 'Actions for Castelo de São Jorge' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add a day' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add here' })).toBeDisabled();

    act(() => onlineManager.setOnline(true));

    expect(screen.getByRole('button', { name: 'Actions for Castelo de São Jorge' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Add here' })).toBeEnabled();
  });
});

describe('PlannerScreen in Portuguese', () => {
  it('shows_the_brazilian_copy', () => {
    servePlan(buildPlan());
    renderWithProviders(
      <PlannerScreen tripId={TRIP_ID} initialPlan={buildPlan()} initialUpdatedAt={Date.now()} />,
      { route: `/pt-BR/trips/${TRIP_ID}`, locale: 'pt-BR', viewer: buildMe() },
    );

    expect(screen.getByText('Dia 1 · 3 lugares')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar aqui' })).toBeInTheDocument();
  });
});
