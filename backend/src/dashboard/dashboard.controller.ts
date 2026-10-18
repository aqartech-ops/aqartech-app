import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { PlansService } from '../plans/plans.service.js';
import { PropertiesModule } from '../properties/properties.controller.js';
import { PropertiesService } from '../properties/properties.service.js';
import { TenantsModule, TenantsService } from '../tenants/tenants.controller.js';
import { LeasesModule } from '../leases/leases.controller.js';
import { LeasesService } from '../leases/leases.service.js';
import { Auth, type UserAuth } from '../common/auth-context.js';

/**
 * The dashboard is open to every user, but each widget is included ONLY if the user may see
 * that section (role ∩ plan) — the data itself is never sent otherwise.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly properties: PropertiesService,
    private readonly plans: PlansService,
    private readonly tenants: TenantsService,
    private readonly leases: LeasesService,
  ) {}

  async get(auth: UserAuth) {
    const can = (section: keyof UserAuth['access']) => auth.access[section] !== 'HIDDEN';
    const widgets: Record<string, unknown> = {};

    // Lease stats first: they also close leases that reached their end date (unit statuses follow).
    const leaseStats = await this.leases.stats(auth);
    if (can('properties')) widgets.portfolio = await this.properties.portfolioStats(auth);
    if (can('tenants')) widgets.tenants = { count: await this.tenants.count(auth), leases: leaseStats };
    // Financial KPIs (occupancy income, collection, NOI, arrears) arrive with phase 4.
    if (can('financials')) widgets.financials = { available: false };
    // Plan usage is for whoever manages the account / the team.
    if (auth.isCompanyAdmin || auth.access.users === 'EDIT') widgets.planUsage = await this.plans.usage(auth.companyId);

    const quickActions = (['properties', 'tenants'] as const).filter((s) => auth.access[s] === 'EDIT');
    return { widgets, quickActions };
  }
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(@Auth() auth: UserAuth) {
    return this.dashboard.get(auth);
  }
}

@Module({
  imports: [PropertiesModule, TenantsModule, LeasesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
