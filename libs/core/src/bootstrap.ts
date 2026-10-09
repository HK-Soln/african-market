import 'reflect-metadata';
import { INestApplication, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { SERVICES, ServiceName } from '@am/contracts';

const envKey = (name: string, suffix: string) => `${name.toUpperCase()}_${suffix}`;

/**
 * Starts a backend service as a hybrid app:
 * - TCP microservice for request/response calls from the gateway
 * - a small HTTP server for /health (container and load balancer checks)
 * Event consumption runs through EventBus, not a Nest transport.
 */
export async function bootstrapService(
  name: ServiceName,
  module: Type<unknown>,
): Promise<INestApplication> {
  const defaults = SERVICES[name];
  const tcpPort = Number(process.env[envKey(name, 'TCP_PORT')] ?? defaults.tcpPort);
  const httpPort = Number(process.env[envKey(name, 'HTTP_PORT')] ?? defaults.httpPort);

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
  return app;
}
