#!/usr/bin/env node
// The Playground's performance bench — every table in
// engineering/decisions/2026-09-28-playground-virtual-filmstrip.md comes from one mode of this.
//
// COMMITTED for the reason first-paint-bench.mjs gives: a perf claim is only as good as the
// instrument that re-derives it (HARD RULE #19). It drives the REAL built site in Chromium.
//
// Serve two builds side by side over HTTP/2 — GitHub Pages serves h2, and an HTTP/1.1 server's six
// connections per host turn any throttled run into a queueing measurement:
//
//   node scripts/playground-bench.mjs serve dist 4443          # this branch
//   node scripts/playground-bench.mjs serve ../main-dist 4444  # a build of main
//
// then run a mode against each base (all modes print one JSON line per run):
//
//   deck <base> [cpu] [repeat]      A big deck in Edit: first slide, load-time style/layout,
//                                   frame nodes, and scroll frame times for a fling (500px wheel
//                                   steps) and reading (60px). The deck is examples/gallery-jargon.md,
//                                   its body repeated `repeat` times (1 → 58 slides, 9 → 522).
//   first-paint <base> [cpu] [net]  A newcomer's first slide on /playground/ (fresh profile, cache
//                                   ON so nothing is fetched twice), whether the bake was adopted.
//                                   net: none | fast4g | slow4g.
//   journey <base> [cpu] [net]      Home → dwell 5s → hover the Playground link → click; click → the
//                                   first visible slide. Measures the home page's pre-warm.
//   handoff <base> <mode> <width>   The preview pane the moment the baked slide shows, and again
//                                   once the app is live; prints how many pixels differ.
//   studio-handoff <base> <mode> <width>
//                                   The same check for the Studio's newcomer bake (bake-studio-newcomer.mjs):
//                                   the live preview the moment the adopted bake is revealed, before the engine
//                                   has loaded (the engine request is held until that picture is taken), and again
//                                   once the first render has patched it.
//
// Needs CHROME_PATH (the SessionStart hook exports it). The h2 server makes a throwaway
// self-signed certificate with `openssl`, and the browser is told to accept it.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http2 from 'node:http2';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NETS = {
	fast4g: { latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 },
	slow4g: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
};
const [, , mode, ...args] = process.argv;

async function browserPage(width = 1440, height = 900) {
	const puppeteer = require(path.join(ROOT, 'node_modules/puppeteer'));
	const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--ignore-certificate-errors'], headless: 'new' });
	const page = await browser.newPage();
	await page.setViewport({ width, height, isMobile: width < 600, hasTouch: width < 600, deviceScaleFactor: 1 });
	const cdp = await page.createCDPSession();
	return { browser, page, cdp };
}
async function throttle(cdp, cpu, net) {
	if (+cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: +cpu });
	if (NETS[net]) {
		await cdp.send('Network.enable');
		await cdp.send('Network.emulateNetworkConditions', { offline: false, ...NETS[net] });
	}
}
const frameVisible = () => {
	const f = document.getElementById('preview');
	const d = f?.contentDocument;
	const l = d?.querySelector('.lattice');
	return !!(l?.querySelector(':scope > section') && d.defaultView.getComputedStyle(l).visibility === 'visible' && getComputedStyle(f).visibility === 'visible');
};

function serve(root, port) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-bench-'));
	execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${dir}/k.pem`, '-out', `${dir}/c.pem`, '-days', '2', '-subj', '/CN=localhost'], { stdio: 'ignore' });
	const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
	const abs = path.resolve(root);
	const server = http2.createSecureServer({ key: fs.readFileSync(`${dir}/k.pem`), cert: fs.readFileSync(`${dir}/c.pem`) });
	server.on('stream', (stream, headers) => {
		let file = path.join(abs, decodeURIComponent(String(headers[':path']).split('?')[0]));
		if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
		if (!file.startsWith(abs) || !fs.existsSync(file)) {
			stream.respond({ ':status': 404 });
			return void stream.end();
		}
		const type = types[path.extname(file)] || 'application/octet-stream';
		let body = fs.readFileSync(file);
		// GitHub Pages' caching and compression, so a warm fetch behaves as it will in production.
		const h = { ':status': 200, 'content-type': type, 'cache-control': 'max-age=600' };
		if (/gzip/.test(String(headers['accept-encoding'] || '')) && !/woff2|png/.test(type)) {
			body = zlib.gzipSync(body, { level: 6 });
			h['content-encoding'] = 'gzip';
		}
		stream.respond(h);
		stream.end(body);
	});
	server.listen(+port, () => console.log(`playground-bench: serving ${abs} over h2 on https://localhost:${port}`));
}

async function deck(base, cpu = '1', repeat = '1') {
	const src = fs.readFileSync(path.join(ROOT, 'examples/gallery-jargon.md'), 'utf8');
	const fm = /^---\n[\s\S]*?\n---\n/.exec(src)?.[0] ?? '';
	const body = src.slice(fm.length).trim();
	const md = fm + Array.from({ length: +repeat }, () => body).join('\n\n---\n\n');
	const { browser, page, cdp } = await browserPage();
	await page.evaluateOnNewDocument((md) => {
		if (window.top !== window) return;
		localStorage.clear();
		localStorage.setItem('lattice-docs-pg-source', md);
		localStorage.setItem('lattice-docs-pg-view', 'edit');
	}, md);
	await throttle(cdp, cpu);
	await cdp.send('Performance.enable');
	const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
	const t0 = Date.now();
	await page.goto(`${base}/playground/?view=edit`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(frameVisible, { timeout: 300000, polling: 50 });
	const first = Date.now() - t0;
	await sleep(6000);
	const settled = await metrics();
	const frame = await page.evaluate(() => ({ frameNodes: document.getElementById('preview').contentDocument.getElementsByTagName('*').length }));
	const box = await page.evaluate(() => {
		const r = document.getElementById('preview').getBoundingClientRect();
		return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
	});
	await page.mouse.move(box.x, box.y);
	const run = async (step) => {
		await page.evaluate(() => {
			window.__f = [];
			let last = performance.now();
			const tick = (t) => {
				window.__f.push(t - last);
				last = t;
				window.__rid = requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		});
		const before = await metrics();
		for (let i = 0; i < 150; i++) {
			await page.mouse.wheel({ deltaY: step });
			await sleep(16);
		}
		await sleep(600);
		const after = await metrics();
		const f = (
			await page.evaluate(() => {
				cancelAnimationFrame(window.__rid);
				return window.__f;
			})
		).sort((a, b) => a - b);
		const p = (q) => Math.round(f[Math.floor(q * f.length)]);
		return { p50: p(0.5), p95: p(0.95), max: Math.round(f[f.length - 1]), over50: f.filter((x) => x > 50).length, taskMs: Math.round((after.TaskDuration - before.TaskDuration) * 1000) };
	};
	const fling = await run(500);
	await page.evaluate(() => document.getElementById('preview').contentWindow.scrollTo(0, 0));
	await sleep(800);
	const read = await run(60);
	const ms = (s) => Math.round(s * 1000);
	console.log(JSON.stringify({ mode: 'deck', base, cpu: +cpu, repeat: +repeat, firstSlideMs: first, ...frame, loadStyleMs: ms(settled.RecalcStyleDuration), loadLayoutMs: ms(settled.LayoutDuration), loadTaskMs: ms(settled.TaskDuration), heapMB: +(settled.JSHeapUsedSize / 1048576).toFixed(1), fling, read }));
	await browser.close();
}

async function firstPaint(base, cpu = '1', net = 'none') {
	const { browser, page, cdp } = await browserPage();
	await throttle(cdp, cpu, net);
	await page.evaluateOnNewDocument(() => {
		if (window.top !== window) return;
		try {
			localStorage.clear();
		} catch {}
	});
	const t0 = Date.now();
	await page.goto(`${base}/playground/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
	await page.waitForFunction(frameVisible, { timeout: 120000, polling: 16 });
	const visible = Date.now() - t0;
	const doc = await page.evaluateHandle(() => document.getElementById('preview').contentDocument);
	await page.waitForSelector('.pg-preview-wrap.is-live', { timeout: 120000 });
	const live = Date.now() - t0;
	await sleep(1500);
	const adopted = await page.evaluate((d) => {
		const now = document.getElementById('preview').contentDocument;
		return { bake: !!now.documentElement.hasAttribute('data-pg-bake'), sameDocument: now === d, writes: now.documentElement.getAttribute('data-lattice-write') };
	}, doc);
	console.log(JSON.stringify({ mode: 'first-paint', base, cpu: +cpu, net, visibleMs: visible, liveMs: live, ...adopted }));
	await browser.close();
}

async function journey(base, cpu = '1', net = 'none') {
	const { browser, page, cdp } = await browserPage();
	await throttle(cdp, cpu, net);
	await page.goto(`${base}/`, { waitUntil: 'load', timeout: 120000 });
	await sleep(5000);
	const link = await page.$('a[href$="/playground/"]');
	if (!link) throw new Error('journey: no Playground link on the home page');
	await link.hover();
	await sleep(800);
	const t0 = Date.now();
	await Promise.all([page.waitForNavigation({ timeout: 120000 }).catch(() => {}), link.click()]);
	await page.waitForFunction(frameVisible, { timeout: 120000, polling: 16 });
	const visible = Date.now() - t0;
	await page.waitForSelector('.pg-preview-wrap.is-live', { timeout: 120000 });
	console.log(JSON.stringify({ mode: 'journey', base, cpu: +cpu, net, visibleMs: visible, liveMs: Date.now() - t0 }));
	await browser.close();
}

async function handoff(base, colorScheme = 'light', width = '1440') {
	const { PNG } = require(path.join(ROOT, 'node_modules/pngjs'));
	const W = +width;
	const { browser, page } = await browserPage(W, W < 600 ? 844 : W < 1000 ? 1180 : 900);
	await page.emulateMediaFeatures([
		{ name: 'prefers-color-scheme', value: colorScheme },
		{ name: 'prefers-reduced-motion', value: 'reduce' },
	]);
	await page.evaluateOnNewDocument(() => {
		if (window.top === window) localStorage.clear();
	});
	await page.goto(`${base}/playground/`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => document.documentElement.getAttribute('data-pg-bake') === 'shown' || document.querySelector('.pg-preview-wrap.is-live'), { timeout: 60000, polling: 10 });
	const early = await page.evaluate(() => !document.querySelector('.pg-preview-wrap.is-live'));
	const clip = await page.evaluate(() => {
		const r = document.getElementById('preview').getBoundingClientRect();
		return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
	});
	const a = PNG.sync.read(Buffer.from(await page.screenshot({ clip })));
	await page.waitForSelector('.pg-preview-wrap.is-live', { timeout: 60000 });
	await sleep(3000);
	const b = PNG.sync.read(Buffer.from(await page.screenshot({ clip })));
	let diff = 0;
	for (let i = 0; i < a.data.length; i += 4) {
		if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 24) diff++;
	}
	console.log(JSON.stringify({ mode: 'handoff', base, colorScheme, width: W, bakeShownBeforeLive: early, diffPx: diff, ofPx: a.width * a.height }));
	await browser.close();
}

async function studioHandoff(base, colorScheme = 'light', width = '1440') {
	const { PNG } = require(path.join(ROOT, 'node_modules/pngjs'));
	// Playwright, not this file's Puppeteer: holding the engine needs request interception, and Puppeteer's turns the
	// HTTP cache off for the page and its frames, under which a held load came back with a frame that painted nothing.
	const { chromium } = await import('@playwright/test');
	const W = +width;
	const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--ignore-certificate-errors'] });
	const ctx = await browser.newContext({ viewport: { width: W, height: W < 600 ? 844 : W < 1000 ? 1180 : 900 }, isMobile: W < 600, hasTouch: W < 600, colorScheme, reducedMotion: 'reduce', serviceWorkers: 'block', ignoreHTTPSErrors: true });
	const page = await ctx.newPage();
	await page.addInitScript(() => {
		if (window.top === window) {
			window.__swaps = [];
			return;
		}
		// Inside the preview frame: log each swap stamp a patch writes. The frame's runtime consumes the
		// attribute itself, so a wait on it is a race; the log is not.
		const set = Element.prototype.setAttribute;
		Element.prototype.setAttribute = function (name, value) {
			if (name === 'data-lattice-swap' && this.classList.contains('lattice')) window.top.__swaps?.push(String(value));
			return set.call(this, name, value);
		};
	});
	// HOLD THE ENGINE until the baked slide has been captured, so the first picture is always the bake and never
	// the live render (on an unthrottled link the engine can land before the bake is revealed).
	let release;
	const held = new Promise((r) => (release = r));
	await page.route('**/esm/engine.js', async (route) => {
		await held;
		await route.continue();
	});
	const host = page.locator('[aria-label="Live deck preview"]');
	const frame = host.locator('iframe.live');
	await page.goto(`${base}/studio/`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => document.querySelector('[aria-label="Live deck preview"] iframe.live')?.style.opacity === '1', null, { timeout: 60000, polling: 10 });
	const state = await page.evaluate(() => ({ engine: !!window.LatticePlayground, bake: document.querySelector('[aria-label="Live deck preview"]')?.getAttribute('data-lattice-bake') ?? null }));
	// Shown before the engine: the window the bake exists for. False means the run measured the live render twice.
	const early = !state.engine && state.bake === 'adopted';
	// Past the reveal's fade (180 ms) and the loader's cross-fade. The engine is held, so this is still the bake.
	await sleep(1000);
	const boxA = await host.boundingBox();
	const a = PNG.sync.read(await host.screenshot());
	release();
	// Live: the first render has landed as a patch.
	await page.waitForFunction(() => window.__swaps.length > 0, null, { timeout: 60000, polling: 50 });
	await sleep(3000);
	await page.waitForFunction(() => document.querySelector('[aria-label="Live deck preview"] iframe.live')?.style.opacity === '1', null, { timeout: 60000, polling: 50 });
	// Each picture at the preview's OWN box: the bake is about what the slide shows, and the preview box settling in
	// the shell is a separate seam (handoff-bench.mjs). A box that moved is reported, not folded into the diff.
	const boxB = await host.boundingBox();
	const moved = JSON.stringify(boxA) !== JSON.stringify(boxB);
	const b = PNG.sync.read(await host.screenshot());
	const swaps = await page.evaluate(() => window.__swaps);
	const writes = await frame.count();
	let diff = 0;
	if (a.width !== b.width || a.height !== b.height) diff = -1;
	else
		for (let i = 0; i < a.data.length; i += 4) {
			if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 24) diff++;
		}
	if (process.env.SHOTS) {
		fs.writeFileSync(path.join(process.env.SHOTS, `studio-handoff-${colorScheme}-${W}-baked.png`), PNG.sync.write(a));
		fs.writeFileSync(path.join(process.env.SHOTS, `studio-handoff-${colorScheme}-${W}-live.png`), PNG.sync.write(b));
	}
	console.log(JSON.stringify({ mode: 'studio-handoff', base, colorScheme, width: W, bakeShownBeforeLive: early, ...state, swaps, frames: writes, boxMoved: moved ? [boxA, boxB] : false, diffPx: diff, ofPx: a.width * a.height }));
	await browser.close();
}

const modes = { serve, deck, 'first-paint': firstPaint, journey, handoff, 'studio-handoff': studioHandoff };
if (!modes[mode]) {
	console.error('usage: playground-bench.mjs serve|deck|first-paint|journey|handoff …  (see the header)');
	process.exit(2);
}
await modes[mode](...args);
