import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ACCESS_TOKEN_COOKIE } from '@am/auth';
import { HttpErrorFilter, validationException } from './common/http-error.filter';

export interface ConfigureOptions {
  corsOrigins: string[];
  /** See `TRUST_PROXY_HOPS` in env.ts. */
  trustProxyHops?: number;
}

/** Shared by main.ts, the OpenAPI export script and the tests, so all three run the same app. */
export function configureApp(app: NestExpressApplication, options: ConfigureOptions) {
  if (options.trustProxyHops) app.set('trust proxy', options.trustProxyHops);
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: options.corsOrigins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationException,
    }),
  );
  app.useGlobalFilters(new HttpErrorFilter());

  const config = new DocumentBuilder()
    .setTitle('African Market API')
    .setDescription('Gateway REST API for the web, seller and admin apps')
    .setVersion('1')
    .addBearerAuth()
    .addCookieAuth(ACCESS_TOKEN_COOKIE)
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
  return document;
}
