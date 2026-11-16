// How much the Studio's LOAD blocks the main thread and how long it keeps changing on screen:
// Lighthouse's Total Blocking Time and Speed Index, median of N cold runs, plus how many preview
// frames the page has mounted when it settles.
//
// WHY THIS EXISTS BESIDE THE OTHER BENCHES. `startup-bench.mjs` stops at the first slide, and
// `activity-bench.mjs` starts after it. Neither sees what a Lighthouse user sees: the map rail
// filling in tile by tile for seconds after the first slide, each live tile a whole engine
// document. TBT and SI both count that tail, and both scored 0 on lattice.style in November 2026
// (TBT 2,956 ms, SI 4.4 s). The nightly (`perf-collect.mjs`) measures the same two numbers, but
// only for a HEAD vs BASE diff on a CI runner, at median of 3 across five routes; this is the
// local, one-route, before/after instrument a performance PR needs (HARD RULE #19).
//
// SAME SETTINGS AS THE NIGHTLY: Lighthouse's `desktop` preset and the chrome flags in
// lighthouserc.cjs, so a number here and a number there measure the same thing.
//
// Usage (from docs/, against a built dist being served, e.g. `npm run preview:e2e`):
//   npm run perf:load                                    # Studio on :4321, 5 runs
//   RUNS=9 URL=http://localhost:4321/playground/ npm run perf:load
//   MAP=1 npm run perf:load                              # a returning reader with the slide map open
//   MAP=1 CPU=4 npm run perf:load                        # ...on a 4x slower CPU
//   RETURN=1 CPU=4 npm run perf:load                     # a returning reader: one full visit first, HTTP cache cleared
//   JSON=1 npm run perf:load                             # one JSON line (median + every run)
//
// Lighthouse runs each load in a fresh profile, so by default these are FIRST-VISIT numbers:
// nothing in IndexedDB, no service worker, an empty HTTP cache.
//
// MAP=1 IS THE CASE THAT MATTERS FOR THE MAP. A first visit never opens the slide map, so it
// mounts one preview frame and blocks for ~200 ms. The reader who opened the map once gets it back
// on every load (`lattice-studio-map` in localStorage, StudioShell.tsx), and that is the load the
// November 2026 report measured: nine frames, nearly 3 s of blocking. MAP=1 seeds that one key
// from `/robots.txt` on the same origin, so the HTTP cache stays as cold as a first visit, and runs
// Lighthouse with its storage reset off so the key survives into the measured load.

import { createRequire } from 'node:module';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';

const require = createRequire(import.meta.url);
const RUNS = Number(process.env.RUNS || 5);
const URL = process.env.URL || 'http://localhost:4321/studio/';
const JSON_OUT = process.env.JSON === '1';
// The selector for a mounted preview document. Every live tile, and the stage, is one.
const FRAMES = process.env.FRAMES || 'iframe';
// How long after load to count frames. Long enough for the map's live budget to fill.
const SETTLE_MS = Number(process.env.SETTLE_MS || 12_000);
const CHROME_FLAGS = ['--no-sandbox', '--headless=new', '--disable-dev-shm-usage', '--disable-gpu'];
// RETURN=1: a reader coming BACK — one full visit first (map open), so whatever the app keeps across visits is kept
// (IndexedDB, localStorage), then the HTTP cache is cleared so only app-kept state differs from MAP=1.
const RETURN = process.env.RETURN === '1';
const MAP = process.env.MAP === '1' || RETURN;
// CPU=4: Lighthouse's CPU slowdown on top of the desktop preset (which runs at 1). This sandbox is faster than
// most readers' laptops, and a slowdown makes a per-frame cost stand out from run-to-run noise.
const CPU = Number(process.env.CPU || 1);
const CONFIG = CPU === 1 ? desktopConfig : { ...desktopConfig, settings: { ...desktopConfig.settings, throttling: { ...desktopConfig.settings.throttling, cpuSlowdownMultiplier: CPU } } };
const SEED = { 'lattice-studio-map': '1' };

const median = (xs) => {
	const s = [...xs].sort((a, b) => a - b);
	return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Write the seed keys into the profile's localStorage from a page that loads none of the app. */
async function seed(port) {
	const { chromium } = require('playwright');
	const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
	const page = await browser.contexts()[0].newPage();
	await page.goto(new globalThis.URL('/robots.txt', URL).href);
	await page.evaluate((kv) => {
		for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
	}, SEED);
	if (RETURN) {
		await page.goto(URL, { waitUntil: 'load' });
		await page.waitForTimeout(SETTLE_MS); // the first visit's map fills and captures; a pacing wait in a bench, not a test
		await page.goto('about:blank');
		const cdp = await page.context().newCDPSession(page);
		await cdp.send('Network.clearBrowserCache');
	}
	await page.close();
	await browser.close(); // disconnects; the launched Chrome keeps running
}

async function lighthouseRun() {
	const chrome = await chromeLauncher.launch({ chromePath: process.env.CHROME_PATH || undefined, chromeFlags: CHROME_FLAGS });
	try {
		if (MAP) await seed(chrome.port);
		const r = await lighthouse(URL, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance'], disableStorageReset: MAP }, CONFIG);
		const a = r.lhr.audits;
		const tasks = a['long-tasks']?.details?.items ?? [];
		return {
			score: Math.round((r.lhr.categories.performance.score ?? 0) * 100),
			fcp: Math.round(a['first-contentful-paint'].numericValue),
			lcp: Math.round(a['largest-contentful-paint'].numericValue),
			tbt: Math.round(a['total-blocking-time'].numericValue),
			si: Math.round(a['speed-index'].numericValue),
			tti: Math.round(a.interactive?.numericValue ?? 0),
			longTasks: tasks.length,
			longest: Math.round(Math.max(0, ...tasks.map((t) => t.duration))),
		};
	} finally {
		await chrome.kill();
	}
}

/** How many frames are mounted once the page has settled, and when the last one arrived. */
async function frameRun() {
	const { chromium } = require('playwright');
	const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
	try {
		const page = await browser.newPage({ viewport: { width: 1350, height: 940 } });
		if (MAP) await page.addInitScript((kv) => {
			for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
		}, SEED);
		if (RETURN) {
			await page.goto(URL, { waitUntil: 'load' });
			await page.waitForTimeout(SETTLE_MS);
			await page.goto('about:blank');
		}
		const t0 = Date.now();
		await page.goto(URL, { waitUntil: 'load' });
		let last = 0;
		let n = 0;
		while (Date.now() - t0 < SETTLE_MS) {
			const now = await page.locator(FRAMES).count();
			if (now !== n) {
				n = now;
				last = Date.now() - t0;
			}
			await page.waitForTimeout(100);
		}
		return { frames: n, lastFrameMs: last };
	} finally {
		await browser.close();
	}
}

const runs = [];
for (let i = 0; i < RUNS; i++) {
	const lh = await lighthouseRun();
	runs.push(lh);
	if (!JSON_OUT) console.error(`run ${i + 1}/${RUNS}: TBT ${lh.tbt} ms · SI ${lh.si} ms · TTI ${lh.tti} ms · score ${lh.score} · ${lh.longTasks} long tasks, longest ${lh.longest} ms`);
}
const fr = await frameRun();
const keys = ['score', 'fcp', 'lcp', 'tbt', 'si', 'tti', 'longTasks', 'longest'];
const med = Object.fromEntries(keys.map((k) => [k, median(runs.map((r) => r[k]))]));
const out = { url: URL, map: MAP, return: RETURN, cpu: CPU, runs: RUNS, median: { ...med, ...fr }, every: runs };
if (JSON_OUT) console.log(JSON.stringify(out));
else {
	console.log(`\n${URL}${RETURN ? ' (returning, map open)' : MAP ? ' (map open)' : ''} — median of ${RUNS} (Lighthouse desktop preset${CPU === 1 ? '' : `, ${CPU}x CPU`}, cold HTTP cache)`);
	console.log('| Score | FCP | LCP | TBT | SI | TTI | Long tasks | Longest | Frames at settle | Last frame |');
	console.log('|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
	console.log(`| ${med.score} | ${med.fcp} ms | ${med.lcp} ms | ${med.tbt} ms | ${med.si} ms | ${med.tti} ms | ${med.longTasks} | ${med.longest} ms | ${fr.frames} | ${fr.lastFrameMs} ms |`);
}
