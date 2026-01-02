import type { Request, Response, Express } from 'express';
import crypto from 'node:crypto';
import type { Db } from '../db.js';
import { requireProjectIngestKey } from '../middleware/auth.js';
import { z } from 'zod';

const IngestEventSchema = z.object({
  projectKey: z.string().min(1),
  message: z.string().min(1),
  stack: z.string().optional(),
  url: z.string().optional(),
  userAgent: z.string().optional(),
  level: z.enum(['error', 'warning', 'info']).optional(),
  occurredAt: z.number().int().optional()
});

export function registerEventRoutes(app: Express, db: Db) {
  app.post('/api/events', async (req: Request, res: Response) => {
    const parsed = IngestEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const now = Date.now();
    const body = parsed.data;
    const occurredAt = body.occurredAt ?? now;

    if (!(await requireProjectIngestKey(body.projectKey, req, res, db))) return;

    const fingerprintSource = `${body.message}\n${body.stack ?? ''}`.trim();
    const fingerprint = crypto.createHash('sha256').update(fingerprintSource).digest('hex');
    const eventId = crypto.randomUUID();

    // Determine the issue this event belongs to (respecting resolved state)
    let issueId: string | null = null;

    // Find an existing OPEN issue with the same fingerprint for this project
    const existingOpen = await db
      .prepare('SELECT id, count FROM issues WHERE fingerprint = ? AND projectKey = ? AND (resolvedAt IS NULL) LIMIT 1')
      .get(fingerprint, body.projectKey) as { id: string; count: number } | undefined;

    if (existingOpen) {
      issueId = existingOpen.id;
      await db.prepare('UPDATE issues SET count = count + 1, lastSeen = ? WHERE id = ? AND projectKey = ?').run(
        occurredAt,
        issueId,
        body.projectKey
      );
    } else {
      // No open issue found. Link to the last resolved issue if any and create a new issue
      const lastResolved = await db
        .prepare(
          'SELECT id FROM issues WHERE fingerprint = ? AND projectKey = ? AND resolvedAt IS NOT NULL ORDER BY lastSeen DESC LIMIT 1'
        )
        .get(fingerprint, body.projectKey) as { id: string } | undefined;

      issueId = crypto.randomUUID();

      await db.prepare(
        'INSERT INTO issues (id, projectKey, title, count, firstSeen, lastSeen, fingerprint, previousIssueId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(issueId, body.projectKey, body.message.slice(0, 200), 1, occurredAt, occurredAt, fingerprint, lastResolved?.id ?? null);
    }

    // Now insert the event linked to the determined issueId
    await db.prepare(
      'INSERT INTO events (id, issueId, projectKey, occurredAt, payloadJson) VALUES (?, ?, ?, ?, ?)'
    ).run(eventId, issueId, body.projectKey, occurredAt, JSON.stringify(body));

    return res.status(201).json({ eventId, issueId });
  });
}
