import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AdminProfile } from '@aurevi/shared';
import { env } from '../env.js';
import { AdminAuthService } from './admin-auth.service.js';
import { readAdminToken } from './admin.cookie.js';

export type AdminRequest = Request & { admin: AdminProfile };

@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(private readonly auth: AdminAuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const token = readAdminToken(request);
    const admin = token ? await this.auth.authenticate(token) : null;
    if (!admin) throw new UnauthorizedException('Sessão inválida ou expirada.');
    request.admin = admin;
    return true;
  }
}

/** CSRF defense for the cookie session: state-changing requests must come from an allowed origin. */
@Injectable()
export class AdminOriginGuard implements CanActivate {
  private readonly allowed = env.ADMIN_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim());

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    const origin = request.headers.origin;
    if (!origin || !this.allowed.includes(origin))
      throw new ForbiddenException('Origem não permitida.');
    return true;
  }
}
