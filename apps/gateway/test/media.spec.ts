import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer, type Server } from 'node:http';
import { AddressInfo, createServer } from 'node:net';
import { Controller, INestMicroservice, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { MessagePattern, Payload, RpcException, Transport } from '@nestjs/microservices';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { AccessTokenClaims } from '@am/auth';
import { MediaErrors, MediaPatterns } from '@am/contracts';
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

type Data = Record<string, unknown>;
const received: Array<{ pattern: string; data: Data }> = [];
const last = (pattern: string) => [...received].reverse().find((r) => r.pattern === pattern)?.data;
const PDF = Buffer.from('%PDF-1.7\n%%EOF\n');
let documentUrl = '';

/** Stands in for the media service: records what the gateway sends and answers like it. */
@Controller()
class FakeMediaController {
  @MessagePattern(MediaPatterns.createUpload)
  createUpload(@Payload() data: Data) {
    received.push({ pattern: MediaPatterns.createUpload, data });
    return {
      mediaId: randomUUID(),
      upload: {
        method: 'PUT',
        url: 'http://storage.test/uploads',
        headers: { 'Content-Type': 'image/png' },
      },
      expiresAt: new Date().toISOString(),
    };
  }

  @MessagePattern(MediaPatterns.confirmUpload)
  confirmUpload(@Payload() data: Data) {
    received.push({ pattern: MediaPatterns.confirmUpload, data });
    throw new RpcException({
      status: 422,
      code: MediaErrors.fileRejected,
      message: 'rejected',
      details: { reason: 'wrong_type' },
    });
  }

  @MessagePattern(MediaPatterns.privateAccess)
  privateAccess(@Payload() data: Data) {
    received.push({ pattern: MediaPatterns.privateAccess, data });
    return { url: documentUrl, contentType: 'application/pdf', filename: 'trade_license-x.pdf' };
  }
}

@Module({ controllers: [FakeMediaController] })
class FakeMediaModule {}

describe('gateway media routes (HTTP -> gateway -> TCP -> media stand-in)', () => {
  let app: NestExpressApplication;
  let media: INestMicroservice;
  let storage: Server;
  const accessKey = `${randomUUID()}${randomUUID()}`;
  const jwt = new JwtService({ secret: accessKey });
  const shopId = randomUUID();

  /** A bearer token for someone with these roles and shops, signed as identity would. */
  const tokenFor = (roles: AccessTokenClaims['roles'], shops: AccessTokenClaims['shops'] = []) =>
    jwt.signAsync({ sub: randomUUID(), roles, shops }, { algorithm: 'HS256', expiresIn: 900 });
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    storage = createHttpServer((_, res) => {
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': PDF.length });
      res.end(PDF);
    });
    await new Promise<void>((resolve) => storage.listen(0, '127.0.0.1', resolve));
    documentUrl = `http://127.0.0.1:${(storage.address() as AddressInfo).port}/signed`;

    const port = await freePort();
    process.env.MEDIA_TCP_PORT = String(port);
    process.env.MEDIA_HOST = '127.0.0.1';
    process.env.JWT_ACCESS_SECRET = accessKey;
    process.env.DEPLOY_ENV = 'test';
    process.env.LOG_LEVEL = 'fatal';
    media = await NestFactory.createMicroservice(FakeMediaModule, {
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port },
      logger: false,
    });
    await media.listen();

    const { AppModule } = (await import('../src/app.module')) as typeof import('../src/app.module');
    const { configureApp } = (await import('../src/setup')) as typeof import('../src/setup');
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app, { appOrigins: TEST_APP_ORIGINS });
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await media?.close();
    await new Promise((resolve) => storage?.close(resolve));
  });

  it('hands media who is asking, from the token, never from the body', async () => {
    const token = await tokenFor(
      ['customer', 'seller'],
      [{ shopId, role: 'manager', branchIds: [] }],
    );
    const res = await http()
      .post('/api/v1/media/uploads')
      .set('Authorization', `Bearer ${token}`)
      .send({ purpose: 'product_image', contentType: 'image/jpeg', sizeBytes: 1000, shopId })
      .expect(200);
    expect(res.body.upload).toEqual({
      method: 'PUT',
      url: 'http://storage.test/uploads',
      headers: { 'Content-Type': 'image/png' },
    });
    expect(last(MediaPatterns.createUpload)).toMatchObject({
      purpose: 'product_image',
      shopId,
      staffMayUpload: false,
      actor: { roles: ['customer', 'seller'], shops: [{ shopId, role: 'manager' }] },
    });
  });

  it('refuses an upload without a session, a purpose it does not know, or extra fields', async () => {
    await http().post('/api/v1/media/uploads').send({}).expect(401);
    const token = await tokenFor(['customer']);
    const bad = (body: object) =>
      http().post('/api/v1/media/uploads').set('Authorization', `Bearer ${token}`).send(body);
    await bad({ purpose: 'kyc_selfie', contentType: 'image/jpeg', sizeBytes: 10 }).expect(400);
    await bad({ purpose: 'avatar', contentType: 'image/jpeg', sizeBytes: -1 }).expect(400);
    await bad({ purpose: 'avatar', contentType: 'image/jpeg', sizeBytes: 10, actor: {} }).expect(
      400,
    );
  });

  it('passes a rejected file through as 422 with the reason', async () => {
    const token = await tokenFor(['customer']);
    const res = await http()
      .post(`/api/v1/media/uploads/${randomUUID()}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(422);
    expect(res.body).toMatchObject({
      code: MediaErrors.fileRejected,
      details: { reason: 'wrong_type' },
    });
  });

  it('streams a private document to an admin, never handing out its link', async () => {
    const id = randomUUID();
    await http()
      .get(`/api/v1/admin/media/${id}/content`)
      .set('Authorization', `Bearer ${await tokenFor(['customer', 'seller'])}`)
      .expect(403);

    const res = await http()
      .get(`/api/v1/admin/media/${id}/content`)
      .set('Authorization', `Bearer ${await tokenFor(['customer', 'admin'])}`)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.body).toEqual(PDF);
    expect(res.headers).toMatchObject({
      'content-type': 'application/pdf',
      'content-disposition': 'attachment; filename="trade_license-x.pdf"',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    expect(JSON.stringify(res.headers)).not.toContain(documentUrl);
    expect(last(MediaPatterns.privateAccess)).toMatchObject({
      mediaId: id,
      actor: { roles: ['customer', 'admin'] },
    });
  });
});
