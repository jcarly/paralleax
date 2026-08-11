import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { AppConfigService } from '../config/app-config.service';
import { OriginGuard } from './origin.guard';

function requestContext(method: string, origin?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        header: (name: string) => (name === 'origin' ? origin : undefined),
      }),
    }),
  } as ExecutionContext;
}

describe('OriginGuard', () => {
  const productionConfig = {
    nodeEnvironment: 'production',
    corsOrigin: 'https://app.example.com',
  } as AppConfigService;

  it('allows safe requests and exact production origins', () => {
    const guard = new OriginGuard(productionConfig);
    expect(guard.canActivate(requestContext('GET'))).toBe(true);
    expect(guard.canActivate(requestContext('POST', 'https://app.example.com'))).toBe(true);
  });

  it('rejects missing or unexpected origins for production mutations', () => {
    const guard = new OriginGuard(productionConfig);
    expect(() => guard.canActivate(requestContext('POST'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(requestContext('PATCH', 'https://evil.example.com'))).toThrow(
      'Request origin is not allowed',
    );
  });

  it('does not constrain local and test requests', () => {
    const guard = new OriginGuard({ nodeEnvironment: 'test' } as AppConfigService);
    expect(guard.canActivate(requestContext('DELETE'))).toBe(true);
  });
});
