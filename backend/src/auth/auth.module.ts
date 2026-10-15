import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';
import { AccessService } from './access.service.js';
import { AuthGuard } from './auth.guard.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    AccessService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService, AccessService],
})
export class AuthModule {}
