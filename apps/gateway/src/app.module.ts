import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard, RolesGuard, ACCESS_TOKEN_TTL_SECONDS } from '@am/auth';
import { loadEnv, ServiceCoreModule } from '@am/core';
import { ClientsRegistryModule } from './clients.module';
import { ServiceCaller } from './common/service-caller';
import { gatewayEnvSchema } from './env';
import { GatewayHealthController } from './health/health.controller';

const env = loadEnv(gatewayEnvSchema);

@Module({
  imports: [
    ServiceCoreModule.forRoot({ name: 'gateway', envSchema: gatewayEnvSchema }),
    ClientsRegistryModule,
    JwtModule.register({
      global: true,
      secret: env.JWT_ACCESS_SECRET,
      signOptions: { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    // Feature modules (auth, shops, catalog, search, media, ...) are added per phase; see docs/directives.
  ],
  controllers: [GatewayHealthController],
  providers: [
    ServiceCaller,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [ServiceCaller],
})
export class AppModule {}
