// Studio instant-shell build gate — fails the build if `dist/studio/index.html`
// shipped WITHOUT the pre-paint instant-shell + last-slide snapshot-replay scaffold.
//
// Why this exists: the shell is generated at build time by renderFirstSlideShell
// (scripts/ssg-first-slide.mjs), which loads the owned engine and, by design, is a
// RESILIENT pure enhancement — any failure returns null and studio.astro renders
// with no shell rather than breaking the build. That resilience has a failure mode:
// a broken engine load (e.g. the Vite-dev `require is not defined` regression, or a
// future build-env change) returns null SILENTLY, and the Studio ships with no
// instant-shell — so a returning visitor's cached last slide has nothing to replay
// into and RELOAD PAINTS BLANK. That is invisible in a green build until a user hits
// it on a phone. This gate turns that silent null into a loud, blocking failure:
// after the build, the shipped studio HTML MUST carry the scaffold.
//
// Runs post-`astro build` in the docs `build` script (the deploy path), alongside
// inject-modulepreload. Standalone: `npm run check:studio-shell` (needs a built dist/).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_HTML = path.join(HERE, '..', 'dist', 'studio', 'index.html');

// Markers the scaffold MUST leave in the shipped HTML. Each is load-bearing:
//  • the shell container + slide box the replay paints into,
//  • the newcomer template (build-time first slide) proving the engine rendered,
//  • the replay script itself, keyed on the snapshot localStorage key.
// These strings are OWNED ELSEWHERE — a legitimate rename there will (intentionally)
// red this gate until updated in lockstep: the `ssr-*` ids + `id="studio-ssr-shell"`
// live in docs/src/pages/studio.astro; `class="lattice"` is the engine's top-level
// wrapper (emitted regardless of slide content); `lattice-studio-last-slide` is
// SNAPSHOT_KEY in docs/src/playground/snapshot-cache.js. Keep them in sync there.
const REQUIRED = [
	['instant-shell container', /id="studio-ssr-shell"/],
	['snapshot slide box', /id="ssr-slidebox"/],
	['newcomer slide template', /id="ssr-newcomer"/],
	['baked newcomer slide', /class="lattice"/],
	['snapshot-replay script', /lattice-studio-last-slide/],
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
				'✗ check:studio-shell — the Studio shipped WITHOUT its instant-shell / cached-slide replay.',
				`  Missing from dist/studio/index.html: ${missing.join(', ')}`,
				'',
				'  This means renderFirstSlideShell (scripts/ssg-first-slide.mjs) returned null at build',
				'  time — the engine failed to load or render. A returning visitor\'s cached last slide',
				'  then has nothing to replay into, so RELOAD PAINTS BLANK. Look for a',
				'  "[ssg-first-slide] instant-shell render FAILED" line earlier in the build log for the',
				'  underlying error (a missing dist/lattice.css, an engine load/parse failure, etc.).',
				'',
			].join('\n'),
		);
		process.exit(1);
	}
	console.log('✓ check:studio-shell — Studio instant-shell + cached-slide replay present in the build.');
}

main();
