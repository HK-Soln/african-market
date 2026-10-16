// First, before anything that tracing instruments is loaded.
import './instrument';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { describeTelemetry, loadEnv } from '@am/core';
import { AppModule } from './app.module';
import { gatewayEnvSchema } from './env';
import { configureApp } from './setup';

async function bootstrap() {
  const env = loadEnv(gatewayEnvSchema);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  configureApp(app, {
    corsOrigins: env.CORS_ORIGINS.split(','),
    trustProxyHops: env.TRUST_PROXY_HOPS,
  });
  await app.listen(env.GATEWAY_PORT);
  app.get(Logger).log(`gateway on http://localhost:${env.GATEWAY_PORT}/api (docs at /docs)`);
  app.get(Logger).log(describeTelemetry());
}
void bootstrap();
