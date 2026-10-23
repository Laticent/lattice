// THE PREVIEWS' DRAW HOST, installed on the page that embeds preview frames (owner decisions 14 and 15, D1 A):
// `window.__latticeDrawHost.draw(job)`. A preview frame's runtime (lib/runtime/index.js) finds it through
// `window.parent` and sends the figures that need a screen out instead of loading their libraries into the deck's page
// (lib/plugins/host-browser.mjs `drawHost`). Every export, and the plain `.html`, has no parent host and keeps loading
// the library, so nothing there changes.
//
// This file is the STUB, and it is kept as small as it can be: it stays in the startup bundle of every route
// (docs/route-budget.json; a first cut that held the loading logic here cost 393 bytes gz on three routes). Everything
// else is `preview-draw-host-impl.ts`, imported on the first draw or the first warm-up, so a deck with no figure costs
// one property definition.

import { DRAW_KINDS } from '../../../lib/plugins/draw-kinds.generated.mjs';

type Job = { kind: string } & Record<string, unknown>;

declare global {
	interface Window {
		__latticeDrawHost?: { draw: (job: Job) => Promise<string>; warm?: (kind: string) => void; kinds?: readonly string[] };
	}
}

const impl = () => import('./preview-draw-host-impl');

// WHAT THE HOST DRAWS FOR A PAGE. A kind listed here is drawn in a sandboxed frame, and its library is not loaded into the page: the runtime
// installs its stand-in (lib/plugins/draw-shims.mjs) only for a kind the host offers, and the preview builders skip the library's preload.
// The list is the plugins whose manifests declare `draw` (the registry build writes it): adding a plugin adds its kind here by itself.
const KINDS: readonly string[] = DRAW_KINDS;
// A kind whose frame could not load its library (offline, a stale deploy) leaves the list, so the next preview frame loads the library itself.
const down = new Set<string>();
export const markDrawKindDown = (kind: string) => void down.add(kind);

/** Install the host on `win`, once. Idempotent; never replaces a host something else defined. */
export function installPreviewDrawHost(win: Window = window): void {
	if (Object.getOwnPropertyDescriptor(win, '__latticeDrawHost')) return;
	Object.defineProperty(win, '__latticeDrawHost', {
		value: Object.freeze({
			get kinds() {
				return Object.freeze(KINDS.filter((k) => !down.has(k)));
			},
			draw: (job: Job) => impl().then((m) => m.draw(job)),
			warm: (kind: string) => void impl().then((m) => m.warm(kind)),
		}),
	});
}

/** Ask the page's host to get ready for a kind of figure: the preview builder calls it for a deck that holds one. */
export function warmPreviewDrawHost(kind: string, win: Window = window): void {
	win.__latticeDrawHost?.warm?.(kind);
}
