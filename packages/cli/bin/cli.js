#!/usr/bin/env node
// StackTrail CLI: package + upload sourcemaps
// Usage:
//   npx @stacktrail/cli --project <key> --file <path> [--ingest-key KEY] [--url http://localhost:4000] [--basic user:pass]
//   npx @stacktrail/cli --project <key> --dir <path> [--gzip|--no-gzip] [--ingest-key KEY]
//     Default is --gzip (creates a .tgz). Use --no-gzip to create a plain .tar archive.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

function printHelp() {
  console.log(`StackTrail CLI - package and upload sourcemaps

Usage:
  stacktrail --project <key> --file <path> [--ingest-key KEY] [--url http://localhost:4000] [--basic user:pass]
  stacktrail --project <key> --dir <path> [--gzip|--no-gzip] [--ingest-key KEY]

Options:
  --project <key>       Project key (required)
  --file <path>         Path to a file to upload
  --dir <path>          Directory to archive & upload
  --gzip / --no-gzip    Gzip archive when using --dir (default: --gzip)
  --ingest-key <KEY>    Project ingest key for uploads
  --url <url>           API base URL (default: http://localhost:4000)
  --basic <user:pass>   Basic auth credentials for API (user:pass)
  -h, --help            Show this help message
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--project') out.project = args[++i];
    else if (a === '--file') out.file = args[++i];
    else if (a === '--dir') out.dir = args[++i];
    else if (a === '--no-gzip') out.gzip = false;
    else if (a === '--gzip') out.gzip = true;
    else if (a === '--ingest-key') out.ingestKey = args[++i];
    else if (a === '--url') out.url = args[++i];
    else if (a === '--basic') out.basic = args[++i];
    else if (a === '--help' || a === '-h') out.help = true;
    else { console.error('Unknown arg', a, '\nUse --help to show usage.'); process.exit(2); }
  }
  return out;
}

(async function main(){
  const opts = parseArgs();
  if (opts.help) {
    printHelp();
    process.exit(0);
  }
  const { project, file, dir, gzip = true, ingestKey, url = 'http://localhost:4000', basic } = opts;
  if (!project || (!file && !dir)) {
    console.error('Missing --project and --file or --dir');
    process.exit(2);
  }

  let filePath = null;
  let cleanupTemp = false;

  if (dir) {
    const dirPath = path.resolve(process.cwd(), dir);
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      console.error('Directory not found:', dirPath);
      process.exit(2);
    }
    const tmpName = `stacktrail-upload-${Date.now()}${gzip ? '.tgz' : '.tar'}`;
    const tmpPath = path.join(os.tmpdir(), tmpName);
    try {
      if (gzip) execSync(`tar -czf "${tmpPath}" -C "${dirPath}" .`);
      else execSync(`tar -cf "${tmpPath}" -C "${dirPath}" .`);
      filePath = tmpPath;
      cleanupTemp = true;
    } catch (e) {
      console.error('Failed to create tar archive:', e.message ?? e);
      process.exit(1);
    }
  } else {
    filePath = path.resolve(process.cwd(), file);
    if (!fs.existsSync(filePath)) { console.error('File not found:', filePath); process.exit(2); }
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) { console.error('Not a file:', filePath); process.exit(2); }
  }

  const buf = fs.readFileSync(filePath);

  const form = new FormData();
  form.append('file', new Blob([buf]), path.basename(filePath));

  const headers = {};
  if (ingestKey) { headers['X-STACKTRAIL-Ingest-Key'] = ingestKey; headers['X-CET-Ingest-Key'] = ingestKey; }
  if (basic) headers['Authorization'] = `Basic ${Buffer.from(basic).toString('base64')}`;

  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/api/projects/${encodeURIComponent(project)}/sourcemaps/bulk`, {
      method: 'POST',
      headers: { ...headers },
      body: form
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      console.error('Upload failed', res.status, json);
      process.exit(1);
    }

    console.log('Upload successful');
    console.log(JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Error uploading:', err);
    process.exit(1);
  } finally {
    if (cleanupTemp && filePath) {
      try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
    }
  }
})();