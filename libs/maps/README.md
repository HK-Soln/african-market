# @am/maps

The map provider behind the Next.js apps (CLAUDE.md: providers behind an adapter): `MapView`
(markers, clusters, a draggable pin, tap to place, circles) and `PlaceSearch` (UAE places).
Google Maps implements it today; a MapLibre one can replace it.

- `@am/maps`: the types, `MapsContextProvider`, `useMaps()` and `noMaps`. Screens must cope with
  `MapView` and `PlaceSearch` being null (no key, or the provider not loaded yet).
- `@am/maps/google`: `createGoogleMaps({ apiKey, mapId })`. Apps import this entry point lazily
  (`import('@am/maps/google')`) and only when they have a key, so pages without a map never
  fetch Google's code. See `apps/web/src/lib/maps` (decisions T-37, T-41).

Marker and place-list styles live in `@am/ui/components.css` (`am-map-*`, `am-place-*`).
