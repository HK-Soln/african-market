import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SERVICE_NAMES, SERVICES, serviceClientToken } from '@am/contracts';

/** One lazy TCP client per backend service. Inject with `@Inject(serviceClientToken('shops'))`. */
@Global()
@Module({
  imports: [
    ClientsModule.register(
      SERVICE_NAMES.map((name) => ({
        name: serviceClientToken(name),
        transport: Transport.TCP,
        options: {
          host: process.env[`${name.toUpperCase()}_HOST`] ?? 'localhost',
          port: Number(process.env[`${name.toUpperCase()}_TCP_PORT`] ?? SERVICES[name].tcpPort),
        },
      })),
    ),
  ],
  exports: [ClientsModule],
})
export class ClientsRegistryModule {}
