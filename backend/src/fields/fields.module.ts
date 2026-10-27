import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Global, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { Prisma, type FieldDefinition } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import { AdminOnly, AnyAuthenticated, Auth, type AdminAuth } from '../common/auth-context.js';
import * as v from '../common/validate.js';
import { CORE_FIELDS, ENTITIES, FIELD_TYPES, coreApplies, isCoreKey, isEmpty, isEntity, mergeCustom, slugKey, type Entity, type FieldDef } from './rules.js';

/** Table behind each entity (for counting / purging extra-field values). */
const TABLE: Record<Entity, string> = {
  property: 'Property',
  unit: 'Unit',
  owner: 'Owner',
  tenant: 'Tenant',
  lease: 'Lease',
  expense: 'Expense',
  workOrder: 'WorkOrder',
  vendor: 'Vendor',
};

const CACHE_MS = 30_000;

/**
 * Configurable fields (الحقول). Every create/update of the 8 configurable records goes through `apply()`:
 *  - built-in optional fields that the platform team made required are enforced;
 *  - extra fields are validated by type and merged into the record's `custom` JSON.
 */
@Injectable()
export class FieldsService {
  private cache: { at: number; rows: FieldDefinition[] } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async all(): Promise<FieldDefinition[]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.rows;
    const rows = await this.prisma.fieldDefinition.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    this.cache = { at: Date.now(), rows };
    return rows;
  }

  invalidate() {
    this.cache = null;
  }

  /**
   * Validate a create/update body for an entity. Returns the `custom` value to save (undefined = unchanged).
   * On create every required field is checked; on update only the fields present in the body
   * (so quick actions like changing a status are not blocked by a field made required later).
   */
  async apply(entity: Entity, src: Record<string, unknown>, saved: { custom?: unknown; type?: unknown } | null): Promise<Prisma.InputJsonValue | undefined> {
    const rows = (await this.all()).filter((r) => r.entity === entity);
    const creating = !saved;
    const recordType = src.type ?? saved?.type;

    for (const core of CORE_FIELDS[entity]) {
      const rule = rows.find((r) => r.isCore && r.key === core.key);
      if (!rule?.required || !coreApplies(core, recordType)) continue;
      const present = Object.prototype.hasOwnProperty.call(src, core.key);
      if ((creating || present) && isEmpty(src[core.key], core.positive)) {
        throw new BadRequestException({ message: 'validation.required', field: core.key });
      }
    }

    const defs: FieldDef[] = rows
      .filter((r) => !r.isCore && r.isActive)
      .map((r) => ({ key: r.key, type: r.type, required: r.required, options: (r.options as { value: string }[]) ?? [] }));
    const submitted = src.custom && typeof src.custom === 'object' && !Array.isArray(src.custom) ? (src.custom as Record<string, unknown>) : undefined;
    if (!defs.length && !submitted) return undefined;
    const before = (saved?.custom && typeof saved.custom === 'object' ? saved.custom : {}) as Record<string, unknown>;
    const result = mergeCustom(defs, before, submitted, creating || !!submitted);
    if (!result.ok) throw new BadRequestException({ message: result.code, field: result.field });
    return submitted || creating ? (result.custom as Prisma.InputJsonValue) : undefined;
  }

  /** What the app needs to draw forms: per entity, built-in field rules and active extra fields. */
  async config() {
    const rows = await this.all();
    return Object.fromEntries(
      ENTITIES.map((entity) => [
        entity,
        {
          core: Object.fromEntries(
            rows
              .filter((r) => r.entity === entity && r.isCore)
              .map((r) => [r.key, { required: r.required, hidden: r.hidden, labelAr: r.labelAr, labelEn: r.labelEn }]),
          ),
          custom: rows
            .filter((r) => r.entity === entity && !r.isCore && r.isActive)
            .map((r) => ({ key: r.key, type: r.type, labelAr: r.labelAr, labelEn: r.labelEn, helpAr: r.helpAr, helpEn: r.helpEn, options: r.options, required: r.required })),
        },
      ]),
    );
  }

  /** How many records of the entity hold a value for this extra field. */
  async usage(entity: Entity, key: string): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${TABLE[entity]}" WHERE custom ? $1`, key);
    return Number(rows[0]?.n ?? 0);
  }

  /** Remove an extra field's values from every record (permanent). */
  async purge(entity: Entity, key: string): Promise<number> {
    return this.prisma.$executeRawUnsafe(`UPDATE "${TABLE[entity]}" SET custom = custom - $1 WHERE custom ? $1`, key);
  }
}

// ==================================================================== API

/** Read by every signed-in user (forms). */
@Controller('fields')
export class FieldsController {
  constructor(private readonly fields: FieldsService) {}

  @AnyAuthenticated()
  @Get()
  config() {
    return this.fields.config();
  }
}

type OptionInput = { value: string; labelAr: string; labelEn: string };

/** Platform team (لوحة الأدمن): define extra fields and the rules of built-in ones. Applies to all subscribers. */
@AdminOnly()
@Controller('admin/fields')
export class AdminFieldsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fields: FieldsService,
    private readonly activity: ActivityService,
  ) {}

  /** Built-in optional fields (with their rules) + extra fields, for one entity. */
  @Get()
  async list(@Query('entity') entity?: string) {
    const e = this.entity(entity);
    const rows = await this.prisma.fieldDefinition.findMany({ where: { entity: e }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    const core = CORE_FIELDS[e].map((c) => {
      const rule = rows.find((r) => r.isCore && r.key === c.key);
      return { key: c.key, required: rule?.required ?? false, hidden: rule?.hidden ?? false, labelAr: rule?.labelAr ?? null, labelEn: rule?.labelEn ?? null };
    });
    const custom = await Promise.all(rows.filter((r) => !r.isCore).map(async (r) => ({ ...r, usage: await this.fields.usage(e, r.key) })));
    return { entity: e, core, custom };
  }

  /** Rules of a built-in field: required, hidden, renamed (empty label = default name). */
  @Patch('core/:entity/:key')
  async core(@Auth() auth: AdminAuth, @Param('entity') entity: string, @Param('key') key: string, @Body() input: unknown) {
    const e = this.entity(entity);
    if (!isCoreKey(e, key)) throw new NotFoundException('common.notFound');
    const src = v.body(input);
    const data: Prisma.FieldDefinitionUpdateInput = {};
    if (src.required !== undefined) data.required = v.optionalBoolean(src, 'required');
    if (src.hidden !== undefined) data.hidden = v.optionalBoolean(src, 'hidden');
    if (src.labelAr !== undefined) data.labelAr = v.optionalString(src, 'labelAr', 80) ?? null;
    if (src.labelEn !== undefined) data.labelEn = v.optionalString(src, 'labelEn', 80) ?? null;
    if (data.required && data.hidden) throw new BadRequestException('fields.requiredHidden');
    const row = await this.prisma.fieldDefinition.upsert({
      where: { entity_key: { entity: e, key } },
      create: { entity: e, key, isCore: true, ...(data as Prisma.FieldDefinitionCreateInput) },
      update: data,
    });
    if (row.required && row.hidden) {
      await this.prisma.fieldDefinition.update({ where: { id: row.id }, data: { hidden: false } });
    }
    this.fields.invalidate();
    await this.activity.log(auth, { action: 'field.core', entity: 'FieldDefinition', entityId: row.id, details: { entity: e, key, ...src } });
    return { ok: true };
  }

  @Post()
  async create(@Auth() auth: AdminAuth, @Body() input: unknown) {
    const src = v.body(input);
    const e = this.entity(String(src.entity ?? ''));
    const data = this.data(src, true);
    let key = slugKey(v.optionalString(src, 'key', 40) || (data.labelEn as string));
    if (isCoreKey(e, key) || ['name', 'number', 'custom', 'id'].includes(key)) key = `x_${key}`;
    const taken = await this.prisma.fieldDefinition.findUnique({ where: { entity_key: { entity: e, key } } });
    if (taken) throw new ConflictException({ message: 'fields.keyTaken', field: 'labelEn' });
    const count = await this.prisma.fieldDefinition.count({ where: { entity: e, isCore: false } });
    const row = await this.prisma.fieldDefinition.create({ data: { ...(data as Prisma.FieldDefinitionCreateInput), entity: e, key, isCore: false, sortOrder: count + 1 } });
    this.fields.invalidate();
    await this.activity.log(auth, { action: 'field.create', entity: 'FieldDefinition', entityId: row.id, details: { entity: e, key, type: row.type } });
    return row;
  }

  /** Edit an extra field. The type cannot change once created (values would no longer match). */
  @Patch(':id')
  async update(@Auth() auth: AdminAuth, @Param('id') id: string, @Body() input: unknown) {
    const row = await this.find(id);
    const src = v.body(input);
    if (src.type !== undefined && src.type !== row.type) throw new BadRequestException({ message: 'fields.typeLocked', field: 'type' });
    const data = this.data(src, false, row.type);
    const updated = await this.prisma.fieldDefinition.update({ where: { id }, data });
    this.fields.invalidate();
    await this.activity.log(auth, { action: 'field.update', entity: 'FieldDefinition', entityId: id, details: data });
    return updated;
  }

  /** Move an extra field up or down in its form. */
  @Post(':id/move')
  async move(@Auth() auth: AdminAuth, @Param('id') id: string, @Body() input: unknown) {
    const row = await this.find(id);
    const dir = v.oneOf(v.body(input), 'direction', ['up', 'down'] as const);
    const list = await this.prisma.fieldDefinition.findMany({ where: { entity: row.entity, isCore: false }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    const i = list.findIndex((r) => r.id === id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return { ok: true };
    [list[i], list[j]] = [list[j], list[i]];
    await this.prisma.$transaction(list.map((r, k) => this.prisma.fieldDefinition.update({ where: { id: r.id }, data: { sortOrder: k + 1 } })));
    this.fields.invalidate();
    await this.activity.log(auth, { action: 'field.move', entity: 'FieldDefinition', entityId: id, details: { direction: dir } });
    return { ok: true };
  }

  /**
   * Delete an extra field. Default: it disappears from forms and its saved values are KEPT (restorable).
   * With ?purge=1 the definition and every saved value are removed permanently.
   */
  @Delete(':id')
  async remove(@Auth() auth: AdminAuth, @Param('id') id: string, @Query('purge') purge?: string) {
    const row = await this.find(id);
    const e = row.entity as Entity;
    if (purge === '1') {
      const removed = await this.fields.purge(e, row.key);
      await this.prisma.fieldDefinition.delete({ where: { id } });
      this.fields.invalidate();
      await this.activity.log(auth, { action: 'field.purge', entity: 'FieldDefinition', entityId: id, details: { entity: e, key: row.key, removed } });
      return { ok: true, purged: removed };
    }
    await this.prisma.fieldDefinition.update({ where: { id }, data: { isActive: false } });
    this.fields.invalidate();
    await this.activity.log(auth, { action: 'field.deactivate', entity: 'FieldDefinition', entityId: id, details: { entity: e, key: row.key } });
    return { ok: true };
  }

  // ---------------------------------------------------------------- helpers

  private entity(value?: string): Entity {
    if (!value || !isEntity(value)) throw new BadRequestException({ message: 'validation.invalid', field: 'entity' });
    return value;
  }

  private async find(id: string) {
    const row = await this.prisma.fieldDefinition.findUnique({ where: { id } });
    if (!row || row.isCore) throw new NotFoundException('common.notFound');
    return row;
  }

  private data(src: Record<string, unknown>, creating: boolean, type?: FieldDefinition['type']): Prisma.FieldDefinitionUpdateInput {
    const data: Prisma.FieldDefinitionUpdateInput = {};
    if (creating || src.labelAr !== undefined) data.labelAr = v.requiredString(src, 'labelAr', 80);
    if (creating || src.labelEn !== undefined) data.labelEn = v.requiredString(src, 'labelEn', 80);
    if (src.helpAr !== undefined) data.helpAr = v.optionalString(src, 'helpAr', 200) ?? null;
    if (src.helpEn !== undefined) data.helpEn = v.optionalString(src, 'helpEn', 200) ?? null;
    const fieldType = creating ? v.oneOf(src, 'type', FIELD_TYPES, 'TEXT') : type;
    if (creating) data.type = fieldType;
    if (src.required !== undefined) data.required = v.optionalBoolean(src, 'required');
    if (src.ownerVisible !== undefined) data.ownerVisible = v.optionalBoolean(src, 'ownerVisible');
    if (src.isActive !== undefined) data.isActive = v.optionalBoolean(src, 'isActive');
    if (fieldType === 'SELECT' || fieldType === 'MULTISELECT') {
      if (creating || src.options !== undefined) {
        const raw = Array.isArray(src.options) ? (src.options as Partial<OptionInput>[]) : [];
        const options = raw
          .map((o) => ({ labelAr: String(o.labelAr ?? '').trim(), labelEn: String(o.labelEn ?? '').trim(), value: String(o.value ?? '').trim() }))
          .filter((o) => o.labelAr && o.labelEn)
          .map((o) => ({ ...o, value: o.value || slugKey(o.labelEn) }));
        if (!options.length) throw new BadRequestException({ message: 'fields.optionsRequired', field: 'options' });
        if (new Set(options.map((o) => o.value)).size !== options.length) throw new BadRequestException({ message: 'fields.optionsDuplicate', field: 'options' });
        data.options = options as Prisma.InputJsonValue;
      }
    }
    return data;
  }
}

@Global()
@Module({
  controllers: [FieldsController, AdminFieldsController],
  providers: [FieldsService],
  exports: [FieldsService],
})
export class FieldsModule {}
