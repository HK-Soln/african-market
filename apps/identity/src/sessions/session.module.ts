import { Global, Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { APP_ENV } from '@am/core';
import { IdentityEnv } from '../config/identity-env';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

/** Global so every way of signing in (phone code, email and password) starts sessions the same way. */
@Global()
@Module({
  controllers: [SessionController],
  providers: [
    {
      provide: SessionService,
      inject: [getDataSourceToken(), APP_ENV],
      useFactory: (dataSource: DataSource, env: IdentityEnv) =>
        new SessionService(dataSource, env.JWT_ACCESS_SECRET),
    },
  ],
  exports: [SessionService],
})
export class SessionModule {}
