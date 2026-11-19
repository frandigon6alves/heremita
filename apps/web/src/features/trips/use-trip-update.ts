'use client';

import { endpoints, type TripOwner, type UpdateTripBody } from '@heremita/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';

/**
 * E21 for one trip. On success the trip query holds the answer at once and
 * everything showing the trip (plan, my trips) refreshes.
 */
export function useTripUpdate(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpdateTripBody) =>
      apiFetch(endpoints.updateTrip, { params: { tripId }, body }),
    onSuccess: async (updated: TripOwner) => {
      queryClient.setQueryData(queryKeys.trips.trip(tripId), updated);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.trips.plan(tripId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.trips.mine }),
      ]);
    },
  });
}
