import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { openDb } from '../db';
import { registerEventRoutes } from './events';

let db: any;

beforeEach(async () => {
  process.env.SQLITE_DB_PATH = ':memory:';
  db = await openDb();
});

describe('events ingest', () => {
  it('creates an event and issue with valid ingest key', async () => {
    const app = express();
    app.use(express.json());
    registerEventRoutes(app, db);

    const projectKey = 'demo';
    const ingestKey = 'secret-123';
    const now = Date.now();
    await db.prepare('INSERT INTO projects (projectKey, name, createdAt, ingestKey) VALUES (?, ?, ?, ?)').run(
      projectKey,
      projectKey,
      now,
      ingestKey
    );

    const payload = { projectKey, message: 'Something broke', stack: 'at app.js:10:5' };
    const res = await request(app).post('/api/events').set('x-stacktrail-ingest-key', ingestKey).send(payload);
    expect(res.status).toBe(201);
    expect(res.body.eventId).toBeTruthy();
    expect(res.body.issueId).toBeTruthy();

    const issues = await db.prepare('SELECT id, count FROM issues WHERE projectKey = ?').all(projectKey);
    expect(issues.length).toBe(1);
    expect(issues[0].count).toBe(1);
  });

  it('increment existing open issue on repeated events with same fingerprint', async () => {
    const app = express();
    app.use(express.json());
    registerEventRoutes(app, db);

    const projectKey = 'demo2';
    const ingestKey = 'secret-456';
    const now = Date.now();
    await db.prepare('INSERT INTO projects (projectKey, name, createdAt, ingestKey) VALUES (?, ?, ?, ?)').run(
      projectKey,
      projectKey,
      now,
      ingestKey
    );

    const payload = { projectKey, message: 'Same error', stack: 'at a.js:1:1' };
    const r1 = await request(app).post('/api/events').set('x-stacktrail-ingest-key', ingestKey).send(payload);
    expect(r1.status).toBe(201);
    const r2 = await request(app).post('/api/events').set('x-stacktrail-ingest-key', ingestKey).send(payload);
    expect(r2.status).toBe(201);
    expect(r1.body.issueId).toBe(r2.body.issueId);

    const row = await db.prepare('SELECT id, count FROM issues WHERE projectKey = ?').get(projectKey);
    expect(row.count).toBe(2);
  });

  it('rejects missing or invalid ingest key', async () => {
    const app = express();
    app.use(express.json());
    registerEventRoutes(app, db);

    const projectKey = 'demo3';
    const ingestKey = 'secret-789';
    const now = Date.now();
    await db.prepare('INSERT INTO projects (projectKey, name, createdAt, ingestKey) VALUES (?, ?, ?, ?)').run(
      projectKey,
      projectKey,
      now,
      ingestKey
    );

    const payload = { projectKey, message: 'Bad key', stack: '' };
    const resNoHeader = await request(app).post('/api/events').send(payload);
    expect(resNoHeader.status).toBe(401);

    const resBad = await request(app).post('/api/events').set('x-stacktrail-ingest-key', 'wrong').send(payload);
    expect(resBad.status).toBe(401);
  });
});