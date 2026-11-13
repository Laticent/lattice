// How much of the Studio's hydration task is V8 compiling code on first call, on the phone profile, from a real
// Chrome trace. Works on a PRODUCTION build (no profiling build needed): it reads V8's own compile events.
//
// It confirms the cause of the ~110 ms that a CPU profile bills to React's renderWithHooks
// (engineering/decisions/2026-11-09-studio-react-mount-profile.md, row 1b'): a sampling profiler bills a lazy compile
// to the caller, a trace names it. The hydration task is taken as the longest of the 15 longest main-thread tasks that
// run a FunctionCall from the Studio island or React DOM's chunk; compile events are counted top-level only, so nested
// parse and compile events are not double counted. V8.CompileCode is the lazy compile of one function.
//
//   npm run build:e2e && npm run preview:e2e &      # from docs/
//   RUNS=5 node scripts/v8-compile-trace.mjs
import { chromium } from '@playwright/test';

const URL = process.env.URL || 'http://localhost:4321/studio/';
const FRAME = '[aria-label="Live deck preview"] iframe.live';
const RUNS = Number(process.env.RUNS || 5);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const out = [];
for (let i = 0; i < RUNS; i++) {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
	const page = await ctx.newPage();
	const cdp = await ctx.newCDPSession(page);
	await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80, downloadThroughput: 786432, uploadThroughput: 786432 });
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
	const events = [];
	cdp.on('Tracing.dataCollected', (e) => events.push(...e.value));
	const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
	await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'v8', 'v8.compile', 'disabled-by-default-v8.compile', 'disabled-by-default-devtools.timeline'] }, transferMode: 'ReportEvents' });
	await page.goto(URL, { waitUntil: 'commit' });
	await page.waitForFunction((s) => !!document.querySelector(s)?.contentDocument?.querySelector('.lattice'), FRAME, { timeout: 60000, polling: 50 });
	await cdp.send('Tracing.end');
	await done;
	await ctx.close();
	const main = events.filter((e) => e.ph === 'X' && e.name === 'RunTask' && e.dur);
	// The renderer main thread: the thread with the most RunTask time.
	const byTid = {};
	for (const e of main) byTid[`${e.pid}:${e.tid}`] = (byTid[`${e.pid}:${e.tid}`] || 0) + e.dur;
	const tid = Object.entries(byTid).sort((a, b) => b[1] - a[1])[0][0];
	const onMain = (e) => `${e.pid}:${e.tid}` === tid;
	const tasks = main.filter(onMain).sort((a, b) => b.dur - a.dur);
	const compileNames = new Set(['V8.CompileLazy', 'v8.compile', 'V8.CompileCode', 'V8.ParseFunction', 'V8.CompileFullCode', 'V8.Compile']);
	const comp = events.filter((e) => onMain(e) && e.ph === 'X' && e.dur && (compileNames.has(e.name) || /^V8\.(Compile|Parse)/.test(e.name) || e.name === 'v8.compile'));
	// The hydration task: the long task that contains the most StudioShell work; approximate as the longest task with a FunctionCall from StudioIsland.
	const fc = events.filter((e) => onMain(e) && e.name === 'FunctionCall' && /StudioIsland|client\./.test(e.args?.data?.url || ''));
	let best = null;
	for (const t of tasks.slice(0, 15)) {
		const n = fc.filter((f) => f.ts >= t.ts && f.ts < t.ts + t.dur).length;
		if (n && (!best || t.dur > best.dur)) best = t;
	}
	const inT = (e) => best && e.ts >= best.ts && e.ts + e.dur <= best.ts + best.dur;
	// Top-level compile events only (not nested inside another compile event) so nesting does not double count.
	const top = (list) => list.filter((e) => !list.some((o) => o !== e && o.ts <= e.ts && o.ts + o.dur >= e.ts + e.dur && o.dur > e.dur));
	const names = {};
	for (const e of comp.filter(inT)) names[e.name] = (names[e.name] || 0) + 1;
	const tc = top(comp.filter(inT));
	out.push({ task: best ? Math.round(best.dur / 1000) : null, compileInTask: Math.round(tc.reduce((a, e) => a + e.dur, 0) / 1000), allCompileToSlide: Math.round(top(comp).reduce((a, e) => a + e.dur, 0) / 1000), names });
	console.error(JSON.stringify(out.at(-1)));
}
await browser.close();
const med = (k) => { const s = out.map((o) => o[k]).sort((a, b) => a - b); return s[s.length >> 1]; };
console.log(`median over ${RUNS}: hydration task ${med('task')} ms; compile inside it ${med('compileInTask')} ms; all compile to the slide ${med('allCompileToSlide')} ms`);
