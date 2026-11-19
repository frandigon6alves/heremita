'use client';

import type { CreateTripBody } from '@heremita/shared';
import { apiRoutes } from '@heremita/shared/api-routes';
import { LIMITS } from '@heremita/shared/plain';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useForm, useWatch, type FieldErrors, type Resolver } from 'react-hook-form';
import { apiFetch } from '@/lib/api/client';
import { bodyPathsOf, hasCode } from '@/lib/api/failure';
import { queryKeys } from '@/lib/api/query-keys';
import { routes } from '@/lib/routes';
import { Button } from '@/shared/components/button/button';
import { FormAlert } from '@/shared/components/form-alert/form-alert';
import { SegmentedControl } from '@/shared/components/segmented-control/segmented-control';
import { TextField } from '@/shared/components/text-field/text-field';
import { useOnline } from '@/shared/hooks/use-online';
import {
  destinationAfterTyping,
  destinationFromPlace,
  type DestinationPicker,
} from './destination';
import {
  chosenDayCount,
  newTripFieldOf,
  parseNewTrip,
  type DatesChoice,
  type NewTripField,
  type NewTripValues,
} from './new-trip-model';
import styles from './trip-form.module.css';

/** A field the API refused although it passed the shared schema here. */
const SERVER = 'server';

const resolver: Resolver<NewTripValues, unknown, CreateTripBody> = (values) => {
  const parsed = parseNewTrip(values);
  if (parsed.ok) {
    return { values: parsed.body, errors: {} };
  }
  const errors = Object.fromEntries(
    Object.entries(parsed.issues).map(([field, type]) => [field, { type, message: '' }]),
  );
  return { values: {}, errors: errors as FieldErrors<NewTripValues> };
};

export interface TripFormProps {
  /**
   * Renders the destination search (composed by the page from the
   * place-search feature) wired to the form through `picker`.
   */
  renderDestination: (picker: DestinationPicker & { label: string }) => ReactNode;
}

/**
 * Create a trip (E19): title, optional destination, and either dates (first
 * and last day) or a number of days. Success opens the planner on Ideas.
 */
export function TripForm({ renderDestination }: TripFormProps) {
  const t = useTranslations('trips.form');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const online = useOnline();
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  // Stays true after success: the button keeps its busy state until the planner shows.
  const [leaving, setLeaving] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    getValues,
    control,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm<NewTripValues, unknown, CreateTripBody>({
    resolver,
    mode: 'onTouched',
    defaultValues: {
      title: '',
      destination: null,
      dates: 'none',
      startDate: '',
      endDate: '',
      dayCount: 1,
    },
  });
  const create = useMutation({
    mutationFn: (body: CreateTripBody) => apiFetch(apiRoutes.createTrip, { body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.trips.mine }),
  });

  const [dates, startDate, endDate, dayCount] = useWatch({
    control,
    name: ['dates', 'startDate', 'endDate', 'dayCount'],
  });
  const rangeDays =
    dates === 'range' ? chosenDayCount({ dates, startDate, endDate, dayCount }) : null;

  const onSubmit = handleSubmit(async (body) => {
    setFailure(null);
    try {
      const trip = await create.mutateAsync(body);
      setLeaving(true);
      router.push(routes.planner(locale, trip.id, { day: 'ideas' }));
    } catch (error) {
      const fields = new Set(
        bodyPathsOf(error)
          .map((path) => newTripFieldOf(path, getValues('dates')))
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
  const pending = isSubmitting || leaving;

  const picker: DestinationPicker & { label: string } = {
    label: t('destination'),
    defaultValue: '',
    onPick: (place) =>
      setValue('destination', destinationFromPlace(place), { shouldValidate: isSubmitted }),
    onText: (text) =>
      setValue('destination', destinationAfterTyping(getValues('destination'), text), {
        shouldValidate: isSubmitted,
      }),
  };

  const message = (field: NewTripField): string | undefined => {
    const type = errors[field]?.type;
    if (type === undefined) {
      return undefined;
    }
    switch (field) {
      case 'title':
        if (type === 'too_big') {
          return t('errors.titleTooLong', { max: LIMITS.TRIP_TITLE_MAX });
        }
        return type === SERVER ? t('errors.titleRejected') : t('errors.titleRequired');
      case 'destination':
        return type === 'too_big'
          ? t('errors.destinationTooLong', { max: LIMITS.DESTINATION_NAME_MAX })
          : t('errors.destinationRejected');
      case 'startDate':
        return type === 'required' ? t('errors.startRequired') : t('errors.startInvalid');
      case 'endDate':
        if (type === 'required') {
          return t('errors.endRequired');
        }
        if (type === 'before_start') {
          return t('errors.endBeforeStart');
        }
        return t('errors.rangeTooLong', { max: LIMITS.DAYS_PER_TRIP });
      case 'dayCount':
        return t('errors.dayCountInvalid', { max: LIMITS.DAYS_PER_TRIP });
    }
  };
  const destinationError = message('destination');

  return (
    <form className={styles.form} noValidate onSubmit={(event) => void onSubmit(event)}>
      <TextField
        label={t('title')}
        hint={t('titleHint')}
        error={message('title')}
        autoComplete="off"
        {...register('title')}
      />
      <div className={styles.group}>
        {renderDestination(picker)}
        <p className={styles.summary}>{t('destinationHint')}</p>
        {destinationError === undefined ? null : (
          <p className={styles.fieldError} role="alert">
            {destinationError}
          </p>
        )}
      </div>
      <div className={styles.group}>
        <SegmentedControl<DatesChoice>
          legend={t('dates')}
          showLegend
          options={[
            { value: 'none', label: t('noDates') },
            { value: 'range', label: t('withDates') },
          ]}
          value={dates}
          onChange={(value) => setValue('dates', value)}
        />
        {dates === 'range' ? (
          <div className={styles.dateRow}>
            <TextField
              type="date"
              label={t('startDate')}
              error={message('startDate')}
              {...register('startDate')}
            />
            <TextField
              type="date"
              label={t('endDate')}
              min={startDate === '' ? undefined : startDate}
              hint={
                rangeDays !== null && rangeDays >= 1
                  ? t('rangeDays', { count: rangeDays })
                  : undefined
              }
              error={message('endDate')}
              {...register('endDate')}
            />
          </div>
        ) : (
          <TextField
            type="number"
            inputMode="numeric"
            min={1}
            max={LIMITS.DAYS_PER_TRIP}
            step={1}
            label={t('dayCount')}
            hint={t('dayCountHint', { max: LIMITS.DAYS_PER_TRIP })}
            error={message('dayCount')}
            {...register('dayCount', { valueAsNumber: true })}
          />
        )}
      </div>
      {failure === null ? null : (
        <FormAlert
          error={failure.error}
          message={
            hasCode(failure.error, 'limit_reached')
              ? t('errors.limitReached', { max: LIMITS.TRIPS_PER_USER })
              : t('errors.unexpected')
          }
          offlineMessage={t('errors.offline')}
        />
      )}
      <Button type="submit" variant="primary" size="large" block busy={pending} disabled={!online}>
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
