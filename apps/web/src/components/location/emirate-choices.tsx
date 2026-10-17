'use client';

import { useTranslations } from 'next-intl';
import { EMIRATES } from '@am/geo';
import { Chip } from '@am/ui';
import { emirateLocation } from '@/lib/location/location';
import { useSearchLocation } from './location-provider';

/** "Browse by emirate": each one sets the search location to that emirate. */
export function EmirateChoices() {
  const e = useTranslations('emirates');
  const { location, choose } = useSearchLocation();
  return (
    <div className="flex flex-wrap gap-2">
      {EMIRATES.map((emirate) => (
        <Chip
          key={emirate.code}
          selected={location?.source === 'emirate' && location.emirate === emirate.code}
          onClick={() => choose(emirateLocation(emirate.code))}
        >
          {e(emirate.code)}
        </Chip>
      ))}
    </div>
  );
}
