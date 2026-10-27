import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import type { UserAuth } from '../common/auth-context.js';
import { addDays, today } from '../common/dates.js';
import * as v from '../common/validate.js';
import { BEARERS, ExpensesService, PAID_FROM } from './expenses.service.js';

const SOON_DAYS = 30;

/**
 * Municipality registration of leases (تسجيل العقود في البلدية) and renewals.
 * The fee is recorded as an expense under the municipality item, borne by the tenant, the owner or the company.
 */
@Injectable()
export class MunicipalityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly expenses: ExpensesService,
  ) {}

  /** filter: unregistered (active leases with no valid registration) | expiring (within 30 days) | all */
  async list(auth: UserAuth, query: { filter?: string }) {
    const now = today();
    const leases = await this.prisma.lease.findMany({
      where: {
        companyId: auth.companyId,
        deletedAt: null,
        status: query.filter === 'all' ? { not: 'DRAFT' } : 'ACTIVE',
        ...(auth.propertyIds ? { propertyId: { in: auth.propertyIds } } : {}),
      },
      include: {
        tenant: { select: { id: true, name: true } },
        unit: { select: { number: true } },
        property: { select: { name: true } },
        municipality: { orderBy: { registeredAt: 'desc' }, take: 1 },
      },
      orderBy: { startDate: 'desc' },
    });
    const rows = leases.map((l) => {
      const last = l.municipality[0] ?? null;
      const valid = !!last && (!last.expiresAt || last.expiresAt >= now);
      const expiring = valid && !!last?.expiresAt && last.expiresAt <= addDays(now, SOON_DAYS);
      return {
        lease: { id: l.id, number: l.number, startDate: l.startDate, endDate: l.endDate, monthlyRent: l.monthlyRent, status: l.status },
        tenant: l.tenant,
        unit: l.unit,
        property: l.property,
        last,
        state: !valid ? 'UNREGISTERED' : expiring ? 'EXPIRING' : 'REGISTERED',
      };
    });
    if (query.filter === 'unregistered') return rows.filter((r) => r.state === 'UNREGISTERED');
    if (query.filter === 'expiring') return rows.filter((r) => r.state === 'EXPIRING');
    return rows;
  }

  async count(auth: UserAuth) {
    const rows = await this.list(auth, { filter: 'active' });
    return { unregistered: rows.filter((r) => r.state === 'UNREGISTERED').length, expiring: rows.filter((r) => r.state === 'EXPIRING').length };
  }

  /** Register or renew: saves the record, updates the lease, and posts the fee as an expense. */
  async register(auth: UserAuth, input: unknown) {
    const src = v.body(input);
    const lease = await this.prisma.lease.findFirst({
      where: {
        id: v.requiredString(src, 'leaseId', 60),
        companyId: auth.companyId,
        deletedAt: null,
        status: { not: 'DRAFT' },
        ...(auth.propertyIds ? { propertyId: { in: auth.propertyIds } } : {}),
      },
    });
    if (!lease) throw new NotFoundException({ message: 'payment.leaseNotFound', field: 'leaseId' });
    const registrationNo = v.requiredString(src, 'registrationNo', 60);
    const registeredAt = v.optionalDate(src, 'registeredAt') ?? today();
    if (registeredAt > today()) throw new BadRequestException({ message: 'payment.futureDate', field: 'registeredAt' });
    const expiresAt = v.optionalDate(src, 'expiresAt') ?? lease.endDate;
    if (expiresAt < registeredAt) throw new BadRequestException({ message: 'validation.endBeforeStart', field: 'expiresAt' });
    const fee = v.optionalBaisa(src, 'fee') ?? 0;

    const expenseInput =
      fee > 0
        ? await this.expenses.parse(
            auth,
            {
              amount: fee,
              date: registeredAt.toISOString().slice(0, 10),
              bearer: v.optionalEnum(src, 'bearer', BEARERS),
              paidFrom: v.optionalEnum(src, 'paidFrom', PAID_FROM) ?? 'CASH',
            },
            {
              propertyId: lease.propertyId,
              unitId: lease.unitId,
              categoryId: await this.expenses.municipalityCategoryId(auth.companyId),
              description: `${lease.number} — municipality ${registrationNo}`,
            },
          )
        : null;

    const record = await this.prisma.$transaction(async (tx) => {
      const expense = expenseInput ? await this.expenses.createInTx(tx, auth, expenseInput) : null;
      await tx.lease.update({ where: { id: lease.id }, data: { municipalityNo: registrationNo, municipalityFee: fee || null } });
      return tx.municipalityRecord.create({
        data: {
          companyId: auth.companyId,
          leaseId: lease.id,
          registrationNo,
          registeredAt,
          expiresAt,
          fee,
          expenseId: expense?.id ?? null,
          notes: v.optionalString(src, 'notes', 500) ?? null,
          createdById: auth.userId,
        },
      });
    });
    await this.activity.log(auth, { action: 'municipality.register', entity: 'Lease', entityId: lease.id, details: { registrationNo, fee } });
    return record;
  }
}
