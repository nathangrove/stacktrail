import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { openDb } from '../db';
import { registerSourcemapRoutes } from './sourcemaps';
import { registerEventRoutes } from './events';
import { registerIssueRoutes } from './issues';
import { SourceMapGenerator } from 'source-map';
import tarStream from 'tar-stream';

let db: any;

beforeEach(async () => {
  process.env.SQLITE_DB_PATH = ':memory:';
  db = await openDb();
});

describe('sourcemap routes', () => {
  it('single sourcemap upload via JSON works and can be deleted', async () => {
    const app = express();
    app.use(express.json());
    registerSourcemapRoutes(app, db);

    const projectKey = 'proj-sm-1';
    const ingestKey = 'ik-1';
    const now = Date.now();
    await db.prepare('INSERT INTO projects (projectKey, name, createdAt, ingestKey) VALUES (?, ?, ?, ?)').run(projectKey, projectKey, now, ingestKey);

    const map = JSON.stringify({ version: 3, file: 'bundle.js', mappings: '' });
    const res = await request(app).post(`/api/projects/${encodeURIComponent(projectKey)}/sourcemaps`).send({ fileName: 'bundle.js.map', map });
    expect(res.status).toBe(201);
    expect(res.body.fileName).toBe('bundle.js.map');

    const list = await request(app).get(`/api/projects/${encodeURIComponent(projectKey)}/sourcemaps`);
    expect(list.status).toBe(200);
    expect(list.body.sourcemaps.length).toBe(1);
    const id = list.body.sourcemaps[0].id;

    const del = await request(app).delete(`/api/projects/${encodeURIComponent(projectKey)}/sourcemaps/${encodeURIComponent(id)}`);
    expect(del.status).toBe(200);

    const list2 = await request(app).get(`/api/projects/${encodeURIComponent(projectKey)}/sourcemaps`);
    expect(list2.status).toBe(200);
    expect(list2.body.sourcemaps.length).toBe(0);
  });

  it('bulk sourcemap upload via tar archive extracts .map files', async () => {
    const app = express();
    app.use(express.json());
    registerSourcemapRoutes(app, db);

    const projectKey = 'proj-sm-2';
    const ingestKey = 'ik-2';
    const now = Date.now();
    await db.prepare('INSERT INTO projects (projectKey, name, createdAt, ingestKey) VALUES (?, ?, ?, ?)').run(projectKey, projectKey, now, ingestKey);

    // create a tar with one .map file
    const pack = tarStream.pack();
    pack.entry({ name: 'dist/bundle.js.map' }, JSON.stringify({ version: 3, file: 'bundle.js', mappings: '' }));
    pack.finalize();

    // collect buffer
    const chunks: Buffer[] = [];
    for await (const c of pack) chunks.push(c as Buffer);
    const buf = Buffer.concat(chunks);

    const res = await request(app)
      .post(`/api/projects/${encodeURIComponent(projectKey)}/sourcemaps/bulk`)
      .set('x-stacktrail-ingest-key', ingestKey)
      .attach('file', buf, 'maps.tar');

    expect(res.status).toBe(201);
    expect(res.body.uploaded.length).toBeGreaterThan(0);
  });

  it('sourcemap maps stack frames to original sources', async () => {
    const app = express();
    app.use(express.json());
    registerSourcemapRoutes(app, db);
    registerEventRoutes(app, db);
    registerIssueRoutes(app, db);

    const projectKey = 'proj-sm-map';
    const ingestKey = 'ik-3';
    const now = Date.now();
    await db.prepare('INSERT INTO projects (projectKey, name, createdAt, ingestKey) VALUES (?, ?, ?, ?)').run(projectKey, projectKey, now, ingestKey);

    // Build a simple sourcemap that maps bundle.js:10:5 -> src/orig.js:1:2
    const gen = new SourceMapGenerator({ file: 'bundle.js' });
    gen.addMapping({ generated: { line: 10, column: 5 }, original: { line: 1, column: 2 }, source: 'src/orig.js' });
    gen.setSourceContent('src/orig.js', 'console.log("orig")');
    const mapJson = gen.toString();

    // upload as single map
    const res = await request(app).post(`/api/projects/${encodeURIComponent(projectKey)}/sourcemaps`).send({ fileName: 'bundle.js.map', map: mapJson });
    expect(res.status).toBe(201);

    // send an event referencing bundle.js:10:5
    const payload = { projectKey, message: 'err', stack: 'at bundle.js:10:5' };
    const ev = await request(app).post('/api/events').set('x-stacktrail-ingest-key', ingestKey).send(payload);
    expect(ev.status).toBe(201);
    const issueId = ev.body.issueId;

    const evs = await request(app).get(`/api/issues/${encodeURIComponent(issueId)}/events`).query({ projectKey });
    expect(evs.status).toBe(200);
    const events = evs.body.events as any[];
    expect(events.length).toBeGreaterThan(0);
    const e0 = events[0];
    expect(e0.mappedFrames).toBeTruthy();
    expect(e0.mappedFrames[0].original.source).toContain('src/orig.js');
  });
});