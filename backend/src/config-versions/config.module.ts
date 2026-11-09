import { BadRequestException, Body, Controller, Get, Global, HttpCode, Injectable, Logger, Module, NotFoundException, OnModuleInit, Param, ParseIntPipe, Post } from '@nestjs/common';
import { Prisma, type ButtonOverride, type CustomButton, type CustomSection, type FieldDefinition, type Metric, type PrintTemplate } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import { AdminOnly, Auth, type AdminAuth } from '../common/auth-context.js';
import { setCustomSectionKeys } from '../common/sections.js';
import * as v from '../common/validate.js';
import { AREAS, diff, idOf, parentsFirst, type Area, type Row, type Snapshot } from './diff.js';

/** The published configuration, typed (rows come back from JSON: dates are ISO text). */
export type Published = {
  number: number;
  fields: FieldDefinition[];
  sections: CustomSection[];
  buttonOverrides: ButtonOverride[];
  customButtons: CustomButton[];
  templates: PrintTemplate[];
  metrics: Metric[];
};

/** How often a server re-checks whether another server published a new version. */
const RECHECK_MS = 15_000;
const ORDER = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

/**
 * Draft & publish (المسودة والنشر).
 * The platform team's pages edit the live tables — that is the DRAFT. Subscribers (forms, menus, buttons,
 * print templates, indicators, server-side checks) read the latest PUBLISHED version: a snapshot taken when
 * the team presses "Publish". "Discard" puts the draft back as published; any older version can be restored.
 * Not covered (they apply at once): plans and subscriptions, and permanent deletions of data.
 */
@Injectable()
export class ConfigService implements OnModuleInit {
  private readonly logger = new Logger(ConfigService.name);
  private cache: { at: number; value: Published } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.published();
    } catch (e) {
      // e.g. migration not applied yet — the first request will try again
      this.logger.warn(`Published configuration not loaded yet: ${(e as Error).message}`);
    }
  }

  /** The draft: what the platform team's pages show and edit. */
  async draft(): Promise<Snapshot> {
    const [fields, sections, buttonOverrides, customButtons, templates, metrics] = await Promise.all([
      this.prisma.fieldDefinition.findMany({ orderBy: ORDER }),
      this.prisma.customSection.findMany({ orderBy: ORDER }),
      this.prisma.buttonOverride.findMany({ orderBy: { key: 'asc' } }),
      this.prisma.customButton.findMany({ orderBy: ORDER }),
      this.prisma.printTemplate.findMany({ orderBy: ORDER }),
      this.prisma.metric.findMany({ orderBy: ORDER }),
    ]);
    return { fields, sections, buttonOverrides, customButtons, templates, metrics } as unknown as Snapshot;
  }

  /** What subscribers use. The very first time, the current configuration becomes version 1. */
  async published(): Promise<Published> {
    if (this.cache && Date.now() - this.cache.at < RECHECK_MS) return this.cache.value;
    let latest = await this.prisma.configVersion.findFirst({ orderBy: { number: 'desc' } });
    if (this.cache && latest && latest.number === this.cache.value.number) {
      this.cache.at = Date.now();
      return this.cache.value;
    }
    if (!latest) {
      latest = await this.prisma.configVersion.create({
        data: { number: 1, note: 'initial', snapshot: (await this.draft()) as unknown as Prisma.InputJsonValue, changes: [] },
      });
    }
    const snap = latest.snapshot as unknown as Snapshot;
    const value = { number: latest.number, ...Object.fromEntries(AREAS.map((a) => [a, snap[a] ?? []])) } as unknown as Published;
    this.cache = { at: Date.now(), value };
    // access keys of the sections subscribers see
    setCustomSectionKeys(value.sections.filter((s) => !s.parentId && s.isActive).map((s) => s.key));
    return value;
  }

  /** Is this section part of what subscribers see now? (then it must not be deleted for good) */
  async isPublishedSection(id: string): Promise<boolean> {
    return (await this.published()).sections.some((s) => s.id === id && s.isActive);
  }

  async status() {
    const [published, draft, latest] = await Promise.all([this.published(), this.draft(), this.prisma.configVersion.findFirst({ orderBy: { number: 'desc' } })]);
    return {
      number: published.number,
      publishedAt: latest?.createdAt ?? null,
      publishedByName: latest?.publishedByName ?? null,
      changes: diff(published as unknown as Snapshot, draft),
    };
  }

  async publish(auth: AdminAuth, note: string | undefined, changes?: ReturnType<typeof diff>) {
    const published = await this.published();
    const draft = await this.draft();
    const list = changes ?? diff(published as unknown as Snapshot, draft);
    if (!list.length) throw new BadRequestException({ message: 'config.nothingToPublish' });
    const admin = await this.prisma.platformAdmin.findUnique({ where: { id: auth.adminId }, select: { name: true } });
    const row = await this.prisma.configVersion.create({
      data: {
        number: published.number + 1,
        note: note ?? null,
        snapshot: draft as unknown as Prisma.InputJsonValue,
        changes: list as unknown as Prisma.InputJsonValue,
        publishedById: auth.adminId,
        publishedByName: admin?.name ?? null,
      },
    });
    this.cache = null;
    await this.published();
    return row;
  }

  /** Put the live tables (the draft) back to a snapshot. */
  async restoreDraft(snapshot: Snapshot) {
    const draft = await this.draft();
    await this.prisma.$transaction(async (tx) => {
      const db = tx as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown>; upsert: (a: unknown) => Promise<unknown>; update: (a: unknown) => Promise<unknown> }>;
      const model: Record<Area, string> = {
        fields: 'fieldDefinition',
        sections: 'customSection',
        buttonOverrides: 'buttonOverride',
        customButtons: 'customButton',
        templates: 'printTemplate',
        metrics: 'metric',
      };
      // 1) rows that the snapshot does not have
      for (const area of AREAS) {
        const keep = new Set((snapshot[area] ?? []).map((r) => idOf(area, r)));
        const extra = draft[area].filter((r) => !keep.has(idOf(area, r)));
        if (!extra.length) continue;
        if (area === 'sections') {
          // a section added in the draft may already hold records? (it cannot: subscribers never saw it) — switch off to be safe
          for (const r of [...parentsFirst(extra)].reverse()) {
            const hasRecords = await tx.customRecord.count({ where: { sectionId: String(r.id) } });
            const hasChildren = await tx.customSection.count({ where: { parentId: String(r.id) } });
            if (hasRecords || hasChildren) await tx.customSection.update({ where: { id: String(r.id) }, data: { isActive: false } });
            else await tx.customSection.delete({ where: { id: String(r.id) } });
          }
          continue;
        }
        const idField = area === 'buttonOverrides' ? 'key' : 'id';
        await db[model[area]].deleteMany({ where: { [idField]: { in: extra.map((r) => idOf(area, r)) } } });
      }
      // 2) rows of the snapshot, as they were (sections: parents first)
      for (const area of AREAS) {
        const rows = area === 'sections' ? parentsFirst(snapshot[area] ?? []) : snapshot[area] ?? [];
        const idField = area === 'buttonOverrides' ? 'key' : 'id';
        for (const r of rows) {
          const { createdAt, updatedAt, ...data } = r as Row;
          void updatedAt;
          // the only nullable JSON column: null must be written as a database NULL
          if (area === 'metrics' && data.filterValue === null) data.filterValue = Prisma.DbNull;
          await db[model[area]].upsert({ where: { [idField]: r[idField] }, create: { ...data, createdAt }, update: data });
        }
      }
    });
  }

  /** Throw away the draft: the live tables go back to the published version. */
  async discard() {
    const published = await this.published();
    await this.restoreDraft(published as unknown as Snapshot);
  }

  /** Bring back an older version: the draft becomes that version and is published as a new version. */
  async restore(auth: AdminAuth, number: number) {
    const version = await this.prisma.configVersion.findUnique({ where: { number } });
    if (!version) throw new NotFoundException('common.notFound');
    await this.restoreDraft(version.snapshot as unknown as Snapshot);
    const published = await this.published();
    const changes = diff(published as unknown as Snapshot, await this.draft());
    if (!changes.length) return { number: published.number };
    return this.publish(auth, `↺ v${number}`, changes);
  }
}

@AdminOnly()
@Controller('admin/config')
export class AdminConfigController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly activity: ActivityService,
  ) {}

  /** Published version + what the draft changes. */
  @Get()
  status() {
    return this.config.status();
  }

  @Get('versions')
  versions() {
    return this.prisma.configVersion.findMany({
      orderBy: { number: 'desc' },
      take: 50,
      select: { number: true, note: true, changes: true, publishedByName: true, createdAt: true },
    });
  }

  @HttpCode(200)
  @Post('publish')
  async publish(@Auth() auth: AdminAuth, @Body() input: unknown) {
    const note = v.optionalString(v.body(input), 'note', 300);
    const row = await this.config.publish(auth, note);
    await this.activity.log(auth, { action: 'config.publish', entity: 'ConfigVersion', entityId: String(row.number), details: { note, changes: (row.changes as unknown[]).length } });
    return { number: row.number };
  }

  @HttpCode(200)
  @Post('discard')
  async discard(@Auth() auth: AdminAuth) {
    await this.config.discard();
    await this.activity.log(auth, { action: 'config.discard', entity: 'ConfigVersion' });
    return this.config.status();
  }

  @HttpCode(200)
  @Post('versions/:number/restore')
  async restore(@Auth() auth: AdminAuth, @Param('number', ParseIntPipe) number: number) {
    const res = await this.config.restore(auth, number);
    await this.activity.log(auth, { action: 'config.restore', entity: 'ConfigVersion', entityId: String(number) });
    return { number: res.number };
  }
}

@Global()
@Module({
  controllers: [AdminConfigController],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigVersionsModule {}
