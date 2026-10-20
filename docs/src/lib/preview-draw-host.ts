// THE PREVIEWS' DRAW HOST, installed on the page that embeds preview frames (owner decisions 14 and 15, D1 A):
// `window.__latticeDrawHost.draw(job)`. A preview frame's runtime (lib/runtime/index.js) finds it through
// `window.parent` and sends the figures that need a screen out instead of loading their libraries into the deck's page
// (lib/plugins/host-browser.mjs `drawHost`). Every export, and the plain `.html`, has no parent host and keeps loading
// the library, so nothing there changes.
//
// This file is the STUB: a few lines that stay in the startup bundle. Everything heavy (the frames, the pins, the
// sanitizer) is imported on the first draw, so a deck with no plot and no diagram costs nothing (docs/route-budget.json).
//
// WHAT COMES BACK IS SANITIZED HERE, not in the frame and not in the runtime: the runtime has no sanitizer, and a
// frame's own word about its markup is not a guard. function-plot's drawing goes through the slide sanitizer, as the
// CLI's capture page does (lib/export/locked-figures.js `WRITE`).

import { engineBase, sameOriginAsset } from './engine-base';

type Job = { kind: string } & Record<string, unknown>;
type Loaded = { draw: (job: Job) => Promise<string> };

declare global {
	interface Window {
		__latticeDrawHost?: { draw: (job: Job) => Promise<string> };
	}
}

let loading: Promise<Loaded> | null = null;

function load(): Promise<Loaded> {
	if (!loading) {
		loading = (async () => {
			const [{ createDrawHost }, { sanitizeSlideHtml }, hydrateMod] = await Promise.all([
				import('./code-packages/draw-host'),
				import('./sanitize-slide-html.js'),
				import('../../../lib/plugins/function-plot/function-plot.hydrate.js'),
			]);
			const hydrate = (hydrateMod as unknown as { default?: { hydrate: unknown }; hydrate?: unknown }).default?.hydrate ?? (hydrateMod as unknown as { hydrate: unknown }).hydrate;
			const host = createDrawHost({
				libraryUrl: (file) => {
					const base = engineBase();
					return (base && sameOriginAsset(base, file)?.href) || null;
				},
				hydrateSource: () => String(hydrate),
			});
			return {
				async draw(job) {
					if (job.kind === 'function-plot') {
						const raw = await host.draw(job as Parameters<typeof host.draw>[0]);
						return sanitizeSlideHtml(raw);
					}
					// Mermaid moves in its own step; until then the runtime does not send it, and a stray job is refused.
					throw new Error(`the preview draw host does not draw ${String(job.kind)} yet`);
				},
			};
		})();
		// A failed load is tried again on the next draw.
		loading.catch(() => {
			loading = null;
		});
	}
	return loading;
}

/** Install the host on `win`, once. Idempotent; never replaces a host something else defined. */
export function installPreviewDrawHost(win: Window = window): void {
	if (typeof win === 'undefined' || Object.getOwnPropertyDescriptor(win, '__latticeDrawHost')) return;
	Object.defineProperty(win, '__latticeDrawHost', {
		value: Object.freeze({ draw: (job: Job) => load().then((h) => h.draw(job)) }),
		writable: false,
		configurable: false,
		enumerable: false,
	});
}
