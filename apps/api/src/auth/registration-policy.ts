import { createHash, timingSafeEqual } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import type { RegistrationMode } from '../config/app-config.service';

export function assertRegistrationAllowed(
  mode: RegistrationMode,
  configuredAccessCode: string | undefined,
  suppliedAccessCode: string | undefined,
) {
  if (mode === 'closed') throw new ForbiddenException('Registration is closed');
  if (
    mode === 'access-code' &&
    (!configuredAccessCode ||
      !suppliedAccessCode ||
      !secretsEqual(configuredAccessCode, suppliedAccessCode))
  ) {
    throw new ForbiddenException('A valid invitation code is required');
  }
}

function secretsEqual(expected: string, supplied: string) {
  const expectedHash = createHash('sha256').update(expected).digest();
  const suppliedHash = createHash('sha256').update(supplied).digest();
  return timingSafeEqual(expectedHash, suppliedHash);
}
