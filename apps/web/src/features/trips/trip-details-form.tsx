'use client';

import { LIMITS, type TravelMode, type TripOwner, type UpdateTripBody } from '@heremita/shared';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { useForm, useWatch, type FieldErrors, type Resolver } from 'react-hook-form';
import { bodyPathsOf } from '@/lib/api/failure';
import { Button } from '@/shared/components/button/button';
import { FormAlert } from '@/shared/components/form-alert/form-alert';
import { SegmentedControl } from '@/shared/components/segmented-control/segmented-control';
import { StatusLine } from '@/shared/components/status-line/status-line';
import { TextArea } from '@/shared/components/text-area/text-area';
import { TextField } from '@/shared/components/text-field/text-field';
import { useOnline } from '@/shared/hooks/use-online';
import {
  destinationAfterTyping,
  destinationFromPlace,
  type DestinationPicker,
} from './destination';
import { useTripUpdate } from './use-trip-update';
import {
  detailsFromTrip,
  parseTripDetails,
  tripDetailsFieldOf,
  type TripDetailsField,
  type TripDetailsValues,
} from './trip-details-model';
import styles from './trip-form.module.css';

const SERVER = 'server';
const MODES: readonly TravelMode[] = ['walk', 'bike', 'drive'];

export interface TripDetailsFormProps {
  trip: TripOwner;
  /** Renders the destination search (composed by the page) wired through `picker`. */
  renderDestination: (picker: DestinationPicker & { label: string }) => ReactNode;
}

/**
 * Title, description, destination, first day and default mode of a trip
 * (E21). Only the fields that changed are sent; the number of days changes
 * in the planner.
 */
export function TripDetailsForm({ trip, renderDestination }: TripDetailsFormProps) {
  const t = useTranslations('trips.settings.details');
  const tForm = useTranslations('trips.form');
  const tModes = useTranslations('trips.modes');
  const online = useOnline();
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  const [saved, setSaved] = useState(false);
  const resolver: Resolver<TripDetailsValues, unknown, UpdateTripBody | null> = (values) => {
    const parsed = parseTripDetails(values, trip);
    if (parsed.ok) {
      return { values: parsed.body, errors: {} };
    }
    const errors = Object.fromEntries(
      Object.entries(parsed.issues).map(([field, type]) => [field, { type, message: '' }]),
    );
    return { values: {}, errors: errors as FieldErrors<TripDetailsValues> };
  };
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    getValues,
    reset,
    control,
    formState: { errors, isSubmitting, isSubmitted, isDirty },
  } = useForm<TripDetailsValues, unknown, UpdateTripBody | null>({
    resolver,
    mode: 'onTouched',
    defaultValues: detailsFromTrip(trip),
  });
  const defaultMode = useWatch({ control, name: 'defaultMode' });
  const save = useTripUpdate(trip.id);

  const onSubmit = handleSubmit(async (body) => {
    setFailure(null);
    setSaved(false);
    if (body === null) {
      reset(getValues());
      setSaved(true);
      return;
    }
    try {
      const updated = await save.mutateAsync(body);
      reset(detailsFromTrip(updated));
      setSaved(true);
    } catch (error) {
      const fields = new Set(
        bodyPathsOf(error)
          .map(tripDetailsFieldOf)
          .filter((field) => field !== null),
      );
      if (fields.size === 0) {
        setFailure({ error });
      }
      [...fields].forEach((field, index) =>
        setError(field, { type: SERVER }, { shouldFocus: index === 0 }),
      );
    }
  });

  const picker: DestinationPicker & { label: string } = {
    label: tForm('destination'),
    defaultValue: trip.destination?.name ?? '',
    onPick: (place) =>
      setValue('destination', destinationFromPlace(place), {
        shouldDirty: true,
        shouldValidate: isSubmitted,
      }),
    onText: (text) =>
      setValue('destination', destinationAfterTyping(getValues('destination'), text), {
        shouldDirty: true,
        shouldValidate: isSubmitted,
      }),
  };

  const message = (field: TripDetailsField): string | undefined => {
    const type = errors[field]?.type;
    if (type === undefined) {
      return undefined;
    }
    switch (field) {
      case 'title':
        if (type === 'too_big') {
          return tForm('errors.titleTooLong', { max: LIMITS.TRIP_TITLE_MAX });
        }
        return type === SERVER ? tForm('errors.titleRejected') : tForm('errors.titleRequired');
      case 'description':
        return type === 'too_big'
          ? t('descriptionTooLong', { max: LIMITS.TRIP_DESCRIPTION_MAX })
          : t('descriptionRejected');
      case 'destination':
        return type === 'too_big'
          ? tForm('errors.destinationTooLong', { max: LIMITS.DESTINATION_NAME_MAX })
          : tForm('errors.destinationRejected');
      case 'startDate':
        return tForm('errors.startInvalid');
      case 'defaultMode':
        return t('modeRejected');
    }
  };
  const destinationError = message('destination');
  const modeError = message('defaultMode');

  return (
    <form className={styles.form} noValidate onSubmit={(event) => void onSubmit(event)}>
      <TextField
        label={tForm('title')}
        error={message('title')}
        autoComplete="off"
        {...register('title')}
      />
      <TextArea
        label={t('description')}
        hint={t('descriptionHint', { max: LIMITS.TRIP_DESCRIPTION_MAX })}
        error={message('description')}
        {...register('description')}
      />
      <div className={styles.group}>
        {renderDestination(picker)}
        {destinationError === undefined ? null : (
          <p className={styles.fieldError} role="alert">
            {destinationError}
          </p>
        )}
      </div>
      <TextField
        type="date"
        label={t('startDate')}
        hint={t('startDateHint')}
        error={message('startDate')}
        {...register('startDate')}
      />
      <SegmentedControl<TravelMode>
        legend={t('defaultMode')}
        showLegend
        options={MODES.map((mode) => ({ value: mode, label: tModes(mode) }))}
        value={defaultMode}
        onChange={(mode) => setValue('defaultMode', mode, { shouldDirty: true })}
      />
      {modeError === undefined ? null : (
        <p className={styles.fieldError} role="alert">
          {modeError}
        </p>
      )}
      {failure === null ? null : (
        <FormAlert error={failure.error} message={t('failed')} offlineMessage={t('offline')} />
      )}
      <div className={styles.actions}>
        <Button type="submit" variant="primary" busy={isSubmitting} disabled={!online}>
          {isSubmitting ? t('saving') : t('save')}
        </Button>
        {saved && !isDirty ? <StatusLine status="saved" /> : null}
      </div>
    </form>
  );
}
