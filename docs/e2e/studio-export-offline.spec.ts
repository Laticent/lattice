import fs from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { serveDist } from './serve-dist';
import { SHARE_EXPORTS, waitForStudioPaint } from './studio-fixture';

// AN OFFLINE EXPORT RENDERS THE SAME AS AN ONLINE ONE, ON FIREFOX TOO.
//
// Every raster export (PDF, PowerPoint, LibreOffice, images) and the webpage bake draw the deck in an offscreen capture
// frame (`createCaptureFrame`, docs/src/components/studio/export/deck-export.js). Its document loads the runtime, the
// theme's fonts and Mermaid from the site, so offline it needs the service worker. Firefox gives a `srcdoc` document the
// page's worker only when `srcdoc` was set before the frame went into the page, or in the same task as the append
// (engineering/decisions/2026-11-12-gecko-srcdoc-rewrite-controller.md §4). The capture frame used to be appended empty
// and written a few lines later; it worked only because nothing awaited in between. One task boundary there (measured:
// a `setTimeout(0)`) left the Firefox document with no worker, and offline its runtime and Mermaid failed with status 0.
// It now writes through `writeSrcdoc` (docs/src/lib/srcdoc-write.js), which sets `srcdoc` before the append.
//
// The oracle is the artifact: the image set exported offline must match, byte for byte, the one the same browser
// exported online a moment earlier. A probe also records, for each capture document, whether it had the worker and
// which of its requests failed.
//
// `@gecko` runs this on desktop Chromium and on Firefox. Chromium controls every shape, so it is the control.
// A real network cut, not context.setOffline(): see serve-dist.ts.
test.use({ serviceWorkers: 'allow' });

const F = String.fromCharCode(96, 96, 96);
const B = String.fromCharCode(96);
// A diagram (Mermaid, fetched by the runtime) and code (the theme's monospace face, a web font).
const DECK = [
	'---', 'theme: indaco', '---', '',
	'# Offline export', '',
	`The runtime draws ${B}npm run build${B} in the theme's code face.`, '',
	'---', '', '<!-- _class: diagram -->', '', '## The flow', '',
	`${F}mermaid`, 'flowchart LR', '  A[Draft] --> B[Review] --> C[Ship]', F, '',
	'---', '', '## Code', '',
	`${F}js`, 'const total = items.reduce((a, b) => a + b, 0);', F, '',
].join('\n');

type CaptureLoad = { url: string; controlled: boolean; failed: string[] };

/**
 * Record every document an export capture frame loads: its URL, whether it had the page's service worker, and which of
 * its requests failed (status 0). Watches the subtree, since the frame may join a host that is already in the page.
 */
async function armCaptureProbe(page: Page): Promise<void> {
	await page.evaluate(() => {
		const w = window as unknown as { __captureLoads: CaptureLoad[] };
		w.__captureLoads = [];
		const seen = new WeakSet<HTMLIFrameElement>();
		const watch = (frame: HTMLIFrameElement) => {
			if (seen.has(frame)) return;
			seen.add(frame);
			frame.addEventListener('load', () => {
				const win = frame.contentWindow;
				const entries = (win?.performance.getEntriesByType('resource') ?? []) as PerformanceResourceTiming[];
				w.__captureLoads.push({
					url: frame.contentDocument?.URL ?? '',
					controlled: !!win?.navigator.serviceWorker?.controller,
					failed: entries.filter((e) => e.responseStatus === 0).map((e) => new URL(e.name).pathname),
				});
			});
		};
		new MutationObserver((records) => {
			for (const r of records) {
				for (const n of r.addedNodes) {
					if (!(n instanceof HTMLElement)) continue;
					const host = n.closest<HTMLElement>('[data-lattice-export="capture"]') ?? (n.dataset.latticeExport === 'capture' ? n : null);
					if (!host) continue;
					for (const f of host.querySelectorAll('iframe')) watch(f);
				}
			}
		}).observe(document.body, { childList: true, subtree: true });
	});
}

const captureLoads = (page: Page) =>
	page.evaluate(() => (window as unknown as { __captureLoads: CaptureLoad[] }).__captureLoads.filter((l) => l.url === 'about:srcdoc'));

/** Export the image set through the real Share sheet; returns each slide PNG's bytes, by name. */
async function exportImages(page: Page): Promise<Map<string, Buffer>> {
	// Every button here is clicked from inside the page, not with Playwright's pointer. On a page the worker controls,
	// Firefox re-inserts the live preview frame on each write (docs/src/lib/srcdoc-write.js), Playwright's Firefox frame
	// tree does not follow it, and its clicks hung past the 15 s timeout in 8 of 10 runs, on main and with this fix alike.
	const pageClick = async (button: Locator) => {
		await expect(button).toBeEnabled();
		await button.evaluate((el: HTMLElement) => {
			setTimeout(() => el.click(), 0);
		});
	};
	await pageClick(page.getByRole('button', { name: 'Share', exact: true }));
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	const download = page.waitForEvent('download', { timeout: 0 });
	// The row is drawn twice as the sheet mounts; the tour's marker is on the mounted one.
	await pageClick(dialog.locator('[data-demo="share-images"]'));
	await pageClick(dialog.getByRole('button', { name: SHARE_EXPORTS.images.confirm }));
	const zip = await (await import('jszip')).default.loadAsync(fs.readFileSync(await (await download).path()));
	const out = new Map<string, Buffer>();
	for (const name of Object.keys(zip.files).filter((f) => /\/slides\/.*\.png$/.test(f)).sort()) {
		out.set(name, await zip.files[name].async('nodebuffer'));
	}
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	return out;
}

async function cachedCount(page: Page): Promise<number> {
	return page.evaluate(async () => {
		let n = 0;
		for (const k of await caches.keys()) n += (await (await caches.open(k)).keys()).length;
		return n;
	});
}

test('an offline export renders the same as an online one @gecko', async ({ page }) => {
	test.setTimeout(240_000);
	const { server, origin } = await serveDist();
	try {
		await page.addInitScript((deck) => {
			try {
				localStorage.setItem('lattice-studio-settings', JSON.stringify({ posture: 'craft', editMode: 'source' }));
				localStorage.setItem('lattice-studio-diagrams-used', '1');
				// The starter deck's stored source (studio-store.ts SRC_PREFIX), as a JSON string.
				localStorage.setItem('lattice-studio-src-welcome', JSON.stringify(deck));
			} catch {}
		}, DECK);
		await page.goto(`${origin}/studio/`, { waitUntil: 'domcontentloaded' });
		await page.evaluate(() => navigator.serviceWorker.ready);
		await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
		// The first load ran before the worker claimed the page; this controlled load is the online session.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitForStudioPaint(page);

		await armCaptureProbe(page);
		const online = await exportImages(page);
		expect(online.size, 'the online export holds one PNG per slide').toBe(3);

		// The cache write trails the fetch (waitUntil): wait until the cache stops growing before the cut.
		let last = -1;
		await expect
			.poll(async () => {
				const n = await cachedCount(page);
				const settled = n === last;
				last = n;
				return settled;
			}, { intervals: [1000], timeout: 30_000 })
			.toBe(true);

		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitForStudioPaint(page);

		await armCaptureProbe(page);
		const offline = await exportImages(page);
		const loads = await captureLoads(page);
		expect(loads.length, 'the offline export loaded a capture document').toBeGreaterThan(0);
		// Soft, so a run that fails here still reports which slide images changed.
		expect.soft(loads.every((l) => l.controlled && l.failed.length === 0), `an offline capture document lost the worker: ${JSON.stringify(loads)}`).toBe(true);
		expect([...offline.keys()]).toEqual([...online.keys()]);
		for (const [name, bytes] of online) {
			expect(offline.get(name)?.equals(bytes), `${name} exported offline differs from online`).toBe(true);
		}
	} finally {
		server.closeAllConnections();
		server.close();
	}
});
