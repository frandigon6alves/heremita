'use client';

import { useTranslations } from 'next-intl';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { BottomSheet, PANEL_QUERY, type Snap } from '@/shared/components/bottom-sheet/bottom-sheet';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import type { InitialView } from '@/shared/map/map-view';
import { TripMap } from '@/shared/map/trip-map';
import { useMapPadding } from '@/shared/map/use-map-padding';
import styles from './trip-screen-shell.module.css';

const SNAP_ORDER: readonly Snap[] = ['peek', 'half', 'full'];

function MapPadding({ bottom }: { bottom: number }) {
  useMapPadding({ bottom });
  return null;
}

/** The trip's title in the app bar. */
export function TripScreenTitle({ children }: { children: ReactNode }) {
  return <h1 className={styles.title}>{children}</h1>;
}

interface TripScreenShellProps {
  /** Prefix of the panel heading and map ids (`<id>-panel-heading`, `<id>-map`). */
  id: string;
  appBar: ReactNode;
  /** Floats over the map on phones, above it beside the panel on wider screens (planner search). */
  search?: ReactNode;
  /** Names the panel region for screen readers (visually hidden). */
  panelHeading: string;
  snap: Snap;
  onSnapChange: (snap: Snap) => void;
  /** Panel header, the sheet's drag area: day chips and summary. */
  header: ReactNode;
  mapView: InitialView;
  mapLabel: string;
  geolocate?: boolean;
  /** Layers and controls drawn inside the map. */
  mapLayers: ReactNode;
  /** Buttons floating over the map's right edge ("Add here"). */
  floating?: ReactNode;
  /** The panel body: list or card. */
  children: ReactNode;
}

/**
 * Layout shared by the planner and the read-only trip pages: app bar, a
 * bottom sheet over a full-height map on phones, a side panel beside the map
 * from `PANEL_QUERY` (CSS, same markup), a skip link to the map, and the map
 * padded by the settled sheet height so pins never hide under it.
 */
export function TripScreenShell({
  id,
  appBar,
  search,
  panelHeading,
  snap,
  onSnapChange,
  header,
  mapView,
  mapLabel,
  geolocate = false,
  mapLayers,
  floating,
  children,
}: TripScreenShellProps) {
  const t = useTranslations('itinerary');
  const wide = useMediaQuery(PANEL_QUERY);
  const [sheetHeight, setSheetHeight] = useState(0);
  const headingId = `${id}-panel-heading`;
  const mapId = `${id}-map`;

  const handleLabel = (current: Snap, next: Snap) =>
    t('sheet.handle', {
      state: t(`sheet.snap.${current}`),
      action:
        SNAP_ORDER.indexOf(next) > SNAP_ORDER.indexOf(current)
          ? t('sheet.expand')
          : t('sheet.collapse'),
    });

  return (
    <div
      className={search ? `${styles.screen} ${styles.withSearch}` : styles.screen}
      style={{ '--sheet-height': `${sheetHeight}px` } as CSSProperties}
    >
      {appBar}
      {search ? <div className={styles.search}>{search}</div> : null}
      <div className={styles.panelArea}>
        <a className={styles.skipLink} href={`#${mapId}`}>
          {t('screen.skipToMap')}
        </a>
        <BottomSheet
          snap={snap}
          onSnapChange={onSnapChange}
          onSnapSettled={setSheetHeight}
          labelledBy={headingId}
          handleLabel={handleLabel}
          header={
            <>
              <h2 id={headingId} className={styles.visuallyHidden}>
                {panelHeading}
              </h2>
              {header}
            </>
          }
        >
          <div className={styles.body}>{children}</div>
        </BottomSheet>
      </div>
      <div id={mapId} tabIndex={-1} className={styles.mapRegion}>
        <TripMap initialView={mapView} label={mapLabel} geolocate={geolocate}>
          {mapLayers}
          <MapPadding bottom={wide ? 0 : sheetHeight} />
        </TripMap>
      </div>
      {floating ? <div className={styles.floating}>{floating}</div> : null}
    </div>
  );
}
