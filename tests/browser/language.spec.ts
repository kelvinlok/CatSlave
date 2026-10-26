import { expect, test, type Page } from '@playwright/test';

async function tap(page: Page, id: string) {
  const p = await page.evaluate(id => {
    const h = window.__CATSLAVE_TEST__.hud.controls.find(h => h.id === id)!;
    const r = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: r.left + h.x + h.w / 2, y: r.top + h.y + h.h / 2 };
  }, id);
  await page.mouse.click(p.x, p.y);
}
async function label(page: Page, id: string) {
  return page.evaluate(id => window.__CATSLAVE_TEST__.hud.controls.find(h => h.id === id)?.label, id);
}

test('Cantonese defaults, keyboard switching, saved preference and paused progress', async ({ page }, info) => {
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await expect(page.locator('html')).toHaveAttribute('lang', 'yue-Hant');
  await expect(page).toHaveTitle('貓奴');
  expect(await label(page, 'start')).toBe('開始玩  →');
  await page.screenshot({ path: `artifacts/language/title-${info.project.name}.png` });
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.focusedId)).toBe('language');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveTitle('CatSlave');
  expect(await label(page, 'start')).toBe('Play  →');
  await page.reload(); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await tap(page, 'learn'); await tap(page, 'pause');
  const before = await page.evaluate(() => {
    const g = window.__CATSLAVE_TEST__.game;
    return { hp: g.hp, clock: g.clock, step: g.tutorialStep, events: g.events };
  });
  await tap(page, 'language');
  expect(await label(page, 'resume')).toBe('繼續玩  →');
  expect(await page.evaluate(() => {
    const g = window.__CATSLAVE_TEST__.game;
    return { hp: g.hp, clock: g.clock, step: g.tutorialStep, events: g.events };
  })).toEqual(before);
  await page.screenshot({ path: `artifacts/language/pause-${info.project.name}.png` });
  await tap(page, 'resume');
  expect(await label(page, 'tool:sweeper')).toBe('掃把，第 1 級，已揀選');
  await page.reload(); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await expect(page.locator('html')).toHaveAttribute('lang', 'yue-Hant');
  await expect(page).toHaveTitle('貓奴');
});

test('unavailable preference storage still allows switching', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage blocked'); };
    Storage.prototype.setItem = () => { throw new Error('Storage blocked'); };
  });
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  expect(await label(page, 'start')).toBe('開始玩  →');
  await tap(page, 'language');
  expect(await label(page, 'start')).toBe('Play  →');
});

test('language controls fit short phones and desktop in both languages', async ({ browser, baseURL }, info) => {
  for (const [width, height] of [[320, 480], [1280, 800]]) {
    const context = await browser.newContext({ baseURL, viewport: { width, height }, hasTouch: width === 320, isMobile: width === 320 });
    const page = await context.newPage();
    await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
    for (const phase of ['title', 'paused'] as const) {
      await page.evaluate(phase => {
        const t = window.__CATSLAVE_TEST__; t.setManualClock(true);
        t.game.reset(true); if (phase === 'paused') t.game.pause(); else t.game.phase = 'title';
        t.refresh();
      }, phase);
      for (let language = 0; language < 2; language++) {
        const result = await page.evaluate(() => {
          const t = window.__CATSLAVE_TEST__, overflow: string[] = [], ctx = t.hud.ctx, original = ctx.fillText;
          ctx.fillText = function(value, x, y, ...rest) {
            const w = this.measureText(value).width;
            const left = x - (this.textAlign === 'center' ? w / 2 : this.textAlign === 'right' ? w : 0);
            if (left < 0 || left + w > t.hud.width || y < 0 || y > t.hud.height) overflow.push(value);
            original.call(this, value, x, y, ...rest);
          };
          try { t.refresh(); } finally { ctx.fillText = original; }
          return { hits: t.hud.controls, overflow, width: t.hud.width, height: t.hud.height };
        });
        expect(result.overflow).toEqual([]);
        for (const hit of result.hits) {
          expect(hit.w).toBeGreaterThanOrEqual(44); expect(hit.h).toBeGreaterThanOrEqual(44);
          expect(hit.x).toBeGreaterThanOrEqual(0); expect(hit.y).toBeGreaterThanOrEqual(0);
          expect(hit.x + hit.w).toBeLessThanOrEqual(result.width);
          expect(hit.y + hit.h).toBeLessThanOrEqual(result.height);
          for (const other of result.hits.filter(h => h.id !== hit.id)) {
            expect(hit.x < other.x + other.w && hit.x + hit.w > other.x && hit.y < other.y + other.h && hit.y + hit.h > other.y).toBe(false);
          }
        }
        await page.screenshot({ path: `artifacts/language/${width}-${phase}-${language}-${info.project.name}.png` });
        await tap(page, 'language');
      }
    }
    await context.close();
  }
});
