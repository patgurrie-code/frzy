import { test, expect, Page } from '@playwright/test';

type W = { __fray?: { state: { frame: number; phase: number }; net: { frame: number; confirmedFrame: number; checksumAt(f: number): number | undefined; desync: number } | null } };

async function openOnline(page: Page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await page.click('text=PRESS START', { force: true });
  await page.click('[data-m=online]');
}

test('two browsers play an online match with rollback and stay in sync', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const errors: string[] = [];
  for (const p of [a, b]) p.on('pageerror', (e) => errors.push(String(e)));

  await openOnline(a);
  await a.click('[data-a=create]');
  const code = (await a.locator('.room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{5}$/);

  // Guest joins through the invite link
  await b.addInitScript(() => localStorage.clear());
  await b.goto(`/?room=${code}`);
  await expect(a.locator('.on-player .f-name')).toHaveCount(2, { timeout: 15000 });
  await a.click('[data-a=start]');

  for (const p of [a, b]) await expect(p.locator('.vs-timer')).toBeVisible({ timeout: 15000 });
  await a.waitForFunction(() => ((window as unknown as W).__fray?.state.phase ?? 0) === 1, null, { timeout: 15000 });

  // Both players press buttons for a few seconds
  for (let i = 0; i < 12; i++) {
    await a.keyboard.down(i % 2 ? 'KeyD' : 'KeyA');
    await b.keyboard.down('KeyJ');
    await a.waitForTimeout(150);
    await a.keyboard.up(i % 2 ? 'KeyD' : 'KeyA');
    await b.keyboard.up('KeyJ');
    await a.keyboard.press('KeyJ');
    await a.waitForTimeout(100);
  }
  await a.waitForTimeout(800);

  const info = async (p: Page) => p.evaluate(() => {
    const n = (window as unknown as W).__fray!.net!;
    return { frame: n.frame, confirmed: n.confirmedFrame, desync: n.desync };
  });
  const ia = await info(a);
  const ib = await info(b);
  expect(ia.frame).toBeGreaterThan(200);
  expect(ib.frame).toBeGreaterThan(200);
  const f = Math.min(ia.confirmed, ib.confirmed, ia.frame, ib.frame) - 2;
  const sa = await a.evaluate((fr) => (window as unknown as W).__fray!.net!.checksumAt(fr), f);
  const sb = await b.evaluate((fr) => (window as unknown as W).__fray!.net!.checksumAt(fr), f);
  expect(sa).toBeDefined();
  expect(sa).toBe(sb);
  expect(ia.desync).toBe(-1);
  expect(ib.desync).toBe(-1);
  expect(errors).toEqual([]);
  await ctxA.close();
  await ctxB.close();
});
