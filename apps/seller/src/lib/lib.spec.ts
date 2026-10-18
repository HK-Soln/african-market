import { circleOutline, fromMultiPolygon, isUsableOutline, toMultiPolygon } from './area';
import { copyToAll, dayProblem, weekFromApi, weekProblem, weekToApi } from './hours';
import { contactColumns, share } from './insights';
import { aedText, filsFromAed } from './money';
import { checkPhone, checkWhatsapp, splitPhone } from './phone';
import {
  cellOf,
  draftFromProduct,
  listingGrid,
  listingsBody,
  newVariant,
  productBody,
  productCategories,
  statusActions,
  type ProductCategory,
  type SellerProduct,
} from './product-form';
import { nextStep, setupProgress } from './setup';

describe('opening hours editor', () => {
  it('reads and writes the stored hours, sorted per day', () => {
    const stored = [
      { weekday: 1, opensAt: '16:00', closesAt: '22:00' },
      { weekday: 1, opensAt: '09:00', closesAt: '13:00' },
      { weekday: 5, opensAt: '20:00', closesAt: '02:00' },
    ];
    const week = weekFromApi(stored);
    expect(week[1]).toEqual([
      { opensAt: '09:00', closesAt: '13:00' },
      { opensAt: '16:00', closesAt: '22:00' },
    ]);
    expect(week[0]).toEqual([]);
    expect(weekToApi(week)).toHaveLength(3);
  });

  it('copies one day to every day, as separate copies', () => {
    const week = copyToAll(weekFromApi([{ weekday: 1, opensAt: '09:00', closesAt: '21:00' }]), 1);
    expect(week.every((d) => d.length === 1 && d[0].opensAt === '09:00')).toBe(true);
    week[0][0].opensAt = '10:00';
    expect(week[1][0].opensAt).toBe('09:00');
  });

  it('accepts split shifts and nights past midnight, refuses overlaps and empty periods', () => {
    expect(
      dayProblem([
        { opensAt: '09:00', closesAt: '13:00' },
        { opensAt: '16:00', closesAt: '02:00' },
      ]),
    ).toBeNull();
    expect(
      dayProblem([
        { opensAt: '09:00', closesAt: '14:00' },
        { opensAt: '13:00', closesAt: '18:00' },
      ]),
    ).toBe('overlap');
    expect(dayProblem([{ opensAt: '09:00', closesAt: '09:00' }])).toBe('same-time');
    const week = weekFromApi([
      { weekday: 3, opensAt: '09:00', closesAt: '09:00' },
      { weekday: 0, opensAt: '09:00', closesAt: '09:00' },
    ]);
    // Monday first: Wednesday is found before Sunday.
    expect(weekProblem(week)).toEqual({ weekday: 3, problem: 'same-time' });
  });
});

describe('phone numbers', () => {
  it('writes valid numbers as E.164 and says why others fail', () => {
    expect(checkPhone('050 123 4567', 'AE')).toEqual({ ok: true, e164: '+971501234567' });
    expect(checkPhone('04 123 4567', 'AE')).toEqual({ ok: true, e164: '+97141234567' });
    expect(checkPhone('123', 'AE')).toEqual({ ok: false, reason: 'invalid' });
    expect(checkPhone('  ', 'AE')).toEqual({ ok: false, reason: 'empty' });
  });

  it('only takes mobile numbers for WhatsApp', () => {
    expect(checkWhatsapp('050 123 4567', 'AE')).toEqual({ ok: true, e164: '+971501234567' });
    expect(checkWhatsapp('04 123 4567', 'AE')).toEqual({ ok: false, reason: 'not-mobile' });
    expect(checkWhatsapp('0803 123 4567', 'NG')).toEqual({ ok: true, e164: '+2348031234567' });
  });

  it('splits a stored number back for editing', () => {
    expect(splitPhone('+971501234567')).toEqual({ national: '50 123 4567', country: 'AE' });
    expect(checkPhone('50 123 4567', 'AE')).toEqual({ ok: true, e164: '+971501234567' });
    expect(splitPhone(null)).toBeNull();
  });
});

describe('dirham amounts', () => {
  it('reads what sellers type and refuses anything else', () => {
    expect(filsFromAed('')).toBe(0);
    expect(filsFromAed('10')).toBe(1000);
    expect(filsFromAed('12.5')).toBe(1250);
    expect(filsFromAed('12,50')).toBe(1250);
    expect(filsFromAed('1.005')).toBeNull();
    expect(filsFromAed('-3')).toBeNull();
    expect(filsFromAed('ten')).toBeNull();
    expect(aedText(1000)).toBe('10');
    expect(aedText(1250)).toBe('12.50');
    expect(aedText(0)).toBe('');
  });
});

describe('where onboarding resumes', () => {
  const base = {
    name: 'Mama Nkechi',
    branches: [],
    contactWhatsapp: null,
    contactPhone: null,
    contactEmail: null,
    logoMediaId: null,
    verificationStatus: 'draft',
  };
  const branch = {
    isPrimary: true,
    openingHours: [{ weekday: 1, opensAt: '09:00', closesAt: '21:00' }],
  };
  type Shop = Parameters<typeof nextStep>[0];

  it('goes to the first needed step, past the optional photos', () => {
    expect(nextStep(base as unknown as Shop)).toBe('branch');
    const ready = { ...base, branches: [branch], contactWhatsapp: '+971501234567' };
    expect(nextStep(ready as unknown as Shop)).toBe('verify');
    expect(setupProgress(ready as unknown as Shop).photos).toBe(false);
    expect(nextStep({ ...ready, verificationStatus: 'pending' } as unknown as Shop)).toBeNull();
  });
});

describe('delivery areas', () => {
  const pin = { lat: 25.2897, lng: 55.3712 };

  it('starts from a ring of corners about the radius away', () => {
    const outline = circleOutline(pin, 5000);
    expect(outline).toHaveLength(12);
    // North corner: 5 km is about 0.045 degrees of latitude.
    expect(outline[0].lat - pin.lat).toBeCloseTo(0.045, 3);
    expect(outline[0].lng).toBeCloseTo(pin.lng, 6);
    expect(isUsableOutline(outline)).toBe(true);
  });

  it('writes GeoJSON with longitude first and the ring closed, and reads it back', () => {
    const path = [
      { lat: 25.3, lng: 55.3 },
      { lat: 25.3, lng: 55.4 },
      { lat: 25.2, lng: 55.4 },
    ];
    const area = toMultiPolygon(path);
    expect(area.coordinates[0][0]).toEqual([
      [55.3, 25.3],
      [55.4, 25.3],
      [55.4, 25.2],
      [55.3, 25.3],
    ]);
    expect(fromMultiPolygon(area)).toEqual(path);
    expect(fromMultiPolygon(null)).toBeNull();
    expect(isUsableOutline([path[0], path[0], path[1]])).toBe(false);
  });
});

describe('product form', () => {
  const goods = { kind: 'product' as const, requiresDeclaration: false };
  const food = { kind: 'product' as const, requiresDeclaration: true };
  const filledIn = () => {
    const draft = draftFromProduct();
    draft.categoryId = 'cat';
    draft.title.en = ' Egusi ';
    draft.variants[0].price = '25';
    return draft;
  };

  it('needs a category, a title in English or Arabic, and a price for goods', () => {
    expect(productBody(draftFromProduct(), goods)).toMatchObject({ problem: 'category' });
    const draft = filledIn();
    draft.title.en = '';
    expect(productBody(draft, goods)).toMatchObject({ problem: 'title' });
    draft.title.ar = 'إيغوسي';
    draft.variants[0].price = '';
    expect(productBody(draft, goods)).toMatchObject({ problem: 'price', variant: 0 });
    // A service may be priced on request.
    expect(productBody(draft, { kind: 'service', requiresDeclaration: false })).toMatchObject({
      ok: true,
      body: { title: { ar: 'إيغوسي' }, variants: [{ priceFils: null, options: {} }] },
    });
  });

  it('names each variant by the option, once, with the old price above the price', () => {
    const draft = filledIn();
    draft.variants.push({ ...newVariant(), price: '40', value: '2 kg' });
    expect(productBody(draft, goods)).toMatchObject({ problem: 'optionName' });
    draft.optionName = 'Size';
    expect(productBody(draft, goods)).toMatchObject({ problem: 'optionValue', variant: 0 });
    draft.variants[0].value = '2 KG';
    expect(productBody(draft, goods)).toMatchObject({ problem: 'optionTwice', variant: 1 });
    draft.variants[0].value = '1 kg';
    draft.variants[1].compareAt = '40';
    expect(productBody(draft, goods)).toMatchObject({ problem: 'compareAt', variant: 1 });
    draft.variants[1].compareAt = '45.5';
    expect(productBody(draft, goods)).toMatchObject({
      ok: true,
      body: {
        title: { en: 'Egusi' },
        variants: [
          { options: { Size: '1 kg' }, priceFils: 2500, compareAtFils: null },
          { options: { Size: '2 kg' }, priceFils: 4000, compareAtFils: 4550 },
        ],
      },
    });
  });

  it('asks food for both confirmations and how it is kept', () => {
    const draft = filledIn();
    draft.food.packagedAndLabelled = true;
    draft.food.storage = 'frozen';
    expect(productBody(draft, food)).toMatchObject({ problem: 'declaration' });
    draft.food.noRestrictedItems = true;
    expect(productBody(draft, food)).toMatchObject({
      ok: true,
      body: { foodDeclaration: { storage: 'frozen', manufacturer: null } },
    });
    expect(productBody(draft, goods)).toMatchObject({ ok: true, body: { foodDeclaration: null } });
  });

  it('reads a saved product back, keeping options it does not edit', () => {
    const saved = {
      categoryId: 'cat',
      title: { en: 'Wig' },
      description: {},
      originCountry: 'NG',
      imageMediaIds: ['img'],
      foodDeclaration: null,
      variants: [
        {
          id: 'b',
          sku: null,
          options: { Length: '26', Colour: 'Black' },
          priceFils: 65000,
          compareAtFils: null,
          sort: 1,
        },
        {
          id: 'a',
          sku: 'W-22',
          options: { Length: '22', Colour: 'Black' },
          priceFils: 45000,
          compareAtFils: 50000,
          sort: 0,
        },
      ],
      listings: [
        { branchId: 'dxb', variantId: 'a', inStock: true, quantity: 3, priceOverrideFils: 44000 },
      ],
    } as unknown as SellerProduct;
    const draft = draftFromProduct(saved);
    expect(draft.optionName).toBe('Length');
    expect(draft.variants.map((v) => [v.id, v.value, v.price, v.compareAt])).toEqual([
      ['a', '22', '450', '500'],
      ['b', '26', '650', ''],
    ]);
    const body = productBody(draft, goods);
    expect(body.ok && body.body.variants[0]).toMatchObject({
      id: 'a',
      options: { Length: '22', Colour: 'Black' },
    });

    const grid = listingGrid(saved, ['dxb', 'shj'], draft.variants);
    expect(grid.dxb.a).toEqual({ listed: true, inStock: true, quantity: '3', price: '440' });
    expect(grid.dxb.b.listed).toBe(false);
    expect(grid.shj.a.listed).toBe(false);
    // A new variant goes where the product is already sold.
    expect(cellOf(grid, 'dxb', 'new').listed).toBe(true);
    expect(cellOf(grid, 'shj', 'new').listed).toBe(false);
  });

  it('lists a new product everywhere, and writes the listings once variants have ids', () => {
    const draft = draftFromProduct();
    const key = draft.variants[0].key;
    const grid = listingGrid(undefined, ['dxb', 'shj'], draft.variants);
    expect(grid.dxb[key].listed && grid.shj[key].listed).toBe(true);
    grid.shj[key] = { listed: true, inStock: true, quantity: '0', price: '' };
    expect(listingsBody(grid, ['dxb', 'shj'], [{ key, id: 'v1' }])).toEqual({
      ok: true,
      listings: [
        {
          branchId: 'dxb',
          variantId: 'v1',
          inStock: true,
          quantity: null,
          priceOverrideFils: null,
        },
        { branchId: 'shj', variantId: 'v1', inStock: false, quantity: 0, priceOverrideFils: null },
      ],
    });
    grid.dxb[key].quantity = '2.5';
    expect(listingsBody(grid, ['dxb'], [{ key, id: 'v1' }])).toMatchObject({ problem: 'quantity' });
  });

  it('offers the actions each status allows', () => {
    expect(statusActions('draft')).toEqual(['publish']);
    expect(statusActions('pending_review')).toEqual(['hide']);
    expect(statusActions('hidden')).toEqual(['publish', 'draft']);
  });

  it('offers the categories under the shop’s own, and the current one', () => {
    const cat = (id: string, parentId: string | null = null) =>
      ({ id, parentId, name: { en: id } }) as unknown as ProductCategory;
    const all = [
      cat('food'),
      cat('grains', 'food'),
      cat('spices', 'food'),
      cat('hair'),
      cat('beauty'),
    ];
    expect(productCategories(all, ['food', 'hair']).map((o) => o.category.id)).toEqual([
      'grains',
      'spices',
      'hair',
    ]);
    expect(
      productCategories(all, ['hair'], 'spices').map((o) => [o.category.id, o.parent?.id]),
    ).toEqual([
      ['hair', undefined],
      ['spices', 'food'],
    ]);
  });
});

describe('contact insights', () => {
  const days = (n: number) =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date(Date.UTC(2026, 9, 18 - (n - 1) + i));
      return { date: d.toISOString().slice(0, 10), whatsapp: 1, call: i % 2, email: 0 };
    });

  it('shows a week day by day, named by weekday', () => {
    const cols = contactColumns(days(7), 7, 'en');
    expect(cols).toHaveLength(7);
    expect(cols.at(-1)).toMatchObject({ axisLabel: 'Sun', values: { whatsapp: 1 } });
    expect(cols.at(-1)!.label).toContain('18');
  });

  it('labels a month every seventh day back from today', () => {
    const cols = contactColumns(days(30), 30, 'en');
    const labelled = cols.flatMap((c, i) => (c.axisLabel ? [i] : []));
    expect(labelled).toEqual([1, 8, 15, 22, 29]);
  });

  it('adds 90 days up by week, the oldest week the short one', () => {
    const cols = contactColumns(days(90), 90, 'en');
    expect(cols).toHaveLength(13);
    expect(cols[0].values.whatsapp).toBe(6);
    expect(cols.at(-1)!.values.whatsapp).toBe(7);
    expect(cols.reduce((n, c) => n + c.values.whatsapp, 0)).toBe(90);
    expect(cols.at(-1)!.label).toMatch(/12 Oct.*18 Oct|Oct 12.*Oct 18/);
  });

  it('gives shares as whole percents, none of nothing', () => {
    expect(share(1, 3)).toBe(33);
    expect(share(0, 0)).toBe(0);
  });
});
