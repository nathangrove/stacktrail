import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from 'node:crypto';
import { createProxyMiddleware } from "http-proxy-middleware";
import { openDb } from "./db.js";
import type { Request, Response } from "express";

// Load env vars from packages/server/.env (works from both src/ and dist/ builds).
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(serverRoot, ".env") });

const app = express();

// Never emit a Basic auth challenge header.
// Browsers show a native credential prompt when they receive a 401 with WWW-Authenticate.
// We still enforce auth via status codes, but suppress the challenge header globally.
app.use((req, res, next) => {
  // Guard common ways headers get set in Express/Node.
  const originalSetHeader = res.setHeader.bind(res);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (res as any).setHeader = (name: string, value: any) => {
    if (typeof name === 'string' && name.toLowerCase() === 'www-authenticate') return res;
    return originalSetHeader(name, value);
  };

  const originalWriteHead = res.writeHead.bind(res);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (res as any).writeHead = (statusCode: any, reasonPhrase?: any, headers?: any) => {
    let rp = reasonPhrase;
    let h = headers;

    // writeHead(statusCode, headers)
    if (rp && typeof rp === 'object' && !Array.isArray(rp)) {
      h = rp;
      rp = undefined;
    }

    if (h && typeof h === 'object') {
      for (const k of Object.keys(h)) {
        if (k.toLowerCase() === 'www-authenticate') delete h[k];
      }
    }

    res.removeHeader('WWW-Authenticate');
    return originalWriteHead(statusCode, rp, h);
  };

  // In case something already set it before writeHead.
  res.removeHeader('WWW-Authenticate');
  next();
});

app.use(
  cors({
    origin: true,
    credentials: true,
    // Allow both legacy and new ingest key headers
    allowedHeaders: ["Content-Type", "Authorization", "X-CET-Token", "X-CET-Ingest-Key", "X-STACKTRAIL-Ingest-Key"]
  })
);
// Allow larger payloads for source map uploads (10 MB), still fairly conservative
app.use(express.json({ limit: "10mb" }));

// Cookie-based sessions for UI authentication
import cookieSession from 'cookie-session';
app.use(cookieSession({
  name: 'stacktrail_session',
  // session secret defaults to env var or generated random value (not suitable for cluster without shared secret)
  secret: process.env.SESSION_SECRET ?? crypto.randomBytes(24).toString('hex'),
  maxAge: 24 * 60 * 60 * 1000, // 1 day
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax'
}));

const db = await openDb();

// Register routes from smaller modules to keep this file concise
import { registerProjectRoutes } from './routes/projects.js';
import { registerSourcemapRoutes } from './routes/sourcemaps.js';
import { registerEventRoutes } from './routes/events.js';
import { registerIssueRoutes } from './routes/issues.js';
import { registerUserRoutes } from './routes/users.js';
import { ensureAdminUser, requireUserAuth } from './middleware/auth.js';

await ensureAdminUser(db);

// Require Basic auth for every non-UI route (APIs), except ingest endpoints which use project ingest keys
// For UI routes, require a session unless running with PROXY_WEB_DEV=1 (dev convenience)
app.use(async (req, res, next) => {
  // Allow ingest endpoints and health and bulk upload without basic/session auth
  if (isEventIngestRoute(req) || isBulkSourcemapUploadRoute(req) || req.path === "/health") return next();

  // If it's a UI route, require session-based auth (unless dev proxy is enabled)
  if (isUiRoute(req)) {
    // Allow auth endpoints (login/logout/session) to be accessed without session
    if (req.path.startsWith('/auth')) return next();

    // In dev with PROXY_WEB_DEV, keep UI open for vite HMR convenience
    if (process.env.PROXY_WEB_DEV === '1') return next();

    const user = (req as any).session?.user;
    if (user) return next();

    // If request expects JSON, return 401; otherwise redirect to login page
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/login');
  }

  // Non-UI routes require Basic auth **or** a valid session (so the UI can call APIs using the session cookie)
  // If a browser (Accept: text/html) reaches a non-UI route and isn't authenticated, redirect to login
  if (req.headers.accept && req.headers.accept.includes('text/html')) {
    // Redirect to the UI login page instead of returning 401 so users land on the login flow
    return res.redirect('/login');
  }

  // Allow session-based authenticated users to call API endpoints
  if ((req as any).session?.user) {
    console.log(`[server] session-authenticated request: ${req.method} ${req.path}`);
    return next();
  }

  if (!(await requireUserAuth(req, res, db))) return;
  console.log(`[server] authenticated request: ${req.method} ${req.path}`);
  next();
});

registerProjectRoutes(app, db);
registerSourcemapRoutes(app, db);
registerEventRoutes(app, db);
registerIssueRoutes(app, db);
registerUserRoutes(app, db);

// Session auth endpoints for UI login/logout and session check
app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
    const row = await db.prepare('SELECT id, passwordHash FROM users WHERE username = ?').get(username) as { id: string; passwordHash: string } | undefined;
    if (!row) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await import('bcryptjs').then(m => m.compareSync(password, row.passwordHash));
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    (req as any).session = (req as any).session || {};
    (req as any).session.user = { id: row.id, username };
    res.json({ success: true, username });
  } catch (e: any) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/auth/logout', (_req, res) => {
  ( _req as any).session = null;
  res.json({ success: true });
});

app.get('/auth/session', (req, res) => {
  const user = (req as any).session?.user;
  if (user) return res.json({ user });
  // Never include Basic auth challenge headers on session endpoints.
  // A 401 + WWW-Authenticate triggers the browser's native credential prompt.
  res.removeHeader('WWW-Authenticate');
  return res.status(401).json({ error: 'Not authenticated' });
});



app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});



function isUiRoute(req: Request) {
  return !req.path.startsWith("/api") && req.path !== "/health";
}

function isEventIngestRoute(req: Request) {
  return req.path === "/api/events" && req.method.toUpperCase() === "POST";
}

function isBulkSourcemapUploadRoute(req: Request) {
  // matches POST /api/projects/:projectKey/sourcemaps/bulk
  const m = req.path.match(/^\/api\/projects\/[^/]+\/sourcemaps\/bulk$/);
  return !!m && req.method.toUpperCase() === 'POST';
}

const webDist = path.resolve("./public");
if (process.env.NODE_ENV === "production" && fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api") || req.path === "/health") return res.status(404).end();
    res.sendFile(path.join(webDist, "index.html"));
  });
}

const port = Number(process.env.PORT ?? 4000);
const server = app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://localhost:${port}`);
});

// Dev-only: proxy the Vite dev server behind this server so you can browse
// the app from http://localhost:${PORT} while still having HMR.
//
// Enable with:
//   NODE_ENV=development
if (process.env.NODE_ENV === "development") {
  const target = "http://localhost:5173";

  const webProxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    ws: true,
    secure: false,
    // Only proxy non-API routes; /api and /health stay handled by this server.
    pathFilter: (pathname) => !pathname.startsWith("/api") && pathname !== "/health"
  });

  // Note: auth middleware above still applies, but UI routes skip it so the dev UI stays available.
  app.use(webProxy);

  // Required for Vite HMR websocket upgrades.
  server.on("upgrade", webProxy.upgrade);

  // eslint-disable-next-line no-console
  console.log(`[server] proxying dev web from ${target}`);
}
  // Catch body parser payload-too-large errors and return a friendly JSON message
  // This catches requests (like sourcemap uploads) that exceed the configured limit.
  // Express/body-parser sets err.type === 'entity.too.large' for these cases.
  // Place this after routes and proxies so it can handle errors generated earlier.
  app.use((err: any, _req: Request, res: Response, next: any) => {
    if (!err) return next();
    if (err.type === "entity.too.large" || err.status === 413) {
      return res.status(413).json({ error: "Payload too large", message: "Uploaded file exceeds size limit (10 MB)." });
    }
    // propagate
    return next(err);
  });