import type { Request, Response, Express } from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'module';
import type { Db } from '../db.js';
import { requireProjectIngestKey } from '../middleware/auth.js';

const require2 = createRequire(import.meta.url);
const multer = require2('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export function registerSourcemapRoutes(app: Express, db: Db) {
  app.get('/api/projects/:projectKey/sourcemaps', async (req: Request, res: Response) => {
    const projectKey = req.params.projectKey;
    const rows = await db.prepare('SELECT id, fileName, uploadedAt FROM sourcemaps WHERE projectKey = ? ORDER BY uploadedAt DESC').all(projectKey);
    res.json({ projectKey, sourcemaps: rows });
  });

  app.post('/api/projects/:projectKey/sourcemaps', async (req: Request, res: Response) => {
    const projectKey = req.params.projectKey;
    const body = req.body as { fileName?: string; map?: string };
    if (!body.fileName || !body.map) return res.status(400).json({ error: 'Missing fileName or map' });

    const now = Date.now();
    const id = crypto.randomUUID();

    // Try to parse the provided map and prefer the map's own "file" property as the stored filename
    let filenameToStore = body.fileName.slice(0, 200);
    try {
      const parsed = JSON.parse(body.map);
      if (parsed && typeof parsed.file === 'string' && parsed.file.length) {
        filenameToStore = `${parsed.file}.map`.slice(0, 200);
      }
    } catch (err) {
      // If parsing fails, fall back to provided filename
    }

    await db.prepare('INSERT INTO sourcemaps (id, projectKey, fileName, content, uploadedAt) VALUES (?, ?, ?, ?, ?)').run(
      id,
      projectKey,
      filenameToStore,
      body.map,
      now
    );

    res.status(201).json({ id, projectKey, fileName: filenameToStore, uploadedAt: now });
  });

  // Bulk upload endpoint
  app.post('/api/projects/:projectKey/sourcemaps/bulk', upload.single('file'), async (req: Request, res: Response) => {
    const projectKey = req.params.projectKey;

    // Authorization: allow ingest key or admin basic auth
    if (!(await requireProjectIngestKey(projectKey, req, res, db))) return;

    const file = (req as any).file;
    if (!file || !file.buffer) return res.status(400).json({ error: 'Missing file' });

    try {
      const name = (file.originalname || '').toLowerCase();
      const results: Array<{ id: string; fileName: string; uploadedAt: number }> = [];
      const warnings: string[] = [];

      const storeMap = (entryPath: string, content: string) => {
        if (content.length > 10 * 1024 * 1024) {
          warnings.push(`${entryPath}: exceeds max map size`);
          return;
        }
        let filenameToStore = path.basename(entryPath).slice(0, 200);
        try {
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed.file === 'string' && parsed.file.length) filenameToStore = `${parsed.file}.map`.slice(0, 200);
        } catch (e) {
          warnings.push(`${entryPath}: invalid JSON map`);
        }
        const now = Date.now();
        const id = crypto.randomUUID();
        db.prepare('INSERT INTO sourcemaps (id, projectKey, fileName, content, uploadedAt) VALUES (?, ?, ?, ?, ?)').run(
          id,
          projectKey,
          filenameToStore,
          content,
          now
        );
        results.push({ id, fileName: filenameToStore, uploadedAt: now });
      };

      const unzipper = require2('unzipper');

      if (name.endsWith('.zip')) {
        const archive = await unzipper.Open.buffer(file.buffer as Buffer);
        for (const entry of archive.files) {
          if (!entry.path) continue;
          if (!entry.path.toLowerCase().endsWith('.map')) continue;
          try {
            const buf = await entry.buffer();
            storeMap(entry.path, buf.toString('utf8'));
          } catch (err: any) {
            warnings.push(`${entry.path}: ${String(err?.message ?? err)}`);
          }
        }
      } else if (name.endsWith('.tar') || name.endsWith('.tgz') || name.endsWith('.tar.gz')) {
        const tarStream = require2('tar-stream');
        const gunzipMaybe = require2('gunzip-maybe');
        const { Readable } = require2('stream');
        await new Promise<void>((resolve, reject) => {
          const extract = tarStream.extract();
          extract.on('entry', (header: any, stream: any, next: any) => {
            const entryPath = header.name;
            if (header.type !== 'file' || !entryPath || !entryPath.toLowerCase().endsWith('.map')) {
              stream.resume(); next(); return;
            }
            const chunks: Buffer[] = [];
            let size = 0;
            stream.on('data', (c: Buffer) => {
              size += c.length;
              if (size > 10 * 1024 * 1024) { warnings.push(`${entryPath}: exceeds max map size`); chunks.length = 0; stream.resume(); return; }
              chunks.push(c);
            });
            stream.on('end', () => {
              if (chunks.length) {
                try { storeMap(entryPath, Buffer.concat(chunks).toString('utf8')); } catch (e: any) { warnings.push(`${entryPath}: ${String(e?.message ?? e)}`); }
              }
              next();
            });
            stream.on('error', (e: any) => { warnings.push(`${entryPath}: ${String(e?.message ?? e)}`); next(); });
          });
          extract.on('finish', () => resolve());
          extract.on('error', (e: any) => reject(e));
          const rs = Readable.from(file.buffer as Buffer);
          rs.pipe(gunzipMaybe()).pipe(extract);
        });
      } else {
        // attempt zip then tar as a fallback
        let handled = false;
        try {
          const archive = await unzipper.Open.buffer(file.buffer as Buffer);
          handled = true;
          for (const entry of archive.files) {
            if (!entry.path) continue;
            if (!entry.path.toLowerCase().endsWith('.map')) continue;
            try { const buf = await entry.buffer(); storeMap(entry.path, buf.toString('utf8')); } catch (e: any) { warnings.push(`${entry.path}: ${String(e?.message ?? e)}`); }
          }
        } catch (e) { /* not a zip */ }
        if (!handled) {
          try {
            const tarStream = require2('tar-stream');
            const gunzipMaybe = require2('gunzip-maybe');
            const { Readable } = require2('stream');
            await new Promise<void>((resolve, reject) => {
              const extract = tarStream.extract();
              extract.on('entry', (header: any, stream: any, next: any) => {
                const entryPath = header.name;
                if (header.type !== 'file' || !entryPath || !entryPath.toLowerCase().endsWith('.map')) { stream.resume(); next(); return; }
                const chunks: Buffer[] = [];
                let size = 0;
                stream.on('data', (c: Buffer) => { size += c.length; if (size > 10 * 1024 * 1024) { warnings.push(`${entryPath}: exceeds max map size`); chunks.length = 0; stream.resume(); return; } chunks.push(c); });
                stream.on('end', () => { if (chunks.length) { try { storeMap(entryPath, Buffer.concat(chunks).toString('utf8')); } catch (e: any) { warnings.push(`${entryPath}: ${String(e?.message ?? e)}`); } } next(); });
                stream.on('error', (e: any) => { warnings.push(`${entryPath}: ${String(e?.message ?? e)}`); next(); });
              });
              extract.on('finish', () => resolve());
              extract.on('error', (e: any) => reject(e));
              const rs = Readable.from(file.buffer as Buffer);
              rs.pipe(gunzipMaybe()).pipe(extract);
            });
          } catch (e) { /* not a tar */ }
        }
      }

      if (results.length === 0) return res.status(400).json({ error: 'No .map files found in archive', warnings });

      res.status(201).json({ uploaded: results, warnings });
    } catch (err: any) {
      res.status(400).json({ error: 'Failed to parse archive', message: String(err?.message ?? err) });
    }
  });

  app.delete('/api/projects/:projectKey/sourcemaps/:id', async (req: Request, res: Response) => {
    const projectKey = req.params.projectKey;
    const id = req.params.id;

    const result = await db.prepare('DELETE FROM sourcemaps WHERE id = ? AND projectKey = ?').run(id, projectKey);
    if ((result.changes ?? 0) === 0) return res.status(404).json({ error: 'Not found' });

    res.json({ success: true });
  });
}
