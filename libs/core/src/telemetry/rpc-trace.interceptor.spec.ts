import { Controller, INestMicroservice, Module } from '@nestjs/common';
import { APP_INTERCEPTOR, NestFactory } from '@nestjs/core';
import {
  ClientProxy,
  ClientProxyFactory,
  MessagePattern,
  Payload,
  Transport,
} from '@nestjs/microservices';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { firstValueFrom } from 'rxjs';
import { AppRpcException } from '../rpc-error';
import { currentTrace, tracer, withTraceCarrier } from './context';
import { reportError } from './report';
import { RpcTraceInterceptor } from './rpc-trace.interceptor';

jest.mock('./report', () => ({ reportError: jest.fn() }));

@Controller()
class EchoController {
  @MessagePattern('test.echo')
  async echo(@Payload() data: unknown) {
    await new Promise((resolve) => setTimeout(resolve, 5)); // the trace survives an await
    return { data, trace: currentTrace() };
  }

  @MessagePattern('test.fail')
  fail(): never {
    throw new Error('boom');
  }

  @MessagePattern('test.not-found')
  notFound(): never {
    throw AppRpcException.notFound('THING_NOT_FOUND');
  }
}

@Module({
  controllers: [EchoController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: RpcTraceInterceptor }],
})
class EchoModule {}

describe('RpcTraceInterceptor (Nest TCP)', () => {
  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  const port = 45_000 + Math.floor(Math.random() * 10_000);
  let server: INestMicroservice;
  let client: ClientProxy;

  beforeAll(async () => {
    provider.register();
    server = await NestFactory.createMicroservice(EchoModule, {
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port },
      logger: false,
    });
    await server.listen();
    client = ClientProxyFactory.create({
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port },
    });
    await client.connect();
  });

  afterAll(async () => {
    client?.close();
    await server?.close();
    await provider.shutdown();
  });

  beforeEach(() => {
    exporter.reset();
    jest.mocked(reportError).mockClear();
  });

  /** A call made inside a request span, as the gateway's ServiceCaller makes it. */
  const callInRequest = (pattern: string, data: unknown) =>
    tracer().startActiveSpan('request', async (span) => {
      try {
        const result = await firstValueFrom(client.send(pattern, withTraceCarrier(data)));
        return { result, request: span.spanContext() };
      } finally {
        span.end();
      }
    });

  it('runs the handler in the caller’s trace, without the trace context in its payload', async () => {
    const { result, request } = await callInRequest('test.echo', { a: 1 });

    expect(result.data).toEqual({ a: 1 });
    expect(result.trace.traceId).toBe(request.traceId);
    const handled = exporter.getFinishedSpans().find((s) => s.name === 'test.echo');
    expect(handled).toMatchObject({
      kind: SpanKind.SERVER,
      attributes: { 'rpc.method': 'test.echo' },
    });
    expect(handled?.parentSpanContext?.spanId).toBe(request.spanId);
    expect(result.trace.spanId).toBe(handled?.spanContext().spanId);
  });

  it('starts a trace of its own for a call that brings none', async () => {
    const result = await firstValueFrom(client.send('test.echo', { a: 1 }));
    expect(result.data).toEqual({ a: 1 });
    expect(result.trace.traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('marks the span failed and reports an unexpected error', async () => {
    await expect(callInRequest('test.fail', {})).rejects.toBeDefined();
    const span = exporter.getFinishedSpans().find((s) => s.name === 'test.fail');
    expect(span?.status.code).toBe(SpanStatusCode.ERROR);
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }), {
      pattern: 'test.fail',
    });
  });

  it('treats a 4xx as an answer, not a failure', async () => {
    await expect(callInRequest('test.not-found', {})).rejects.toMatchObject({
      code: 'THING_NOT_FOUND',
    });
    const span = exporter.getFinishedSpans().find((s) => s.name === 'test.not-found');
    expect(span?.status.code).toBe(SpanStatusCode.UNSET);
    expect(reportError).not.toHaveBeenCalled();
  });
});
