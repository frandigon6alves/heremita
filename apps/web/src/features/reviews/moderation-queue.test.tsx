import { endpoints, type ReportItem } from '@heremita/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getSnapshot, resetToasts } from '@/shared/components/toast/toast-store';
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
import { ModerationQueue } from './moderation-queue';

const server = setupApiServer();
afterEach(() => resetToasts());

function buildReport(overrides: Partial<ReportItem> = {}): ReportItem {
  return {
    id: '0195f0c8-0000-7000-8000-000000010001',
    target: {
      type: 'review',
      id: '0195f0c8-0000-7000-8000-000000010002',
      excerpt: 'Péssimo, compre na minha loja',
    },
    contentStatus: 'visible',
    reason: 'spam',
    details: 'Link de loja no texto',
    status: 'open',
    reporter: { id: '0195f0c8-0000-7000-8000-000000010003', displayName: 'Caio', isDemo: false },
    createdAt: '2026-11-10T12:00:00.000Z',
    resolvedAt: null,
    ...overrides,
  };
}

const openPage = (items: ReportItem[], nextCursor: string | null = null) => ({ items, nextCursor });

describe('ModerationQueue', () => {
  it('shows_each_report_with_reason_details_reporter_and_content_status', () => {
    renderWithProviders(<ModerationQueue initialOpenPage={openPage([buildReport()])} />);

    const card = screen.getByRole('article');
    expect(within(card).getByText('Péssimo, compre na minha loja')).toBeVisible();
    expect(within(card).getByText('Reason: Spam or advertising')).toBeVisible();
    expect(within(card).getByText('Details: Link de loja no texto')).toBeVisible();
    expect(within(card).getByText('Reported by Caio on Nov 10, 2026')).toBeVisible();
    expect(within(card).getByText('Content visible')).toBeVisible();
    expect(within(card).getByRole('button', { name: 'Hide content' })).toBeVisible();
    expect(within(card).getByRole('button', { name: 'Dismiss' })).toBeVisible();
  });

  it('links_a_reported_trip', () => {
    const trip = buildReport({
      target: { type: 'trip', id: '0195f0c8-0000-7000-8000-000000020001', excerpt: 'Lisboa a pé' },
    });
    renderWithProviders(<ModerationQueue initialOpenPage={openPage([trip])} />);

    expect(screen.getByRole('link', { name: 'Open the trip' })).toHaveAttribute(
      'href',
      '/en/t/0195f0c8-0000-7000-8000-000000020001',
    );
  });

  it('hides_content_and_refetches_the_queue', async () => {
    const decisions: unknown[] = [];
    const report = buildReport();
    server.use(
      onEndpoint(endpoints.decideReport, async ({ request, params }) => {
        decisions.push({ id: params.reportId, ...((await request.json()) as object) });
        return okResponse(endpoints.decideReport, {
          ...report,
          status: 'actioned',
          contentStatus: 'hidden',
        });
      }),
      respondWith(endpoints.listReports, openPage([])),
    );
    const { user } = renderWithProviders(<ModerationQueue initialOpenPage={openPage([report])} />);

    await user.click(screen.getByRole('button', { name: 'Hide content' }));

    await waitFor(() => expect(getSnapshot().toasts.at(-1)?.message).toBe('Content hidden.'));
    expect(decisions).toEqual([{ id: report.id, decision: 'hide_content' }]);
    expect(
      await screen.findByRole('heading', { name: 'No open reports. Nothing to review right now.' }),
    ).toBeVisible();
  });

  it('offers_restore_for_hidden_content_and_no_dismiss_once_resolved', async () => {
    server.use(
      respondWith(
        endpoints.listReports,
        openPage([buildReport({ status: 'actioned', contentStatus: 'hidden' })]),
      ),
    );
    const { user } = renderWithProviders(<ModerationQueue initialOpenPage={openPage([])} />);

    await user.click(screen.getByRole('radio', { name: 'Actioned' }));

    expect(await screen.findByRole('button', { name: 'Restore' })).toBeVisible();
    expect(screen.getByText('Content hidden')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hide content' })).not.toBeInTheDocument();
  });

  it('fetches_each_status_it_shows', async () => {
    const statuses: string[] = [];
    server.use(
      onEndpoint(endpoints.listReports, ({ request }) => {
        statuses.push(new URL(request.url).searchParams.get('status') ?? '');
        return okResponse(endpoints.listReports, openPage([]));
      }),
    );
    const { user } = renderWithProviders(<ModerationQueue initialOpenPage={openPage([])} />);

    await user.click(screen.getByRole('radio', { name: 'Dismissed' }));

    expect(await screen.findByRole('heading', { name: 'No reports here yet.' })).toBeVisible();
    expect(statuses).toEqual(['dismissed']);
  });

  it('says_when_a_report_is_gone', async () => {
    server.use(failWith(endpoints.decideReport, 'not_found'));
    const { user } = renderWithProviders(
      <ModerationQueue initialOpenPage={openPage([buildReport()])} />,
    );

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This report no longer exists.');
    expect(screen.getByRole('alert')).toHaveTextContent(`Request ID: ${TEST_REQUEST_ID}`);
  });

  it('loads_more_reports', async () => {
    const second = buildReport({
      id: '0195f0c8-0000-7000-8000-000000030001',
      target: {
        type: 'review',
        id: '0195f0c8-0000-7000-8000-000000030002',
        excerpt: 'Segunda denúncia',
      },
    });
    server.use(respondWith(endpoints.listReports, openPage([second])));
    const { user } = renderWithProviders(
      <ModerationQueue initialOpenPage={openPage([buildReport()], 'next-1')} />,
    );

    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Segunda denúncia')).toBeVisible();
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('shows_an_error_with_retry_when_the_queue_fails', async () => {
    let attempts = 0;
    server.use(
      onEndpoint(endpoints.listReports, () => {
        attempts += 1;
        return attempts === 1
          ? problemResponse('internal_error')
          : okResponse(endpoints.listReports, openPage([buildReport()]));
      }),
    );
    const { user } = renderWithProviders(<ModerationQueue />);

    expect(
      await screen.findByRole('heading', { name: 'Reports could not be loaded.' }),
    ).toBeVisible();
    expect(screen.getByText('Code: internal_error')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('article')).toBeVisible();
  });

  it('reads_in_portuguese', () => {
    renderWithProviders(<ModerationQueue initialOpenPage={openPage([buildReport()])} />, {
      locale: 'pt-BR',
    });

    expect(screen.getByRole('button', { name: 'Ocultar conteúdo' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Dispensar' })).toBeVisible();
    expect(screen.getByText('Motivo: Spam ou propaganda')).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Abertas' })).toBeChecked();
  });
});
