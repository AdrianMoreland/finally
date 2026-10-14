// jose is ESM-only and Jest runs CommonJS; the mapping function does not need it.
jest.mock('jose', () => ({ importPKCS8: jest.fn(), SignJWT: jest.fn() }));

import { mapTransaction } from './enable-banking.provider';

describe('Enable Banking transaction mapping', () => {
  it('makes debits negative and joins counterparty with remittance text', () => {
    expect(
      mapTransaction({
        entry_reference: 'abc',
        booking_date: '2026-10-14',
        transaction_amount: { amount: '4.20', currency: 'EUR' },
        credit_debit_indicator: 'DBIT',
        status: 'BOOK',
        creditor: { name: 'BEWLEYS GRAFTON ST' },
        remittance_information: ['CARD PAYMENT'],
      }),
    ).toEqual({
      providerTxId: 'abc',
      bookingDate: '2026-10-14',
      valueDate: null,
      amount: '-4.20',
      currency: 'EUR',
      rawDescriptor: 'BEWLEYS GRAFTON ST CARD PAYMENT',
      status: 'BOOKED',
    });
  });

  it('keeps credits positive, marks non-booked as pending, uses the debtor name', () => {
    const t = mapTransaction({
      transaction_id: 't1',
      value_date: '2026-10-28T00:00:00Z',
      transaction_amount: { amount: '3150', currency: 'EUR' },
      credit_debit_indicator: 'CRDT',
      status: 'PDNG',
      debtor: { name: 'ACME TECHNOLOGIES LTD' },
    });
    expect(t).toMatchObject({ amount: '3150.00', bookingDate: '2026-10-28', status: 'PENDING', rawDescriptor: 'ACME TECHNOLOGIES LTD', providerTxId: 't1' });
  });

  it('skips entries without any date', () => {
    expect(mapTransaction({ transaction_amount: { amount: '1', currency: 'EUR' } })).toBeNull();
  });
});
