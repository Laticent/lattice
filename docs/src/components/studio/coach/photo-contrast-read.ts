import { describe, judge, strongestScrim } from '../../../../../lib/core/photo-contrast.mjs';
import { boxInSection, CARD_CLASS, meanUnderBox, photoMatches, previewDocument, sameSlide } from '../card-ink-sampler';

// The Coach's photo-contrast read: does the text on THIS slide's photo reach 4.5:1, measured in the
// live preview, and would pinning the slide dark or light fix it, or failing that, setting the card ink? The preview frame holds one slide
// at a time, so this answers for the slide on screen. The arithmetic is the kernel's
// (lib/core/photo-contrast.mjs); this file only reads the page: the photo behind the card, the
// card's fill, and the ink, each as the browser actually painted it. It never edits the deck.
//
// Every step can come back empty (no preview, a preview still showing another slide, a photo the
// browser cannot read), and an empty answer is `null`: no finding. Silence here means "could not
// measure", not "passes", and the panel does not claim otherwise.

/** A fix the finding can offer: a slide pin, or (when no pin clears) the card's ink class. */
export type Pin = 'dark' | 'light' | 'ink-light' | 'ink-dark';
export type PhotoRead = { ratio: number; floor: number; fix: Pin | null; fixRatio: number | null; message: string };

/** Each fix's class and the classes it replaces: a slide carries one pin and one ink at most. */
const GROUP: Record<Pin, readonly Pin[]> = { dark: ['dark', 'light'], light: ['dark', 'light'], 'ink-light': ['ink-light', 'ink-dark'], 'ink-dark': ['ink-light', 'ink-dark'] };

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

/**
 * Heading and the first paragraph or list row of the card: the text a viewer reads first. A statement colors only its
 * heading and paragraph (the fixed card ink its scrim is paired with); a list row there keeps the theme's ink, which the
 * scrim does not back, so judging it against the strongest scrim would not be an upper bound.
 */
function inkTargets(card: HTMLElement, statement: boolean): HTMLElement[] {
	return (statement ? ['h1, h2', 'p'] : ['h1, h2', 'p', 'li']).map((sel) => card.querySelector<HTMLElement>(sel)).filter((el): el is HTMLElement => !!el && !!el.textContent?.trim());
}

/** One gradient layer's color stops: computed colors carry no nested parentheses, so each is one `fn(...)`. */
const STOP = /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)/g;
const LAYER = /(?=(?:repeating-)?(?:linear|radial|conic)-gradient\()/;

/** A statement's `.image-scrim` at its strongest (the kernel's `strongestScrim`), or null when it paints nothing. */
function scrimBacking(scrim: HTMLElement): number[] | null {
	const image = scrim.ownerDocument.defaultView?.getComputedStyle(scrim).backgroundImage ?? 'none';
	const layers = image
		.split(LAYER)
		.filter((l) => l.includes('gradient('))
		.map((l) => (l.match(STOP) ?? []).map(rgba).filter((c): c is number[] => !!c));
	return strongestScrim(layers);
}

/** The scene on `card`: its fill, or for a statement (`scrim` given) the scrim at its strongest, and its ink. */
function readScene(card: HTMLElement, scrim: HTMLElement | null = null, statement = !!scrim): Scene | null {
	const view = card.ownerDocument.defaultView;
	if (!view) return null;
	const fill = scrim ? scrimBacking(scrim) : rgba(view.getComputedStyle(card).backgroundColor);
	const ink = inkTargets(card, statement).map((el) => rgba(view.getComputedStyle(el).color));
	if (!ink.length || ink.some((c) => !c)) return null;
	return { card: fill && fill[3] > 0 ? fill : null, ink: ink as number[][] };
}

/**
 * The scene as it would paint with `pin` on the section (a pin, or a card ink). Styles are read
 * synchronously inside one task (the browser paints nothing in between) with transitions off, since
 * a computed color read right after a class change would otherwise be the old one. Every class of
 * the fix's group is put back as it was.
 */
function readPinned(section: HTMLElement, card: HTMLElement, pin: Pin, statement: boolean): Scene | null {
	const doc = section.ownerDocument;
	const was = GROUP[pin].map((c) => [c, section.classList.contains(c)] as const);
	const hush = doc.createElement('style');
	hush.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
	doc.head.appendChild(hush);
	try {
		for (const c of GROUP[pin]) section.classList.toggle(c, c === pin);
		const scene = readScene(card, null, statement);
		// A statement's fix is judged with its scrim OFF (the card the text box reads is transparent): the scrim may be thin
		// where the words are, so a fix is offered only if it clears with no help from it.
		return scene && statement ? { card: null, ink: scene.ink } : scene;
	} finally {
		for (const [c, on] of was) section.classList.toggle(c, on);
		hush.remove();
	}
}

/**
 * The verdict for slide `slideNumber` (1-based), or null when it cannot be measured or is not a
 * slide whose text sits on the photo: a spotlight card, or a statement's words on its scrim (`clean`, `split` and
 * `gallery` set text beside the picture). A card at full backing has the theme's own contrast, so the measure covers
 * whatever the card lets through. A statement is judged against its scrim at its strongest (see `strongestScrim`), so
 * it is flagged only when its words fail even there, which `card-clear` (no scrim at all) makes exact.
 */
export async function readPhotoContrast(slideNumber: number, heading: string | null, photoRef: string | null, classes: string[] | null): Promise<PhotoRead | null> {
	try {
		const doc = previewDocument();
		if (!doc) return null;
		const sections = doc.querySelectorAll<HTMLElement>('section');
		const section = sections[slideNumber - 1] ?? sections[0];
		const composition = section?.getAttribute('data-img-composition');
		if (!section || (composition !== 'spotlight' && composition !== 'statement')) return null;
		const statement = composition === 'statement';
		// A statement's backing is the `.image-scrim` gradient, not a fill on the text box; without the node there is nothing to model.
		const scrim = statement ? section.querySelector<HTMLElement>('.image-scrim') : null;
		if (statement && !scrim) return null;
		if (!sameSlide(heading, section.querySelector('h1, h2')?.textContent ?? null)) return null;
		const panel = section.querySelector<HTMLElement>('.lattice-bg');
		const card = section.querySelector<HTMLElement>('.image-text');
		const url = /url\((['"]?)(.*?)\1\)/.exec(panel?.style.backgroundImage ?? '')?.[2];
		if (!panel || !card || !url || !photoMatches(photoRef, url)) return null;
		// The preview can still be showing the OLD render of this slide right after an edit.
		if (classes?.some((c) => (CARD_CLASS.test(c) || c === 'dark' || c === 'light') && !section.classList.contains(c))) return null;

		// Measure everything the page owns before the first await: an edit replaces the section.
		const box = boxInSection(section, card);
		const now = readScene(card, scrim);
		if (!box || !now) return null;
		const pins: Record<string, Scene | undefined> = {};
		for (const pin of ['dark', 'light', 'ink-light', 'ink-dark'] as const) {
			if (section.classList.contains(pin)) continue;
			pins[pin] = readPinned(section, card, pin, statement) ?? undefined;
		}
		const photo: Rgb | null = await meanUnderBox(url, section.offsetWidth, section.offsetHeight, box);
		if (!photo) return null;

		const verdict = judge({ photo, ...now, pins });
		if (!verdict.low) return null;
		// Against a scrim that paints anything the ratio is a ceiling, and the message says so.
		const atMost = statement && !!now.card;
		return { ratio: verdict.ratio, floor: verdict.floor, fix: verdict.fix, fixRatio: verdict.fixRatio, message: describe({ ...verdict, atMost }) };
	} catch {
		return null;
	}
}
