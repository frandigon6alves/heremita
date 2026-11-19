'use client';

import { endpoints, type TripOwner } from '@heremita/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
import { apiFetch } from '@/lib/api/client';
import { ApiProblemError } from '@/lib/api/problem';
import { queryKeys } from '@/lib/api/query-keys';
import { routes } from '@/lib/routes';
import { Button } from '@/shared/components/button/button';
import { ConfirmDialog } from '@/shared/components/dialog/confirm-dialog';
import { TextField } from '@/shared/components/text-field/text-field';
import { showToast } from '@/shared/components/toast/toast-store';
import { useOnline } from '@/shared/hooks/use-online';
import { Copy, Share2 } from '@/shared/icons/icons';
import { FormAlert } from './form-alert';
import { submitFailure } from './submit-failure';
import styles from './trip-settings.module.css';

const neverChanges = () => () => undefined;
const browserOrigin = () => window.location.origin;
const canShareNatively = () => typeof navigator.share === 'function';
/** The server knows neither: the link shows as a path until hydration. */
const unknownOnServer = () => '';
const noShareOnServer = () => false;

/**
 * The trip's share link (`/<locale>/s/<token>`): copy it, hand it to the
 * system share sheet when there is one, or replace it with a new one (E23;
 * the old link stops working at once, so that asks first).
 */
export function ShareLink({ trip, shareToken }: { trip: TripOwner; shareToken: string }) {
  const t = useTranslations('trips.settings.share');
  const locale = useLocale();
  const online = useOnline();
  const queryClient = useQueryClient();
  const origin = useSyncExternalStore(neverChanges, browserOrigin, unknownOnServer);
  const canShare = useSyncExternalStore(neverChanges, canShareNatively, noShareOnServer);
  const [confirming, setConfirming] = useState(false);
  const url = `${origin}${routes.sharedTrip(locale, shareToken)}`;
  const rotate = useMutation({
    mutationFn: () => apiFetch(endpoints.rotateShareToken, { params: { tripId: trip.id } }),
    onSuccess: async ({ shareToken: next }) => {
      queryClient.setQueryData(queryKeys.trips.trip(trip.id), { ...trip, shareToken: next });
      setConfirming(false);
      showToast({ message: t('rotated') });
      await queryClient.invalidateQueries({ queryKey: queryKeys.trips.trip(trip.id) });
    },
    onError: async (error) => {
      // Made private elsewhere meanwhile: there is no link any more to replace.
      if (error instanceof ApiProblemError && error.code === 'trip_is_private') {
        setConfirming(false);
        showToast({ message: t('nowPrivate') });
        await queryClient.invalidateQueries({ queryKey: queryKeys.trips.trip(trip.id) });
      }
    },
  });
  const failure = rotate.isError ? submitFailure(rotate.error) : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      showToast({ message: t('copied') });
    } catch {
      showToast({ message: t('copyFailed') });
    }
  }

  async function share() {
    try {
      await navigator.share({ title: trip.title, url });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        showToast({ message: t('shareFailed') });
      }
    }
  }

  return (
    <div className={styles.share}>
      <TextField
        label={t('label')}
        hint={t('hint')}
        value={url}
        readOnly
        onFocus={(event) => event.currentTarget.select()}
      />
      <div className={styles.buttons}>
        <Button onClick={() => void copy()}>
          <Copy size={20} />
          {t('copy')}
        </Button>
        {canShare ? (
          <Button onClick={() => void share()}>
            <Share2 size={20} />
            {t('share')}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          disabled={!online}
          onClick={() => {
            rotate.reset();
            setConfirming(true);
          }}
        >
          {t('rotate')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('rotateTitle')}
        confirmLabel={t('rotateConfirm')}
        onConfirm={() => rotate.mutate()}
        busy={rotate.isPending}
      >
        <p>{t('rotateBody')}</p>
        {failure === null ? null : (
          <FormAlert
            message={failure.kind === 'offline' ? t('rotateOffline') : t('rotateFailed')}
            code={failure.kind === 'unexpected' ? failure.code : null}
            requestId={failure.kind === 'unexpected' ? failure.requestId : null}
          />
        )}
      </ConfirmDialog>
    </div>
  );
}
