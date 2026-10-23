// How long the Studio (or any route) takes to show its FIRST SLIDE on the phone profile, and what it
// costs on the way: requests, bytes, main-thread busy time before the slide.
//
// The profile is the one in engineering/decisions/2026-10-22-studio-startup-regression.md § How it was
// measured: Chromium, 390 px, touch, 4x CPU slowdown, 80 ms latency, 6 Mbit/s, a cold profile each run.
// "First slide" is the first moment the preview frame holds a `.lattice` document.
//
// Usage (from docs/, against a built dist being served, e.g. `npm run preview:e2e`):
//   RUNS=5 node scripts/startup-bench.mjs                 # Studio on :4321
//   URL=http://localhost:4321/playground/ FRAME='iframe' node scripts/startup-bench.mjs
//   PROFILE=desktop RUNS=5 node scripts/startup-bench.mjs
//   JSON=1 ... prints one JSON line (median + every run) for a baseline file.
import { chromium, firefox, webkit } from '@playwright/test';

const RUNS = Number(process.env.RUNS || 5);
const URL = process.env.URL || 'http://localhost:4321/studio/';
const FRAME = process.env.FRAME || '[aria-label="Live deck preview"] iframe.live';
const PROFILE = process.env.PROFILE || 'phone';
// ENGINE=chromium|webkit|firefox. CPU and network throttling are Chromium DevTools features, so the other two run
// unthrottled: compare a build against another build on the same engine, never across engines.
const ENGINE = process.env.ENGINE || 'chromium';
// WARM=1: after the cold load, reload in the same context with the service worker allowed, and report that load.
const WARM = process.env.WARM === '1';
const GIVE_UP = Number(process.env.GIVE_UP || 60_000);

const PROFILES = {
	phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, cpu: 4, latency: 80, down: (6 * 1024 * 1024) / 8 },
	desktop: { viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false, cpu: 1, latency: 0, down: -1 },
};
const P = PROFILES[PROFILE];

const median = (xs) => {
	const s = [...xs].sort((a, b) => a - b);
	const m = s.length >> 1;
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function run(browser) {
	const ctx = await browser.newContext({ viewport: P.viewport, hasTouch: P.hasTouch, isMobile: ENGINE === 'firefox' ? undefined : P.isMobile, serviceWorkers: WARM ? 'allow' : 'block' });
	const page = await ctx.newPage();
	const cdp = ENGINE === 'chromium' ? await ctx.newCDPSession(page) : null;
	if (cdp) {
		await cdp.send('Network.enable');
		await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: P.latency, downloadThroughput: P.down, uploadThroughput: P.down });
		if (P.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: P.cpu });
	}
	let requests = 0;
	page.on('request', () => requests++);
	// Main-thread busy time: the page's TaskDuration metric (script + layout + style) at the moment of the slide.
	await cdp?.send('Performance.enable');
	if (WARM) {
		// Prime the service worker and the HTTP cache with one full load, then measure the next one.
		await page.goto(URL, { waitUntil: 'load' });
		await page.waitForTimeout(6000);
	}
	requests = 0;
	const t0 = Date.now();
	await page.goto(URL, { waitUntil: 'commit' });
	const deadline = t0 + GIVE_UP;
	let first = null;
	let busyAtSlide = null;
	while (Date.now() < deadline) {
		const ready = await page
			.evaluate((sel) => {
				const f = document.querySelector(sel);
				const d = f?.contentDocument;
				return !!d?.querySelector('.lattice');
			}, FRAME)
			.catch(() => false);
		if (ready) {
			first = Date.now() - t0;
			const m = cdp ? await cdp.send('Performance.getMetrics') : null;
			busyAtSlide = m?.metrics.find((x) => x.name === 'TaskDuration')?.value ?? null;
			break;
		}
		await new Promise((r) => setTimeout(r, 25));
	}
	const out = { firstSlide: first, requestsAtSlide: requests, busyAtSlide: busyAtSlide == null ? null : busyAtSlide };
	await ctx.close();
	return out;
}

const browser = await { chromium, firefox, webkit }[ENGINE].launch(ENGINE === 'chromium' ? { executablePath: process.env.CHROME_PATH || undefined } : {});
const runs = [];
for (let i = 0; i < RUNS; i++) runs.push(await run(browser));
await browser.close();

const ok = runs.filter((r) => r.firstSlide != null);
const summary = {
	url: URL,
	profile: PROFILE,
	engine: ENGINE,
	warm: WARM,
	runs: runs.length,
	gaveUp: runs.length - ok.length,
	firstSlideMinMs: ok.length ? Math.min(...ok.map((r) => r.firstSlide)) : null,
	firstSlideMaxMs: ok.length ? Math.max(...ok.map((r) => r.firstSlide)) : null,
	firstSlideMedianMs: ok.length ? Math.round(median(ok.map((r) => r.firstSlide))) : null,
	requestsMedian: ok.length ? median(ok.map((r) => r.requestsAtSlide)) : null,
	busyMedianS: ok.length ? Number(median(ok.map((r) => r.busyAtSlide ?? 0)).toFixed(2)) : null,
	all: runs,
};
if (process.env.JSON) console.log(JSON.stringify(summary));
else {
	console.log(`${PROFILE} ${URL}`);
	console.log(`first slide  median ${summary.firstSlideMedianMs} ms  min ${summary.firstSlideMinMs}  max ${summary.firstSlideMaxMs}  (${runs.map((r) => r.firstSlide).join(', ')})`);
	console.log(`requests     median ${summary.requestsMedian} (by the slide)`);
	console.log(`main thread  median ${summary.busyMedianS} s busy by the slide (TaskDuration, throttled clock)`);
	if (summary.gaveUp) console.log(`gave up on ${summary.gaveUp} run(s)`);
}
