import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { Prisma, type DocumentKind } from '@prisma/client';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from '../common/activity.service.js';
import { Auth, RequirePermission, type UserAuth } from '../common/auth-context.js';
import { LEVEL_RANK } from '../common/sections.js';
import * as v from '../common/validate.js';
import { propertyScope } from '../properties/properties.service.js';
import { OcrService, ocrReady } from './ocr.service.js';
import { recognize, type DocKind } from './recognize.js';

// Documents (المستندات): files attached to records, kept on our server, opened only through the API.
// Recognition (قراءة المستندات): our own OCR engine reads an image and suggests the fields — nothing is saved
// until the staff member checks them; their corrections are kept to improve the engine later.

export const ENTITIES = ['tenant', 'owner', 'property', 'unit', 'lease', 'cheque'] as const;
export type Entity = (typeof ENTITIES)[number];
/** The section a record belongs to: its documents follow that section's access too. */
const SECTION: Record<Entity, string> = { tenant: 'tenants', owner: 'owners', property: 'properties', unit: 'properties', lease: 'tenants', cheque: 'financials' };

const KINDS = ['CIVIL_ID', 'PASSPORT', 'CHEQUE', 'CONTRACT', 'INVOICE', 'PHOTO', 'OTHER'] as const satisfies readonly DocumentKind[];
const SIDES = ['FRONT', 'BACK'] as const;
const MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'] as const;
const MAX_FILE = 10 * 1024 * 1024; // 10 MB
const MAX_SCAN_IMAGES = 2; // e.g. ID card front + back

const storageDir = () => path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'storage'));

/** Base64 (or a data: URL) → bytes, with its type and size checked. */
function decodeFile(src: Record<string, unknown>, field = 'data'): { bytes: Buffer; mimeType: (typeof MIME)[number] } {
  let raw = src[field];
  let mime = src.mimeType;
  if (typeof raw !== 'string' || !raw) throw new BadRequestException({ message: 'validation.required', field });
  const dataUrl = raw.match(/^data:([^;,]+);base64,(.*)$/s);
  if (dataUrl) {
    mime ??= dataUrl[1];
    raw = dataUrl[2];
  }
  const mimeType = (typeof mime === 'string' ? mime.toLowerCase().replace('image/jpg', 'image/jpeg') : '') as (typeof MIME)[number];
  if (!MIME.includes(mimeType)) throw new BadRequestException({ message: 'documents.badType', field: 'mimeType' });
  const bytes = Buffer.from(raw as string, 'base64');
  if (!bytes.length) throw new BadRequestException({ message: 'documents.badImage', field });
  if (bytes.length > MAX_FILE) throw new BadRequestException({ message: 'documents.tooLarge', field });
  return { bytes, mimeType };
}

const canSee = (auth: UserAuth, entity: Entity) => LEVEL_RANK[auth.access[SECTION[entity]] ?? 'HIDDEN'] >= LEVEL_RANK.VIEW;
const inScope = (auth: UserAuth, propertyId: string | null) => !propertyId || !auth.propertyIds || auth.propertyIds.includes(propertyId);

const dayStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly ocr: OcrService,
  ) {}

  /** The record a document is attached to — must exist in the caller's company and property scope. */
  async target(auth: UserAuth, entity: Entity, entityId: string): Promise<{ propertyId: string | null; label: string }> {
    if (!canSee(auth, entity)) throw new ForbiddenException('auth.forbidden');
    const company = { companyId: auth.companyId };
    let found: { propertyId: string | null; label: string } | null = null;
    if (entity === 'tenant') {
      const r = await this.prisma.tenant.findFirst({ where: { ...company, id: entityId, deletedAt: null }, select: { name: true } });
      found = r && { propertyId: null, label: r.name };
    } else if (entity === 'owner') {
      const r = await this.prisma.owner.findFirst({ where: { ...company, id: entityId, deletedAt: null }, select: { name: true } });
      found = r && { propertyId: null, label: r.name };
    } else if (entity === 'property') {
      const r = await this.prisma.property.findFirst({ where: { ...propertyScope(auth), id: entityId }, select: { id: true, name: true } });
      found = r && { propertyId: r.id, label: r.name };
    } else if (entity === 'unit') {
      const r = await this.prisma.unit.findFirst({
        where: { ...company, id: entityId, deletedAt: null, property: propertyScope(auth) },
        select: { propertyId: true, number: true, property: { select: { name: true } } },
      });
      found = r && { propertyId: r.propertyId, label: `${r.property.name} · ${r.number}` };
    } else if (entity === 'lease') {
      const r = await this.prisma.lease.findFirst({ where: { ...company, id: entityId, deletedAt: null, property: propertyScope(auth) }, select: { propertyId: true, number: true } });
      found = r && { propertyId: r.propertyId, label: r.number };
    } else if (entity === 'cheque') {
      const r = await this.prisma.cheque.findFirst({ where: { ...company, id: entityId }, select: { propertyId: true, number: true, bankName: true } });
      found = r && inScope(auth, r.propertyId) ? { propertyId: r.propertyId, label: `${r.number} · ${r.bankName}` } : null;
    }
    if (!found) throw new NotFoundException('common.notFound');
    return found;
  }

  /** Names of the records the documents are attached to (for the all-documents list). */
  private async labels(auth: UserAuth, docs: { entity: string; entityId: string }[]): Promise<Map<string, string>> {
    const ids = (e: Entity) => [...new Set(docs.filter((d) => d.entity === e).map((d) => d.entityId))];
    const where = (e: Entity) => ({ companyId: auth.companyId, id: { in: ids(e) } });
    const [tenants, owners, properties, units, leases, cheques] = await Promise.all([
      this.prisma.tenant.findMany({ where: where('tenant'), select: { id: true, name: true } }),
      this.prisma.owner.findMany({ where: where('owner'), select: { id: true, name: true } }),
      this.prisma.property.findMany({ where: where('property'), select: { id: true, name: true } }),
      this.prisma.unit.findMany({ where: where('unit'), select: { id: true, number: true, property: { select: { name: true } } } }),
      this.prisma.lease.findMany({ where: where('lease'), select: { id: true, number: true } }),
      this.prisma.cheque.findMany({ where: where('cheque'), select: { id: true, number: true, bankName: true } }),
    ]);
    const map = new Map<string, string>();
    tenants.forEach((r) => map.set(`tenant:${r.id}`, r.name));
    owners.forEach((r) => map.set(`owner:${r.id}`, r.name));
    properties.forEach((r) => map.set(`property:${r.id}`, r.name));
    units.forEach((r) => map.set(`unit:${r.id}`, `${r.property.name} · ${r.number}`));
    leases.forEach((r) => map.set(`lease:${r.id}`, r.number));
    cheques.forEach((r) => map.set(`cheque:${r.id}`, `${r.number} · ${r.bankName}`));
    return map;
  }

  /** Documents of one record, or all of the company's (filters: kind, expiring within N days, trash). */
  async list(auth: UserAuth, q: { entity?: string; entityId?: string; kind?: string; expiring?: string; deleted?: string; q?: string }) {
    const visible = ENTITIES.filter((e) => canSee(auth, e));
    const where: Prisma.DocumentWhereInput = {
      companyId: auth.companyId,
      deletedAt: q.deleted === '1' ? { not: null } : null,
      entity: { in: [...visible] },
      ...(auth.propertyIds ? { OR: [{ propertyId: null }, { propertyId: { in: auth.propertyIds } }] } : {}),
    };
    if (q.entity) {
      const entity = v.oneOf({ entity: q.entity }, 'entity', ENTITIES);
      if (!q.entityId) throw new BadRequestException({ message: 'validation.required', field: 'entityId' });
      await this.target(auth, entity, q.entityId);
      Object.assign(where, { entity, entityId: q.entityId });
    }
    if (q.kind) where.kind = v.oneOf({ kind: q.kind }, 'kind', KINDS);
    if (q.expiring) {
      const days = Math.min(Math.max(Number(q.expiring) || 30, 1), 3650);
      where.expiryDate = { not: null, lte: new Date(dayStart().getTime() + days * 86_400_000) };
    }
    if (q.q?.trim()) where.name = { contains: q.q.trim(), mode: 'insensitive' };
    const docs = await this.prisma.document.findMany({
      where,
      orderBy: q.expiring ? [{ expiryDate: 'asc' }] : [{ createdAt: 'desc' }],
      take: 500,
      select: { id: true, entity: true, entityId: true, kind: true, side: true, name: true, mimeType: true, size: true, expiryDate: true, createdAt: true, deletedAt: true, extracted: true },
    });
    const labels = q.entity ? null : await this.labels(auth, docs);
    return docs.map((d) => ({ ...d, label: labels?.get(`${d.entity}:${d.entityId}`) ?? null }));
  }

  private async own(auth: UserAuth, id: string, deleted = false) {
    const doc = await this.prisma.document.findFirst({ where: { id, companyId: auth.companyId, deletedAt: deleted ? { not: null } : null } });
    if (!doc || !ENTITIES.includes(doc.entity as Entity) || !canSee(auth, doc.entity as Entity) || !inScope(auth, doc.propertyId)) throw new NotFoundException('common.notFound');
    return doc;
  }

  async create(auth: UserAuth, input: unknown) {
    const src = v.body(input);
    const entity = v.oneOf(src, 'entity', ENTITIES);
    const entityId = v.requiredString(src, 'entityId', 64);
    const target = await this.target(auth, entity, entityId);
    const { bytes, mimeType } = decodeFile(src);
    const id = randomUUID();
    const storageKey = `${auth.companyId}/${id}`;
    const file = path.join(storageDir(), storageKey);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
    const recognitionId = v.optionalString(src, 'recognitionId', 64);
    const doc = await this.prisma.document.create({
      data: {
        id,
        companyId: auth.companyId,
        entity,
        entityId,
        propertyId: target.propertyId,
        kind: v.oneOf(src, 'kind', KINDS, 'OTHER'),
        side: v.optionalEnum(src, 'side', SIDES) ?? null,
        name: v.optionalString(src, 'name', 160) ?? 'document',
        mimeType,
        size: bytes.length,
        storageKey,
        expiryDate: v.optionalDate(src, 'expiryDate') ?? null,
        extracted: src.extracted && typeof src.extracted === 'object' ? (src.extracted as Prisma.InputJsonValue) : Prisma.DbNull,
        recognitionId: recognitionId ?? null,
        createdById: auth.userId,
      },
    });
    await this.activity.log(auth, { action: 'document.create', entity: 'Document', entityId: doc.id, details: { entity, entityId, kind: doc.kind, name: doc.name } });
    const { storageKey: _key, ...row } = doc;
    return row;
  }

  async update(auth: UserAuth, id: string, input: unknown) {
    const doc = await this.own(auth, id);
    const src = v.body(input);
    const data: Prisma.DocumentUpdateInput = {};
    const name = v.optionalString(src, 'name', 160);
    if (name) data.name = name;
    const kind = v.optionalEnum(src, 'kind', KINDS);
    if (kind) data.kind = kind;
    const expiryDate = v.optionalDate(src, 'expiryDate');
    if (expiryDate !== undefined) data.expiryDate = expiryDate;
    const updated = await this.prisma.document.update({ where: { id: doc.id }, data });
    await this.activity.log(auth, { action: 'document.update', entity: 'Document', entityId: doc.id, details: { name: updated.name, kind: updated.kind, expiryDate: updated.expiryDate } });
    const { storageKey: _key, ...row } = updated;
    return row;
  }

  /** The file itself — every opening is written to the activity log. */
  async file(auth: UserAuth, id: string) {
    const doc = await this.own(auth, id);
    let bytes: Buffer;
    try {
      bytes = await readFile(path.join(storageDir(), doc.storageKey));
    } catch {
      throw new NotFoundException('documents.fileMissing');
    }
    await this.activity.log(auth, { action: 'document.view', entity: 'Document', entityId: doc.id, details: { name: doc.name } });
    return { id: doc.id, name: doc.name, mimeType: doc.mimeType, data: bytes.toString('base64') };
  }

  /** Soft delete: the file stays, the document goes to the trash and can be restored. */
  async remove(auth: UserAuth, id: string) {
    const doc = await this.own(auth, id);
    await this.prisma.document.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
    await this.activity.log(auth, { action: 'document.delete', entity: 'Document', entityId: doc.id, details: { name: doc.name } });
    return { ok: true };
  }

  async restore(auth: UserAuth, id: string) {
    const doc = await this.own(auth, id, true);
    await this.prisma.document.update({ where: { id: doc.id }, data: { deletedAt: null } });
    await this.activity.log(auth, { action: 'document.restore', entity: 'Document', entityId: doc.id, details: { name: doc.name } });
    return { ok: true };
  }

  /** Read 1–2 images with our engine → the document's kind and suggested fields. Nothing is saved but the reading. */
  async recognize(auth: UserAuth, input: unknown) {
    const src = v.body(input);
    const images = Array.isArray(src.images) ? src.images : [];
    if (!images.length || images.length > MAX_SCAN_IMAGES) throw new BadRequestException({ message: 'documents.scanImages', field: 'images' });
    // no hint (null / missing) = the engine decides what the document is
    const hint = src.hint === null || src.hint === '' ? undefined : v.optionalEnum(src, 'hint', ['CIVIL_ID', 'CHEQUE', 'CONTRACT', 'INVOICE', 'OTHER'] as const satisfies readonly DocKind[]);
    const files = images.map((img, i) => {
      const f = decodeFile(v.body(img), 'data');
      if (!f.mimeType.startsWith('image/')) throw new BadRequestException({ message: 'documents.scanImagesOnly', field: `images.${i}` });
      return f;
    });
    const pages = [];
    for (const f of files) pages.push(await this.ocr.read(f.bytes));
    const result = recognize(pages, hint ?? null);
    const saved = await this.prisma.ocrRecognition.create({
      data: { companyId: auth.companyId, kind: result.kind, hint: hint ?? null, result: { fields: result.fields, text: result.text } as Prisma.InputJsonValue, createdById: auth.userId },
    });
    return { recognitionId: saved.id, kind: result.kind, fields: result.fields, text: result.text };
  }

  /** What the staff member finally kept (their corrections) — the material to improve the engine later. */
  async feedback(auth: UserAuth, id: string, input: unknown) {
    const row = await this.prisma.ocrRecognition.findFirst({ where: { id, companyId: auth.companyId } });
    if (!row) throw new NotFoundException('common.notFound');
    const src = v.body(input);
    const corrected = src.fields && typeof src.fields === 'object' ? (src.fields as Prisma.InputJsonValue) : {};
    await this.prisma.ocrRecognition.update({ where: { id }, data: { corrected, correctedAt: new Date() } });
    return { ok: true };
  }

  status() {
    return { ocrReady: ocrReady() };
  }
}

@Controller('documents')
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @RequirePermission('documents', 'VIEW')
  @Get()
  list(@Auth() auth: UserAuth, @Query() q: Record<string, string>) {
    return this.docs.list(auth, q);
  }

  @RequirePermission('documents', 'VIEW')
  @Get('status')
  status() {
    return this.docs.status();
  }

  @RequirePermission('documents', 'VIEW')
  @Get(':id/file')
  file(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.docs.file(auth, id);
  }

  @RequirePermission('documents', 'EDIT')
  @Post()
  create(@Auth() auth: UserAuth, @Body() input: unknown) {
    return this.docs.create(auth, input);
  }

  @RequirePermission('documents', 'EDIT')
  @HttpCode(200)
  @Post('recognize')
  recognize(@Auth() auth: UserAuth, @Body() input: unknown) {
    return this.docs.recognize(auth, input);
  }

  @RequirePermission('documents', 'EDIT')
  @Patch('recognitions/:id')
  feedback(@Auth() auth: UserAuth, @Param('id') id: string, @Body() input: unknown) {
    return this.docs.feedback(auth, id, input);
  }

  @RequirePermission('documents', 'EDIT')
  @Patch(':id')
  update(@Auth() auth: UserAuth, @Param('id') id: string, @Body() input: unknown) {
    return this.docs.update(auth, id, input);
  }

  @RequirePermission('documents', 'EDIT')
  @Delete(':id')
  remove(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.docs.remove(auth, id);
  }

  @RequirePermission('documents', 'EDIT')
  @HttpCode(200)
  @Post(':id/restore')
  restore(@Auth() auth: UserAuth, @Param('id') id: string) {
    return this.docs.restore(auth, id);
  }
}

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, OcrService],
})
export class DocumentsModule {}
