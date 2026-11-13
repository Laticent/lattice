// Preview-sized photo copies (src/lib/preview-image-scale.ts), on the real Studio: what the adversarial review
// of #2998 broke in the first version, pinned where it was broken.
//
//  1. The copy worker runs in the Studio page, which no frame content-security policy governs. It must never be
//     handed a web origin the reader did not allow: not through a `style=` inside an image's alt text or a
//     link's title, not through markup in a comment, not through a `bleed` photo from a refused origin. The first
//     version read markup with regexes and fetched all three (a tracking beacon on open).
//  2. Only `background` / `background-image` are rewritten: a chart's gradient fill (`fill:url(#…)`) is not a
//     photo, and the first version blanked it.
//  3. A photo the frame may load is shown as a copy (`blob:`), not by its own address.
import { expect, test } from '@playwright/test';
import { gotoStudio, setEditorContent } from './studio-fixture';

// The copies are for touch devices: with a fine pointer only a thumbnail gets one, and a desktop's main
// preview keeps its original (preview-image-scale.ts, tierFor). So every engine here runs as a touch device
// sees it: `(pointer: fine)` does not match, which is all tierFor reads. The viewports stay each project's own.
test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		const real = window.matchMedia.bind(window);
		window.matchMedia = (q: string) => (/\(\s*pointer\s*:\s*fine\s*\)/.test(q) ? { ...real('(min-width: 999999px)'), media: q, matches: false } : real(q)) as MediaQueryList;
	});
});

const DECK = `---
title: Photo copies
---

## A beacon in the alt text, a link title and a comment

![a style='background:url(https://evil.example/alt.jpg)' x](sample:photo-wide.svg)

[x](https://example.com "t style='background:url(https://evil.example/title.jpg)'")

<!-- <div style="background:url(https://evil.example/comment.jpg)"></div> -->

---

<!-- _class: content bleed -->

![Blocked](https://evil.example/blocked.jpg)

## A web background the reader never allowed

---

<!-- _class: radar -->

## Two vendors, five axes.

- Build in-house
  - Coverage \`6\`
  - Integration \`7\`
  - Support \`5\`
- Vendor North
  - Coverage \`8\`
  - Integration \`5\`
  - Support \`7\`

---

<!-- _class: image spotlight -->

## A real photo

![A lake](sample:photo-wide.jpg)
`;

test('photo copies never reach a refused origin, leave chart fills alone, and show the photo as a copy @crosswidth @webkit-tablet @webkit-phone @gecko', async ({ page }) => {
	test.setTimeout(240_000);
	const refused: string[] = [];
	await page.context().route('**/*', (route) => {
		const u = route.request().url();
		if (u.includes('evil.example')) refused.push(u);
		return route.continue();
	});
	await gotoStudio(page);
	const source = page.getByRole('button', { name: 'Markdown source' });
	if (await source.isVisible().catch(() => false)) await source.click();
	await setEditorContent(page, DECK);
	const preview = page.getByRole('button', { name: 'Preview', exact: true });
	if (await preview.isVisible().catch(() => false)) await preview.click();

	const inFrames = async <T>(fn: () => T, add: (a: T, b: T) => T, zero: T): Promise<T> => {
		let acc = zero;
		for (const f of page.frames()) acc = add(acc, await f.evaluate(fn).catch(() => zero));
		return acc;
	};
	// The caret ends on the last slide, the photo: it shows as a copy.
	await expect.poll(() => inFrames(() => document.querySelectorAll('section [style*="blob:"]').length, (a, b) => a + b, 0), { timeout: 90_000, message: 'the photo never showed as a copy' }).toBeGreaterThan(0);

	// Walk back through every slide, waiting each time for that slide's own words to be drawn in a frame.
	const prev = page.getByRole('button', { name: /previous slide/i }).first();
	const drawn = (text: string) => inFrames(() => document.body?.innerText ?? '', (x, y) => x + y, '').then((all) => all.includes(text));
	// The radar: its gradient fills must still be url(#…), never taken for a photo.
	await prev.click();
	const radar = () =>
		inFrames(
			() => {
				const els = [...document.querySelectorAll('section.radar [style*="fill"]')];
				return { fills: els.filter((e) => /fill:\s*url\(#/.test(e.getAttribute('style') || '')).length, blanked: els.filter((e) => e.hasAttribute('data-lattice-painting')).length };
			},
			(x, y) => ({ fills: x.fills + y.fills, blanked: x.blanked + y.blanked }),
			{ fills: 0, blanked: 0 },
		);
	await expect.poll(async () => (await radar()).fills, { timeout: 30_000, message: 'the radar never rendered, so its fills went unchecked' }).toBeGreaterThan(0);
	expect((await radar()).blanked, 'a chart fill was taken for a photo').toBe(0);
	// The refused web background, then the alt text, title and comment beacons: each slide is drawn.
	await prev.click();
	await expect.poll(() => drawn('A web background the reader never allowed'), { timeout: 30_000 }).toBe(true);
	await prev.click();
	await expect.poll(() => drawn('A beacon in the alt text'), { timeout: 30_000 }).toBe(true);
	expect(refused, 'the Studio fetched an origin the reader never allowed').toEqual([]);
});

// A prose photo (`![alt](…)`, what the Compose picker and the chat agent write) renders as an <img>. It keeps
// its original until its copy exists, then shows the copy: an SVG the original's size wrapping the smaller
// bitmap, so its intrinsic size — and with it the box the slide gives it — is the original's.
test('a prose photo switches to its copy without moving @crosswidth @webkit-tablet @webkit-phone @gecko', async ({ page }) => {
	test.setTimeout(180_000);
	// The worker's fetch names the original's address, which the frame no longer holds once the copy shows.
	let original = '';
	page.context().on('request', (r) => {
		if (!original && r.url().includes('photo-wide.jpg')) original = r.url();
	});
	await gotoStudio(page);
	const source = page.getByRole('button', { name: 'Markdown source' });
	if (await source.isVisible().catch(() => false)) await source.click();
	await setEditorContent(page, '---\ntitle: Prose photo\n---\n\n## A harbor at dawn\n\n![A harbor](sample:photo-wide.jpg)\n');
	const preview = page.getByRole('button', { name: 'Preview', exact: true });
	if (await preview.isVisible().catch(() => false)) await preview.click();
	// The copy, and the original's box: a clone of the same <img> beside it, showing the original.
	const read = async () => {
		for (const f of page.frames()) {
			const r = await f
				.evaluate(async (orig) => {
					const img = document.querySelector<HTMLImageElement>('section img[alt="A harbor"]');
					if (!img?.complete || !img.naturalWidth || !img.currentSrc.startsWith('blob:')) return null;
					const twin = img.cloneNode() as HTMLImageElement;
					twin.alt = 'twin';
					twin.src = orig;
					// Measured once the original has loaded: Firefox settles decode() on a 3200px image before
					// that, and a still-loading <img> lays out as its alt text. An <img> with a source always
					// fires one of the two, and a frame torn down mid-wait rejects this evaluate (caught below),
					// so the wait needs no timer of its own.
					await new Promise((ok) => {
						twin.onload = twin.onerror = ok;
						img.after(twin);
					});
					if (!twin.naturalWidth) return null;
					const a = img.getBoundingClientRect();
					const b = twin.getBoundingClientRect();
					twin.remove();
					return { copy: [Math.round(a.width), Math.round(a.height)], original: [Math.round(b.width), Math.round(b.height)] };
				}, original)
				.catch(() => null);
			if (r) return r;
		}
		return null;
	};
	await expect.poll(async () => !!original && !!(await read()), { timeout: 60_000, message: 'the prose photo never showed its copy' }).toBe(true);
	const boxes = await read();
	expect(boxes?.copy, 'the copy laid out differently from the original').toEqual(boxes?.original);
	expect(boxes?.copy[0]).toBeGreaterThan(0);
});
