import {
  BadRequestException,
  type ArgumentsHost,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiExceptionFilter } from './api-exception.filter';
import type { RequestWithId } from './request-context';

function host(request: Partial<RequestWithId> = {}) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const response = { status } as unknown as Response;
  const value = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'POST',
        originalUrl: '/api/stories?private=value',
        requestId: 'request-1',
        ...request,
      }),
      getResponse: () => response,
    }),
  } as ArgumentsHost;
  return { host: value, status, json };
}

describe('ApiExceptionFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes validation errors with a stable code and request id', () => {
    const response = host();

    new ApiExceptionFilter().catch(
      new BadRequestException({ message: ['title must be a string'] }),
      response.host,
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith({
      status: HttpStatus.BAD_REQUEST,
      code: 'BAD_REQUEST',
      message: ['title must be a string'],
      requestId: 'request-1',
    });
  });

  it('preserves an explicit operational error code', () => {
    const response = host();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    new ApiExceptionFilter().catch(
      new ServiceUnavailableException({
        code: 'DATABASE_NOT_READY',
        message: 'The database is not ready.',
      }),
      response.host,
    );

    expect(response.json).toHaveBeenCalledWith({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      code: 'DATABASE_NOT_READY',
      message: 'The database is not ready.',
      requestId: 'request-1',
    });
  });

  it('normalizes parser payload limits without exposing parser details', () => {
    const response = host();
    const error = Object.assign(new Error('entity.too.large: raw parser detail'), {
      status: HttpStatus.PAYLOAD_TOO_LARGE,
    });

    new ApiExceptionFilter().catch(error, response.host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(response.json).toHaveBeenCalledWith({
      status: HttpStatus.PAYLOAD_TOO_LARGE,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body is too large.',
      requestId: 'request-1',
    });
  });

  it('hides unexpected error details and logs only safe request metadata', () => {
    const response = host();
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    new ApiExceptionFilter().catch(
      new Error('password=secret; SELECT sensitive_text'),
      response.host,
    );

    expect(response.json).toHaveBeenCalledWith({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'HTTP_500',
      message: 'An unexpected error occurred.',
      requestId: 'request-1',
    });
    expect(error).toHaveBeenCalledWith({
      event: 'api_error',
      requestId: 'request-1',
      method: 'POST',
      path: '/api/stories',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'HTTP_500',
      errorType: 'Error',
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain('password=secret');
  });
});
