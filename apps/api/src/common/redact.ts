const IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]{10,}/g;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body',
  'res.headers["set-cookie"]',
  '*.iban',
  '*.ibanMasked',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.sessionId',
  '*.sessionIdEnc',
  '*.password',
  '*.rawDescriptor',
  '*.descriptor',
  '*.csv',
  'ibanMasked',
  'rawDescriptor',
  'token',
  'sessionIdEnc',
];

/** Strip IBANs and bearer/JWT tokens from any string that reaches the logs. */
export function scrubString(s: string): string {
  return s.replace(JWT, '[token]').replace(BEARER, 'Bearer [token]').replace(IBAN, '[iban]');
}

export function scrub<T>(value: T, depth = 0): T {
  if (typeof value === 'string') return scrubString(value) as T;
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1)) as T;
  if (value instanceof Error) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrub(v, depth + 1);
  return out as T;
}
