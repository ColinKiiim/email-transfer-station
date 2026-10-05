import { describe, expect, it } from 'vitest';
import { generateTotp, parseTotp } from '../totp';

describe('TOTP', () => {
  it('matches RFC 6238 SHA-1 vector', async () => {
    const item = parseTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 'RFC test');
    expect(await generateTotp(item, 59_000)).toBe('287082');
  });
});
