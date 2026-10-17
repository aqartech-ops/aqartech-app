import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { Auth, AnyAuthenticated, Public, type AuthContext, type UserAuth } from '../common/auth-context.js';

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
  ) {}

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

  /** Step 1 of "forgot password": email a 6-digit code. */
  @Public()
  @HttpCode(200)
  @Post('auth/forgot-password')
  forgot(@Body() body: unknown) {
    return this.passwords.forgot(body);
  }

  /** Step 2: code + new password. */
  @Public()
  @HttpCode(200)
  @Post('auth/reset-password')
  reset(@Body() body: unknown) {
    return this.passwords.reset(body);
  }

  @HttpCode(200)
  @Post('auth/change-password')
  change(@Auth() auth: UserAuth, @Body() body: unknown) {
    return this.passwords.change(auth, body);
  }

  @AnyAuthenticated()
  @Get('auth/me')
  me(@Auth() auth: AuthContext) {
    return this.auth.me(auth);
  }
}
