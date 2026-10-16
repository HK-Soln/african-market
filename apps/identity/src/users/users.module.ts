import { Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OutboxService } from '@am/database';
import { SessionService } from '../sessions/session.service';
import { AccountErasure } from './account-erasure';
import { PrivacyService } from './privacy.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [
    {
      provide: UsersService,
      inject: [getDataSourceToken()],
      useFactory: (dataSource: DataSource) => new UsersService(dataSource),
    },
    {
      provide: PrivacyService,
      inject: [getDataSourceToken(), OutboxService, SessionService],
      useFactory: (dataSource: DataSource, outbox: OutboxService, sessions: SessionService) =>
        new PrivacyService(dataSource, outbox, sessions),
    },
    {
      provide: AccountErasure,
      inject: [getDataSourceToken()],
      useFactory: (dataSource: DataSource) => new AccountErasure(dataSource),
    },
  ],
})
export class UsersModule {}
