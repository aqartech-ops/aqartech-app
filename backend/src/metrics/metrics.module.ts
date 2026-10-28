import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { Prisma, type CustomSection, type Metric } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import { AdminOnly, AnyAuthenticated, Auth, type AdminAuth, type AuthContext, type UserAuth } from '../common/auth-context.js';
import { LEVEL_RANK, customSectionKey } from '../common/sections.js';
import * as v from '../common/validate.js';
import { FieldsService } from '../fields/fields.module.js';
import { PERIODS, checkDefinition, compute, formatOf, omanDay, periodRange, type FieldInfo, type MetricDef, type Period } from './rules.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RECORDS = 50_000;

/**
 * Indicators (المؤشرات): flexible analytics over the records of the sections added by the platform team.
 * A user sees an indicator only if they may see its section (a sub-section follows its top-level section),
 * and only over the records of their properties. These figures are NOT ledger entries: the financial
 * statements stay computed from the journal.
 */
@Injectable()
export class MetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fields: FieldsService,
  ) {}

  /** Extra fields of a section ("cs:<key>"), as the rules need them. */
  async fieldInfos(sectionKey: string): Promise<FieldInfo[]> {
    return (await this.fields.all())
      .filter((r) => r.entity === `cs:${sectionKey}` && !r.isCore && r.isActive)
      .map((r) => ({ key: r.key, type: r.type, options: (r.options as { value: string }[]) ?? [] }));
  }

  /** Active indicators the user may see, with their section and its top-level section. */
  async visible(auth: UserAuth) {
    const [metrics, sections] = await Promise.all([
      this.prisma.metric.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.customSection.findMany({ where: { isActive: true } }),
    ]);
    const byKey = new Map(sections.map((s) => [s.key, s]));
    const byId = new Map(sections.map((s) => [s.id, s]));
    const out: { metric: Metric; section: CustomSection; root: CustomSection }[] = [];
    for (const metric of metrics) {
      const section = byKey.get(metric.section);
      if (!section) continue;
      let root = section;
      for (let i = 0; root.parentId && i < 5; i += 1) root = byId.get(root.parentId) ?? root;
      if (root.parentId) continue; // a parent section was hidden
      if (LEVEL_RANK[auth.access[customSectionKey(root.key)] ?? 'HIDDEN'] < LEVEL_RANK.VIEW) continue;
      out.push({ metric, section, root });
    }
    return out;
  }

  async compute(auth: UserAuth, metric: Metric, section: CustomSection, range: { from?: string; to?: string }) {
    const [records, infos] = await Promise.all([
      this.prisma.customRecord.findMany({
        where: {
          companyId: auth.companyId,
          sectionId: section.id,
          deletedAt: null,
          ...(auth.propertyIds ? { OR: [{ propertyId: null }, { propertyId: { in: auth.propertyIds } }] } : {}),
        },
        select: { custom: true, propertyId: true, createdAt: true },
        take: MAX_RECORDS,
      }),
      this.fieldInfos(section.key),
    ]);
    const def: MetricDef = {
      aggregate: metric.aggregate as MetricDef['aggregate'],
      valueField: metric.valueField,
      dateField: metric.dateField,
      filterField: metric.filterField,
      filterValue: metric.filterValue,
      groupBy: metric.groupBy,
    };
    const valueType = def.valueField ? infos.find((f) => f.key === def.valueField)?.type ?? null : null;
    // a value field removed by the platform team: nothing to add up any more
    if (def.aggregate !== 'COUNT' && !valueType) return { value: null, count: 0, groups: [], format: 'number' as const };
    return { ...compute(def, records, range, valueType), format: formatOf(def, valueType) };
  }

  /** Dashboard widget: value of each indicator marked for the dashboard, over its period. */
  async dashboard(auth: UserAuth) {
    const today = omanDay(new Date());
    const list = (await this.visible(auth)).filter((x) => x.metric.onDashboard);
    return Promise.all(
      list.map(async ({ metric, section, root }) => {
        const range = periodRange(metric.period as Period, today);
        const r = await this.compute(auth, metric, section, range);
        return { id: metric.id, nameAr: metric.nameAr, nameEn: metric.nameEn, period: metric.period, value: r.value, count: r.count, format: r.format, rootKey: root.key, icon: root.icon };
      }),
    );
  }
}

const shape = (m: Metric, section: CustomSection, root: CustomSection) => ({
  id: m.id,
  nameAr: m.nameAr,
  nameEn: m.nameEn,
  section: section.key,
  rootKey: root.key,
  aggregate: m.aggregate,
  valueField: m.valueField,
  dateField: m.dateField,
  filterField: m.filterField,
  filterValue: m.filterValue,
  groupBy: m.groupBy,
  period: m.period,
});

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  /** Indicators the user may see (definitions). ?section=<top-level key> limits to one section and its sub-sections. */
  @AnyAuthenticated()
  @Get()
  async list(@Auth() auth: AuthContext, @Query('section') section?: string) {
    const list = await this.metrics.visible(this.user(auth));
    return list.filter((x) => !section || x.root.key === section).map(({ metric, section: s, root }) => shape(metric, s, root));
  }

  /** One indicator over a period (days YYYY-MM-DD, both optional), with its breakdown. */
  @AnyAuthenticated()
  @Get(':id')
  async result(@Auth() auth: AuthContext, @Param('id') id: string, @Query('from') from?: string, @Query('to') to?: string) {
    const user = this.user(auth);
    const found = (await this.metrics.visible(user)).find((x) => x.metric.id === id);
    if (!found) throw new NotFoundException('common.notFound');
    for (const [name, day] of [['from', from], ['to', to]] as const) {
      if (day && !DAY.test(day)) throw new BadRequestException({ message: 'validation.date', field: name });
    }
    const r = await this.metrics.compute(user, found.metric, found.section, { from: from || undefined, to: to || undefined });
    let properties: Record<string, string> = {};
    if (found.metric.groupBy === 'property') {
      const ids = r.groups.map((g) => g.key).filter((k): k is string => !!k);
      const rows = await this.prisma.property.findMany({ where: { id: { in: ids }, companyId: user.companyId }, select: { id: true, name: true } });
      properties = Object.fromEntries(rows.map((p) => [p.id, p.name]));
    }
    return { ...shape(found.metric, found.section, found.root), ...r, properties };
  }

  /** Indicators are computed from a company's records: platform admins only define them. */
  private user(auth: AuthContext): UserAuth {
    if (auth.kind !== 'user') throw new ForbiddenException('auth.forbidden');
    return auth;
  }
}

@AdminOnly()
@Controller('admin/metrics')
export class AdminMetricsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly activity: ActivityService,
  ) {}

  @Get()
  list() {
    return this.prisma.metric.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }

  @Post()
  async create(@Auth() auth: AdminAuth, @Body() input: unknown) {
    const src = v.body(input);
    const section = await this.section(String(src.section ?? ''));
    const def = await this.definition(section, src);
    const count = await this.prisma.metric.count();
    const row = await this.prisma.metric.create({
      data: {
        ...this.texts(src, true),
        ...this.toData(def),
        section: section.key,
        onDashboard: v.optionalBoolean(src, 'onDashboard') ?? true,
        period: src.period !== undefined ? v.oneOf(src, 'period', PERIODS) : 'MONTH',
        sortOrder: count + 1,
      } as Prisma.MetricCreateInput,
    });
    await this.activity.log(auth, { action: 'metric.create', entity: 'Metric', entityId: row.id, details: { section: section.key, aggregate: def.aggregate } });
    return row;
  }

  /** Edit an indicator. Its section is fixed once created; the definition is checked again as a whole. */
  @Patch(':id')
  async update(@Auth() auth: AdminAuth, @Param('id') id: string, @Body() input: unknown) {
    const row = await this.find(id);
    const src = v.body(input);
    const data: Prisma.MetricUpdateInput = { ...this.texts(src, false) };
    const defKeys = ['aggregate', 'valueField', 'dateField', 'filterField', 'filterValue', 'groupBy'] as const;
    if (defKeys.some((k) => src[k] !== undefined)) {
      const section = await this.section(row.section);
      const merged = Object.fromEntries(defKeys.map((k) => [k, src[k] !== undefined ? src[k] : row[k]]));
      Object.assign(data, this.toData(await this.definition(section, merged)));
    }
    if (src.onDashboard !== undefined) data.onDashboard = v.optionalBoolean(src, 'onDashboard');
    if (src.period !== undefined) data.period = v.oneOf(src, 'period', PERIODS);
    if (src.isActive !== undefined) data.isActive = v.optionalBoolean(src, 'isActive');
    const updated = await this.prisma.metric.update({ where: { id }, data });
    await this.activity.log(auth, { action: 'metric.update', entity: 'Metric', entityId: id, details: { fields: Object.keys(data) } });
    return updated;
  }

  @Post(':id/move')
  async move(@Auth() auth: AdminAuth, @Param('id') id: string, @Body() input: unknown) {
    await this.find(id);
    const dir = v.oneOf(v.body(input), 'direction', ['up', 'down'] as const);
    const list = await this.prisma.metric.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    const i = list.findIndex((r) => r.id === id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return { ok: true };
    [list[i], list[j]] = [list[j], list[i]];
    await this.prisma.$transaction(list.map((r, k) => this.prisma.metric.update({ where: { id: r.id }, data: { sortOrder: k + 1 } })));
    await this.activity.log(auth, { action: 'metric.move', entity: 'Metric', entityId: id, details: { direction: dir } });
    return { ok: true };
  }

  /** Default: hidden everywhere (restorable). ?purge=1 deletes it for good (no data is lost: records stay). */
  @Delete(':id')
  async remove(@Auth() auth: AdminAuth, @Param('id') id: string, @Query('purge') purge?: string) {
    await this.find(id);
    if (purge === '1') await this.prisma.metric.delete({ where: { id } });
    else await this.prisma.metric.update({ where: { id }, data: { isActive: false } });
    await this.activity.log(auth, { action: purge === '1' ? 'metric.purge' : 'metric.deactivate', entity: 'Metric', entityId: id });
    return { ok: true };
  }

  // ---------------------------------------------------------------- helpers

  private async find(id: string) {
    const row = await this.prisma.metric.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('common.notFound');
    return row;
  }

  private async section(key: string) {
    const section = key ? await this.prisma.customSection.findUnique({ where: { key } }) : null;
    if (!section || !section.isActive) throw new BadRequestException({ message: 'validation.invalid', field: 'section' });
    return section;
  }

  private async definition(section: CustomSection, src: Record<string, unknown>): Promise<MetricDef> {
    const checked = checkDefinition(src, await this.metrics.fieldInfos(section.key), section.withProperty);
    if (!checked.ok) throw new BadRequestException({ message: checked.code, field: checked.field });
    return checked.value;
  }

  private toData(def: MetricDef) {
    return {
      aggregate: def.aggregate,
      valueField: def.valueField,
      dateField: def.dateField,
      filterField: def.filterField,
      filterValue: def.filterValue === null ? Prisma.DbNull : (def.filterValue as Prisma.InputJsonValue),
      groupBy: def.groupBy,
    };
  }

  private texts(src: Record<string, unknown>, creating: boolean) {
    const data: { nameAr?: string; nameEn?: string } = {};
    if (creating || src.nameAr !== undefined) data.nameAr = v.requiredString(src, 'nameAr', 80);
    if (creating || src.nameEn !== undefined) data.nameEn = v.requiredString(src, 'nameEn', 80);
    return data;
  }
}

@Module({
  controllers: [MetricsController, AdminMetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
