// Canonical slide-size → aspect-ratio map. SINGLE SOURCE OF TRUTH shared by the running
// app (StudioShell's `previewRatio`) AND the pre-hydration instant shell (the `studio.astro`
// seed, which injects these values into its inline script). Slides have an author-chosen
// size — the skeleton must honor it, never assume 16:9. Mirrors the @size table in
// lib/_theme.css. `4k` is 16:9 (a resolution, not a shape).
export const SIZE_RATIO: Record<string, [number, number]> = {
	'16:9': [16, 9],
	hd: [16, 9],
	'4k': [16, 9],
	'4K': [16, 9],
	standard: [4, 3],
	'4:3': [4, 3],
	square: [1, 1],
	'1:1': [1, 1],
	portrait: [4, 5],
	'4:5': [4, 5],
	story: [9, 16],
	'9:16': [9, 16],
	reel: [9, 16],
	mobile: [1080, 2340],
};

// [16,9] is the engine's OWN default when a deck names no size (matches the app's
// `getFrontMatter(source,'size') || '16:9'`) — a documented fallback, not an assumption
// imposed on a deck whose size IS known.
export function sizeRatio(size: string): [number, number] {
	return SIZE_RATIO[size] ?? SIZE_RATIO[(size || '').toLowerCase()] ?? [16, 9];
}

// Read the `size:` directive from a deck source's leading `---` front-matter block. A
// self-contained reader (no parser import) so the exact same logic can be inlined into the
// pre-paint seed script, which can't import modules. Returns '' when unset.
export function sizeFromSource(source: string): string {
	const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(source ?? ''));
	if (!fm) return '';
	const m = /(?:^|\n)[ \t]*size[ \t]*:[ \t]*(.+?)[ \t]*$/.exec(fm[1]);
	return m ? m[1].replace(/^['"]|['"]$/g, '').trim() : '';
}

// The aspect ratio a deck source will render at (its chosen size, or the engine default).
export function deckRatio(source: string): [number, number] {
	return sizeRatio(sizeFromSource(source));
}
