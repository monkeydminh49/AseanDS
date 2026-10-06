import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1512, height: 1100 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:5173');
  await page.locator('.province-row').first().waitFor();
  assert.equal(await page.locator('.province-row').count(), 131);
  await page.getByLabel('Search provinces').fill('North Kalimantan');
  assert.equal(await page.locator('.province-row').count(), 1);
  await page.locator('.province-row').click();
  await page.locator('.map-info button').click();
  await page.getByRole('heading', { name: 'Monthly monitoring' }).waitFor();
  await page.getByRole('button', { name: 'Open Cà Mau pilot' }).click();
  await page.locator('.candidate-row').first().waitFor();
  assert.equal(await page.locator('.candidate-row').count(), 5);
  assert.match(await page.locator('.metric-large').innerText(), /573\.5/);
  await page.screenshot({ path: '/tmp/aquaeye-detail.png', fullPage: true });
  await page.getByLabel('Observation month').selectOption('10');
  assert.match(await page.locator('.metric-large').innerText(), /532\.5/);
  await page.getByLabel('Observation month').selectOption('11');
  await page.getByRole('button', { name: 'Lost', exact: true }).click();
  assert.equal(await page.locator('.candidate-row .loss').count(), 5);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('button', { name: 'Water change', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Water change', exact: true }).getAttribute('aria-pressed'), 'false');
  await page.getByRole('button', { name: 'Water change', exact: true }).click();
  await page.getByRole('button', { name: 'Add to inspection plan', exact: true }).click();
  await page.locator('.candidate-row').nth(1).click();
  await page.getByRole('button', { name: 'Add to inspection plan', exact: true }).click();
  await page.getByRole('button', { name: 'Inspection planner' }).click();
  assert.equal(await page.locator('.stop').count(), 2);
  const firstBefore = await page.locator('.stop-info small').first().innerText();
  await page.getByLabel('Move stop 1 down').click();
  assert.notEqual(await page.locator('.stop-info small').first().innerText(), firstBefore);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadEvent;
  const csv = await fs.readFile(await download.path(), 'utf8');
  assert.equal(csv.trim().split('\r\n').length, 3);
  assert.match(csv, /"latitude","longitude","water_change_km2"/);
  assert.match(csv, /"2026-07","2026-08"/);
  await page.reload();
  await page.locator('.stop').first().waitFor();
  assert.equal(await page.locator('.stop').count(), 2);
  await page.screenshot({ path: '/tmp/aquaeye-plan.png', fullPage: true });
  await page.getByLabel('Remove stop 1').click();
  assert.equal(await page.locator('.stop').count(), 1);
  await page.getByRole('button', { name: 'Data & satellites' }).click();
  await page.locator('.globe-canvas canvas').waitFor();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/aquaeye-admin.png', fullPage: true });
  await page.getByRole('button', { name: 'Sources & methodology', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport);
    for (const hash of ['explore', 'detail', 'admin', 'plan']) {
      await page.goto(`http://127.0.0.1:5173/#${hash}`);
      await page.locator('.page h1').waitFor();
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, `Horizontal overflow: ${hash} at ${viewport.width}px`);
      if (viewport.width === 390) await page.screenshot({ path: `/tmp/aquaeye-mobile-${hash}.png`, fullPage: true });
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS: province search/detail, monthly values, filters, layer toggle, candidate selection, route ordering/removal/persistence, CSV content, globe, modal keyboard handling, and four screens at mobile/tablet widths. No browser errors.');
} finally {
  await browser.close();
}
