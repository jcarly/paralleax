import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { UserRole } from '@paralleax/shared';

export interface RequestUser {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export const Public = () => SetMetadata('public', true);
export const OptionalAuth = () => SetMetadata('optionalAuth', true);
export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext) => {
  return context.switchToHttp().getRequest<Request & { user?: RequestUser }>().user;
});
