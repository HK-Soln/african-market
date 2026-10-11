import { Controller, Get, Module, Query, type Type } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Public } from '@am/auth';
import { IdentityTestPatterns } from '@am/contracts';
import { ServiceCaller } from '../common/service-caller';

class LastOtpQuery {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  phone!: string;
}

/**
 * `GET /api/v1/test/otp?phone=`: the code an end-to-end test was "sent". It hands out sign-in
 * codes, so it is only registered by `testSupportModules('test')`; with any other NODE_ENV the
 * route does not exist, and identity has no handler for it either.
 */
@ApiExcludeController()
@Public()
@Controller('test')
export class TestSupportController {
  constructor(private readonly caller: ServiceCaller) {}

  @Get('otp')
  lastOtp(@Query() query: LastOtpQuery): Promise<{ code: string | null }> {
    return this.caller.call('identity', IdentityTestPatterns.lastOtp, { phone: query.phone });
  }
}

@Module({ controllers: [TestSupportController] })
export class TestSupportModule {}

/** The test-only modules to load: all of them under NODE_ENV=test, none otherwise. */
export const testSupportModules = (nodeEnv: string | undefined): Type<unknown>[] =>
  nodeEnv === 'test' ? [TestSupportModule] : [];
