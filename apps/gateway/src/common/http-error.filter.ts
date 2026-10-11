import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
  ValidationError,
} from '@nestjs/common';
import type { Response } from 'express';

/** Codes for errors that Nest or a guard raised without one of ours. */
const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'AUTH_REQUIRED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
};

const DEFAULT_MESSAGES: Record<number, string> = {
  429: 'Too many requests; try again shortly',
};

interface ValidationIssue {
  path: string;
  message: string;
}

function flatten(errors: ValidationError[], parent = ''): ValidationIssue[] {
  return errors.flatMap((error) => {
    const path = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({ path, message }));
    return [...own, ...flatten(error.children ?? [], path)];
  });
}

/** Gives the ValidationPipe the same error shape services use for a bad payload. */
export const validationException = (errors: ValidationError[]) =>
  new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Invalid request',
    details: { issues: flatten(errors) },
  });

/**
 * Every error leaves the gateway as `{ statusCode, code, message, details? }`. `code` is stable;
 * frontends translate it and never show `message` to people.
 */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpError');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (!(exception instanceof HttpException)) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      res.status(500).json({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal error' });
      return;
    }

    const statusCode = exception.getStatus();
    const raw = exception.getResponse();
    const body = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    const code = typeof body.code === 'string' ? body.code : DEFAULT_CODES[statusCode];
    const message =
      typeof body.code === 'string' && typeof body.message === 'string'
        ? body.message
        : (DEFAULT_MESSAGES[statusCode] ?? (typeof raw === 'string' ? raw : exception.message));

    res.status(statusCode).json({
      statusCode,
      code: code ?? (statusCode >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR'),
      message,
      ...(body.details !== undefined ? { details: body.details } : {}),
    });
  }
}
