import { D, m2 } from './decimal';

export interface ParsedStatementRow {
  /** Dublin calendar date, YYYY-MM-DD */
  bookingDate: string;
  amount: string;
  currency: string;
  rawDescriptor: string;
  status: 'PENDING' | 'BOOKED';
  balance: string | null;
}

export interface ParseResult {
  rows: ParsedStatementRow[];
  skipped: number;
  errors: string[];
}

/** RFC-4180-ish CSV parser: quoted fields, escaped quotes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) out.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) out.push(row);
  return out;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Accepts dd/MM/yyyy, dd-MM-yyyy, dd MMM yyyy, dd-MMM-yy, yyyy-MM-dd[ HH:mm:ss]. */
export function parseDate(input: string): string | null {
  const s = input.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(s);
  if (m) {
    const yy = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    return `${yy}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  }
  m = /^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -](\d{2,4})/.exec(s);
  if (m) {
    const idx = MONTHS.indexOf(m[2]!.toLowerCase());
    if (idx < 0) return null;
    const yy = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    return `${yy}-${String(idx + 1).padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  }
  return null;
}

const cleanNumber = (s: string): string | null => {
  const t = s.replace(/[€,\s]/g, '');
  return /^-?\d+(\.\d+)?$/.test(t) ? t : null;
};

const headerIndex = (header: string[]): ((...names: string[]) => number) => {
  const norm = header.map((h) => h.trim().toLowerCase());
  return (...names) => {
    for (const n of names) {
      const i = norm.indexOf(n.toLowerCase());
      if (i >= 0) return i;
    }
    return -1;
  };
};

/**
 * AIB statement export. Columns (internet banking): Posted Account, Posted Transactions Date, Description1,
 * Description2, Description3, Debit Amount, Credit Amount, Balance, Posted Currency, Transaction Type, ...
 */
export function parseAibCsv(text: string): ParseResult {
  const table = parseCsv(text);
  const res: ParseResult = { rows: [], skipped: 0, errors: [] };
  const header = table.shift();
  if (!header) return res;
  const col = headerIndex(header);
  const iDate = col('Posted Transactions Date', 'Date');
  const i1 = col('Description1', 'Description');
  const i2 = col('Description2');
  const i3 = col('Description3');
  const iDebit = col('Debit Amount', 'Debit');
  const iCredit = col('Credit Amount', 'Credit');
  const iBal = col('Balance');
  const iCur = col('Posted Currency', 'Currency');
  if (iDate < 0 || i1 < 0 || (iDebit < 0 && iCredit < 0)) {
    res.errors.push('Not an AIB statement export: missing date, description or amount columns.');
    return res;
  }
  for (const r of table) {
    const date = parseDate(r[iDate] ?? '');
    const debit = iDebit >= 0 ? cleanNumber(r[iDebit] ?? '') : null;
    const credit = iCredit >= 0 ? cleanNumber(r[iCredit] ?? '') : null;
    if (!date || (debit === null && credit === null)) {
      res.skipped++;
      continue;
    }
    const amount = debit !== null && !D(debit).isZero() ? D(debit).abs().neg() : D(credit ?? 0).abs();
    const desc = [r[i1], i2 >= 0 ? r[i2] : '', i3 >= 0 ? r[i3] : '']
      .map((p) => (p ?? '').trim())
      .filter(Boolean)
      .join(' ');
    res.rows.push({
      bookingDate: date,
      amount: m2(amount),
      currency: (iCur >= 0 ? r[iCur] : '')?.trim() || 'EUR',
      rawDescriptor: desc,
      status: 'BOOKED',
      balance: iBal >= 0 && cleanNumber(r[iBal] ?? '') !== null ? m2(cleanNumber(r[iBal] ?? '0') ?? '0') : null,
    });
  }
  return res;
}

/** Revolut statement export: Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance */
export function parseRevolutCsv(text: string): ParseResult {
  const table = parseCsv(text);
  const res: ParseResult = { rows: [], skipped: 0, errors: [] };
  const header = table.shift();
  if (!header) return res;
  const col = headerIndex(header);
  const iDate = col('Completed Date', 'Started Date', 'Date');
  const iDesc = col('Description');
  const iAmt = col('Amount');
  const iFee = col('Fee');
  const iCur = col('Currency');
  const iState = col('State');
  const iBal = col('Balance');
  if (iDate < 0 || iDesc < 0 || iAmt < 0) {
    res.errors.push('Not a Revolut statement export: missing date, description or amount columns.');
    return res;
  }
  for (const r of table) {
    const state = (iState >= 0 ? r[iState] : 'COMPLETED')?.trim().toUpperCase() ?? 'COMPLETED';
    if (state === 'REVERTED' || state === 'DECLINED' || state === 'FAILED') {
      res.skipped++;
      continue;
    }
    const date = parseDate(r[iDate] || (r[col('Started Date')] ?? '') || '');
    const amt = cleanNumber(r[iAmt] ?? '');
    if (!date || amt === null) {
      res.skipped++;
      continue;
    }
    const fee = iFee >= 0 ? (cleanNumber(r[iFee] ?? '') ?? '0') : '0';
    const bal = iBal >= 0 ? cleanNumber(r[iBal] ?? '') : null;
    res.rows.push({
      bookingDate: date,
      amount: m2(D(amt).minus(fee)),
      currency: (iCur >= 0 ? r[iCur] : '')?.trim() || 'EUR',
      rawDescriptor: (r[iDesc] ?? '').trim(),
      status: state === 'PENDING' ? 'PENDING' : 'BOOKED',
      balance: bal === null ? null : m2(bal),
    });
  }
  return res;
}

/** Provider-independent identity for a transaction when the bank gives no id. Hash this with SHA-256. */
export const dedupeSeed = (accountId: string, bookingDate: string, amount: string, rawDescriptor: string): string =>
  `${accountId}|${bookingDate}|${m2(amount)}|${rawDescriptor.trim()}`;
