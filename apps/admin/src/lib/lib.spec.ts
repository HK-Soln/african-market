import { AUDIT_ACTIONS } from '@am/contracts';
import { ACTION_GROUPS, auditQuery, subjectHref } from './audit';
import {
  categoryTree,
  parentOptions,
  priceRange,
  reviewQuery,
  slugify,
  type Category,
  type TreeRow,
} from './catalogue';
import {
  dubaiToday,
  kycConcerns,
  latest,
  licenseExpiry,
  listingActions,
  queueQuery,
  type KycSummary,
  type VerificationRequest,
} from './review';
import { reportsQuery } from './reports';

describe('queueQuery', () => {
  it('lists waiting shops oldest first, so none is left behind', () => {
    expect(queueQuery('pending', '')).toEqual({
      'filter[verificationStatus]': 'pending',
      sort: 'submittedAt',
      limit: 20,
    });
  });

  it('searches every shop by name, and decided ones newest first', () => {
    expect(queueQuery('all', '  Mama  ', 'c1')).toEqual({
      'filter[search][like]': 'Mama',
      sort: 'name',
      limit: 20,
      cursor: 'c1',
    });
    expect(queueQuery('suspended', '')).toMatchObject({
      'filter[verificationStatus]': 'suspended',
      sort: '-submittedAt',
    });
    expect(queueQuery('all', '')).toEqual({ sort: '-submittedAt', limit: 20 });
  });
});

describe('listingActions', () => {
  it('follows the listing rules', () => {
    expect(listingActions('pending')).toEqual(['approve', 'reject']);
    expect(listingActions('verified')).toEqual(['suspend']);
    expect(listingActions('suspended')).toEqual(['reinstate']);
    expect(listingActions('rejected')).toEqual([]);
    expect(listingActions('draft')).toEqual([]);
  });
});

describe('latest', () => {
  const request = (type: 'kyc' | 'trade_license', createdAt: string) =>
    ({ id: createdAt, type, createdAt }) as VerificationRequest;

  it('picks the newest request of a kind', () => {
    const requests = [
      request('kyc', '2026-10-01T00:00:00Z'),
      request('kyc', '2026-10-05T00:00:00Z'),
      request('trade_license', '2026-10-09T00:00:00Z'),
    ];
    expect(latest(requests, 'kyc')?.id).toBe('2026-10-05T00:00:00Z');
    expect(latest(requests.slice(0, 2), 'trade_license')).toBeNull();
  });
});

describe('kycConcerns', () => {
  const clean: KycSummary = {
    providerStatus: 'Approved',
    documentType: 'Passport',
    issuingState: 'NGA',
    nationality: 'NGA',
    documentExpiry: '2030-01-01',
    fullName: 'Ada Obi',
    idStatus: 'Approved',
    livenessStatus: 'Approved',
    livenessScore: 98,
    faceMatchStatus: 'Approved',
    faceMatchScore: 91,
    warnings: [],
  };

  it('has nothing to flag on a clean check', () => {
    expect(kycConcerns(clean, '2026-10-20')).toEqual([]);
  });

  it('flags a decision other than approved, an expired document and failed checks', () => {
    expect(
      kycConcerns(
        {
          ...clean,
          providerStatus: 'In Review',
          documentExpiry: '2026-10-19',
          livenessStatus: 'Declined',
          faceMatchStatus: null,
        },
        '2026-10-20',
      ),
    ).toEqual(['notApproved', 'documentExpired', 'liveness']);
  });
});

describe('licenseExpiry', () => {
  it('says whether a licence has run out or soon will', () => {
    expect(licenseExpiry(null, '2026-10-20')).toBeNull();
    expect(licenseExpiry('2026-10-19', '2026-10-20')).toBe('expired');
    expect(licenseExpiry('2026-11-19', '2026-10-20')).toBe('soon');
    expect(licenseExpiry('2026-11-20', '2026-10-20')).toBe('valid');
  });
});

describe('dubaiToday', () => {
  it('is the date in Dubai, which is ahead of UTC', () => {
    expect(dubaiToday(new Date('2026-10-20T21:30:00Z'))).toBe('2026-10-21');
  });
});

describe('categoryTree', () => {
  const cat = (
    id: string,
    parentId: string | null,
    sort = 0,
    kind: 'product' | 'service' = 'product',
  ) => ({ id, parentId, sort, kind, name: { en: id, ar: id }, slug: id }) as Category;
  const items = [
    cat('food', null, 1),
    cat('beauty', null, 2),
    cat('spices', 'food', 2),
    cat('grains', 'food', 1),
    cat('pepper', 'spices'),
    cat('stray', 'missing'),
    cat('salons', null, 3, 'service'),
  ];

  it('lists parents before their children, in order, with depths', () => {
    expect(categoryTree(items).map((r) => `${r.category.id}:${r.depth}:${r.childCount}`)).toEqual([
      'stray:1:0',
      'food:1:2',
      'grains:2:0',
      'spices:2:1',
      'pepper:3:0',
      'beauty:1:0',
      'salons:1:0',
    ]);
  });

  it('offers only parents that keep the tree valid', () => {
    const rows = categoryTree(items);
    const ids = (r: TreeRow[]) => r.map((x) => x.category.id);
    // A new product category: anywhere not already at the deepest level, product kind only.
    expect(ids(parentOptions(rows, null, 'product'))).toEqual([
      'stray',
      'food',
      'grains',
      'spices',
      'beauty',
    ]);
    // Moving "spices" (which has a child): not under itself or its child, and only top-level.
    const spices = rows.find((r) => r.category.id === 'spices')!.category;
    expect(ids(parentOptions(rows, spices, 'product'))).toEqual(['stray', 'food', 'beauty']);
  });
});

describe('slugify', () => {
  it('makes a web address part from an English name', () => {
    expect(slugify('Hair & wigs')).toBe('hair-wigs');
    expect(slugify('  Café Crème ')).toBe('cafe-creme');
    expect(slugify('عربي')).toBe('');
  });
});

describe('priceRange and reviewQuery', () => {
  it('finds the price range, ignoring versions priced on request', () => {
    expect(priceRange([{ priceFils: 500 }, { priceFils: null }, { priceFils: 250 }])).toEqual({
      min: 250,
      max: 500,
    });
    expect(priceRange([{ priceFils: null }])).toBeNull();
  });

  it('asks for waiting products oldest first', () => {
    expect(reviewQuery('')).toEqual({ sort: 'submittedAt', limit: 20 });
    expect(reviewQuery('c1', 'x')).toEqual({
      'filter[categoryId]': 'c1',
      sort: 'submittedAt',
      limit: 20,
      cursor: 'x',
    });
  });
});

describe('audit', () => {
  it('groups every action once', () => {
    expect(ACTION_GROUPS.flatMap((g) => g.actions).sort()).toEqual([...AUDIT_ACTIONS].sort());
  });

  it('asks for the newest entries, of an action and a shop if chosen', () => {
    expect(auditQuery('', null)).toEqual({ sort: '-occurredAt', limit: 50 });
    expect(auditQuery('product.rejected', 's1', 'c')).toEqual({
      'filter[action]': 'product.rejected',
      'filter[shopId]': 's1',
      sort: '-occurredAt',
      limit: 50,
      cursor: 'c',
    });
  });

  it('links an entry to where its subject is', () => {
    expect(subjectHref({ subjectType: 'shop', subjectId: 's1', shopId: 's1' })).toBe('/shops/s1');
    expect(subjectHref({ subjectType: 'product', subjectId: 'p1', shopId: 's1' })).toBe(
      '/shops/s1',
    );
    expect(subjectHref({ subjectType: 'emirate', subjectId: 'DXB', shopId: null })).toBe(
      '/emirates',
    );
    expect(subjectHref({ subjectType: 'user', subjectId: 'u1', shopId: null })).toBeNull();
  });
});

describe('reportsQuery', () => {
  it('lists open reports oldest first, so the longest waiting is on top', () => {
    expect(reportsQuery('open')).toEqual({
      'filter[status]': 'open',
      sort: 'createdAt',
      limit: 20,
    });
  });

  it('lists closed reports newest first, and carries the cursor', () => {
    expect(reportsQuery('dismissed', 'abc')).toEqual({
      'filter[status]': 'dismissed',
      sort: '-createdAt',
      limit: 20,
      cursor: 'abc',
    });
  });
});
