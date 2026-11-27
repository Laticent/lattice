#!/usr/bin/env node
/**
 * THROWAWAY probe for engineering/decisions/2026-11-27-shared-chrome-for-tests.md: is a page in a
 * shared browser visible, and does its requestAnimationFrame run?
 *
 * Two tabs in the default context share one window, so only the newest is visible; the older one
 * reports `hidden` and its rAF stops. A page in its own browser context gets its own window and
 * stays visible. Prints one line per page. The rAF count is read over 500 ms and the probe gives up
 * on a page after 3 s (a script deadline, not a test assertion).
 */
import { createRequire } from 'node:module';

const puppeteer = createRequire(import.meta.url)('puppeteer');
const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const state = (p) => p.evaluate(() => `${document.visibilityState}, focus=${document.hasFocus()}`);
const frames = (p) =>
  Promise.race([
    p.evaluate(
      () =>
        new Promise((r) => {
          let n = 0;
          const t = performance.now();
          (function f() {
            n++;
            if (performance.now() - t < 500) requestAnimationFrame(f);
            else r(n);
          })();
        }),
    ),
    new Promise((r) => setTimeout(() => r('none in 3 s'), 3000)),
  ]);
const older = await b.newPage();
const newer = await b.newPage();
const c1 = await (await b.createBrowserContext()).newPage();
const c2 = await (await b.createBrowserContext()).newPage();
for (const [name, p] of [['default context, older tab', older], ['default context, newer tab', newer], ['own context #1', c1], ['own context #2', c2]]) {
  console.log(`${name}: ${await state(p)}; rAF frames in 500 ms: ${await frames(p)}`);
}
await b.close();
