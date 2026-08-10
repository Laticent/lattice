// How long the Studio's COLD FIRST PAINT actually takes, under a chosen amount of
// CPU contention — the measurement behind `FIRST_PAINT_TIMEOUT` in
// docs/e2e/studio-fixture.ts and the timeouts section of
// engineering/decisions/2026-06-28-experience-gating-playwright.md (#1572).
//
// COMMITTED deliberately, for the reason zoom-gesture-bench.mjs gives: the budget
// in that fixture is a quantitative claim, and it was first produced by hand-
// instrumenting the fixture — an instrument that vanished with the edit, leaving a
// number nobody could re-derive. A timeout sized by a distribution nobody can
// re-measure is a guess with a decimal point.
//
// It measures the SAME two milestones the fixture waits on, in the same order:
//   1. the `.lattice` slide root inside the live-preview iframe becomes visible;
//   2. that root stops being empty (the engine has actually rendered into it).
// Reported separately, because they fail differently and the fixture names which.
//
// Usage (from docs/, needs a built dist being served on :4321):
//   npm run build:e2e && npm run preview:e2e &
//   SAMPLES=54 CONC=16 node scripts/first-paint-bench.mjs
//
// CONC is the knob that matters: it models worker oversubscription, which is the
// condition #1572 is about. CONC=2 is what the nightly runs; CONC=16 on a 4-core
// box is the 4x starvation the 45s budget was sized against.
import { cpus } from 'node:os';
import { chromium } from '@playwright/test';

const SAMPLES = Number(process.env.SAMPLES || 24);
const CONC = Number(process.env.CONC || 2);
const OVER = Number(process.env.OVER || 15_000); // the budget to count exceedances against
const URL = process.env.URL || 'http://localhost:4321/studio/';
const GIVE_UP = Number(process.env.GIVE_UP || 120_000);

const LIVE_PREVIEW = '[aria-label="Live deck preview"] iframe.live';

/** One cold visit: a fresh context (empty localStorage, like a Playwright test) → both milestones. */
async function sample(browser) {
	const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
	const page = await ctx.newPage();
	try {
		const t0 = Date.now();
		await page.goto(URL, { waitUntil: 'domcontentloaded' });
		const slide = page.frameLocator(LIVE_PREVIEW).locator('.lattice').first();
		await slide.waitFor({ state: 'visible', timeout: GIVE_UP });
		const visible = Date.now() - t0;
		// The emptiness half, polled the way `expect(...).not.toBeEmpty()` polls it.
		while (Date.now() - t0 < GIVE_UP) {
			if ((await slide.innerHTML()).trim() !== '') break;
			await page.waitForTimeout(50);
		}
		return { visible, painted: Date.now() - t0 };
	} finally {
		await ctx.close();
	}
}

function stats(xs) {
	const a = [...xs].sort((x, y) => x - y);
	const at = (q) => a[Math.min(a.length - 1, Math.floor(a.length * q))];
	return { n: a.length, min: a[0], median: at(0.5), p90: at(0.9), p95: at(0.95), max: a[a.length - 1] };
}

const results = [];
let started = 0;

// One BROWSER PROCESS per concurrent slot, not one browser with N contexts. A
// Playwright worker owns its own browser, and the contention this is measuring is
// mostly process-level — N contexts inside a single Chromium share one GPU/raster
// pipeline and measure noticeably faster than the runner does. The point is to
// model the runner, not to be tidy.
async function worker() {
	const browser = await chromium.launch();
	try {
		while (started < SAMPLES) {
			started++;
			results.push(await sample(browser));
		}
	} finally {
		await browser.close();
	}
}
await Promise.all(Array.from({ length: Math.min(CONC, SAMPLES) }, worker));

const painted = stats(results.map((r) => r.painted));
const visible = stats(results.map((r) => r.visible));
const over = results.filter((r) => r.painted > OVER).length;

const ms = (s) => `${(s / 1000).toFixed(1)}s`;
console.log(`\nfirst paint — ${SAMPLES} samples, ${CONC} concurrent, ${cpus().length} cores\n`);
console.log('| milestone           | median |  p90 |  p95 |  max |');
console.log('|---------------------|--------|------|------|------|');
console.log(`| slide root visible  | ${ms(visible.median)} | ${ms(visible.p90)} | ${ms(visible.p95)} | ${ms(visible.max)} |`);
console.log(`| root NOT empty      | ${ms(painted.median)} | ${ms(painted.p90)} | ${ms(painted.p95)} | ${ms(painted.max)} |`);
console.log(`\npast ${ms(OVER)}: ${over} / ${painted.n} (${((over / painted.n) * 100).toFixed(0)}%)`);
console.log(`raw ms: ${results.map((r) => r.painted).join(' ')}\n`);
