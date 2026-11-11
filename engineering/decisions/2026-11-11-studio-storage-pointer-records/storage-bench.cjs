// Measure Studio reload time against accumulated client-side storage.
// Reproduces engineering/decisions/2026-11-11-studio-storage-pointer-records.md §2. Needs `npm run build:e2e`
// then `npm run preview:e2e` running in docs/. Writes bench-x<throttle>.json to the current directory.
// usage: node storage-bench.cjs [reloads] [cpuThrottle] [scenario,scenario...]
// ENGINE=chromium|webkit|firefox (default chromium); BASE=<origin> (default http://localhost:4321).
// CPU throttling, the heap reading and long tasks are Chromium-only: on WebKit and Firefox the run is
// unthrottled and reports first-slide time alone, so compare builds on one engine, never across engines.
// PLAYWRIGHT=<module path>: use the docs suite's Playwright (docs/node_modules/playwright), whose WebKit and
// Firefox builds the e2e suite installs, when the default `playwright` wants browser builds that are not there.
const playwright = require(process.env.PLAYWRIGHT || 'playwright');
const ENGINE = process.env.ENGINE || 'chromium';
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:4321';
const RELOADS = +(process.argv[2] || 7);
const THROTTLE = +(process.argv[3] || 1);
const ONLY = process.argv[4] ? process.argv[4].split(',') : null;
const DECK = fs.readFileSync('/home/user/lattice/test/integration/baseline-decks/gallery.md', 'utf8'); // ~60 KB

const SCENARIOS = {
	fresh: {},
	decks40: { decks: 40 },
	decks40_versions: { decks: 40, versions: 25 },
	photos60: { photos: 60 },
	everything: { decks: 40, versions: 25, chats: 60, photos: 60 },
};

async function seed(page, s) {
	return page.evaluate(
		async ({ s, DECK }) => {
			const idx = JSON.parse(localStorage.getItem('lattice-studio-deck-index') || 'null');
			const out = {};
			if (s.decks) {
				const extra = [];
				for (let i = 0; i < s.decks; i++) {
					const id = `bench-${i}`;
					extra.push({ id, title: `Bench ${i}` });
					// stored the way studio-store write() stores it: JSON-encoded
					localStorage.setItem(`lattice-studio-src-${id}`, JSON.stringify(`${DECK}\n<!-- ${i} -->\n`));
					if (s.chats) {
						const msgs = Array.from({ length: s.chats }, (_, k) => ({ role: k % 2 ? 'assistant' : 'user', content: 'x'.repeat(600) + k }));
						localStorage.setItem(`lattice-studio-chat-${id}`, JSON.stringify(msgs));
					}
				}
				// keep the active deck first so the boot deck is unchanged
				localStorage.setItem('lattice-studio-deck-index', JSON.stringify([...(idx || []), ...extra]));
				out.deckIndexLen = (idx || []).length + extra.length;
			}
			const open = (name) =>
				new Promise((res, rej) => {
					const r = indexedDB.open(name);
					r.onsuccess = () => res(r.result);
					r.onerror = () => rej(r.error);
				});
			const done = (tx) =>
				new Promise((res, rej) => {
					tx.oncomplete = res;
					tx.onerror = () => rej(tx.error);
				});
			if (s.versions) {
				const db = await open('lattice-studio-versions');
				if (!db.objectStoreNames.contains('checkpoints')) throw new Error('checkpoints store missing');
				const tx = db.transaction('checkpoints', 'readwrite');
				const st = tx.objectStore('checkpoints');
				for (let i = 0; i < s.decks; i++)
					for (let k = 0; k < s.versions; k++) st.put({ deckId: `bench-${i}`, id: `cp-${k}`, ts: 1e12 + k, label: `v${k}`, source: `${DECK}\n<!-- ${i}.${k} -->\n` });
				await done(tx);
				db.close();
			}
			if (s.photos) {
				const db = await open('lattice-workbench');
				if (!db.objectStoreNames.contains('assets')) throw new Error('assets store missing');
				const c = new OffscreenCanvas(1600, 1200);
				const g = c.getContext('2d');
				const tx0 = [];
				for (let i = 0; i < s.photos; i++) {
					// noisy image: about 1 MB of JPEG each
					const img = g.createImageData(1600, 1200);
					for (let p = 0; p < img.data.length; p += 4) {
						img.data[p] = (Math.random() * 255) | 0;
						img.data[p + 1] = (p >> 6) & 255;
						img.data[p + 2] = i * 4;
						img.data[p + 3] = 255;
					}
					g.putImageData(img, 0, 0);
					tx0.push(await c.convertToBlob({ type: 'image/jpeg', quality: 0.8 }));
				}
				const tx = db.transaction('assets', 'readwrite');
				const st = tx.objectStore('assets');
				for (const [i, blob] of tx0.entries())
					st.put({ id: `img-bench-${i}`, kind: 'image', name: `bench-${i}`, scope: 'library', blob, mime: 'image/jpeg', bytes: blob.size, width: 1600, height: 1200, sourceName: `b${i}.jpg`, addedAt: 1e12 + i });
				await done(tx);
				db.close();
				out.photoBytes = tx0.reduce((n, b) => n + b.size, 0);
			}
			let ls = 0;
			for (let i = 0; i < localStorage.length; i++) {
				const k = localStorage.key(i);
				ls += (k.length + localStorage.getItem(k).length) * 2;
			}
			out.localStorageMB = +(ls / 1e6).toFixed(1);
			out.usageMB = +(((await navigator.storage?.estimate?.())?.usage || 0) / 1e6).toFixed(1);
			return out;
		},
		{ s, DECK },
	);
}

async function paintMs(page) {
	const t0 = Date.now();
	await page.reload({ waitUntil: 'commit' });
	const slide = page.frameLocator('[aria-label="Live deck preview"] iframe.live').locator('.lattice').first();
	await slide.waitFor({ state: 'visible', timeout: 60000 });
	await page.waitForFunction(() => {
		const f = document.querySelector('[aria-label="Live deck preview"] iframe.live');
		const el = f?.contentDocument?.querySelector('.lattice');
		return el && el.textContent.trim().length > 0;
	}, null, { timeout: 60000, polling: 'raf' });
	const wall = Date.now() - t0;
	// main-thread long tasks during this load
	const lt = await page.evaluate(() => (window.__lt || []).reduce((n, d) => n + d, 0));
	await page.waitForTimeout(3000);
	const lt2 = await page.evaluate(() => (window.__lt || []).reduce((n, d) => n + d, 0));
	const heap = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize || 0) / 1e6));
	return { wall, longTasks: Math.round(lt), longTasksAfter3s: Math.round(lt2), heap };
}

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

(async () => {
	const browser = await playwright[ENGINE].launch();
	const results = {};
	for (const [name, s] of Object.entries(SCENARIOS)) {
		if (ONLY && !ONLY.includes(name)) continue;
		const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
		await ctx.addInitScript(() => {
			window.__lt = [];
			try {
				new PerformanceObserver((l) => {
					for (const e of l.getEntries()) window.__lt.push(e.duration);
				}).observe({ type: 'longtask', buffered: true });
			} catch {}
			try {
				const k = 'lattice-studio-settings';
				const cur = JSON.parse(localStorage.getItem(k) || '{}');
				localStorage.setItem(k, JSON.stringify({ ...cur, posture: 'craft' }));
			} catch {}
			const NW = window.Worker;
			if (NW) window.Worker = class extends NW { constructor(u, o) { if (/kokoro-worker/.test(String(u))) throw new Error('off'); super(u, o); } };
		});
		const page = await ctx.newPage();
		const cdp = ENGINE === 'chromium' ? await ctx.newCDPSession(page) : null;
		await page.goto(`${BASE}/studio/`, { waitUntil: 'domcontentloaded' });
		await page.frameLocator('[aria-label="Live deck preview"] iframe.live').locator('.lattice').first().waitFor({ timeout: 60000 });
		await page.waitForTimeout(1500); // let the app create its databases
		const info = await seed(page, s);
		await paintMs(page); // warm-up reload (SW + HTTP cache warm, as in a regular profile)
		if (THROTTLE > 1 && cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
		const runs = [];
		for (let i = 0; i < RELOADS; i++) runs.push(await paintMs(page));
		results[name] = { ...info, paintMedian: median(runs.map((r) => r.wall)), longTaskMedian: median(runs.map((r) => r.longTasks)), longTaskBy3sMedian: median(runs.map((r) => r.longTasksAfter3s)), heapMB: median(runs.map((r) => r.heap)), runs: runs.map((r) => r.wall).join(',') };
		console.log(name, JSON.stringify(results[name]));
		await ctx.close();
	}
	await browser.close();
	fs.writeFileSync(`bench-${ENGINE}-x${THROTTLE}.json`, JSON.stringify(results, null, 2));
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
