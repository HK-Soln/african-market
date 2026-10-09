import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { loadEnv } from '@am/core';
import { AppModule } from './app.module';
import { gatewayEnvSchema } from './env';
import { configureApp } from './setup';

async function bootstrap() {
  const env = loadEnv(gatewayEnvSchema);
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  configureApp(app, env.CORS_ORIGINS.split(','));
  await app.listen(env.GATEWAY_PORT);
  app.get(Logger).log(`gateway on http://localhost:${env.GATEWAY_PORT}/api (docs at /docs)`);
}
void bootstrap();
