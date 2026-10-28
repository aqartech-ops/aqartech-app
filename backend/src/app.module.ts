import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { CommonModule } from './common/common.module.js';
import { AuthModule } from './auth/auth.module.js';
import { PlansModule } from './plans/plans.module.js';
import { CompanyModule } from './company/company.module.js';
import { UserModule } from './user/user.module.js';
import { AdminModule } from './admin/admin.module.js';
import { SearchModule } from './search/search.controller.js';
import { PropertiesModule } from './properties/properties.controller.js';
import { DashboardModule } from './dashboard/dashboard.controller.js';
import { OwnersModule } from './owners/owners.controller.js';
import { TenantsModule } from './tenants/tenants.controller.js';
import { LeasesModule } from './leases/leases.controller.js';
import { FinanceModule } from './finance/finance.module.js';
import { MaintenanceModule } from './maintenance/maintenance.module.js';
import { FieldsModule } from './fields/fields.module.js';
import { CustomSectionsModule } from './custom/custom-sections.module.js';
import { ButtonsModule } from './buttons/buttons.module.js';
import { TemplatesModule } from './templates/templates.module.js';

@Module({
  imports: [PrismaModule, CommonModule, FieldsModule, AuthModule, PlansModule, CompanyModule, UserModule, AdminModule, SearchModule, PropertiesModule, DashboardModule, OwnersModule, TenantsModule, LeasesModule, FinanceModule, MaintenanceModule, CustomSectionsModule, ButtonsModule, TemplatesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
