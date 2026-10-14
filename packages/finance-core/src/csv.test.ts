import { describe, expect, it } from 'vitest';
import { dedupeSeed, parseAibCsv, parseCsv, parseDate, parseRevolutCsv } from './csv';
import { suggestAskGroup } from './askgroup';

describe('parseCsv', () => {
  it('handles quotes, commas, escaped quotes, CRLF and BOM', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
    ]);
  });
});

describe('parseDate', () => {
  it.each([
    ['14/10/2026', '2026-10-14'],
    ['14-10-26', '2026-10-14'],
    ['14 Oct 2026', '2026-10-14'],
    ['2026-10-14 08:12:11', '2026-10-14'],
  ])('%s', (input, out) => expect(parseDate(input)).toBe(out));
  it('rejects nonsense', () => expect(parseDate('yesterday')).toBeNull());
});

describe('parseAibCsv', () => {
  const csv = [
    'Posted Account,Posted Transactions Date,Description1,Description2,Description3,Debit Amount,Credit Amount,Balance,Posted Currency',
    '"IE12 AIBK 9311 0012 3456 78",14/10/2026,VDP-TESCO STORES 3245,DUBLIN,,18.35,,2184.36,EUR',
    '"IE12 AIBK 9311 0012 3456 78",28/09/2026,ACME TECHNOLOGIES LTD SAL,,,,3150.00,5334.36,EUR',
    '"IE12",bad,x,,,1,,,EUR',
  ].join('\n');

  it('parses debits as negative and credits as positive', () => {
    const r = parseAibCsv(csv);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ bookingDate: '2026-10-14', amount: '-18.35', rawDescriptor: 'VDP-TESCO STORES 3245 DUBLIN' });
    expect(r.rows[1]).toMatchObject({ amount: '3150.00' });
    expect(r.skipped).toBe(1);
  });

  it('reports a wrong file type', () => {
    expect(parseAibCsv('a,b\n1,2').errors).toHaveLength(1);
  });
});

describe('parseRevolutCsv', () => {
  const csv = [
    'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
    'CARD_PAYMENT,Current,2026-10-14 08:00:00,2026-10-14 08:01:00,Bewleys Grafton St,-4.20,0.00,EUR,COMPLETED,412.80',
    'TOPUP,Current,2026-10-07 09:00:00,2026-10-07 09:00:05,Top-Up by *2410,300.00,0.00,EUR,COMPLETED,700.00',
    'CARD_PAYMENT,Current,2026-10-08 09:00:00,,Pending Shop,-9.99,0.10,EUR,PENDING,',
    'CARD_PAYMENT,Current,2026-10-09 09:00:00,,Reverted,-1.00,0.00,EUR,REVERTED,',
  ].join('\n');

  it('parses completed rows, nets fees and drops reverted rows', () => {
    const r = parseRevolutCsv(csv);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ amount: '-4.20', status: 'BOOKED', balance: '412.80' });
    expect(r.rows[2]).toMatchObject({ amount: '-10.09', status: 'PENDING', bookingDate: '2026-10-08' });
    expect(r.skipped).toBe(1);
  });
});

describe('dedupeSeed', () => {
  it('normalises the amount to 2dp', () => {
    expect(dedupeSeed('acc', '2026-10-14', '-4.2', ' X ')).toBe('acc|2026-10-14|-4.20|X');
  });
});

describe('suggestAskGroup', () => {
  it.each([
    ['bewleys-grafton-st', 'VDC-BEWLEYS GRAFTON ST', 'FOOD'],
    ['phoenix-park-cafe', 'SUMUP *PHOENIX PARK CAFE', 'FOOD'],
    ['irish-rail', 'IRISH RAIL WEB 4471', 'TRANSPORT'],
    ['steamgames', 'PAYPAL *STEAMGAMES', 'FUN'],
    ['the-bernard-shaw', 'SQ *THE BERNARD SHAW', 'FUN'],
    ['vhi-healthcare', 'D/D VHI HEALTHCARE', 'BILLS'],
    ['zara-grafton', 'VDP-ZARA GRAFTON', 'SHOPPING'],
  ])('%s → %s', (key, raw, group) => {
    expect(suggestAskGroup(key, raw).askGroup).toBe(group);
  });

  it('falls back to similar already-categorised merchants', () => {
    const r = suggestAskGroup('bewleys-cafe-westmoreland', 'x', [
      { merchantKey: 'bewleys-grafton-st', displayName: "Bewley's", askGroup: 'FUN' },
    ]);
    expect(r.askGroup).toBe('FOOD'); // keyword wins
    const s = suggestAskGroup('kinsella-westmoreland', 'x', [
      { merchantKey: 'kinsella-limited', displayName: 'Kinsella', askGroup: 'FUN' },
    ]);
    expect(s).toEqual({ askGroup: 'FUN', source: 'SIMILAR' });
  });
});
