// Two-step sign-in for the platform team: time-based one-time codes (TOTP, RFC 6238 / RFC 4226) as used by
// Google Authenticator, Microsoft Authenticator, 1Password… Pure functions, no dependencies, unit-tested.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const STEP_SECONDS = 30;
export const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 4226 HOTP code for a counter. */
export function hotp(key: Buffer, counter: number, digits = DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', key).update(msg).digest();
  const offset = h[h.length - 1] & 15;
  const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export function totp(key: Buffer, atMs: number, digits = DIGITS): string {
  return hotp(key, Math.floor(atMs / 1000 / STEP_SECONDS), digits);
}

/** Accepts the code of the current 30-second step and of the one before/after (clock drift). */
export function verifyTotp(key: Buffer, code: string, atMs: number, window = 1): boolean {
  const clean = String(code ?? '').replace(/\D/g, '');
  if (clean.length !== DIGITS) return false;
  const step = Math.floor(atMs / 1000 / STEP_SECONDS);
  for (let d = -window; d <= window; d += 1) {
    const expected = Buffer.from(hotp(key, step + d));
    if (timingSafeEqual(expected, Buffer.from(clean))) return true;
  }
  return false;
}

export function newSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Link understood by authenticator apps (also what a QR code would contain). */
export function otpauthUrl(issuer: string, account: string, secret: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// ------------------------------------------------------------------ recovery codes

/** One-time recovery codes ("ABCDE-FGHJK"), for an admin who lost their phone. Only their SHA-256 is stored. */
export function newRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(7)).slice(0, 10);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(String(code).toUpperCase().replace(/[\s-]/g, '')).digest('hex');
}

// ------------------------------------------------------------------ secret at rest (AES-256-GCM)

function keyFrom(material: string): Buffer {
  return createHash('sha256').update(`aqartech-admin-2fa:${material}`).digest();
}

export function encryptSecret(secret: string, material: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(material), iv);
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decryptSecret(stored: string, material: string): string {
  const [iv, tag, data] = stored.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(material), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
