import { Module } from '@nestjs/common';
import { AdminReportsController, ReportsController } from './reports.controller';

/** Reports on shops and products (F1-15): sending one, and the admin queue. */
@Module({ controllers: [ReportsController, AdminReportsController] })
export class ReportsModule {}
