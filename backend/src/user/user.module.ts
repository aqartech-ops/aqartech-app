import { Module } from '@nestjs/common';
import { UserController } from './user.controller.js';
import { RoleController } from './role.controller.js';
import { UserService } from './user.service.js';

@Module({
  controllers: [UserController, RoleController],
  providers: [UserService],
})
export class UserModule {}
