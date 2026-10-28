import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import type { Prisma, PrintTemplate } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import { AdminOnly, AnyAuthenticated, Auth, type AdminAuth } from '../common/auth-context.js';
import * as v from '../common/validate.js';
import { BUTTON_ENTITIES } from '../buttons/rules.js';
import { PAPERS, checkBody, checkSignatures } from './rules.js';

const CACHE_MS = 30_000;

/**
 * Print templates (قوالب الطباعة), written by the platform team for every subscriber: letters, notices and forms
 * for a kind of record (tenant, lease, owner, property, or an added section). Each active template appears as a
 * print button on that record page; the app fills {{fields}} from the record and heads the page with the company.
 */
@Injectable()
export class TemplatesService {
  private cache: { at: number; rows: PrintTemplate[] } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async active() {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.rows;
    const rows = await this.prisma.printTemplate.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    this.cache = { at: Date.now(), rows };
    return rows;
  }

  invalidate() {
    this.cache = null;
  }
}

/** Read by every signed-in user (record pages). */
@Controller('print-templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @AnyAuthenticated()
  @Get()
  list() {
    return this.templates.active();
  }
}

@AdminOnly()
@Controller('admin/print-templates')
export class AdminTemplatesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplatesService,
    private readonly activity: ActivityService,
  ) {}

  /** Every template (removed ones too, to restore). */
  @Get()
  list() {
    return this.prisma.printTemplate.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }

  @Post()
  async create(@Auth() auth: AdminAuth, @Body() input: unknown) {
    const src = v.body(input);
    const entity = await this.entity(String(src.entity ?? ''));
    const data = this.data(src, true) as Prisma.PrintTemplateCreateInput;
    const count = await this.prisma.printTemplate.count({ where: { entity } });
    const row = await this.prisma.printTemplate.create({ data: { ...data, entity, sortOrder: count + 1 } });
    this.templates.invalidate();
    await this.activity.log(auth, { action: 'template.create', entity: 'PrintTemplate', entityId: row.id, details: { entity, name: row.nameEn } });
    return row;
  }

  /** Edit a template. The kind of record (entity) is fixed once created. */
  @Patch(':id')
  async update(@Auth() auth: AdminAuth, @Param('id') id: string, @Body() input: unknown) {
    await this.find(id);
    const data = this.data(v.body(input), false);
    const row = await this.prisma.printTemplate.update({ where: { id }, data });
    this.templates.invalidate();
    await this.activity.log(auth, { action: 'template.update', entity: 'PrintTemplate', entityId: id, details: { fields: Object.keys(data) } });
    return row;
  }

  @Post(':id/move')
  async move(@Auth() auth: AdminAuth, @Param('id') id: string, @Body() input: unknown) {
    const row = await this.find(id);
    const dir = v.oneOf(v.body(input), 'direction', ['up', 'down'] as const);
    const list = await this.prisma.printTemplate.findMany({ where: { entity: row.entity }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    const i = list.findIndex((r) => r.id === id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return { ok: true };
    [list[i], list[j]] = [list[j], list[i]];
    await this.prisma.$transaction(list.map((r, k) => this.prisma.printTemplate.update({ where: { id: r.id }, data: { sortOrder: k + 1 } })));
    this.templates.invalidate();
    await this.activity.log(auth, { action: 'template.move', entity: 'PrintTemplate', entityId: id, details: { direction: dir } });
    return { ok: true };
  }

  /** Default: removed from record pages (restorable). ?purge=1 deletes it for good. */
  @Delete(':id')
  async remove(@Auth() auth: AdminAuth, @Param('id') id: string, @Query('purge') purge?: string) {
    await this.find(id);
    if (purge === '1') await this.prisma.printTemplate.delete({ where: { id } });
    else await this.prisma.printTemplate.update({ where: { id }, data: { isActive: false } });
    this.templates.invalidate();
    await this.activity.log(auth, { action: purge === '1' ? 'template.purge' : 'template.deactivate', entity: 'PrintTemplate', entityId: id });
    return { ok: true };
  }

  // ---------------------------------------------------------------- helpers

  private async find(id: string) {
    const row = await this.prisma.printTemplate.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('common.notFound');
    return row;
  }

  /** tenant | lease | owner | property, or "cs:<key>" of an active top-level section. */
  private async entity(value: string): Promise<string> {
    if ((BUTTON_ENTITIES as readonly string[]).includes(value)) return value;
    if (value.startsWith('cs:')) {
      const section = await this.prisma.customSection.findUnique({ where: { key: value.slice(3) } });
      if (section && section.isActive && !section.parentId) return value;
    }
    throw new BadRequestException({ message: 'validation.invalid', field: 'entity' });
  }

  private data(src: Record<string, unknown>, creating: boolean): Prisma.PrintTemplateUpdateInput {
    const data: Prisma.PrintTemplateUpdateInput = {};
    if (creating || src.nameAr !== undefined) data.nameAr = v.requiredString(src, 'nameAr', 80);
    if (creating || src.nameEn !== undefined) data.nameEn = v.requiredString(src, 'nameEn', 80);
    if (src.titleAr !== undefined) data.titleAr = v.optionalString(src, 'titleAr', 120) ?? null;
    if (src.titleEn !== undefined) data.titleEn = v.optionalString(src, 'titleEn', 120) ?? null;
    for (const key of ['bodyAr', 'bodyEn'] as const) {
      if (src[key] === undefined) continue;
      if (typeof src[key] !== 'string') throw new BadRequestException({ message: 'validation.invalid', field: key });
      const body = (src[key] as string).replace(/\r\n/g, '\n');
      const check = checkBody(body);
      if (!check.ok) throw new BadRequestException({ message: check.code, field: key, detail: check.detail });
      data[key] = body;
    }
    if (creating && !String(src.bodyAr ?? '').trim() && !String(src.bodyEn ?? '').trim()) {
      throw new BadRequestException({ message: 'validation.required', field: 'bodyAr' });
    }
    if (src.signatures !== undefined) {
      const sig = checkSignatures(src.signatures);
      if (!sig.ok) throw new BadRequestException({ message: sig.code, field: 'signatures' });
      data.signatures = sig.value as Prisma.InputJsonValue;
    }
    if (src.paper !== undefined) data.paper = v.oneOf(src, 'paper', PAPERS);
    if (src.isActive !== undefined) data.isActive = v.optionalBoolean(src, 'isActive');
    return data;
  }
}

@Module({
  controllers: [TemplatesController, AdminTemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
