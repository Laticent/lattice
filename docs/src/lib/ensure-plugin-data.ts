// On-demand loader for a plugin's DATA script (lattice-plugin-<name>.js, built by
// tools/build-plugin-data-bundles.js): the icons plugin's drawings, today. The engine bundle carries
// no plugin's data (tools/build-playground.js stubs lib/plugins/data.generated.js), so a deck that
// uses a data plugin fetches its script once, before its first render, and every later render
// finds it in `globalThis.__latticePluginData` (lib/plugins/plugin-data.js). The KaTeX provider's
// shape (ensure-katex.ts): a classic <script>, a per-URL promise, a bounded poll.
//
// Best-effort: a failed load never fails the render. The plugin's spans stay as the author wrote
// them for that pass, and a later render tries again.

import { DATA_PLUGINS } from '../../../lib/plugins/data-probe.generated.mjs';

declare global {
	interface Window {
		__latticePluginData?: Record<string, unknown>;
	}
}

const loaders = new Map<string, Promise<void>>();
const POLL_MS = 50;
const MAX_ATTEMPTS = 200; // ~10s, the KaTeX provider's bound

function loaded(name: string): boolean {
	return Boolean(window.__latticePluginData && Object.hasOwn(window.__latticePluginData, name));
}

function ensureOne(name: string, url: string): Promise<void> {
	if (loaded(name)) return Promise.resolve();
	const existing = loaders.get(url);
	if (existing) return existing;
	const p = new Promise<void>((resolve, reject) => {
		let attempts = 0;
		const fail = (msg: string) => {
			loaders.delete(url); // a later render retries
			reject(new Error(msg));
		};
		const s = document.createElement('script');
		s.src = url;
		s.defer = true;
		s.setAttribute('data-lattice-plugin-data', name);
		s.addEventListener('error', () => fail(`plugin data failed to load: ${url}`));
		document.head.appendChild(s);
		const t = setInterval(() => {
			if (loaded(name)) {
				clearInterval(t);
				resolve();
			} else if (++attempts >= MAX_ATTEMPTS) {
				clearInterval(t);
				fail(`plugin data load timed out: ${url}`);
			}
		}, POLL_MS);
	});
	loaders.set(url, p);
	return p;
}

/**
 * Fetch the data of every plugin this deck uses (its `detect`), from beside the engine bundle (the
 * engine's own URL with `lattice-playground.js` swapped for the plugin's file, as
 * docs/scripts/sync-playground-assets.mjs stages them). Never rejects.
 */
export async function ensurePluginData(source: string): Promise<void> {
	if (typeof document === 'undefined') return;
	const engineUrl = document.querySelector<HTMLScriptElement>('script[data-lattice-engine]')?.getAttribute('src');
	if (!engineUrl?.includes('lattice-playground.js')) return;
	const wanted = DATA_PLUGINS.filter((p) => !loaded(p.name) && p.detect(source));
	await Promise.all(wanted.map((p) => ensureOne(p.name, engineUrl.replace('lattice-playground.js', p.file)).catch(() => {})));
}

/**
 * Does this deck use a data plugin whose data has not arrived? Then a render of it is a
 * placeholder (its icons still code), and a caller that memoizes renders must not keep it: a hit
 * would serve the placeholder until the deck is edited, however soon the data lands (HARD RULE #25
 * inversion lens on single-slide-render.ts's memo).
 */
export function pluginDataMissing(source: string): boolean {
	if (typeof window === 'undefined') return false;
	return DATA_PLUGINS.some((p) => !loaded(p.name) && p.detect(source));
}
