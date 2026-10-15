import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Auth, AnyAuthenticated, type AuthContext } from '../common/auth-context.js';
import { likePattern, normalizeSearch, normalizedColumn } from '../common/text.js';

type ResultItem = { id: string; title: string; subtitle: string | null };
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
    } else if (auth.access.users !== 'HIDDEN') {
      const users = await this.prisma.$queryRaw<{ id: string; name: string; email: string; phone: string | null }[]>`
        SELECT id, name, email, phone FROM "User"
        WHERE "companyId" = ${auth.companyId} AND "deletedAt" IS NULL AND kind = 'STAFF' AND (
          ${normalizedColumn('"name"')} LIKE ${pattern} OR ${normalizedColumn('"email"')} LIKE ${pattern}
          OR ${normalizedColumn('"phone"')} LIKE ${pattern})
        ORDER BY name LIMIT ${LIMIT}`;
      groups.push({
        type: 'users',
        section: 'users',
        items: users.map((u) => ({ id: u.id, title: u.name, subtitle: [u.email, u.phone].filter(Boolean).join(' · ') })),
      });
    }

    return { query, groups: groups.filter((g) => g.items.length > 0) };
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
