#!/usr/bin/env node
import { chromium } from 'playwright';

(async () => {
  const demoPort = 5177;
  const ingestKey = process.argv[2];
  if (!ingestKey) { console.error('Usage: node scripts/e2e/check-ui.js <ingestKey>'); process.exit(2); }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${demoPort}`);
  await page.waitForSelector('input[placeholder="Enter project key"]');
  await page.fill('input[placeholder="Enter project key"]', 'react-demo');
  await page.fill('input[placeholder="Leave empty for demo"]', ingestKey);
  await page.click('button:has-text("Update Configuration")');
  await page.waitForTimeout(500);

  console.log('Triggering uncaught error...');
  await page.click('button:has-text("Throw Error")');
  await page.waitForTimeout(1000);

  const adminContext = await browser.newContext({ httpCredentials: { username: 'admin', password: 'change-me' } });
  const adminPage = await adminContext.newPage();
  await adminPage.goto('http://localhost:4000');
  await adminPage.waitForSelector('select[aria-label="Select project"]');
  await adminPage.selectOption('select[aria-label="Select project"]', 'react-demo');
  await adminPage.waitForSelector('table.table tbody tr');
  await adminPage.click('table.table tbody tr td button.rowButton');
  await adminPage.waitForTimeout(500);

  const hasMapped = await adminPage.$('div:has-text("Mapped stack (original locations):")');
  if (hasMapped) {
    console.log('Success: mapped frames present in UI');
    await browser.close();
    process.exit(0);
  } else {
    console.error('Failure: no mapped frames found');
    await adminPage.screenshot({ path: 'e2e-check-failure.png', fullPage: true });
    await browser.close();
    process.exit(1);
  }
})();