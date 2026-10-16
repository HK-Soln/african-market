import { Module } from '@nestjs/common';
import {
  SellerProductsController,
  SellerShopsController,
  SellerVerificationController,
} from './seller.controller';

/** Shops, branches, hours, products, stock, verification and contact analytics for sellers. */
@Module({
  controllers: [SellerShopsController, SellerVerificationController, SellerProductsController],
})
export class SellerModule {}
