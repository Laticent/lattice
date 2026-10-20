import { coverSourceRect, meanRgb } from '../../../../lib/core/card-ink.mjs';

// The colour of the photo behind a spotlight card, read from the live preview.
//
// card-ink-pick.ts reads this when an image slide opens, and the Card backing slider then asks the
// kernel (lib/core/card-ink.mjs) which of `ink-light` / `ink-dark` reads better on it. This finds
// the slide in the preview frame, reads where the card actually sits on that slide, maps that box
// onto the photo and averages the pixels there. Every step can come back empty (no preview, a
// preview still showing another slide, a photo that will not load, a cross-origin photo the canvas
// refuses to read), and an empty answer is `null`: the caller then leaves the ink alone and the
// lint rule `thin-card-no-ink` is what tells the author.

/** The canvas the region is averaged on; small, because only the mean colour is used. */
const SAMPLE_PX = 24;
const LOAD_MS = 4000;

export type Rgb = number[];

function previewDocument(): Document | null {
	try {
		const frame = document.querySelector<HTMLIFrameElement>('#studio-preview iframe.live') ?? document.querySelector<HTMLIFrameElement>('iframe.live');
		return frame?.contentDocument ?? null;
	} catch {
		return null;
	}
}

function loadPhoto(url: string): Promise<HTMLImageElement | null> {
	return new Promise((resolve) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		const timer = setTimeout(() => resolve(null), LOAD_MS);
		img.onload = () => {
			clearTimeout(timer);
			resolve(img);
		};
		img.onerror = () => {
			clearTimeout(timer);
			resolve(null);
		};
		img.src = url;
	});
}

const squash = (text: string | null | undefined): string => (text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Whether the preview's section is the slide being edited. The frame holds one slide at a time and
 * lags a slide switch, so the first section can still be the PREVIOUS slide; the heading is the
 * cheap tell. The comparison drops everything but letters and digits (the source has markdown, the
 * page has typographer quotes) and accepts a shared 12-character start. No heading on either side
 * proves nothing, so it passes.
 */
export function sameSlide(sourceHeading: string | null, renderedHeading: string | null): boolean {
	const a = squash(sourceHeading);
	const b = squash(renderedHeading);
	if (!a || !b) return true;
	const n = Math.min(12, a.length, b.length);
	return a.slice(0, n) === b.slice(0, n);
}

/**
 * The mean colour of the photo behind the spotlight card on slide `slideNumber` (1-based), or null
 * when it cannot be read. The preview frame holds either the whole deck or just the slide on
 * screen, so the section is taken by position, falls back to the first, and must show `heading`.
 */
export async function sampleBehindCard(slideNumber: number, heading: string | null): Promise<Rgb | null> {
	try {
		const doc = previewDocument();
		if (!doc) return null;
		const sections = doc.querySelectorAll<HTMLElement>('section');
		const section = sections[slideNumber - 1] ?? sections[0];
		if (!section || section.getAttribute('data-img-composition') !== 'spotlight') return null;
		if (!sameSlide(heading, section.querySelector('h1, h2')?.textContent ?? null)) return null;
		const panel = section.querySelector<HTMLElement>('.lattice-bg');
		const card = section.querySelector<HTMLElement>('.image-text');
		const url = /url\((['"]?)(.*?)\1\)/.exec(panel?.style.backgroundImage ?? '')?.[2];
		if (!panel || !card || !url) return null;

		// Measure first. Changing the slide's classes re-renders the preview, which replaces the section
		// this function holds; after the photo loads it would be detached and read as zero-sized.
		const sectionBox = section.getBoundingClientRect();
		const cardBox = card.getBoundingClientRect();
		const panelW = section.offsetWidth;
		const panelH = section.offsetHeight;
		// The preview may scale the slide to fit, so measure against the unscaled box.
		const scale = panelW ? sectionBox.width / panelW : 1;
		if (!(scale > 0)) return null;
		const box = {
			x: (cardBox.left - sectionBox.left) / scale,
			y: (cardBox.top - sectionBox.top) / scale,
			w: cardBox.width / scale,
			h: cardBox.height / scale,
		};

		const photo = await loadPhoto(url);
		if (!photo) return null;

		const canvas = document.createElement('canvas');
		canvas.width = SAMPLE_PX;
		canvas.height = SAMPLE_PX;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) return null;
		if (photo.naturalWidth > 0 && photo.naturalHeight > 0) {
			// A raster photo: the panel covers it, so map the card's box back to the photo's own pixels.
			const src = coverSourceRect(photo.naturalWidth, photo.naturalHeight, panelW, panelH, box);
			if (!src) return null;
			ctx.drawImage(photo, src.x, src.y, src.w, src.h, 0, 0, SAMPLE_PX, SAMPLE_PX);
		} else {
			// A vector photo with no intrinsic size reports 0x0 and stretches to whatever it is drawn at,
			// so draw it at a quarter of the panel and read the card's box from that.
			const k = 0.25;
			const full = document.createElement('canvas');
			full.width = Math.max(1, Math.round(panelW * k));
			full.height = Math.max(1, Math.round(panelH * k));
			const fctx = full.getContext('2d');
			if (!fctx) return null;
			fctx.drawImage(photo, 0, 0, full.width, full.height);
			ctx.drawImage(full, box.x * k, box.y * k, Math.max(1, box.w * k), Math.max(1, box.h * k), 0, 0, SAMPLE_PX, SAMPLE_PX);
		}
		return meanRgb(ctx.getImageData(0, 0, SAMPLE_PX, SAMPLE_PX).data);
	} catch {
		// A cross-origin photo taints the canvas and `getImageData` throws a SecurityError.
		return null;
	}
}
