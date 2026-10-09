import { RpcException } from '@nestjs/microservices';

/**
 * Error shape every service returns over TCP. The gateway maps `status` to the
 * HTTP status and passes `code` through so frontends can show translated messages.
 */
export interface RpcErrorBody {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

export class AppRpcException extends RpcException {
  constructor(body: RpcErrorBody) {
    super(body);
  }

  static notFound(code: string, message = 'Not found') {
    return new AppRpcException({ status: 404, code, message });
  }
  static forbidden(code: string, message = 'Forbidden') {
    return new AppRpcException({ status: 403, code, message });
  }
  static badRequest(code: string, message: string, details?: unknown) {
    return new AppRpcException({ status: 400, code, message, details });
  }
  static conflict(code: string, message: string) {
    return new AppRpcException({ status: 409, code, message });
  }
}

export const isRpcErrorBody = (value: unknown): value is RpcErrorBody =>
  typeof value === 'object' && value !== null && 'status' in value && 'code' in value;
