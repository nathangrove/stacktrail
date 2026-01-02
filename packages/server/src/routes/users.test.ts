import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { openDb } from '../db';
import { registerUserRoutes } from './users';

let db: any;

import { ensureAdminUser } from '../middleware/auth';

beforeEach(async () => {
  process.env.SQLITE_DB_PATH = ':memory:';
  db = await openDb();
  await ensureAdminUser(db);
});

describe('users routes', () => {
  it('cannot delete the last user', async () => {
    const app = express();
    app.use(express.json());
    registerUserRoutes(app, db);

    // ensure only admin exists
    await db.prepare("DELETE FROM users WHERE username != 'admin'").run();
    const rows = await db.prepare('SELECT COUNT(*) as c FROM users').get();
    expect(rows.c).toBeGreaterThan(0);

    const users = await db.prepare('SELECT id, username FROM users LIMIT 1').get();
    const res = await request(app).delete(`/api/users/${encodeURIComponent(users.id)}`);
    expect(res.status).toBe(400);
  });

  it('create, update, and delete user flow', async () => {
    const app = express();
    app.use(express.json());
    registerUserRoutes(app, db);

    const res = await request(app).post('/api/users').send({ username: 'fred', password: 'pw' });
    expect(res.status).toBe(201);
    const id = res.body.id;

    const put = await request(app).put(`/api/users/${encodeURIComponent(id)}`).send({ password: 'newpw' });
    expect(put.status).toBe(200);

    const del = await request(app).delete(`/api/users/${encodeURIComponent(id)}`);
    expect(del.status).toBe(200);
  });
});