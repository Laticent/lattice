// The deck-level axis tables the Studio reads at startup: `backdrop:`, `tag:` and `image-card:`, their
// deck-line readers and writers, and the image-card class helpers the photo tools use. Split out of
// slide-provenance.ts so the Studio's first load does not carry the slide drawer's provenance code:
// slide-provenance.ts is imported eagerly only through these, and SlideContext (lazy) takes the rest.
// slide-provenance.ts re-exports everything here, so its importers are unchanged.

import { getFrontMatter } from '../../lib/front-matter';
import { getClassTokens, setClassTokens } from '../../lib/slide-directives';

// ── backdrop (restraint over any finish) ─────────────────────────────────────────────────────
// Mirrors lib/core/resolve-backdrop.js, which the docs build cannot import (CJS). Two axes on
// ONE deck line (`backdrop: 40 clear`), each overridden per slide by its own `backdrop-*` token;
// a slide token evicts the deck's on that axis only. `no-backdrop` is the no-finish alias,
// never a register token, so it is not in either list.
export const BACKDROP_STRENGTHS = ['20', '40', '60', '80', 'full'] as const;
export const BACKDROP_SPOTS = ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'] as const;
// Order mirrors lib/core/resolve-backdrop.js BACKDROP_MASK_NAMES: the keep-outs come last.
export const BACKDROP_MASKS = ['clear', 'open', ...BACKDROP_SPOTS.map((p) => `spot-${p}`), 'clear-footer', 'clear-hero'] as const;
export type BackdropAxis = 'strength' | 'mask';
export const backdropValues = (axis: BackdropAxis): readonly string[] => (axis === 'strength' ? BACKDROP_STRENGTHS : BACKDROP_MASKS);

/** The deck's `backdrop:` value split onto its two axes (first recognized word per axis). */
export function deckBackdrop(source: string): { strength?: string; mask?: string } {
	const raw = (getFrontMatter(source, 'backdrop') || '').replace(/\s#.*$/, '').trim().toLowerCase();
	const out: { strength?: string; mask?: string } = {};
	for (const w of raw.split(/[\s,]+/).filter(Boolean)) {
		const word = w.endsWith('%') ? w.slice(0, -1) : w;
		if (!out.strength && (BACKDROP_STRENGTHS as readonly string[]).includes(word)) out.strength = word;
		else if (!out.mask && (BACKDROP_MASKS as readonly string[]).includes(word)) out.mask = word;
	}
	return out;
}

/** Write the deck line from its two axes; both empty removes the key. */
export function backdropDeckValue(strength?: string | null, mask?: string | null): string | null {
	const v = [strength, mask].filter(Boolean).join(' ');
	return v || null;
}

// ── card tag (the `tag:` register) ──────────────────────────────────────────────────────────
// Mirrors lib/core/resolve-card-tag.js, which the docs build cannot import (CJS); a unit test pins
// the lists to it. Four axes on ONE deck line (`tag: plain band center`), each overridden per
// slide by its own `tag-*` token; a slide token evicts the deck's on that axis only. `banner-tag`
// is the band placement's older name and is left alone here (the drawer writes `tag-band`).
export const CARD_TAG_AXES = {
	color: ['color', 'plain', 'bare'],
	size: ['small', 'regular', 'large'],
	placement: ['corner', 'foot', 'notch', 'band', 'inline'],
	align: ['start', 'center', 'end'],
} as const;
export type CardTagAxis = keyof typeof CARD_TAG_AXES;
export const CARD_TAG_AXIS_ORDER: readonly CardTagAxis[] = ['color', 'size', 'placement', 'align'];
/** The layouts that draw a card tag — the drawer shows the Tag rows only on these. */
export const CARD_TAG_LAYOUTS = ['cards-grid', 'cards-stack', 'decision', 'compare-prose', 'split-compare', 'list-steps'] as const;
export const cardTagValues = (axis: CardTagAxis): readonly string[] => CARD_TAG_AXES[axis];

/** The deck's `tag:` value split onto its four axes (first recognized word per axis). */
export function deckCardTag(source: string): Partial<Record<CardTagAxis, string>> {
	const raw = (getFrontMatter(source, 'tag') || '').replace(/\s#.*$/, '').trim().toLowerCase();
	const out: Partial<Record<CardTagAxis, string>> = {};
	for (const word of raw.split(/[\s,]+/).filter(Boolean)) {
		const axis = CARD_TAG_AXIS_ORDER.find((a) => cardTagValues(a).includes(word));
		if (axis && !out[axis]) out[axis] = word;
	}
	return out;
}

/** Write the deck line from its axes, in axis order; all empty removes the key. */
export function cardTagDeckValue(parts: Partial<Record<CardTagAxis, string | null | undefined>>): string | null {
	const v = CARD_TAG_AXIS_ORDER.map((a) => parts[a]).filter(Boolean).join(' ');
	return v || null;
}

// ── image card (the `image-card:` register) ─────────────────────────────────────────────────
// Mirrors lib/core/resolve-image-card.js, which the docs build cannot import (CJS); a unit test
// pins the maps to it. Six axes on ONE deck line (`image-card: top-right soft sm`). Unlike
// `tag:`, the deck WORD and the slide CLASS differ (`top-right` ↔ `at-tr`), so each axis maps
// word → class. A slide class evicts the deck's word on its axis only, on image slides only.
export const IMAGE_CARD_AXES = {
	placement: {
		'bottom-left': 'at-bl', bottom: 'at-bottom', 'bottom-right': 'at-br', center: 'at-center',
		'top-left': 'at-tl', top: 'at-top', 'top-right': 'at-tr',
	},
	// The four named levels, then every other 5% step as a percent word (`65%` → `card-o65`).
	backing: {
		solid: 'card-solid', soft: 'card-soft', sheer: 'card-sheer', clear: 'card-clear',
		...Object.fromEntries([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 65, 70, 75, 85, 90, 95].map((n) => [`${n}%`, `card-o${n}`])),
	},
	ink: { light: 'ink-light', dark: 'ink-dark' },
	size: { md: 'card-md', sm: 'card-sm', lg: 'card-lg' },
	density: { regular: 'card-regular', compact: 'compact' },
	shape: { float: 'card-float', band: 'band' },
} as const;
export type ImageCardAxis = keyof typeof IMAGE_CARD_AXES;
export const IMAGE_CARD_AXIS_ORDER: readonly ImageCardAxis[] = ['placement', 'backing', 'ink', 'size', 'density', 'shape'];
/** The words of one axis, in the kernel's order (the first is the default). */
export const imageCardWords = (axis: ImageCardAxis): string[] => Object.keys(IMAGE_CARD_AXES[axis]);
export const imageCardClass = (axis: ImageCardAxis, word: string): string | undefined =>
	(IMAGE_CARD_AXES[axis] as Record<string, string>)[word];
export const imageCardWordOf = (axis: ImageCardAxis, cls: string): string | undefined =>
	imageCardWords(axis).find((w) => imageCardClass(axis, w) === cls);

/** The deck's `image-card:` value split onto its five axes (first recognized word per axis). */
export function deckImageCard(source: string): Partial<Record<ImageCardAxis, string>> {
	const raw = (getFrontMatter(source, 'image-card') || '').replace(/\s#.*$/, '').trim().toLowerCase();
	const out: Partial<Record<ImageCardAxis, string>> = {};
	for (const word of raw.split(/[\s,]+/).filter(Boolean)) {
		const axis = IMAGE_CARD_AXIS_ORDER.find((a) => imageCardWords(a).includes(word));
		if (axis && !out[axis]) out[axis] = word;
	}
	return out;
}

/** Write the deck line from its axes, in axis order; all empty removes the key. */
export function imageCardDeckValue(parts: Partial<Record<ImageCardAxis, string | null | undefined>>): string | null {
	const v = IMAGE_CARD_AXIS_ORDER.map((a) => parts[a]).filter(Boolean).join(' ');
	return v || null;
}

/** Set one axis on the slide by its deck word; `null` clears it so the slide follows the deck. */
export function setImageCard(chunk: string, axis: ImageCardAxis, word: string | null): string {
	const classes = new Set(Object.values(IMAGE_CARD_AXES[axis]) as string[]);
	const kept = getClassTokens(chunk).filter((t) => !classes.has(t));
	const cls = word ? imageCardClass(axis, word) : undefined;
	if (cls) kept.push(cls);
	return setClassTokens(chunk, kept);
}

/** The classes the deck's `image-card:` line stamps on an image slide (each word as its class). */
export function deckImageCardClasses(source: string): string[] {
	const deck = deckImageCard(source);
	return (Object.keys(deck) as ImageCardAxis[]).flatMap((axis) => {
		const cls = imageCardClass(axis, deck[axis] as string);
		return cls ? [cls] : [];
	});
}
