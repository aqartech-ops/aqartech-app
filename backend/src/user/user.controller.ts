import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserService } from './user.service.js';
import { Auth, RequirePermission, type UserAuth } from '../common/auth-context.js';

@Controller('users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @RequirePermission('users', 'VIEW')
  @Get()
  list(@Auth() auth: UserAuth, @Query('trash') trash?: string) {
    return this.users.list(auth, trash === '1' || trash === 'true');
  }

  @RequirePermission('users', 'EDIT')
  @Post()
  create(@Auth() auth: UserAuth, @Body() body: unknown) {
    return this.users.create(auth, body);
  }

  @RequirePermission('users', 'EDIT')
  @Patch(':id')
  update(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.users.update(auth, id, body);
  }

  @RequirePermission('users', 'EDIT')
  @Delete(':id')
  remove(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.users.remove(auth, id);
  }

  @RequirePermission('users', 'EDIT')
  @Post(':id/restore')
  restore(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.users.restore(auth, id);
  }
}
