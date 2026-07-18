import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from './auth.service';

export interface RequestUser {
  id: string;
  email: string;
  createdAt: string;
}

export const Public = () => SetMetadata('public', true);
export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext) => {
  return context.switchToHttp().getRequest<Request & { user: RequestUser }>().user;
});

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>('public', [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const user = await this.auth.userForToken(readSessionCookie(request.headers.cookie));
    if (!user) throw new UnauthorizedException('Authentication required');
    request.user = { id: user.id, email: user.email, createdAt: user.createdAt };
    return true;
  }
}

export function readSessionCookie(cookieHeader: string | undefined) {
  return cookieHeader
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === 'paralleax_session')?.[1];
}
