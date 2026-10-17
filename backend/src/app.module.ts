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

@Module({
  imports: [PrismaModule, CommonModule, AuthModule, PlansModule, CompanyModule, UserModule, AdminModule, SearchModule, PropertiesModule, DashboardModule, OwnersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
