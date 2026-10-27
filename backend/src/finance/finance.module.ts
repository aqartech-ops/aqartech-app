import { Body, Controller, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { Auth, RequirePermission, type UserAuth } from '../common/auth-context.js';
import { LedgerService } from './ledger.service.js';
import { ChargesService } from './charges.service.js';
import { FinanceService } from './finance.service.js';
import { PaymentsService } from './payments.service.js';
import { ChequesService } from './cheques.service.js';
import { ExpensesService } from './expenses.service.js';
import { OwnersFinanceService } from './owners-finance.service.js';

/** Ledger + charges: used by leases (activation / termination) and by the finance reports. */
@Module({
  providers: [LedgerService, ChargesService, ExpensesService],
  exports: [LedgerService, ChargesService, ExpensesService],
})
export class FinanceCoreModule {}

/** Financials section (المالية): ledger reads, receivables, collections and receipts. */
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly payments: PaymentsService,
    private readonly cheques: ChequesService,
    private readonly expenses: ExpensesService,
    private readonly owners: OwnersFinanceService,
  ) {}

  // ---------- owner statements & payouts (كشوف الملاك والتحويلات) ----------

  @RequirePermission('financials', 'VIEW')
  @Get('owner-statements/properties')
  managedProperties(@Auth() auth: UserAuth) {
    return this.owners.managedProperties(auth);
  }

  @RequirePermission('financials', 'VIEW')
  @Get('owner-statements/preview')
  previewStatement(@Auth() auth: UserAuth, @Query('propertyId') propertyId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.owners.preview(auth, { propertyId, from, to });
  }

  @RequirePermission('financials', 'VIEW')
  @Get('owner-statements')
  listStatements(@Auth() auth: UserAuth, @Query('propertyId') propertyId?: string, @Query('ownerId') ownerId?: string) {
    return this.owners.list(auth, { propertyId, ownerId });
  }

  @RequirePermission('financials', 'VIEW')
  @Get('owner-statements/:id')
  getStatement(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.owners.get(auth, id);
  }

  @RequirePermission('financials', 'EDIT')
  @Post('owner-statements')
  issueStatement(@Auth() auth: UserAuth, @Body() body: unknown) {
    return this.owners.issue(auth, body);
  }

  @RequirePermission('financials', 'EDIT')
  @Post('owner-statements/:id/void')
  voidStatement(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.owners.voidStatement(auth, id, body);
  }

  @RequirePermission('financials', 'VIEW')
  @Get('owners/balances')
  ownerBalances(@Auth() auth: UserAuth) {
    return this.owners.balances(auth);
  }

  @RequirePermission('financials', 'VIEW')
  @Get('owners/:id/account')
  ownerAccount(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.owners.ownerAccount(auth, id);
  }

  @RequirePermission('financials', 'EDIT')
  @Post('owner-payouts')
  createPayout(@Auth() auth: UserAuth, @Body() body: unknown) {
    return this.owners.payout(auth, body);
  }

  @RequirePermission('financials', 'EDIT')
  @Post('owner-payouts/:id/void')
  voidPayout(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.owners.voidPayout(auth, id, body);
  }

  // ---------- expenses (المصروفات) ----------

  @RequirePermission('financials', 'VIEW')
  @Get('expenses')
  listExpenses(
    @Auth() auth: UserAuth,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('propertyId') propertyId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('bearer') bearer?: string,
    @Query('page') page?: string,
  ) {
    return this.expenses.list(auth, { from, to, propertyId, categoryId, bearer, page });
  }

  @RequirePermission('financials', 'VIEW')
  @Get('expenses/:id')
  getExpense(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.expenses.get(auth, id);
  }

  @RequirePermission('financials', 'EDIT')
  @Post('expenses')
  createExpense(@Auth() auth: UserAuth, @Body() body: unknown) {
    return this.expenses.create(auth, body);
  }

  @RequirePermission('financials', 'EDIT')
  @Post('expenses/:id/void')
  voidExpense(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.expenses.void(auth, id, body);
  }

  @RequirePermission('financials', 'VIEW')
  @Get('expense-categories')
  categories(@Auth() auth: UserAuth, @Query('all') all?: string) {
    return this.expenses.categories(auth, all === '1' || all === 'true');
  }

  @RequirePermission('financials', 'EDIT')
  @Post('expense-categories')
  createCategory(@Auth() auth: UserAuth, @Body() body: unknown) {
    return this.expenses.saveCategory(auth, null, body);
  }

  @RequirePermission('financials', 'EDIT')
  @Patch('expense-categories/:id')
  updateCategory(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.expenses.saveCategory(auth, id, body);
  }

  @RequirePermission('financials', 'VIEW')
  @Get('vendors')
  vendors(@Auth() auth: UserAuth) {
    return this.expenses.vendors(auth);
  }

  // ---------- cheques (الشيكات) ----------

  @RequirePermission('financials', 'VIEW')
  @Get('cheques')
  listCheques(@Auth() auth: UserAuth, @Query('filter') filter?: string, @Query('tenantId') tenantId?: string, @Query('leaseId') leaseId?: string) {
    return this.cheques.list(auth, { filter, tenantId, leaseId });
  }

  @RequirePermission('financials', 'VIEW')
  @Get('cheques/stats')
  chequeStats(@Auth() auth: UserAuth) {
    return this.cheques.stats(auth);
  }

  @RequirePermission('financials', 'VIEW')
  @Get('leases/:id/cheque-plan')
  chequePlan(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.cheques.plan(auth, id);
  }

  @RequirePermission('financials', 'EDIT')
  @Post('cheques')
  createCheque(@Auth() auth: UserAuth, @Body() body: unknown) {
    return this.cheques.create(auth, body);
  }

  @RequirePermission('financials', 'EDIT')
  @Post('cheques/bulk')
  bulkCheques(@Auth() auth: UserAuth, @Body() body: unknown) {
    return this.cheques.bulk(auth, body);
  }

  @RequirePermission('financials', 'EDIT')
  @Patch('cheques/:id')
  updateCheque(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.cheques.update(auth, id, body);
  }

  @RequirePermission('financials', 'EDIT')
  @Post('cheques/:id/deposit')
  depositCheque(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.cheques.deposit(auth, id, body);
  }

  @RequirePermission('financials', 'EDIT')
  @Post('cheques/:id/clear')
  clearCheque(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.cheques.clear(auth, id, body);
  }

  @RequirePermission('financials', 'EDIT')
  @Post('cheques/:id/bounce')
  bounceCheque(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.cheques.bounce(auth, id, body);
  }

  @RequirePermission('financials', 'EDIT')
  @Post('cheques/:id/cancel')
  cancelCheque(@Auth() auth: UserAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.cheques.cancel(auth, id, body);
  }

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
  providers: [FinanceService, PaymentsService, ChequesService, OwnersFinanceService],
  exports: [FinanceService, ChequesService],
})
export class FinanceModule {}
