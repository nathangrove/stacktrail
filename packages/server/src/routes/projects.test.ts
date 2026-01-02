import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { openDb } from '../db';
import { registerProjectRoutes } from './projects';

let db: any;

beforeEach(async () => {
  process.env.SQLITE_DB_PATH = ':memory:';
  db = await openDb();
});

describe('projects routes', () => {
  it('GET /api/projects returns empty list initially', async () => {
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, db);

    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.projects)).toBe(true);
    expect(res.body.projects.length).toBe(0);
  });

  it('POST /api/projects creates a project and returns ingestKey', async () => {
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, db);

    const payload = { projectKey: 'shop', name: 'Shop' };
    const res = await request(app).post('/api/projects').send(payload);
    expect(res.status).toBe(201);
    expect(res.body.projectKey).toBe('shop');
    expect(typeof res.body.ingestKey).toBe('string');

    const keyRes = await request(app).get('/api/projects/shop/ingest-key');
    expect(keyRes.status).toBe(200);
    expect(keyRes.body.projectKey).toBe('shop');
    expect(typeof keyRes.body.ingestKey).toBe('string');
  });
});