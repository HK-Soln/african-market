import 'reflect-metadata';
import { INestApplication, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { ServiceName } from '@am/contracts';
import { loadServicePorts } from './env';
import { describeTelemetry } from './telemetry/state';

/**
 * Starts a backend service as a hybrid app:
 * - TCP microservice for request/response calls from the gateway
 * - a small HTTP server for /health (container and load balancer checks)
 * Event consumption runs through EventBus, not a Nest transport. Tracing is started before this,
 * by the app's src/instrument.ts (see startTelemetry).
 */
export async function bootstrapService(
  name: ServiceName,
  module: Type<unknown>,
): Promise<INestApplication> {
  const { tcpPort, httpPort } = loadServicePorts(name);

  const app = await NestFactory.create(module, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.connectMicroservice<MicroserviceOptions>(
    { transport: Transport.TCP, options: { host: '0.0.0.0', port: tcpPort } },
    { inheritAppConfig: true },
  );
  await app.startAllMicroservices();
  await app.listen(httpPort);
  app.get(Logger).log(`${name} listening: tcp ${tcpPort}, http ${httpPort}`);
  app.get(Logger).log(describeTelemetry());
  return app;
}
