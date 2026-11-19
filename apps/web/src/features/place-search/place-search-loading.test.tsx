import { endpoints } from '@heremita/shared';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onEndpoint, okResponse, setupApiServer } from '../../../test/msw/handlers';
import { renderWithProviders } from '../../../test/render';
import { buildPlaceResult } from './test-support';

const server = setupApiServer();

/** A fresh module per test: the combobox is not loaded yet, as on a first page view. */
async function freshPlaceSearch() {
  vi.resetModules();
  return (await import('./place-search')).PlaceSearch;
}

/** The plain field has no `aria-activedescendant` wiring; the combobox's input carries downshift's ids. */
async function comboboxLoaded() {
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Search places' })).toHaveAttribute(
      'aria-labelledby',
    ),
  );
}

afterEach(() => {
  vi.doUnmock('./place-search-combobox');
});

beforeEach(() => {
  server.use(
    onEndpoint(endpoints.searchPlaces, () =>
      okResponse(endpoints.searchPlaces, { items: [buildPlaceResult()] }),
    ),
  );
});

describe('PlaceSearch before its combobox loads', () => {
  it('is_a_named_combobox_from_the_first_render', async () => {
    const PlaceSearch = await freshPlaceSearch();
    renderWithProviders(<PlaceSearch onSelect={vi.fn()} label="Destination" showLabel />);

    const input = screen.getByRole('combobox', { name: 'Destination' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Destination')).toBeVisible();
  });

  it('keeps_the_text_focus_and_caret_when_the_combobox_takes_over', async () => {
    const PlaceSearch = await freshPlaceSearch();
    const { user } = renderWithProviders(<PlaceSearch onSelect={vi.fn()} />);

    await user.type(screen.getByRole('combobox', { name: 'Search places' }), 'mu');
    await comboboxLoaded();
    await user.keyboard('seu');

    const input = screen.getByRole('combobox', { name: 'Search places' });
    expect(input).toHaveValue('museu');
    expect(input).toHaveFocus();
    expect(await screen.findByRole('option', { name: /Museu Nacional do Azulejo/ })).toBeVisible();
  });

  it('suggests_for_text_typed_in_full_before_the_combobox_loaded', async () => {
    let release = () => {};
    const downloaded = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.doMock('./place-search-combobox', async (importOriginal) => {
      await downloaded;
      return importOriginal();
    });
    const PlaceSearch = await freshPlaceSearch();
    const { user } = renderWithProviders(<PlaceSearch onSelect={vi.fn()} />);

    // `fill` (paste, autofill) puts the whole text in before the download ends.
    await user.click(screen.getByRole('combobox', { name: 'Search places' }));
    await user.paste('museu');
    release();

    expect(await screen.findByRole('option', { name: /Museu Nacional do Azulejo/ })).toBeVisible();
  });

  it('never_submits_the_surrounding_form_on_enter', async () => {
    const PlaceSearch = await freshPlaceSearch();
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    const { user } = renderWithProviders(
      <form onSubmit={onSubmit}>
        <PlaceSearch onSelect={vi.fn()} />
      </form>,
    );

    await user.type(screen.getByRole('combobox', { name: 'Search places' }), 'lisboa{Enter}');
    await comboboxLoaded();

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('starts_with_the_default_value_and_reports_typing', async () => {
    const PlaceSearch = await freshPlaceSearch();
    const onInputChange = vi.fn();
    const { user } = renderWithProviders(
      <PlaceSearch onSelect={vi.fn()} defaultValue="Lisboa" onInputChange={onInputChange} />,
    );
    const input = screen.getByRole('combobox', { name: 'Search places' });
    expect(input).toHaveValue('Lisboa');

    await user.type(input, '!');
    await comboboxLoaded();

    expect(screen.getByRole('combobox', { name: 'Search places' })).toHaveValue('Lisboa!');
    expect(onInputChange).toHaveBeenLastCalledWith('Lisboa!');
  });
});
