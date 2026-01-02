import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import type { Db } from '../db.js';

export type BasicCreds = { username: string; password: string };

export function parseBasicAuth(req: Request): BasicCreds | null {
  const header = req.header('authorization') ?? '';
  if (!header.toLowerCase().startsWith('basic ')) return null;
  const b64 = header.slice(6).trim();
  let decoded = '';
  try {
    decoded = Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return null;
  }
  const idx = decoded.indexOf(':');
  if (idx < 0) return null;
  const username = decoded.slice(0, idx);
  const password = decoded.slice(idx + 1);
  if (!username || !password) return null;
  return { username, password };
}

export async function isUserAuthed(req: Request, db: Db) {
  const creds = parseBasicAuth(req);
  if (!creds) return false;
  const row = await db.prepare('SELECT passwordHash FROM users WHERE username = ?').get(creds.username) as { passwordHash: string } | undefined;
  if (!row) return false;
  return bcrypt.compareSync(creds.password, row.passwordHash);
}

export function challengeBasic(res: Response) {
  res.setHeader('WWW-Authenticate', 'Basic realm="StackTrail"');
  res.status(401).json({ error: 'Unauthorized' });
}

export async function requireUserAuth(req: Request, res: Response, db: Db) {
  if (await isUserAuthed(req, db)) return true;
  challengeBasic(res);
  return false;
}

export async function ensureAdminUser(db: Db) {
  const countRow = await db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number } | undefined;
  const count = countRow?.c ?? 0;
  if (count > 0) return;

  let username = process.env.ADMIN_USERNAME ?? '';
  let password = process.env.ADMIN_PASSWORD ?? '';
  let generatedPassword = false;

  if (!username || !password) {
    username = 'admin';
    password = crypto.randomBytes(12).toString('hex');
    generatedPassword = true;
  }

  const now = Date.now();
  const passwordHash = bcrypt.hashSync(password, 12);
  await db.prepare('INSERT INTO users (id, username, passwordHash, createdAt) VALUES (?, ?, ?, ?)').run(
    crypto.randomUUID(),
    username,
    passwordHash,
    now
  );

  // eslint-disable-next-line no-console
  if (generatedPassword) {
    console.log(`[server] created initial admin user: ${username}`);
    console.log(`[server] initial admin password: ${password}`);
    console.log('[server] Tip: change this password immediately via the Users UI or by setting ADMIN_USERNAME/ADMIN_PASSWORD.');
  } else {
    console.log(`[server] created initial admin user: ${username}`);
  }
}

export function makeIngestKey() {
  return crypto.randomBytes(24).toString('hex');
}

export async function requireProjectIngestKey(projectKey: string, req: Request, res: Response, db: Db) {
  // Allow user-auth to ingest (useful for manual testing).
  if (await isUserAuthed(req, db)) return true;

  const provided = (req.header('x-stacktrail-ingest-key') ?? req.header('x-cet-ingest-key') ?? '').toString();
  if (!provided) {
    res.status(401).json({ error: 'Missing ingest key' });
    return false;
  }

  const row = await db.prepare('SELECT ingestKey FROM projects WHERE projectKey = ?').get(projectKey) as { ingestKey: string | null } | undefined;

  if (!row || !row.ingestKey) {
    res.status(404).json({ error: 'Unknown project' });
    return false;
  }

  const storedKey = (row.ingestKey ?? '').toString().trim();
  const providedTrimmed = provided.toString().trim();
  if (storedKey !== providedTrimmed) {
    console.log(`[ingest] invalid key provided for project ${projectKey}`);
    res.status(401).json({ error: 'Invalid ingest key' });
    return false;
  }

  return true;
}
