// THE POOL'S POSTER CAPTURE — split out of preview-pool.tsx so that every grid that pools its frames (the add-slide
// gallery, Present's overview, the chat figures) does not load code only the slide map uses. preview-pool.tsx imports
// this module on a capture's first run (audit §11q).

import type { PooledPreviewProps } from './preview-pool';

/**
 * Whether the frame in `slot` shows the picture of `props` now, read from the frame itself, not from props. False while a
 * full document write is still loading (`renderInto` returns before the new document commits, so the old one is still
 * there: `__latticePendingLoad`), when the frame shows another slide index (`__latticeShownSlide`), and when it has no
 * slide. Exported for preview-pool.test.tsx.
 */
export function slotShows(slot: HTMLElement | undefined, props: PooledPreviewProps): boolean {
	const frame = slot?.querySelector('iframe');
	if (!slot || !frame) return false;
	for (let el: HTMLElement | null = frame.parentElement; el && el !== slot.parentElement; el = el.parentElement) {
		const host = el as HTMLElement & { __latticePendingLoad?: boolean; __latticeShownSlide?: { index: number } };
		if (host.__latticePendingLoad === true) return false;
		if (props.slideIndex !== undefined && host.__latticeShownSlide && host.__latticeShownSlide.index !== props.slideIndex) return false;
	}
	try {
		return !!frame.contentDocument?.querySelector('.lattice > section');
	} catch {
		return false;
	}
}

/** The families a slide's text is drawn in, lowercased and unquoted, from every element's computed `font-family`. */
export function familiesOf(section: HTMLElement): string[] {
	const win = section.ownerDocument.defaultView ?? window;
	const out = new Set<string>();
	for (const el of [section, ...section.querySelectorAll<HTMLElement>('*')]) {
		for (const f of win.getComputedStyle(el).fontFamily.split(',')) {
			const name = f.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
			if (name) out.add(name);
		}
	}
	return [...out].sort();
}

/**
 * What one slide draws, for its font sheet: the export's `deckTextOf` (export/deck-export.js) scoped to a slide. Its
 * text, what pseudo-elements draw through `content:`, and its icon glyphs (each a `::before` from `data-glyph`, in no
 * text node), skipping an `icon-svg` slide, which draws its icons as <svg>. Exported for pool-capture.test.ts.
 */
export function slideTextOf(section: HTMLElement, pseudoText: (root: Element) => string): string {
	const glyphs = section.classList.contains('icon-svg') ? '' : [...section.querySelectorAll('[data-glyph]')].map((el) => el.getAttribute('data-glyph') || '').join('');
	return `${section.textContent || ''}\n${pseudoText(section)}\n${glyphs}`;
}

/**
 * The font sheet for one slide: its text families, plus the icon faces and emoji slices it draws
 * (font-embed.js `buildFamilyFontCss`, which encodes each face once a page). NULL WHEN A FACE CANNOT BE HAD: a poster
 * stays on screen and in storage (StudioMap.tsx), so one drawn in a fallback face after a failed fetch would be the
 * re-wrapped, overlapping picture this sheet exists to prevent, kept for good. No poster is the better answer: the
 * tile's live frame keeps drawing it, and a later capture tries again.
 */
async function embedCssFor(section: HTMLElement): Promise<string | null> {
	try {
		const [{ buildFamilyFontCss }, { pseudoContentText }] = await Promise.all([import('../../playground/font-embed.js'), import('../../../../lib/core/slide-camera.mjs')]);
		return await buildFamilyFontCss(familiesOf(section), slideTextOf(section, pseudoContentText));
	} catch {
		return null;
	}
}

/** `captureSlot`'s answer when the reader scrolled while its code loaded: nothing was captured; queue it again. */
export const SCROLLED = 'scrolled' as const;

/**
 * Rasterize the slide a slot's frame shows, at the slot's own size (times the device's pixel ratio), as a JPEG.
 * `still` is asked again once the picture is drawn: a slot re-pointed mid-capture yields null, never another slide's
 * picture. THE SLIDE'S OWN FONTS ARE EMBEDDED: the families it draws in, out of the export's vendored faces
 * (playground/font-embed.js), plus its icon faces and emoji slices, so a capture carries a few faces, not the whole
 * block; and a slide whose faces cannot be had gets no poster (`embedCssFor`). A poster
 * stays on screen once it exists (StudioMap.tsx), so it must match the live tile: drawn in a fallback face it
 * re-wrapped titles and overlapped dense columns.
 *
 * `quiet` is asked once more right before the clone starts, after the capture code has loaded. The pool checked that
 * the scroller was still before it ran this, but the imports below are awaits, and a scroll that landed during them
 * started a capture mid-scroll (studio-map-posters.spec.ts, #3045). Not quiet: nothing is cloned, and the answer is
 * `SCROLLED`.
 */
export async function captureSlot(slot: HTMLDivElement | undefined, still: () => boolean, quiet: () => boolean = () => true): Promise<Blob | null | typeof SCROLLED> {
	const frame = slot?.querySelector('iframe');
	const doc = frame?.contentDocument;
	const section = doc?.querySelector<HTMLElement>('.lattice > section');
	const box = slot?.getBoundingClientRect();
	if (!section || !box || box.width < 1) return null;
	const w = section.offsetWidth;
	const h = section.offsetHeight;
	if (!w || !h) return null;
	try {
		// THE SHARED CAPTURE RULES, not a second set: the ribbon repaint (export/capture-ribbon.js) as the CLONE's style,
		// because this section is a live tile the reader can see and the export's fixups write the node itself; and the
		// one property list every html-to-image capture on the page must pass (lib/core/capture-style-properties.mjs), or a
		// poster captured first would leave every later export's CSS counters at 0. A real-browser test found the first
		// draft, which passed neither, filling Chromium posters with the ribbon's rainbow (e2e/studio-map-posters.spec.ts).
		const [{ toCanvas }, { ribbonCaptureStyle }, { captureStyleProperties }] = await Promise.all([
			import('html-to-image'),
			import('./export/capture-ribbon.js'),
			import('../../../../lib/core/capture-style-properties.mjs'),
		]);
		const fontEmbedCSS = await embedCssFor(section);
		if (fontEmbedCSS === null) return null;
		if (!quiet()) return SCROLLED;
		// A `performance` entry per capture: its WALL time, from the clone to the JPEG, across awaits (image inlining and the
		// encode may run off the main thread). It bounds the main-thread cost; a long-task reading is what pins it down.
		const t0 = performance.now();
		const dpr = Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
		const ribbon = ribbonCaptureStyle((section.ownerDocument.defaultView ?? window).getComputedStyle(section));
		// `webkitBorderImage` FIRST, whenever the ribbon is repainted. Chromium lists `-webkit-border-image` among a node's
		// computed properties, and its value is the shorthand alias with the slice's `fill` implied, so html-to-image copies
		// it onto the clone and the ribbon's gradient paints the WHOLE slide (measured: every Chromium poster a rainbow; the
		// `borderImageSource` override alone changed nothing). The export never meets it because it writes the live node,
		// whose computed alias then reads `none` too. WebKit copies `cssText` instead and was right all along.
		const style = { transform: 'none', margin: '0', outline: 'none', ...(ribbon.borderImageSource ? { webkitBorderImage: 'none' } : {}), ...ribbon };
		const canvas = await toCanvas(section, { width: w, height: h, pixelRatio: (box.width * dpr) / w, ...(fontEmbedCSS ? { fontEmbedCSS } : { skipFonts: true }), includeStyleProperties: captureStyleProperties(), style });
		const blob = still() ? await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82)) : null;
		performance.measure('lattice-poster-capture', { start: t0, end: performance.now(), detail: { kept: !!blob, bytes: blob?.size ?? 0 } });
		return blob;
	} catch {
		return null;
	}
}
