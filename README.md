# StackTrail — Client Error Tracker (MVP)

StackTrail is the new name for this project (formerly "Client Error Tracker").

A minimal Sentry-like platform for client-side JavaScript errors.

## What’s included

- **Server**: Express + SQLite ingest API
- **Web**: React dashboard (single view)
  - UI refreshed with Material UI (AppBar + Drawer), a new `Dashboard` page, and improved layout
- **SDK**: tiny browser SDK capturing `error` + `unhandledrejection`
- **Projects**: multiple `projectKey`s, selectable in the dashboard

## Quickstart

1) Install deps:

```bash
npm install
```

2) Run dev:

```bash
npm run dev
```

- Server: `http://localhost:4000`
- Dashboard: `http://localhost:5173`

Note: the dev Vite server is not protected by Basic Auth. For an authenticated UI, use the "Run with Auth" instructions below.

### Dev: serve UI through the server (proxy)

If you want to browse everything from `http://localhost:4000` in dev (API + UI) while keeping Vite HMR, enable the server's dev proxy:

```bash
PROXY_WEB_DEV=1 WEB_DEV_ORIGIN=http://localhost:5173 npm run dev
```

Then open `http://localhost:4000`.

## Local development (no npm publish)

This repo is not intended to be published to npm. If you want to use the SDK/CLI from another local project, use `npm link`.

### SDK via `npm link`

In this repo:

```bash
cd packages/sdk
npm install
npm run build
npm link
```

In your app repo:

```bash
npm link @stacktrail/sdk
```

If you change SDK code, re-run `npm run build` in `packages/sdk` (the linked package points at `dist/`).

### CLI via `npm link`

In this repo:

```bash
cd packages/cli
npm link
```

Then you can run:

```bash
stacktrail --help
```

If you prefer to add it to another project (so it appears in `node_modules/.bin`):

```bash
npm link @stacktrail/cli
```

## SDK usage

In your app:

```ts
import { initClientErrorTracker } from "@stacktrail/sdk";

initClientErrorTracker({
  dsn: "http://localhost:4000/api/events",
  projectKey: "demo",
  // ingestKey: "<per-project key>" // required for reporting
});
```

Then trigger an error and check the dashboard.

## Examples

Try out the SDK with pre-built example applications:

### HTML Demo

A simple HTML page with buttons to trigger various error types:

```bash
cd examples/html-demo
node server.js
```

Then open `http://localhost:8080` to test error capturing.

### React Demo

A React application demonstrating SDK integration:

```bash
cd examples/react-demo
npm install
npm run dev
```

Then open `http://localhost:3000` to test React error capturing.

Both examples send errors to the local server. Make sure the server is running first!

## CLI

For uploading sourcemaps and packaging builds from CI or locally, use the CLI.

Examples:

- Create a tar.gz from a directory and upload to a local server:

```bash
stacktrail --project demo --dir ./dist --ingest-key <KEY>
```

- Upload an existing archive:

```bash
stacktrail --project demo --file dist/maps.tgz --ingest-key <KEY>
```

If you don't want to use `npm link`, you can also run it directly from this repo:

```bash
node packages/cli/bin/cli.js --help
```

## Configuration

The dashboard uses `VITE_API_BASE` (defaults to same-origin when served by the server).

The server supports either SQLite or MySQL (choose via `DB_TYPE` in the `.env`).

SQLite (default):
- The server stores data in the file specified by `SQLITE_DB_PATH` (default `data.db`) in the project root.

MySQL (optional):
- Start a local MySQL instance with Docker Compose:

```bash
docker compose up -d
```

- The `docker-compose.yml` includes a MySQL 8 service and Adminer on port `8080`.
- Environment variables to point the server at MySQL:
  - `DB_TYPE=mysql` (or set individual `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`)

The server respects the following env vars:
- `PORT` (default `4000`)
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` (bootstrap first user if DB has no users)
- `SERVE_WEB=1` to serve the built dashboard from the server

## Authentication

The dashboard uses a **session-based login** UI:

- Unauthenticated browser navigations redirect to `/login`.
- The web app calls `/api/*` using the session cookie (no browser Basic Auth prompt).

For non-browser clients (scripts/CI/CLI), the server also supports `Authorization: Basic ...` on protected endpoints, but the server intentionally suppresses the `WWW-Authenticate` header so browsers don't show the native credential prompt.

Ingesting events is authenticated via a per-project **ingest key**:

- `/health` is public.
- `POST /api/events` requires an ingest key header.

Project reporting requests must include:

- `X-STACKTRAIL-Ingest-Key: <project-ingest-key>` (legacy `X-CET-Ingest-Key` is also accepted)

### Run with Auth (recommended)

The server will automatically create an initial admin user if none exist. If you do not provide `ADMIN_USERNAME` and `ADMIN_PASSWORD` in your environment, the server will create a user named `admin` and print a generated password to the server logs; change it immediately after first login.

```bash
# Build and assemble a runnable `dist/` at the repo root
npm run build

# Run the built server (serves the built web UI from dist/public)
ADMIN_USERNAME=admin ADMIN_PASSWORD=change-me SERVE_WEB=1 node dist/index.js

# Or run freshly-built server from package dir (equivalent)
ADMIN_USERNAME=admin ADMIN_PASSWORD=change-me SERVE_WEB=1 node packages/server/dist/index.js
```

Then open `http://localhost:4000` and log in via the `/login` page.

Note: `npm run build` now builds SDK, server and web and produces a `dist/` folder at the repo root with the following layout:

```
dist/
├─ index.js       # built server entrypoint
├─ package.json   # server package metadata
└─ public/        # built web static files to be served by the server
   └─ index.html
```

The top-level build places server build files at `dist/` root and copies the web build into `dist/public` so the server can serve the UI directly when run with `SERVE_WEB=1`.

### Docker (multi-stage) build

A Dockerfile is provided that builds the repository inside the image (multi-stage) and produces a minimal runtime image. Build and run locally:

```bash
# Build the image
docker build -t stacktrail:latest .

# Standalone run (no reverse proxy)
docker run -p 4000:4000 \
  -e SERVE_WEB=1 \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=change-me \
  stacktrail:latest
```

We also include a `docker-compose.yml` that brings up MySQL, Adminer, Traefik (reverse-proxy + ACME), and StackTrail. Traefik will obtain TLS certificates via Let's Encrypt and provide a hardened public-facing entrypoint with HTTPS, secure headers and rate limiting.

Quick docker-compose usage (recommended for running publicly):

```bash
# Option A (recommended): copy the template and edit it
cp .env.example .env
# Edit .env to set STACKTRAIL_HOST, LETSENCRYPT_EMAIL, and any secrets

# Bring up the stack
docker compose up -d
```

Notes & requirements:
- Traefik will only obtain real TLS certs for a domain that points to your server (DNS A/AAAA records).
- `traefik/letsencrypt/acme.json` is created and persisted under the repo; ensure it is not checked into git (it's in `.dockerignore`).
- The Traefik config uses a file provider for middlewares (`traefik/dynamic.yml`) which defines `secure-headers` and `rate-limit` (default 20 req/s with a small burst). Adjust values to suit your environment.
- You can set `STACKTRAIL_HOST` and `LETSENCRYPT_EMAIL` as environment variables in your deployment to enable automatic TLS and proper routing.


## Multi-project

- Each event includes a `projectKey`.
- The dashboard can create/select projects via the controls at the top.
- Projects can also be managed via the API:
  - `GET /api/projects`
  - `POST /api/projects` with `{ "projectKey": "shop", "name": "Shop" }`

