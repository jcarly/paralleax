import { ForbiddenException } from '@nestjs/common';
import type { RegistrationMode } from '../config/app-config.service';
import { apiErrorResponse } from '../operations/api-error-response';

export function assertRegistrationAllowed(mode: RegistrationMode) {
  if (mode === 'closed') {
    throw new ForbiddenException(apiErrorResponse('REGISTRATION_CLOSED', 'Registration is closed'));
  }
}
