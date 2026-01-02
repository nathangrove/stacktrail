import type { Request, Response, Express } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { makeIngestKey } from '../middleware/auth.js';

const CreateProjectSchema = z.object({
  projectKey: z.string().min(1),
  name: z.string().min(1).optional()
});

export function registerProjectRoutes(app: Express, db: Db) {
  app.get('/api/projects', async (_req: Request, res: Response) => {
    const rows = await db.prepare('SELECT projectKey, name, createdAt FROM projects ORDER BY createdAt DESC LIMIT 200').all();
    res.json({ projects: rows });
  });

  app.post('/api/projects', async (req: Request, res: Response) => {
    const parsed = CreateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const now = Date.now();
    const { projectKey, name } = parsed.data;

    const existing = await db.prepare('SELECT projectKey, ingestKey FROM projects WHERE projectKey = ?').get(projectKey) as { projectKey: string; ingestKey: string | null } | undefined;

    if (!existing) {
      const ingestKey = makeIngestKey();
      await db.prepare('INSERT INTO projects (projectKey, name, createdAt, ingestKey) VALUES (?, ?, ?, ?)').run(
        projectKey,
        (name ?? projectKey).slice(0, 200),
        now,
        ingestKey
      );
      return res.status(201).json({ projectKey, ingestKey });
    }

    await db.prepare('UPDATE projects SET name = ? WHERE projectKey = ?').run(
      (name ?? projectKey).slice(0, 200),
      projectKey
    );
    return res.status(200).json({ projectKey });
  });

  app.get('/api/projects/:projectKey/ingest-key', async (req: Request, res: Response) => {
    const projectKey = req.params.projectKey;
    const row = await db.prepare('SELECT projectKey, ingestKey FROM projects WHERE projectKey = ?').get(projectKey) as { projectKey: string; ingestKey: string | null } | undefined;
    if (!row || !row.ingestKey) return res.status(404).json({ error: 'Unknown project' });
    res.json({ projectKey: row.projectKey, ingestKey: row.ingestKey });
  });

  // Delete a project and associated data (sourcemaps, events, issues)
  app.delete('/api/projects/:projectKey', async (req: Request, res: Response) => {
    const projectKey = req.params.projectKey;
    try {
      // Delete sourcemaps
      await db.prepare('DELETE FROM sourcemaps WHERE projectKey = ?').run(projectKey);
      // Delete events for issues of this project
      await db.prepare('DELETE FROM events WHERE projectKey = ?').run(projectKey);
      // Delete issues
      await db.prepare('DELETE FROM issues WHERE projectKey = ?').run(projectKey);
      // Delete project
      await db.prepare('DELETE FROM projects WHERE projectKey = ?').run(projectKey);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to delete project' });
    }
  });
}
