import { Module } from '@nestjs/common';
import {
  AdminAuditController,
  AdminCatalogueController,
  AdminSearchController,
  AdminVerificationController,
} from './admin.controller';

/** Verification, moderation, categories, emirate switches, the search rebuild and the audit log. */
@Module({
  controllers: [
    AdminVerificationController,
    AdminCatalogueController,
    AdminSearchController,
    AdminAuditController,
  ],
})
export class AdminModule {}
