// Build-time SSG of the Studio's first slide — renders one deck slide through the
// SAME owned engine the live preview uses (lib/playground), then prunes the sheet
// to just that slide's critical CSS. studio.astro drops the result into a static,
// no-JS instant shell so the largest paint lands at HTML-parse time instead of
// waiting on the client:only island + engine bundle (the ~6s mobile LCP this
// front targets). See engineering/decisions/2026-07-11-preview-performance-diagnosis.md.
//
// RESILIENT: any failure (engine absent mid-build, parse error) returns null and
// studio.astro renders exactly as before — the shell is a pure enhancement, never
// a build-breaker.

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { extractCriticalCss } from './critical-css.mjs';

// The owned engine (lib/playground → lib/core/*) is CommonJS. Load it through a
// native `createRequire`, NOT a dynamic `import()`: under Vite's dev SSR the module
// runner re-transforms the required CJS files to ESM, where `require` is undefined
// (`ReferenceError: require is not defined` in lib/core/bake-splits.js) — which
// silently killed the whole instant-shell in `astro dev` while `astro build` (native
// Node loader) worked, so the feature could never be seen or tested locally. Node's
// own require resolves the CJS graph directly (require-of-ESM is supported on the
// engine's ESM entry too), so the SAME path now works in dev AND build.
// NOTE: require()-of-ESM is on by default only on Node >=22.12 / >=20.19 — the deploy
// pins node 22 (docs.yml), so it's covered. On older Node the engine's ESM entry would
// throw ERR_REQUIRE_ESM here; that's caught below, logged loudly, and degrades to null
// (a local-dev-only concern on unsupported Node — the deploy build is unaffected).
const requireEngine = createRequire(import.meta.url);

/**
 * Render one slide to static HTML + critical CSS, themed by `palette` in light mode.
 * @param {string} slideSource  Engine markdown for a single slide.
 * @param {string} palette      Theme name (the Studio default is 'indaco').
 * @param {string} repoRoot     Absolute repo root. Pass `join(process.cwd(),'..')`
 *   from a docs/ Astro page — NOT an import.meta.url walk, which points at the
 *   bundled chunk (not this file) under `astro build`. See studio.astro.
 * @param {string} [themeUrlBase]  Absolute URL the engine's relative `url(fonts/…)`
 *   @font-face refs resolve against (the served themes/ base, e.g.
 *   `/playground/v/<hash>/themes/`). Without it those refs would resolve against
 *   `/studio/` and 404 → the slide falls back to system fonts until the live
 *   iframe swaps in. Rewritten to absolute so the SSG slide uses the REAL faces
 *   (matching the live render exactly, and warming the cache for it).
 * @returns {Promise<{html:string, css:string, width:number, height:number}|null>}
 */
export async function renderFirstSlideShell(slideSource, palette, repoRoot, themeUrlBase) {
	if (!repoRoot) return null;
	const enginePath = join(repoRoot, 'lib/playground/index.js');
	const latticeCss = join(repoRoot, 'dist/lattice.css');
	const themeCss = join(repoRoot, `themes/${palette}.css`);
	// GENUINELY ABSENT engine/theme (a fresh checkout before `npm run build` writes
	// dist/lattice.css) → quiet null: the shell is a pure enhancement, and this is an
	// expected degradation, not a defect. Only the render path below is a "loud" failure.
	if (!existsSync(enginePath) || !existsSync(latticeCss) || !existsSync(themeCss)) return null;

	try {
		const mod = requireEngine(enginePath);
		const api = mod?.default ?? mod;
		api.addThemes([readFileSync(latticeCss, 'utf8'), readFileSync(themeCss, 'utf8')]);

		const out = api.render(slideSource, palette);
		if (!out?.html || !out?.css) return null;

		let css = extractCriticalCss(out.css, out.html);
		if (themeUrlBase) css = css.replace(/url\((['"]?)fonts\//g, `url($1${themeUrlBase}fonts/`);
		return { html: out.html, css, width: out.width || 1280, height: out.height || 720 };
	} catch (e) {
		// The engine IS present but rendering the shell threw — a real defect, not an
		// expected absence. Do NOT swallow it silently: a null return here ships a Studio
		// with no instant-shell, so a returning visitor's cached last slide has nothing to
		// replay into and reload paints blank (the exact regression this whole path exists
		// to prevent). Surface it LOUD in the dev-server + `astro build` logs so it can't
		// hide; still return null so it stays a non-fatal enhancement, never a build-breaker.
		// The `check:studio-shell` gate (chained into the docs `build` script) then turns a
		// shell-less build into an actual, blocking failure — loud AND fatal at the gate.
		console.error('[ssg-first-slide] instant-shell render FAILED — Studio will ship with no cached-slide replay:', e?.stack ? e.stack : e);
		return null;
	}
}
