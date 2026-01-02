import { describe, it, expect, beforeEach } from 'vitest';
import { openDb } from '../db';
import { ensureAdminUser, isUserAuthed, requireProjectIngestKey } from './auth';

function makeReq(headers: Record<string,string|undefined>) {
  return { header: (k: string) => headers[k.toLowerCase()] } as any;
}

function makeRes() {
  let statusVal = 200;
  return {
    status(code: number) { statusVal = code; return this; },
    json(_obj: any) { return { status: statusVal }; }
  } as any;
}

describe('auth middleware helpers', () => {
  let db: any;

  beforeEach(async () => {
    process.env.SQLITE_DB_PATH = ':memory:';
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
    db = await openDb();
  });

  it('ensureAdminUser creates an admin when none exist', async () => {
    await ensureAdminUser(db);
    const row = await db.prepare('SELECT username FROM users LIMIT 1').get();
    expect(row).toBeTruthy();
    expect(row.username).toBe('admin');
  });

  it('ensureAdminUser respects ADMIN_USERNAME/ADMIN_PASSWORD env vars', async () => {
    // new DB
    process.env.SQLITE_DB_PATH = ':memory:';
    process.env.ADMIN_USERNAME = 'bob';
    process.env.ADMIN_PASSWORD = 'secret';
    db = await openDb();
    await ensureAdminUser(db);
    const row = await db.prepare('SELECT username FROM users WHERE username = ?').get('bob');
    expect(row).toBeTruthy();
  });

  it('isUserAuthed returns true for valid Basic auth', async () => {
    // seed a user
    const username = 'alice';
    const password = 'pw123';
    const passwordHash = require('bcryptjs').hashSync(password, 12);
    const id = require('crypto').randomUUID();
    const now = Date.now();
    await db.prepare('INSERT INTO users (id, username, passwordHash, createdAt) VALUES (?, ?, ?, ?)').run(id, username, passwordHash, now);

    const auth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    const req = makeReq({ authorization: auth });
    const ok = await isUserAuthed(req, db);
    expect(ok).toBe(true);
  });

  it('requireProjectIngestKey accepts valid key and rejects invalid', async () => {
    const projectKey = 'proj1';
    const key = 'secretkey';
    const now = Date.now();
    await db.prepare('INSERT INTO projects (projectKey, name, createdAt, ingestKey) VALUES (?, ?, ?, ?)').run(projectKey, projectKey, now, key);

    const reqGood = makeReq({ 'x-stacktrail-ingest-key': key });
    const res = makeRes();
    const ok = await requireProjectIngestKey(projectKey, reqGood, res, db);
    expect(ok).toBe(true);

    const reqBad = makeReq({ 'x-stacktrail-ingest-key': 'bad' });
    const res2 = makeRes();
    const ok2 = await requireProjectIngestKey(projectKey, reqBad, res2, db);
    expect(ok2).toBe(false);
  });
});