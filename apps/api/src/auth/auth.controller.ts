import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { CurrentUser, Public, type RequestUser } from './auth.decorators';
import { AuthService } from './auth.service';
import {
  AccountActionTokenDto,
  AccountEmailDto,
  ChangePasswordDto,
  CredentialsDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateDisplayNameDto,
} from './dto/credentials.dto';
import { readSessionCookie, sessionCookieName } from './session-cookie';
import { assertRegistrationAllowed } from './registration-policy';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Post('register')
  async register(@Body() input: RegisterDto) {
    assertRegistrationAllowed(
      this.config.registrationMode,
      this.config.registrationAccessCode,
      input.accessCode,
    );
    return this.auth.register(input.email, input.password, input.displayName);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(
    @Body() input: AccountActionTokenDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.verifyEmail(input.token);
    this.setSessionCookie(response, result.token);
    return result.user;
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(204)
  async resendVerification(@Body() input: AccountEmailDto) {
    await this.auth.resendVerification(input.email);
  }

  @Public()
  @Post('password-reset')
  @HttpCode(204)
  async requestPasswordReset(@Body() input: AccountEmailDto) {
    await this.auth.requestPasswordReset(input.email);
  }

  @Public()
  @Post('password-reset/confirm')
  @HttpCode(200)
  async resetPassword(
    @Body() input: ResetPasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.resetPassword(input.token, input.password);
    this.setSessionCookie(response, result.token);
    return result.user;
  }

  @Public()
  @Post('login')
  @HttpCode(200)
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

  @Patch('me')
  updateMe(@CurrentUser() user: RequestUser, @Body() input: UpdateDisplayNameDto) {
    return this.auth.updateDisplayName(user.id, input.displayName);
  }

  @Patch('me/password')
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body() input: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.changePassword(user.id, input.currentPassword, input.password);
    this.setSessionCookie(response, result.token);
    return result.user;
  }

  @Post('sessions/revoke-others')
  @HttpCode(204)
  async revokeOtherSessions(@CurrentUser() user: RequestUser, @Req() request: Request) {
    await this.auth.revokeOtherSessions(user.id, readSessionCookie(request.headers.cookie));
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
