import { Body, Controller, Delete, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { LeasesService } from './leases.service.js';
import { FinanceCoreModule } from '../finance/finance.module.js';
import { Auth, RequirePermission, type UserAuth } from '../common/auth-context.js';

/** Leases belong to the "tenants" section (المستأجرون والعقود). */
@Controller('leases')
export class LeasesController {
  constructor(private readonly leases: LeasesService) {}

  @RequirePermission('tenants', 'VIEW')
  @Get()
  list(
    @Auth() auth: UserAuth,
    @Query('filter') filter?: string,
    @Query('tenantId') tenantId?: string,
    @Query('unitId') unitId?: string,
    @Query('propertyId') propertyId?: string,
    @Query('days') days?: string,
  ) {
    return this.leases.list(auth, { filter, tenantId, unitId, propertyId, days });
  }

  @RequirePermission('tenants', 'VIEW')
  @Post('preview')
  preview(@Body() body: unknown) {
    return this.leases.preview(body);
  }

  @RequirePermission('tenants', 'VIEW')
  @Get(':id')
  get(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.leases.get(auth, id);
  }

  @RequirePermission('tenants', 'EDIT')
  @Post()
  create(@Auth() auth: UserAuth, @Body() body: unknown) {
    return this.leases.create(auth, body);
  }

  @RequirePermission('tenants', 'EDIT')
  @Patch(':id')
  update(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.leases.update(auth, id, body);
  }

  @RequirePermission('tenants', 'EDIT')
  @Post(':id/activate')
  activate(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.leases.activate(auth, id);
  }

  @RequirePermission('tenants', 'EDIT')
  @Post(':id/terminate')
  terminate(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.leases.terminate(auth, id, body);
  }

  @RequirePermission('tenants', 'EDIT')
  @Post(':id/renew')
  renew(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.leases.renew(auth, id, body);
  }

  @RequirePermission('tenants', 'EDIT')
  @Delete(':id')
  remove(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.leases.remove(auth, id);
  }
}

@Module({
  imports: [FinanceCoreModule],
  controllers: [LeasesController],
  providers: [LeasesService],
  exports: [LeasesService],
})
export class LeasesModule {}
