import { describe, judge } from '../../../../../lib/core/photo-contrast.mjs';
import { boxInSection, CARD_CLASS, meanUnderBox, photoMatches, previewDocument, sameSlide } from '../card-ink-sampler';

// The Coach's photo-contrast read: does the text on THIS slide's photo reach 4.5:1, measured in the
// live preview, and would pinning the slide dark or light fix it? The preview frame holds one slide
// at a time, so this answers for the slide on screen. The arithmetic is the kernel's
// (lib/core/photo-contrast.mjs); this file only reads the page: the photo behind the card, the
// card's fill, and the ink, each as the browser actually painted it. It never edits the deck.
//
// Every step can come back empty (no preview, a preview still showing another slide, a photo the
// browser cannot read), and an empty answer is `null`: no finding. Silence here means "could not
// measure", not "passes", and the panel does not claim otherwise.

export type Pin = 'dark' | 'light';
export type PhotoRead = { ratio: number; floor: number; fix: Pin | null; fixRatio: number | null; message: string };

type Rgb = number[];
type Scene = { card: number[] | null; ink: number[][] };

let probe: CanvasRenderingContext2D | null = null;

/** Any CSS color the browser can paint (`color-mix`, `oklab`, `rgb`) as [r, g, b, a 0..1], or null. */
function rgba(css: string): number[] | null {
	probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
	if (!probe) return null;
	probe.clearRect(0, 0, 1, 1);
	// An unparseable value leaves fillStyle untouched, so a sentinel tells "invalid" from "black".
	probe.fillStyle = '#010203';
	probe.fillStyle = css;
	if (probe.fillStyle === '#010203' && css.replace(/\s/g, '') !== '#010203') return null;
	probe.fillRect(0, 0, 1, 1);
	const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
	return [r, g, b, a / 255];
}

/** Heading and the first paragraph or list row of the card: the text a viewer reads first. */
function inkTargets(card: HTMLElement): HTMLElement[] {
	return ['h1, h2', 'p', 'li'].map((sel) => card.querySelector<HTMLElement>(sel)).filter((el): el is HTMLElement => !!el && !!el.textContent?.trim());
}

function readScene(card: HTMLElement): Scene | null {
	const view = card.ownerDocument.defaultView;
	if (!view) return null;
	const fill = rgba(view.getComputedStyle(card).backgroundColor);
	const ink = inkTargets(card).map((el) => rgba(view.getComputedStyle(el).color));
	if (!ink.length || ink.some((c) => !c)) return null;
	return { card: fill && fill[3] > 0 ? fill : null, ink: ink as number[][] };
}

/**
 * The scene as it would paint with `pin` on the section. Styles are read synchronously inside one
 * task (the browser paints nothing in between) with transitions off, since a computed color read
 * right after a class change would otherwise be the old one. Both pin classes are put back.
 */
function readPinned(section: HTMLElement, card: HTMLElement, pin: Pin): Scene | null {
	const doc = section.ownerDocument;
	const was = { dark: section.classList.contains('dark'), light: section.classList.contains('light') };
	const hush = doc.createElement('style');
	hush.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
	doc.head.appendChild(hush);
	try {
		section.classList.toggle('dark', pin === 'dark');
		section.classList.toggle('light', pin === 'light');
		return readScene(card);
	} finally {
		section.classList.toggle('dark', was.dark);
		section.classList.toggle('light', was.light);
		hush.remove();
	}
}

/**
 * The verdict for slide `slideNumber` (1-based), or null when it cannot be measured or is not a
 * slide whose text sits on the photo. Only a spotlight card puts the theme's ink over the picture (`clean`, `split`
 * and `gallery` set text beside it, and a statement's ink is fixed white on a scrim); a card at full backing has the
 * theme's own contrast, so the measure covers whatever the card lets through.
 */
export async function readPhotoContrast(slideNumber: number, heading: string | null, photoRef: string | null, classes: string[] | null): Promise<PhotoRead | null> {
	try {
		const doc = previewDocument();
		if (!doc) return null;
		const sections = doc.querySelectorAll<HTMLElement>('section');
		const section = sections[slideNumber - 1] ?? sections[0];
		// Spotlight only. A statement's backing is the `.image-scrim` gradient, not a fill on the text box, and that
		// gradient is not modelled here, so reading it as "no backing" would flag statements whose scrim makes them read.
		if (!section || section.getAttribute('data-img-composition') !== 'spotlight') return null;
		if (!sameSlide(heading, section.querySelector('h1, h2')?.textContent ?? null)) return null;
		const panel = section.querySelector<HTMLElement>('.lattice-bg');
		const card = section.querySelector<HTMLElement>('.image-text');
		const url = /url\((['"]?)(.*?)\1\)/.exec(panel?.style.backgroundImage ?? '')?.[2];
		if (!panel || !card || !url || !photoMatches(photoRef, url)) return null;
		// The preview can still be showing the OLD render of this slide right after an edit.
		if (classes?.some((c) => (CARD_CLASS.test(c) || c === 'dark' || c === 'light') && !section.classList.contains(c))) return null;

		// Measure everything the page owns before the first await: an edit replaces the section.
		const box = boxInSection(section, card);
		const now = readScene(card);
		if (!box || !now) return null;
		const pins: Record<string, Scene | undefined> = {};
		for (const pin of ['dark', 'light'] as const) {
			if (section.classList.contains(pin)) continue;
			pins[pin] = readPinned(section, card, pin) ?? undefined;
		}
		const photo: Rgb | null = await meanUnderBox(url, section.offsetWidth, section.offsetHeight, box);
		if (!photo) return null;

		const verdict = judge({ photo, ...now, pins });
		if (!verdict.low) return null;
		return { ratio: verdict.ratio, floor: verdict.floor, fix: verdict.fix, fixRatio: verdict.fixRatio, message: describe(verdict) };
	} catch {
		return null;
	}
}
