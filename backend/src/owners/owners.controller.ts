import { Body, Controller, Delete, Get, Module, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { OwnersService } from './owners.service.js';
import { Auth, RequirePermission, type UserAuth } from '../common/auth-context.js';

const isTrash = (q?: string) => q === '1' || q === 'true';

@Controller()
export class OwnersController {
  constructor(private readonly owners: OwnersService) {}

  // ---- owners (section: owners) ----

  @RequirePermission('owners', 'VIEW')
  @Get('owners')
  list(@Auth() auth: UserAuth, @Query('trash') trash?: string) {
    return this.owners.list(auth, isTrash(trash));
  }

  @RequirePermission('owners', 'VIEW')
  @Get('owners/:id')
  get(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.owners.get(auth, id);
  }

  @RequirePermission('owners', 'EDIT')
  @Post('owners')
  create(@Auth() auth: UserAuth, @Body() body: unknown) {
    this.owners.assertAllProperties(auth);
    return this.owners.create(auth, body);
  }

  @RequirePermission('owners', 'EDIT')
  @Patch('owners/:id')
  update(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    this.owners.assertAllProperties(auth);
    return this.owners.update(auth, id, body);
  }

  @RequirePermission('owners', 'EDIT')
  @Delete('owners/:id')
  remove(@Auth() auth: UserAuth, @Param('id') id: string) {
    this.owners.assertAllProperties(auth);
    return this.owners.remove(auth, id);
  }

  @RequirePermission('owners', 'EDIT')
  @Post('owners/:id/restore')
  restore(@Auth() auth: UserAuth, @Param('id') id: string) {
    this.owners.assertAllProperties(auth);
    return this.owners.restore(auth, id);
  }

  // ---- management agreement & partners of a property (needs both sections) ----

  @RequirePermission('owners', 'VIEW')
  @Get('properties/:id/agreements')
  agreements(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.owners.agreements(auth, id);
  }

  @RequirePermission('owners', 'EDIT')
  @Put('properties/:id/agreement')
  saveAgreement(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.owners.saveAgreement(auth, id, body);
  }

  @RequirePermission('owners', 'EDIT')
  @Post('properties/:id/agreement/end')
  endAgreement(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.owners.endAgreement(auth, id, body);
  }

  @RequirePermission('owners', 'VIEW')
  @Get('properties/:id/partners')
  partners(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.owners.partners(auth, id);
  }

  @RequirePermission('owners', 'EDIT')
  @Put('properties/:id/partners')
  savePartners(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.owners.savePartners(auth, id, body);
  }
}

@Module({
  controllers: [OwnersController],
  providers: [OwnersService],
})
export class OwnersModule {}
