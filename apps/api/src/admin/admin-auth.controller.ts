import { adminLoginSchema, adminPasswordChangeSchema } from '@aurevi/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { parseOrBadRequest } from '../common/parse.js';
import { AdminOriginGuard, AdminSessionGuard, type AdminRequest } from './admin-auth.guard.js';
import { AdminAuthService } from './admin-auth.service.js';
import { clearAdminCookie, readAdminToken, setAdminCookie } from './admin.cookie.js';
import { LoginRateLimit } from './login-rate-limit.js';

@Controller('admin/auth')
@UseGuards(AdminOriginGuard)
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly loginLimit: LoginRateLimit,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ) {
    const { email, password } = parseOrBadRequest(adminLoginSchema, body);
    const key = `${request.ip ?? 'unknown'}|${email}`;
    const session = await this.auth.login(email, password);
    if (!session) {
      if (!this.loginLimit.hit(key))
        throw new HttpException(
          'Muitas tentativas. Aguarde 15 minutos e tente de novo.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      throw new UnauthorizedException('E-mail ou senha incorretos.');
    }
    this.loginLimit.reset(key);
    setAdminCookie(response, session.token, session.expiresAt);
    return { admin: session.admin };
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AdminSessionGuard)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(readAdminToken(request) as string);
    clearAdminCookie(response);
  }

  @Get('me')
  @UseGuards(AdminSessionGuard)
  me(@Req() request: AdminRequest) {
    return { admin: request.admin };
  }

  @Post('password')
  @HttpCode(204)
  @UseGuards(AdminSessionGuard)
  async password(@Req() request: AdminRequest, @Body() body: unknown) {
    const { currentPassword, newPassword } = parseOrBadRequest(adminPasswordChangeSchema, body);
    const changed = await this.auth.changePassword(
      request.admin.id,
      currentPassword,
      newPassword,
      readAdminToken(request) as string,
    );
    if (!changed) throw new BadRequestException('Senha atual incorreta.');
  }
}
