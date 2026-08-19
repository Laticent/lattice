// Studio instant-shell build gate — fails the build if `dist/studio/index.html`
// shipped WITHOUT the pre-paint Nacre skeleton scaffold.
//
// Why this exists: the instant shell is what a visitor sees at HTML-parse time — before
// the client:only island hydrates and the ~505KB engine loads. If it's missing, a reload
// paints a blank preview until hydration (the bug this whole area exists to prevent). The
// shell is static markup in studio.astro, so a silent regression here is a stray edit that
// drops the container / box / skeleton — this gate turns that into a loud, blocking failure.
//
// (History: the shell used to be a build-time RENDERED first slide + a cached-last-slide
// snapshot replay — a second real-content surface that raced the live preview and, on
// mobile, produced a "slide in the top half, shimmer bleeding into the bottom, seam down
// the middle" bug. That machinery was retired for a Nacre-ONLY skeleton: one surface, one
// 16:9 box, no seam. See engineering/decisions/2026-07-21-studio-preview-one-skeleton.md.)
//
// Runs post-`astro build` in the docs `build` script (the deploy path), alongside
// inject-modulepreload. Standalone: `npm run check:studio-shell` (needs a built dist/).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_HTML = path.join(HERE, '..', 'dist', 'studio', 'index.html');

// Markers the Nacre-only shell MUST leave in the shipped HTML:
//  • the shell container + the one 16:9 slide box,
//  • the Nacre skeleton itself (its loader element + at least one animated layer),
//  • the seed script that flips data-ssr-shell="on" so the shell is actually shown.
// The `ssr-*` ids + `nacre-loader*` classes live in docs/src/pages/studio.astro; a
// legitimate rename there will (intentionally) red this gate until updated in lockstep.
const REQUIRED = [
	['instant-shell container', /id="studio-ssr-shell"/],
	['slide box', /id="ssr-slidebox"/],
	// Word-boundary class match (not exact `class="nacre-loader"`) so the gate still passes if the
	// skeleton element ever gains a second class while keeping `nacre-loader`. `\b` won't match
	// `nacre-loader__layer` (no boundary before `_`), so this stays distinct from the layer marker below.
	['nacre skeleton', /(?:^|\s)class="[^"]*\bnacre-loader\b/],
	['nacre animated layer', /nacre-loader__layer--0/],
	// Match the SEED SCRIPT's setAttribute call, NOT a bare `data-ssr-shell` — the latter also
	// appears in the always-present CSS selector `:root[data-ssr-shell="on"]`, so the gate would
	// pass even if the seed that actually flips the attribute were removed (shell stays hidden →
	// blank-on-reload returns). This substring only exists in the inline seed.
	['shell-on seed', /setAttribute\(\s*['"]data-ssr-shell['"]\s*,\s*['"]on['"]/],
	// ── Structural chrome bands (#1438) ──────────────────────────────────────────
	// The shell drew a topbar and a slide box and nothing else, so hydration dropped four
	// more bands in at once and the hand-off read as a re-layout. These markers keep the
	// bands in the shipped HTML: the phone action bar, the editor column, the preview
	// sub-bar, the footer — plus the seed that publishes the geometry they are drawn from.
	// Without that last one every band collapses to its 0px fallback and silently vanishes,
	// which is exactly the regression this gate exists to make loud.
	['chrome (real controls, build-rendered)', /class="ssr-chrome"/],
	['topbar row', /class="ssr-topbar/],
	['phone action bar', /class="ssr-actionbar/],
	['editor-column band', /class="ssr-band ssr-editpane"/],
	['preview sub-bar band', /class="ssr-band ssr-panehdr"/],
	['preview footer band', /class="ssr-band ssr-paneftr"/],
	// The desktop-Craft activity rail, and its CONTENT. The band alone is not enough: it
	// shipped for months as an empty <div>, so a Craft reload drew a blank 52px column beside
	// a top bar rendered control-for-control. The nav marker is what makes "the band exists"
	// and "the band has the rail in it" two different assertions.
	['activity-rail band', /class="ssr-band ssr-activityrail"/],
	['activity-rail launchers', /aria-label="Studio panels"/],
	['chrome geometry seed', /setAttribute\(\s*['"]data-ssr-chrome['"]/],
	// The chrome is the APP'S OWN components rendered to static HTML at build time, so a real
	// glyph in the shipped HTML is the proof that path still runs. If <StudioChromeSkeleton>
	// silently stopped rendering (a bad import, a client directive added by mistake), the bands
	// above would still be present and empty — this is what catches that.
	['real lucide glyphs', /lucide-moon/],
	['real shadcn buttons', /data-slot="button"/],
];

function main() {
	if (!fs.existsSync(STUDIO_HTML)) {
		// The studio page wasn't built (a partial/scoped build) — nothing to assert.
		// Don't block: this gate only fires when the page IS built but shell-less.
		console.log('· check:studio-shell — dist/studio/index.html not built; skipped.');
		return;
	}
	const html = fs.readFileSync(STUDIO_HTML, 'utf8');
	const missing = REQUIRED.filter(([, re]) => !re.test(html)).map(([name]) => name);
	if (missing.length) {
		console.error(
			[
				'',
				'✗ check:studio-shell — the Studio shipped WITHOUT part of its pre-paint shell.',
				`  Missing from dist/studio/index.html: ${missing.join(', ')}`,
				'',
				'  Without the instant shell, a reload paints a BLANK preview until the island',
				'  hydrates; without its chrome bands, hydration drops four more bands in at once and',
				'  the hand-off reads as a re-layout (#1438). The shell is static markup in',
				'  docs/src/pages/studio.astro — check that the #studio-ssr-shell container,',
				'  #ssr-slidebox, the .nacre-loader skeleton, the data-ssr-shell="on" seed, the four',
				'  .ssr-band elements and the data-ssr-chrome geometry seed are all still emitted.',
				'',
			].join('\n'),
		);
		process.exit(1);
	}
	console.log('✓ check:studio-shell — Studio pre-paint Nacre skeleton present in the build.');
}

main();
