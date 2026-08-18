// Shared theme fetch + registration (the "ensureThemes" pattern).
//
// WRAP, DON'T REINVENT — and DON'T COPY. The marp render path lives in
// window.LatticePlayground (the on-demand engine bundle). Every docs surface
// that renders a live slide must first register the palette CSS the engine will
// theme with: fetch `themeBase + <name>.css`, hand the text to PG.addThemes,
// and avoid re-fetching/re-registering the same theme. That logic was copied
// verbatim across the landing bridge, the playground bridge, the specimen
// renderer, and both Workbench studios. This module is the single source.
//
// `createThemeFetcher(themeBase)` returns:
//   - fetch(name)            → Promise<cssText>, in-memory cached per name
//   - ensure(palette, mode)  → registers lattice + the palette (+ -dark in dark
//                              mode), each once; the exact single-slide pattern
//   - ensureBase()           → registers just lattice.css once (the studios'
//                              ensureBaseTheme: they register their own derived
//                              palettes, so they only need the base contract)
//   - has(name)              → PG.hasTheme(name)
//
// Touches window/fetch, so it lives outside the React tree. Callers that render
// must guarantee window.LatticePlayground exists first (whenReady / load-engine).

// `window.LatticePlayground` is declared once, canonically, in playground-global.d.ts.

// THE theme graph, declared in the manifests and baked into the catalog — not
// re-derived by regexing `@import` out of the fetched CSS. That scan lived here as
// `themeImportNames` and was the third such resolver in the repo; the three had
// already drifted (the emulator's missed a minified `@import"onyx"` that this one
// handled). See engineering/decisions/2026-08-16-manifest-is-the-theme-contract.md.
import { themeChain } from '../../../lib/theme/chain.mjs';
import { THEME_EDGES } from '../../../lib/theme/edges.generated.mjs';


// Module-level shared cache keyed by themeBase — so EVERY preview host that renders against
// the same theme root shares ONE fetch + ONE decoded/rewritten ~560KB CSS string, instead of
// each host allocating + retaining its own copy (the per-host theme-fetch leak / peak-memory
// cost, audit 2026-07-20-studio-degradation-audit). The CSS for a given (themeBase, name) is
// identical across hosts, so sharing is safe; the engine-side registry (PG.addThemes/hasTheme)
// was already globally deduped — this closes the docs-side duplication the audit measured.
type FetcherState = { fetched: Record<string, Promise<string>>; registering: Record<string, Promise<void>>; latticeReady: Promise<void> | null; katexWanted: boolean; katexReady: Promise<void> | null };
const sharedState = new Map<string, FetcherState>();
function stateFor(themeBase: string): FetcherState {
	let s = sharedState.get(themeBase);
	if (!s) {
		s = { fetched: {}, registering: {}, latticeReady: null, katexWanted: false, katexReady: null };
		sharedState.set(themeBase, s);
	}
	return s;
}
/** Test-only: clear the module-level shared cache so each case starts isolated (the shared
 *  cache is the production contract; tests reset it in beforeEach). Not for runtime use. */
export function __resetThemeFetcherCache(): void {
	sharedState.clear();
}

export function createThemeFetcher(themeBase: string) {
	const state = stateFor(themeBase);
	const fetched = state.fetched; // theme name → Promise<cssText>, SHARED across hosts of this themeBase

	/** Fetch `<themeBase><name>.css` once; cache the Promise per name. */
	function fetchTheme(name: string): Promise<string> {
		if (!fetched[name]) {
			fetched[name] = fetch(themeBase + name + '.css')
				.then((r) => {
					if (!r.ok) throw Object.assign(new Error('theme ' + name + ' (' + r.status + ')'), { status: r.status });
					return r.text().then(rewriteRelativeFontUrls);
				})
				// The cache is now SHARED across hosts (module-level), so a rejected promise would
				// poison EVERY host on a TRANSIENT failure — drop the entry so the next host retries.
				// But a 404 is a DESIGNED negative result (many palettes ship no `-dark` companion;
				// `ensure(dark)` fetches it with a swallowing `.catch`), so keep it negatively cached —
				// else we'd re-fetch the 404 on every render (red-team finding on Fix A).
				.catch((e) => {
					if (e?.status !== 404) delete fetched[name];
					throw e;
				});
		}
		return fetched[name];
	}

	/**
	 * lattice.css's `@font-face` block ships a package-relative
	 * `url(fonts/<file>.woff2)` (correct for the npm package, where dist/fonts/
	 * sits next to dist/lattice.css — see lib/fonts/text-faces.js). This CSS text
	 * is never linked as a real stylesheet resource: every consumer hands it to
	 * PG.addThemes, which embeds it as an inline <style> wherever the engine
	 * renders — a srcdoc iframe with no base URL of its own for single-slide
	 * hosts, the multi-slide filmstrip elsewhere. A relative url() there resolves
	 * against whatever document happens to embed it, not against themeBase where
	 * the matching themes/fonts/ dir is actually staged (#876) — so absolutize it
	 * here, once, before the CSS text goes anywhere. `sync-playground-assets.mjs`
	 * stages the SAME faces under `<themeBase>fonts/`, so this always resolves.
	 *
	 * lattice.css ALSO bakes in KaTeX's own `@font-face` block unconditionally
	 * (same relative-url() footgun — engineering/decisions/2026-07-10-landing-
	 * perf-katex-defer.md §4 covers KaTeX shipping unconditionally more broadly).
	 * Its fonts are already staged separately under `<pgBase>katex/fonts/` for
	 * the standalone katex.min.css `<link>` case — route `KaTeX_*` refs there
	 * instead of duplicating the files under themes/fonts/ too.
	 */
	function rewriteRelativeFontUrls(css: string): string {
		const katexBase = themeBase.replace(/themes\/$/, 'katex/fonts/');
		return css.replace(/url\((['"]?)fonts\/(KaTeX_)?/g, (_m, quote, isKatex) =>
			'url(' + quote + (isKatex ? katexBase + 'KaTeX_' : themeBase + 'fonts/'),
		);
	}

	// lattice.css bakes in KaTeX's OWN 20 `@font-face` rules unconditionally, and the
	// engine force-loads EVERY declared face at runtime boot (lib/core/font-settle.js —
	// a first overflow measurement must not be taken against fallback metrics). Net
	// effect: ~254KB of math woff2 downloaded into the preview frame of a deck with no
	// math in it (2026-08-17 loading audit §3, §9.6). They are stripped at REGISTRATION
	// and put back by `ensureKatexFaces()` the moment a source actually contains math —
	// callers await that before the render, so the first math slide already has them and
	// there is no fallback-font flash. Stripping here and not in `dist/lattice.css` is
	// deliberate: that file is a PUBLISHED export artifact (package.json `files`,
	// consumed by the runtime, the engine and the PDF path) whose self-hosted KaTeX is
	// what makes math render with zero network. Editing it would change exported bytes
	// and trip the export sign-off gate; this seam is docs-only.
	// The 20 rules are contiguous and each is a self-delimited `@font-face{…}` block, so
	// the match cannot run past its own rule.
	const KATEX_FACE_RE = /@font-face\{[^}]*KaTeX_[^}]*\}/g;
	function latticeCssFor(css: string): string {
		return state.katexWanted ? css : css.replace(KATEX_FACE_RE, '');
	}

	/**
	 * Re-register `lattice` WITH its KaTeX faces. Idempotent; call (and await) before
	 * rendering a source that contains math. Once wanted, every later registration —
	 * including the eviction-repair paths below — keeps them, because `latticeCssFor`
	 * reads the flag.
	 */
	function ensureKatexFaces(): Promise<void> {
		const PG = window.LatticePlayground;
		if (!PG) return Promise.reject(new Error('engine not ready'));
		if (state.katexWanted && state.katexReady) return state.katexReady;
		state.katexWanted = true;
		state.katexReady = fetchTheme('lattice')
			.then((css) => {
				// addThemes overwrites by name, so this replaces the stripped registration.
				PG.addThemes([{ name: 'lattice', css }]);
			})
			.catch((e) => {
				state.katexReady = null; // let a later math render retry
				throw e;
			});
		return state.katexReady;
	}

	/**
	 * True once the KaTeX faces have been put back into the registered base. Preview hosts
	 * fold this into their patch signature: the faces live in the COMPOSED stylesheet, and
	 * the cheap body-patch path deliberately does not rewrite that <style> — so without a
	 * signature change the first math render after registration would patch in math HTML
	 * over a stylesheet that still has no math faces, and the math would paint in fallback
	 * metrics. Measured exactly that way before this was threaded through.
	 */
	function katexFacesActive(): boolean {
		return state.katexWanted && Boolean(state.katexReady);
	}

	/** True once the engine reports the named theme is registered. */
	function has(name: string): boolean {
		return Boolean(window.LatticePlayground?.hasTheme(name));
	}

	/** Register the base `lattice.css` contract exactly once. */
	function ensureBase(): Promise<void> {
		const PG = window.LatticePlayground;
		if (!PG) return Promise.reject(new Error('engine not ready'));
		if (!state.latticeReady) {
			state.latticeReady = fetchTheme('lattice')
				.then((css) => PG.addThemes([{ name: 'lattice', css: latticeCssFor(css) }]))
				.catch((e) => { if (e?.status !== 404) state.latticeReady = null; throw e; }); // self-heal transient only (keep a 404 negatively cached)
		}
		// Eviction-safe: the memo is now page-lifetime-shared, so it must not outlive the engine's
		// truth. If a future engine-side eviction (audit fix D — ThemeStore.byName bounding) drops
		// the base after the memo resolved, re-add from the shared CSS (a hasTheme() Map.has + no-op
		// when present — negligible on the hot path). Without this, the shared memo would say
		// "registered" forever and strip the render (Munger inversion on Fix A).
		return state.latticeReady.then(() => {
			if (!PG.hasTheme('lattice')) return fetchTheme('lattice').then((css) => { PG.addThemes([{ name: 'lattice', css: latticeCssFor(css) }]); });
		});
	}

	/**
	 * Register lattice + the requested palette (+ its `-dark` companion when in
	 * dark mode), each fetched/registered at most once. Mirrors the inline
	 * ensureThemes every single-slide host used.
	 */
	// Register a theme AND the transitive theme-name `@import` closure it needs.
	// The engine's resolveThemeImports only inlines an import whose target is
	// already registered, so a multi-level chain (e.g. a11y-deuteranopia →
	// a11y-base → onyx → lattice) renders STRIPPED unless every link is present.
	// Follows bare `@import 'name'` directives (url() font imports are ignored);
	// `lattice` routes through ensureBase(). Each name registered at most once.
	const registering = state.registering;
	function register(name: string): Promise<void> {
		const PG = window.LatticePlayground;
		if (!PG) return Promise.reject(new Error('engine not ready'));
		if (name === 'lattice') return ensureBase();
		if (!registering[name]) {
			registering[name] = fetchTheme(name)
				.then((css) => {
					if (!PG.hasTheme(name)) PG.addThemes([{ name, css }]);
					// The engine inlines a theme-name `@import` only if its target is already
					// registered, so a multi-level chain (a11y-deuteranopia → a11y-base → onyx
					// → lattice) renders STRIPPED unless every link is present. The chain is
					// DECLARED (manifest `extends`, baked into THEME_EDGES) rather than
					// re-derived from the fetched CSS. A name absent from the catalog has no
					// declared parent, so its chain is itself — correct, and the only answer
					// available without parsing. `lattice` routes via ensureBase.
					const deps = themeChain(name, THEME_EDGES).filter((d: string) => d && d !== name);
					return Promise.all([ensureBase(), ...deps.map(register)]).then(() => undefined);
				})
				.catch((e) => { if (e?.status !== 404) delete registering[name]; throw e; }); // self-heal transient only; keep a 404 (absent `-dark`) negatively cached
		}
		// Eviction-safe (same rationale as ensureBase): re-add the direct theme if a future
		// engine eviction dropped it after the shared memo resolved. (Deps re-register on the
		// first call only; a fuller re-walk waits until fix D actually adds eviction.)
		return registering[name].then(() => {
			if (!PG.hasTheme(name)) return fetchTheme(name).then((css) => { PG.addThemes([{ name, css }]); });
		});
	}

	function ensure(palette: string, mode: 'light' | 'dark'): Promise<void> {
		const PG = window.LatticePlayground;
		if (!PG) return Promise.reject(new Error('engine not ready'));
		const jobs: Promise<void>[] = [register(palette)];
		if (mode === 'dark') jobs.push(register(palette + '-dark').catch(() => {}));
		return Promise.all(jobs).then(() => undefined);
	}

	return { fetch: fetchTheme, ensure, ensureBase, ensureKatexFaces, katexFacesActive, has };
}

export type ThemeFetcher = ReturnType<typeof createThemeFetcher>;
