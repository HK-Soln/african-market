import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { AddressInfo, createServer } from 'node:net';
import { Controller, INestMicroservice, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { MessagePattern, Payload, Transport } from '@nestjs/microservices';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { AccessTokenClaims } from '@am/auth';
import { CatalogPatterns, MediaPatterns, ShopsPatterns } from '@am/contracts';

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
const oldLogo = randomUUID();
const newLogo = randomUUID();
const productId = randomUUID();
const calls: Array<{ pattern: string; data: Record<string, unknown> }> = [];
const record = (pattern: string, data: Record<string, unknown>) => calls.push({ pattern, data });
let staffMayUploadSetting = false;

const shop = (extra: Record<string, unknown> = {}) => ({
  id: shopId,
  name: 'Lagos Kitchen',
  staffCanUploadProductImages: staffMayUploadSetting,
  logoMediaId: null,
  galleryMediaIds: [],
  branches: [],
  ...extra,
});
const product = (imageMediaIds: string[] = []) => ({
  id: productId,
  shopId,
  imageMediaIds,
  variants: [],
  listings: [],
});

@Controller()
class FakeServices {
  @MessagePattern(ShopsPatterns.create)
  create(@Payload() data: Record<string, unknown>) {
    record(ShopsPatterns.create, data);
    return shop({ name: data.name });
  }

  @MessagePattern(ShopsPatterns.get)
  get(@Payload() data: Record<string, unknown>) {
    record(ShopsPatterns.get, data);
    return shop();
  }

  @MessagePattern(ShopsPatterns.update)
  update(@Payload() data: Record<string, unknown>) {
    record(ShopsPatterns.update, data);
    return { shop: shop({ logoMediaId: newLogo }), releasedMediaIds: [oldLogo] };
  }

  @MessagePattern(ShopsPatterns.setSpecialHours)
  special(@Payload() data: Record<string, unknown>) {
    record(ShopsPatterns.setSpecialHours, data);
    return { id: data.branchId };
  }

  @MessagePattern(ShopsPatterns.contactStats)
  stats(@Payload() data: Record<string, unknown>) {
    record(ShopsPatterns.contactStats, data);
    return { shopId, days: data.days };
  }

  @MessagePattern(CatalogPatterns.upsertProduct)
  upsert(@Payload() data: Record<string, unknown>) {
    record(CatalogPatterns.upsertProduct, data);
    return { product: product((data.imageMediaIds as string[]) ?? []), releasedMediaIds: [] };
  }

  @MessagePattern(CatalogPatterns.getProduct)
  getProduct(@Payload() data: Record<string, unknown>) {
    record(CatalogPatterns.getProduct, data);
    return product(['ready', 'processing']);
  }

  @MessagePattern(MediaPatterns.attach)
  attach(@Payload() data: Record<string, unknown>) {
    record(MediaPatterns.attach, data);
    return { media: [] };
  }

  @MessagePattern(MediaPatterns.detach)
  detach(@Payload() data: Record<string, unknown>) {
    record(MediaPatterns.detach, data);
    return { detached: 1 };
  }

  @MessagePattern(MediaPatterns.publicUrls)
  urls(@Payload() data: { mediaIds: string[] }) {
    return {
      // An image still being processed has no link yet.
      urls: Object.fromEntries(
        data.mediaIds
          .filter((id) => id !== 'processing')
          .map((id) => [id, { card: `https://cdn.test/${id}` }]),
      ),
    };
  }

  @MessagePattern(MediaPatterns.createUpload)
  createUpload(@Payload() data: Record<string, unknown>) {
    record(MediaPatterns.createUpload, data);
    return {
      mediaId: randomUUID(),
      upload: { url: 'https://s3.test/', fields: {} },
      expiresAt: new Date().toISOString(),
    };
  }
}

@Module({ controllers: [FakeServices] })
class FakeServicesModule {}

describe('gateway seller routes (HTTP -> gateway -> TCP -> service stand-ins)', () => {
  let app: NestExpressApplication;
  let services: INestMicroservice;
  const accessKey = `${randomUUID()}${randomUUID()}`;
  const jwt = new JwtService({ secret: accessKey });
  const ownerId = randomUUID();
  const tokenFor = (sub: string, shops: AccessTokenClaims['shops'] = []) =>
    jwt.signAsync(
      { sub, roles: ['customer', 'seller'], shops },
      { algorithm: 'HS256', expiresIn: 900 },
    );
  const http = () => request(app.getHttpServer());
  const patternsSince = (n: number) => calls.slice(n).map((c) => c.pattern);

  beforeAll(async () => {
    const port = await freePort();
    for (const name of ['SHOPS', 'CATALOG', 'MEDIA']) {
      process.env[`${name}_TCP_PORT`] = String(port);
      process.env[`${name}_HOST`] = '127.0.0.1';
    }
    process.env.JWT_ACCESS_SECRET = accessKey;
    process.env.NODE_ENV = 'test';
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
    configureApp(app, { corsOrigins: ['http://localhost:3001'] });
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await services?.close();
  });

  it('needs a signed-in person', async () => {
    await http().get('/api/v1/seller/shops').expect(401);
    await http().post('/api/v1/seller/shops').send({ name: 'X' }).expect(401);
  });

  it('lets a shop’s creator work on it before their token lists it', async () => {
    // The token has no shops yet: the shops service decides, knowing the owner for certain.
    const token = await tokenFor(ownerId);
    await http()
      .get(`/api/v1/seller/shops/${shopId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(calls.at(-1)).toMatchObject({
      pattern: ShopsPatterns.get,
      data: { actor: { userId: ownerId, shops: [] }, shopId },
    });
  });

  it('creates a shop as the signed-in person, not anyone the body names', async () => {
    const token = await tokenFor(ownerId);
    await http()
      .post('/api/v1/seller/shops')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Lagos Kitchen', ownerId: randomUUID() })
      .expect(400);
    await http()
      .post('/api/v1/seller/shops')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Lagos Kitchen' })
      .expect(201);
    expect(calls.at(-1)).toMatchObject({
      pattern: ShopsPatterns.create,
      data: { name: 'Lagos Kitchen', actor: { userId: ownerId } },
    });
  });

  it('attaches a new logo before the change and releases the old one after', async () => {
    const token = await tokenFor(ownerId, [{ shopId, role: 'owner', branchIds: [] }]);
    const before = calls.length;
    const res = await http()
      .patch(`/api/v1/seller/shops/${shopId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ logoMediaId: newLogo })
      .expect(200);
    // The answer carries the new logo's links, for the seller's screen.
    expect(res.body.imageUrls).toEqual({ [newLogo]: { card: `https://cdn.test/${newLogo}` } });
    expect(patternsSince(before)).toEqual([
      MediaPatterns.attach,
      ShopsPatterns.update,
      MediaPatterns.detach,
    ]);
    expect(calls[before].data).toMatchObject({
      actorId: ownerId,
      purpose: 'shop_logo',
      shopId,
      target: { type: 'shop', id: shopId },
      mediaIds: [newLogo],
    });
    expect(calls.at(-1)!.data).toEqual({
      target: { type: 'shop', id: shopId },
      mediaIds: [oldLogo],
    });
  });

  it('makes a product first, then binds its images to it', async () => {
    const token = await tokenFor(ownerId, [{ shopId, role: 'owner', branchIds: [] }]);
    const image = randomUUID();
    const before = calls.length;
    const res = await http()
      .post(`/api/v1/seller/shops/${shopId}/products`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId: randomUUID(),
        title: { en: 'Egusi' },
        imageMediaIds: [image],
        variants: [{ priceFils: 2500 }],
      })
      .expect(201);
    expect(patternsSince(before)).toEqual([
      CatalogPatterns.upsertProduct,
      MediaPatterns.attach,
      CatalogPatterns.upsertProduct,
    ]);
    expect(calls[before].data).not.toHaveProperty('imageMediaIds');
    expect(calls[before + 1].data).toMatchObject({
      purpose: 'product_image',
      target: { type: 'product', id: productId },
    });
    expect(res.body.images).toEqual([{ card: `https://cdn.test/${image}` }]);
  });

  it('gives a product to its shop, with image links by id', async () => {
    const token = await tokenFor(ownerId, [{ shopId, role: 'owner', branchIds: [] }]);
    const res = await http()
      .get(`/api/v1/seller/shops/${shopId}/products/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(calls.at(-1)!.data).toMatchObject({ shopId, productId, actor: { userId: ownerId } });
    expect(res.body.imageUrls).toEqual({ ready: { card: 'https://cdn.test/ready' } });
  });

  it('passes on special hours and contact periods, refusing other periods', async () => {
    const token = await tokenFor(ownerId, [{ shopId, role: 'owner', branchIds: [] }]);
    const branchId = randomUUID();
    await http()
      .put(`/api/v1/seller/shops/${shopId}/branches/${branchId}/special-hours/2026-03-20`)
      .set('Authorization', `Bearer ${token}`)
      .send({ closed: true, opensAt: null, closesAt: null, label: { en: 'Eid' } })
      .expect(200);
    expect(calls.at(-1)!.data).toMatchObject({
      branchId,
      date: '2026-03-20',
      closed: true,
      label: { en: 'Eid' },
    });

    await http()
      .get(`/api/v1/seller/shops/${shopId}/contacts?days=30`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200, { shopId, days: 30 });
    await http()
      .get(`/api/v1/seller/shops/${shopId}/contacts?days=14`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('lets staff upload product images only where the shop allows it', async () => {
    const staff = randomUUID();
    const token = await tokenFor(staff, [{ shopId, role: 'staff', branchIds: [] }]);
    const upload = () =>
      http()
        .post('/api/v1/media/uploads')
        .set('Authorization', `Bearer ${token}`)
        .send({ purpose: 'product_image', contentType: 'image/jpeg', sizeBytes: 1000, shopId })
        .expect(200);

    staffMayUploadSetting = false;
    await upload();
    expect(calls.at(-1)).toMatchObject({
      pattern: MediaPatterns.createUpload,
      data: { staffMayUpload: false },
    });
    staffMayUploadSetting = true;
    await upload();
    expect(calls.at(-1)).toMatchObject({
      pattern: MediaPatterns.createUpload,
      data: { staffMayUpload: true },
    });
  });
});
