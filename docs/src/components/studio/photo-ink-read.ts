import { compositionOf, coverSourceRect, effectiveCard, meanRgb } from '../../../../lib/core/card-ink.mjs';
import { photoRefOf } from './card-ink-pick';
import { ensureAssetUrls } from './media-urls';
import { getClassTokens } from './slide-directives';
import { deckImageCardClasses } from './slide-provenance';

// The photo-file half of the photo verdict (photo-verdict.ts): for a slide the preview is not showing, the photo's mean
// color over the part of the frame the card's placement covers, and the fix found for it, kept in the browser so a reload
// does not ask again. An estimate, but it does not need the preview, which on a phone's Source tab can be showing another
// slide. Best effort by design: a photo the browser cannot load or read (a relative path, a cross-origin web image) has
// no answer, and the editor tooltip then says so and offers a solid card, which always reads on a spotlight.

const SAMPLE_PX = 24;
const LOAD_MS = 4000;
/** The cache's storage key; the version moves when the estimate or its inputs change meaning. */
const CACHE_KEY = 'lattice-photo-ink:v3';
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

/** Where an answer came from: the live preview's measured slide, or an estimate from the photo file. */
export type ReadSource = 'live' | 'estimate';
/** A kept fix: an ink, or a solid card when no ink reads. A slide lint flags never gets a pin (photo-contrast.mjs `fixOrder`). */
export type KeptFix = 'ink-light' | 'ink-dark' | 'solid' | null;
type Cached = { fix: KeptFix; ratio: number | null; at: number; src: ReadSource };
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
const FIXES = new Set(['ink-light', 'ink-dark', 'solid']);

function cacheRead(): Record<string, Cached> {
	try {
		return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') ?? {};
	} catch {
		return {};
	}
}

/**
 * The kept fix for this photo and card, its ratio and where it came from, or undefined. Synchronous, so a known answer
 * shows on the tooltip's first frame. An entry past its week, or one this version did not write, is no answer.
 */
export function cachedFix(c: CardBox): { fix: KeptFix; ratio: number | null; src: ReadSource } | undefined {
	const hit = cacheRead()[cacheKey(c)];
	if (!hit || Date.now() - hit.at > CACHE_TTL_MS) return undefined;
	if (hit.fix !== null && !FIXES.has(hit.fix)) return undefined;
	return { fix: hit.fix, ratio: typeof hit.ratio === 'number' ? hit.ratio : null, src: hit.src === 'live' ? 'live' : 'estimate' };
}

/** Keep a found fix. A pin is not kept (a slide lint flags is never offered one). */
export function keepFix(c: CardBox, fix: string | null, ratio: number | null, src: ReadSource): void {
	if ((fix !== null && !FIXES.has(fix)) || !keepable(c.ref)) return;
	try {
		const all = cacheRead();
		const was = all[cacheKey(c)];
		// The same answer again (the watch re-reads on every pause): leave the store alone, unless it is due to expire soon.
		if (was && was.fix === fix && was.ratio === ratio && was.src === src && Date.now() - was.at < CACHE_TTL_MS / 2) return;
		all[cacheKey(c)] = { fix: fix as KeptFix, ratio, at: Date.now(), src };
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
export async function estimateMean(url: string, placement: string): Promise<number[] | null> {
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

/** Whether the slide has text under its heading (a paragraph, a list row): its ink is lighter, so a fix is judged on it too. */
export function hasBodyText(chunk: string): boolean {
	return /^(?![ \t]*(?:#|<!--|!\[|$)).*\S/m.test(chunk);
}

/** What the estimate needs to know about a slide before it reads anything: its photo, the card's place, opacity and shape. */
export function cardOf(chunk: string, source: string): Omit<CardBox, 'ref'> & { ref: string | null } {
	const tokens = getClassTokens(chunk);
	const deck = deckImageCardClasses(source);
	// The composition the slide names and whether it has body text change the scenes a fix is judged on, so they key it too.
	const body = hasBodyText(chunk) ? 'body' : 'heading';
	const shape = [...[...deck, ...tokens].filter((c) => BOX_CLASSES.test(c)).sort(), compositionOf(tokens) ?? 'auto', body].join(' ');
	return { ref: photoRefOf(chunk), placement: placementOf(tokens, deck), backing: effectiveCard(tokens, deck).backing, shape };
}
