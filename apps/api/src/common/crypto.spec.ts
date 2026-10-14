import { randomBytes } from 'node:crypto';
import { decrypt, encrypt } from './crypto';

describe('AES-256-GCM helpers', () => {
  const key = randomBytes(32).toString('base64');

  it('round-trips and never repeats a ciphertext', () => {
    const a = encrypt('session-123', key);
    const b = encrypt('session-123', key);
    expect(a).not.toEqual(b);
    expect(decrypt(a, key)).toBe('session-123');
  });

  it('rejects tampering and the wrong key', () => {
    const enc = encrypt('secret', key);
    const bytes = Buffer.from(enc, 'base64');
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
    expect(() => decrypt(bytes.toString('base64'), key)).toThrow();
    expect(() => decrypt(enc, randomBytes(32).toString('base64'))).toThrow();
  });
});
