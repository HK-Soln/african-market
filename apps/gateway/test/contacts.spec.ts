import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { AddressInfo, createServer } from 'node:net';
import { Controller, INestMicroservice, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { MessagePattern, Payload, Transport } from '@nestjs/microservices';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ShopsPatterns } from '@am/contracts';
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

const received: Array<Record<string, unknown>> = [];

@Controller()
class FakeShopsController {
  @MessagePattern(ShopsPatterns.recordContact)
  record(@Payload() data: Record<string, unknown>) {
    received.push(data);
    return { recorded: true };
  }
}

@Module({ controllers: [FakeShopsController] })
class FakeShopsModule {}

describe('gateway contact taps (HTTP -> gateway -> TCP -> shops stand-in)', () => {
  let app: NestExpressApplication;
  let shops: INestMicroservice;
  const accessKey = `${randomUUID()}${randomUUID()}`;
  const jwt = new JwtService({ secret: accessKey });
  const shopId = randomUUID();
  const http = () => request(app.getHttpServer());
  const tap = {
    shopId,
    channel: 'whatsapp',
    sessionId: 'visitor-1234abcd',
    sourcePage: '/en/shops/accra',
  };

  beforeAll(async () => {
    const port = await freePort();
    process.env.SHOPS_TCP_PORT = String(port);
    process.env.SHOPS_HOST = '127.0.0.1';
    process.env.JWT_ACCESS_SECRET = accessKey;
    process.env.DEPLOY_ENV = 'test';
    process.env.LOG_LEVEL = 'fatal';
    shops = await NestFactory.createMicroservice(FakeShopsModule, {
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port },
      logger: false,
    });
    await shops.listen();

    const { AppModule } = (await import('../src/app.module')) as typeof import('../src/app.module');
    const { configureApp } = (await import('../src/setup')) as typeof import('../src/setup');
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app, { appOrigins: TEST_APP_ORIGINS });
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await shops?.close();
  });

  it('takes a tap without signing in', async () => {
    await http().post('/api/v1/contact-events').send(tap).expect(202, { recorded: true });
    expect(received.at(-1)).toMatchObject({ ...tap });
    expect(received.at(-1)!.userId).toBeUndefined();
  });

  it('adds the signed-in person from the token, never from the body', async () => {
    const sub = randomUUID();
    const token = await jwt.signAsync(
      { sub, roles: ['customer'], shops: [] },
      { algorithm: 'HS256', expiresIn: 900 },
    );
    await http()
      .post('/api/v1/contact-events')
      .set('Authorization', `Bearer ${token}`)
      .send(tap)
      .expect(202);
    expect(received.at(-1)).toMatchObject({ userId: sub });

    await http()
      .post('/api/v1/contact-events')
      .send({ ...tap, userId: randomUUID() })
      .expect(400);
  });

  it('refuses what is not a tap', async () => {
    await http()
      .post('/api/v1/contact-events')
      .send({ ...tap, channel: 'sms' })
      .expect(400);
    await http()
      .post('/api/v1/contact-events')
      .send({ ...tap, sessionId: 'x' })
      .expect(400);
    await http()
      .post('/api/v1/contact-events')
      .send({ ...tap, sourcePage: 'https://evil.example/?q=1' })
      .expect(400);
  });
});
