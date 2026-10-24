import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Validate,
  ValidateIf,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import type { Request } from 'express';
import { AuthenticatedUser, CurrentUser, Public, Roles } from '@am/auth';
import {
  CatalogPatterns,
  DecideReportResponse,
  type ListQuery,
  type ProductReportPage,
  REPORT_DETAILS_MAX,
  REPORT_LIST_SPEC,
  REPORT_OTHER_MIN,
  REPORT_OUTCOMES,
  REPORT_REASONS,
  REPORT_STATUSES,
  type ReportOutcome,
  type ReportReason,
  type ReportStatus,
  type ShopReportPage,
  ShopsPatterns,
  SubmitReportResponse,
} from '@am/contracts';
import { actorOf } from '../common/actor';
import { ApiListQuery, ListQueryParams } from '../common/list-query';
import { correlationId } from '../common/request-context';
import { ServiceCaller } from '../common/service-caller';
import { LocalizedTextDto } from '../public/public.dto';

@ValidatorConstraint({ name: 'oneListing' })
class OneListing implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const report = args.object as SubmitReportDto;
    return report.productId === undefined;
  }

  defaultMessage(): string {
    return 'send shopId or productId, not both';
  }
}

export class SubmitReportDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'The shop reported; or send productId' })
  // Required unless productId is sent, and never with it.
  @ValidateIf((r: SubmitReportDto) => r.productId === undefined || r.shopId !== undefined)
  @IsUUID()
  @Validate(OneListing)
  shopId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'The product reported; or send shopId' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty({ enum: REPORT_REASONS })
  @IsIn(REPORT_REASONS)
  reason!: ReportReason;

  @ApiPropertyOptional({
    maxLength: REPORT_DETAILS_MAX,
    description: `What is wrong; at least ${REPORT_OTHER_MIN} characters for "other"`,
  })
  @IsOptional()
  @IsString()
  @MaxLength(REPORT_DETAILS_MAX)
  details?: string;

  @ApiProperty({
    example: 'k3J9xQ2mZpL8',
    description: "The app's random visitor id (8-64 letters, digits, - or _), kept on the device",
  })
  @Matches(/^[A-Za-z0-9_-]{8,64}$/)
  sessionId!: string;
}

export class SubmitReportResponseDto {
  @ApiProperty({ description: 'False when this visitor already had an open report on it' })
  recorded!: boolean;
}

class ReportBaseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) shopId!: string;
  @ApiProperty({ enum: REPORT_REASONS }) reason!: ReportReason;
  @ApiProperty({ type: String, nullable: true }) details!: string | null;
  @ApiProperty({ description: 'Sent while signed in; who it was is never shown' })
  signedIn!: boolean;
  @ApiProperty({ enum: REPORT_STATUSES }) status!: ReportStatus;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) decidedAt!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'For admins only' })
  decisionNote!: string | null;
}

export class ShopReportDto extends ReportBaseDto {
  @ApiProperty() shopName!: string;
  @ApiProperty() shopSlug!: string;
}

export class ProductReportDto extends ReportBaseDto {
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty({ type: LocalizedTextDto }) productTitle!: LocalizedTextDto;
}

export class ShopReportPageDto {
  @ApiProperty({ type: [ShopReportDto] }) items!: ShopReportDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
  @ApiProperty({ type: String, nullable: true }) prevCursor!: string | null;
}

export class ProductReportPageDto {
  @ApiProperty({ type: [ProductReportDto] }) items!: ProductReportDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
  @ApiProperty({ type: String, nullable: true }) prevCursor!: string | null;
}

export class DecideReportBody {
  @ApiProperty({
    enum: REPORT_OUTCOMES,
    description: '`resolved`: something was done about it; `dismissed`: nothing was wrong',
  })
  @IsIn(REPORT_OUTCOMES)
  outcome!: ReportOutcome;

  @ApiPropertyOptional({ maxLength: REPORT_DETAILS_MAX, description: 'For other admins' })
  @IsOptional()
  @IsString()
  @MaxLength(REPORT_DETAILS_MAX)
  note?: string;
}

export class DecideReportResponseDto {
  @ApiProperty({ description: 'Open reports closed: this one and the others on the same listing' })
  closed!: number;
}

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly caller: ServiceCaller) {}

  @ApiOperation({
    summary: 'Report a shop or a product',
    description:
      'Public; a signed-in customer’s report carries their account, never shown to the seller. ' +
      'Send shopId or productId. One open report per visitor and listing: a repeat is accepted ' +
      'and not kept.',
  })
  @ApiAcceptedResponse({ type: SubmitReportResponseDto })
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  @HttpCode(202)
  submit(
    @Body() body: SubmitReportDto,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() req: Request,
  ): Promise<SubmitReportResponse> {
    const { shopId, productId, ...report } = body;
    const common = { ...report, userId: user?.id, correlationId: correlationId(req) };
    return productId
      ? this.caller.call('catalog', CatalogPatterns.submitReport, { ...common, productId })
      : this.caller.call('shops', ShopsPatterns.submitReport, { ...common, shopId });
  }
}

/** The reports queue: shops' reports are kept by shops, products' by catalog. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly caller: ServiceCaller) {}

  @ApiOperation({ summary: 'Reports on shops', description: 'Oldest first; filter by status.' })
  @ApiOkResponse({ type: ShopReportPageDto })
  @ApiListQuery(REPORT_LIST_SPEC)
  @Header('Cache-Control', 'no-store')
  @Get('shops')
  shops(
    @CurrentUser() user: AuthenticatedUser,
    @ListQueryParams(REPORT_LIST_SPEC) query: ListQuery,
  ): Promise<ShopReportPage> {
    return this.caller.call('shops', ShopsPatterns.listReports, { actor: actorOf(user), query });
  }

  @ApiOperation({ summary: 'Reports on products', description: 'Oldest first; filter by status.' })
  @ApiOkResponse({ type: ProductReportPageDto })
  @ApiListQuery(REPORT_LIST_SPEC)
  @Header('Cache-Control', 'no-store')
  @Get('products')
  products(
    @CurrentUser() user: AuthenticatedUser,
    @ListQueryParams(REPORT_LIST_SPEC) query: ListQuery,
  ): Promise<ProductReportPage> {
    return this.caller.call('catalog', CatalogPatterns.listReports, {
      actor: actorOf(user),
      query,
    });
  }

  @ApiOperation({
    summary: 'Close a report on a shop',
    description: 'Closes every open report on the shop. Suspending it is a separate action.',
  })
  @ApiOkResponse({ type: DecideReportResponseDto })
  @ApiParam({ name: 'reportId', format: 'uuid' })
  @Post('shops/:reportId/decision')
  @HttpCode(200)
  decideShop(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() body: DecideReportBody,
    @Req() req: Request,
  ): Promise<DecideReportResponse> {
    return this.caller.call('shops', ShopsPatterns.decideReport, {
      ...body,
      reportId,
      actor: actorOf(user),
      correlationId: correlationId(req),
    });
  }

  @ApiOperation({
    summary: 'Close a report on a product',
    description: 'Closes every open report on the product. Rejecting it is a separate action.',
  })
  @ApiOkResponse({ type: DecideReportResponseDto })
  @ApiParam({ name: 'reportId', format: 'uuid' })
  @Post('products/:reportId/decision')
  @HttpCode(200)
  decideProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() body: DecideReportBody,
    @Req() req: Request,
  ): Promise<DecideReportResponse> {
    return this.caller.call('catalog', CatalogPatterns.decideReport, {
      ...body,
      reportId,
      actor: actorOf(user),
      correlationId: correlationId(req),
    });
  }
}
