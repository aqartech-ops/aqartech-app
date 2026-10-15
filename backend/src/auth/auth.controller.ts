import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { Auth, AnyAuthenticated, Public, type AuthContext } from '../common/auth-context.js';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('auth/register')
  register(@Body() body: unknown) {
    return this.auth.register(body);
  }

  @Public()
  @HttpCode(200)
  @Post('auth/login')
  login(@Body() body: unknown) {
    return this.auth.login(body);
  }

  @Public()
  @HttpCode(200)
  @Post('admin/auth/login')
  adminLogin(@Body() body: unknown) {
    return this.auth.adminLogin(body);
  }

  @AnyAuthenticated()
  @Get('auth/me')
  me(@Auth() auth: AuthContext) {
    return this.auth.me(auth);
  }
}
