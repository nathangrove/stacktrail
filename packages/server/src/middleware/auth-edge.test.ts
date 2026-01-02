import { describe, it, expect } from 'vitest';
import { requireUserAuth } from './auth';

describe('auth edge cases', () => {
  it('requireUserAuth challenges when missing creds', async () => {
    const req = { header: (k: string) => undefined } as any;
    let status = 200;
    const res = { status(code: number) { status = code; return this; }, setHeader() {}, json() {} } as any;
    const ok = await requireUserAuth(req, res, { prepare: () => ({ get: async () => undefined }) } as any);
    expect(ok).toBe(false);
    expect(status).toBe(401);
  });
});