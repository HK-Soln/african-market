import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { AddressInfo, createServer } from 'node:net';
import { Controller, INestMicroservice, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MessagePattern, Payload, RpcException, Transport } from '@nestjs/microservices';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  CatalogErrors,
  CatalogPatterns,
  DiscoveryPatterns,
  MediaPatterns,
  ShopsPatterns,
} from '@am/contracts';

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });

const shopId = randomUUID();
const logoId = randomUUID();
const photoId = randomUUID();
const productId = randomUUID();
const calls: Array<{ pattern: string; data: Record<string, unknown> }> = [];

const shop = {
  id: shopId,
  name: 'Lagos Kitchen',
  slug: 'lagos-kitchen',
  description: { en: 'Nigerian groceries' },
  logoMediaId: logoId,
  galleryMediaIds: [],
  categoryIds: [],
  originCountries: ['NG'],
  contactWhatsapp: '+971501234567',
  contactPhone: null,
  contactEmail: null,
  verificationStatus: 'verified',
  verificationReason: null,
  submittedAt: '2026-10-01T00:00:00.000Z',
  kycStatus: 'passed',
  tradeLicense: {
    legalName: 'Lagos Kitchen LLC',
    number: '123',
    issuingAuthority: 'DET',
    expiry: null,
  },
  // The shops service names the seller only from an approved licence.
  licensedSeller: { legalName: 'Lagos Kitchen LLC', licenseNumber: '123', issuingAuthority: 'DET' },
  checkoutEnabled: false,
  codEnabled: false,
  staffCanUploadProductImages: false,
  ownerId: randomUUID(),
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  branches: [{ id: randomUUID(), shopId, name: 'Deira', emirate: 'DXB' }],
};

const product = {
  id: productId,
  shopId,
  categoryId: randomUUID(),
  type: 'product',
  title: { en: 'Egusi' },
  description: {},
  originCountry: 'NG',
  imageMediaIds: [photoId],
  status: 'active',
  reviewReason: null,
  foodDeclaration: null,
  variants: [],
  listings: [],
  submittedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

/** Shops, catalog, discovery and media, all on one port. */
@Controller()
class FakeServices {
  @MessagePattern(DiscoveryPatterns.searchNearby)
  nearby(@Payload() data: Record<string, unknown>) {
    calls.push({ pattern: DiscoveryPatterns.searchNearby, data });
    return { items: [], nextCursor: null };
  }

  @MessagePattern(DiscoveryPatterns.sitemap)
  sitemap(@Payload() data: Record<string, unknown>) {
    calls.push({ pattern: DiscoveryPatterns.sitemap, data });
    return {
      items: [{ shopSlug: 'lagos-kitchen', updatedAt: '2026-10-01T00:00:00.000Z' }],
      nextCursor: null,
    };
  }

  @MessagePattern(DiscoveryPatterns.listEmirates)
  emirates() {
    return { items: [{ code: 'DXB', searchOpen: true }] };
  }

  @MessagePattern(ShopsPatterns.getBySlug)
  bySlug(@Payload() data: { slug?: string; shopId?: string }) {
    if (data.slug !== shop.slug && data.shopId !== shop.id)
      throw new RpcException({ status: 404, code: 'SHOP_NOT_FOUND', message: 'No such shop' });
    return shop;
  }

  @MessagePattern(CatalogPatterns.listShopProducts)
  products(@Payload() data: Record<string, unknown>) {
    calls.push({ pattern: CatalogPatterns.listShopProducts, data });
    return { items: [product], nextCursor: null, prevCursor: null };
  }

  @MessagePattern(CatalogPatterns.getProduct)
  product(@Payload() data: { productId: string }) {
    if (data.productId !== productId)
      throw new RpcException({ status: 404, code: CatalogErrors.productNotFound, message: 'No' });
    return product;
  }

  @MessagePattern(MediaPatterns.publicUrls)
  urls(@Payload() data: { mediaIds: string[] }) {
    return {
      urls: Object.fromEntries(
        data.mediaIds.map((id) => [id, { card: `https://cdn.test/${id}/card.webp` }]),
      ),
    };
  }
}

@Module({ controllers: [FakeServices] })
class FakeServicesModule {}

describe('gateway public routes (HTTP -> gateway -> TCP -> service stand-ins)', () => {
  let app: NestExpressApplication;
  let services: INestMicroservice;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const port = await freePort();
    for (const name of ['SHOPS', 'CATALOG', 'DISCOVERY', 'MEDIA']) {
      process.env[`${name}_TCP_PORT`] = String(port);
      process.env[`${name}_HOST`] = '127.0.0.1';
    }
    process.env.JWT_ACCESS_SECRET = `${randomUUID()}${randomUUID()}`;
    process.env.DEPLOY_ENV = 'test';
    process.env.LOG_LEVEL = 'fatal';
    services = await NestFactory.createMicroservice(FakeServicesModule, {
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port },
      logger: false,
    });
    await services.listen();

    const { AppModule } = (await import('../src/app.module')) as typeof import('../src/app.module');
    const { configureApp } = (await import('../src/setup')) as typeof import('../src/setup');
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app, { corsOrigins: ['http://localhost:3000'] });
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await services?.close();
  });

  it('passes a nearby search on with numbers and booleans, and refuses a bad one', async () => {
    await http()
      .get('/api/v1/search/nearby')
      .query({ lat: '25.29', lng: '55.37', mode: 'pickup', openNow: 'true', limit: '10' })
      .expect(200, { items: [], nextCursor: null });
    expect(calls.at(-1)).toMatchObject({
      pattern: DiscoveryPatterns.searchNearby,
      data: { lat: 25.29, lng: 55.37, mode: 'pickup', openNow: true, limit: 10 },
    });
    await http()
      .get('/api/v1/search/nearby')
      .query({ lat: '25.29', lng: '55.37', mode: 'fly' })
      .expect(400);
    await http()
      .get('/api/v1/search/nearby')
      .query({ lat: 'x', lng: '55.37', mode: 'pickup' })
      .expect(400);
  });

  it('finds a shop by its id for a product’s page', async () => {
    const res = await http().get(`/api/v1/shops/by-id/${shopId}`).expect(200);
    expect(res.body).toMatchObject({ slug: 'lagos-kitchen', seller: { licenseNumber: '123' } });
    await http().get(`/api/v1/shops/by-id/${randomUUID()}`).expect(404);
    await http().get('/api/v1/shops/by-id/nope').expect(400);
  });

  it('pages the sitemap from discovery and refuses an unknown kind', async () => {
    const res = await http().get('/api/v1/sitemap?kind=shops').expect(200);
    expect(res.body.items).toEqual([
      { shopSlug: 'lagos-kitchen', updatedAt: '2026-10-01T00:00:00.000Z' },
    ]);
    expect(calls.find((c) => c.pattern === DiscoveryPatterns.sitemap)?.data).toEqual({
      kind: 'shops',
    });
    await http().get('/api/v1/sitemap?kind=users').expect(400);
    await http().get('/api/v1/sitemap?kind=shops&cursor=nope').expect(400);
  });

  it('shows a shop without its verification or owner, with the approved seller and image links', async () => {
    const res = await http().get('/api/v1/shops/lagos-kitchen').expect(200);
    expect(res.body).toMatchObject({
      id: shopId,
      name: 'Lagos Kitchen',
      logo: { card: `https://cdn.test/${logoId}/card.webp` },
      gallery: [],
      seller: { legalName: 'Lagos Kitchen LLC', licenseNumber: '123', issuingAuthority: 'DET' },
    });
    for (const hidden of [
      'ownerId',
      'tradeLicense',
      'kycStatus',
      'verificationStatus',
      'verificationReason',
      'submittedAt',
      'logoMediaId',
    ])
      expect(res.body).not.toHaveProperty(hidden);
    expect(res.body.branches[0]).not.toHaveProperty('shopId');
    await http().get('/api/v1/shops/nope').expect(404);
  });

  it('lists a shop’s products without anyone’s role, with image links', async () => {
    const res = await http()
      .get('/api/v1/shops/lagos-kitchen/products')
      .query({ limit: '5' })
      .expect(200);
    expect(res.body.items[0]).toMatchObject({
      id: productId,
      images: [{ card: `https://cdn.test/${photoId}/card.webp` }],
    });
    expect(calls.at(-1)).toMatchObject({
      data: { shopId, query: expect.objectContaining({ limit: 5 }) },
    });
    expect(calls.at(-1)!.data).not.toHaveProperty('actor');
  });

  it('shows a product, and passes on not found', async () => {
    const res = await http().get(`/api/v1/products/${productId}`).expect(200);
    expect(res.body.images).toHaveLength(1);
    const missing = await http().get(`/api/v1/products/${randomUUID()}`).expect(404);
    expect(missing.body.code).toBe(CatalogErrors.productNotFound);
  });

  it('lists the emirates', async () => {
    await http()
      .get('/api/v1/emirates')
      .expect(200, { items: [{ code: 'DXB', searchOpen: true }] });
  });
});
