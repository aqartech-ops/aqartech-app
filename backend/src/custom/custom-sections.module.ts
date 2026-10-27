import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  OnModuleInit,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { CustomSection, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import { AdminOnly, AnyAuthenticated, Auth, type AdminAuth, type AuthContext, type UserAuth } from '../common/auth-context.js';
import { LEVEL_RANK, customSectionKey, setCustomSectionKeys } from '../common/sections.js';
import * as v from '../common/validate.js';
import { FieldsService } from '../fields/fields.module.js';
import { slugKey } from '../fields/rules.js';

const RESERVED = ['dashboard', 'properties', 'tenants', 'financials', 'maintenance', 'documents', 'owners', 'users', 'settings', 'companies', 'plans', 'fields', 'sections'];

/**
 * Sections created by the platform team (الأقسام المضافة) — definitions and the in-memory list of
 * top-level keys used by access checks (refreshed on start-up and after every change).
 */
@Injectable()
export class CustomSectionsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.refreshKeys();
  }

  async refreshKeys() {
    const top = await this.prisma.customSection.findMany({ where: { parentId: null, isActive: true }, select: { key: true } });
    setCustomSectionKeys(top.map((s) => s.key));
  }

  /** Definitions the app needs: sections (with sub-sections) — fields come from GET /fields ("cs:<key>"). */
  async list(activeOnly = true) {
    return this.prisma.customSection.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async byKey(key: string) {
    const section = await this.prisma.customSection.findUnique({ where: { key } });
    if (!section || !section.isActive) throw new NotFoundException('common.notFound');
    return section;
  }

  /** The top-level section whose permission applies (a sub-section follows its parent). */
  async root(section: CustomSection): Promise<CustomSection> {
    let current = section;
    for (let i = 0; current.parentId && i < 5; i += 1) {
      const parent = await this.prisma.customSection.findUnique({ where: { id: current.parentId } });
      if (!parent) break;
      current = parent;
    }
    return current;
  }
}

// ==================================================================== admin: define sections

@AdminOnly()
@Controller('admin/custom-sections')
export class AdminCustomSectionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sections: CustomSectionsService,
    private readonly fields: FieldsService,
    private readonly activity: ActivityService,
  ) {}

  @Get()
  async list() {
    const rows = await this.sections.list(false);
    const counts = await this.prisma.customRecord.groupBy({ by: ['sectionId'], where: { deletedAt: null }, _count: { _all: true } });
    const countOf = new Map(counts.map((c) => [c.sectionId, c._count._all]));
    return rows.map((r) => ({ ...r, records: countOf.get(r.id) ?? 0 }));
  }

  @Post()
  async create(@Auth() auth: AdminAuth, @Body() input: unknown) {
    const src = v.body(input);
    const nameAr = v.requiredString(src, 'nameAr', 60);
    const nameEn = v.requiredString(src, 'nameEn', 60);
    let parentId: string | null = v.optionalString(src, 'parentId', 60) ?? null;
    if (parentId) {
      const parent = await this.prisma.customSection.findUnique({ where: { id: parentId } });
      if (!parent) throw new NotFoundException({ message: 'common.notFound', field: 'parentId' });
      parentId = parent.id;
    }
    let key = slugKey(v.optionalString(src, 'key', 40) || nameEn);
    if (RESERVED.includes(key) || key === 'field') key = `${key}_s`;
    if (await this.prisma.customSection.findUnique({ where: { key } })) throw new ConflictException({ message: 'sections.keyTaken', field: 'nameEn' });
    const count = await this.prisma.customSection.count({ where: { parentId } });
    const section = await this.prisma.customSection.create({
      data: {
        key,
        nameAr,
        nameEn,
        icon: v.optionalString(src, 'icon', 60) ?? 'folder-outline',
        parentId,
        withProperty: v.optionalBoolean(src, 'withProperty') ?? false,
        sortOrder: count + 1,
      },
    });
    // a new top-level section is switched on in every plan unless asked otherwise (the admin can change it per plan)
    if (!parentId && v.optionalBoolean(src, 'addToPlans') !== false) {
      const plans = await this.prisma.plan.findMany({ select: { id: true, features: true } });
      await this.prisma.$transaction(
        plans.map((p) => this.prisma.plan.update({ where: { id: p.id }, data: { features: [...new Set([...p.features, customSectionKey(key)])] } })),
      );
    }
    await this.sections.refreshKeys();
    this.fields.invalidate();
    await this.activity.log(auth, { action: 'section.create', entity: 'CustomSection', entityId: section.id, details: { key, nameEn, parentId } });
    return section;
  }

  @Patch(':id')
  async update(@Auth() auth: AdminAuth, @Param('id') id: string, @Body() input: unknown) {
    await this.find(id);
    const src = v.body(input);
    const data: Prisma.CustomSectionUpdateInput = {};
    if (src.nameAr !== undefined) data.nameAr = v.requiredString(src, 'nameAr', 60);
    if (src.nameEn !== undefined) data.nameEn = v.requiredString(src, 'nameEn', 60);
    if (src.icon !== undefined) data.icon = v.optionalString(src, 'icon', 60) ?? 'folder-outline';
    if (src.withProperty !== undefined) data.withProperty = v.optionalBoolean(src, 'withProperty');
    if (src.titleKey !== undefined) data.titleKey = v.optionalString(src, 'titleKey', 60) ?? null;
    if (src.isActive !== undefined) data.isActive = v.optionalBoolean(src, 'isActive');
    const section = await this.prisma.customSection.update({ where: { id }, data });
    await this.sections.refreshKeys();
    this.fields.invalidate();
    await this.activity.log(auth, { action: 'section.update', entity: 'CustomSection', entityId: id, details: data });
    return section;
  }

  @Post(':id/move')
  async move(@Auth() auth: AdminAuth, @Param('id') id: string, @Body() input: unknown) {
    const section = await this.find(id);
    const dir = v.oneOf(v.body(input), 'direction', ['up', 'down'] as const);
    const list = await this.prisma.customSection.findMany({ where: { parentId: section.parentId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    const i = list.findIndex((r) => r.id === id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (j >= 0 && j < list.length) {
      [list[i], list[j]] = [list[j], list[i]];
      await this.prisma.$transaction(list.map((r, k) => this.prisma.customSection.update({ where: { id: r.id }, data: { sortOrder: k + 1 } })));
    }
    await this.activity.log(auth, { action: 'section.move', entity: 'CustomSection', entityId: id, details: { direction: dir } });
    return { ok: true };
  }

  /**
   * Delete: by default the section is switched off (hidden from menus; records kept, restorable).
   * With ?purge=1 and no records left anywhere, the definition and its fields are removed.
   */
  @Delete(':id')
  async remove(@Auth() auth: AdminAuth, @Param('id') id: string, @Query('purge') purge?: string) {
    const section = await this.find(id);
    if (purge === '1') {
      const children = await this.prisma.customSection.count({ where: { parentId: id } });
      const records = await this.prisma.customRecord.count({ where: { sectionId: id } });
      if (children || records) throw new BadRequestException({ message: 'sections.notEmpty', records, children });
      await this.prisma.fieldDefinition.deleteMany({ where: { entity: `cs:${section.key}` } });
      await this.prisma.customSection.delete({ where: { id } });
    } else {
      await this.prisma.customSection.update({ where: { id }, data: { isActive: false } });
    }
    await this.sections.refreshKeys();
    this.fields.invalidate();
    await this.activity.log(auth, { action: purge === '1' ? 'section.purge' : 'section.deactivate', entity: 'CustomSection', entityId: id, details: { key: section.key } });
    return { ok: true };
  }

  private async find(id: string) {
    const section = await this.prisma.customSection.findUnique({ where: { id } });
    if (!section) throw new NotFoundException('common.notFound');
    return section;
  }
}

// ==================================================================== company: records

@Injectable()
export class CustomRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sections: CustomSectionsService,
    private readonly fields: FieldsService,
    private readonly activity: ActivityService,
  ) {}

  /** Section + the caller's level on it (sub-sections follow their top-level section). */
  async access(auth: UserAuth, key: string, need: 'VIEW' | 'EDIT') {
    const section = await this.sections.byKey(key);
    const root = await this.sections.root(section);
    const level = auth.access[customSectionKey(root.key)] ?? 'HIDDEN';
    if (LEVEL_RANK[level] < LEVEL_RANK[need]) throw new ForbiddenException('auth.noPermission');
    return section;
  }

  async list(auth: UserAuth, key: string, query: { parentRecordId?: string; propertyId?: string; trash?: string }) {
    const section = await this.access(auth, key, 'VIEW');
    const where: Prisma.CustomRecordWhereInput = {
      companyId: auth.companyId,
      sectionId: section.id,
      deletedAt: query.trash === '1' ? { not: null } : null,
      ...this.scope(auth),
    };
    if (section.parentId) {
      if (!query.parentRecordId) throw new BadRequestException({ message: 'validation.required', field: 'parentRecordId' });
      where.parentRecordId = query.parentRecordId;
    }
    if (query.propertyId) where.propertyId = query.propertyId;
    return this.prisma.customRecord.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
  }

  async get(auth: UserAuth, key: string, id: string) {
    const section = await this.access(auth, key, 'VIEW');
    return this.find(auth, section.id, id);
  }

  async create(auth: UserAuth, key: string, input: unknown) {
    const section = await this.access(auth, key, 'EDIT');
    const src = v.body(input);
    let parentRecordId: string | null = null;
    if (section.parentId) {
      parentRecordId = v.requiredString(src, 'parentRecordId', 60);
      await this.find(auth, section.parentId, parentRecordId);
    }
    const propertyId = section.withProperty ? await this.property(auth, v.optionalString(src, 'propertyId', 60) ?? null) : null;
    const custom = await this.fields.apply(`cs:${section.key}`, src, null);
    const record = await this.prisma.customRecord.create({
      data: { companyId: auth.companyId, sectionId: section.id, parentRecordId, propertyId, custom: custom ?? {}, createdById: auth.userId },
    });
    await this.activity.log(auth, { action: 'record.create', entity: `cs:${section.key}`, entityId: record.id });
    return record;
  }

  async update(auth: UserAuth, key: string, id: string, input: unknown) {
    const section = await this.access(auth, key, 'EDIT');
    const saved = await this.find(auth, section.id, id);
    const src = v.body(input);
    const data: Prisma.CustomRecordUncheckedUpdateInput = {};
    if (section.withProperty && src.propertyId !== undefined) data.propertyId = await this.property(auth, v.optionalString(src, 'propertyId', 60) ?? null);
    const custom = await this.fields.apply(`cs:${section.key}`, src, saved);
    if (custom !== undefined) data.custom = custom;
    const record = await this.prisma.customRecord.update({ where: { id }, data });
    await this.activity.log(auth, { action: 'record.update', entity: `cs:${section.key}`, entityId: id, details: { custom: src.custom } });
    return record;
  }

  /** To the trash (restorable). */
  async remove(auth: UserAuth, key: string, id: string) {
    const section = await this.access(auth, key, 'EDIT');
    await this.find(auth, section.id, id);
    await this.prisma.customRecord.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.activity.log(auth, { action: 'record.delete', entity: `cs:${section.key}`, entityId: id });
    return { ok: true };
  }

  async restore(auth: UserAuth, key: string, id: string) {
    const section = await this.access(auth, key, 'EDIT');
    const record = await this.prisma.customRecord.findFirst({ where: { id, companyId: auth.companyId, sectionId: section.id, deletedAt: { not: null } } });
    if (!record) throw new NotFoundException('common.notFound');
    await this.prisma.customRecord.update({ where: { id }, data: { deletedAt: null } });
    await this.activity.log(auth, { action: 'record.restore', entity: `cs:${section.key}`, entityId: id });
    return { ok: true };
  }

  private async find(auth: UserAuth, sectionId: string, id: string) {
    const record = await this.prisma.customRecord.findFirst({ where: { id, companyId: auth.companyId, sectionId, deletedAt: null, ...this.scope(auth) } });
    if (!record) throw new NotFoundException('common.notFound');
    return record;
  }

  private async property(auth: UserAuth, propertyId: string | null) {
    if (!propertyId) {
      if (auth.propertyIds) throw new BadRequestException({ message: 'expense.propertyRequired', field: 'propertyId' });
      return null;
    }
    const property = await this.prisma.property.findFirst({ where: { id: propertyId, companyId: auth.companyId, deletedAt: null }, select: { id: true } });
    if (!property || (auth.propertyIds && !auth.propertyIds.includes(property.id))) throw new NotFoundException({ message: 'common.notFound', field: 'propertyId' });
    return property.id;
  }

  /** Users limited to some properties see records of those properties and records not linked to any. */
  private scope(auth: UserAuth): Prisma.CustomRecordWhereInput {
    return auth.propertyIds ? { OR: [{ propertyId: null }, { propertyId: { in: auth.propertyIds } }] } : {};
  }
}

@Controller('custom')
export class CustomRecordsController {
  constructor(
    private readonly records: CustomRecordsService,
    private readonly sections: CustomSectionsService,
  ) {}

  /** Definitions of the sections (menu, names, icons, sub-sections) — any signed-in user. */
  @AnyAuthenticated()
  @Get('sections')
  sectionsList() {
    return this.sections.list(true);
  }

  @AnyAuthenticated()
  @Get(':key/records')
  list(@Auth() auth: AuthContext, @Param('key') key: string, @Query('parentRecordId') parentRecordId?: string, @Query('propertyId') propertyId?: string, @Query('trash') trash?: string) {
    return this.records.list(this.user(auth), key, { parentRecordId, propertyId, trash });
  }

  @AnyAuthenticated()
  @Get(':key/records/:id')
  get(@Auth() auth: AuthContext, @Param('key') key: string, @Param('id') id: string) {
    return this.records.get(this.user(auth), key, id);
  }

  @AnyAuthenticated()
  @Post(':key/records')
  create(@Auth() auth: AuthContext, @Param('key') key: string, @Body() body: unknown) {
    return this.records.create(this.user(auth), key, body);
  }

  @AnyAuthenticated()
  @Patch(':key/records/:id')
  update(@Auth() auth: AuthContext, @Param('key') key: string, @Param('id') id: string, @Body() body: unknown) {
    return this.records.update(this.user(auth), key, id, body);
  }

  @AnyAuthenticated()
  @Delete(':key/records/:id')
  remove(@Auth() auth: AuthContext, @Param('key') key: string, @Param('id') id: string) {
    return this.records.remove(this.user(auth), key, id);
  }

  @AnyAuthenticated()
  @Post(':key/records/:id/restore')
  restore(@Auth() auth: AuthContext, @Param('key') key: string, @Param('id') id: string) {
    return this.records.restore(this.user(auth), key, id);
  }

  /** Records belong to companies: platform admins only manage definitions. */
  private user(auth: AuthContext): UserAuth {
    if (auth.kind !== 'user') throw new ForbiddenException('auth.forbidden');
    return auth;
  }
}

@Module({
  controllers: [AdminCustomSectionsController, CustomRecordsController],
  providers: [CustomSectionsService, CustomRecordsService],
  exports: [CustomSectionsService],
})
export class CustomSectionsModule {}
