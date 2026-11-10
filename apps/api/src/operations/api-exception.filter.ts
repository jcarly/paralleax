import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { captureApiException } from '../observability/sentry';
import { getRequestId, type RequestWithId } from './request-context';

type HttpExceptionBody = {
  code?: string;
  message?: string | string[];
  details?: unknown;
};

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
const payloadTooLargeStatus: number = HttpStatus.PAYLOAD_TOO_LARGE;

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const requestId = getRequestId(request);
    const resolved = resolveApiException(exception);

    if (shouldCaptureException(resolved)) {
      logApiException({ logger: this.logger, exception, request, requestId, resolved });
    }

    response.status(resolved.status).json({
      status: resolved.status,
      code: resolved.code,
      message: resolved.message,
      requestId,
      ...(resolved.details === undefined ? {} : { details: resolved.details }),
    });
  }
}

type ResolvedApiException = {
  isHttpException: boolean;
  statusError: number | undefined;
  status: number;
  code: string;
  message: string | string[];
  details: unknown;
};

function resolveApiException(exception: unknown): ResolvedApiException {
  const { isHttpException, statusError, status } = resolveExceptionStatus(exception);
  const source = exception instanceof HttpException ? exception.getResponse() : undefined;
  const body = typeof source === 'object' && source !== null ? (source as HttpExceptionBody) : {};
  return {
    isHttpException,
    statusError,
    status,
    code: body.code ?? statusCodes[status] ?? `HTTP_${status}`,
    message: resolveExceptionMessage(exception, source, body, status),
    details: body.details,
  };
}

function resolveExceptionStatus(exception: unknown) {
  const isHttpException = exception instanceof HttpException;
  const statusError = readStatusError(exception);
  return {
    isHttpException,
    statusError,
    status: isHttpException
      ? exception.getStatus()
      : (statusError ?? HttpStatus.INTERNAL_SERVER_ERROR),
  };
}

function readStatusError(exception: unknown) {
  if (!(exception instanceof Error)) {
    return undefined;
  }
  const statusCode = 'statusCode' in exception ? exception.statusCode : undefined;
  const status = 'status' in exception ? exception.status : undefined;
  const rawStatus = statusCode ?? status;
  if (typeof rawStatus !== 'number' || rawStatus < 400 || rawStatus > 599) {
    return undefined;
  }
  return rawStatus;
}

function resolveExceptionMessage(
  exception: unknown,
  source: string | object | undefined,
  body: HttpExceptionBody,
  status: number,
): string | string[] {
  if (status === payloadTooLargeStatus) {
    return 'Request body is too large.';
  }
  if (!(exception instanceof HttpException)) {
    return 'An unexpected error occurred.';
  }
  return body.message ?? (typeof source === 'string' ? source : exception.message);
}

function shouldCaptureException(exception: ResolvedApiException) {
  return (!exception.isHttpException && !exception.statusError) || exception.status >= 500;
}

function logApiException({
  logger,
  exception,
  request,
  requestId,
  resolved,
}: {
  logger: Logger;
  exception: unknown;
  request: RequestWithId;
  requestId: string;
  resolved: ResolvedApiException;
}) {
  captureApiException(exception, {
    requestId,
    method: request.method,
    status: resolved.status,
    code: resolved.code,
  });
  logger.error({
    event: 'api_error',
    requestId,
    method: request.method,
    path: request.originalUrl.split('?')[0],
    status: resolved.status,
    code: resolved.code,
    errorType: exception instanceof Error ? exception.name : 'UnknownError',
  });
}
