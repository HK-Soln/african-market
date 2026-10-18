import { jsonLdText, productJsonLd, shopJsonLd } from './json-ld';
import { alternates, parseProductSegment, productPath, productSlug } from './paths';
import type { Product, PublicShop } from './server';

const branch = {
  id: 'b1',
  name: 'Al Nahda',
  emirate: 'DXB',
  area: 'Al Nahda',
  addressLine: 'Shop 4, Building 12',
  makani: null,
  location: { lat: 25.2897, lng: 55.3712 },
  serviceArea: null,
  serviceRadiusM: 8000,
  pickup: true,
  delivery: true,
  deliveryFeeFils: 0,
  minOrderFils: 0,
  contactWhatsapp: null,
  contactPhone: null,
  contactEmail: null,
  isPrimary: true,
  openingHours: [{ weekday: 1, opensAt: '09:00', closesAt: '22:00' }],
  specialHours: [],
};

const shop = {
  id: 's1',
  name: 'Mama Nkechi',
  slug: 'mama-nkechi',
  description: { en: 'Nigerian groceries', ar: 'بقالة نيجيرية' },
  logo: { card: 'https://cdn/logo.webp' },
  gallery: [],
  categoryIds: [],
  originCountries: ['NG'],
  contactWhatsapp: '+971501110001',
  contactPhone: '+971501110001',
  contactEmail: null,
  checkoutEnabled: false,
  codEnabled: false,
  branches: [branch],
  seller: { legalName: 'Mama Nkechi Trading LLC', licenseNumber: 'CN-1', issuingAuthority: null },
} as unknown as PublicShop;

const product = {
  id: 'p1',
  title: { en: 'Égusi seeds 500 g' },
  description: { en: 'Ground melon seeds </script>' },
  images: [{ full: 'https://cdn/egusi.webp' }],
  originCountry: 'NG',
  variants: [{ priceFils: 1800 }, { priceFils: 3200 }, { priceFils: null }],
  listings: [{ branchId: 'b1', inStock: true }],
} as unknown as Product;

describe('structured data', () => {
  it('describes each branch as a local business with its pin, address and hours', () => {
    const ld = shopJsonLd(shop, 'https://am.test/ar/s/mama-nkechi', 'ar');
    expect(ld['@graph']).toEqual([
      expect.objectContaining({
        '@type': 'LocalBusiness',
        name: 'Mama Nkechi',
        description: 'بقالة نيجيرية',
        telephone: '+971501110001',
        address: expect.objectContaining({ addressLocality: 'Al Nahda', addressRegion: 'DXB' }),
        geo: { '@type': 'GeoCoordinates', latitude: 25.2897, longitude: 55.3712 },
        openingHoursSpecification: [
          expect.objectContaining({ dayOfWeek: 'https://schema.org/Monday', opens: '09:00' }),
        ],
      }),
    ]);
  });

  it('gives a product its price range in dirhams and the licensed seller', () => {
    const ld = productJsonLd(product, shop, 'https://am.test/en/p/p1-egusi', 'en');
    expect(ld.offers).toEqual({
      '@type': 'AggregateOffer',
      priceCurrency: 'AED',
      lowPrice: '18.00',
      highPrice: '32.00',
      offerCount: 2,
      availability: 'https://schema.org/InStock',
      seller: { '@type': 'Organization', name: 'Mama Nkechi Trading LLC' },
    });
    expect(jsonLdText(ld)).not.toContain('</script>');
  });
});

describe('product addresses', () => {
  it('read well and still find the product by its id', () => {
    expect(productSlug({ en: 'Égusi seeds 500 g' })).toBe('egusi-seeds-500-g');
    expect(productSlug({ ar: 'بذور' })).toBe('product');
    const id = '3f2b8c1e-9a4d-4c6b-8e2f-1a2b3c4d5e6f';
    expect(productPath(id, { en: 'Garri 2 kg' })).toBe(`/p/${id}-garri-2-kg`);
    expect(parseProductSegment(`${id}-garri-2-kg`)).toEqual({ id, slug: 'garri-2-kg' });
    expect(parseProductSegment(id)).toEqual({ id, slug: '' });
    expect(parseProductSegment('garri')).toBeNull();
    expect(parseProductSegment(`${id}x`)).toBeNull();
  });

  it('link every language and default to English', () => {
    expect(alternates('ar', '/s/mama-nkechi')).toEqual({
      canonical: '/ar/s/mama-nkechi',
      languages: {
        en: '/en/s/mama-nkechi',
        ar: '/ar/s/mama-nkechi',
        fr: '/fr/s/mama-nkechi',
        'x-default': '/en/s/mama-nkechi',
      },
    });
  });
});
