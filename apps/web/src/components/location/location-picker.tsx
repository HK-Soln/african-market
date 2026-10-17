'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { EMIRATES } from '@am/geo';
import { BottomSheet, Button, Chip } from '@am/ui';
import { deviceLocation, type DeviceLocationError } from '@/lib/location/client';
import { emirateLocation, type ChosenLocation } from '@/lib/location/location';
import { useMaps } from '@/lib/maps';
import { useSearchLocation } from './location-provider';

/**
 * Choosing where to search from, in the order the plan gives: the device (only on this tap),
 * an area or building (Places, when the map provider is on), or an emirate.
 */
export function LocationPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('location');
  const e = useTranslations('emirates');
  const { location, choose } = useSearchLocation();
  const { PlaceSearch } = useMaps();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<DeviceLocationError | null>(null);

  const done = (next: ChosenLocation) => {
    choose(next);
    setError(null);
    onClose();
  };

  const useDevice = async () => {
    setLocating(true);
    setError(null);
    try {
      done({ ...(await deviceLocation()), source: 'gps' });
    } catch (reason) {
      setError(reason as DeviceLocationError);
    } finally {
      setLocating(false);
    }
  };

  return (
    <BottomSheet title={t('sheetTitle')} open={open} onClose={onClose} closeLabel={t('close')}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            fullWidth
            iconStart="current-location"
            loading={locating}
            loadingLabel={t('locating')}
            onClick={useDevice}
          >
            {t('useMyLocation')}
          </Button>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {t(error === 'denied' ? 'denied' : 'unavailable')}
            </p>
          )}
        </div>

        {PlaceSearch && (
          <PlaceSearch
            label={t('searchArea')}
            placeholder={t('searchAreaPlaceholder')}
            noResults={t('noPlaces')}
            unavailable={t('placesUnavailable')}
            near={location ?? undefined}
            onPick={(place) => done({ ...place, source: 'place' })}
          />
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold text-ink-muted">{t('orEmirate')}</legend>
          <div className="flex flex-wrap gap-2">
            {EMIRATES.map((emirate) => (
              <Chip
                key={emirate.code}
                selected={location?.source === 'emirate' && location.emirate === emirate.code}
                onClick={() => done(emirateLocation(emirate.code))}
              >
                {e(emirate.code)}
              </Chip>
            ))}
          </div>
        </fieldset>
      </div>
    </BottomSheet>
  );
}
