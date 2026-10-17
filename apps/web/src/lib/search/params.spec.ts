import {
  DEFAULT_SEARCH,
  formatDistance,
  hasFilters,
  nearbyQuery,
  parseSearch,
  searchQueryString,
  widerRadius,
} from './params';

const CATEGORY = '3f2b8c1e-9a4d-4c6b-8e2f-1a2b3c4d5e6f';

describe('search address', () => {
  it('reads defaults from an empty address and writes nothing back', () => {
    expect(parseSearch({})).toEqual(DEFAULT_SEARCH);
    expect(searchQueryString(DEFAULT_SEARCH)).toBe('');
  });

  it('round-trips every filter', () => {
    const state = parseSearch(
      new URLSearchParams(
        `q=egusi&category=${CATEGORY}&origin=ng&open=1&delivers=1&radius=25&view=map`,
      ),
    );
    expect(state).toEqual({
      q: 'egusi',
      categoryId: CATEGORY,
      origin: 'NG',
      openNow: true,
      deliversToMe: true,
      mode: 'pickup',
      radiusKm: 25,
      view: 'map',
    });
    expect(parseSearch(new URLSearchParams(searchQueryString(state).slice(1)))).toEqual(state);
  });

  it('ignores what is malformed', () => {
    expect(
      parseSearch({ category: 'nope', origin: 'Nigeria', radius: '7', mode: 'fly', view: 'x' }),
    ).toEqual(DEFAULT_SEARCH);
    expect(parseSearch({ q: ['  tailor  ', 'second'] }).q).toBe('tailor');
  });

  it('drops pickup-only filters in delivery mode', () => {
    const state = {
      ...DEFAULT_SEARCH,
      mode: 'delivery' as const,
      deliversToMe: true,
      radiusKm: 50,
    };
    expect(searchQueryString(state)).toBe('?mode=delivery');
    expect(nearbyQuery(state, { lat: 25.2, lng: 55.3 })).toEqual({
      lat: 25.2,
      lng: 55.3,
      mode: 'delivery',
    });
  });

  it('asks the API for metres and only the filters set', () => {
    expect(
      nearbyQuery(
        { ...DEFAULT_SEARCH, q: 'hair', openNow: true, origin: 'GH' },
        { lat: 1, lng: 2 },
      ),
    ).toEqual({
      lat: 1,
      lng: 2,
      mode: 'pickup',
      q: 'hair',
      originCountry: 'GH',
      openNow: true,
      radiusM: 10_000,
    });
  });

  it('widens one step at a time and knows when filters are set', () => {
    expect(widerRadius(10)).toBe(25);
    expect(widerRadius(50)).toBeUndefined();
    expect(hasFilters(DEFAULT_SEARCH)).toBe(false);
    expect(hasFilters({ ...DEFAULT_SEARCH, openNow: true })).toBe(true);
  });
});

describe('formatDistance', () => {
  it('rounds metres and kilometres for reading', () => {
    expect(formatDistance(12, 'en')).toBe('50 m');
    expect(formatDistance(349, 'en')).toBe('350 m');
    expect(formatDistance(1240, 'en')).toBe('1.2 km');
    expect(formatDistance(12_600, 'en')).toBe('13 km');
  });
});
