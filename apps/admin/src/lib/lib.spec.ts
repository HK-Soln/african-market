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
