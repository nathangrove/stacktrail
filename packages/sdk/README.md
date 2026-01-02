# @stacktrail/sdk

Tiny browser SDK that captures `error` and `unhandledrejection` and posts them to a StackTrail server.

This repo is not intended to be published to npm. For local development in another project, use `npm link`.

## Install (local)

From this repo:

```bash
cd packages/sdk
npm install
npm run build
npm link
```

From your app repo:

```bash
npm link @stacktrail/sdk
```

If you change SDK code, re-run `npm run build` in `packages/sdk` (the linked package exports from `dist/`).

## Usage

```ts
import { initStackTrail } from "@stacktrail/sdk";

initStackTrail({
  dsn: "http://localhost:4000/api/events",
  projectKey: "demo",
  // ingestKey: "<per-project ingest key>"
});
```

Backwards-compatible alias:

```ts
import { initClientErrorTracker } from "@stacktrail/sdk";
```
