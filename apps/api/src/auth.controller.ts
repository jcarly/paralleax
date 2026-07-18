import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { CurrentUser, Public, readSessionCookie, type RequestUser } from './auth';
import { AuthService } from './auth.service';

class CredentialsDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body() input: CredentialsDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.register(input.email, input.password);
    setSessionCookie(response, result.token);
    return result.user;
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() input: CredentialsDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(input.email, input.password);
    setSessionCookie(response, result.token);
    return result.user;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(readSessionCookie(request.headers.cookie));
    response.clearCookie('paralleax_session', { path: '/' });
  }

  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return user;
  }
}

function setSessionCookie(response: Response, token: string) {
  response.cookie('paralleax_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}
