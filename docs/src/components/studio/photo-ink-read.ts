import { coverSourceRect, effectiveCard, meanRgb, pickCardInk } from '../../../../lib/core/card-ink.mjs';
import { photoRefOf, readBehindCard } from './card-ink-pick';
import { ensureAssetUrls } from './media-urls';
import { getClassTokens } from './slide-directives';
import { deckImageCardClasses } from './slide-provenance';

// The photo read behind the `thin-card-no-ink` tooltip, kept apart from the warning. Lint flags a thin card at once and
// knows nothing about the picture; this runs when the tooltip opens and answers ONE question: which ink, if either, reads on
// the photo behind the card. It tries, in order:
//   1. the answer already found for this photo and card (kept in the browser, so a reload does not ask again);
//   2. the live preview, when it shows this slide: the exact box the card occupies (card-ink-sampler.ts);
//   3. the photo itself, loaded from its reference, averaged over the part of the frame the card's placement covers. An
//      estimate, but it does not need the preview, which on a phone's Source tab can be showing another slide.
// Best effort by design: a photo the browser cannot load or read (a relative path, a cross-origin web image) has no answer,
// and neither does a photo where neither ink clears 4.5:1. The tooltip then says so and offers a solid card, which always reads.

export type InkVerdict = { kind: 'ink'; ink: 'light' | 'dark' } | { kind: 'neither' } | { kind: 'unknown' };

/** WCAG AA, the floor every other contrast check here uses. */
const FLOOR = 4.5;
const SAMPLE_PX = 24;
const LOAD_MS = 4000;
/** The cache's storage key; the version moves when the estimate or its inputs change meaning. */
const CACHE_KEY = 'lattice-photo-ink:v2';
const CACHE_MAX = 200;
/** A kept answer is trusted for a week: an `asset:` name or a web URL can come to hold a different photo. */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** The card classes that move the card's box over the photo, so they are part of the kept answer's key. */
const BOX_CLASSES = /^(card-sm|card-lg|band|compact)$/;

/** Where the card sits in the frame for each placement, as fractions of the slide: [left, top, right, bottom]. */
const PLACEMENT_BOX: Record<string, [number, number, number, number]> = {
	'at-tl': [0.04, 0.06, 0.52, 0.46],
	'at-top': [0.26, 0.06, 0.74, 0.46],
	'at-tr': [0.48, 0.06, 0.96, 0.46],
	'at-center': [0.26, 0.3, 0.74, 0.7],
	'at-bl': [0.04, 0.54, 0.52, 0.94],
	'at-bottom': [0.26, 0.54, 0.74, 0.94],
	'at-br': [0.48, 0.54, 0.96, 0.94],
};
const DEFAULT_PLACEMENT = 'at-bl';

/** The card's placement class for a slide: its own, else the deck's `image-card:` word, else bottom-left. */
export function placementOf(classes: string[], deckClasses: string[]): string {
	const own = [...classes].reverse().find((c) => c in PLACEMENT_BOX);
	return own ?? [...deckClasses].reverse().find((c) => c in PLACEMENT_BOX) ?? DEFAULT_PLACEMENT;
}

/** The ink that reads on a photo whose color behind a card `backing` percent opaque averages `mean`, or neither. */
export function decide(mean: number[], backing: number): InkVerdict {
	const r = pickCardInk(mean, backing);
	const best = Math.max(r.light, r.dark);
	return best >= FLOOR ? { kind: 'ink', ink: r.ink } : { kind: 'neither' };
}

/** Where an answer came from: the live preview's exact card box, or an estimate from the photo file. */
export type ReadSource = 'live' | 'estimate';
type Cached = { ink: 'light' | 'dark' | null; at: number; src: ReadSource };
export type CardBox = { ref: string; placement: string; backing: number; shape: string };

/** FNV-1a, so a `data:` photo is keyed by 8 hex digits rather than by its whole payload. */
function hashRef(ref: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < ref.length; i++) h = Math.imul(h ^ ref.charCodeAt(i), 0x01000193);
	return `${(h >>> 0).toString(16).padStart(8, '0')}:${ref.length}`;
}
const cacheKey = (c: CardBox) => `${hashRef(c.ref)}|${c.placement}|${c.backing}|${c.shape}`;
/** A `blob:` URL names one page's object and changes on every load, so an answer for it is never seen again. */
const keepable = (ref: string) => !/^blob:/i.test(ref.trim());

function cacheRead(): Record<string, Cached> {
	try {
		return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') ?? {};
	} catch {
		return {};
	}
}

/**
 * The kept answer for this photo and card, and where it came from, or undefined. Synchronous, so a known answer shows on
 * the tooltip's first frame. An entry past its week, or one this version did not write, is no answer.
 */
export function cachedVerdict(c: CardBox): { verdict: InkVerdict; src: ReadSource } | undefined {
	const hit = cacheRead()[cacheKey(c)];
	if (!hit || Date.now() - hit.at > CACHE_TTL_MS) return undefined;
	if (hit.ink !== null && hit.ink !== 'light' && hit.ink !== 'dark') return undefined;
	return { verdict: hit.ink ? { kind: 'ink', ink: hit.ink } : { kind: 'neither' }, src: hit.src === 'live' ? 'live' : 'estimate' };
}

/** Keep a found answer. "Unknown" is not kept: the next open should try again (the photo may load then). */
export function keepVerdict(c: CardBox, v: InkVerdict, src: ReadSource): void {
	if (v.kind === 'unknown' || !keepable(c.ref)) return;
	try {
		const all = cacheRead();
		all[cacheKey(c)] = { ink: v.kind === 'ink' ? v.ink : null, at: Date.now(), src };
		const keys = Object.keys(all);
		// Oldest out first once full, so the store stays small however many photos a person tries.
		if (keys.length > CACHE_MAX) for (const k of keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - CACHE_MAX)) delete all[k];
		localStorage.setItem(CACHE_KEY, JSON.stringify(all));
	} catch {
		// Private mode or a full store: the answer just is not kept.
	}
}

/** The Studio page's sample folder, from the boot data it publishes (studio.astro), or null off the Studio. */
function samplesBase(): string | null {
	try {
		const boot = JSON.parse(document.querySelector('script[data-studio-boot]')?.textContent ?? 'null') as { themeBase?: string } | null;
		return boot?.themeBase ? new URL(boot.themeBase.replace(/themes\/$/, 'samples/'), location.href).href : null;
	} catch {
		return null;
	}
}

/** A URL the browser can load for a `![bg](ref)` destination, or null when this cannot resolve it (a relative path). */
export async function photoUrl(ref: string): Promise<string | null> {
	const r = ref.trim();
	if (r.startsWith('sample:')) {
		const base = samplesBase();
		return base ? new URL(r.slice('sample:'.length), base).href : null;
	}
	if (r.startsWith('asset:')) return (await ensureAssetUrls())[r.slice('asset:'.length)] ?? null;
	if (/^(https?:|data:|blob:)/i.test(r)) return r;
	return null;
}

function load(url: string): Promise<HTMLImageElement | null> {
	return new Promise((resolve) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		const t = setTimeout(() => resolve(null), LOAD_MS);
		img.onload = () => {
			clearTimeout(t);
			resolve(img);
		};
		img.onerror = () => {
			clearTimeout(t);
			resolve(null);
		};
		img.src = url;
	});
}

/** The photo's mean color over the card's part of a 16:9 frame, from the photo itself. Null when it will not load or read. */
async function estimateFromPhoto(url: string, placement: string): Promise<number[] | null> {
	const img = await load(url);
	if (!img) return null;
	const W = 1280;
	const H = 720;
	const [l, t, r, b] = PLACEMENT_BOX[placement] ?? PLACEMENT_BOX[DEFAULT_PLACEMENT];
	const box = { x: l * W, y: t * H, w: (r - l) * W, h: (b - t) * H };
	try {
		const canvas = document.createElement('canvas');
		canvas.width = SAMPLE_PX;
		canvas.height = SAMPLE_PX;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) return null;
		if (img.naturalWidth > 0 && img.naturalHeight > 0) {
			const src = coverSourceRect(img.naturalWidth, img.naturalHeight, W, H, box);
			if (!src) return null;
			ctx.drawImage(img, src.x, src.y, src.w, src.h, 0, 0, SAMPLE_PX, SAMPLE_PX);
		} else {
			// A vector photo with no intrinsic size stretches to whatever it is drawn at: draw the frame small, read the box.
			const k = 0.25;
			const full = document.createElement('canvas');
			full.width = W * k;
			full.height = H * k;
			full.getContext('2d')?.drawImage(img, 0, 0, full.width, full.height);
			ctx.drawImage(full, box.x * k, box.y * k, box.w * k, box.h * k, 0, 0, SAMPLE_PX, SAMPLE_PX);
		}
		return meanRgb(ctx.getImageData(0, 0, SAMPLE_PX, SAMPLE_PX).data);
	} catch {
		// A cross-origin photo taints the canvas and `getImageData` throws.
		return null;
	}
}

/** What the tooltip needs to know about a slide before it reads anything: its photo, the card's place, opacity and shape. */
export function cardOf(chunk: string, source: string): Omit<CardBox, 'ref'> & { ref: string | null } {
	const tokens = getClassTokens(chunk);
	const deck = deckImageCardClasses(source);
	const shape = [...deck, ...tokens].filter((c) => BOX_CLASSES.test(c)).sort().join(' ');
	return { ref: photoRefOf(chunk), placement: placementOf(tokens, deck), backing: effectiveCard(tokens, deck).backing, shape };
}

/**
 * Which ink reads on slide `slideIndex`'s photo (0-based, front matter not counted). `chunk` is that slide's text,
 * `onScreen` whether the live preview shows it (then its exact card box is used). Never throws.
 */
export async function readPhotoInk(chunk: string, source: string, slideIndex: number, onScreen: boolean): Promise<InkVerdict> {
	const { ref, ...rest } = cardOf(chunk, source);
	if (!ref) return { kind: 'unknown' };
	const card: CardBox = { ref, ...rest };
	const kept = cachedVerdict(card);
	// A kept live read is final. A kept estimate stands until the preview can measure the real card box, which then replaces it.
	if (kept && (kept.src === 'live' || !onScreen)) return kept.verdict;
	if (onScreen) {
		const live = await readBehindCard(chunk, slideIndex + 1).catch(() => null);
		if (live) {
			const verdict = decide(live, card.backing);
			keepVerdict(card, verdict, 'live');
			return verdict;
		}
		if (kept) return kept.verdict;
	}
	const url = await photoUrl(ref).catch(() => null);
	const mean = url ? await estimateFromPhoto(url, card.placement) : null;
	const verdict: InkVerdict = mean ? decide(mean, card.backing) : { kind: 'unknown' };
	keepVerdict(card, verdict, 'estimate');
	return verdict;
}

