import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { AddressInfo, createServer } from 'node:net';
import { Controller, INestMicroservice, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MessagePattern, Payload, RpcException, Transport } from '@nestjs/microservices';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ShopsPatterns, VerificationErrors } from '@am/contracts';

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });

const received: Array<Record<string, unknown>> = [];

/** Stands in for the shops service: accepts a webhook unless its signature header says "bad". */
@Controller()
class FakeShopsController {
  @MessagePattern(ShopsPatterns.kycWebhook)
  webhook(@Payload() data: { headers: Record<string, string> }) {
    received.push(data);
    if (data.headers['x-signature'] === 'bad') {
      throw new RpcException({
        status: 401,
        code: VerificationErrors.webhookRejected,
        message: 'no',
      });
    }
    return { accepted: true };
  }
}

@Module({ controllers: [FakeShopsController] })
class FakeShopsModule {}

describe('gateway webhooks (HTTP -> gateway -> TCP -> shops stand-in)', () => {
  let app: NestExpressApplication;
  let shops: INestMicroservice;

  beforeAll(async () => {
    const port = await freePort();
    process.env.SHOPS_TCP_PORT = String(port);
    process.env.SHOPS_HOST = '127.0.0.1';
    process.env.JWT_ACCESS_SECRET = `${randomUUID()}${randomUUID()}`;
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'fatal';
    shops = await NestFactory.createMicroservice(FakeShopsModule, {
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port },
      logger: false,
    });
    await shops.listen();

    const { AppModule } = (await import('../src/app.module')) as typeof import('../src/app.module');
    const { configureApp } = (await import('../src/setup')) as typeof import('../src/setup');
    app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: false,
      rawBody: true,
    });
    configureApp(app, { corsOrigins: ['http://localhost:3000'] });
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await shops?.close();
  });

  it('passes on the exact body and only the signature headers, without a session', async () => {
    // Spacing and key order as sent: re-encoding them would break the signature.
    const body = '{"status":"Approved",  "session_id":"sess-1","note":"été"}';
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/didit')
      .set('Content-Type', 'application/json')
      .set('X-Signature', 'abc')
      .set('X-Timestamp', '1792150000')
      .set('Cookie', 'am_at=whatever')
      .send(body)
      .expect(200, { accepted: true });

    expect(received.at(-1)).toMatchObject({
      rawBody: body,
      headers: { 'x-signature': 'abc', 'x-timestamp': '1792150000' },
    });
    expect(Object.keys(received.at(-1)!.headers as object).sort()).toEqual([
      'x-signature',
      'x-timestamp',
    ]);
  });

  it('answers 401 when the signature does not check out, so the provider tries again', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/webhooks/didit')
      .set('Content-Type', 'application/json')
      .set('X-Signature', 'bad')
      .send('{}')
      .expect(401);
    expect(res.body.code).toBe(VerificationErrors.webhookRejected);
  });
});
