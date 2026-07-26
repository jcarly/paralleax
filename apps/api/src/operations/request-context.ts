import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const requestIdPattern = /^[A-Za-z0-9._:-]{1,100}$/;
const requestLogger = new Logger('HttpRequest');

export type RequestWithId = Request & { requestId?: string };

export function getRequestId(request: RequestWithId): string {
  return request.requestId ?? 'unknown';
}

export function requestContextMiddleware(
  request: RequestWithId,
  response: Response,
  next: NextFunction,
) {
  const suppliedRequestId = request.header('x-request-id');
  const requestId =
    suppliedRequestId && requestIdPattern.test(suppliedRequestId)
      ? suppliedRequestId
      : randomUUID();
  const startedAt = performance.now();

  request.requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  response.on('finish', () => {
    const event = {
      event: 'http_request',
      requestId,
      method: request.method,
      path: request.originalUrl.split('?')[0],
      status: response.statusCode,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    };
    if (response.statusCode >= 500) requestLogger.error(event);
    else if (response.statusCode >= 400) requestLogger.warn(event);
    else requestLogger.log(event);
  });

  next();
}
