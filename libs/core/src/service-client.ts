import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import type { ServiceName } from '@am/contracts';
import type { ServiceEndpoint } from './env';
import { isRpcErrorBody, RpcErrorBody } from './rpc-error';
import { failSpan, SpanKind, tracer, withTraceCarrier } from './telemetry/context';

/** A call to another service failed: its error body, or a timeout or a connection failure. */
export class ServiceCallError extends Error {
  constructor(
    readonly service: ServiceName,
    readonly pattern: string,
    readonly body: RpcErrorBody | null,
    cause?: unknown,
  ) {
    super(
      body
        ? `${service} ${pattern}: ${body.code} ${body.message}`
        : `${service} ${pattern}: ${(cause as Error)?.message ?? 'unavailable'}`,
    );
    this.name = 'ServiceCallError';
  }
}

/**
 * Request/response over TCP from one service to another, for the cases the conventions allow:
 * reading fresh data from the service that owns it (discovery reading shops and catalog). Changes
 * between services still go through events. Each call is a span, and the trace travels with it.
 */
export class ServiceClient {
  private readonly client: ClientProxy;

  constructor(
    readonly service: ServiceName,
    endpoint: Pick<ServiceEndpoint, 'host' | 'tcpPort'>,
    private readonly timeoutMs = 5_000,
  ) {
    this.client = ClientProxyFactory.create({
      transport: Transport.TCP,
      options: { host: endpoint.host, port: endpoint.tcpPort },
    });
  }

  call<TResult, TInput = unknown>(pattern: string, data: TInput): Promise<TResult> {
    const attributes = {
      'rpc.system': 'nest-tcp',
      'rpc.service': this.service,
      'rpc.method': pattern,
    };
    return tracer().startActiveSpan(
      pattern,
      { kind: SpanKind.CLIENT, attributes },
      async (span) => {
        try {
          return await firstValueFrom(
            this.client
              .send<TResult, TInput>(pattern, withTraceCarrier(data))
              .pipe(timeout(this.timeoutMs)),
          );
        } catch (err) {
          failSpan(span, err);
          throw new ServiceCallError(this.service, pattern, isRpcErrorBody(err) ? err : null, err);
        } finally {
          span.end();
        }
      },
    );
  }

  close(): Promise<void> {
    return Promise.resolve(this.client.close());
  }
}
