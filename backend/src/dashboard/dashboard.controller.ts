import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { PlansService } from '../plans/plans.service.js';
import { PropertiesModule } from '../properties/properties.controller.js';
import { PropertiesService } from '../properties/properties.service.js';
import { TenantsModule, TenantsService } from '../tenants/tenants.controller.js';
import { LeasesModule } from '../leases/leases.controller.js';
import { LeasesService } from '../leases/leases.service.js';
import { FinanceModule } from '../finance/finance.module.js';
import { FinanceService } from '../finance/finance.service.js';
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
    private readonly finance: FinanceService,
  ) {}

  async get(auth: UserAuth) {
    const can = (section: keyof UserAuth['access']) => auth.access[section] !== 'HIDDEN';
    const widgets: Record<string, unknown> = {};

    // Lease stats first: they also close leases that reached their end date (unit statuses follow).
    const leaseStats = await this.leases.stats(auth);
    if (can('properties')) widgets.portfolio = await this.properties.portfolioStats(auth);
    if (can('tenants')) widgets.tenants = { count: await this.tenants.count(auth), leases: leaseStats };
    // Financial KPIs come from the ledger. Collection rate and NOI follow with collections and expenses.
    if (can('financials')) {
      const s = await this.finance.summary(auth);
      widgets.financials = { available: true, receivable: s.receivable, overdue: s.overdue.total, rentIncomeMonth: s.rentIncome.month, upcoming: s.upcoming.total };
    }
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
  imports: [PropertiesModule, TenantsModule, LeasesModule, FinanceModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
