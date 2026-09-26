// ── POSTERS: A PREVIEW TILE RENDERED ONCE, THEN SHOWN AS AN IMAGE ──────────────────
//
// WHY. A pooled preview frame (studio/preview-pool.tsx) is never torn down while its grid
// is open, which stopped WebKit keeping a document per tile SCROLLED past. It did nothing
// for a surface that CLOSES: the pool goes with the grid, and WebKit never gives a closed
// preview document back. Measured on real WebKit, 6 open/close cycles each:
//
//   Add slide dialog   +169 → +219 → +271 → +371 → +391 → +367 MB   (9 frames per open)
//   deck panel         +128 → +132 → +161 → +185 → +246 → +276 MB   (5 frames per open)
//   Chromium, same     flat, −16 to +18 MB
//
// Keeping the frames alive across a close is not available: WebKit has no state-preserving
// DOM move (`moveBefore` — Chromium only), so a parked frame reloads, and a force-mounted
// Radix modal hides the whole Studio from assistive tech while "closed". So a tile that has
// rendered once keeps an IMAGE of itself, and the next open shows the image and asks the
// pool for no frame at all. engineering/decisions/2026-09-13-gallery-preview-memory.md §5
// designed this; engineering/decisions/2026-09-26-render-drift-and-unclosed-comments.md §5
// records what shipped.
//
// IN MEMORY ONLY, for the page's life. The engine, runtime and theme URLs are content-hashed
// and part of the key, so nothing a poster depends on can change under it within a session,
// and there is no cross-session staleness to reason about.

import type { PooledPreviewProps } from '@/components/studio/preview-pool';

/** How many posters are kept. Each is a small WebP (2–11 KB measured at thumbnail size), so
 *  this bounds memory at about a megabyte while covering the whole add-slide catalog, a deck's
 *  overview and the preset tiles together. */
export const POSTER_CAP = 240;

/** Posters are captured at a width bucket so one image serves every tile of about that size. */
export const POSTER_WIDTH_STEP = 160;

/**
 * Everything the rendered pixels depend on. `PooledPreviewProps` is plain data (strings,
 * booleans, a string array), so JSON is a faithful key. The host's `data-palette` /
 * `data-mode` are added because `single-slide-render` falls back to them when the tile names
 * no override — a key without them would hand a light poster to a dark Studio.
 */
export function posterKey(props: PooledPreviewProps, width: number): string {
	const root = typeof document === 'undefined' ? null : document.documentElement;
	const host = root ? `${root.getAttribute('data-palette') || ''}|${root.getAttribute('data-mode') || ''}` : '';
	return `${width}|${host}|${JSON.stringify(props)}`;
}

/**
 * A tile's LAYOUT width. `offsetWidth` ignores transforms, and that is the point: a dialog opens
 * with a zoom animation, and a box measured mid-animation by `getBoundingClientRect` read ~5%
 * narrower — at 2x that crossed a width bucket, so every capture was filed under 640 and every tile
 * looked for 480, and no poster was ever found (measured: 10 frames on reopen, 0 posters). The
 * rect is the fallback only where layout reports nothing (jsdom).
 */
export function tileWidth(el: HTMLElement): number {
	return el.offsetWidth || el.getBoundingClientRect().width;
}

/** The capture width for a tile `cssWidth` px wide at the current device pixel ratio. */
export function posterWidth(cssWidth: number): number {
	const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
	const want = Math.max(1, Math.ceil((cssWidth * dpr) / POSTER_WIDTH_STEP)) * POSTER_WIDTH_STEP;
	return Math.min(1280, want);
}

const posters = new Map<string, Blob>();
const listeners = new Set<() => void>();
let version = 0;

export function getPoster(key: string): Blob | undefined {
	const b = posters.get(key);
	if (b) {
		// Least-recently-USED: a read moves the entry to the young end.
		posters.delete(key);
		posters.set(key, b);
	}
	return b;
}

export function hasPoster(key: string): boolean {
	return posters.has(key);
}

export function putPoster(key: string, blob: Blob): void {
	posters.delete(key);
	posters.set(key, blob);
	while (posters.size > POSTER_CAP) {
		const oldest = posters.keys().next().value as string;
		posters.delete(oldest);
	}
	version++;
	for (const l of listeners) l();
}

/** `useSyncExternalStore` plumbing: a tile re-renders when a poster lands. */
export function subscribePosters(l: () => void): () => void {
	listeners.add(l);
	return () => listeners.delete(l);
}
export function postersVersion(): number {
	return version;
}

/** Tests only. */
export function _clearPosters(): void {
	posters.clear();
	version++;
	for (const l of listeners) l();
}
