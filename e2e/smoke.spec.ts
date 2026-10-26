import { test, expect, Page } from '@playwright/test';

type FrayWindow = { __fray?: { stepping: boolean; stepRequests: number; state: { frame: number; phase: number; fighters: { health: number; damage: number }[] } } };

async function boot(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await page.click('text=PRESS START', { force: true });
}

async function allCpu(page: Page) {
  const n = await page.locator('select[data-a=device]').count();
  for (let i = 0; i < n; i++) await page.locator('select[data-a=device]').nth(i).selectOption('cpu');
}

const frame = (page: Page) => page.evaluate(() => (window as unknown as FrayWindow).__fray?.state.frame ?? -1);

test('versus match runs with two CPUs and shows the versus HUD', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await page.click('[data-m=versus]');
  await allCpu(page);
  await page.click('[data-a=start]');
  await expect(page.locator('.vs-timer')).toBeVisible();
  await expect(page.locator('.vs-bar')).toHaveCount(2);
  const f0 = await frame(page);
  await page.waitForTimeout(3000);
  expect(await frame(page)).toBeGreaterThan(f0 + 30);
  expect(errors).toEqual([]);
});

test('platform match with 4 players, pause and quit', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await page.click('[data-m=platform]');
  // Add P3 and P4
  await page.locator('.slot').nth(2).locator('[data-a=toggle]').click();
  await page.locator('.slot').nth(3).locator('[data-a=toggle]').click();
  await allCpu(page);
  await page.click('[data-a=start]');
  await expect(page.locator('.pf-card')).toHaveCount(4);
  await page.waitForTimeout(2500);
  await page.keyboard.press('Escape');
  await expect(page.locator('.pause-screen')).toBeVisible();
  const paused = await frame(page);
  await page.waitForTimeout(500);
  expect(await frame(page)).toBe(paused);
  await page.click('[data-a=quit]');
  await expect(page.locator('.main-menu')).toBeVisible();
  expect(errors).toEqual([]);
});

test('keyboard player moves and training frame-step works', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await page.click('[data-m=training]');
  await page.click('[data-a=start]');
  await expect(page.locator('.training-panel')).toBeVisible();
  // Wait for GO
  await page.waitForFunction(() => (window as unknown as FrayWindow).__fray!.state.phase === 1);
  await page.keyboard.press('F2');
  await page.waitForFunction(() => {
    const m = (window as unknown as FrayWindow).__fray;
    return m?.stepping && m.stepRequests === 0;
  });
  const f = await frame(page);
  await page.waitForTimeout(300);
  expect(await frame(page)).toBe(f); // paused in step mode
  await page.keyboard.press('F2');
  await page.keyboard.press('F2');
  await expect.poll(() => frame(page)).toBe(f + 2);
  await page.keyboard.press('F3');
  await page.keyboard.press('F1');
  await page.keyboard.down('KeyJ');
  await page.waitForTimeout(100);
  await page.keyboard.up('KeyJ');
  await expect.poll(() => frame(page)).toBeGreaterThan(f + 10);
  expect(errors).toEqual([]);
});

test('key test screen shows registered keys', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await page.click('[data-m=settings]');
  await page.click('[data-t=keytest]');
  await page.keyboard.down('KeyJ');
  await expect(page.locator('.kt-row').first().locator('i.on')).toHaveText('Attack');
  await page.keyboard.up('KeyJ');
  expect(errors).toEqual([]);
});

test('story: chapter select -> cutscenes -> VS splash -> fight', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await page.click('[data-m=story]');
  await expect(page.locator('.ch-card')).toHaveCount(8);
  await page.click('[data-a=continue]');
  await expect(page.locator('.story-title')).toBeVisible();
  await page.keyboard.press('Escape'); // skip cutscenes up to the first fight
  await expect(page.locator('.story-vs')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.vs-timer')).toBeVisible();
  const f0 = await frame(page);
  await page.waitForTimeout(1500);
  expect(await frame(page)).toBeGreaterThan(f0);
  expect(errors).toEqual([]);
});
