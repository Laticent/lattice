import { compositionOf, effectiveCard, needsInk } from '../../../../lib/core/card-ink.mjs';
import { describe, fixLabel, inkScenes, judge, SOLID, strongestScrim, TEXT_FLOOR } from '../../../../lib/core/photo-contrast.mjs';
import { headingOf, photoRefOf } from './card-ink-pick';
import { boxInSection, CARD_CLASS, meanUnderBox, photoMatches, previewDocument, sameSlide } from './card-ink-sampler';
import { cachedFix, cardOf, estimateMean, hasBodyText, keepFix, photoUrl } from './photo-ink-read';
import { getClassTokens, setClassTokens } from './slide-directives';
import { deckImageCardClasses, setImageCard } from './slide-provenance';

// THE PHOTO VERDICT: the one answer the Coach and the editor show for the text on a slide's photo. Both views render
// the object `readVerdict` returns, with its message and its one fix button, so they cannot disagree (owner, 2026-10-28:
// "a shared core spine so there is little room for discrepancy between the editor warning and the coach").
//   - The Coach's `photo-contrast` finding (coach/photo-contrast-watch.ts) and the editor's measured `photo-contrast`
//     underline show it for the slide on screen when the text falls under 4.5:1.
//   - The editor's `thin-card-no-ink` tooltip (thin-card-fix.ts) shows its fix, and its message once measured.
// The arithmetic and the policy (which fix, in which order, how it is worded) are the kernel's,
// lib/core/photo-contrast.mjs. This file only reads the page, or the photo file when the slide is not on screen, and
// makes the one edit a fix stands for (`applyFix`).
//
// Every step can come back empty (no preview, a preview still showing another slide, a photo the browser cannot read),
// and an empty answer is `null`. Silence means "could not measure", not "passes", and neither view claims otherwise.

/** A fix both views can offer: a slide pin, a card ink, or a solid card. */
export type Fix = 'dark' | 'light' | 'ink-light' | 'ink-dark' | 'solid';
export type PhotoVerdict = {
	/** The text falls under the floor. Null ratio (an estimate) means the current ink is not known. */
	low: boolean;
	ratio: number | null;
	floor: number;
	fix: Fix | null;
	fixRatio: number | null;
	message: string;
	/** The fix button's label (`fixLabel`), carried so a view need not load the kernel to say it. */
	label: string | null;
	/** `live`: measured on the painted slide. `estimate`: from the photo file, the slide not on screen. */
	src: 'live' | 'estimate';
};
export { fixLabel };

/**
 * What the slide's own classes say about its card, for the policy: the composition (the live read passes the one the preview
 * resolved; the slide's own word otherwise), its backing, whether lint's `thin-card-no-ink` flags it (`inkFirst`, always
 * from the slide's NAMED composition, as lint reads it), and whether it has body text under the heading (the estimate then
 * judges the lighter body ink too).
 */
export function cardPolicy(chunk: string, source: string, composition?: string | null) {
	const tokens = getClassTokens(chunk);
	const deck = deckImageCardClasses(source);
	const named = compositionOf(tokens);
	const comp = composition ?? named ?? 'spotlight';
	return {
		composition: comp,
		backing: effectiveCard(tokens, deck).backing,
		// Lint's own question, on the composition the slide NAMES: ink first exactly where `thin-card-no-ink` shows, never on a
		// card lint cannot see (an unnamed composition the engine resolves to spotlight from the photo's shape).
		inkFirst: needsInk(tokens, deck, named ?? undefined),
		solidReads: comp === 'spotlight',
		body: hasBodyText(chunk),
	};
}

type Pin = Exclude<Fix, 'solid'>;

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
 * Heading and the first paragraph or list row of the card: the text a viewer reads first. On a statement all three take
 * the fixed card ink its scrim is paired with, so the strongest scrim is an upper bound for each.
 */
function inkTargets(card: HTMLElement): HTMLElement[] {
	return ['h1, h2', 'p', 'li'].map((sel) => card.querySelector<HTMLElement>(sel)).filter((el): el is HTMLElement => !!el && !!el.textContent?.trim());
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
function readScene(card: HTMLElement, scrim: HTMLElement | null = null): Scene | null {
	const view = card.ownerDocument.defaultView;
	if (!view) return null;
	const fill = scrim ? scrimBacking(scrim) : rgba(view.getComputedStyle(card).backgroundColor);
	const ink = inkTargets(card).map((el) => rgba(view.getComputedStyle(el).color));
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
		const scene = readScene(card);
		// A statement's fix is judged with its scrim OFF (the card the text box reads is transparent): the scrim may be thin
		// where the words are, so a fix is offered only if it clears with no help from it.
		return scene && statement ? { card: null, ink: scene.ink } : scene;
	} finally {
		for (const [c, on] of was) section.classList.toggle(c, on);
		hush.remove();
	}
}

/**
 * The verdict for the slide on screen, measured on the painted page, or null when it cannot be measured or is not a slide
 * whose text sits on the photo: a spotlight card, or a statement's words on its scrim (`clean`, `split` and `gallery` set
 * text beside the picture). A statement is judged against its scrim at its strongest (see `strongestScrim`), so it is
 * flagged only when its words fail even there, which `card-clear` (no scrim at all) makes exact.
 */
async function readLive(chunk: string, source: string, slideNumber: number): Promise<PhotoVerdict | null> {
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
		if (!sameSlide(headingOf(chunk), section.querySelector('h1, h2')?.textContent ?? null)) return null;
		const panel = section.querySelector<HTMLElement>('.lattice-bg');
		const card = section.querySelector<HTMLElement>('.image-text');
		const url = /url\((['"]?)(.*?)\1\)/.exec(panel?.style.backgroundImage ?? '')?.[2];
		if (!panel || !card || !url || !photoMatches(photoRefOf(chunk), url)) return null;
		// The preview can still be showing the OLD render of this slide right after an edit.
		if (getClassTokens(chunk).some((c) => (CARD_CLASS.test(c) || c === 'dark' || c === 'light') && !section.classList.contains(c))) return null;

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

		const policy = cardPolicy(chunk, source, composition);
		const v = judge({ photo, ...now, pins }, { inkFirst: policy.inkFirst, wantFix: policy.inkFirst, solidReads: policy.solidReads });
		// Against a scrim that paints anything the ratio is a ceiling, and the message says so.
		const atMost = statement && !!now.card;
		return { low: v.low, ratio: v.ratio, floor: v.floor, fix: v.fix as Fix | null, fixRatio: v.fixRatio, message: describe({ ...v, atMost }), label: v.fix ? fixLabel(v.fix) : null, src: 'live' };
	} catch {
		return null;
	}
}

/**
 * The verdict for a slide the preview is NOT showing, estimated from the photo file: only for a card lint flags, which is
 * the only photo warning the editor shows off screen. The current ink is not known (it is the theme's, on a page that is
 * not painted), so it names the fix and has no ratio.
 */
async function readEstimate(chunk: string, source: string): Promise<PhotoVerdict | null> {
	const policy = cardPolicy(chunk, source);
	if (!policy.inkFirst) return null;
	const { ref, ...rest } = cardOf(chunk, source);
	if (!ref) return null;
	const card = { ref, ...rest };
	const kept = cachedFix(card);
	let fix: Fix | null;
	let fixRatio: number | null;
	if (kept) ({ fix, ratio: fixRatio } = kept);
	else {
		const url = await photoUrl(ref).catch(() => null);
		const mean = url ? await estimateMean(url, card.placement) : null;
		if (!mean) return null;
		const scenes = inkScenes(policy.composition as 'spotlight' | 'statement', policy.backing, policy.body);
		const v = judge({ photo: mean, ink: null, pins: scenes }, { inkFirst: true, solidReads: policy.solidReads });
		fix = v.fix as Fix | null;
		fixRatio = v.fixRatio;
		keepFix(card, fix, fixRatio, 'estimate');
	}
	const v = { low: true, ratio: null, floor: TEXT_FLOOR, fix, fixRatio };
	return { ...v, message: describe({ ...v, estimate: true }), label: fix ? fixLabel(fix) : null, src: 'estimate' };
}

/**
 * THE ONE ENTRY: the verdict for slide `slideIndex` (0-based, front matter not counted). `onScreen`: the live preview
 * shows this slide, so it is measured; otherwise the photo file gives an estimate. A live verdict for a card lint flags is
 * kept, so the next off-screen read (and the next page load) gets the measured fix rather than an estimate. `liveOnly`:
 * no estimate when the measure fails. Never throws.
 */
export async function readVerdict(chunk: string, source: string, slideIndex: number, onScreen: boolean, liveOnly = false): Promise<PhotoVerdict | null> {
	if (!photoRefOf(chunk)) return null;
	if (onScreen) {
		const live = await readLive(chunk, source, slideIndex + 1);
		if (live) {
			const { ref, ...rest } = cardOf(chunk, source);
			if (ref && cardPolicy(chunk, source).inkFirst) keepFix({ ref, ...rest }, live.fix, live.fixRatio, 'live');
			return live;
		}
		// The watch wants the measured answer or none: an estimate would load the photo again only to be thrown away.
		if (liveOnly) return null;
	}
	return readEstimate(chunk, source).catch(() => null);
}

/** The slide with `fix` applied: the one edit both views make, so a fix means the same thing wherever it is clicked. */
export function applyFix(chunk: string, fix: Fix): string {
	if (fix === 'ink-light' || fix === 'ink-dark') return setImageCard(chunk, 'ink', fix.slice(4));
	if (fix === SOLID) return setImageCard(chunk, 'backing', 'solid');
	return setClassTokens(chunk, [...getClassTokens(chunk).filter((t) => t !== 'dark' && t !== 'light'), fix]);
}
