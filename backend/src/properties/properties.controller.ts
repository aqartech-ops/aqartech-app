import { Body, Controller, Delete, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { PropertiesService } from './properties.service.js';
import { Auth, RequirePermission, type UserAuth } from '../common/auth-context.js';

const isTrash = (q?: string) => q === '1' || q === 'true';

@Controller()
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @RequirePermission('properties', 'VIEW')
  @Get('properties')
  list(@Auth() auth: UserAuth, @Query('trash') trash?: string) {
    return this.properties.list(auth, isTrash(trash));
  }

  @RequirePermission('properties', 'VIEW')
  @Get('properties/:id')
  get(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.properties.get(auth, id);
  }

  @RequirePermission('properties', 'EDIT')
  @Post('properties')
  create(@Auth() auth: UserAuth, @Body() body: unknown) {
    return this.properties.create(auth, body);
  }

  @RequirePermission('properties', 'EDIT')
  @Patch('properties/:id')
  update(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.properties.update(auth, id, body);
  }

  @RequirePermission('properties', 'EDIT')
  @Delete('properties/:id')
  remove(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.properties.remove(auth, id);
  }

  @RequirePermission('properties', 'EDIT')
  @Post('properties/:id/restore')
  restore(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.properties.restore(auth, id);
  }

  // ---- units ----

  @RequirePermission('properties', 'VIEW')
  @Get('properties/:id/units')
  units(@Auth() auth: UserAuth, @Param('id') id: string, @Query('trash') trash?: string) {
    return this.properties.units(auth, id, isTrash(trash));
  }

  @RequirePermission('properties', 'EDIT')
  @Post('properties/:id/units')
  createUnit(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.properties.createUnit(auth, id, body);
  }

  @RequirePermission('properties', 'EDIT')
  @Post('properties/:id/units/bulk')
  createUnitsBulk(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.properties.createUnitsBulk(auth, id, body);
  }

  @RequirePermission('properties', 'EDIT')
  @Patch('units/:id')
  updateUnit(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.properties.updateUnit(auth, id, body);
  }

  @RequirePermission('properties', 'EDIT')
  @Delete('units/:id')
  removeUnit(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.properties.removeUnit(auth, id);
  }

  @RequirePermission('properties', 'EDIT')
  @Post('units/:id/restore')
  restoreUnit(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.properties.restoreUnit(auth, id);
  }
}

@Module({
  controllers: [PropertiesController],
  providers: [PropertiesService],
  exports: [PropertiesService],
})
export class PropertiesModule {}
