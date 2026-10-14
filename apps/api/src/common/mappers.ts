import { D, m2, q8 } from '@finally/finance-core';

/** Anything that stringifies to a decimal: Prisma Decimal, string or number. */
type DecimalLike = { toString(): string } | string | number;

/** → "12.50" */
export const money = (v: DecimalLike): string => m2(String(v));

/** Quantities and unit prices: up to 8 dp, trailing zeros trimmed. */
export const qty = (v: DecimalLike): string => q8(String(v));

export const toDecimal = (v: DecimalLike) => D(String(v));

export const iso = (d: Date): string => d.toISOString();
export const isoOrNull = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
export const dateOnly = (d: Date): string => d.toISOString().slice(0, 10);
export const parseDateOnly = (s: string): Date => new Date(`${s}T00:00:00.000Z`);
