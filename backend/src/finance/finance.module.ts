import { Controller, Get, Module, Param, Query } from '@nestjs/common';
import { Auth, RequirePermission, type UserAuth } from '../common/auth-context.js';
import { LedgerService } from './ledger.service.js';
import { ChargesService } from './charges.service.js';
import { FinanceService } from './finance.service.js';

/** Ledger + charges: used by leases (activation / termination) and by the finance reports. */
@Module({
  providers: [LedgerService, ChargesService],
  exports: [LedgerService, ChargesService],
})
export class FinanceCoreModule {}

/** Financials section (المالية). Reads only in this batch; collections come next. */
@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @RequirePermission('financials', 'VIEW')
  @Get('summary')
  summary(@Auth() auth: UserAuth) {
    return this.finance.summary(auth);
  }

  @RequirePermission('financials', 'VIEW')
  @Get('receivables')
  receivables(@Auth() auth: UserAuth, @Query('filter') filter?: string, @Query('tenantId') tenantId?: string, @Query('propertyId') propertyId?: string) {
    return this.finance.receivables(auth, { filter, tenantId, propertyId });
  }

  @RequirePermission('financials', 'VIEW')
  @Get('balances')
  balances(@Auth() auth: UserAuth) {
    return this.finance.balances(auth);
  }

  @RequirePermission('financials', 'VIEW')
  @Get('tenants/:id/statement')
  statement(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.finance.statement(auth, id);
  }

  @RequirePermission('financials', 'VIEW')
  @Get('journal')
  journal(@Auth() auth: UserAuth, @Query('page') page?: string) {
    return this.finance.journal(auth, Number(page) || 1);
  }

  @RequirePermission('financials', 'VIEW')
  @Get('trial-balance')
  trialBalance(@Auth() auth: UserAuth) {
    return this.finance.trialBalance(auth);
  }
}

@Module({
  imports: [FinanceCoreModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
