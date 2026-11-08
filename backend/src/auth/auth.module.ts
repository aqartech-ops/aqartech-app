import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';
import { AccessService } from './access.service.js';
import { AuthGuard } from './auth.guard.js';
import { PasswordService } from './password.service.js';
import { AdminSecurityController, AdminTeamController, TwoFactorService } from './admin-security.js';

@Global()
@Module({
  controllers: [AuthController, AdminSecurityController, AdminTeamController],
  providers: [
    AuthService,
    TokenService,
    AccessService,
    PasswordService,
    TwoFactorService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService, AccessService],
})
export class AuthModule {}
