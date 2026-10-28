/**
 * Run focus-sync-probe.js on Playwright's WebKit at an iPad-sized page against a docs build already served at
 * STUDIO_URL (`npm run build:e2e && npm run preview:e2e`). It proves the probe BEFORE CI spends a macOS job on it,
 * and BURN_MS (default 60) is the knob that makes the page busy enough to catch the old code:
 *
 *   BURN_MS=60 node scripts/ios-safari/focus-sync.selftest.mjs    # jumps = 0 on the fix, > 0 on the old code
 *
 * Playwright's own tap stands in for safaridriver's here; run.mjs is the real-iOS half.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webkit } from '@playwright/test';
import { SLIDES, seedScript, TAPS, TARGETS, verdict } from './focus-sync-deck.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PROBE = fs.readFileSync(path.join(here, 'focus-sync-probe.js'), 'utf8');
const BASE = process.env.STUDIO_URL || 'http://localhost:4321';
const BURN = Number(process.env.BURN_MS ?? 60);

const browser = await webkit.launch();
const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
const page = await context.newPage();
await page.addInitScript(seedScript);
await page.goto(`${BASE}/playground/?view=edit`, { waitUntil: 'domcontentloaded' });
await page.addScriptTag({ content: PROBE });
await page.evaluate(([n, burn]) => lsPrepare(n, burn), [SLIDES, BURN]);
const rows = [];
for (let i = 0; i < TAPS; i++) {
	const slide = TARGETS[i % TARGETS.length];
	const before = await page.evaluate(() => lsBefore());
	await page.locator('.cm-line', { hasText: new RegExp(`^- point ${slide}\\.3$`) }).click({ position: { x: 40, y: 6 } });
	rows.push(await page.evaluate(([s, b]) => lsAfter(s, b), [slide, before]));
}
const v = verdict(rows);
console.log(`burn ${BURN} ms: ${v.ok ? 'PASS' : 'FAIL'} — ${v.jumps} of ${v.taps} taps moved the editor, worst ${Math.round(v.worst)} px`);
await browser.close();
process.exit(v.ok ? 0 : 1);
