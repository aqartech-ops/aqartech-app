// Downloads the OCR engine's language files (Arabic + English) once into backend/ocr-data (or OCR_DATA_DIR).
// Runs after `npm install`; run it by hand with `npm run ocr:setup`. Only these model files are downloaded —
// scanned images are always read on our own server and never sent anywhere.
// Never fails the install: if the download is not possible, it says so and scanning stays off until it is run again.
import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

const LANGS = ['ara', 'eng'];
const SOURCE = 'https://raw.githubusercontent.com/tesseract-ocr/tessdata/main';
const quiet = process.argv.includes('--quiet');
const dir = path.resolve(process.env.OCR_DATA_DIR || path.join(process.cwd(), 'ocr-data'));

const ok = (f) => existsSync(f) && statSync(f).size > 100_000;

async function main() {
  mkdirSync(dir, { recursive: true });
  for (const lang of LANGS) {
    const file = path.join(dir, `${lang}.traineddata`);
    if (ok(file)) {
      if (!quiet) console.log(`OCR: ${lang} ready`);
      continue;
    }
    console.log(`OCR: downloading ${lang} language file…`);
    const res = await fetch(`${SOURCE}/${lang}.traineddata`);
    if (!res.ok) throw new Error(`${lang}: HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length < 100_000) throw new Error(`${lang}: file too small`);
    writeFileSync(`${file}.part`, bytes);
    renameSync(`${file}.part`, file);
    console.log(`OCR: ${lang} ready (${(bytes.length / 1e6).toFixed(1)} MB)`);
  }
  console.log(`OCR engine ready in ${dir}`);
}

main().catch((e) => {
  console.warn(`OCR: could not download the language files (${e.message}). Scanning stays off — run "npm run ocr:setup" later.`);
});
