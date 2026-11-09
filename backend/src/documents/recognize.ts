// Document recognition (قراءة المستندات) — pure functions: OCR text in, document type + fields out.
// The OCR itself runs on our server (ocr.service.ts); nothing here touches the network or the database.
//
// Every field carries a confidence so the app can colour it and the staff member checks it before saving:
//   high   — verified (e.g. MRZ check digit matches)
//   medium — read next to its label / in its expected place
//   low    — a best guess (handwriting, no label)

export type Confidence = 'high' | 'medium' | 'low';
export type DocKind = 'CIVIL_ID' | 'CHEQUE' | 'CONTRACT' | 'INVOICE' | 'OTHER';
export type FieldValue = string | number | string[] | number[];
export type ReadField = { value: FieldValue; confidence: Confidence };
export type Fields = Record<string, ReadField>;

/** What the OCR read from one image: the whole page and (separately) its bottom strip, where MRZ/MICR lines live. */
export type PageText = { text: string; strip?: string; confidence?: number };

export type Recognition = { kind: DocKind; fields: Fields; text: string };

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

// ------------------------------------------------------------------ text helpers

/** Arabic-Indic / Persian digits and separators → Latin; tidy whitespace. */
export function normalize(text: string): string {
  return (text ?? '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.') // Arabic decimal separator
    .replace(/٬/g, ',') // Arabic thousands separator
    .replace(/[‎‏‪-‮]/g, '') // direction marks
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ');
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function validDate(y: number, m: number, d: number): string | null {
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // 31/02 etc.
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  يناير: 1, فبراير: 2, مارس: 3, أبريل: 4, ابريل: 4, مايو: 5, يونيو: 6, يوليو: 7, أغسطس: 8, اغسطس: 8, سبتمبر: 9, أكتوبر: 10, اكتوبر: 10, نوفمبر: 11, ديسمبر: 12,
};

type DateHit = { iso: string; index: number };

/** All dates in a text (dd/mm/yyyy, dd-mm-yy, yyyy/mm/dd, 12 Mar 2027 …), as ISO yyyy-mm-dd, in reading order. */
export function findDates(input: string): DateHit[] {
  const text = normalize(input);
  const hits: DateHit[] = [];
  const add = (iso: string | null, index: number) => {
    if (iso && !hits.some((h) => h.index === index)) hits.push({ iso, index });
  };
  for (const m of text.matchAll(/\b(\d{4})\s?[./-]\s?(\d{1,2})\s?[./-]\s?(\d{1,2})\b/g)) add(validDate(+m[1], +m[2], +m[3]), m.index!);
  for (const m of text.matchAll(/\b(\d{1,2})\s?[./-]\s?(\d{1,2})\s?[./-]\s?(\d{4}|\d{2})\b/g)) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    add(validDate(y, +m[2], +m[1]), m.index!);
  }
  for (const m of text.matchAll(/\b(\d{1,2})[\s-]+([A-Za-zء-ي]{3,9})[\s,-]+(\d{4})\b/g)) {
    const month = MONTHS[m[2].toLowerCase()];
    if (month) add(validDate(+m[3], month, +m[1]), m.index!);
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** The first date that follows (within a short distance) one of the labels. */
function dateAfter(text: string, labels: RegExp): string | null {
  const t = normalize(text);
  for (const m of t.matchAll(new RegExp(labels.source, 'gi'))) {
    const after = findDates(t.slice(m.index!, m.index! + m[0].length + 40));
    if (after.length) return after[0].iso;
  }
  return null;
}

/** OMR text ("1,250.500", "450/000", "450") → baisa. */
export function omrToBaisa(raw: string): number | null {
  const s = normalize(raw).replace(/[\s,]/g, '');
  const m = s.match(/^(\d{1,9})(?:[./](\d{1,3}))?$/);
  if (!m) return null;
  const baisa = Number(m[1]) * 1000 + (m[2] ? Number(m[2].padEnd(3, '0')) : 0);
  return Number.isSafeInteger(baisa) && baisa > 0 ? baisa : null;
}

const CURRENCY = /(?:R\.?\s?O\.?|OMR|O\.?M\.?R|ر\.?\s?ع\.?|ريال(?:\s+عماني)?|Rials?)/i;
const NUMBER = /(\d{1,3}(?:,\d{3})+(?:[./]\d{1,3})?|\d{1,9}(?:[./]\d{1,3})?)/;

/** Amounts written next to a currency, between ### / *** markers, or with three decimals (baisa). Most certain first. */
export function findAmounts(input: string): { baisa: number; confidence: Confidence }[] {
  const text = normalize(input);
  const out: { baisa: number; confidence: Confidence }[] = [];
  const push = (raw: string, confidence: Confidence) => {
    const baisa = omrToBaisa(raw);
    if (baisa !== null && !out.some((o) => o.baisa === baisa)) out.push({ baisa, confidence });
  };
  for (const m of text.matchAll(new RegExp(`${CURRENCY.source}\\s*[:#*=]*\\s*${NUMBER.source}`, 'gi'))) push(m[1], 'medium');
  for (const m of text.matchAll(new RegExp(`${NUMBER.source}\\s*[#*=]*\\s*${CURRENCY.source}`, 'gi'))) push(m[1], 'medium');
  for (const m of text.matchAll(/[#*=]{1,}\s*(\d[\d,]*(?:[./]\d{1,3})?)\s*[#*=/-]{1,}/g)) push(m[1], 'medium');
  for (const m of text.matchAll(/(?<![\d./-])(\d{1,3}(?:,\d{3})*|\d+)[.](\d{3})(?![\d./-])/g)) push(`${m[1]}.${m[2]}`, 'low');
  return out;
}

// ------------------------------------------------------------------ Omani banks

const BANKS: { en: string; ar: string; match: RegExp }[] = [
  { en: 'Bank Muscat', ar: 'بنك مسقط', match: /bank\s*muscat|بنك\s*مسقط|meethaq|ميثاق/i },
  { en: 'National Bank of Oman', ar: 'البنك الوطني العماني', match: /national\s*bank\s*of\s*oman|\bNBO\b|البنك\s*الوطني\s*العماني|muzn|مزن/i },
  { en: 'Sohar International', ar: 'صحار الدولي', match: /sohar\s*international|bank\s*sohar|صحار\s*الدولي|بنك\s*صحار/i },
  { en: 'Bank Dhofar', ar: 'بنك ظفار', match: /bank\s*dhofar|dhofar\s*bank|بنك\s*ظفار|maisarah|ميسرة/i },
  { en: 'OAB (Oman Arab Bank)', ar: 'بنك عمان العربي', match: /oman\s*arab\s*bank|\bOAB\b|العربي\s*العماني|عمان\s*العربي|al\s*yusr|اليسر/i },
  { en: 'Ahli Bank', ar: 'البنك الأهلي', match: /ahli\s*bank|البنك\s*الأهلي|البنك\s*الاهلي|al\s*hilal|الهلال/i },
  { en: 'HSBC Oman', ar: 'إتش إس بي سي عمان', match: /\bHSBC\b|اتش\s*اس\s*بي\s*سي|إتش\s*إس\s*بي\s*سي/i },
  { en: 'Bank Nizwa', ar: 'بنك نزوى', match: /bank\s*nizwa|بنك\s*نزوى/i },
  { en: 'Alizz Islamic Bank', ar: 'بنك العز الإسلامي', match: /alizz|al\s*izz|العز\s*الإسلامي|العز\s*الاسلامي/i },
  { en: 'Oman Housing Bank', ar: 'بنك الإسكان العماني', match: /oman\s*housing\s*bank|بنك\s*الإسكان|بنك\s*الاسكان/i },
  { en: 'Development Bank', ar: 'بنك التنمية العماني', match: /development\s*bank|بنك\s*التنمية/i },
  { en: 'Standard Chartered', ar: 'ستاندرد تشارترد', match: /standard\s*chartered|ستاندرد\s*تشارترد/i },
  { en: 'Qatar National Bank', ar: 'بنك قطر الوطني', match: /qatar\s*national\s*bank|\bQNB\b|بنك\s*قطر\s*الوطني/i },
  { en: 'Bank Melli Iran', ar: 'بنك ملي إيران', match: /bank\s*melli|بنك\s*ملي/i },
  { en: 'Bank of Baroda', ar: 'بنك بارودا', match: /bank\s*of\s*baroda|بنك\s*بارودا/i },
  { en: 'State Bank of India', ar: 'بنك الدولة الهندي', match: /state\s*bank\s*of\s*india|\bSBI\b/i },
  { en: 'Habib Bank', ar: 'بنك حبيب', match: /habib\s*bank|بنك\s*حبيب/i },
  { en: 'First Abu Dhabi Bank', ar: 'بنك أبوظبي الأول', match: /first\s*abu\s*dhabi|\bFAB\b|أبوظبي\s*الأول|ابوظبي\s*الاول/i },
];

export function findBank(text: string): { en: string; ar: string } | null {
  const t = normalize(text);
  const hit = BANKS.find((b) => b.match.test(t));
  return hit ? { en: hit.en, ar: hit.ar } : null;
}

// ------------------------------------------------------------------ MRZ (machine-readable lines, back of the ID card)

const MRZ_VALUE = (c: string) => (c >= '0' && c <= '9' ? +c : c >= 'A' && c <= 'Z' ? c.charCodeAt(0) - 55 : 0);

/** ICAO 9303 check digit: weights 7, 3, 1. */
export function mrzCheck(field: string): number {
  const w = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < field.length; i++) sum += MRZ_VALUE(field[i]) * w[i % 3];
  return sum % 10;
}

/** OCR often reads letters in numeric MRZ fields; fix them there only. */
const toDigits = (s: string) => s.replace(/[OQDU]/g, '0').replace(/[IL|]/g, '1').replace(/Z/g, '2').replace(/S/g, '5').replace(/G/g, '6').replace(/B/g, '8').replace(/T/g, '7');

/** Clean OCR lines that look like MRZ: A-Z 0-9 and the filler "<". */
function mrzLines(text: string): string[] {
  return normalize(text)
    .toUpperCase()
    .split('\n')
    .map((l) => l.replace(/\s+/g, '').replace(/[«‹(\[{]/g, '<').replace(/[^A-Z0-9<]/g, ''))
    .filter((l) => l.length >= 25 && (l.match(/</g)?.length ?? 0) >= 2);
}

function mrzDate(yymmdd: string, kind: 'birth' | 'expiry'): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = +yymmdd.slice(0, 2);
  const nowYY = new Date().getUTCFullYear() % 100;
  const year = kind === 'expiry' ? 2000 + yy : yy > nowYY ? 1900 + yy : 2000 + yy;
  return validDate(year, +yymmdd.slice(2, 4), +yymmdd.slice(4, 6));
}

export type Mrz = {
  documentCode: string;
  country: string;
  documentNumber: string;
  optional1: string;
  birthDate: string | null;
  sex: string | null;
  expiryDate: string | null;
  nationality: string;
  optional2: string;
  surname: string;
  givenNames: string;
  checks: { documentNumber: boolean; birthDate: boolean; expiryDate: boolean; composite: boolean };
};

/** ID-card MRZ (TD1: 3 lines × 30 characters). Returns null when no such block is found. */
export function parseMrz(text: string): Mrz | null {
  const lines = mrzLines(text);
  for (let i = 0; i + 2 < lines.length; i++) {
    const [a, b, c] = [lines[i], lines[i + 1], lines[i + 2]].map((l) => l.slice(0, 30).padEnd(30, '<'));
    if (!/^[A-Z<][A-Z<0-9]/.test(a) || !/^[0-9OQDUILSZGBT]{6}/.test(b)) continue;
    const docNumber = a.slice(5, 14);
    const birth = toDigits(b.slice(0, 6));
    const expiry = toDigits(b.slice(8, 14));
    const checkDigit = (s: string) => toDigits(s);
    const composite = a.slice(5, 30) + birth + checkDigit(b[6]) + expiry + checkDigit(b[14]) + b.slice(18, 29);
    const names = c.replace(/<+$/, '').split('<<');
    return {
      documentCode: a.slice(0, 2).replace(/</g, ''),
      country: a.slice(2, 5).replace(/</g, ''),
      documentNumber: docNumber.replace(/</g, ''),
      optional1: a.slice(15, 30).replace(/</g, ''),
      birthDate: mrzDate(birth, 'birth'),
      sex: b[7] === 'M' || b[7] === 'F' ? b[7] : null,
      expiryDate: mrzDate(expiry, 'expiry'),
      nationality: b.slice(15, 18).replace(/</g, ''),
      optional2: b.slice(18, 29).replace(/</g, ''),
      surname: (names[0] ?? '').replace(/</g, ' ').trim(),
      givenNames: names.slice(1).join(' ').replace(/</g, ' ').replace(/\s+/g, ' ').trim(),
      checks: {
        documentNumber: String(mrzCheck(docNumber)) === checkDigit(a[14]),
        birthDate: String(mrzCheck(birth)) === checkDigit(b[6]),
        expiryDate: String(mrzCheck(expiry)) === checkDigit(b[14]),
        composite: String(mrzCheck(composite)) === checkDigit(b[29]),
      },
    };
  }
  return null;
}

// ------------------------------------------------------------------ classification

const SIGNS: Record<Exclude<DocKind, 'OTHER'>, RegExp[]> = {
  CIVIL_ID: [/سلطنة\s*عمان|sultanate\s*of\s*oman/i, /البطاقة\s*الشخصية|بطاقة\s*مقيم|بطاقة\s*الإقامة|بطاقة\s*الاقامة|الرقم\s*المدني|identity\s*card|resident\s*card|civil\s*(?:no|number|status)|ID\s*card/i, /تاريخ\s*الميلاد|date\s*of\s*birth|الجنسية|nationality/i],
  CHEQUE: [/ادفعوا|ادفع\s*ل|لأمر|لامر|\bpay\b|or\s*bearer|or\s*order|لحامله|حامله/i, /cheque|check\s*no|شيك|الشيك/i, /ريال|R\.?\s?O\b|OMR|بيسة|baiza|baisa/i, /\bA\/C\b|account|حساب|التوقيع|signature/i],
  CONTRACT: [/عقد\s*(?:إيجار|ايجار)|tenancy\s*(?:contract|agreement)|lease\s*agreement/i, /المؤجر|المستأجر|landlord|lessor|lessee|tenant/i, /مدة\s*العقد|القيمة\s*الإيجارية|القيمة\s*الايجارية|rent\s*(?:amount|value)|term/i],
  INVOICE: [/فاتورة|invoice|receipt|إيصال|ايصال/i, /الإجمالي|الاجمالي|total|المجموع|subtotal/i, /ضريبة|VAT|tax/i],
};

/** Which kind of document this is, from the signs found in its text (a cheque also needs its MICR line or a bank). */
export function classify(pages: PageText[]): DocKind {
  const all = pages.map((p) => `${p.text}\n${p.strip ?? ''}`).join('\n');
  if (pages.some((p) => parseMrz(`${p.strip ?? ''}\n${p.text}`))) return 'CIVIL_ID';
  const score = (k: keyof typeof SIGNS) => SIGNS[k].filter((r) => r.test(normalize(all))).length;
  const scores: [DocKind, number][] = [
    ['CIVIL_ID', score('CIVIL_ID')],
    ['CHEQUE', score('CHEQUE') + (findBank(all) ? 1 : 0)],
    ['CONTRACT', score('CONTRACT')],
    ['INVOICE', score('INVOICE')],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][1] >= 2 ? scores[0][0] : 'OTHER';
}

// ------------------------------------------------------------------ field readers

function putField(fields: Fields, key: string, value: FieldValue | null | undefined, confidence: Confidence) {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return;
  const prev = fields[key];
  if (!prev || RANK[confidence] > RANK[prev.confidence]) fields[key] = { value, confidence };
  else if (prev.value === value && RANK[prev.confidence] < RANK.high) fields[key] = { value, confidence: 'high' }; // two readings agree
}

const put = putField;

/** The text after a label on the same line (e.g. "Nationality: Omani"). */
function afterLabel(text: string, labels: RegExp): string | null {
  for (const line of normalize(text).split('\n')) {
    const m = line.match(new RegExp(`(?:${labels.source})\\s*[:：/-]?\\s*(.+)$`, 'i'));
    if (m && m[1].trim().length >= 2) return m[1].trim();
  }
  return null;
}

const CIVIL_LABEL = /(?:الرقم\s*المدني|رقم\s*البطاقة|رقم\s*الهوية|civil\s*(?:no|number|id)\.?|ID\s*(?:no|number)\.?|card\s*(?:no|number)\.?)/i;

function civilNumber(text: string): { value: string; confidence: Confidence } | null {
  const t = normalize(text);
  const m = t.match(new RegExp(`${CIVIL_LABEL.source}[^\\d\\n]{0,15}(\\d[\\d ]{5,11}\\d)`, 'i'));
  if (m) return { value: m[1].replace(/\s/g, ''), confidence: 'medium' };
  const loose = t.match(/(?<![\d/.-])(\d{8,9})(?![\d/.-])/);
  return loose ? { value: loose[1], confidence: 'low' } : null;
}

const EXPIRY_LABEL = /تاريخ\s*الانتهاء|تاريخ\s*الإنتهاء|ينتهي\s*في|صالحة?\s*حتى|صالح\s*لغاية|expiry(?:\s*date)?|date\s*of\s*expiry|expires?(?:\s*on)?|valid\s*(?:until|till|thru|to)/;
const BIRTH_LABEL = /تاريخ\s*الميلاد|date\s*of\s*birth|birth\s*date|\bD\.?O\.?B\.?/;

function readCivilId(pages: PageText[], fields: Fields) {
  for (const p of pages) {
    const mrz = parseMrz(`${p.strip ?? ''}\n${p.text}`);
    if (mrz) {
      // the check digits tell us whether each part was read correctly
      put(fields, 'documentNumber', mrz.documentNumber, mrz.checks.documentNumber ? 'high' : 'low');
      const numberInOptional = mrz.optional1.match(/\d{6,}/)?.[0];
      put(fields, 'civilId', numberInOptional ?? mrz.documentNumber, mrz.checks.documentNumber || mrz.checks.composite ? 'medium' : 'low');
      put(fields, 'birthDate', mrz.birthDate, mrz.checks.birthDate ? 'high' : 'low');
      put(fields, 'expiryDate', mrz.expiryDate, mrz.checks.expiryDate ? 'high' : 'low');
      put(fields, 'sex', mrz.sex, mrz.checks.composite ? 'high' : 'medium');
      put(fields, 'nationalityCode', mrz.nationality, mrz.checks.composite ? 'high' : 'medium');
      put(fields, 'nameEn', [mrz.givenNames, mrz.surname].filter(Boolean).join(' '), 'medium');
    }
    const civil = civilNumber(p.text);
    if (civil) put(fields, 'civilId', civil.value, civil.confidence);
    put(fields, 'expiryDate', dateAfter(p.text, EXPIRY_LABEL), 'medium');
    put(fields, 'birthDate', dateAfter(p.text, BIRTH_LABEL), 'medium');
    const nameAr = afterLabel(p.text, /الاسم/);
    if (nameAr && /[ء-ي]/.test(nameAr)) put(fields, 'nameAr', nameAr.replace(/[^ء-ي\s]/g, '').replace(/\s+/g, ' ').trim(), 'low');
    const nameEn = afterLabel(p.text, /\bname\b/);
    if (nameEn && /^[A-Za-z][A-Za-z .'-]+$/.test(nameEn)) put(fields, 'nameEn', nameEn.toUpperCase(), 'low');
    const nat = afterLabel(p.text, /الجنسية|nationality/);
    if (nat) put(fields, 'nationality', nat.replace(/[^\p{L}\s]/gu, '').trim(), 'low');
  }
}

/** Groups of digits in the cheque's bottom strip (the MICR line): cheque number, bank/branch code, account. */
export function micrGroups(strip: string): string[] {
  const line = normalize(strip)
    .split('\n')
    .map((l) => toDigits(l.toUpperCase()))
    .filter((l) => (l.match(/\d/g)?.length ?? 0) >= 10)
    .pop();
  return line ? (line.match(/\d{4,}/g) ?? []) : [];
}

function readCheque(pages: PageText[], fields: Fields) {
  const all = pages.map((p) => p.text).join('\n');
  const bank = findBank(all + '\n' + pages.map((p) => p.strip ?? '').join('\n'));
  if (bank) {
    put(fields, 'bankName', bank.en, 'medium');
    put(fields, 'bankNameAr', bank.ar, 'medium');
  }
  const groups = pages.flatMap((p) => micrGroups(p.strip ?? ''));
  const chequeNo = groups.find((g) => g.length >= 6 && g.length <= 8);
  if (chequeNo) put(fields, 'number', chequeNo, 'medium');
  const labelled = normalize(all).match(/(?:cheque|check|chq)\.?\s*(?:no|number)?\.?\s*[:#]?\s*(\d{5,10})|رقم\s*الشيك\s*[:#]?\s*(\d{5,10})/i);
  if (labelled) put(fields, 'number', labelled[1] ?? labelled[2], 'medium');
  const account = [...groups].sort((a, b) => b.length - a.length)[0];
  if (account && account.length >= 9 && account !== chequeNo) put(fields, 'account', account, 'low');
  const amounts = findAmounts(all);
  if (amounts.length) put(fields, 'amount', amounts[0].baisa, amounts[0].confidence === 'medium' ? 'medium' : 'low');
  const dates = findDates(all);
  if (dates.length) put(fields, 'date', dates[0].iso, 'low'); // handwritten: always check
}

/** Anything else: what is commonly needed from a document. */
function readGeneric(pages: PageText[], fields: Fields) {
  // only fills what the kind-specific reader did not find (the same text read twice is not a second opinion)
  const put = (f: Fields, key: string, value: FieldValue | null | undefined, confidence: Confidence) => {
    if (!f[key]) putField(f, key, value, confidence);
  };
  const all = normalize(pages.map((p) => p.text).join('\n'));
  put(fields, 'expiryDate', dateAfter(all, EXPIRY_LABEL), 'medium');
  put(fields, 'dates', findDates(all).map((d) => d.iso).filter((d, i, a) => a.indexOf(d) === i).slice(0, 6), 'low');
  put(fields, 'amounts', findAmounts(all).map((a) => a.baisa).slice(0, 6), 'low');
  const iban = all.replace(/\s/g, '').toUpperCase().match(/OM\d{2}[A-Z0-9]{19}/);
  if (iban) put(fields, 'iban', iban[0], 'medium');
  const phones = [...all.matchAll(/(?:\+?968[\s-]?)?(?<!\d)([279]\d{3}[\s-]?\d{4})(?!\d)/g)].map((m) => m[1].replace(/[\s-]/g, ''));
  put(fields, 'phones', [...new Set(phones)].slice(0, 4), 'low');
  const emails = all.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g);
  if (emails) put(fields, 'emails', [...new Set(emails)].slice(0, 4), 'medium');
  const civil = civilNumber(all);
  if (civil && civil.confidence === 'medium') put(fields, 'civilId', civil.value, 'medium');
  const bank = findBank(all);
  if (bank) {
    put(fields, 'bankName', bank.en, 'low');
    put(fields, 'bankNameAr', bank.ar, 'low');
  }
}

/** One or two images of a document (e.g. ID front + back) → its kind and the fields read from it. */
export function recognize(pages: PageText[], hint?: DocKind | null): Recognition {
  const kind = hint && hint !== 'OTHER' ? hint : classify(pages);
  const fields: Fields = {};
  if (kind === 'CIVIL_ID') readCivilId(pages, fields);
  else if (kind === 'CHEQUE') readCheque(pages, fields);
  readGeneric(pages, fields); // dates, amounts, IBAN … also for the known kinds, without overriding their fields
  if (kind === 'CHEQUE') {
    delete fields.amounts;
    delete fields.dates;
  }
  return { kind, fields, text: pages.map((p) => p.text).join('\n\n— — —\n\n').slice(0, 8000) };
}
