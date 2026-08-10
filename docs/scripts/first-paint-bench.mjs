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
//   SAMPLES=54 CONC=16 npm run perf:first-paint
//
// The suite ALSO measures this in band: `waitForStudioPaint` annotates every paint
// it performs as `first-paint` in the Playwright report, so a nightly run carries
// the real distribution at real concurrency without anyone remembering to run this.
// Use this script when you want to sweep CONC deliberately; read the annotations
// when you want to know what the suite actually experienced.
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

/**
 * One cold visit: a fresh context (empty localStorage, like a Playwright test) → both
 * milestones. A visit that never gets there is returned as `{gaveUp: true}`, NOT as a
 * `GIVE_UP`-sized number and NOT as a thrown error — a give-up that enters the
 * distribution as an ordinary sample silently invents a tail, and one that escapes as
 * an exception discards every sample the run has collected so far.
 */
async function sample(browser) {
	const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
	const page = await ctx.newPage();
	try {
		const t0 = Date.now();
		await page.goto(URL, { waitUntil: 'domcontentloaded' });
		const slide = page.frameLocator(LIVE_PREVIEW).locator('.lattice').first();
		await slide.waitFor({ state: 'visible', timeout: GIVE_UP });
		const visible = Date.now() - t0;
		// The emptiness half. NOTE this polls `innerHTML`, where `not.toBeEmpty()`
		// reads `textContent` — identical on every real slide measured, but a first
		// slide that is image-only would satisfy this and never satisfy the fixture.
		while (Date.now() - t0 < GIVE_UP) {
			if ((await slide.innerHTML()).trim() !== '') return { visible, painted: Date.now() - t0 };
			await page.waitForTimeout(50);
		}
		return { gaveUp: true };
	} catch {
		return { gaveUp: true };
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
//
// `round` is which visit this is FOR THIS SLOT, and it matters more than it looks.
// Round 0 is every slot starting at once — the harshest moment in the run, and the
// one a real suite also has at start-up. Later rounds stagger as slots finish at
// different times, and the last rounds run at less than CONC concurrency because
// SAMPLES rarely divides evenly. Reported separately below, because aggregating
// them hides that the tail is almost entirely round 0.
async function worker() {
	const browser = await chromium.launch();
	let round = 0;
	try {
		while (started < SAMPLES) {
			started++;
			results.push({ round, ...(await sample(browser)) });
			round++;
		}
	} finally {
		await browser.close();
	}
}
await Promise.all(Array.from({ length: Math.min(CONC, SAMPLES) }, worker));

const gaveUp = results.filter((r) => r.gaveUp).length;
const ok = results.filter((r) => !r.gaveUp);
const ms = (s) => `${(s / 1000).toFixed(1)}s`;
const row = (label, xs) => {
	if (!xs.length) return `| ${label.padEnd(28)} | — | — | — | — |`;
	const s = stats(xs);
	return `| ${label.padEnd(28)} | ${ms(s.median)} | ${ms(s.p90)} | ${ms(s.p95)} | ${ms(s.max)} |`;
};

console.log(`\nfirst paint — ${ok.length} samples, ${CONC} concurrent, ${cpus().length} cores`);
if (gaveUp) console.log(`${gaveUp} visit(s) gave up past ${ms(GIVE_UP)} and are EXCLUDED, not counted as slow paints`);
console.log('\n| milestone                    | median |  p90 |  p95 |  max |');
console.log('|------------------------------|--------|------|------|------|');
console.log(row('slide root visible', ok.map((r) => r.visible)));
console.log(row('root NOT empty', ok.map((r) => r.painted)));
console.log(
	row(
		'  └ round 0 (all slots at once)',
		ok.filter((r) => r.round === 0).map((r) => r.painted),
	),
);
console.log(
	row(
		'  └ later rounds (staggered)',
		ok.filter((r) => r.round > 0).map((r) => r.painted),
	),
);

// Counted per STAGE, not on the total: the budget this replaced was 15s for the
// visibility wait and then a FRESH 15s for the emptiness assertion, so scoring the
// sum against 15s would measure a constraint that never existed.
const overVisible = ok.filter((r) => r.visible > OVER).length;
const overFill = ok.filter((r) => r.painted - r.visible > OVER).length;
console.log(`\npast ${ms(OVER)} — per stage, as the old inherited budgets were:`);
console.log(`  slide root visible: ${overVisible} / ${ok.length}   filling the root: ${overFill} / ${ok.length}`);
console.log(`raw ms (round:painted): ${ok.map((r) => `${r.round}:${r.painted}`).join(' ')}\n`);
