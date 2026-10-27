import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Auth, AnyAuthenticated, type AuthContext } from '../common/auth-context.js';
import { likePattern, normalizeSearch, normalizedColumn } from '../common/text.js';

type ResultItem = { id: string; title: string; subtitle: string | null; propertyId?: string; ownerId?: string; tenantId?: string; leaseId?: string; paymentId?: string; chequeId?: string; status?: string };
type ResultGroup = { type: string; section: string; items: ResultItem[] };

const LIMIT = 20;

/**
 * Global search (محرك البحث): any letter or word, across everything the caller may see.
 * Each phase adds its own group here (properties, units, tenants, leases, cheques, ...).
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(auth: AuthContext, rawQuery: string | undefined): Promise<{ query: string; groups: ResultGroup[] }> {
    const query = (rawQuery ?? '').slice(0, 100);
    if (!normalizeSearch(query)) return { query, groups: [] };
    const pattern = likePattern(query);
    const groups: ResultGroup[] = [];

    if (auth.kind === 'admin') {
      const companies = await this.prisma.$queryRaw<{ id: string; name: string; email: string | null; phone: string | null }[]>`
        SELECT id, name, email, phone FROM "Company"
        WHERE "deletedAt" IS NULL AND (
          ${normalizedColumn('"name"')} LIKE ${pattern} OR ${normalizedColumn('"ownerName"')} LIKE ${pattern}
          OR ${normalizedColumn('"email"')} LIKE ${pattern} OR ${normalizedColumn('"phone"')} LIKE ${pattern})
        ORDER BY name LIMIT ${LIMIT}`;
      groups.push({
        type: 'companies',
        section: 'companies',
        items: companies.map((c) => ({ id: c.id, title: c.name, subtitle: [c.email, c.phone].filter(Boolean).join(' · ') || null })),
      });
    } else {
      if (auth.access.properties !== 'HIDDEN') groups.push(...(await this.propertyGroups(auth, pattern)));
      if (auth.access.tenants !== 'HIDDEN') groups.push(await this.tenantGroup(auth, pattern), await this.leaseGroup(auth, pattern));
      if (auth.access.financials !== 'HIDDEN') groups.push(await this.paymentGroup(auth, pattern), await this.chequeGroup(auth, pattern));
      if (auth.access.owners !== 'HIDDEN') groups.push(await this.ownerGroup(auth, pattern));
      if (auth.access.users !== 'HIDDEN') groups.push(await this.userGroup(auth, pattern));
    }

    return { query, groups: groups.filter((g) => g.items.length > 0) };
  }

  private async propertyGroups(auth: Extract<AuthContext, { kind: 'user' }>, pattern: string): Promise<ResultGroup[]> {
    const all = auth.propertyIds === null;
    const ids = auth.propertyIds ?? [];
    const properties = await this.prisma.$queryRaw<{ id: string; name: string; wilayat: string | null; address: string | null }[]>`
      SELECT id, name, wilayat, address FROM "Property"
      WHERE "companyId" = ${auth.companyId} AND "deletedAt" IS NULL AND (${all} OR id = ANY(${ids}::text[]))
        AND (${normalizedColumn('"name"')} LIKE ${pattern} OR ${normalizedColumn('"wilayat"')} LIKE ${pattern}
          OR ${normalizedColumn('"governorate"')} LIKE ${pattern} OR ${normalizedColumn('"address"')} LIKE ${pattern}
          OR ${normalizedColumn('"plotNumber"')} LIKE ${pattern})
      ORDER BY name LIMIT ${LIMIT}`;
    const units = await this.prisma.$queryRaw<{ id: string; number: string; propertyId: string; propertyName: string; status: string }[]>`
      SELECT u.id, u.number, u."propertyId", p.name AS "propertyName", u.status::text AS status
      FROM "Unit" u JOIN "Property" p ON p.id = u."propertyId"
      WHERE u."companyId" = ${auth.companyId} AND u."deletedAt" IS NULL AND p."deletedAt" IS NULL
        AND (${all} OR p.id = ANY(${ids}::text[]))
        AND (${normalizedColumn('u."number"')} LIKE ${pattern} OR ${normalizedColumn('u."electricityMeter"')} LIKE ${pattern}
          OR ${normalizedColumn('u."waterMeter"')} LIKE ${pattern})
      ORDER BY p.name, u.number LIMIT ${LIMIT}`;
    return [
      {
        type: 'properties',
        section: 'properties',
        items: properties.map((p) => ({ id: p.id, title: p.name, subtitle: [p.wilayat, p.address].filter(Boolean).join(' · ') || null, propertyId: p.id })),
      },
      {
        type: 'units',
        section: 'properties',
        items: units.map((u) => ({ id: u.id, title: u.number, subtitle: u.propertyName, propertyId: u.propertyId, status: u.status })),
      },
    ];
  }

  private async leaseGroup(auth: Extract<AuthContext, { kind: 'user' }>, pattern: string): Promise<ResultGroup> {
    const all = auth.propertyIds === null;
    const ids = auth.propertyIds ?? [];
    const leases = await this.prisma.$queryRaw<{ id: string; number: string; tenant: string; unit: string; property: string; status: string }[]>`
      SELECT l.id, l.number, t.name AS tenant, u.number AS unit, p.name AS property, l.status::text AS status
      FROM "Lease" l JOIN "Tenant" t ON t.id = l."tenantId" JOIN "Unit" u ON u.id = l."unitId" JOIN "Property" p ON p.id = l."propertyId"
      WHERE l."companyId" = ${auth.companyId} AND l."deletedAt" IS NULL AND (${all} OR l."propertyId" = ANY(${ids}::text[]))
        AND (${normalizedColumn('l."number"')} LIKE ${pattern} OR ${normalizedColumn('l."municipalityNo"')} LIKE ${pattern}
          OR ${normalizedColumn('t."name"')} LIKE ${pattern} OR ${normalizedColumn('u."number"')} LIKE ${pattern})
      ORDER BY l."startDate" DESC LIMIT ${LIMIT}`;
    return {
      type: 'leases',
      section: 'tenants',
      items: leases.map((l) => ({ id: l.id, title: `${l.number} · ${l.tenant}`, subtitle: `${l.property} · ${l.unit}`, leaseId: l.id, status: l.status })),
    };
  }

  /** Receipts by number, cheque number, transfer reference or tenant name. */
  private async paymentGroup(auth: Extract<AuthContext, { kind: 'user' }>, pattern: string): Promise<ResultGroup> {
    const all = auth.propertyIds === null;
    const ids = auth.propertyIds ?? [];
    const rows = await this.prisma.$queryRaw<{ id: string; number: string; tenant: string; amount: number; status: string }[]>`
      SELECT pm.id, pm.number, t.name AS tenant, pm.amount, pm.status::text AS status
      FROM "Payment" pm JOIN "Tenant" t ON t.id = pm."tenantId"
      WHERE pm."companyId" = ${auth.companyId} AND (${all} OR pm."propertyId" = ANY(${ids}::text[]))
        AND (${normalizedColumn('pm."number"')} LIKE ${pattern} OR ${normalizedColumn('pm."chequeNo"')} LIKE ${pattern}
          OR ${normalizedColumn('pm."reference"')} LIKE ${pattern} OR ${normalizedColumn('t."name"')} LIKE ${pattern})
      ORDER BY pm.date DESC LIMIT ${LIMIT}`;
    return {
      type: 'payments',
      section: 'financials',
      items: rows.map((r) => ({ id: r.id, title: `${r.number} · ${r.tenant}`, subtitle: null, paymentId: r.id, status: r.status })),
    };
  }

  /** Cheques by number, bank or tenant name. */
  private async chequeGroup(auth: Extract<AuthContext, { kind: 'user' }>, pattern: string): Promise<ResultGroup> {
    const all = auth.propertyIds === null;
    const ids = auth.propertyIds ?? [];
    const rows = await this.prisma.$queryRaw<{ id: string; number: string; bank: string; tenant: string; status: string }[]>`
      SELECT c.id, c.number, c."bankName" AS bank, t.name AS tenant, c.status::text AS status
      FROM "Cheque" c JOIN "Tenant" t ON t.id = c."tenantId"
      WHERE c."companyId" = ${auth.companyId} AND (${all} OR c."propertyId" = ANY(${ids}::text[]))
        AND (${normalizedColumn('c."number"')} LIKE ${pattern} OR ${normalizedColumn('c."bankName"')} LIKE ${pattern}
          OR ${normalizedColumn('t."name"')} LIKE ${pattern})
      ORDER BY c."dueDate" DESC LIMIT ${LIMIT}`;
    return {
      type: 'cheques',
      section: 'financials',
      items: rows.map((r) => ({ id: r.id, title: `${r.number} · ${r.bank}`, subtitle: r.tenant, chequeId: r.id, status: r.status })),
    };
  }

  private async tenantGroup(auth: Extract<AuthContext, { kind: 'user' }>, pattern: string): Promise<ResultGroup> {
    const tenants = await this.prisma.$queryRaw<{ id: string; name: string; phone: string | null; civilId: string | null }[]>`
      SELECT id, name, phone, "civilId" FROM "Tenant"
      WHERE "companyId" = ${auth.companyId} AND "deletedAt" IS NULL AND (
        ${normalizedColumn('"name"')} LIKE ${pattern} OR ${normalizedColumn('"phone"')} LIKE ${pattern}
        OR ${normalizedColumn('"phone2"')} LIKE ${pattern} OR ${normalizedColumn('"email"')} LIKE ${pattern}
        OR ${normalizedColumn('"civilId"')} LIKE ${pattern} OR ${normalizedColumn('"crNumber"')} LIKE ${pattern}
        OR ${normalizedColumn('"employer"')} LIKE ${pattern} OR ${normalizedColumn('"guarantorName"')} LIKE ${pattern})
      ORDER BY name LIMIT ${LIMIT}`;
    return {
      type: 'tenants',
      section: 'tenants',
      items: tenants.map((x) => ({ id: x.id, title: x.name, subtitle: [x.phone, x.civilId].filter(Boolean).join(' · ') || null, tenantId: x.id })),
    };
  }

  private async ownerGroup(auth: Extract<AuthContext, { kind: 'user' }>, pattern: string): Promise<ResultGroup> {
    const owners = await this.prisma.$queryRaw<{ id: string; name: string; phone: string | null; civilId: string | null }[]>`
      SELECT id, name, phone, "civilId" FROM "Owner"
      WHERE "companyId" = ${auth.companyId} AND "deletedAt" IS NULL AND (
        ${normalizedColumn('"name"')} LIKE ${pattern} OR ${normalizedColumn('"phone"')} LIKE ${pattern}
        OR ${normalizedColumn('"email"')} LIKE ${pattern} OR ${normalizedColumn('"civilId"')} LIKE ${pattern}
        OR ${normalizedColumn('"crNumber"')} LIKE ${pattern})
      ORDER BY name LIMIT ${LIMIT}`;
    return {
      type: 'owners',
      section: 'owners',
      items: owners.map((o) => ({ id: o.id, title: o.name, subtitle: [o.phone, o.civilId].filter(Boolean).join(' · ') || null, ownerId: o.id })),
    };
  }

  private async userGroup(auth: Extract<AuthContext, { kind: 'user' }>, pattern: string): Promise<ResultGroup> {
    const users = await this.prisma.$queryRaw<{ id: string; name: string; email: string; phone: string | null }[]>`
      SELECT id, name, email, phone FROM "User"
      WHERE "companyId" = ${auth.companyId} AND "deletedAt" IS NULL AND kind = 'STAFF' AND (
        ${normalizedColumn('"name"')} LIKE ${pattern} OR ${normalizedColumn('"email"')} LIKE ${pattern}
        OR ${normalizedColumn('"phone"')} LIKE ${pattern})
      ORDER BY name LIMIT ${LIMIT}`;
    return {
      type: 'users',
      section: 'users',
      items: users.map((u) => ({ id: u.id, title: u.name, subtitle: [u.email, u.phone].filter(Boolean).join(' · ') })),
    };
  }
}

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @AnyAuthenticated()
  @Get()
  run(@Auth() auth: AuthContext, @Query('q') q?: string) {
    return this.search.search(auth, q);
  }
}

@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
