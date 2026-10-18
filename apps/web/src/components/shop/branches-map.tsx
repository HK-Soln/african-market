'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMaps, type MapMarker } from '@/lib/maps';

export interface MapBranch {
  id: string;
  name: string;
  location: { lat: number; lng: number };
}

/** The branches' pins on one map; nothing without a map provider (the addresses are listed). */
export function BranchesMap({ branches }: { branches: MapBranch[] }) {
  const t = useTranslations('shop');
  const s = useTranslations('search');
  const { MapView } = useMaps();
  const [selected, setSelected] = useState<string>();
  const markers = useMemo<MapMarker[]>(
    () => branches.map((b) => ({ kind: 'pin', id: b.id, position: b.location, label: b.name })),
    [branches],
  );
  if (!MapView || branches.length === 0) return null;
  const centre = branches[0].location;
  return (
    <MapView
      center={centre}
      zoom={branches.length > 1 ? 11 : 15}
      markers={markers}
      selectedId={selected}
      label={t('branchesMap')}
      clusterLabel={(count) => s('cluster', { count })}
      onMarkerClick={(marker) => {
        setSelected(marker.id);
        document.getElementById(`branch-${marker.id}`)?.scrollIntoView({ behavior: 'smooth' });
      }}
      className="h-64 overflow-hidden rounded-lg border border-line"
    />
  );
}
