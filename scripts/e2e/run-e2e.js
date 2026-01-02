#!/usr/bin/env node
// End-to-end dogfood test: wipe DB, start server, create project, build demo, upload sourcemaps, open demo, trigger error, assert issue with mapped frames

import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const SERVER_PKG = path.join(ROOT, 'packages', 'server');
const SERVER_DB = path.join(SERVER_PKG, 'data.db');
const ROOT_DB = path.join(ROOT, 'data.db');
const REACT_DIST = path.join(ROOT, 'examples', 'react-demo', 'dist');
const CLI_BIN = path.join(ROOT, 'packages', 'cli', 'bin', 'cli.js');

async function waitFor(url, opts = { timeout: 30000 }) {
  const start = Date.now();
  while (Date.now() - start < opts.timeout) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function spawnDetached(cmd, args, opts = {}) {
  const p = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...opts.env }, detached: false });
  return p;
}

(async () => {
  console.log('E2E: removing DB if exists');
  try { fs.unlinkSync(SERVER_DB); } catch (e) { }
  try { fs.unlinkSync(ROOT_DB); } catch (e) { }

  console.log('E2E: running project builds');
  // Build SDK/server/web and examples
  spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
  spawnSync('npm', ['--prefix', 'examples/react-demo', 'run', 'build'], { stdio: 'inherit' });

  console.log('E2E: starting server (serving built web)');
  const serverEnv = { ...process.env, ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'change-me', SERVE_WEB: '1' };
  const serverProc = spawn(process.execPath, [path.join('packages','server','dist','index.js')], { stdio: 'inherit', env: serverEnv });

  console.log('E2E: waiting for server to be ready');
  await waitFor('http://localhost:4000/health');
  console.log('E2E: server ready');

  console.log('E2E: creating project via API');
  const createRes = await fetch('http://localhost:4000/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + Buffer.from('admin:change-me').toString('base64') },
    body: JSON.stringify({ projectKey: 'react-demo', name: 'React Demo' })
  });
  if (createRes.status !== 201 && createRes.status !== 200) {
    console.error('Failed to create project', await createRes.text());
    process.exit(1);
  }
  const createJson = await createRes.json();
  const ingestKey = createJson.ingestKey;
  console.log('E2E: created project, ingestKey:', ingestKey);

  console.log('E2E: packaging and uploading react-demo dist');
  // Use CLI script to package and upload
  const cliArgs = ['--project', 'react-demo', '--dir', REACT_DIST, '--ingest-key', ingestKey];
  const cliRun = spawnSync(process.execPath, [CLI_BIN, ...cliArgs], { stdio: 'inherit' });
  if (cliRun.status !== 0) {
    console.error('CLI upload failed');
    process.exit(1);
  }

  console.log('E2E: starting static server for demo (http-server via npx)');
  const demoPort = 5177;
  const demoProc = spawn('npx', ['http-server', REACT_DIST, '-p', String(demoPort)], { stdio: 'inherit' });

  console.log('E2E: waiting for demo to be available');
  await waitFor(`http://localhost:${demoPort}`);

  console.log('E2E: launching browser');
  const browser = await chromium.launch({ headless: true });

  // Open demo, configure project and ingest key, trigger error
  const page = await browser.newPage();
  await page.goto(`http://localhost:${demoPort}`);
  await page.waitForSelector('input[placeholder="Project Key"]');
  await page.fill('input[placeholder="Project Key"]', 'react-demo');
  await page.fill('input[placeholder="Leave empty for demo"]', ingestKey);
  await page.click('button:has-text("Update Configuration")');
  // Wait a bit for SDK to initialize
  await page.waitForTimeout(500);

  console.log('E2E: triggering an uncaught error in the demo');
  await page.click('button:has-text("Throw Error")');
  await page.waitForTimeout(1000);

  console.log('E2E: opening admin UI and checking for issues');
  const adminContext = await browser.newContext({ httpCredentials: { username: 'admin', password: 'change-me' } });
  const adminPage = await adminContext.newPage();
  await adminPage.goto('http://localhost:4000');

  // Select project
  await adminPage.waitForSelector('select[aria-label="Select project"]');
  await adminPage.selectOption('select[aria-label="Select project"]', 'react-demo');

  // Wait for an issue row to appear with the expected message
  console.log('E2E: waiting for issues to appear');
  await adminPage.waitForSelector('table.table tbody tr');

  // Click first issue row button
  await adminPage.click('table.table tbody tr td button.rowButton');

  // Wait for events to load and check for mapped frames
  await adminPage.waitForSelector('div:has-text("Mapped stack (original locations):")', { timeout: 10000 }).catch(() => null);

  const hasMapped = await adminPage.$('div:has-text("Mapped stack (original locations):")');
  if (hasMapped) {
    console.log('E2E: Success — mapped frames present in UI');
    await browser.close();
    demoProc.kill();
    serverProc.kill();
    process.exit(0);
  } else {
    console.error('E2E: Failure — no mapped frames found');
    // For debugging, take a screenshot
    await adminPage.screenshot({ path: 'e2e-failure.png', fullPage: true });
    await browser.close();
    demoProc.kill();
    serverProc.kill();
    process.exit(2);
  }
})().catch(async (err) => {
  console.error('E2E: Error', err);
  try { process.exit(1); } catch {};
});