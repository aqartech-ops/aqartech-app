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
