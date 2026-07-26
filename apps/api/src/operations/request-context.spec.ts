import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { getRequestId, requestContextMiddleware, type RequestWithId } from './request-context';

describe('request context', () => {
  const next = jest.fn() as NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('preserves a safe incoming request id and exposes it in the response', () => {
    let finish: (() => void) | undefined;
    const request = {
      header: jest.fn(() => 'gateway-request-1'),
      method: 'GET',
      originalUrl: '/api/stories?token=hidden',
    } as unknown as RequestWithId;
    const response = {
      statusCode: 200,
      setHeader: jest.fn(),
      on: jest.fn((event: string, callback: () => void) => {
        if (event === 'finish') finish = callback;
      }),
    } as unknown as Response;
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();

    requestContextMiddleware(request, response, next);
    finish?.();

    expect(request.requestId).toBe('gateway-request-1');
    expect(getRequestId(request)).toBe('gateway-request-1');
    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', 'gateway-request-1');
    expect(next).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'http_request',
        requestId: 'gateway-request-1',
        path: '/api/stories',
        status: 200,
      }),
    );
  });

  it('replaces unsafe request ids and logs failed requests without query strings', () => {
    let finish: (() => void) | undefined;
    const request = {
      header: jest.fn(() => 'unsafe request id'),
      method: 'POST',
      originalUrl: '/api/stories?secret=value',
    } as unknown as RequestWithId;
    const response = {
      statusCode: 503,
      setHeader: jest.fn(),
      on: jest.fn((_: string, callback: () => void) => {
        finish = callback;
      }),
    } as unknown as Response;
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    requestContextMiddleware(request, response, next);
    finish?.();

    expect(request.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/stories', status: 503 }),
    );
  });

  it('uses a safe fallback before middleware initialization', () => {
    expect(getRequestId({} as Request)).toBe('unknown');
  });
});
