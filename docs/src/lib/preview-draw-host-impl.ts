// THE PREVIEWS' DRAW HOST, the part that is loaded on demand (the stub is docs/src/lib/preview-draw-host.ts): the draw
// host, the sanitizer, the figure's own `hydrate`, and what makes a draw fast.
//
//   - `warm(kind)` loads everything and opens the kind's frame BEFORE the first draw asks. A first draw used to wait for
//     the host's code (191 ms measured), the library fetch, pin and hash (59 ms) and the frame's start (155 ms), none of
//     which needs to wait for it: the preview builder warms when it renders a deck with a figure, and the preview
//     frame's own boot overlaps all of it.
//   - a drawing is remembered by the whole job (kind, config, size, place): an edit elsewhere in the deck re-renders the
//     preview and asks for the same plot again, and that costs nothing.
//
// WHAT COMES BACK IS SANITIZED HERE, not in the frame and not in the runtime: the runtime has no sanitizer, and a
// frame's own word about its markup is not a guard. function-plot's drawing goes through the slide sanitizer, as the
// CLI's capture page does (lib/export/locked-figures.js `WRITE`).

import hydrateMod from '../../../lib/plugins/function-plot/function-plot.hydrate.js';
import { createDrawHost } from './code-packages/draw-host';
import { engineBase, sameOriginAsset } from './engine-base';
import { sanitizeSlideHtml } from './sanitize-slide-html.js';

type Job = { kind: string } & Record<string, unknown>;

const mark = (name: string) => {
	try {
		performance.mark(`lattice-draw:${name}`);
	} catch {
		/* no performance timeline */
	}
};

const host = createDrawHost({
	libraryUrl: (file) => {
		const base = engineBase();
		return (base && sameOriginAsset(base, file)?.href) || null;
	},
	hydrateSource: () => String((hydrateMod as unknown as { hydrate: unknown }).hydrate),
});

/** The most drawings remembered, and the most characters they hold between them. */
const MEMO_MAX = 64;
const MEMO_CHARS_MAX = 8_000_000;
const memo = new Map<string, string>();
let memoChars = 0;
// A draw already on its way is shared: two previews of one deck ask for the same plot at once.
const inFlight = new Map<string, Promise<string>>();

function remember(key: string, drawing: string) {
	while (memo.size && (memo.size >= MEMO_MAX || memoChars + drawing.length > MEMO_CHARS_MAX)) {
		const oldest = memo.keys().next().value as string;
		memoChars -= memo.get(oldest)?.length ?? 0;
		memo.delete(oldest);
	}
	memo.set(key, drawing);
	memoChars += drawing.length;
}

export function draw(job: Job): Promise<string> {
	mark('draw-called');
	if (job.kind !== 'function-plot') return Promise.reject(new Error(`the preview draw host does not draw ${String(job.kind)} yet`));
	const key = JSON.stringify(job);
	const hit = memo.get(key);
	if (hit !== undefined) {
		memo.delete(key); // most recently used last
		memo.set(key, hit);
		mark('draw-remembered');
		return Promise.resolve(hit);
	}
	const running = inFlight.get(key);
	if (running) return running;
	const p = host
		.draw(job as Parameters<typeof host.draw>[0])
		.then((raw) => {
			mark('sanitize-start');
			const clean = sanitizeSlideHtml(raw);
			mark('sanitize-done');
			remember(key, clean);
			return clean;
		})
		.finally(() => {
			inFlight.delete(key);
			mark('draw-returned');
		});
	inFlight.set(key, p);
	return p;
}

/** Fetch and pin the kind's library and open its frame now, so the first draw finds both ready. Never rejects. */
export function warm(kind: string): void {
	if (kind !== 'function-plot') return;
	mark('warm');
	// A tiny draw would do the same work, but it would draw something nobody asked for; the host exposes the opening alone.
	void host.warm(kind).catch(() => {});
}
