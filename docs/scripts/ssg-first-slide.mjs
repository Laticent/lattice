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
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { extractCriticalCss } from './critical-css.mjs';

/**
 * Render one slide to static HTML + critical CSS, themed by `palette` in light mode.
 * @param {string} slideSource  Engine markdown for a single slide.
 * @param {string} palette      Theme name (the Studio default is 'indaco').
 * @param {string} repoRoot     Absolute repo root. Pass `join(process.cwd(),'..')`
 *   from a docs/ Astro page — NOT an import.meta.url walk, which points at the
 *   bundled chunk (not this file) under `astro build`. See studio.astro.
 * @returns {Promise<{html:string, css:string, width:number, height:number}|null>}
 */
export async function renderFirstSlideShell(slideSource, palette, repoRoot) {
	try {
		if (!repoRoot) return null;
		const enginePath = join(repoRoot, 'lib/playground/index.js');
		const latticeCss = join(repoRoot, 'dist/lattice.css');
		const themeCss = join(repoRoot, `themes/${palette}.css`);
		if (!existsSync(enginePath) || !existsSync(latticeCss) || !existsSync(themeCss)) return null;

		const { default: api } = await import(pathToFileURL(enginePath).href);
		api.addThemes([readFileSync(latticeCss, 'utf8'), readFileSync(themeCss, 'utf8')]);

		const out = api.render(slideSource, palette);
		if (!out?.html || !out?.css) return null;

		const css = extractCriticalCss(out.css, out.html);
		return { html: out.html, css, width: out.width || 1280, height: out.height || 720 };
	} catch {
		return null;
	}
}
