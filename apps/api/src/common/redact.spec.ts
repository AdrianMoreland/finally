import { scrub, scrubString } from './redact';

describe('log scrubbing', () => {
  it('masks IBANs with and without spaces', () => {
    expect(scrubString('paid from IE29AIBK93115212345678 today')).toBe('paid from [iban] today');
    expect(scrubString('IE29 AIBK 9311 5212 3456 78')).toBe('[iban]');
  });

  it('masks bearer tokens and JWTs', () => {
    const jwt = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlc2lnbmF0dXJl';
    expect(scrubString(`Authorization: Bearer ${jwt}`)).toBe('Authorization: Bearer [token]');
    expect(scrubString(`token=${jwt}`)).toBe('token=[token]');
  });

  it('scrubs nested objects and leaves other values alone', () => {
    expect(scrub({ a: { msg: 'IE29AIBK93115212345678' }, n: 5, ok: true })).toEqual({ a: { msg: '[iban]' }, n: 5, ok: true });
  });

  it('leaves ordinary text alone', () => {
    expect(scrubString('Synced 12 payments for AIB')).toBe('Synced 12 payments for AIB');
  });
});
