import { endpoints, type TripPlanViewer } from '@heremita/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDayRoute,
  buildPlan,
  buildViewerPlan,
  dayId,
  TRIP_ID,
  tripPlaceId,
} from '@/features/itinerary/test-support';
import { resetToasts } from '@/shared/components/toast/toast-store';
import { Toaster } from '@/shared/components/toast/toaster';
import { installFakeMatchMedia } from '@/shared/hooks/match-media.test-support';
import {
  buildMe,
  onEndpoint,
  okResponse,
  setupApiServer,
} from '../../../../../../test/msw/handlers';
import { renderWithProviders } from '../../../../../../test/render';
import { PublicTripViewer, SharedTripViewer } from './trip-viewer-screen';

vi.mock('@/shared/map/trip-map', () => ({
  TripMap: () => <div data-map-state="ready" />,
}));

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const server = setupApiServer();
const TOKEN = 'tok_0123456789abcdefghijklmnopqrstuv';
const COPY = {
  ...buildPlan().trip,
  id: '0195f0c8-0000-7000-8000-0000000000c1',
  title: 'Copy of Lisboa',
};

/** Every route request as `<endpoint> <mode|->`. */
let routeRequests: string[];

function serve(plan: TripPlanViewer) {
  routeRequests = [];
  const route =
    (name: string) =>
    ({ request, params }: { request: Request; params: { dayId: string } }) => {
      routeRequests.push(`${name} ${new URL(request.url).searchParams.get('mode') ?? '-'}`);
      return okResponse(endpoints.getDayRoute, buildDayRoute(plan, params.dayId));
    };
  server.use(
    onEndpoint(endpoints.getTripPlan, () => okResponse(endpoints.getTripPlan, plan)),
    onEndpoint(endpoints.getSharedPlan, () => okResponse(endpoints.getSharedPlan, plan)),
    onEndpoint(endpoints.getDayRoute, route('E40')),
    onEndpoint(endpoints.getSharedDayRoute, route('E27')),
  );
}

interface Options {
  plan?: TripPlanViewer;
  signedIn?: boolean;
  shared?: boolean;
  query?: string;
  locale?: 'en' | 'pt-BR';
}

function renderViewer({
  plan = buildViewerPlan(),
  signedIn = false,
  shared = false,
  query = '',
  locale = 'en',
}: Options = {}) {
  serve(plan);
  const path = shared ? `/${locale}/s/${TOKEN}${query}` : `/${locale}/t/${TRIP_ID}${query}`;
  const props = { initialPlan: plan, initialUpdatedAt: Date.now(), signedIn, path };
  return renderWithProviders(
    <StrictMode>
      {shared ? (
        <SharedTripViewer shareToken={TOKEN} {...props} />
      ) : (
        <PublicTripViewer tripId={TRIP_ID} {...props} />
      )}
      <Toaster />
    </StrictMode>,
    { route: path, locale, viewer: signedIn ? buildMe() : null },
  );
}

function recordCopies(def: typeof endpoints.copyTrip | typeof endpoints.copySharedTrip) {
  const paths: string[] = [];
  server.use(
    onEndpoint(def, ({ request }) => {
      paths.push(new URL(request.url).pathname);
      return okResponse(def, COPY);
    }),
  );
  return paths;
}

beforeEach(() => {
  installFakeMatchMedia();
  HTMLElement.prototype.hidePopover = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  act(() => resetToasts());
  push.mockReset();
  Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover');
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});

describe('TripViewerScreen', () => {
  it('shows_the_trip_with_its_author_and_no_edit_controls', async () => {
    renderViewer();

    expect(screen.getByRole('heading', { level: 1, name: 'Lisboa a pé' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'by Ana' })).toHaveAttribute(
      'href',
      expect.stringContaining('/en/u/'),
    );
    expect(screen.getByText('Example')).toBeInTheDocument();
    expect(screen.getByText('· 2 days')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Places of day 1' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Move / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a day' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Optimise order' })).not.toBeInTheDocument();
    expect(await screen.findAllByText('12 min · 900 m')).toHaveLength(2);
  });

  it('opens_a_place_without_note_or_day_controls', async () => {
    const { user, urlUpdates } = renderViewer();

    await user.click(screen.getByRole('button', { name: /^Miradouro da Graça/ }));

    expect(
      screen.getByRole('heading', { level: 3, name: 'Miradouro da Graça' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Your note')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See reviews' })).toBeInTheDocument();
    expect(urlUpdates.at(-1)?.queryString).toBe(`?place=${tripPlaceId(2)}`);
  });

  it('the_mode_switch_changes_the_url_and_route_only', async () => {
    const { user, urlUpdates } = renderViewer();
    await screen.findAllByText('12 min · 900 m');

    await user.click(screen.getByRole('radio', { name: 'Drive' }));

    expect(urlUpdates.at(-1)?.queryString).toBe('?mode=drive');
    expect(urlUpdates.at(-1)?.options.history).toBe('replace');
    await waitFor(() => expect(routeRequests).toEqual(['E40 -', 'E40 drive']));
  });

  it('a_leg_offers_directions_but_no_mode_change', async () => {
    renderViewer();
    const leg = await screen.findByRole('button', {
      name: 'Route to Miradouro da Graça on foot: 12 min · 900 m',
    });
    const popover = document.getElementById(leg.getAttribute('popovertarget') ?? '');

    expect(
      within(popover as HTMLElement).getByRole('link', { name: 'Google Maps', hidden: true }),
    ).toBeInTheDocument();
    expect(
      within(popover as HTMLElement).queryByRole('button', { name: 'Drive', hidden: true }),
    ).not.toBeInTheDocument();
  });

  it('a_share_link_reads_routes_through_its_token', async () => {
    renderViewer({ shared: true, query: `?day=${dayId(1)}` });

    await screen.findAllByText('12 min · 900 m');
    expect(routeRequests).toEqual(['E27 -']);
  });

  it('signed_out_copy_and_report_go_to_login_and_come_back', () => {
    renderViewer({ query: `?day=${dayId(1)}` });

    const copy = new URL(
      screen.getByRole('link', { name: 'Copy' }).getAttribute('href') ?? '',
      'http://localhost',
    );
    expect(copy.pathname).toBe('/en/login');
    expect(copy.searchParams.get('next')).toBe(`/en/t/${TRIP_ID}?day=${dayId(1)}&copy=1`);
    expect(screen.getByRole('link', { name: 'Report this trip' })).toHaveAttribute(
      'href',
      `/en/login?next=${encodeURIComponent(`/en/t/${TRIP_ID}?day=${dayId(1)}`)}`,
    );
  });

  it('signed_in_copy_creates_a_copy_and_offers_to_open_it', async () => {
    const copies = recordCopies(endpoints.copyTrip);
    const { user } = renderViewer({ signedIn: true });

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(
      await screen.findByText('Copy created: Copy of Lisboa', { selector: 'li *, li' }),
    ).toBeInTheDocument();
    expect(copies).toEqual([`/api/v1/trips/${TRIP_ID}/copies`]);
    await user.click(screen.getByRole('button', { name: 'Open copy' }));
    expect(push).toHaveBeenCalledWith(`/en/trips/${COPY.id}`);
  });

  it('resumes_the_copy_after_login_once_and_drops_the_param', async () => {
    const copies = recordCopies(endpoints.copySharedTrip);
    const { urlUpdates } = renderViewer({ signedIn: true, shared: true, query: '?copy=1' });

    expect(
      await screen.findByText('Copy created: Copy of Lisboa', { selector: 'li *, li' }),
    ).toBeInTheDocument();
    expect(copies).toEqual([`/api/v1/shared/${TOKEN}/copies`]);
    expect(urlUpdates.at(-1)?.queryString).toBe('');
  });

  it('signed_in_report_opens_the_report_dialog_for_the_trip', async () => {
    const { user } = renderViewer({ signedIn: true });

    await user.click(screen.getByRole('button', { name: 'Report this trip' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('explains_an_empty_trip', () => {
    renderViewer({ plan: buildViewerPlan({ places: [], days: [] }) });

    expect(screen.getByText('This trip has no places yet.')).toBeInTheDocument();
  });

  it('reads_in_portuguese', async () => {
    renderViewer({ locale: 'pt-BR' });

    expect(screen.getByRole('link', { name: 'por Ana' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Copiar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Denunciar esta viagem' })).toBeInTheDocument();
    expect(await screen.findAllByText('12 min · 900 m')).toHaveLength(2);
  });
});
