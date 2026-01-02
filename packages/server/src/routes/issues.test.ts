import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { openDb } from '../db';
import { registerEventRoutes } from './events';
import { registerIssueRoutes } from './issues';
import { SourceMapGenerator } from 'source-map';
import crypto from 'crypto';

let db: any;

beforeEach(async () => {
  process.env.SQLITE_DB_PATH = ':memory:';
  db = await openDb();
});

describe('issues behavior & mapping', () => {
  it('creates new issue and links to last resolved as previousIssueId', async () => {
    // create project
    const projectKey = 'link-test';
    const ingestKey = 'ik-link';
    const now = Date.now();
    await db.prepare('INSERT INTO projects (projectKey, name, createdAt, ingestKey) VALUES (?, ?, ?, ?)').run(
      projectKey,
      projectKey,
      now,
      ingestKey
    );

    // insert an issue and mark resolved
    const oldId = 'old-issue-1';
    const fingerprintVal = crypto.createHash('sha256').update(oldId).digest('hex');
    await db.prepare('INSERT INTO issues (id, projectKey, title, count, firstSeen, lastSeen, fingerprint, resolvedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(oldId, projectKey, 'old', 1, now - 1000, now - 1000, fingerprintVal, Date.now());

    const app = express();
    app.use(express.json());
    registerEventRoutes(app, db);

    // send a new event with same fingerprint (message and no stack -> fingerprint uses message)
    const payload = { projectKey, message: oldId, stack: '' };
    const r = await request(app).post('/api/events').set('x-stacktrail-ingest-key', ingestKey).send(payload);
    expect(r.status).toBe(201);
    const newIssueId = r.body.issueId;
    expect(newIssueId).toBeTruthy();
    expect(newIssueId).not.toBe(oldId);

    const row = await db.prepare('SELECT previousIssueId FROM issues WHERE id = ?').get(newIssueId);
    expect(row.previousIssueId).toBe(oldId);
  });

  it('mapping selects best sourcemap when filenames differ (declared file match)', async () => {
    const app = express();
    app.use(express.json());
    registerIssueRoutes(app, db);
    registerEventRoutes(app, db);

    const projectKey = 'map-heuristic';
    const ingestKey = 'ik-map';
    const now = Date.now();
    await db.prepare('INSERT INTO projects (projectKey, name, createdAt, ingestKey) VALUES (?, ?, ?, ?)').run(projectKey, projectKey, now, ingestKey);

    // Insert two source maps; one has fileName 'bundle-abc.map' but internal declared file 'app.js'
    const gen1 = new SourceMapGenerator({ file: 'app.js' });
    gen1.addMapping({ generated: { line: 1, column: 0 }, original: { line: 1, column: 0 }, source: 'src/app.ts' });
    gen1.setSourceContent('src/app.ts', 'console.log("hi")');
    const map1 = gen1.toString();

    const gen2 = new SourceMapGenerator({ file: 'other.js' });
    gen2.addMapping({ generated: { line: 1, column: 0 }, original: { line: 1, column: 0 }, source: 'src/other.ts' });
    gen2.setSourceContent('src/other.ts', 'console.log("other")');
    const map2 = gen2.toString();

    await db.prepare('INSERT INTO sourcemaps (id, projectKey, fileName, content, uploadedAt) VALUES (?, ?, ?, ?, ?)').run('m1', projectKey, 'bundle-abc.map', map1, now);
    await db.prepare('INSERT INTO sourcemaps (id, projectKey, fileName, content, uploadedAt) VALUES (?, ?, ?, ?, ?)').run('m2', projectKey, 'bundle-xyz.map', map2, now);

    // Trigger an event referencing app.js
    const payload = { projectKey, message: 'oops', stack: 'at app.js:1:1' };
    const ev = await request(app).post('/api/events').set('x-stacktrail-ingest-key', ingestKey).send(payload);
    expect(ev.status).toBe(201);
    const issueId = ev.body.issueId;

    const evs = await request(app).get(`/api/issues/${encodeURIComponent(issueId)}/events`).query({ projectKey });
    expect(evs.status).toBe(200);
    const events = evs.body.events;
    expect(events.length).toBeGreaterThan(0);
    // mappedFrames should point to source 'src/app.ts'
    expect(events[0].mappedFrames && events[0].mappedFrames[0].original && events[0].mappedFrames[0].original.source).toContain('src/app.ts');
  });
});