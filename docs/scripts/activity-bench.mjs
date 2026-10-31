// What each Studio ACTIVITY costs the main thread and memory: typing, navigation, panels, Present, the reading
// view, export, plus renderer memory per stage and a leak probe. `startup-bench.mjs` covers the first slide; this
// covers everything after it. engineering/decisions/2026-10-29-studio-activity-audit.md is the first run of it.
//
// Per activity: main-thread busy time (`Performance.getMetrics` TaskDuration delta), script/style/layout split,
// long tasks (>50 ms) and the longest, total blocking time, the worst frame gap, JS heap, DOM nodes, documents,
// frames and requests. Memory: renderer PSS (Linux /proc only) at each stage, the PDF export's peak sampled every
// 250 ms, and heap/documents after GC across five open/close cycles of Present, the slide map and the reading view.
//
// Serve a production build first, over HTTP/2 (`npm run preview:h2`); `preview:e2e` is HTTP/1.1.
// Usage (from docs/):
//   node scripts/activity-bench.mjs                        # 4x CPU, https://localhost:4430/studio/
//   CPU=1 node scripts/activity-bench.mjs                  # unthrottled
//   OUT=activities.json node scripts/activity-bench.mjs    # also write the JSON record
//   SKIP=export,leak node scripts/activity-bench.mjs       # drop slow stages (export, memory, leak)
//
// WHY A REAL `paste` EVENT. Playwright's `keyboard.insertText` on a contenteditable makes Chrome dispatch one
// trusted `input` event PER LINE (1,095 for the 40-slide gallery deck), each forcing a layout: a 1.3 s freeze that
// a user's paste never has. The deck goes in through a `ClipboardEvent('paste')`, the path CodeMirror handles in one
// transaction.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const URL = process.env.URL || 'https://localhost:4430/studio/';
const CPU = Number(process.env.CPU || 4);
const OUT = process.env.OUT || '';
const SKIP = new Set((process.env.SKIP || '').split(',').filter(Boolean));
const GALLERY_SLIDES = Number(process.env.SLIDES || 40);
const FRAME = '[aria-label="Live deck preview"] iframe.live';

/** The first `n` slides of the gallery deck, split fence-aware (a bare /\n---\n/ cuts inside a mermaid block). */
function galleryDeck(n) {
	const src = fs.readFileSync(path.join(HERE, '../../test/integration/baseline-decks/gallery.md'), 'utf8');
	const fm = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/.exec(src)?.[0] ?? '';
	const chunks = [[]];
	let fence = false;
	for (const line of src.slice(fm.length).split('\n')) {
		if (/^\s*(```|~~~)/.test(line)) fence = !fence;
		if (!fence && /^-{3,}\s*$/.test(line)) {
			chunks.push([]);
			continue;
		}
		chunks[chunks.length - 1].push(line);
	}
	return `${fm}${chunks
		.map((c) => c.join('\n').trim())
		.filter(Boolean)
		.slice(0, n)
		.join('\n\n---\n\n')}\n`;
}

/** Renderer PSS in MB for this run's renderers only (descendants of this Node process, which launched Chromium), or
 *  null off Linux. Never a bare `pgrep`: another browser on the machine would count. */
function rendererPssMB() {
	if (process.platform !== 'linux') return null;
	try {
		const kids = new Map();
		for (const line of execFileSync('ps', ['-eo', 'pid=,ppid='], { encoding: 'utf8' }).trim().split('\n')) {
			const [pid, ppid] = line.trim().split(/\s+/).map(Number);
			if (!kids.has(ppid)) kids.set(ppid, []);
			kids.get(ppid).push(pid);
		}
		let kb = 0;
		const walk = (pid) => {
			for (const c of kids.get(pid) || []) {
				// Per process: one that exits between `ps` and this read must not void the whole reading.
				try {
					if (fs.readFileSync(`/proc/${c}/cmdline`, 'utf8').includes('--type=renderer')) {
						const m = /^Pss:\s+(\d+)/m.exec(fs.readFileSync(`/proc/${c}/smaps_rollup`, 'utf8'));
						if (m) kb += Number(m[1]);
					}
				} catch {}
				walk(c);
			}
		};
		walk(process.pid);
		return kb ? Math.round(kb / 1024) : null;
	} catch {
		return null;
	}
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', ignoreHTTPSErrors: /^https:\/\/localhost/.test(URL), acceptDownloads: true });
await ctx.addInitScript(() => {
	try {
		// The Craft posture, as the e2e fixture seeds it: the editor and the activity bar are on screen.
		localStorage.setItem('lattice-studio-settings', JSON.stringify({ posture: 'craft' }));
		localStorage.setItem('lattice-studio-settings-tier', JSON.stringify('advanced'));
	} catch {}
	// No on-device voice: its worker would pull ~80 MB of weights (studio-fixture.ts explains why not a route()).
	const NativeWorker = window.Worker;
	if (NativeWorker)
		window.Worker = class extends NativeWorker {
			constructor(url, options) {
				if (/kokoro-worker/.test(String(url))) throw new Error('bench: the on-device voice is off');
				super(url, options);
			}
		};
	if (window.top !== window) return;
	window.__lt = [];
	try {
		new PerformanceObserver((list) => {
			for (const e of list.getEntries()) window.__lt.push(e.duration);
		}).observe({ type: 'longtask', buffered: true });
	} catch {}
	window.__gaps = [];
	let last = performance.now();
	const tick = (t) => {
		window.__gaps.push(t - last);
		last = t;
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
});
const page = await ctx.newPage();
page.on('crash', () => console.error('bench: the page crashed'));
// The Studio's own warnings land in the log: a fallback (the PDF write worker failing, say) is a result, not noise.
page.on('console', (m) => {
	if (m.type() === 'warning' || m.type() === 'error') console.error(`page ${m.type()}: ${m.text().slice(0, 200)}`);
});
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
await cdp.send('HeapProfiler.enable');
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
let requests = 0;
page.on('request', () => requests++);

const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const ms = (s) => Math.round(s * 1000);
const esc = () => page.keyboard.press('Escape');
const editor = () => page.getByLabel('Deck source');
const button = (name, exact = false) => page.getByRole('button', { name, exact }).first();

const rows = [];
async function measure(activity, fn, settle = 1500) {
	await page.evaluate(() => {
		window.__lt = [];
		window.__gaps = [];
	});
	const m0 = await metrics();
	const r0 = requests;
	let error = null;
	try {
		await fn();
	} catch (e) {
		error = String(e?.message || e).split('\n')[0].slice(0, 160);
	}
	if (settle) await page.waitForTimeout(settle);
	const m1 = await metrics();
	const { lt, gaps } = await page.evaluate(() => ({ lt: window.__lt, gaps: window.__gaps.slice(1) }));
	const row = {
		activity,
		busyMs: ms(m1.TaskDuration - m0.TaskDuration),
		scriptMs: ms(m1.ScriptDuration - m0.ScriptDuration),
		styleMs: ms(m1.RecalcStyleDuration - m0.RecalcStyleDuration),
		layoutMs: ms(m1.LayoutDuration - m0.LayoutDuration),
		longTasks: lt.length,
		longestMs: Math.round(Math.max(0, ...lt)),
		tbtMs: Math.round(lt.reduce((s, d) => s + Math.max(0, d - 50), 0)),
		worstGapMs: Math.round(Math.max(0, ...gaps)),
		heapMB: +(m1.JSHeapUsedSize / 1048576).toFixed(1),
		nodes: m1.Nodes,
		documents: m1.Documents,
		frames: m1.Frames,
		requests: requests - r0,
		error,
	};
	rows.push(row);
	console.log(`${activity.padEnd(42)} busy ${String(row.busyMs).padStart(6)} ms  long ${String(row.longTasks).padStart(3)}  max ${String(row.longestMs).padStart(5)} ms  heap ${row.heapMB} MB${error ? `  ERROR ${error}` : ''}`);
}

async function paste(text) {
	await editor().click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('Delete');
	await page.evaluate((t) => {
		const el = document.querySelector('[aria-label="Deck source"]');
		const dt = new DataTransfer();
		dt.setData('text/plain', t);
		el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
	}, text);
}
async function typeAtEnd(text) {
	await editor().click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type(text, { delay: 60 });
}
async function exportAs(row, confirm) {
	await button('Share', true).click();
	const download = page.waitForEvent('download', { timeout: 300_000 });
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: row }).click();
	await dialog.getByRole('button', { name: confirm }).click();
	await download;
	await esc();
}

const memory = [];
const pss = (stage) => {
	const mb = rendererPssMB();
	if (mb !== null) {
		memory.push({ stage, rendererPssMB: mb });
		console.log(`  memory: ${stage.padEnd(36)} renderer PSS ${mb} MB`);
	}
};

const TYPED = ' The quick brown fox jumps over the dog.';
await measure('boot to first slide (cold)', async () => {
	await page.goto(URL, { waitUntil: 'commit' });
	await page.frameLocator(FRAME).locator('.lattice').first().waitFor({ state: 'visible', timeout: 120_000 });
}, 0);
await measure('5 s after the first slide', () => page.waitForTimeout(5000), 0);
pss('booted');
await measure('idle 10 s', () => page.waitForTimeout(10_000), 0);
await measure(`type ${TYPED.length} chars (welcome deck)`, () => typeAtEnd(TYPED));
await measure('next slide x10 (welcome deck)', async () => {
	for (let i = 0; i < 10; i++) {
		await button('Next slide', true).click();
		await page.waitForTimeout(150);
	}
});
await measure(`paste the ${GALLERY_SLIDES}-slide gallery deck`, async () => {
	await paste(galleryDeck(GALLERY_SLIDES));
	await page.waitForTimeout(3000);
}, 2000);
pss('gallery deck loaded');
await measure(`type ${TYPED.length} chars (gallery deck)`, () => typeAtEnd(TYPED));
await measure('next slide x20 (gallery deck)', async () => {
	for (let i = 0; i < 20; i++) {
		await button('Next slide', true).click();
		await page.waitForTimeout(150);
	}
});
await measure('command palette: open and search', async () => {
	await button(/Search or run/).click();
	await page.keyboard.type('export pdf', { delay: 60 });
	await page.waitForTimeout(300);
	await esc();
});
await measure('slide map: open and close', async () => {
	await button('Slide map').click();
	await page.waitForTimeout(1500);
	pss('slide map open');
	await esc();
});
await measure('Inspector (deck settings): open', async () => {
	await button('Deck scope').click();
	await page.waitForTimeout(800);
	await esc();
});
await measure('Present: open, 10 slides, close', async () => {
	await button('Present').click();
	await page.getByRole('dialog', { name: 'Present' }).waitFor({ timeout: 30_000 });
	await page.waitForTimeout(1000);
	for (let i = 0; i < 10; i++) {
		await page.keyboard.press('ArrowRight');
		await page.waitForTimeout(200);
	}
	await esc();
});
await measure('reading view: open, scroll, close', async () => {
	await button(/^Read/).click();
	await page.waitForTimeout(2500);
	for (let i = 0; i < 10; i++) {
		await page.mouse.wheel(0, 600);
		await page.waitForTimeout(100);
	}
	await esc();
});

let exportPeakMB = null;
if (!SKIP.has('export')) {
	await measure(`export PDF (${GALLERY_SLIDES} gallery slides)`, async () => {
		let done = false;
		const sampler = (async () => {
			while (!done) {
				const mb = rendererPssMB();
				if (mb !== null && mb > (exportPeakMB ?? 0)) exportPeakMB = mb;
				await new Promise((r) => setTimeout(r, 250));
			}
		})();
		try {
			await exportAs(/^PDF/, /^Download PDF/);
		} finally {
			done = true;
			await sampler;
		}
	}, 2000);
	if (exportPeakMB !== null) {
		memory.push({ stage: 'peak during the PDF export (250 ms samples)', rendererPssMB: exportPeakMB });
		console.log(`  memory: ${'peak during the PDF export'.padEnd(36)} renderer PSS ${exportPeakMB} MB`);
	}
	await page.waitForTimeout(15_000);
	pss('about 18 s after the PDF export');
	await measure(`export PowerPoint (${GALLERY_SLIDES} gallery slides)`, () => exportAs(/^PowerPoint/, /^Download PowerPoint/), 2000);
}

// Leak probe: five open/close cycles per surface, heap after a forced GC on the first and the fifth.
const leak = [];
if (!SKIP.has('leak')) {
	const settled = async (label) => {
		await cdp.send('HeapProfiler.collectGarbage');
		await page.waitForTimeout(300);
		await cdp.send('HeapProfiler.collectGarbage');
		const m = await metrics();
		const { usedSize } = await cdp.send('Runtime.getHeapUsage');
		leak.push({ label, heapMB: +(usedSize / 1048576).toFixed(1), documents: m.Documents, listeners: m.JSEventListeners });
	};
	const cycles = {
		Present: async () => {
			await button('Present').click();
			await page.getByRole('dialog', { name: 'Present' }).waitFor({ timeout: 30_000 });
			await page.waitForTimeout(1500);
			await esc();
		},
		'slide map': async () => {
			await button('Slide map').click();
			await page.waitForTimeout(2000);
			await esc();
		},
		'reading view': async () => {
			await button(/^Read/).click();
			await page.waitForTimeout(2500);
			await esc();
		},
	};
	await settled('before the cycles');
	for (const [name, cycle] of Object.entries(cycles)) {
		for (let k = 1; k <= 5; k++) {
			try {
				await cycle();
				await page.waitForTimeout(800);
			} catch (e) {
				console.error(`bench: ${name} cycle ${k}: ${String(e?.message || e).split('\n')[0]}`);
			}
			if (k === 1 || k === 5) await settled(`${name} x${k}`);
		}
	}
	for (const l of leak) console.log(`  leak: ${l.label.padEnd(20)} heap ${l.heapMB} MB  documents ${l.documents}  listeners ${l.listeners}`);
}

await browser.close();
const record = { url: URL, cpu: CPU, slides: GALLERY_SLIDES, at: new Date().toISOString(), rows, memory, leak };
if (OUT) fs.writeFileSync(OUT, `${JSON.stringify(record, null, 2)}\n`);
const failed = rows.filter((r) => r.error);
if (failed.length) {
	console.error(`bench: ${failed.length} activit${failed.length === 1 ? 'y' : 'ies'} failed: ${failed.map((r) => r.activity).join('; ')}`);
	process.exit(1);
}
