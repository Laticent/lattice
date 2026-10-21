// THE POSTER CACHE — still pictures of slides, kept so a map tile can show one without a live frame.
//
// Veduta's ladder has a rung between `live` (a pooled preview frame) and `wireframe` (a sketch read from the
// source): `poster`, a still image of the slide. The core only says which tiles may be posters (`budget.poster`,
// 0 by default); this cache is the connector half that holds them (audit §11o):
//
//   · CONTENT-ADDRESSED. A poster is keyed by what it shows (the slide's text and the look it was drawn in), not by
//     its index, so moving a slide keeps its poster and editing one never shows the old picture.
//   · LRU UNDER A BYTE BUDGET. Posters are images, and a long deck would otherwise keep one per slide forever.
//   · PINNED WINDOWS. The tiles a rail is showing are pinned and never evicted, whatever the budget, so a poster on
//     screen cannot vanish because another one was added; the budget applies to everything else.
//
// A poster larger than the budget is not kept unless it is pinned: a capture of an off-screen tile is the first to go.
//
// The cache holds whatever the host gives it (an object URL, an ImageBitmap) and calls `release` on what it evicts,
// so the host frees it. Capturing a poster is the host's job and not done here.

export interface PosterEntry<T> {
	value: T;
	bytes: number;
}

export interface PosterCache<T> {
	get(key: string): T | undefined;
	/** Store a poster. Re-storing a key replaces it (and releases the old value). */
	set(key: string, value: T, bytes: number): void;
	has(key: string): boolean;
	/** Replace the pinned set: these keys are never evicted while pinned. */
	pin(window: string, keys: Iterable<string>): void;
	unpin(window: string): void;
	/** Bytes held, pinned or not. */
	readonly bytes: number;
	readonly size: number;
	clear(): void;
}

/**
 * A stable key for a poster: the slide's text and the look it was drawn in. FNV-1a, so it is cheap and needs no crypto.
 * `look` must carry everything outside the slide's own text that changes its picture: the theme, palette and mode,
 * and the deck's front matter and any header, footer or class a plain directive carries onto it.
 */
export function posterKey(text: string, look: string): string {
	let h = 0x811c9dc5;
	const s = `${look}\u0000${text}`;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return `${(h >>> 0).toString(36)}.${s.length.toString(36)}`;
}

export function createPosterCache<T>({ budget: asked, release }: { budget: number; release?: (value: T) => void }): PosterCache<T> {
	const budget = Number.isFinite(asked) ? Math.max(0, asked) : 0;
	// A Map iterates in insertion order, so re-inserting on use keeps the least recently used first.
	const entries = new Map<string, PosterEntry<T>>();
	const windows = new Map<string, Set<string>>();
	let bytes = 0;
	const pinned = (key: string) => {
		for (const w of windows.values()) if (w.has(key)) return true;
		return false;
	};
	const drop = (key: string) => {
		const e = entries.get(key);
		if (!e) return;
		entries.delete(key);
		bytes -= e.bytes;
		release?.(e.value);
	};
	const evict = () => {
		if (bytes <= budget) return;
		for (const key of [...entries.keys()]) {
			if (bytes <= budget) return;
			if (!pinned(key)) drop(key);
		}
	};
	return {
		get(key) {
			const e = entries.get(key);
			if (!e) return undefined;
			entries.delete(key);
			entries.set(key, e);
			return e.value;
		},
		set(key, value, size) {
			const b = Number.isFinite(size) ? Math.max(0, size) : 0;
			const old = entries.get(key);
			if (old) {
				entries.delete(key);
				bytes -= old.bytes;
				// Re-storing the same value must not free it: the host still holds it here.
				if (old.value !== value) release?.(old.value);
			}
			// One poster larger than the whole budget is refused unless pinned, rather than evicting every other
			// poster on its way in and then itself.
			if (b > budget && !pinned(key)) {
				release?.(value);
				return;
			}
			entries.set(key, { value, bytes: b });
			bytes += b;
			evict();
		},
		has: (key) => entries.has(key),
		pin(window, keys) {
			windows.set(window, new Set(keys));
			evict();
		},
		unpin(window) {
			windows.delete(window);
			evict();
		},
		get bytes() {
			return bytes;
		},
		get size() {
			return entries.size;
		},
		clear() {
			for (const key of [...entries.keys()]) drop(key);
			windows.clear();
		},
	};
}
