// Browser-side GESTURE bench — what a pinch/pan actually costs on the real built
// Studio under CPU throttle. The companion to frame-bench.mjs, which measures the
// edit->paint pipeline and has no gesture scenario; `npm run bench` is the ENGINE
// benchmark and covers neither.
//
// COMMITTED deliberately. The perf claim in
// engineering/decisions/2026-08-10-preview-pinch-zoom.md is the only quantitative
// claim in that change, and it was originally produced by a script in .scratch/ —
// which is gitignored, so the instrument behind the number would have shipped with
// nothing to reproduce it (HARD RULE #19: evidence, not a claim).
//
// Usage (from docs/, needs a built dist being served on :4321):
//   npm run build:e2e && npm run preview:e2e &
//   CPU=6 WIDTH=390 HEIGHT=844 node scripts/zoom-gesture-bench.mjs
//
// Three questions, each measured rather than reasoned:
//   1. Does zooming trigger an ENGINE RENDER? (it must not — a transform is not a re-render)
//   2. What do frames look like DURING a pinch, vs during a slide change (which does render)?
//   3. What does the feature cost when nobody is zooming? (idle)
import { chromium } from '@playwright/test';

const CPU = Number(process.env.CPU || 4);
const WIDTH = Number(process.env.WIDTH || 1440);
const HEIGHT = Number(process.env.HEIGHT || 900);
const URL = 'http://localhost:4321/studio/';

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: WIDTH, height: HEIGHT }, hasTouch: true, serviceWorkers: 'block' });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);

await page.goto(URL, { waitUntil: 'networkidle' });
const fr = page.locator('[aria-label="Live deck preview"] iframe.live').first();
await fr.waitFor({ state: 'visible', timeout: 45000 });
await page.waitForTimeout(3000);

// Count engine renders + collect frame intervals + long tasks from the page side.
await page.evaluate(() => {
	const w = window;
	w.__probe = { renders: 0, frames: [], longTasks: [] };
	const hook = w.__latticeRenderMetrics;
	if (hook?.on) hook.on(() => { w.__probe.renders++; });
	let last = performance.now();
	const tick = (t) => { w.__probe.frames.push(t - last); last = t; requestAnimationFrame(tick); };
	requestAnimationFrame(tick);
	try {
		new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__probe.longTasks.push(Math.round(e.duration)); })
			.observe({ entryTypes: ['longtask'] });
	} catch {}
});
const reset = () => page.evaluate(() => { const p = window.__probe; p.renders = 0; p.frames = []; p.longTasks = []; });
const read = async (label) => {
	const p = await page.evaluate(() => window.__probe);
	// Drop the first frame (it spans the reset boundary).
	const f = p.frames.slice(1).sort((a, b) => a - b);
	const pct = (q) => (f.length ? f[Math.min(f.length - 1, Math.floor(f.length * q))] : 0);
	return {
		label,
		engineRenders: p.renders,
		frames: f.length,
		p50: +pct(0.5).toFixed(1),
		p95: +pct(0.95).toFixed(1),
		worst: +(f[f.length - 1] ?? 0).toFixed(1),
		over32ms: f.filter((d) => d > 32).length,
		longTasks: p.longTasks,
	};
};

await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
const box = await fr.boundingBox();
const cy = box.y + box.height / 2, cx = box.x + box.width / 2;
const pt = (x) => ({ x, y: cy, radiusX: 12, radiusY: 12, force: 1 });

// ── A. IDLE — the app sitting there with the feature attached ────────────────
await reset();
await page.waitForTimeout(2000);
const idle = await read('idle (2s, nothing happening)');

// ── B. PINCH — 40 touchmove samples, the real gesture ────────────────────────
await reset();
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(cx - 20), pt(cx + 20)] });
for (let i = 1; i <= 40; i++) {
	const h = 20 + (180 * i) / 40;
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(cx - h), pt(cx + h)] });
}
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(400);
const pinch = await read('pinch (40 move samples)');

// ── C. PAN while zoomed — one finger, 40 samples ─────────────────────────────
await reset();
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(cx)] });
for (let i = 1; i <= 40; i++) {
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + (200 * i) / 40, y: cy + (120 * i) / 40, radiusX: 12, radiusY: 12, force: 1 }] });
}
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(400);
const pan = await read('pan while zoomed (40 move samples)');

// ── D. SLIDE CHANGE — the thing that DOES re-render, for scale ───────────────
await reset();
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(1600);
const nav = await read('slide change (engine re-render, for comparison)');

await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
console.log(`CPU throttle: ${CPU}x · viewport ${WIDTH}x${HEIGHT}\n`);
for (const r of [idle, pinch, pan, nav]) {
	console.log(`${r.label}
  engine renders : ${r.engineRenders}
  frames         : ${r.frames}   p50 ${r.p50}ms   p95 ${r.p95}ms   worst ${r.worst}ms   >32ms: ${r.over32ms}
  long tasks     : ${r.longTasks.length ? r.longTasks.join(', ') + ' ms' : 'none'}\n`);
}
await b.close();
