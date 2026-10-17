import {
  decodeLocation,
  emirateFromRegion,
  emirateLocation,
  encodeLocation,
  ipLocation,
  type ChosenLocation,
} from './location';

const headers = (values: Record<string, string>) => new Headers(values);

describe('the location cookie', () => {
  it('keeps a choice, rounded to about 100 m', () => {
    const chosen: ChosenLocation = {
      lat: 25.271139,
      lng: 55.307485,
      source: 'place',
      label: 'Deira City Centre',
    };
    expect(decodeLocation(encodeLocation(chosen))).toEqual({
      lat: 25.271,
      lng: 55.307,
      source: 'place',
      label: 'Deira City Centre',
    });
  });

  it('keeps an emirate choice and Arabic names', () => {
    const chosen = { ...emirateLocation('SHJ'), label: 'النهدة' };
    expect(decodeLocation(encodeLocation(chosen))).toMatchObject({
      source: 'emirate',
      emirate: 'SHJ',
      label: 'النهدة',
    });
  });

  it.each([
    ['nothing', undefined],
    ['garbage', '%E0%A4%A'],
    ['not JSON', 'abc'],
    ['a latitude off the globe', encodeURIComponent('{"lat":95,"lng":55,"source":"gps"}')],
    ['an unknown source', encodeURIComponent('{"lat":25,"lng":55,"source":"magic"}')],
    // An IP guess is never saved, so a cookie that claims one was not written by us.
    ['a saved IP guess', encodeURIComponent('{"lat":25,"lng":55,"source":"ip"}')],
  ])('reads %s as no choice', (_label, raw) => {
    expect(decodeLocation(raw)).toBeNull();
  });

  it('drops fields it does not know and an unknown emirate, and shortens long labels', () => {
    const raw = encodeURIComponent(
      JSON.stringify({
        lat: 25.2,
        lng: 55.3,
        source: 'gps',
        emirate: 'XXX',
        label: 'x'.repeat(500),
        extra: 1,
      }),
    );
    const decoded = decodeLocation(raw);
    expect(decoded).not.toHaveProperty('emirate');
    expect(decoded).not.toHaveProperty('extra');
    expect(decoded?.label).toHaveLength(120);
  });
});

describe('the guess from the connection', () => {
  it('uses the city CloudFront found, for visitors in the UAE', () => {
    expect(
      ipLocation(
        headers({
          'cloudfront-viewer-country': 'AE',
          'cloudfront-viewer-country-region': 'SH',
          'cloudfront-viewer-latitude': '25.3573',
          'cloudfront-viewer-longitude': '55.4033',
        }),
      ),
    ).toEqual({ lat: 25.357, lng: 55.403, source: 'ip', emirate: 'SHJ' });
  });

  it('falls back to the emirate centre without coordinates', () => {
    expect(
      ipLocation(
        headers({ 'cloudfront-viewer-country': 'AE', 'cloudfront-viewer-country-region': 'AZ' }),
      ),
    ).toMatchObject({ source: 'ip', emirate: 'AUH', lat: 24.4539 });
  });

  it('makes no guess outside the UAE or without headers', () => {
    expect(ipLocation(headers({}))).toBeNull();
    expect(
      ipLocation(
        headers({
          'cloudfront-viewer-country': 'NG',
          'cloudfront-viewer-latitude': '6.45',
          'cloudfront-viewer-longitude': '3.39',
        }),
      ),
    ).toBeNull();
    expect(ipLocation(headers({ 'cloudfront-viewer-country': 'AE' }))).toBeNull();
  });

  it('maps every UAE subdivision code', () => {
    expect(['DU', 'AE-AZ', 'sh', 'AJ', 'UQ', 'RK', 'FU'].map(emirateFromRegion)).toEqual([
      'DXB',
      'AUH',
      'SHJ',
      'AJM',
      'UAQ',
      'RAK',
      'FUJ',
    ]);
    expect(emirateFromRegion('ZZ')).toBeUndefined();
  });
});
