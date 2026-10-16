import { Module } from '@nestjs/common';
import {
  AdminCatalogueController,
  AdminSearchController,
  AdminVerificationController,
} from './admin.controller';

/** Verification, moderation, categories, emirate switches and the search rebuild. */
@Module({
  controllers: [AdminVerificationController, AdminCatalogueController, AdminSearchController],
})
export class AdminModule {}
