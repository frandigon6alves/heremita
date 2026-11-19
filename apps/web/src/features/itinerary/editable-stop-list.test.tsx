import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeMatchMedia } from '@/shared/hooks/match-media.test-support';
import { renderWithProviders } from '../../../test/render';
import { EditableStopList } from './editable-stop-list';
import { buildPlan, dayId, TRIP_ID, tripPlaceId } from './test-support';
import { usePlanActions } from './use-plan-actions';
import type { OpenSource } from './stop-row';

function OwnerList({ onOpen }: { onOpen: (tripPlaceId: string, source: OpenSource) => void }) {
  const actions = usePlanActions(TRIP_ID, () => {});
  return (
    <EditableStopList
      plan={buildPlan()}
      dayId={dayId(1)}
      selectedPlaceId={null}
      onOpen={onOpen}
      editor={{ actions, disabled: false }}
    />
  );
}

beforeEach(() => {
  installFakeMatchMedia();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EditableStopList', () => {
  it('opens_a_place_whose_tap_began_on_the_first_render', async () => {
    const onOpen = vi.fn();
    const { user } = renderWithProviders(<OwnerList onOpen={onOpen} />);

    await user.pointer({
      keys: '[MouseLeft>]',
      target: screen.getByRole('button', { name: /^Castelo de São Jorge/ }),
    });
    await screen.findByRole('button', { name: 'Actions for Castelo de São Jorge' });
    await user.pointer({ keys: '[/MouseLeft]' });

    expect(onOpen).toHaveBeenCalledWith(tripPlaceId(1), 'pointer');
  });
});
