import { z } from 'zod';

/** Decimal string with up to 2 dp as accepted on input, e.g. "12.5" or "-4.20". */
export const moneyInput = z
  .string()
  .regex(/^-?\d{1,12}(\.\d{1,2})?$/, 'Expected a decimal string such as "12.50"');

/** Decimal string with exactly 2 dp as emitted on output, e.g. "12.50". */
export const money = z.string().regex(/^-?\d{1,12}\.\d{2}$/, 'Expected "12.50" style money');

/** Decimal string for quantities / unit prices (up to 8 dp). */
export const decimalString = z.string().regex(/^-?\d{1,14}(\.\d{1,8})?$/);

/** Calendar date, YYYY-MM-DD. */
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Instant, ISO-8601 in UTC (stored UTC, displayed Europe/Dublin). */
export const instant = z.iso.datetime({ offset: true });

/** Month key, YYYY-MM. */
export const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const id = z.string().min(1);

export const pageQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const okResponse = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof okResponse>;

export const errorResponse = z.object({
  statusCode: z.number().int(),
  message: z.string(),
  error: z.string().optional(),
});
export type ErrorResponse = z.infer<typeof errorResponse>;

export const SIGNALS_DISCLAIMER = 'Signals are rule-based information, not financial advice.';
export const TAX_DISCLAIMER = 'Tax figures are estimates, not tax advice.';
