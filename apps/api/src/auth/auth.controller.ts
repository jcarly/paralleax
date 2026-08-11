import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { CurrentUser, Public, type RequestUser } from './auth.decorators';
import { AuthService } from './auth.service';
import { CredentialsDto, RegisterDto } from './dto/credentials.dto';
import { readSessionCookie, sessionCookieName } from './session-cookie';
import { Throttle } from '@nestjs/throttler';
import { assertRegistrationAllowed } from './registration-policy';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() input: RegisterDto, @Res({ passthrough: true }) response: Response) {
    assertRegistrationAllowed(
      this.config.registrationMode,
      this.config.registrationAccessCode,
      input.accessCode,
    );
    const result = await this.auth.register(input.email, input.password);
    this.setSessionCookie(response, result.token);
    return result.user;
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() input: CredentialsDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(input.email, input.password);
    this.setSessionCookie(response, result.token);
    return result.user;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(readSessionCookie(request.headers.cookie));
    response.clearCookie(sessionCookieName, { path: '/' });
  }

  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return user;
  }

  private setSessionCookie(response: Response, token: string) {
    response.cookie(sessionCookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.secureCookies,
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
}
