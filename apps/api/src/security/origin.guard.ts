import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppConfigService } from '../config/app-config.service';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext) {
    if (this.config.nodeEnvironment !== 'production') return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (safeMethods.has(request.method.toUpperCase())) return true;
    if (request.header('origin') !== this.config.corsOrigin) {
      throw new ForbiddenException('Request origin is not allowed');
    }
    return true;
  }
}
