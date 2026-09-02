import { expect, gotoStudio, livePreview, railButtons, setEditorContent, test } from './studio-fixture';

// `math compare` in REAL WebKit: every `<h3>` must paint exactly ONCE.
//
// #1554, reported from an iPad: on a `math compare` slide WebKit paints the
// first `<h3>` twice — the real one in its column, and a ghost copy above the
// `column-span: all` headline. Chromium renders the same DOM correctly.
//
// The box that actually fragments is the EYEBROW paragraph (the in-flow content
// PRECEDING the spanner), not the h3 — `break-inside: avoid` on the h3 alone
// changes nothing, and a compare slide with no eyebrow never had the bug. Both
// shapes below therefore carry an eyebrow; a fixture without one cannot fail.
//
// WHY THIS SPEC IS A RASTER CHECK. Every gate this repo owns measures boxes, and
// the boxes are right: on the failing slide WebKit and Chromium agree to within
// 3px, `getClientRects()` returns a SINGLE rect (so even the plural API cannot
// see the fragment), `section.overflow` is 0 and `scrollHeight == clientHeight`.
// Hit-testing is not an oracle either — WebKit hit-tests the ghost on some
// slides and not others. The duplicate exists only in the PAINT, so only pixels
// can assert it away.
//
// The oracle: binarize the slide, take each h3's TIGHT GLYPH box (a Range over
// its text, not the element box — the element box spans the whole column and
// carries a 2px accent underline the ghost does not reproduce, which drags the
// score below any usable threshold) and look for a second occurrence of that
// ink. Candidate origins are the column x-positions give or take a few px,
// since a fragment lands at a column start.
//
// Tagged `@webkit-tablet` so the nightly runs it — see playwright.config.ts. A
// Chromium pass proves nothing here, which is precisely why the defect shipped:
// no `@webkit-*` spec covered this component.
//
// NOTE ON VIEWPORTS: what that project contributes is the ENGINE, not the box.
// Its 1180x703 viewport belongs to the Studio page; the document under test is
// re-hosted on a probe page sized 1280x900 — large enough to hold the 1280x720
// slide without the page itself scrolling, so the raster is the slide and
// nothing else. The ghost reproduces at both, and at 1180x820 and 1400x900.

/** Two columns under an eyebrow — the reported shape. Plus a three-column slide,
 *  because `.compare` switches to 3 columns on a third h3 and the fix has to hold
 *  for both. */
const DECK = `---
theme: indaco
paginate: true
---

<!-- _class: math compare -->

\`Estimators · asymptotics\`

## An eyebrow over a title that runs long enough to wrap onto a second line.

### Method of moments

$$ \\hat\\theta_{\\text{MM}} = g^{-1}(\\bar{m}_n) $$

Matches sample moments to population moments. Consistent under mild regularity, but generally inefficient relative to maximum likelihood in finite samples.

### Generalized method of moments

$$ \\hat\\theta_{\\text{GMM}} = \\arg\\min_\\theta\\, g_n(\\theta)^\\top W g_n(\\theta) $$

Weights an overidentified moment system. Efficient when $W$ is the inverse of the moment covariance.

---

<!-- _class: math compare -->

\`Three-up · norms\`

## Three norms, three geometries.

### Lasso

$$ \\|\\beta\\|_1 $$

Sparse solutions from the polytope corners of the constraint region.

### Ridge

$$ \\|\\beta\\|_2^2 $$

Shrinks all coefficients smoothly toward zero without ever reaching it.

### Elastic net

$$ \\alpha\\|\\beta\\|_1 + (1-\\alpha)\\|\\beta\\|_2^2 $$

Blends both penalties to keep grouped predictors in or out together.
`;

type H3Box = { text: string; x: number; y: number; w: number; h: number };
type Dupe = { text: string; at: [number, number]; alsoAt: [number, number]; score: number };

/**
 * Search a slide raster for any h3 whose ink appears a second time.
 * Runs inside the page: the PNG goes in as base64 and is decoded with
 * createImageBitmap, so the suite needs no image-decoding dependency.
 *
 * WHY NOT `fetch(dataUrl)`, which is the obvious way to do this. It fails in the
 * probe page for TWO independent reasons, and both are permanent — measured in
 * Playwright's WebKit at four cells of {no CSP, preview CSP} x {70-byte PNG, ~1.9MB
 * data URL}:
 *
 *   | policy      | tiny PNG | ~1.9MB url |
 *   |-------------|---------:|-----------:|
 *   | none        |       OK |     FAILED |
 *   | preview CSP |   FAILED |     FAILED |
 *
 *   1. `connect-src 'self'` — the preview/export remote-subresource policy
 *      (`lib/core/subresource-csp.mjs`, #1753/#2009) does not list `data:` under
 *      `connect-src`, so ANY `fetch('data:…')` is refused. The probe page inherits
 *      that policy because it re-hosts the presented document, meta tag and all.
 *   2. WebKit refuses a multi-megabyte `data:` URL from `fetch()` even with no CSP
 *      at all, and a real slide screenshot is comfortably over the line.
 *
 * Both surface as the same bare `TypeError: Load failed`, which names neither.
 * `atob` + `Blob` reaches no loader and no network, so it answers to neither limit.
 */
async function h3sPaintedTwice(page: import('@playwright/test').Page, png: Buffer, h3s: H3Box[]): Promise<Dupe[]> {
	return page.evaluate(async ({ b64, boxes }) => {
		const bin = atob(b64);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
		const cv = new OffscreenCanvas(bmp.width, bmp.height);
		const ctx = cv.getContext('2d')!;
		ctx.drawImage(bmp, 0, 0);
		const { data, width, height } = ctx.getImageData(0, 0, bmp.width, bmp.height);

		// Ink = a pixel differing from its row's MODAL color, which tracks a
		// gradient background far better than one global background sample.
		const ink = new Uint8Array(width * height);
		for (let y = 0; y < height; y++) {
			const tally = new Map<number, number>();
			for (let x = 0; x < width; x += 3) {
				const q = (y * width + x) * 4;
				const k = ((data[q] >> 3) << 10) | ((data[q + 1] >> 3) << 5) | (data[q + 2] >> 3);
				tally.set(k, (tally.get(k) || 0) + 1);
			}
			let best = 0, bk = 0;
			for (const [k, v] of tally) if (v > best) { best = v; bk = k; }
			const br = ((bk >> 10) & 31) << 3, bg = ((bk >> 5) & 31) << 3, bb = (bk & 31) << 3;
			for (let x = 0; x < width; x++) {
				const q = (y * width + x) * 4;
				if (Math.max(Math.abs(data[q] - br), Math.abs(data[q + 1] - bg), Math.abs(data[q + 2] - bb)) > 20) {
					ink[y * width + x] = 1;
				}
			}
		}

		const origins = [...new Set(boxes.flatMap((b) => {
			const xs: number[] = [];
			for (let d = -16; d <= 16; d += 2) xs.push(b.x + d);
			return xs;
		}))].filter((x) => x >= 0);

		const found: Dupe[] = [];
		for (const b of boxes) {
			if (b.w < 8 || b.h < 8) continue;
			const tpl = new Uint8Array(b.w * b.h);
			let n = 0;
			for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
				const v = ink[(b.y + y) * width + (b.x + x)] || 0;
				tpl[y * b.w + x] = v; n += v;
			}
			if (n < 40) continue;
			let best = { s: 0, ox: 0, oy: 0 };
			for (const ox of origins) for (let oy = 0; oy + b.h <= height; oy++) {
				// Never score a position an h3 already occupies. Its own is not a
				// duplicate, and a sibling's is a RESEMBLANCE — two short mono-caps
				// labels ("Mean"/"Mode") share most of their ink, which is not the
				// defect and would make this spec flaky.
				if (boxes.some((o) => Math.abs(ox - o.x) <= 20 && Math.abs(oy - o.y) <= Math.max(10, o.h))) continue;
				let inter = 0, uni = 0, bail = false;
				for (let y = 0; y < b.h && !bail; y++) {
					const sy = oy + y;
					for (let x = 0; x < b.w; x++) {
						const sx = ox + x;
						if (sx >= width) { bail = true; break; }
						const p = tpl[y * b.w + x], q = ink[sy * width + sx];
						if (p & q) inter++;
						if (p | q) uni++;
					}
				}
				const s = bail || !uni ? 0 : inter / uni;
				if (s > best.s) best = { s, ox, oy };
			}
			// The band, measured rather than guessed. Worst COINCIDENTAL self-match
			// across the fixture set: 0.585 in Chromium, 0.549 in a clean WebKit. A
			// real ghost scores 0.72-1.00 (1.00 on the 2-column shape — an exact
			// pixel copy). 0.65 sits in that gap with ~0.10 of headroom on the noise
			// side, which is the side that would make this flaky.
			//
			// KNOWN HOLE, deliberate: the sibling-skip above also blinds the search
			// to a ghost landing at another h3's own origin AND row. That window is
			// the price of not reporting "Mean" and "Mode" as copies of each other;
			// the ghost this guards sits ~95px above its source, well clear of it.
			if (best.s >= 0.65) {
				found.push({ text: b.text, at: [b.x, b.y], alsoAt: [best.ox, best.oy], score: Math.round(best.s * 1000) / 1000 });
			}
		}
		return found;
	}, { b64: png.toString('base64'), boxes: h3s });
}

test('every math compare h3 paints exactly once in WebKit (#1554) @webkit-tablet', async ({ page, context, baseURL }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect.poll(() => railButtons(page).count(), { timeout: 30_000 }).toBe(2);
	await expect(livePreview(page).locator('section.math.compare')).toHaveCount(1);

	// Take the deck through PRESENT — the surface #1554 was reported from — so the
	// document under test is the real one: real engine output, real bundled CSS,
	// real webfonts. (Typing leaves the caret at the end of the deck, so Present
	// would otherwise open on the last slide.)
	await railButtons(page).nth(0).click();
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Present' })).toBeVisible();

	const probe = await context.newPage();
	await probe.setViewportSize({ width: 1280, height: 900 });

	for (const [i, label] of [[0, 'two columns under an eyebrow'], [1, 'three columns']] as const) {
		if (i > 0) {
			await page.getByRole('dialog', { name: 'Present' }).getByRole('button', { name: 'Next slide' }).click();
		}
		const frame = page.frameLocator('[aria-label="Presented slide"] iframe.live');
		await expect(frame.locator('section.math.compare')).toHaveCount(1);
		// Sequence the arms on the SHAPE, not on a sleep. `toHaveCount(1)` above
		// cannot tell "the next slide mounted" from "the previous one is still
		// there", so waiting for this arm's own column count is what actually
		// establishes that the Next-slide click landed. KaTeX also lays out
		// asynchronously, and the h3 boxes have to be final before they are used as
		// templates — this retries until they are.
		const expectedColumns = i === 0 ? 2 : 3;
		await expect(frame.locator('section.math.compare > h3')).toHaveCount(expectedColumns);
		await expect(frame.locator('section.math.compare > h3').last()).toBeVisible();

		// Re-host the presented document at TOP LEVEL to read it.
		//
		// This is not a convenience — it is what makes the spec able to fail.
		// Headless WebKit does not paint the duplicate when the document sits in
		// the Studio's srcdoc iframe; real iOS Safari does, which is how #1554 was
		// reported. The document is the same either way, so the fragment is a
		// property of the engine's markup + CSS, not of the host. Asserting inside
		// the iframe yields a spec that passes against the unfixed engine —
		// measured, not assumed — i.e. no guard at all.
		//
		// Reach the frame through its OWNING ELEMENT, never by scanning
		// `page.frames()` for one containing a `section.math.compare`. With Present
		// open there are TWO such frames and the composer's live preview comes
		// first, so a scan reads the wrong document: both arms below can end up
		// rastering the same slide, and the failure message names the wrong shape.
		const presentedFrame = await (
			await page.locator('[aria-label="Presented slide"] iframe.live').elementHandle()
		)?.contentFrame();
		expect(presentedFrame, `${label}: presented frame`).toBeTruthy();
		const presentedHtml = await presentedFrame!.content();

		// Navigate first so the document's relative asset URLs (fonts, in
		// particular — the ghost is a column-BALANCE artifact and moves with text
		// metrics) resolve against the same origin they did in the Studio.
		await probe.goto(`${baseURL}/studio/`, { waitUntil: 'domcontentloaded' });
		await probe.setContent(presentedHtml as string, { waitUntil: 'load' });
		await probe.evaluate(() => document.fonts.ready);
		await probe.waitForTimeout(400);

		const section = probe.locator('section.math.compare').first();
		await expect(section, `${label}: re-hosted section`).toBeVisible();

		const h3s: H3Box[] = await section.evaluate((el) => {
			const o = el.getBoundingClientRect();
			return [...el.querySelectorAll(':scope > h3')].map((h) => {
				const r = document.createRange();
				r.selectNodeContents(h);
				const g = r.getBoundingClientRect();
				return {
					text: (h.textContent || '').trim().slice(0, 26),
					x: Math.round(g.left - o.left), y: Math.round(g.top - o.top),
					w: Math.round(g.width), h: Math.round(g.height),
				};
			});
		});
		// EXACT, not >= 2: the arms exist to cover the 2- and 3-column layouts, and a
		// loose bound is what lets a wrong-frame read pass unnoticed.
		expect(h3s.length, `${label}: h3 count`).toBe(expectedColumns);

		const dupes = await h3sPaintedTwice(probe, await section.screenshot(), h3s);
		expect(
			dupes,
			`${label}: an h3 painted more than once — ` +
			dupes.map((d) => `"${d.text}" at ${d.at} also at ${d.alsoAt} (iou ${d.score})`).join('; '),
		).toEqual([]);
	}
	await probe.close();
});
