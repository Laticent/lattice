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
	['nacre skeleton', /class="nacre-loader"/],
	['nacre animated layer', /nacre-loader__layer--0/],
	['shell-on seed', /data-ssr-shell/],
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
				'✗ check:studio-shell — the Studio shipped WITHOUT its pre-paint Nacre skeleton.',
				`  Missing from dist/studio/index.html: ${missing.join(', ')}`,
				'',
				'  Without the instant shell, a reload paints a BLANK preview until the island',
				'  hydrates. The shell is static markup in docs/src/pages/studio.astro — check that',
				'  the #studio-ssr-shell container, #ssr-slidebox, the .nacre-loader skeleton, and',
				'  the data-ssr-shell="on" seed are all still emitted.',
				'',
			].join('\n'),
		);
		process.exit(1);
	}
	console.log('✓ check:studio-shell — Studio pre-paint Nacre skeleton present in the build.');
}

main();
