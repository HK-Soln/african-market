import { Controller, Get, Header, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedUser, CurrentUser, Public } from '@am/auth';
import {
  CatalogPatterns,
  CategoryList,
  DiscoveryPatterns,
  EmirateList,
  type ListQuery,
  ProductDto as Product,
  ProductPage,
  SearchMapResponse,
  SearchNearbyResponse,
  SHOP_PRODUCTS_LIST_SPEC,
  PublicShopSourceDto,
  ShopDto,
  ShopsPatterns,
  SitemapPage,
} from '@am/contracts';
import { optionalActor } from '../common/actor';
import { ApiListQuery, ListQueryParams } from '../common/list-query';
import { MediaLinks } from '../common/media-links';
import { ServiceCaller } from '../common/service-caller';
import {
  CategoryListDto,
  EmirateListDto,
  ProductDto,
  ProductPageDto,
  PublicShopDto,
  SearchMapQuery,
  SearchMapResponseDto,
  SearchNearbyQuery,
  SearchNearbyResponseDto,
  SitemapPageDto,
  SitemapQuery,
} from './public.dto';

const MINUTE = 60_000;

/** Every product's images as links, in the order the seller set. */
async function withImages(links: MediaLinks, products: Product[]): Promise<ProductDto[]> {
  const urls = await links.of(products.flatMap((p) => p.imageMediaIds));
  return products.map((p) => ({
    ...p,
    images: p.imageMediaIds.flatMap((id) => (urls.has(id) ? [urls.get(id)!] : [])),
  }));
}

/** A verified shop as anyone may see it: no verification details or owner. */
async function publicShop(links: MediaLinks, shop: PublicShopSourceDto): Promise<PublicShopDto> {
  const urls = await links.of([shop.logoMediaId, ...shop.galleryMediaIds]);
  return {
    id: shop.id,
    name: shop.name,
    slug: shop.slug,
    description: shop.description,
    logo: (shop.logoMediaId && urls.get(shop.logoMediaId)) || null,
    gallery: shop.galleryMediaIds.flatMap((id) => (urls.has(id) ? [urls.get(id)!] : [])),
    categoryIds: shop.categoryIds,
    originCountries: shop.originCountries,
    contactWhatsapp: shop.contactWhatsapp,
    contactPhone: shop.contactPhone,
    contactEmail: shop.contactEmail,
    checkoutEnabled: shop.checkoutEnabled,
    codEnabled: shop.codEnabled,
    branches: shop.branches.map(({ shopId: _shopId, ...branch }) => branch),
    seller: shop.licensedSeller ?? null,
  };
}

@ApiTags('search')
@Controller()
export class SearchController {
  constructor(private readonly caller: ServiceCaller) {}

  @ApiOperation({
    summary: 'Shops near a point',
    description:
      'Delivery: branches that deliver to the point. Pickup: branches within the travel radius. ' +
      'Ranked by distance, open now, rating, listing completeness and text match; only emirates ' +
      'where search is open. Pass `nextCursor` back as `cursor` for the next page.',
  })
  @ApiOkResponse({ type: SearchNearbyResponseDto })
  @Public()
  @Throttle({ default: { limit: 60, ttl: MINUTE } })
  @Header('Cache-Control', 'no-store')
  @Get('search/nearby')
  nearby(@Query() query: SearchNearbyQuery): Promise<SearchNearbyResponse> {
    return this.caller.call<SearchNearbyResponse>('discovery', DiscoveryPatterns.searchNearby, {
      ...query,
    });
  }

  @ApiOperation({
    summary: 'Map markers in a box',
    description: 'Single pins from zoom 14, clusters below; at most 500 markers.',
  })
  @ApiOkResponse({ type: SearchMapResponseDto })
  @Public()
  @Throttle({ default: { limit: 120, ttl: MINUTE } })
  @Header('Cache-Control', 'no-store')
  @Get('search/map')
  map(@Query() query: SearchMapQuery): Promise<SearchMapResponse> {
    return this.caller.call<SearchMapResponse>('discovery', DiscoveryPatterns.searchMap, {
      ...query,
    });
  }

  @ApiOperation({
    summary: 'Sitemap entries',
    description:
      'Verified shops or their live products, 1,000 a page, for the web sitemap. Pass ' +
      '`nextCursor` back as `cursor` for the next page.',
  })
  @ApiOkResponse({ type: SitemapPageDto })
  @Public()
  @Header('Cache-Control', 'public, max-age=300')
  @Get('sitemap')
  sitemap(@Query() query: SitemapQuery): Promise<SitemapPage> {
    return this.caller.call<SitemapPage>('discovery', DiscoveryPatterns.sitemap, { ...query });
  }

  @ApiOperation({ summary: 'The seven emirates, with whether search is open in each' })
  @ApiOkResponse({ type: EmirateListDto })
  @Public()
  @Header('Cache-Control', 'public, max-age=60')
  @Get('emirates')
  emirates(): Promise<EmirateList> {
    return this.caller.call<EmirateList>('discovery', DiscoveryPatterns.listEmirates, {});
  }
}

@ApiTags('catalogue')
@Controller()
export class CatalogueController {
  constructor(
    private readonly caller: ServiceCaller,
    private readonly links: MediaLinks,
  ) {}

  @ApiOperation({ summary: 'The category tree (active categories, parents first)' })
  @ApiOkResponse({ type: CategoryListDto })
  @Public()
  @Header('Cache-Control', 'public, max-age=300')
  @Get('categories')
  categories(): Promise<CategoryList> {
    return this.caller.call<CategoryList>('catalog', CatalogPatterns.listCategories, {});
  }

  @ApiOperation({
    summary: 'A product',
    description:
      'An active product of a verified shop; the shop’s members and admins see it in any status.',
  })
  @ApiOkResponse({ type: ProductDto })
  @ApiParam({ name: 'id', format: 'uuid' })
  @Public()
  @Get('products/:id')
  async product(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<ProductDto> {
    const product = await this.caller.call<Product>('catalog', CatalogPatterns.getProduct, {
      productId: id,
      actor: optionalActor(user),
    });
    return (await withImages(this.links, [product]))[0];
  }
}

@ApiTags('shops')
@Controller('shops')
export class PublicShopsController {
  constructor(
    private readonly caller: ServiceCaller,
    private readonly links: MediaLinks,
  ) {}

  @ApiOperation({ summary: 'A verified shop by its slug, with its branches' })
  @ApiOkResponse({ type: PublicShopDto })
  @ApiParam({ name: 'slug', example: 'lagos-kitchen' })
  @Public()
  @Header('Cache-Control', 'public, max-age=60')
  @Get(':slug')
  async shop(@Param('slug') slug: string): Promise<PublicShopDto> {
    const shop = await this.caller.call<PublicShopSourceDto>('shops', ShopsPatterns.getBySlug, {
      slug,
    });
    return publicShop(this.links, shop);
  }

  @ApiOperation({ summary: 'A verified shop’s active products, a page at a time' })
  @ApiOkResponse({ type: ProductPageDto })
  @ApiParam({ name: 'slug', example: 'lagos-kitchen' })
  @ApiListQuery(SHOP_PRODUCTS_LIST_SPEC)
  @Public()
  @Get(':slug/products')
  async products(
    @Param('slug') slug: string,
    @ListQueryParams(SHOP_PRODUCTS_LIST_SPEC) query: ListQuery,
  ): Promise<ProductPageDto> {
    const shop = await this.caller.call<ShopDto>('shops', ShopsPatterns.getBySlug, { slug });
    // No actor: the public page shows what customers see, even to the shop's own staff.
    const page = await this.caller.call<ProductPage>('catalog', CatalogPatterns.listShopProducts, {
      shopId: shop.id,
      query,
    });
    return { ...page, items: await withImages(this.links, page.items) };
  }
}
