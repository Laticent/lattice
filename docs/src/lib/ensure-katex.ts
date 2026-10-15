// On-demand loader for the KaTeX provider bundle (lattice-katex.js) — the
// SAME classic-<script>-injection-and-poll idiom load-engine.ts's
// ensureEngine uses for the main engine bundle, mirrored here rather than
// generalized into a shared helper (the readiness signal differs: a global
// object vs. a boolean flag) — see render-engine.ts's header for why KaTeX is
// a separate on-demand bundle at all.
//
// Idempotent: a module-level singleton keyed by URL, same as ensureEngine.
import { engineBase, engineBaseFor } from './engine-base';

const loaders = new Map<string, Promise<void>>();
const POLL_MS = 50;

/**
 * Ensure the KaTeX provider bundle at `url` is loaded; resolve once
 * `window.__latticeKatexReady` is set (lib/playground/katex-provider.js sets
 * it after registering the real KaTeX with lib/engine/katex-browser-stub.js's
 * closure via `window.__latticeRegisterKatex`).
 */
export function ensureKatexProvider(url: string): Promise<void> {
	if (typeof window === 'undefined') return Promise.resolve();
	if (window.__latticeKatexReady) return Promise.resolve();

	const existing = loaders.get(url);
	if (existing) return existing;

	const p = new Promise<void>((resolve, reject) => {
		let attempts = 0;
		const MAX_ATTEMPTS = 200; // ~10s at POLL_MS, matching ensureEngine's bound.
		const fail = (msg: string) => {
			loaders.delete(url); // allow a later call to retry
			reject(new Error(msg));
		};
		const finish = () => {
			if (window.__latticeKatexReady) {
				resolve();
				return true;
			}
			return false;
		};

		const already = document.querySelector<HTMLScriptElement>(`script[data-lattice-katex-provider][src="${cssEscape(url)}"]`);
		if (!already) {
			const s = document.createElement('script');
			s.src = url;
			s.defer = true;
			s.setAttribute('data-lattice-katex-provider', '');
			s.addEventListener('load', () => finish());
			s.addEventListener('error', () => fail(`katex provider failed to load: ${url}`));
			document.head.appendChild(s);
		}

		if (finish()) return;
		const t = setInterval(() => {
			if (finish()) {
				clearInterval(t);
				return;
			}
			if (++attempts >= MAX_ATTEMPTS) {
				clearInterval(t);
				fail('katex provider load timed out');
			}
		}, POLL_MS);
	});

	loaders.set(url, p);
	return p;
}

/**
 * The provider bundle is always staged as a sibling of the engine bundle
 * (docs/scripts/sync-playground-assets.mjs stages both into the same
 * content-hashed `playground/v/<hash>/` dir) — one filename swap away from an
 * `engineUrl`. Returns null for a URL that doesn't match the expected
 * engine filename — `esm/engine.js` or `lattice-playground.js` (engine-base.ts).
 */
export function katexProviderUrlFor(engineUrl: string): string | null {
	const base = engineBaseFor(engineUrl);
	return base === null ? null : `${base}lattice-katex.js`;
}

/**
 * Same as `katexProviderUrlFor`, but for the engine this page loaded
 * (engine-base.ts records it), for callers (renderMarkdown) that don't carry
 * `engineUrl` themselves.
 * Returns null if the engine script isn't present yet (renderMarkdown only
 * calls this after confirming `PG` is set, so in practice it always is).
 */
export function deriveKatexProviderUrl(): string | null {
	const base = engineBase();
	return base === null ? null : `${base}lattice-katex.js`;
}

// Minimal attribute-selector escape for the URL (mirrors load-engine.ts).
function cssEscape(value: string): string {
	return value.replace(/["\\]/g, '\\$&');
}
