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

/** The `@font-face` rules of `css` whose family is in `families`. `css` is the export's text-face block
 *  (playground/font-embed.js), one `@font-face{font-family:'X';…}` rule per face. Exported for pool-capture.test.ts. */
export function facesFor(css: string, families: readonly string[]): string {
	const want = new Set(families);
	return css
		.split('@font-face')
		.filter((rule) => {
			const m = /font-family:\s*['"]?([^'";]+)/.exec(rule);
			return !!m && want.has(m[1].trim().toLowerCase());
		})
		.map((rule) => `@font-face${rule}`)
		.join('');
}

/** One embed sheet per set of families: a map's slides share a handful of sets, so each is filtered once a page. */
const embeds = new Map<string, Promise<string>>();
function embedCssFor(families: string[]): Promise<string> {
	const key = families.join('\u0000');
	let p = embeds.get(key);
	if (!p) {
		p = import('../../playground/font-embed.js')
			.then(({ buildFontEmbedCss }) => buildFontEmbedCss('', { emoji: 'system' }))
			.then((css: string) => facesFor(css, families))
			.catch(() => {
				embeds.delete(key); // a later capture retries; this one goes without
				return '';
			});
		embeds.set(key, p);
	}
	return p;
}

/** `captureSlot`'s answer when the reader scrolled while its code loaded: nothing was captured; queue it again. */
export const SCROLLED = 'scrolled' as const;

/**
 * Rasterize the slide a slot's frame shows, at the slot's own size (times the device's pixel ratio), as a JPEG.
 * `still` is asked again once the picture is drawn: a slot re-pointed mid-capture yields null, never another slide's
 * picture. THE SLIDE'S OWN FONTS ARE EMBEDDED: the families it draws in, out of the export's vendored faces
 * (playground/font-embed.js), filtered per slide so a capture carries a few faces, not the whole block. A poster
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
		const fontEmbedCSS = await embedCssFor(familiesOf(section));
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
