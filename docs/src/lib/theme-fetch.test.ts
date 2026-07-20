import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetThemeFetcherCache, createThemeFetcher } from './theme-fetch';

// Regression guard for the multi-level theme @import closure. The engine's
// resolveThemeImports only inlines an import whose target is already REGISTERED,
// so a chain like a11y-deuteranopia → a11y-base → onyx → lattice renders
// STRIPPED unless the fetcher registers every link. (The bug: only lattice +
// the picked theme were registered, so a11y-base/onyx were missing and the
// @import was dropped — the a11y machinery vanished in the Drawing Board.)

// Minimal theme graph mirroring the real chain — in the MINIFIED form the client
// actually fetches (dist/themes/*.min.css), where the minifier drops the space
// after @import (`@import"a11y-base"`). The closure recursion must match that, or
// it silently registers nothing past the picked theme → stripped render.
const GRAPH: Record<string, string> = {
	'lattice.css': '/* @theme lattice */section{}',
	'a11y-deuteranopia.css': '/* @theme a11y-deuteranopia */@import"a11y-base";:root{--pass:#004982}',
	// Banner comment deliberately contains a literal `@import 'a11y-base'` (prose
	// describing itself) — the real trap that deadlocked the recursion. The scan
	// must strip comments, so the only real dep here is onyx.
	'a11y-base.css': "/* @theme a11y-base — carries @theme only so the engine resolves @import 'a11y-base' */@import\"onyx\";:root{--cat-1-fill:#e8e8e8}",
	'onyx.css': '/* @theme onyx */@import"lattice";:root{--bg:#fff}',
	'indaco.css': "/* @theme indaco */@import'lattice';:root{--accent:#36c}",
};

describe('createThemeFetcher — transitive @import closure', () => {
	let registered: Set<string>;

	beforeEach(() => {
		__resetThemeFetcherCache();
		registered = new Set();
		(globalThis as unknown as { window: unknown }).window = {
			LatticePlayground: {
				addThemes: (cssList: string[]) => {
					for (const css of cssList) {
						const m = css.match(/@theme\s+([\w-]+)/);
						if (m) registered.add(m[1]);
					}
				},
				hasTheme: (name: string) => registered.has(name),
			},
		};
		vi.stubGlobal('fetch', (url: string) => {
			const file = url.split('/').pop() as string;
			const body = GRAPH[file];
			return Promise.resolve({
				ok: body != null,
				status: body != null ? 200 : 404,
				text: () => Promise.resolve(body ?? ''),
			} as Response);
		});
	});

	it('registers the FULL chain for a multi-level theme (a11y-* → a11y-base → onyx → lattice)', async () => {
		const f = createThemeFetcher('/themes/');
		await f.ensure('a11y-deuteranopia', 'light');
		// Every link must be registered, or the engine drops the @import → stripped render.
		expect([...registered].sort()).toEqual(['a11y-base', 'a11y-deuteranopia', 'lattice', 'onyx']);
	});

	it('still registers a single-level theme (brand → lattice) without over-fetching', async () => {
		const f = createThemeFetcher('/themes/');
		await f.ensure('indaco', 'light');
		expect(registered.has('indaco')).toBe(true);
		expect(registered.has('lattice')).toBe(true);
		expect(registered.has('onyx')).toBe(false); // not in indaco's chain
	});

	it('tolerates a missing -dark companion (mode-invariant a11y theme) in dark mode', async () => {
		const f = createThemeFetcher('/themes/');
		await expect(f.ensure('a11y-deuteranopia', 'dark')).resolves.toBeUndefined();
		expect(registered.has('a11y-base')).toBe(true); // light chain still fully registered
	});

	// Red-team regression (Fix A): a palette with NO `-dark` companion (carbone, the a11y set)
	// 404s on `ensure(dark)`. The module-shared cache's transient self-heal must NOT drop a 404
	// (a designed negative result) — else it re-fetches the 404 on EVERY render. Fetched ONCE.
	it('negative-caches an absent -dark companion — fetched once, not per render', async () => {
		const calls: Record<string, number> = {};
		vi.stubGlobal('fetch', (url: string) => {
			const file = url.split('/').pop() as string;
			calls[file] = (calls[file] || 0) + 1;
			const body = GRAPH[file];
			return Promise.resolve({ ok: body != null, status: body != null ? 200 : 404, text: () => Promise.resolve(body ?? '') } as Response);
		});
		const f = createThemeFetcher('/themes/');
		await f.ensure('indaco', 'dark'); // indaco-dark.css is absent → 404
		await f.ensure('indaco', 'dark');
		await f.ensure('indaco', 'dark');
		expect(calls['indaco-dark.css']).toBe(1); // 404 stayed negatively cached across renders
		expect(registered.has('indaco')).toBe(true); // the light palette still registered
	});
});

// Regression guard for #876: lattice.css's @font-face block ships a package-
// relative url(fonts/<file>.woff2) (correct for the npm package, where
// dist/fonts/ sits next to dist/lattice.css) that 404'd wherever the CSS text
// ended up embedded — every consumer inlines it into a <style> with no base
// URL of its own (a srcdoc iframe, the filmstrip), so the relative ref
// resolved against the PARENT PAGE instead of themeBase.
describe('createThemeFetcher — relative font url() rewriting', () => {
	let registeredCss: string[];

	beforeEach(() => {
		__resetThemeFetcherCache();
		registeredCss = [];
		(globalThis as unknown as { window: unknown }).window = {
			LatticePlayground: {
				addThemes: (cssList: string[]) => registeredCss.push(...cssList),
				hasTheme: () => false,
			},
		};
	});

	function stubFetch(css: string) {
		vi.stubGlobal('fetch', () =>
			Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(css) } as Response),
		);
	}

	it('absolutizes an unquoted url(fonts/…) against themeBase', async () => {
		stubFetch("@font-face{src:url(fonts/outfit-300.woff2) format('woff2')}");
		await createThemeFetcher('/playground/v/abc123/themes/').ensureBase();
		expect(registeredCss[0]).toContain('url(/playground/v/abc123/themes/fonts/outfit-300.woff2)');
	});

	it("absolutizes a single-quoted url('fonts/…')", async () => {
		stubFetch("@font-face{src:url('fonts/outfit-300.woff2') format('woff2')}");
		await createThemeFetcher('/playground/v/abc123/themes/').ensureBase();
		expect(registeredCss[0]).toContain("url('/playground/v/abc123/themes/fonts/outfit-300.woff2')");
	});

	it('absolutizes a double-quoted url("fonts/…")', async () => {
		stubFetch('@font-face{src:url("fonts/outfit-300.woff2") format("woff2")}');
		await createThemeFetcher('/playground/v/abc123/themes/').ensureBase();
		expect(registeredCss[0]).toContain('url("/playground/v/abc123/themes/fonts/outfit-300.woff2")');
	});

	it('routes KaTeX font refs to the sibling katex/fonts/ dir instead of themes/fonts/', async () => {
		stubFetch('@font-face{src:url(fonts/KaTeX_Main-Regular.woff2)}');
		await createThemeFetcher('/playground/v/abc123/themes/').ensureBase();
		expect(registeredCss[0]).toContain('url(/playground/v/abc123/katex/fonts/KaTeX_Main-Regular.woff2)');
		expect(registeredCss[0]).not.toContain('themes/fonts/KaTeX');
	});

	it('rewrites both a text-face AND a KaTeX ref in the same stylesheet correctly', async () => {
		stubFetch('@font-face{src:url(fonts/outfit-300.woff2)}@font-face{src:url(fonts/KaTeX_Main-Regular.woff2)}');
		await createThemeFetcher('/playground/v/abc123/themes/').ensureBase();
		expect(registeredCss[0]).toContain('url(/playground/v/abc123/themes/fonts/outfit-300.woff2)');
		expect(registeredCss[0]).toContain('url(/playground/v/abc123/katex/fonts/KaTeX_Main-Regular.woff2)');
	});

	it('leaves a CSS text with no font url() reference untouched', async () => {
		stubFetch(':root{--accent:#36c}');
		await createThemeFetcher('/playground/v/abc123/themes/').ensureBase();
		expect(registeredCss[0]).toBe(':root{--accent:#36c}');
	});

	it('does not touch a non-font url() (e.g. a background-image reference)', async () => {
		stubFetch(".hero{background:url('images/hero.svg')}");
		await createThemeFetcher('/playground/v/abc123/themes/').ensureBase();
		expect(registeredCss[0]).toBe(".hero{background:url('images/hero.svg')}");
	});

	// Documents a real assumption: every current caller's themeBase ends in the
	// literal 'themes/' (studio.astro/workbench.astro/playground.astro/
	// drawing-board.astro/index.astro/Specimen.astro all build it via
	// `joinBase(base, 'themes/')`), so `.replace(/themes\/$/, 'katex/fonts/')`
	// always fires. A themeBase WITHOUT that trailing segment does NOT error
	// and does NOT no-op either — `.replace()` returns themeBase UNCHANGED when
	// nothing matches, so katexBase silently degrades to plain themeBase, and
	// the KaTeX rewrite still fires, just against the wrong (non-katex/fonts/)
	// directory. Pinning today's actual behavior here so a future caller with a
	// different themeBase shape gets a visibly-wrong asset 404 to investigate,
	// not a change nobody notices broke KaTeX quietly.
	it('degrades to a WRONG (not katex/fonts/-routed) but still absolute URL when themeBase does not end in "themes/"', async () => {
		stubFetch('@font-face{src:url(fonts/KaTeX_Main-Regular.woff2)}');
		await createThemeFetcher('/playground/v/abc123/other/').ensureBase();
		expect(registeredCss[0]).toBe('@font-face{src:url(/playground/v/abc123/other/KaTeX_Main-Regular.woff2)}');
	});
});
