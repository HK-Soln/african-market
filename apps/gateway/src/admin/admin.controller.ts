import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthenticatedUser, CurrentUser, Roles } from '@am/auth';
import {
  CatalogPatterns,
  CategoryDto as Category,
  CategoryList,
  DiscoveryPatterns,
  EmirateList,
  KYC_DOCUMENT_KINDS,
  KycDocumentAccessResponse,
  type ListQuery,
  PRODUCT_REVIEW_LIST_SPEC,
  ProductDto as Product,
  ProductPage,
  RebuildSearchResponse,
  ShopsPatterns,
  VERIFICATION_QUEUE_LIST_SPEC,
  VerificationOverviewDto as VerificationOverview,
  VerificationQueuePage,
} from '@am/contracts';
import { actorOf } from '../common/actor';
import { ApiListQuery, ListQueryParams } from '../common/list-query';
import { MediaLinks } from '../common/media-links';
import { correlationId } from '../common/request-context';
import { ServiceCaller } from '../common/service-caller';
import {
  CategoryDto,
  CategoryListDto,
  EmirateListDto,
  ProductDto,
  ProductPageDto,
} from '../public/public.dto';
import { SellerShopPageDto, VerificationOverviewDto } from '../seller/seller.dto';
import {
  AdminCategoriesQuery,
  CreateCategoryBody,
  DecideBody,
  DecideListingBody,
  EmirateSearchBody,
  RebuildResponseDto,
  UpdateCategoryBody,
} from './admin.dto';

/** Admins only (`@Roles('admin')` here, and every service checks again). */
abstract class AdminBase {
  constructor(protected readonly caller: ServiceCaller) {}

  protected ctx(user: AuthenticatedUser, req: Request) {
    return { actor: actorOf(user), correlationId: correlationId(req) };
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@ApiCookieAuth()
@Roles('admin')
@Controller('admin')
export class AdminVerificationController extends AdminBase {
  constructor(
    caller: ServiceCaller,
    private readonly links: MediaLinks,
  ) {
    super(caller);
  }

  /** The shop's logo and gallery links, so the reviewer sees what customers would. */
  private async withImages(overview: VerificationOverview): Promise<VerificationOverviewDto> {
    const { shop } = overview;
    const urls = await this.links.of([shop.logoMediaId, ...shop.galleryMediaIds]);
    return { ...overview, shop: { ...shop, imageUrls: Object.fromEntries(urls) } };
  }

  @ApiOperation({
    summary: 'Shops submitted for listing',
    description: 'Oldest first; filter by status, or search names and slugs to find any shop.',
  })
  @ApiOkResponse({ type: SellerShopPageDto })
  @ApiListQuery(VERIFICATION_QUEUE_LIST_SPEC)
  @Header('Cache-Control', 'no-store')
  @Get('shops')
  queue(
    @CurrentUser() user: AuthenticatedUser,
    @ListQueryParams(VERIFICATION_QUEUE_LIST_SPEC) query: ListQuery,
  ): Promise<VerificationQueuePage> {
    return this.caller.call('shops', ShopsPatterns.verificationQueue, {
      actor: actorOf(user),
      query,
    });
  }

  @ApiOperation({ summary: "A shop's verification: identity summary, licence, history" })
  @ApiOkResponse({ type: VerificationOverviewDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @Header('Cache-Control', 'no-store')
  @Get('shops/:shopId/verification')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
  ): Promise<VerificationOverviewDto> {
    return this.withImages(
      await this.caller.call<VerificationOverview>('shops', ShopsPatterns.getVerification, {
        actor: actorOf(user),
        shopId,
      }),
    );
  }

  @ApiOperation({
    summary: 'Approve, reject, suspend or reinstate a listing',
    description: 'The seller sees the reason. Suspending hides the shop from search at once.',
  })
  @ApiOkResponse({ type: VerificationOverviewDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @Post('shops/:shopId/listing')
  @HttpCode(200)
  async decideListing(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Body() body: DecideListingBody,
    @Req() req: Request,
  ): Promise<VerificationOverviewDto> {
    return this.withImages(
      await this.caller.call<VerificationOverview>('shops', ShopsPatterns.decideListing, {
        ...body,
        ...this.ctx(user, req),
        shopId,
      }),
    );
  }

  @ApiOperation({ summary: 'Approve or reject a trade licence' })
  @ApiOkResponse({ type: VerificationOverviewDto })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @Post('shops/:shopId/trade-license/:requestId')
  @HttpCode(200)
  async decideLicense(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() body: DecideBody,
    @Req() req: Request,
  ): Promise<VerificationOverviewDto> {
    return this.withImages(
      await this.caller.call<VerificationOverview>('shops', ShopsPatterns.decideTradeLicense, {
        ...body,
        ...this.ctx(user, req),
        shopId,
        requestId,
      }),
    );
  }

  @ApiOperation({
    summary: 'An identity image of a KYC check',
    description:
      'Fetched fresh from the provider and streamed; the link never reaches the browser. ' +
      'Every view is recorded with the admin and the request id.',
  })
  @ApiParam({ name: 'shopId', format: 'uuid' })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiParam({ name: 'kind', enum: KYC_DOCUMENT_KINDS })
  @ApiProduces('image/jpeg', 'image/png')
  @Get('shops/:shopId/verification/:requestId/documents/:kind')
  async kycDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shopId', ParseUUIDPipe) shopId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Param('kind') kind: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const access = await this.caller.call<KycDocumentAccessResponse>(
      'shops',
      ShopsPatterns.kycDocument,
      {
        ...this.ctx(user, req),
        shopId,
        requestId,
        kind,
      },
    );
    const upstream = await fetch(access.url).catch(() => undefined);
    const type = upstream?.headers.get('content-type') ?? '';
    // Only images: whatever else the provider might answer is not passed to a browser.
    if (!upstream?.ok || !upstream.body || !/^image\/(jpeg|png|webp)$/.test(type.split(';')[0])) {
      throw new HttpException({ code: 'UPSTREAM_UNAVAILABLE', service: 'kyc' }, 503);
    }
    res.status(200).set({
      'Content-Type': type,
      'Content-Disposition': `inline; filename="${access.filename.replace(/[^\w.-]/g, '_')}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    const length = upstream.headers.get('content-length');
    if (length) res.setHeader('Content-Length', length);
    Readable.fromWeb(upstream.body as ReadableStream).pipe(res);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@ApiCookieAuth()
@Roles('admin')
@Controller('admin')
export class AdminCatalogueController extends AdminBase {
  constructor(
    caller: ServiceCaller,
    private readonly links: MediaLinks,
  ) {
    super(caller);
  }

  private async withImages(products: Product[]): Promise<ProductDto[]> {
    const urls = await this.links.of(products.flatMap((p) => p.imageMediaIds));
    return products.map((p) => ({
      ...p,
      images: p.imageMediaIds.flatMap((id) => (urls.has(id) ? [urls.get(id)!] : [])),
    }));
  }

  @ApiOperation({ summary: 'Products waiting for review (food, restricted, rejected before)' })
  @ApiOkResponse({ type: ProductPageDto })
  @ApiListQuery(PRODUCT_REVIEW_LIST_SPEC)
  @Header('Cache-Control', 'no-store')
  @Get('products/review')
  async reviewQueue(
    @CurrentUser() user: AuthenticatedUser,
    @ListQueryParams(PRODUCT_REVIEW_LIST_SPEC) query: ListQuery,
  ): Promise<ProductPageDto> {
    const page = await this.caller.call<ProductPage>('catalog', CatalogPatterns.reviewQueue, {
      actor: actorOf(user),
      query,
    });
    return { ...page, items: await this.withImages(page.items) };
  }

  @ApiOperation({
    summary: 'Approve or reject a product',
    description: 'Rejecting also takes down a public product; the seller sees the reason.',
  })
  @ApiOkResponse({ type: ProductDto })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @Post('products/:productId/decision')
  @HttpCode(200)
  async decideProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: DecideBody,
    @Req() req: Request,
  ): Promise<ProductDto> {
    const product = await this.caller.call<Product>('catalog', CatalogPatterns.decideProduct, {
      ...body,
      ...this.ctx(user, req),
      productId,
    });
    return (await this.withImages([product]))[0];
  }

  @ApiOperation({ summary: 'The category tree, inactive categories too if asked' })
  @ApiOkResponse({ type: CategoryListDto })
  @Header('Cache-Control', 'no-store')
  @Get('categories')
  categories(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AdminCategoriesQuery,
  ): Promise<CategoryList> {
    return this.caller.call('catalog', CatalogPatterns.listCategories, {
      actor: actorOf(user),
      includeInactive: query.includeInactive ?? false,
    });
  }

  @ApiOperation({
    summary: 'Add a category',
    description: 'English and Arabic names required; a child takes its parent’s kind and flags.',
  })
  @ApiOkResponse({ type: CategoryDto })
  @Post('categories')
  @HttpCode(201)
  createCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateCategoryBody,
    @Req() req: Request,
  ): Promise<Category> {
    return this.caller.call('catalog', CatalogPatterns.upsertCategory, {
      ...body,
      ...this.ctx(user, req),
    });
  }

  @ApiOperation({ summary: 'Rename, move, reorder, flag or switch off a category' })
  @ApiOkResponse({ type: CategoryDto })
  @ApiParam({ name: 'categoryId', format: 'uuid' })
  @Patch('categories/:categoryId')
  updateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() body: UpdateCategoryBody,
    @Req() req: Request,
  ): Promise<Category> {
    return this.caller.call('catalog', CatalogPatterns.upsertCategory, {
      ...body,
      ...this.ctx(user, req),
      categoryId,
    });
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@ApiCookieAuth()
@Roles('admin')
@Controller('admin')
export class AdminSearchController extends AdminBase {
  constructor(caller: ServiceCaller) {
    super(caller);
  }

  @ApiOperation({ summary: 'The emirates, with search switches and verified shop counts' })
  @ApiOkResponse({ type: EmirateListDto })
  @Header('Cache-Control', 'no-store')
  @Get('emirates')
  emirates(@CurrentUser() user: AuthenticatedUser): Promise<EmirateList> {
    return this.caller.call('discovery', DiscoveryPatterns.listEmirates, { actor: actorOf(user) });
  }

  @ApiOperation({ summary: 'Open or close customer search in an emirate' })
  @ApiOkResponse({ type: EmirateListDto })
  @ApiParam({ name: 'code', enum: ['DXB', 'AUH', 'SHJ', 'AJM', 'UAQ', 'RAK', 'FUJ'] })
  @Put('emirates/:code/search')
  setSearch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Body() body: EmirateSearchBody,
    @Req() req: Request,
  ): Promise<EmirateList> {
    return this.caller.call('discovery', DiscoveryPatterns.setEmirateSearch, {
      ...this.ctx(user, req),
      code: code.toUpperCase(),
      open: body.open,
    });
  }

  @ApiOperation({
    summary: 'Rebuild the search index from the shops and the catalogue',
    description: 'Reads every verified shop again; can take a while.',
  })
  @ApiOkResponse({ type: RebuildResponseDto })
  @Post('search/rebuild')
  @HttpCode(200)
  rebuild(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<RebuildSearchResponse> {
    // A rebuild reads every shop; it outlasts an ordinary call.
    return this.caller.call('discovery', DiscoveryPatterns.rebuild, this.ctx(user, req), 600_000);
  }
}
