import { ForbiddenException } from '@nestjs/common';
import { assertRegistrationAllowed } from './registration-policy';

describe('registration policy', () => {
  it('allows open registration without an access code', () => {
    expect(() => assertRegistrationAllowed('open', undefined, undefined)).not.toThrow();
  });

  it('requires the configured access code in private alpha mode', () => {
    expect(() => assertRegistrationAllowed('access-code', 'correct-alpha-code', undefined)).toThrow(
      ForbiddenException,
    );
    expect(() =>
      assertRegistrationAllowed('access-code', 'correct-alpha-code', 'wrong-alpha-code'),
    ).toThrow('A valid invitation code is required');
    expect(() =>
      assertRegistrationAllowed('access-code', 'correct-alpha-code', 'correct-alpha-code'),
    ).not.toThrow();
  });

  it('blocks account creation when registration is closed', () => {
    expect(() => assertRegistrationAllowed('closed', undefined, undefined)).toThrow(
      'Registration is closed',
    );
  });
});
