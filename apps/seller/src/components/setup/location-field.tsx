'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { EMIRATES } from '@am/geo';
import { Button } from '@am/ui';
import { useMaps, type LatLng } from '@/lib/maps';

/** The pin's id on the map. */
const PIN = 'shop';

/**
 * Where the branch's door is. With a map: drag the pin, tap the map, or find the building. Without
 * one: the device's location (taken at the shop) or the emirate's centre, adjusted later.
 */
export function LocationField({
  value,
  onChange,
  emirate,
  radiusM,
  error,
}: {
  value: LatLng | null;
  onChange: (location: LatLng) => void;
  /** The emirate chosen: where the map starts before there is a pin. */
  emirate: string;
  /** Drawn as a circle when the branch delivers. */
  radiusM?: number | null;
  error?: string;
}) {
  const t = useTranslations('setup');
  const { MapView, PlaceSearch } = useMaps();
  const [locating, setLocating] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const start = EMIRATES.find((e) => e.code === emirate)?.center ?? EMIRATES[0].center;
  const centre = value ?? start;

  const useDevice = () => {
    if (!('geolocation' in navigator)) {
      setDeviceError(t('locationFailed'));
      return;
    }
    setLocating(true);
    setDeviceError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onChange({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      (failure) => {
        setLocating(false);
        setDeviceError(
          failure.code === failure.PERMISSION_DENIED ? t('locationDenied') : t('locationFailed'),
        );
      },
      // The door, not the neighbourhood: ask for the precise position.
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 font-semibold">{t('pin')}</legend>
      <p className="text-sm text-ink-muted">{MapView ? t('pinHint') : t('pinNoMap')}</p>
      {PlaceSearch && (
        <PlaceSearch
          label={t('findPlace')}
          placeholder={t('findPlacePlaceholder')}
          noResults={t('noPlaces')}
          unavailable={t('placesUnavailable')}
          near={centre}
          onPick={(place) => onChange({ lat: place.lat, lng: place.lng })}
        />
      )}
      {MapView && (
        <MapView
          center={centre}
          zoom={value ? 17 : 11}
          label={t('pin')}
          clusterLabel={(count) => String(count)}
          markers={
            value
              ? [{ kind: 'pin', id: PIN, position: value, label: t('pin'), draggable: true }]
              : []
          }
          circles={value && radiusM ? [{ id: 'delivery', center: value, radiusM }] : []}
          onMarkerDragEnd={(_, position) => onChange(position)}
          onMapClick={onChange}
          className="h-72 overflow-hidden rounded-lg border border-line"
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          iconStart="current-location"
          loading={locating}
          loadingLabel={t('locating')}
          onClick={useDevice}
        >
          {t('useMyLocation')}
        </Button>
        {!MapView && !value && (
          <Button type="button" variant="ghost" onClick={() => onChange(start)}>
            {t('startFromEmirate')}
          </Button>
        )}
      </div>
      {value && (
        <p className="text-sm text-ink-muted">
          {t('pinSet', { lat: value.lat.toFixed(5), lng: value.lng.toFixed(5) })}
        </p>
      )}
      {(deviceError || error) && (
        <p role="alert" className="text-sm text-danger">
          {deviceError ?? error}
        </p>
      )}
    </fieldset>
  );
}
