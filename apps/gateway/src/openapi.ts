import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './setup';

/** Writes apps/gateway/openapi.json; `pnpm --filter @am/api-client generate` turns it into types. */
async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn'],
    abortOnError: false,
  });
  const document = configureApp(app, { corsOrigins: [] });
  writeFileSync(join(__dirname, '..', 'openapi.json'), JSON.stringify(document, null, 2));
  await app.close();
  process.exit(0);
}
void main();
