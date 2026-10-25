/**
 * Run studio-probe.js on Playwright's WebKit (an iPad-sized and an iPhone-sized page), against a docs build
 * already served at STUDIO_URL (default http://localhost:4321, `npm run build:e2e && npm run preview:e2e`).
 * It proves the probe itself before CI spends a macOS job on it: the iOS suite (run.sh) runs the same file
 * in Mobile Safari, where Playwright cannot go.
 *
 *   node scripts/ios-safari/probe.selftest.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices, webkit } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const PROBE = fs.readFileSync(path.join(here, 'studio-probe.js'), 'utf8');
const BASE = process.env.STUDIO_URL || 'http://localhost:4321';
const SEED = fs.readFileSync(path.join(here, 'seed-settings.js'), 'utf8');

const shapes = [
	{ label: 'iPad-sized', options: { viewport: { width: 1180, height: 820 } } },
	{ label: 'iPhone-sized', options: { ...devices['iPhone 15 Pro'] } },
];
let failed = 0;
const browser = await webkit.launch();
for (const { label, options } of shapes) {
	const context = await browser.newContext(options);
	const page = await context.newPage();
	await page.addInitScript(SEED);
	await page.goto(`${BASE}/studio/`, { waitUntil: 'domcontentloaded' });
	await page.addScriptTag({ content: PROBE });
	const result = await page.evaluate(() => latticeStudioProbe());
	console.log(`${label}: ${result.ok ? 'PASS' : `FAIL (${result.error})`} at ${result.width}px`);
	for (const s of result.steps) console.log(`  ${s.pass ? 'ok  ' : 'FAIL'} ${s.name}${s.detail ? ` (${s.detail})` : ''}`);
	if (!result.ok) failed++;
	await context.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
