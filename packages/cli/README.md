# @stacktrail/cli

Small CLI to package and upload sourcemaps (ZIP / TAR / TGZ) to a StackTrail server.

This repo is not intended to be published to npm. For local development, use `npm link`.

## Install (local)

From this repo:

```bash
cd packages/cli
npm link
```

Now the `stacktrail` binary should be available:

```bash
stacktrail --help
```

If you want it installed into another project (so it shows up in `node_modules/.bin`):

```bash
cd /path/to/your-app
npm link @stacktrail/cli
```

## Usage

```bash
stacktrail --project <projectKey> --dir ./dist --ingest-key <KEY>
```

Or run directly from the repo during development:

```bash
node packages/cli/bin/cli.js --project demo --file /path/to/maps.zip
```

Run `stacktrail --help` for the full flag list.
