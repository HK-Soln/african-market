'use client';

import { useCallback, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { LinkButton } from '@am/ui';
import { browserApi } from '@/lib/browser-api';
import { useMaps, type LatLng, type MapBounds, type MapMarker } from '@/lib/maps';
import { mapFilters, type SearchState } from '@/lib/search/params';
import type { NearbyBranch } from '@/lib/search/server';
import { ResultCard } from './result-card';

/** A zoom that shows about the travel radius around the point on a phone. */
export function zoomForRadius(km: number): number {
  return Math.max(9, Math.min(15, Math.round(14 - Math.log2(km / 1.5))));
}

interface Selected {
  id: string;
  slug: string;
  name: string;
}

/**
 * The results on a map: markers for what is in view (GET /search/map), clusters that zoom in
 * when tapped, and the tapped shop's card under the map. The list's own rows are reused for the
 * card when that shop was already loaded.
 */
export function SearchMap({
  state,
  point,
  you,
  listed,
}: {
  state: SearchState;
  point: LatLng;
  /** The visitor's own position, when it came from the device. */
  you?: LatLng;
  listed: NearbyBranch[];
}) {
  const t = useTranslations('search');
  const locale = useLocale();
  const { MapView } = useMaps();
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  /** Each pin's shop page. */
  const slugs = useRef(new Map<string, string>());
  const [truncated, setTruncated] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [view, setView] = useState({ center: point, zoom: zoomForRadius(state.radiusKm) });
  const request = useRef(0);

  const load = useCallback(
    async ({ bounds, zoom }: { bounds: MapBounds; zoom: number }) => {
      const id = ++request.current;
      try {
        const { data } = await browserApi.GET('/api/v1/search/map', {
          params: { query: { ...bounds, zoom: Math.round(zoom), ...mapFilters(state) } },
        });
        if (id !== request.current) return; // A later pan already asked again.
        if (!data) throw new Error('map search failed');
        setFailed(false);
        setTruncated(data.truncated);
        for (const m of data.markers) {
          if (m.branchId && m.shopSlug) slugs.current.set(m.branchId, m.shopSlug);
        }
        setMarkers(
          data.markers.map((m, i): MapMarker =>
            m.kind === 'pin' && m.branchId
              ? {
                  kind: 'pin' as const,
                  id: m.branchId,
                  position: m.location,
                  label: m.shopName ?? '',
                  openNow: m.openNow,
                }
              : {
                  kind: 'cluster' as const,
                  id: `c${i}-${m.location.lat}-${m.location.lng}`,
                  position: m.location,
                  count: m.count ?? 0,
                },
          ),
        );
      } catch {
        if (id === request.current) setFailed(true);
      }
    },
    [state],
  );

  if (!MapView) return null;
  const card = selected && listed.find((item) => item.branchId === selected.id);

  return (
    <div className="flex flex-col gap-3">
      <MapView
        center={view.center}
        zoom={view.zoom}
        markers={markers}
        selectedId={selected?.id}
        you={you}
        label={t('mapLabel')}
        clusterLabel={(count) => t('cluster', { count })}
        className="h-[60dvh] min-h-80 overflow-hidden rounded-lg border border-line"
        onViewChange={load}
        onMarkerClick={(marker) => {
          if (marker.kind === 'cluster') {
            setView({ center: marker.position, zoom: Math.min(view.zoom + 2, 18) });
            return;
          }
          const slug = slugs.current.get(marker.id) ?? '';
          setSelected({ id: marker.id, slug, name: marker.label });
        }}
      />
      {(truncated || failed) && (
        <p role="status" className="text-sm text-ink-muted">
          {failed ? t('mapFailed') : t('truncated')}
        </p>
      )}
      {card ? (
        <ResultCard item={card} />
      ) : (
        selected && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-raised p-3">
            <p className="font-semibold">{selected.name}</p>
            <LinkButton href={`/${locale}/s/${selected.slug}`} variant="secondary">
              {t('openShop')}
            </LinkButton>
          </div>
        )
      )}
    </div>
  );
}
