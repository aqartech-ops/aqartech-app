import { BadRequestException, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { PageText } from './recognize.js';

// Our own OCR engine (محرك القراءة): runs inside this server — no outside service, images never leave it.
// Built on Tesseract (open source, tesseract.js = WebAssembly, no native install) with our own image preparation
// (sharp): orientation from the camera, upscale small photos, grayscale, contrast, sharpen; then a second pass on
// the bottom strip of the image, where the ID card's MRZ lines and the cheque's MICR line are printed.
//
// Language files (Arabic + English) are downloaded once by `npm run ocr:setup` (run automatically after
// `npm install`) into backend/ocr-data — or OCR_DATA_DIR.

const LANGS = ['ara', 'eng'] as const;
const IDLE_MS = 10 * 60_000; // free the engine's memory after 10 idle minutes
const MAX_SIDE = 2600;
const MIN_WIDTH = 1600;

type Worker = {
  recognize(image: Buffer): Promise<{ data: { text: string; confidence: number } }>;
  setParameters(p: Record<string, string | number>): Promise<unknown>;
  terminate(): Promise<unknown>;
};
type TesseractModule = { createWorker(langs: string | string[], oem?: number, options?: Record<string, unknown>): Promise<Worker> };
type SharpFn = (input: Buffer, options?: Record<string, unknown>) => {
  rotate(): ReturnType<SharpFn>;
  grayscale(): ReturnType<SharpFn>;
  normalize(): ReturnType<SharpFn>;
  sharpen(): ReturnType<SharpFn>;
  resize(o: Record<string, unknown>): ReturnType<SharpFn>;
  extract(o: { left: number; top: number; width: number; height: number }): ReturnType<SharpFn>;
  png(): ReturnType<SharpFn>;
  toBuffer(o: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number } }>;
};

export const ocrDataDir = () => path.resolve(process.env.OCR_DATA_DIR || path.join(process.cwd(), 'ocr-data'));
export const ocrReady = () => LANGS.every((l) => existsSync(path.join(ocrDataDir(), `${l}.traineddata`)));

@Injectable()
export class OcrService implements OnModuleDestroy {
  private page: Promise<Worker> | null = null;
  private strip: Promise<Worker> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private idle: ReturnType<typeof setTimeout> | null = null;

  private async create(langs: string[], params: Record<string, string | number>): Promise<Worker> {
    const tesseract = (await import('tesseract.js')) as unknown as TesseractModule & { default?: TesseractModule };
    const createWorker = tesseract.createWorker ?? tesseract.default!.createWorker;
    const dir = ocrDataDir();
    const worker = await createWorker(langs, 1 /* LSTM engine */, { langPath: dir, cachePath: dir, gzip: false, cacheMethod: 'none' });
    await worker.setParameters(params);
    return worker;
  }

  private workers() {
    // page: Arabic + English, automatic layout. strip: machine lines only (A–Z, 0–9, "<"), one block.
    this.page ??= this.create([...LANGS], { tessedit_pageseg_mode: 3, preserve_interword_spaces: '1' });
    this.strip ??= this.create(['eng'], { tessedit_pageseg_mode: 6, tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<' });
    return Promise.all([this.page, this.strip]).catch((e) => {
      // a failed start is not kept: the next scan tries again
      this.page = this.strip = null;
      throw e;
    });
  }

  /** Camera photo → clean grayscale page (and its bottom strip) ready for the engine. */
  private async prepare(image: Buffer): Promise<{ page: Buffer; strip: Buffer }> {
    const sharp = ((await import('sharp')) as unknown as { default: SharpFn }).default;
    let base;
    try {
      base = await sharp(image, { failOn: 'none' }).rotate().grayscale().normalize().png().toBuffer({ resolveWithObject: true });
    } catch {
      throw new BadRequestException({ message: 'documents.badImage' });
    }
    const { width, height } = base.info;
    const scale = width < MIN_WIDTH ? MIN_WIDTH / width : Math.max(width, height) > MAX_SIDE ? MAX_SIDE / Math.max(width, height) : 1;
    const page = await sharp(base.data)
      .resize({ width: Math.round(width * scale) })
      .sharpen()
      .png()
      .toBuffer({ resolveWithObject: true });
    const top = Math.round(page.info.height * 0.66);
    const strip = await sharp(page.data)
      .extract({ left: 0, top, width: page.info.width, height: page.info.height - top })
      .png()
      .toBuffer({ resolveWithObject: true });
    return { page: page.data, strip: strip.data };
  }

  /** Read one image: the whole page + its bottom strip. One image at a time (the engine is CPU-bound). */
  read(image: Buffer): Promise<PageText> {
    if (!ocrReady()) throw new ServiceUnavailableException({ message: 'documents.ocrNotReady' });
    const job = this.queue.then(async () => {
      if (this.idle) clearTimeout(this.idle);
      try {
        const { page, strip } = await this.prepare(image);
        const [pageWorker, stripWorker] = await this.workers();
        const full = await pageWorker.recognize(page);
        const bottom = await stripWorker.recognize(strip);
        return { text: full.data.text, strip: bottom.data.text, confidence: full.data.confidence };
      } finally {
        this.idle = setTimeout(() => void this.shutdown(), IDLE_MS);
        (this.idle as { unref?: () => void }).unref?.();
      }
    });
    this.queue = job.catch(() => undefined);
    return job;
  }

  private async shutdown() {
    const workers = [this.page, this.strip];
    this.page = this.strip = null;
    await Promise.all(workers.map(async (w) => (w ? (await w.catch(() => null))?.terminate() : null)));
  }

  async onModuleDestroy() {
    if (this.idle) clearTimeout(this.idle);
    await this.shutdown();
  }
}
