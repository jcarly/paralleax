import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { RequestUser } from './auth.decorators';
import { AuthService } from './auth.service';
import { readSessionCookie } from './session-cookie';

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
    const optional = this.reflector.getAllAndOverride<boolean>('optionalAuth', [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const user = await this.auth.userForToken(readSessionCookie(request.headers.cookie));
    if (!user) {
      if (optional) return true;
      throw new UnauthorizedException('Authentication required');
    }
    request.user = { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt };
    return true;
  }
}
