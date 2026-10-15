import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SERVICE_NAMES, serviceClientToken } from '@am/contracts';
import { loadServiceEndpoints } from '@am/core';

const endpoints = loadServiceEndpoints();

/** One lazy TCP client per backend service. Inject with `@Inject(serviceClientToken('shops'))`. */
@Global()
@Module({
  imports: [
    ClientsModule.register(
      SERVICE_NAMES.map((name) => ({
        name: serviceClientToken(name),
        transport: Transport.TCP,
        options: {
          host: endpoints[name].host,
          port: endpoints[name].tcpPort,
        },
      })),
    ),
  ],
  exports: [ClientsModule],
})
export class ClientsRegistryModule {}
