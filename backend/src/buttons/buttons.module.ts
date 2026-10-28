import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Put, Query } from '@nestjs/common';
import type { ButtonOverride, CustomButton, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import { AdminOnly, AnyAuthenticated, Auth, type AdminAuth } from '../common/auth-context.js';
import * as v from '../common/validate.js';
import { FieldsService } from '../fields/fields.module.js';
import { checkValue, type FieldDef } from '../fields/rules.js';
import { ACTIONS, BUTTON_ENTITIES, OVERRIDE_KEY, checkConfig, type Action } from './rules.js';

const CACHE_MS = 30_000;

/**
 * Buttons (الأزرار), set by the platform team for every subscriber:
 *  - built-in buttons of the app: rename (Arabic/English), change icon, hide;
 *  - new buttons on record pages, from the actions library (link, WhatsApp, call, email,
 *    set a field, new record in a section).
 * Hiding a button removes it from the interface; who may DO an action is still decided by role permissions on the server.
 */
@Injectable()
export class ButtonsService {
  private cache: { at: number; value: { overrides: Record<string, Omit<ButtonOverride, 'key' | 'updatedAt'>>; custom: CustomButton[] } } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async config() {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const [overrides, custom] = await Promise.all([
      this.prisma.buttonOverride.findMany(),
      this.prisma.customButton.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    ]);
    const value = {
      overrides: Object.fromEntries(overrides.map((o) => [o.key, { labelAr: o.labelAr, labelEn: o.labelEn, icon: o.icon, hidden: o.hidden }])),
      custom,
    };
    this.cache = { at: Date.now(), value };
    return value;
  }

  invalidate() {
    this.cache = null;
  }
}

/** Read by every signed-in user (every screen draws its buttons with it). */
@Controller('buttons')
export class ButtonsController {
  constructor(private readonly buttons: ButtonsService) {}

  @AnyAuthenticated()
  @Get()
  config() {
    return this.buttons.config();
  }
}

@AdminOnly()
@Controller('admin/buttons')
export class AdminButtonsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly buttons: ButtonsService,
    private readonly fields: FieldsService,
    private readonly activity: ActivityService,
  ) {}

  /** Overrides of built-in buttons + every added button (removed ones too, to restore). */
  @Get()
  async list() {
    const [overrides, custom] = await Promise.all([
      this.prisma.buttonOverride.findMany(),
      this.prisma.customButton.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    ]);
    return { overrides, custom };
  }

  // ---------------------------------------------------------------- built-in buttons

  /** Rename / re-icon / hide a built-in button. Empty values = back to the default; all empty = override removed. */
  @Put('overrides/:key')
  async override(@Auth() auth: AdminAuth, @Param('key') key: string, @Body() input: unknown) {
    if (!OVERRIDE_KEY.test(key) || key.length > 80) throw new BadRequestException({ message: 'validation.invalid', field: 'key' });
    const src = v.body(input);
    const data = {
      labelAr: v.optionalString(src, 'labelAr', 60) ?? null,
      labelEn: v.optionalString(src, 'labelEn', 60) ?? null,
      icon: this.icon(src) ?? null,
      hidden: v.optionalBoolean(src, 'hidden') ?? false,
    };
    if (!data.labelAr && !data.labelEn && !data.icon && !data.hidden) {
      await this.prisma.buttonOverride.deleteMany({ where: { key } });
    } else {
      await this.prisma.buttonOverride.upsert({ where: { key }, create: { key, ...data }, update: data });
    }
    this.buttons.invalidate();
    await this.activity.log(auth, { action: 'button.override', entity: 'ButtonOverride', entityId: key, details: data });
    return { ok: true };
  }

  // ---------------------------------------------------------------- added buttons

  @Post('custom')
  async create(@Auth() auth: AdminAuth, @Body() input: unknown) {
    const src = v.body(input);
    const entity = await this.entity(String(src.entity ?? ''));
    const action = v.oneOf(src, 'action', ACTIONS);
    const config = await this.config(entity, action, src.config);
    const count = await this.prisma.customButton.count({ where: { entity } });
    const row = await this.prisma.customButton.create({
      data: {
        entity,
        action,
        config,
        labelAr: v.requiredString(src, 'labelAr', 60),
        labelEn: v.requiredString(src, 'labelEn', 60),
        icon: this.icon(src) ?? 'gesture-tap-button',
        sortOrder: count + 1,
      },
    });
    this.buttons.invalidate();
    await this.activity.log(auth, { action: 'button.create', entity: 'CustomButton', entityId: row.id, details: { entity, action } });
    return row;
  }

  /** Edit an added button. The record type (entity) is fixed once created. */
  @Patch('custom/:id')
  async update(@Auth() auth: AdminAuth, @Param('id') id: string, @Body() input: unknown) {
    const row = await this.find(id);
    const src = v.body(input);
    const data: Prisma.CustomButtonUpdateInput = {};
    if (src.labelAr !== undefined) data.labelAr = v.requiredString(src, 'labelAr', 60);
    if (src.labelEn !== undefined) data.labelEn = v.requiredString(src, 'labelEn', 60);
    if (src.icon !== undefined) data.icon = this.icon(src) ?? 'gesture-tap-button';
    if (src.isActive !== undefined) data.isActive = v.optionalBoolean(src, 'isActive');
    if (src.action !== undefined || src.config !== undefined) {
      const action = src.action !== undefined ? v.oneOf(src, 'action', ACTIONS) : (row.action as Action);
      data.action = action;
      data.config = await this.config(row.entity, action, src.config ?? row.config);
    }
    const updated = await this.prisma.customButton.update({ where: { id }, data });
    this.buttons.invalidate();
    await this.activity.log(auth, { action: 'button.update', entity: 'CustomButton', entityId: id, details: data });
    return updated;
  }

  @Post('custom/:id/move')
  async move(@Auth() auth: AdminAuth, @Param('id') id: string, @Body() input: unknown) {
    const row = await this.find(id);
    const dir = v.oneOf(v.body(input), 'direction', ['up', 'down'] as const);
    const list = await this.prisma.customButton.findMany({ where: { entity: row.entity }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    const i = list.findIndex((r) => r.id === id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return { ok: true };
    [list[i], list[j]] = [list[j], list[i]];
    await this.prisma.$transaction(list.map((r, k) => this.prisma.customButton.update({ where: { id: r.id }, data: { sortOrder: k + 1 } })));
    this.buttons.invalidate();
    await this.activity.log(auth, { action: 'button.move', entity: 'CustomButton', entityId: id, details: { direction: dir } });
    return { ok: true };
  }

  /** Default: removed from record pages (restorable). ?purge=1 deletes it for good. */
  @Delete('custom/:id')
  async remove(@Auth() auth: AdminAuth, @Param('id') id: string, @Query('purge') purge?: string) {
    await this.find(id);
    if (purge === '1') await this.prisma.customButton.delete({ where: { id } });
    else await this.prisma.customButton.update({ where: { id }, data: { isActive: false } });
    this.buttons.invalidate();
    await this.activity.log(auth, { action: purge === '1' ? 'button.purge' : 'button.deactivate', entity: 'CustomButton', entityId: id });
    return { ok: true };
  }

  // ---------------------------------------------------------------- helpers

  private async find(id: string) {
    const row = await this.prisma.customButton.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('common.notFound');
    return row;
  }

  /** property | owner | tenant | lease, or "cs:<key>" of an active top-level section. */
  private async entity(value: string): Promise<string> {
    if ((BUTTON_ENTITIES as readonly string[]).includes(value)) return value;
    if (value.startsWith('cs:')) {
      const section = await this.prisma.customSection.findUnique({ where: { key: value.slice(3) } });
      if (section && section.isActive && !section.parentId) return value;
    }
    throw new BadRequestException({ message: 'validation.invalid', field: 'entity' });
  }

  /** A MaterialCommunityIcons name, e.g. "whatsapp" (empty = default). */
  private icon(src: Record<string, unknown>): string | undefined {
    const icon = v.optionalString(src, 'icon', 60);
    if (icon && !/^[a-z0-9-]+$/.test(icon)) throw new BadRequestException({ message: 'validation.invalid', field: 'icon' });
    return icon;
  }

  /** Action settings: shape (pure rules) + what needs the database. */
  private async config(entity: string, action: Action, raw: unknown): Promise<Prisma.InputJsonValue> {
    const checked = checkConfig(action, raw);
    if (!checked.ok) throw new BadRequestException({ message: checked.code, field: `config.${checked.field}` });
    const config = checked.value;

    if (action === 'SET_FIELD') {
      const def = await this.extraField(entity, String(config.field));
      if (!def) throw new BadRequestException({ message: 'buttons.unknownField', field: 'config.field' });
      const value = checkValue(def, config.value);
      if (!value.ok) throw new BadRequestException({ message: value.code, field: 'config.value' });
      config.value = value.value;
    }

    if (action === 'NEW_RECORD') {
      const target = await this.prisma.customSection.findUnique({ where: { key: String(config.section) } });
      if (!target || !target.isActive || target.parentId) throw new BadRequestException({ message: 'buttons.unknownSection', field: 'config.section' });
      for (const pair of config.copy as { to: string }[]) {
        if (!(await this.extraField(`cs:${target.key}`, pair.to))) throw new BadRequestException({ message: 'buttons.unknownField', field: 'config.copy' });
      }
    }
    return config as Prisma.InputJsonValue;
  }

  private async extraField(entity: string, key: string): Promise<FieldDef | null> {
    const row = (await this.fields.all()).find((r) => r.entity === entity && r.key === key && !r.isCore && r.isActive);
    return row ? { key: row.key, type: row.type, required: row.required, options: (row.options as { value: string }[]) ?? [] } : null;
  }
}

@Module({
  controllers: [ButtonsController, AdminButtonsController],
  providers: [ButtonsService],
})
export class ButtonsModule {}
