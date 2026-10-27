import { Body, Controller, Get, Module, Param, Post, Query } from '@nestjs/common';
import { Auth, RequirePermission, type UserAuth } from '../common/auth-context.js';
import { LedgerService } from './ledger.service.js';
import { ChargesService } from './charges.service.js';
import { FinanceService } from './finance.service.js';
import { PaymentsService } from './payments.service.js';

/** Ledger + charges: used by leases (activation / termination) and by the finance reports. */
@Module({
  providers: [LedgerService, ChargesService],
  exports: [LedgerService, ChargesService],
})
export class FinanceCoreModule {}

/** Financials section (المالية): ledger reads, receivables, collections and receipts. */
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly payments: PaymentsService,
  ) {}

  @RequirePermission('financials', 'VIEW')
  @Get('payments')
  listPayments(
    @Auth() auth: UserAuth,
    @Query('tenantId') tenantId?: string,
    @Query('leaseId') leaseId?: string,
    @Query('method') method?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
  ) {
    return this.payments.list(auth, { tenantId, leaseId, method, from, to, page });
  }

  @RequirePermission('financials', 'VIEW')
  @Get('payments/:id')
  getPayment(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.payments.get(auth, id);
  }

  @RequirePermission('financials', 'EDIT')
  @Post('payments')
  createPayment(@Auth() auth: UserAuth, @Body() body: unknown) {
    return this.payments.create(auth, body);
  }

  @RequirePermission('financials', 'EDIT')
  @Post('payments/:id/void')
  voidPayment(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.payments.void(auth, id, body);
  }

  @RequirePermission('financials', 'VIEW')
  @Get('tenants/:id/leases')
  tenantLeases(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.finance.tenantLeases(auth, id);
  }

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
  providers: [FinanceService, PaymentsService],
  exports: [FinanceService],
})
export class FinanceModule {}
