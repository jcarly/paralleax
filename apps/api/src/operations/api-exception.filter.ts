import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { getRequestId, type RequestWithId } from './request-context';

type HttpExceptionBody = {
  code?: string;
  message?: string | string[];
};
type StatusError = Error & { status?: unknown; statusCode?: unknown };

const statusCodes: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'AUTHENTICATION_REQUIRED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const requestId = getRequestId(request);
    const isHttpException = exception instanceof HttpException;
    const rawStatus =
      exception instanceof Error
        ? ((exception as StatusError).statusCode ?? (exception as StatusError).status)
        : undefined;
    const statusError =
      typeof rawStatus === 'number' && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : undefined;
    const status = isHttpException
      ? exception.getStatus()
      : (statusError ?? HttpStatus.INTERNAL_SERVER_ERROR);
    const source = isHttpException ? exception.getResponse() : undefined;
    const body = typeof source === 'object' && source !== null ? (source as HttpExceptionBody) : {};
    const message =
      status === HttpStatus.PAYLOAD_TOO_LARGE
        ? 'Request body is too large.'
        : isHttpException
          ? (body.message ?? (typeof source === 'string' ? source : exception.message))
          : 'An unexpected error occurred.';
    const code = body.code ?? statusCodes[status] ?? `HTTP_${status}`;

    if ((!isHttpException && !statusError) || status >= 500) {
      this.logger.error({
        event: 'api_error',
        requestId,
        method: request.method,
        path: request.originalUrl.split('?')[0],
        status,
        code,
        errorType: exception instanceof Error ? exception.name : 'UnknownError',
      });
    }

    response.status(status).json({ status, code, message, requestId });
  }
}
