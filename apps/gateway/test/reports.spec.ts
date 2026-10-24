import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { AddressInfo, createServer } from 'node:net';
import { Controller, INestMicroservice, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { MessagePattern, Payload, Transport } from '@nestjs/microservices';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { CatalogPatterns, ShopsPatterns } from '@am/contracts';
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

const received: Array<{ pattern: string; data: Record<string, unknown> }> = [];
const page = { items: [], nextCursor: null, prevCursor: null };

@Controller()
class FakeShopsController {
  @MessagePattern(ShopsPatterns.submitReport)
  submit(@Payload() data: Record<string, unknown>) {
    received.push({ pattern: ShopsPatterns.submitReport, data });
    return { recorded: true };
  }

  @MessagePattern(ShopsPatterns.listReports)
  list(@Payload() data: Record<string, unknown>) {
    received.push({ pattern: ShopsPatterns.listReports, data });
    return page;
  }

  @MessagePattern(ShopsPatterns.decideReport)
  decide(@Payload() data: Record<string, unknown>) {
    received.push({ pattern: ShopsPatterns.decideReport, data });
    return { closed: 3 };
  }
}

@Controller()
class FakeCatalogController {
  @MessagePattern(CatalogPatterns.submitReport)
  submit(@Payload() data: Record<string, unknown>) {
    received.push({ pattern: CatalogPatterns.submitReport, data });
    return { recorded: true };
  }
}

@Module({ controllers: [FakeShopsController] })
class FakeShopsModule {}

@Module({ controllers: [FakeCatalogController] })
class FakeCatalogModule {}

describe('gateway reports (HTTP -> gateway -> TCP -> shops and catalog stand-ins)', () => {
  let app: NestExpressApplication;
  let shops: INestMicroservice;
  let catalog: INestMicroservice;
  const accessKey = `${randomUUID()}${randomUUID()}`;
  const jwt = new JwtService({ secret: accessKey });
  const http = () => request(app.getHttpServer());
  const token = (sub: string, roles: string[]) =>
    jwt.signAsync({ sub, roles, shops: [] }, { algorithm: 'HS256', expiresIn: 900 });
  const report = { reason: 'fraud', sessionId: 'visitor-1234abcd' };

  beforeAll(async () => {
    const [shopsPort, catalogPort] = [await freePort(), await freePort()];
    process.env.SHOPS_TCP_PORT = String(shopsPort);
    process.env.SHOPS_HOST = '127.0.0.1';
    process.env.CATALOG_TCP_PORT = String(catalogPort);
    process.env.CATALOG_HOST = '127.0.0.1';
    process.env.JWT_ACCESS_SECRET = accessKey;
    process.env.DEPLOY_ENV = 'test';
    process.env.LOG_LEVEL = 'fatal';
    shops = await NestFactory.createMicroservice(FakeShopsModule, {
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port: shopsPort },
      logger: false,
    });
    catalog = await NestFactory.createMicroservice(FakeCatalogModule, {
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port: catalogPort },
      logger: false,
    });
    await shops.listen();
    await catalog.listen();

    const { AppModule } = (await import('../src/app.module')) as typeof import('../src/app.module');
    const { configureApp } = (await import('../src/setup')) as typeof import('../src/setup');
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app, { appOrigins: TEST_APP_ORIGINS });
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await shops?.close();
    await catalog?.close();
  });

  // The route takes five a minute from one address: these five use them all.
  it('sends a shop report to shops, without signing in', async () => {
    const shopId = randomUUID();
    await http()
      .post('/api/v1/reports')
      .send({ ...report, shopId })
      .expect(202, { recorded: true });
    expect(received.at(-1)).toMatchObject({
      pattern: ShopsPatterns.submitReport,
      data: { ...report, shopId },
    });
    expect(received.at(-1)!.data.userId).toBeUndefined();
  });

  it('sends a product report to catalog, with the signed-in person from the token', async () => {
    const sub = randomUUID();
    const productId = randomUUID();
    await http()
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${await token(sub, ['customer'])}`)
      .send({ ...report, productId, details: 'Not what the photo shows' })
      .expect(202);
    expect(received.at(-1)).toMatchObject({
      pattern: CatalogPatterns.submitReport,
      data: { productId, userId: sub, details: 'Not what the photo shows' },
    });
    expect(received.at(-1)!.data.shopId).toBeUndefined();
  });

  it('wants exactly one of shopId and productId, and a known reason', async () => {
    const before = received.length;
    await http()
      .post('/api/v1/reports')
      .send({ ...report, shopId: randomUUID(), productId: randomUUID() })
      .expect(400);
    await http().post('/api/v1/reports').send(report).expect(400);
    await http()
      .post('/api/v1/reports')
      .send({ ...report, shopId: randomUUID(), reason: 'boring' })
      .expect(400);
    expect(received.length).toBe(before);
  });

  it('opens the queue and decisions to admins only', async () => {
    const adminId = randomUUID();
    const admin = `Bearer ${await token(adminId, ['admin'])}`;
    await http()
      .get('/api/v1/admin/reports/shops')
      .set('Authorization', `Bearer ${await token(randomUUID(), ['customer'])}`)
      .expect(403);

    await http()
      .get('/api/v1/admin/reports/shops?filter[status]=open')
      .set('Authorization', admin)
      .expect(200, page);
    expect(received.at(-1)).toMatchObject({
      pattern: ShopsPatterns.listReports,
      data: { actor: { userId: adminId } },
    });

    const reportId = randomUUID();
    await http()
      .post(`/api/v1/admin/reports/shops/${reportId}/decision`)
      .set('Authorization', admin)
      .send({ outcome: 'resolved', note: 'Suspended' })
      .expect(200, { closed: 3 });
    expect(received.at(-1)).toMatchObject({
      pattern: ShopsPatterns.decideReport,
      data: { reportId, outcome: 'resolved', note: 'Suspended', actor: { userId: adminId } },
    });
    await http()
      .post(`/api/v1/admin/reports/shops/${reportId}/decision`)
      .set('Authorization', admin)
      .send({ outcome: 'open' })
      .expect(400);
  });
});
