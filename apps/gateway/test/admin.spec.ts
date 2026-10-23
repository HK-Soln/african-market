import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer, Server } from 'node:http';
import { AddressInfo, createServer } from 'node:net';
import { Controller, INestMicroservice, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { MessagePattern, Payload, Transport } from '@nestjs/microservices';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { AccessTokenClaims } from '@am/auth';
import {
  CatalogPatterns,
  DiscoveryPatterns,
  IdentityPatterns,
  MediaPatterns,
  ShopsPatterns,
} from '@am/contracts';
import { TEST_APP_ORIGINS } from './support/app-origins';

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const calls: Array<{ pattern: string; data: Record<string, unknown> }> = [];
let providerBase = '';

@Controller()
class FakeServices {
  @MessagePattern(ShopsPatterns.decideListing)
  decide(@Payload() data: Record<string, unknown>) {
    calls.push({ pattern: ShopsPatterns.decideListing, data });
    return { shop: { id: data.shopId, logoMediaId: null, galleryMediaIds: [] }, requests: [] };
  }

  @MessagePattern(ShopsPatterns.getVerification)
  verification(@Payload() data: { shopId: string }) {
    return {
      shop: { id: data.shopId, logoMediaId: 'logo', galleryMediaIds: ['processing'] },
      requests: [],
    };
  }

  @MessagePattern(MediaPatterns.publicUrls)
  urls(@Payload() data: { mediaIds: string[] }) {
    // An image still being processed has no link yet.
    return {
      urls: Object.fromEntries(
        data.mediaIds
          .filter((id) => id !== 'processing')
          .map((id) => [id, { card: `https://cdn.test/${id}` }]),
      ),
    };
  }

  @MessagePattern(ShopsPatterns.kycDocument)
  document(@Payload() data: { kind: string }) {
    calls.push({ pattern: ShopsPatterns.kycDocument, data });
    return { url: `${providerBase}/${data.kind}`, filename: `kyc-${data.kind}.jpg` };
  }

  @MessagePattern(CatalogPatterns.upsertCategory)
  category(@Payload() data: Record<string, unknown>) {
    calls.push({ pattern: CatalogPatterns.upsertCategory, data });
    return { id: randomUUID(), ...data };
  }

  @MessagePattern(IdentityPatterns.listAudit)
  audit(@Payload() data: Record<string, unknown>) {
    calls.push({ pattern: IdentityPatterns.listAudit, data });
    return { items: [], nextCursor: null, prevCursor: null };
  }

  @MessagePattern(DiscoveryPatterns.setEmirateSearch)
  emirate(@Payload() data: Record<string, unknown>) {
    calls.push({ pattern: DiscoveryPatterns.setEmirateSearch, data });
    return { items: [] };
  }
}

@Module({ controllers: [FakeServices] })
class FakeServicesModule {}

describe('gateway admin routes (HTTP -> gateway -> TCP -> service stand-ins)', () => {
  let app: NestExpressApplication;
  let services: INestMicroservice;
  let provider: Server;
  const accessKey = `${randomUUID()}${randomUUID()}`;
  const jwt = new JwtService({ secret: accessKey });
  const tokenFor = (roles: AccessTokenClaims['roles']) =>
    jwt.signAsync({ sub: randomUUID(), roles, shops: [] }, { algorithm: 'HS256', expiresIn: 900 });
  const http = () => request(app.getHttpServer());
  const shopId = randomUUID();
  const requestId = randomUUID();

  beforeAll(async () => {
    // Stands in for the provider's short-lived image links.
    provider = createHttpServer((req, res) => {
      if (req.url === '/selfie') {
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': JPEG.length });
        res.end(JPEG);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<p>not an image</p>');
      }
    });
    await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
    providerBase = `http://127.0.0.1:${(provider.address() as AddressInfo).port}`;

    const port = await freePort();
    for (const name of ['SHOPS', 'CATALOG', 'DISCOVERY', 'MEDIA', 'IDENTITY']) {
      process.env[`${name}_TCP_PORT`] = String(port);
      process.env[`${name}_HOST`] = '127.0.0.1';
    }
    process.env.JWT_ACCESS_SECRET = accessKey;
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
    configureApp(app, { appOrigins: TEST_APP_ORIGINS });
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await services?.close();
    provider?.close();
  });

  it('turns away everyone but admins', async () => {
    const seller = await tokenFor(['customer', 'seller']);
    await http().get('/api/v1/admin/shops').expect(401);
    await http().get('/api/v1/admin/shops').set('Authorization', `Bearer ${seller}`).expect(403);
    await http()
      .post(`/api/v1/admin/shops/${shopId}/listing`)
      .set('Authorization', `Bearer ${seller}`)
      .send({ decision: 'approve' })
      .expect(403);
  });

  it('passes on a listing decision with its reason', async () => {
    const admin = await tokenFor(['customer', 'admin']);
    await http()
      .post(`/api/v1/admin/shops/${shopId}/listing`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ decision: 'suspend', reason: 'Fake reviews' })
      .expect(200);
    expect(calls.at(-1)).toMatchObject({
      pattern: ShopsPatterns.decideListing,
      data: {
        shopId,
        decision: 'suspend',
        reason: 'Fake reviews',
        actor: { roles: ['customer', 'admin'] },
      },
    });
    await http()
      .post(`/api/v1/admin/shops/${shopId}/listing`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ decision: 'delete' })
      .expect(400);
  });

  it("shows a shop's verification with its photos' links", async () => {
    const admin = await tokenFor(['admin']);
    const res = await http()
      .get(`/api/v1/admin/shops/${shopId}/verification`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.shop.imageUrls).toEqual({ logo: { card: 'https://cdn.test/logo' } });
  });

  it('streams an identity image without showing its link, and nothing that is not an image', async () => {
    const admin = await tokenFor(['admin']);
    const res = await http()
      .get(`/api/v1/admin/shops/${shopId}/verification/${requestId}/documents/selfie`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Buffer.from(res.body)).toEqual(JPEG);
    expect(JSON.stringify(res.headers)).not.toContain(providerBase);

    await http()
      .get(`/api/v1/admin/shops/${shopId}/verification/${requestId}/documents/id_front`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(503);
  });

  it('adds a category and switches emirate search', async () => {
    const admin = await tokenFor(['admin']);
    await http()
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        slug: 'hair-extensions',
        name: { en: 'Hair extensions', ar: 'وصلات الشعر' },
        parentId: randomUUID(),
      })
      .expect(201);
    expect(calls.at(-1)).toMatchObject({
      pattern: CatalogPatterns.upsertCategory,
      data: { slug: 'hair-extensions' },
    });
    await http()
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${admin}`)
      .send({ slug: 'No Spaces', name: { en: 'X', ar: 'س' } })
      .expect(400);

    await http()
      .put('/api/v1/admin/emirates/dxb/search')
      .set('Authorization', `Bearer ${admin}`)
      .send({ open: true })
      .expect(200);
    expect(calls.at(-1)).toMatchObject({
      pattern: DiscoveryPatterns.setEmirateSearch,
      data: { code: 'DXB', open: true },
    });
  });

  it('lists the audit log for admins, with the filters as a list query', async () => {
    const admin = await tokenFor(['admin']);
    const seller = await tokenFor(['seller']);
    await http().get('/api/v1/admin/audit').set('Authorization', `Bearer ${seller}`).expect(403);
    await http()
      .get(`/api/v1/admin/audit?filter[shopId]=${shopId}&filter[action][in]=shop.listing_approved`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(calls.at(-1)).toMatchObject({
      pattern: IdentityPatterns.listAudit,
      data: {
        actor: { roles: ['admin'] },
        query: {
          filters: expect.arrayContaining([
            { field: 'action', op: 'in', value: ['shop.listing_approved'] },
            { field: 'shopId', op: 'eq', value: shopId },
          ]),
          sort: [{ field: 'occurredAt', direction: 'desc' }],
          limit: 50,
        },
      },
    });
    await http()
      .get('/api/v1/admin/audit?filter[action]=shop.deleted')
      .set('Authorization', `Bearer ${admin}`)
      .expect(400);
  });
});
