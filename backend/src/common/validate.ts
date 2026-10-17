import { BadRequestException } from '@nestjs/common';

// Small input helpers. Error messages are i18n keys ("validation.*") that the app translates.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function body(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('validation.invalidBody');
  }
  return input as Record<string, unknown>;
}

export function requiredString(src: Record<string, unknown>, field: string, max = 200): string {
  const value = src[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException({ message: 'validation.required', field });
  }
  if (value.trim().length > max) throw new BadRequestException({ message: 'validation.tooLong', field });
  return value.trim();
}

export function optionalString(src: Record<string, unknown>, field: string, max = 200): string | undefined {
  const value = src[field];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new BadRequestException({ message: 'validation.invalid', field });
  if (value.trim().length > max) throw new BadRequestException({ message: 'validation.tooLong', field });
  return value.trim();
}

export function email(src: Record<string, unknown>, field = 'email'): string {
  const value = requiredString(src, field, 254).toLowerCase();
  if (!EMAIL.test(value)) throw new BadRequestException({ message: 'validation.email', field });
  return value;
}

export function password(src: Record<string, unknown>, field = 'password'): string {
  const value = src[field];
  if (typeof value !== 'string' || value.length < 8) {
    throw new BadRequestException({ message: 'validation.passwordLength', field });
  }
  if (value.length > 128) throw new BadRequestException({ message: 'validation.tooLong', field });
  return value;
}

export function oneOf<T extends string>(src: Record<string, unknown>, field: string, allowed: readonly T[], fallback?: T): T {
  const value = src[field];
  if ((value === undefined || value === null) && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new BadRequestException({ message: 'validation.invalid', field });
  }
  return value as T;
}

export function optionalBoolean(src: Record<string, unknown>, field: string): boolean | undefined {
  const value = src[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new BadRequestException({ message: 'validation.invalid', field });
  return value;
}

export function nonNegativeInt(src: Record<string, unknown>, field: string, fallback?: number): number {
  const value = src[field];
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new BadRequestException({ message: 'validation.nonNegativeInt', field });
  }
  return value;
}

/** Optional integer (null clears it). Returns undefined when the field is absent. */
export function optionalInt(src: Record<string, unknown>, field: string, min = 0, max = 1_000_000): number | null | undefined {
  const value = src[field];
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new BadRequestException({ message: 'validation.invalid', field });
  }
  return value;
}

/** Optional decimal number such as an area in m² (never money). */
export function optionalNumber(src: Record<string, unknown>, field: string, min = 0, max = 10_000_000): number | null | undefined {
  const value = src[field];
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new BadRequestException({ message: 'validation.invalid', field });
  }
  return value;
}

/** Optional money in integer baisa (the app converts OMR text to baisa before sending). */
export function optionalBaisa(src: Record<string, unknown>, field: string): number | null | undefined {
  return optionalInt(src, field, 0, 9_000_000_000_000);
}

export function optionalEnum<T extends string>(src: Record<string, unknown>, field: string, allowed: readonly T[]): T | undefined {
  if (src[field] === undefined) return undefined;
  return oneOf(src, field, allowed);
}

/** Optional string that can be cleared with null/'' (returns null), or left untouched (undefined). */
export function nullableString(src: Record<string, unknown>, field: string, max = 200): string | null | undefined {
  if (src[field] === undefined) return undefined;
  return optionalString(src, field, max) ?? null;
}
