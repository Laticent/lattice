import type { Page } from '@playwright/test';
import { expect, gotoStudio, openAddSlide, test } from './studio-fixture';

// ONE PARSED STYLESHEET FOR EVERY PREVIEW FRAME (#1538), on the real surface.
//
// The engine sheet is ~640KB and a pure function of theme-name + geometry, so every tile in the
// add-slide gallery wants byte-identical CSS. Each frame used to inline its own copy, which a
// browser cannot recognize as the same thing. Serving one url instead cut the gallery's peak
// resident set by 63% on Chromium and 21% on WebKit, measured as an A/B in one build.
//
// ── WHY THE FONT ASSERTION IS THE IMPORTANT HALF ───────────────────────────────────
// This is a guard against a bug that was WRITTEN, measured, and very nearly shipped. A
// stylesheet's relative urls resolve against the STYLESHEET's base, and a `blob:` url is an
// opaque-path url with nothing to resolve against — so `url(/…/playfair-400.woff2)`, correct
// inline, becomes unfetchable from a blob. It fails in the most expensive way available: the
// sheet parses (3595 rules), every color and every box is right, so the document is
// structurally perfect and renders in FALLBACK FACES. Measured at the time: 37 of 37
// `@font-face` entries at `status: "error"` against 37 loaded inline, and the deck's headline
// measuring 828px — the fallback width exactly — instead of 877px.
//
// Every check that counted things passed while that was true. `preview-font-swap.spec.ts`
// passed. The gallery's own budget and metamorphic suites passed, because a tile with the wrong
// font is still a mounted, painted tile. What caught it was looking at two screenshots. So the
// oracle here is not "did a sheet arrive" but "did the FACES arrive", which is the only
// question that would have gone red.

const SCROLLER = 'div.overflow-y-auto.overscroll-contain';

/** Per-frame font-face census inside a set of preview frames: how many faces each document
 *  declares, and how many actually reached `loaded`. A face at `error` is the failure above. */
const faceCensus = (page: Page, selector: string) =>
	page.evaluate((sel) => {
		const out: { declared: number; loaded: number; errored: number }[] = [];
		for (const fr of document.querySelectorAll(sel)) {
			let doc: Document | null = null;
			try {
				doc = (fr as HTMLIFrameElement).contentDocument;
			} catch {
				doc = null;
			}
			if (!doc?.querySelector('.lattice')) continue;
			const faces = [...doc.fonts];
			out.push({
				declared: faces.length,
				loaded: faces.filter((f) => f.status === 'loaded').length,
				errored: faces.filter((f) => f.status === 'error').length,
			});
		}
		return out;
	}, selector);

/** Distinct shared-sheet urls across a set of frames, plus how each frame took delivery. */
const sheetCensus = (page: Page, selector: string) =>
	page.evaluate((sel) => {
		const hrefs = new Set<string>();
		let linked = 0;
		let inlined = 0;
		let frames = 0;
		for (const fr of document.querySelectorAll(sel)) {
			let doc: Document | null = null;
			try {
				doc = (fr as HTMLIFrameElement).contentDocument;
			} catch {
				doc = null;
			}
			if (!doc?.querySelector('.lattice')) continue;
			frames++;
			const el = doc.getElementById('lattice-sheet');
			if (!el) continue;
			if (el.tagName === 'LINK') {
				linked++;
				hrefs.add(el.getAttribute('href') || '');
			} else inlined++;
		}
		return { distinct: hrefs.size, linked, inlined, frames };
	}, selector);

test('@crosswidth the gallery serves ONE sheet to every tile, and the tiles load their real faces', async ({ page }, testInfo) => {
	test.setTimeout(150_000);
	await gotoStudio(page);
	await openAddSlide(page, testInfo.project.name === 'mobile');

	// Wait for tiles to have PAINTED, not merely mounted — a frame mid-write has no faces yet.
	await expect
		.poll(async () => (await faceCensus(page, `${SCROLLER} iframe.live`)).length, { timeout: 45_000, message: 'no gallery tile ever painted a slide' })
		.toBeGreaterThan(1);

	const sheets = await sheetCensus(page, `${SCROLLER} iframe.live`);
	expect(sheets.frames, 'no gallery tile was readable').toBeGreaterThan(1);
	// THE SHARING CLAIM. Every tile takes the sheet by link, and they all name the SAME one —
	// which is the entire mechanism: N frames, one parsed stylesheet.
	expect(sheets.inlined, `${sheets.inlined} tiles still inline the engine sheet`).toBe(0);
	expect(sheets.linked, 'no tile linked a shared sheet').toBeGreaterThan(1);
	expect(sheets.distinct, `tiles referenced ${sheets.distinct} different sheets — they are not sharing one`).toBe(1);

	// THE FONT CLAIM, and the one that would have caught the near-miss. Poll: faces load
	// asynchronously and a cold frame can legitimately be mid-fetch.
	await expect
		.poll(
			async () => {
				const census = await faceCensus(page, `${SCROLLER} iframe.live`);
				return census.filter((c) => c.declared > 0 && c.loaded === 0).length;
			},
			{ timeout: 45_000, message: 'gallery tiles declared font faces and loaded none of them — the deck is rendering in fallback faces' },
		)
		.toBe(0);

	const census = await faceCensus(page, `${SCROLLER} iframe.live`);
	const errored = census.filter((c) => c.errored > 0);
	expect(errored, `tile(s) with font faces in an ERROR state: ${errored.map((c) => `${c.errored}/${c.declared}`).join(' · ')}`).toEqual([]);
});

test("@crosswidth the Studio's own preview loads its faces too", async ({ page }) => {
	// The gallery is not the only consumer of this builder — the editor preview, Present and
	// Reshape all render through it. This is the authoring surface, where a wrong font is a
	// wrong Fit measurement and not merely a wrong look.
	test.setTimeout(120_000);
	await gotoStudio(page);
	const frame = '[aria-label="Live deck preview"] iframe.live';
	await page.frameLocator(frame).locator('section[data-lattice-slide]').first().waitFor({ timeout: 45_000 });

	await expect
		.poll(
			async () => {
				const c = await faceCensus(page, frame);
				return c.length && c[0].declared > 0 ? c[0].loaded : -1;
			},
			{ timeout: 45_000, message: "the Studio's own preview loaded no font faces" },
		)
		.toBeGreaterThan(0);

	const c = await faceCensus(page, frame);
	expect(c[0].errored, `${c[0].errored} of ${c[0].declared} faces failed to load in the authoring preview`).toBe(0);
});
