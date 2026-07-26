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

const statusCodes: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'AUTHENTICATION_REQUIRED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
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
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const source = isHttpException ? exception.getResponse() : undefined;
    const body = typeof source === 'object' && source !== null ? (source as HttpExceptionBody) : {};
    const message = isHttpException
      ? (body.message ?? (typeof source === 'string' ? source : exception.message))
      : 'An unexpected error occurred.';
    const code = body.code ?? statusCodes[status] ?? `HTTP_${status}`;

    if (!isHttpException || status >= 500) {
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
