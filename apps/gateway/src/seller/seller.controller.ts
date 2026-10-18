import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthenticatedUser, CurrentUser } from '@am/auth';
import {
  BranchDto,
  CatalogPatterns,
  ContactStatsDto as ContactStats,
  type ListQuery,
  MY_SHOPS_LIST_SPEC,
  ProductDto as Product,
  ProductPage,
  RemoveProductResponse,
  SHOP_PRODUCTS_LIST_SPEC,
  ShopDto,
  ShopPage,
  ShopsPatterns,
  StartKycResponse,
  UpdateShopResponse,
  UpsertProductResponse,
  VerificationOverviewDto as VerificationOverview,
} from '@am/contracts';
import { actorOf } from '../common/actor';
import { ApiListQuery, ListQueryParams } from '../common/list-query';
import { MediaBinder } from '../common/media-binder';
import { MediaLinks, type ImageUrls } from '../common/media-links';
import { correlationId } from '../common/request-context';
import { ServiceCaller } from '../common/service-caller';
import {
  ContactStatsDto,
  ContactStatsQuery,
  CreateBranchBody,
  CreateProductBody,
  CreateShopBody,
  SellerBranchDto,
  SellerProductDto,
  SellerProductPageDto,
  SellerShopDto,
  SellerShopPageDto,
  SetListingsBody,
  SetOpeningHoursBody,
  SetProductStatusBody,
  SetSpecialHoursBody,
  StartKycBody,
  StartKycResponseDto,
  SubmitTradeLicenseBody,
  UpdateBranchBody,
  UpdatedCountDto,
  UpdateProductBody,
  UpdateShopBody,
  UpdateStockBody,
  VerificationOverviewDto,
} from './seller.dto';

const MINUTE = 60_000;
const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Every seller route needs a signed-in person; the owning service decides what they may do.
 * The gateway does not use `@ShopRoles()` here: a shop's creator must be able to work on it before
 * their next token lists it, and the shops service knows its owner for certain (decision T-35).
 */
abstract class SellerBase {
  constructor(protected readonly caller: ServiceCaller) {}

  protected ctx(user: AuthenticatedUser, req: Request, shopId?: string) {
    return {
      actor: actorOf(user),
      ...(shopId ? { shopId } : {}),
      correlationId: correlationId(req),
    };
  }
}

@ApiTags('seller')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('seller/shops')
export class SellerShopsController extends SellerBase {
  constructor(
    caller: ServiceCaller,
    private readonly media: MediaBinder,
    private readonly links: MediaLinks,
  ) {
    super(caller);
  }

  /** The shop with links of its logo and gallery, for the seller's screens. */
  private async withImages(
    shop: ShopDto,
  ): Promise<ShopDto & { imageUrls: Record<string, ImageUrls> }> {
    const urls = await this.links.of([shop.logoMediaId, ...shop.galleryMediaIds]);
    return { ...shop, imageUrls: Object.fromEntries(urls) };
  }

  @ApiOperation({ summary: 'The shops I own or work in' })
  @ApiOkResponse({ type: SellerShopPageDto })
  @ApiListQuery(MY_SHOPS_LIST_SPEC)
  @Header('Cache-Control', 'no-store')
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @ListQueryParams(MY_SHOPS_LIST_SPEC) query: ListQuery,
  ): Promise<ShopPage> {
    return this.caller.call('shops', ShopsPatterns.listMine, { actor: actorOf(user), query });
  }

  @ApiOperation({
    summary: 'Create a shop',
    description:
      'A draft owned by me. Add the logo and gallery afterwards (uploads need the shop id).',
  })
  @ApiOkResponse({ type: SellerShopDto })
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateShopBody,
    @Req() req: Request,
  ): Promise<ShopDto> {
    return this.caller.call('shops', ShopsPatterns.create, { ...body, ...this.ctx(user, req) });
  }

  @ApiOperation({ summary: 'A shop I work in, with its branches' })
  @ApiOkResponse({ type: SellerShopDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @Header('Cache-Control', 'no-store')
  @Get(':shopId')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
  ): Promise<ShopDto> {
    const shop = await this.caller.call<ShopDto>('shops', ShopsPatterns.get, {
      actor: actorOf(user),
      shopId,
    });
    return this.withImages(shop);
  }

  @ApiOperation({
    summary: 'Change a shop',
    description:
      'Owners and managers. New logo and gallery ids are confirmed uploads for this shop.',
  })
  @ApiOkResponse({ type: SellerShopDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @Patch(':shopId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Body() body: UpdateShopBody,
    @Req() req: Request,
  ): Promise<ShopDto> {
    const target = { type: 'shop' as const, id: shopId };
    await this.media.attach({
      actorId: user.id,
      purpose: 'shop_logo',
      shopId,
      target,
      mediaIds: [body.logoMediaId],
    });
    await this.media.attach({
      actorId: user.id,
      purpose: 'shop_gallery',
      shopId,
      target,
      mediaIds: body.galleryMediaIds ?? [],
    });
    const result = await this.caller.call<UpdateShopResponse>('shops', ShopsPatterns.update, {
      ...body,
      ...this.ctx(user, req, shopId),
    });
    await this.media.release(target, result.releasedMediaIds);
    return this.withImages(result.shop);
  }

  @ApiOperation({ summary: 'Add a branch', description: 'Owners and managers; at most 50 a shop.' })
  @ApiOkResponse({ type: SellerBranchDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @Post(':shopId/branches')
  @HttpCode(201)
  addBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Body() body: CreateBranchBody,
    @Req() req: Request,
  ): Promise<BranchDto> {
    return this.caller.call('shops', ShopsPatterns.upsertBranch, {
      ...body,
      ...this.ctx(user, req, shopId),
    });
  }

  @ApiOperation({ summary: 'Change a branch' })
  @ApiOkResponse({ type: SellerBranchDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @ApiParam({ name: 'branchId', format: 'uuid' })
  @Patch(':shopId/branches/:branchId')
  updateBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() body: UpdateBranchBody,
    @Req() req: Request,
  ): Promise<BranchDto> {
    return this.caller.call('shops', ShopsPatterns.upsertBranch, {
      ...body,
      ...this.ctx(user, req, shopId),
      branchId,
    });
  }

  @ApiOperation({ summary: 'Remove a branch' })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @ApiParam({ name: 'branchId', format: 'uuid' })
  @Delete(':shopId/branches/:branchId')
  @HttpCode(204)
  async deleteBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.caller.call('shops', ShopsPatterns.deleteBranch, {
      ...this.ctx(user, req, shopId),
      branchId,
    });
  }

  @ApiOperation({
    summary: 'Set the weekly hours',
    description: 'Replaces the week; empty: closed.',
  })
  @ApiOkResponse({ type: SellerBranchDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @ApiParam({ name: 'branchId', format: 'uuid' })
  @Put(':shopId/branches/:branchId/hours')
  setHours(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() body: SetOpeningHoursBody,
    @Req() req: Request,
  ): Promise<BranchDto> {
    return this.caller.call('shops', ShopsPatterns.setOpeningHours, {
      ...body,
      ...this.ctx(user, req, shopId),
      branchId,
    });
  }

  @ApiOperation({ summary: 'Set the hours of one date (Eid, Ramadan nights)' })
  @ApiOkResponse({ type: SellerBranchDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @ApiParam({ name: 'branchId', format: 'uuid' })
  @ApiParam({ name: 'date', example: '2026-03-20' })
  @Put(':shopId/branches/:branchId/special-hours/:date')
  setSpecialHours(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('date') date: string,
    @Body() body: SetSpecialHoursBody,
    @Req() req: Request,
  ): Promise<BranchDto> {
    return this.caller.call('shops', ShopsPatterns.setSpecialHours, {
      closed: body.closed,
      opensAt: body.opensAt ?? null,
      closesAt: body.closesAt ?? null,
      label: body.label ?? null,
      ...this.ctx(user, req, shopId),
      branchId,
      date: DATE_PARAM.test(date) ? date : 'invalid',
    });
  }

  @ApiOperation({ summary: 'Go back to the weekly hours on a date' })
  @ApiOkResponse({ type: SellerBranchDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @ApiParam({ name: 'branchId', format: 'uuid' })
  @ApiParam({ name: 'date', example: '2026-03-20' })
  @Delete(':shopId/branches/:branchId/special-hours/:date')
  deleteSpecialHours(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('date') date: string,
    @Req() req: Request,
  ): Promise<BranchDto> {
    return this.caller.call('shops', ShopsPatterns.deleteSpecialHours, {
      ...this.ctx(user, req, shopId),
      branchId,
      date: DATE_PARAM.test(date) ? date : 'invalid',
    });
  }

  @ApiOperation({
    summary: 'WhatsApp, call and email taps',
    description: 'Owners and managers: by Dubai day, channel and product, for 7, 30 or 90 days.',
  })
  @ApiOkResponse({ type: ContactStatsDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @Header('Cache-Control', 'no-store')
  @Get(':shopId/contacts')
  contacts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Query() query: ContactStatsQuery,
  ): Promise<ContactStats> {
    return this.caller.call('shops', ShopsPatterns.contactStats, {
      actor: actorOf(user),
      shopId,
      days: query.days,
    });
  }
}

@ApiTags('seller')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('seller/shops/:shopId/verification')
export class SellerVerificationController extends SellerBase {
  constructor(
    caller: ServiceCaller,
    private readonly media: MediaBinder,
  ) {
    super(caller);
  }

  @ApiOperation({ summary: 'Where the shop stands: identity check, licence and listing' })
  @ApiOkResponse({ type: VerificationOverviewDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @Header('Cache-Control', 'no-store')
  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
  ): Promise<VerificationOverview> {
    return this.caller.call('shops', ShopsPatterns.getVerification, {
      actor: actorOf(user),
      shopId,
    });
  }

  @ApiOperation({
    summary: 'Start the identity check',
    description: "The owner only. Returns the provider's page; an unfinished check is resumed.",
  })
  @ApiOkResponse({ type: StartKycResponseDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @Throttle({ default: { limit: 5, ttl: MINUTE } })
  @Post('kyc')
  @HttpCode(200)
  startKyc(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Body() body: StartKycBody,
    @Req() req: Request,
  ): Promise<StartKycResponse> {
    return this.caller.call('shops', ShopsPatterns.startKyc, {
      ...body,
      ...this.ctx(user, req, shopId),
    });
  }

  @ApiOperation({
    summary: 'Ask for the identity check result',
    description: 'When the owner comes back from the provider page.',
  })
  @ApiOkResponse({ type: VerificationOverviewDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @Post('kyc/refresh')
  @HttpCode(200)
  refreshKyc(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Req() req: Request,
  ): Promise<VerificationOverview> {
    return this.caller.call('shops', ShopsPatterns.refreshKyc, this.ctx(user, req, shopId));
  }

  @ApiOperation({
    summary: 'Ask for the shop to be listed',
    description: 'The owner; needs a branch, a contact and the identity check started.',
  })
  @ApiOkResponse({ type: VerificationOverviewDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @Post('submit')
  @HttpCode(200)
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Req() req: Request,
  ): Promise<VerificationOverview> {
    return this.caller.call(
      'shops',
      ShopsPatterns.submitForVerification,
      this.ctx(user, req, shopId),
    );
  }

  @ApiOperation({
    summary: 'Send the trade licence',
    description: 'The owner; `documentMediaId` is a confirmed trade_license upload for this shop.',
  })
  @ApiOkResponse({ type: VerificationOverviewDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @Post('trade-license')
  @HttpCode(200)
  async tradeLicense(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Body() body: SubmitTradeLicenseBody,
    @Req() req: Request,
  ): Promise<VerificationOverview> {
    await this.media.attach({
      actorId: user.id,
      purpose: 'trade_license',
      shopId,
      target: { type: 'shop', id: shopId },
      mediaIds: [body.documentMediaId],
    });
    return this.caller.call('shops', ShopsPatterns.submitTradeLicense, {
      ...body,
      ...this.ctx(user, req, shopId),
    });
  }
}

@ApiTags('seller')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('seller/shops/:shopId')
export class SellerProductsController extends SellerBase {
  constructor(
    caller: ServiceCaller,
    private readonly media: MediaBinder,
    private readonly links: MediaLinks,
  ) {
    super(caller);
  }

  private async withImages(products: Product[]): Promise<SellerProductDto[]> {
    const urls = await this.links.of(products.flatMap((p) => p.imageMediaIds));
    return products.map((p) => ({
      ...p,
      images: p.imageMediaIds.flatMap((id) => (urls.has(id) ? [urls.get(id)!] : [])),
      imageUrls: Object.fromEntries(
        p.imageMediaIds.flatMap((id) => (urls.has(id) ? [[id, urls.get(id)!]] : [])),
      ),
    }));
  }

  @ApiOperation({ summary: "The shop's products, in every status" })
  @ApiOkResponse({ type: SellerProductPageDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @ApiListQuery(SHOP_PRODUCTS_LIST_SPEC)
  @Header('Cache-Control', 'no-store')
  @Get('products')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @ListQueryParams(SHOP_PRODUCTS_LIST_SPEC) query: ListQuery,
  ): Promise<SellerProductPageDto> {
    const page = await this.caller.call<ProductPage>('catalog', CatalogPatterns.listShopProducts, {
      actor: actorOf(user),
      shopId,
      query,
    });
    return { ...page, items: await this.withImages(page.items) };
  }

  @ApiOperation({ summary: 'One of the shop’s products, in any status' })
  @ApiOkResponse({ type: SellerProductDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @Header('Cache-Control', 'no-store')
  @Get('products/:productId')
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<SellerProductDto> {
    const product = await this.caller.call<Product>('catalog', CatalogPatterns.getProduct, {
      actor: actorOf(user),
      shopId,
      productId,
    });
    return (await this.withImages([product]))[0];
  }

  @ApiOperation({
    summary: 'Create a product (a draft)',
    description: 'Owners and managers. Images are confirmed product_image uploads for this shop.',
  })
  @ApiOkResponse({ type: SellerProductDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @Post('products')
  @HttpCode(201)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Body() body: CreateProductBody,
    @Req() req: Request,
  ): Promise<SellerProductDto> {
    const { imageMediaIds = [], ...fields } = body;
    // The images bind to the product, so it is made first and given them once it exists.
    let { product } = await this.caller.call<UpsertProductResponse>(
      'catalog',
      CatalogPatterns.upsertProduct,
      {
        ...fields,
        ...this.ctx(user, req, shopId),
      },
    );
    if (imageMediaIds.length) {
      await this.media.attach({
        actorId: user.id,
        purpose: 'product_image',
        shopId,
        target: { type: 'product', id: product.id },
        mediaIds: imageMediaIds,
      });
      ({ product } = await this.caller.call<UpsertProductResponse>(
        'catalog',
        CatalogPatterns.upsertProduct,
        {
          imageMediaIds,
          ...this.ctx(user, req, shopId),
          productId: product.id,
        },
      ));
    }
    return (await this.withImages([product]))[0];
  }

  @ApiOperation({
    summary: 'Change a product',
    description:
      'Changing what was reviewed (category, texts, images, declaration) reviews it again.',
  })
  @ApiOkResponse({ type: SellerProductDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @Patch('products/:productId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: UpdateProductBody,
    @Req() req: Request,
  ): Promise<SellerProductDto> {
    const target = { type: 'product' as const, id: productId };
    await this.media.attach({
      actorId: user.id,
      purpose: 'product_image',
      shopId,
      target,
      mediaIds: body.imageMediaIds ?? [],
    });
    const result = await this.caller.call<UpsertProductResponse>(
      'catalog',
      CatalogPatterns.upsertProduct,
      {
        ...body,
        ...this.ctx(user, req, shopId),
        productId,
      },
    );
    await this.media.release(target, result.releasedMediaIds);
    return (await this.withImages([result.product]))[0];
  }

  @ApiOperation({
    summary: 'Publish, hide, or back to draft',
    description: 'Food, restricted and previously rejected products go to review before they show.',
  })
  @ApiOkResponse({ type: SellerProductDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @Put('products/:productId/status')
  async setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: SetProductStatusBody,
    @Req() req: Request,
  ): Promise<SellerProductDto> {
    const product = await this.caller.call<Product>('catalog', CatalogPatterns.setProductStatus, {
      ...body,
      ...this.ctx(user, req, shopId),
      productId,
    });
    return (await this.withImages([product]))[0];
  }

  @ApiOperation({ summary: 'Where the product is: branches, stock and branch prices' })
  @ApiOkResponse({ type: SellerProductDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @Put('products/:productId/listings')
  async setListings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: SetListingsBody,
    @Req() req: Request,
  ): Promise<SellerProductDto> {
    const product = await this.caller.call<Product>('catalog', CatalogPatterns.setProductListings, {
      ...body,
      ...this.ctx(user, req, shopId),
      productId,
    });
    return (await this.withImages([product]))[0];
  }

  @ApiOperation({ summary: 'Remove a product' })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @Delete('products/:productId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Req() req: Request,
  ): Promise<void> {
    const result = await this.caller.call<RemoveProductResponse>(
      'catalog',
      CatalogPatterns.removeProduct,
      {
        ...this.ctx(user, req, shopId),
        productId,
      },
    );
    await this.media.release({ type: 'product', id: productId }, result.releasedMediaIds);
  }

  @ApiOperation({
    summary: 'Stock at a branch',
    description: 'Branch staff too: in stock and quantity of variants already listed there.',
  })
  @ApiOkResponse({ type: UpdatedCountDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @ApiParam({ name: 'branchId', format: 'uuid' })
  @Put('branches/:branchId/stock')
  updateStock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() body: UpdateStockBody,
    @Req() req: Request,
  ): Promise<{ updated: number }> {
    return this.caller.call('catalog', CatalogPatterns.updateBranchStock, {
      ...body,
      ...this.ctx(user, req, shopId),
      branchId,
    });
  }
}
