import type { Request, Response, Express } from 'express';
import type { Db } from '../db.js';
import path from 'node:path';
import { SourceMapConsumer } from 'source-map';

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = typeof v === 'string' ? Number(v) : Array.isArray(v) ? Number(v[0]) : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export function registerIssueRoutes(app: Express, db: Db) {
  app.get('/api/issues', async (req: Request, res: Response) => {
    const projectKey = typeof req.query.projectKey === 'string' ? req.query.projectKey : 'demo';
    const includeResolved = req.query.includeResolved === '1' || req.query.includeResolved === 'true';

    const rows = includeResolved
      ? await db
          .prepare(
            'SELECT id, title, count, firstSeen, lastSeen, resolvedAt, previousIssueId FROM issues WHERE projectKey = ? ORDER BY lastSeen DESC LIMIT 200'
          )
          .all(projectKey)
      : await db
          .prepare(
            'SELECT id, title, count, firstSeen, lastSeen, resolvedAt, previousIssueId FROM issues WHERE projectKey = ? AND (resolvedAt IS NULL) ORDER BY lastSeen DESC LIMIT 200'
          )
          .all(projectKey);

    res.json({ projectKey, issues: rows });
  });

  app.get('/api/issues/:id', async (req: Request, res: Response) => {
    const issueId = req.params.id;
    const projectKey = typeof req.query.projectKey === 'string' ? req.query.projectKey : undefined;

    const row = await db
      .prepare(
        'SELECT id, projectKey, title, count, firstSeen, lastSeen, resolvedAt, previousIssueId, fingerprint FROM issues WHERE id = ?'
      )
      .get(issueId) as
      | {
          id: string;
          projectKey: string;
          title: string;
          count: number;
          firstSeen: number;
          lastSeen: number;
          resolvedAt: number | null;
          previousIssueId: string | null;
          fingerprint: string | null;
        }
      | undefined;

    if (!row) return res.status(404).json({ error: 'Issue not found' });
    if (projectKey && row.projectKey !== projectKey) return res.status(404).json({ error: 'Issue not found in project' });

    res.json(row);
  });

  app.post('/api/issues/:id/resolve', async (req: Request, res: Response) => {
    const issueId = req.params.id;

    const resolved = req.body && typeof req.body.resolved === 'boolean' ? req.body.resolved : true;
    const now = resolved ? Date.now() : null;

    const result = await db.prepare('UPDATE issues SET resolvedAt = ? WHERE id = ?').run(now, issueId);
    if ((result.changes ?? 0) === 0) return res.status(404).json({ error: 'Issue not found' });

    res.json({ success: true, resolvedAt: now });
  });

  app.get('/api/issues/:id/events', async (req: Request, res: Response) => {
    const issueId = req.params.id;
    const projectKey = typeof req.query.projectKey === 'string' ? req.query.projectKey : 'demo';
    const limit = clampInt(req.query.limit, 1, 200, 50);

    const rows = await db
      .prepare(
        'SELECT id, occurredAt, payloadJson FROM events WHERE issueId = ? AND projectKey = ? ORDER BY occurredAt DESC LIMIT ?'
      )
      .all(issueId, projectKey, limit) as Array<{ id: string; occurredAt: number; payloadJson: string }>;

    const maps = await db.prepare('SELECT id, fileName, content FROM sourcemaps WHERE projectKey = ?').all(projectKey) as Array<{
      id: string;
      fileName: string;
      content: string;
    }>;

    const events = [] as Array<any>;

    for (const r of rows) {
      const evt: any = { id: r.id, occurredAt: r.occurredAt, payload: JSON.parse(r.payloadJson) as any };

      // Map stack if present
      const stack = typeof evt.payload?.stack === 'string' ? evt.payload.stack : null;
      if (stack && maps.length) {
        const frames: Array<{ generated: { file: string; line: number; column: number }; original?: any; function?: string }> = [];
        // match both "at fn (file:line:col)" and "at file:line:col"
        const re = /at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(stack))) {
          const fn = m[1];
          const file = m[2];
          const line = Number(m[3]);
          const column = Number(m[4]);
          frames.push({ generated: { file, line, column }, function: fn });
        }

        const mappedFrames: Array<any> = [];

        function normalizeForMatch(name: string) {
          let n = (name || '') + '';
          n = path.basename(n);
          n = n.replace(/\.map$/i, '');
          n = n.replace(/[._-]?[a-z0-9]{6,32}$/i, '');
          n = n.replace(/[^a-z0-9_]/gi, '');
          return n.toLowerCase();
        }

        for (const f of frames) {
          const genFileBasename = path.basename(f.generated.file || '');
          const genNorm = normalizeForMatch(genFileBasename);
          let mapped: any = null;

          for (const mapRow of maps) {
            try {
              const mapBasename = path.basename(mapRow.fileName || '');
              const mapNorm = normalizeForMatch(mapBasename);

              let declaredFile: string | null = null;
              try {
                const parsedMap = JSON.parse(mapRow.content);
                if (parsedMap && typeof parsedMap.file === 'string') declaredFile = parsedMap.file;
              } catch (e) {
                // ignore
              }
              const declaredNorm = declaredFile ? normalizeForMatch(declaredFile) : null;

              const fileMatch = (
                (mapNorm && genNorm && (mapNorm === genNorm || mapNorm.includes(genNorm) || genNorm.includes(mapNorm))) ||
                (declaredNorm && genNorm && (declaredNorm === genNorm || declaredNorm.includes(genNorm) || genNorm.includes(declaredNorm))) ||
                mapRow.fileName.includes(genFileBasename)
              );

              if (!fileMatch) continue;

              console.log(`[sourcemap] trying map ${mapRow.fileName} for ${genFileBasename} (norm: ${mapNorm} vs ${genNorm}${declaredFile ? `, declared ${declaredFile}` : ''})`);
              const raw = JSON.parse(mapRow.content);
              // eslint-disable-next-line no-await-in-loop
              await SourceMapConsumer.with(raw, null, (consumer: any) => {
                const orig = consumer.originalPositionFor({ line: f.generated.line, column: f.generated.column });
                console.log(`[sourcemap] originalPositionFor ${f.generated.line}:${f.generated.column} -> ${JSON.stringify(orig)}`);
                if (orig && orig.source) mapped = { original: orig, sourceMapId: mapRow.id };
              });
              if (mapped) {
                console.log(`[sourcemap] mapped ${f.generated.file}:${f.generated.line}:${f.generated.column} -> ${JSON.stringify(mapped.original)} using ${mapRow.id}`);
                break;
              }
            } catch (err) {
              console.log('[sourcemap] error while parsing or mapping (first pass)', (err as any)?.message ?? String(err));
            }
          }

          if (!mapped) {
            for (const mapRow of maps) {
              try {
                console.log(`[sourcemap] fallback trying map ${mapRow.fileName} for ${genFileBasename}`);
                const raw = JSON.parse(mapRow.content);
                // eslint-disable-next-line no-await-in-loop
                await SourceMapConsumer.with(raw, null, (consumer: any) => {
                  const orig = consumer.originalPositionFor({ line: f.generated.line, column: f.generated.column });
                  if (orig && orig.source) mapped = { original: orig, sourceMapId: mapRow.id };
                });
                if (mapped) {
                  console.log(`[sourcemap] fallback mapped ${f.generated.file}:${f.generated.line}:${f.generated.column} -> ${JSON.stringify(mapped.original)} using ${mapRow.id}`);
                  break;
                }
              } catch (err) {
                console.log('[sourcemap] error while parsing or mapping (fallback)', (err as any)?.message ?? String(err));
              }
            }
          }
          if (mapped) {
            mappedFrames.push({ ...f, original: mapped.original });
          }
        }

        if (mappedFrames.length) evt.mappedFrames = mappedFrames;
      }

      events.push(evt);
    }

    res.json({ projectKey, issueId, events });
  });
}
