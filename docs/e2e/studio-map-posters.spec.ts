import { expect, type Page, test } from '@playwright/test';
import { gotoStudio, setEditorContent } from './studio-fixture';

/**
 * The Studio map's POSTER tier (studio/StudioMap.tsx over map-rail/poster-cache.ts and the pool's capture,
 * studio/preview-pool.tsx). Once a live tile's picture has rendered and the rail is still, the pool rasterizes it,
 * and a tile past the live budget shows that still instead of a sketch.
 *
 * The pool's ceiling is lowered to 3 with the diagnostic key, so a 40-slide deck has tiles past the live budget on
 * every screen. No shipped setting lowers it (audit §11l), which is why the tier rarely shows in production.
 */

const RAIL = '[data-map-rail]';
const FORTY = Array.from({ length: 40 }, (_, i) => `# Slide ${i + 1}\n\nBody ${i + 1}.`).join('\n\n---\n\n');

async function open(page: Page, deck = FORTY) {
	await page.addInitScript(() => window.localStorage.setItem('lattice-studio-map-slots', '3'));
	await gotoStudio(page);
	await setEditorContent(page, deck);
	await page.getByRole('button', { name: 'Slide map' }).click();
	await expect(page.locator(`${RAIL} button[data-unit]`).first()).toBeVisible({ timeout: 40_000 });
	// Every scroll of the rail, on the page's own clock, so a capture's start can be checked against them.
	await page.evaluate(() => {
		const w = window as unknown as { __scrolls: number[] };
		w.__scrolls = [];
		const sc = document.querySelector('[data-map-rail] .overflow-y-scroll');
		sc?.addEventListener('scroll', () => w.__scrolls.push(performance.now()), { passive: true });
	});
}
const scrollRail = (page: Page, to: number) =>
	page.evaluate((y) => {
		const sc = document.querySelector<HTMLElement>('[data-map-rail] .overflow-y-scroll');
		if (sc) sc.scrollTop = y === -1 ? sc.scrollHeight : y;
	}, to);
const captures = (page: Page) => page.evaluate(() => performance.getEntriesByName('lattice-poster-capture').map((e) => ({ start: e.startTime, ms: e.duration, kept: (e as PerformanceMeasure).detail?.kept === true })));

async function postersPastTheCap(page: Page) {
	test.setTimeout(180_000);
	await open(page);
	// Focus the first slide: on screen, Veduta gives the live budget to the tiles nearest the focus, so each stop of the
	// walk below makes its top tiles live (typing the deck leaves the focus on the last slide).
	await page.locator(RAIL).getByRole('button', { name: 'Map, first slide' }).click();
	await expect(page.locator(`${RAIL} button[data-unit="0"]`)).toHaveAttribute('aria-current', 'true');
	// Walk the rail down slowly, so each stop's live tiles render and are captured once the rail is still.
	const height = await page.evaluate(() => document.querySelector<HTMLElement>('[data-map-rail] .overflow-y-scroll')?.clientHeight ?? 600);
	for (let y = 0; y < 40 * 90; y += Math.round(height / 3)) {
		await scrollRail(page, y);
		// The stop is done when every live tile on screen has been captured: its poster then sits under its frame.
		await expect
			.poll(() => page.evaluate(() => [...document.querySelectorAll('[data-map-rail] button[data-tier="live"]')].every((b) => b.querySelector('img'))), { timeout: 15_000 })
			.toBe(true);
	}
	await expect.poll(async () => (await captures(page)).filter((c) => c.kept).length, { timeout: 30_000 }).toBeGreaterThan(6);
	// A fast jump back to the top: the tiles there are past the live cap of 3, and were captured on the way down.
	await scrollRail(page, 0);
	await expect.poll(() => page.locator(`${RAIL} button[data-tier="poster"] img`).count(), { message: 'no tile past the live cap showed a poster' }).toBeGreaterThan(2);
	// Every poster on screen is a decoded picture, not a broken or empty image.
	expect(await page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('[data-map-rail] button[data-tier="poster"] img')].every((i) => i.complete && i.naturalWidth > 0))).toBe(true);
	const live = await page.locator(`${RAIL} button[data-tier="live"]`).count();
	expect(live).toBeLessThanOrEqual(3);

	// No capture started while the reader was scrolling: no scroll in the quiet window before any capture began.
	const scrolls = await page.evaluate(() => (window as unknown as { __scrolls: number[] }).__scrolls);
	const list = await captures(page);
	const mid = list.filter((c) => scrolls.some((t) => t > c.start - 250 && t <= c.start));
	expect(mid, 'a capture began within 250 ms of a scroll').toEqual([]);
	const ms = list.map((c) => c.ms).sort((a, b) => a - b);
	test.info().annotations.push({ type: 'capture', description: `${list.length} captures (${list.filter((c) => c.kept).length} kept); wall ms per capture (clone to JPEG, across awaits) median ${ms[Math.floor(ms.length / 2)]?.toFixed(1)}, max ${ms[ms.length - 1]?.toFixed(1)}; ${await page.locator(`${RAIL} button[data-tier="poster"] img`).count()} posters on screen after the jump` });
}
test('a long deck shows posters, not sketches, on the tiles past the live cap, and no capture starts mid-scroll', async ({ page }) => postersPastTheCap(page));
// Playwright's WebKit, not Safari on a device: it gives the capture's cost on WebKit's engine, and the device number is
// still owed (followups.d/2782-p3-veduta-poster-tile.md).
test('@webkit-tablet on WebKit, posters fill the tiles past the live cap', async ({ page }) => postersPastTheCap(page));

// ── THE RIGHT SLIDE ──────────────────────────────────────────────────────────────────────────────────────────────
// Each slide paints its own full-bleed background (`_backgroundColor`, a hue 9 degrees from its neighbor's), so a poster
// says which slide it is a picture of. Every seventh slide is a Mermaid diagram, which needs another frame document (the
// pool's shape key), so re-pointing a slot across it takes the full write path whose old document a capture must never
// read (audit §11q, slotShows). The walk mixes a slow pass, which captures, with fast jumps, which re-point slots while
// renders are in flight. Then every poster on the rail is sampled in the page: its color must be nearest to its own
// tile's slide out of all forty.
const hue = (i: number) => (i * 9) % 360;
const COLORED = Array.from({ length: 40 }, (_, i) =>
	i % 7 === 3
		? `<!-- _backgroundColor: hsl(${hue(i)} 70% 50%) -->\n\n# Slide ${i + 1}\n\n\`\`\`mermaid\nflowchart LR\n  A --> B\n\`\`\``
		: `<!-- _backgroundColor: hsl(${hue(i)} 70% 50%) -->\n\n# Slide ${i + 1}`,
).join('\n\n---\n\n');

/** For each poster on the rail: its tile, and which slide its pixels are nearest to (a patch at 85% across, 80% down). */
const posterSlides = (page: Page) =>
	page.evaluate(async () => {
		const hsl = (h: number, s: number, l: number) => {
			const k = (n: number) => (n + h / 30) % 12;
			const a = s * Math.min(l, 1 - l);
			const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
			return [f(0) * 255, f(8) * 255, f(4) * 255];
		};
		const palette = Array.from({ length: 40 }, (_, i) => hsl((i * 9) % 360, 0.7, 0.5));
		const out: Array<{ unit: number; nearest: number; distance: number }> = [];
		for (const img of document.querySelectorAll<HTMLImageElement>('[data-map-rail] button[data-unit] img')) {
			if (!img.complete || !img.naturalWidth) continue;
			const unit = Number(img.closest<HTMLElement>('button[data-unit]')?.dataset.unit);
			const c = document.createElement('canvas');
			c.width = img.naturalWidth;
			c.height = img.naturalHeight;
			const g = c.getContext('2d');
			if (!g) continue;
			g.drawImage(img, 0, 0);
			const x = Math.floor(c.width * 0.85);
			const y = Math.floor(c.height * 0.8);
			const d = g.getImageData(x - 2, y - 2, 5, 5).data;
			const px = [0, 1, 2].map((k) => {
				let t = 0;
				for (let p = k; p < d.length; p += 4) t += d[p];
				return t / (d.length / 4);
			});
			let nearest = -1;
			let distance = Infinity;
			palette.forEach((rgb, i) => {
				const e = Math.hypot(rgb[0] - px[0], rgb[1] - px[1], rgb[2] - px[2]);
				if (e < distance) {
					distance = e;
					nearest = i;
				}
			});
			out.push({ unit, nearest, distance: Math.round(distance) });
		}
		return out;
	});

async function postersShowTheirSlide(page: Page) {
	test.setTimeout(240_000);
	await open(page, COLORED);
	await page.locator(RAIL).getByRole('button', { name: 'Map, first slide' }).click();
	await expect(page.locator(`${RAIL} button[data-unit="0"]`)).toHaveAttribute('aria-current', 'true');
	const height = await page.evaluate(() => document.querySelector<HTMLElement>('[data-map-rail] .overflow-y-scroll')?.clientHeight ?? 600);
	const full = await page.evaluate(() => document.querySelector<HTMLElement>('[data-map-rail] .overflow-y-scroll')?.scrollHeight ?? 4000);
	const seen: Array<{ unit: number; nearest: number; distance: number }> = [];
	const sample = async () => {
		for (const p of await posterSlides(page)) seen.push(p);
	};
	// The slow pass: each stop waits until its live tiles have been captured.
	for (let y = 0; y < full; y += Math.round(height / 3)) {
		await scrollRail(page, y);
		await expect
			.poll(() => page.evaluate(() => [...document.querySelectorAll('[data-map-rail] button[data-tier="live"]')].every((b) => b.querySelector('img'))), { timeout: 20_000 })
			.toBe(true);
		await sample();
	}
	// The fast jumps: slots re-point while their renders are in flight, across the Mermaid slides' other frame shape.
	// Paced in animation frames in the page (about 6 and 27 frames, a flick and a pause), not by a wall-clock sleep:
	// this is how fast a reader scrolls, not a guess at when something has finished.
	await page.evaluate(async (h) => {
		const sc = document.querySelector<HTMLElement>('[data-map-rail] .overflow-y-scroll');
		const frames = (n: number) => new Promise<void>((r) => { const tick = (k: number) => (k <= 0 ? r() : requestAnimationFrame(() => tick(k - 1))); tick(n); });
		for (let n = 0; n < 24 && sc; n++) {
			sc.scrollTop = Math.round((((n * 7919) % 97) / 97) * h);
			await frames(n % 3 === 0 ? 27 : 6);
		}
	}, full);
	// Let the last renders and captures land, without a fixed sleep: until the capture count stops moving.
	let last = -1;
	await expect
		.poll(async () => {
			const now = (await captures(page)).length;
			const still = now === last;
			last = now;
			return still;
		}, { timeout: 30_000, intervals: [1500] })
		.toBe(true);
	for (const y of [0, full / 3, (2 * full) / 3, full]) {
		await scrollRail(page, Math.round(y));
		await expect.poll(() => page.locator(`${RAIL} button[data-unit] img`).count()).toBeGreaterThan(0);
		await sample();
	}
	expect(seen.length, 'no poster was sampled, so this test proved nothing').toBeGreaterThan(20);
	const wrong = seen.filter((p) => p.nearest !== p.unit);
	expect(wrong, 'a poster shows another slide').toEqual([]);
	const worst = Math.max(...seen.map((p) => p.distance));
	test.info().annotations.push({ type: 'right-slide', description: `${seen.length} posters sampled, ${wrong.length} wrong; worst color distance ${worst} (neighbors are about 40 apart)` });
}
test('every poster shows its own slide, through slow and fast scrolls across two frame shapes', async ({ page }) => postersShowTheirSlide(page));
test('@webkit-tablet on WebKit, every poster shows its own slide', async ({ page }) => postersShowTheirSlide(page));
