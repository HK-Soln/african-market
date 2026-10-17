'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Icon } from '@am/ui';
import type { ChosenLocation } from '@/lib/location/location';
import { LocationPicker } from './location-picker';
import { useSearchLocation } from './location-provider';

/** "Near Deira · Change": where results are measured from, and the way to change it. */
export function LocationBar() {
  const t = useTranslations('location');
  const { location, updating } = useSearchLocation();
  const [open, setOpen] = useState(false);
  const describe = useDescribe();

  return (
    <div className="flex min-h-12 items-center gap-3 rounded-md border border-line bg-surface-raised px-3 py-2">
      <Icon name="map-pin" className="shrink-0 text-clay" />
      <p className="min-w-0 flex-1 truncate text-[15px]" aria-live="polite" aria-busy={updating}>
        {location ? (
          <>
            <span className="text-ink-muted">{t('near')} </span>
            <span className="font-semibold">{describe(location)}</span>
          </>
        ) : (
          <span className="text-ink-muted">{t('noneYet')}</span>
        )}
      </p>
      <Button
        size="sm"
        variant={location ? 'ghost' : 'primary'}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {location ? t('change') : t('set')}
      </Button>
      <LocationPicker open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

/** A location in words: the place's name, "your location", or the emirate. */
export function useDescribe() {
  const t = useTranslations('location');
  const e = useTranslations('emirates');
  return (location: ChosenLocation) => {
    if (location.source === 'gps') return t('yourLocation');
    if (location.label) return location.label;
    if (location.emirate) {
      const name = e(location.emirate);
      return location.source === 'ip' ? t('guessed', { place: name }) : name;
    }
    return t('pinnedPoint');
  };
}
