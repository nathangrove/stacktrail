import type { Request, Response, Express } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';

const CreateUserSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
const UpdateUserSchema = z.object({ password: z.string().min(1) });

export function registerUserRoutes(app: Express, db: Db) {
  app.get('/api/users', async (_req: Request, res: Response) => {
    const rows = await db.prepare('SELECT id, username, createdAt FROM users ORDER BY createdAt DESC').all();
    res.json({ users: rows });
  });

  app.post('/api/users', async (req: Request, res: Response) => {
    const parsed = CreateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const { username, password } = parsed.data;

    const existing = await db.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: string } | undefined;
    if (existing) return res.status(409).json({ error: 'Username already exists' });

    const now = Date.now();
    const passwordHash = require('bcryptjs').hashSync(password, 12);
    const id = require('crypto').randomUUID();
    await db.prepare('INSERT INTO users (id, username, passwordHash, createdAt) VALUES (?, ?, ?, ?)').run(id, username, passwordHash, now);

    res.status(201).json({ id, username, createdAt: now });
  });

  app.put('/api/users/:id', async (req: Request, res: Response) => {
    const userId = req.params.id;
    const parsed = UpdateUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });

    const { password } = parsed.data;

    const passwordHash = require('bcryptjs').hashSync(password, 12);
    const result = await db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(passwordHash, userId);

    if ((result.changes ?? 0) === 0) return res.status(404).json({ error: 'User not found' });

    res.json({ success: true });
  });

  app.delete('/api/users/:id', async (req: Request, res: Response) => {
    const userId = req.params.id;

    const countRow = await db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number } | undefined;
    const count = countRow?.c ?? 0;
    if (count <= 1) return res.status(400).json({ error: 'Cannot delete the last user' });

    const result = await db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    if ((result.changes ?? 0) === 0) return res.status(404).json({ error: 'User not found' });

    res.json({ success: true });
  });
}
