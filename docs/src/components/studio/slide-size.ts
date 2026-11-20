// Canonical slide-size → aspect-ratio map. SINGLE SOURCE OF TRUTH shared by the running
// app (StudioShell's `previewRatio`, Present's frame) AND the pre-hydration instant shell (the
// `studio.astro` seed, which injects these values into its inline script). Slides have an
// author-chosen size — the skeleton must honor it, never assume 16:9.
//
// EXACTLY the engine's names (lib/core/sizes.js `SIZES`), matched exactly, because a name the
// engine does not register renders at 16:9: `size: 4:3`, `size: STORY` and `size: Square` all
// render 1280x720. This table used to accept all three (a `4:3` alias and a case-folding lookup),
// so the preview and Present drew a 4:3, 9:16 or square frame around a 16:9 slide and left an empty
// band beside it. `4k` is 16:9 (a resolution, not a shape). Pinned against the engine by
// slide-size.test.ts.
import { deckSizeOf } from '../../../../lib/core/screen-canvas.mjs';

export const SIZE_RATIO: Record<string, [number, number]> = {
	'16:9': [16, 9],
	hd: [16, 9],
	HD: [16, 9],
	'4k': [16, 9],
	'4K': [16, 9],
	standard: [4, 3],
	square: [1, 1],
	'1:1': [1, 1],
	portrait: [4, 5],
	'4:5': [4, 5],
	story: [9, 16],
	'9:16': [9, 16],
	reel: [9, 16],
	mobile: [1080, 2340],
	'mobile-landscape': [1560, 720],
	card: [7, 4],
	'card-iso': [17, 11],
};

// [16,9] is the engine's OWN default when a deck names no size (matches the app's
// `getFrontMatter(source,'size') || '16:9'`) — a documented fallback, not an assumption
// imposed on a deck whose size IS known.
export function sizeRatio(size: string): [number, number] {
	return Object.hasOwn(SIZE_RATIO, size) ? SIZE_RATIO[size] : [16, 9];
}

// Read the `size:` directive from a deck source's leading `---` front-matter block; '' when unset. The reader is the
// kernel's `deckSizeOf` (lib/core/screen-canvas.mjs), which the live renderer also uses; it stays a self-contained regex
// so the pre-paint seed script, which can't import modules, can mirror it by hand (studio.astro).
export function sizeFromSource(source: string): string {
	return deckSizeOf(source);
}

// The aspect ratio a deck source will render at (its chosen size, or the engine default).
export function deckRatio(source: string): [number, number] {
	return sizeRatio(sizeFromSource(source));
}

// How the preview's status strip names a ratio: "16 : 9", and "9 : 19.5" for the phone size,
// whose engine token is 1080 wide.
export function ratioText([w, h]: [number, number]): string {
	return w === 1080 ? '9 : 19.5' : `${w} : ${h}`;
}

// The status strip's deck caption, "16 : 9 · 7 slides". One function for the app and the
// pre-paint shell, so the shell's copy of the caption can never read differently from the app's.
export function deckCaption(ratio: [number, number], slides: number): string {
	return `${ratioText(ratio)} · ${slides} slide${slides === 1 ? '' : 's'}`;
}
