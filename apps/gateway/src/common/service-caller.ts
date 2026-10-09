import { HttpException, Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ServiceName, serviceClientToken } from '@am/contracts';
import { APP_ENV, isRpcErrorBody } from '@am/core';
import type { GatewayEnv } from '../env';

/**
 * The single way controllers call services. Applies the timeout and turns a
 * service's RpcErrorBody into the matching HTTP error, keeping its `code`.
 */
@Injectable()
export class ServiceCaller {
  constructor(
    private readonly moduleRef: ModuleRef,
    @Inject(APP_ENV) private readonly env: GatewayEnv,
  ) {}

  async call<TResult, TInput = unknown>(
    service: ServiceName,
    pattern: string,
    data: TInput,
    timeoutMs?: number,
  ): Promise<TResult> {
    const client = this.moduleRef.get<ClientProxy>(serviceClientToken(service), { strict: false });
    try {
      return await firstValueFrom(
        client
          .send<TResult, TInput>(pattern, data)
          .pipe(timeout(timeoutMs ?? this.env.SERVICE_TIMEOUT_MS)),
      );
    } catch (err) {
      if (isRpcErrorBody(err))
        throw new HttpException(
          { code: err.code, message: err.message, details: err.details },
          err.status,
        );
      if ((err as Error)?.name === 'TimeoutError')
        throw new HttpException({ code: 'UPSTREAM_TIMEOUT', service }, 504);
      throw new HttpException({ code: 'UPSTREAM_UNAVAILABLE', service }, 503);
    }
  }
}
