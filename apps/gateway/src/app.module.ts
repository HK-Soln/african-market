import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard, RolesGuard, ACCESS_TOKEN_TTL_SECONDS } from '@am/auth';
import { loadEnv, ServiceCoreModule } from '@am/core';
import { AuthModule } from './auth/auth.module';
import { ClientsRegistryModule } from './clients.module';
import { CommonModule } from './common/common.module';
import { gatewayEnvSchema } from './env';
import { GatewayHealthController } from './health/health.controller';
import { testSupportModules } from './test-support/test-support.module';

const env = loadEnv(gatewayEnvSchema);

@Module({
  imports: [
    ServiceCoreModule.forRoot({ name: 'gateway', envSchema: gatewayEnvSchema }),
    ClientsRegistryModule,
    CommonModule,
    JwtModule.register({
      global: true,
      secret: env.JWT_ACCESS_SECRET,
      signOptions: { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
      // Identity signs with HS256 (decision T-11); nothing else is accepted.
      verifyOptions: { algorithms: ['HS256'] },
    }),
    // Per IP. Routes override this with `@Throttle()`, see auth/auth.throttles.ts.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    AuthModule,
    ...testSupportModules(process.env.NODE_ENV),
    // Further feature modules (shops, catalog, search, media, ...) are added per phase; see docs/directives.
  ],
  controllers: [GatewayHealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
