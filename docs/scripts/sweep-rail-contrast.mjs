// Sweep: the Present rail's tier contrast across every palette x mode (#1389).
//
// COMMITTED ON PURPOSE. This sweep has now been written three times and been wrong twice —
// once because `color-mix()` resolves to `color(srgb …)` with 0-1 floats and the probe read
// them as 0-255 (reporting 14.8:1 for a pair that was failing), and once because the
// `data-palette` / `data-mode` attributes were put on INJECTED DIVS. The tokens are declared on
// `html[data-palette][data-mode]`, so a descendant cannot scope them: that run rendered one
// palette 18 times while looking exactly like a sweep. Both errors would have shipped a failing
// design behind a passing claim.
//
// Three things it therefore does deliberately:
//   1. Switches the attributes on `document.documentElement`, and ASSERTS that `--accent`
//      actually changed between palettes — a sweep that never switched palettes fails loudly
//      instead of reporting 36 identical passes.
//   2. Parses whatever `getComputedStyle` returns, `rgb()` and `color(srgb …)` alike, with the
//      0-1 vs 0-255 distinction handled explicitly.
//   3. Imports the tier values from `present-rail-tiers.ts` — the same module the rail paints
//      from — rather than restating them.
//
// The bar is WCAG 1.4.11 non-text contrast, 3:1. The buffered range is a HATCH drawn in the
// same full-strength ink as the played range, so what has to clear 3:1 is ink-vs-track; buffered
// and played are told apart by pattern, which is not a contrast ratio and is not measured here.
//
//   node scripts/sweep-rail-contrast.mjs          # table + exit 1 on any failure
//   node scripts/sweep-rail-contrast.mjs --json
//
// Needs the preview server (real Studio page, real tokens):
//   npm run build:e2e && npm run preview:e2e

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ORIGIN = process.env.SWEEP_ORIGIN || 'http://localhost:4321';
const TIERS_SRC = fileURLToPath(new URL('../src/components/studio/present-rail-tiers.ts', import.meta.url));
const TOKENS_CSS = fileURLToPath(new URL('../src/styles/lattice-tokens.generated.css', import.meta.url));
const THRESHOLD = 3;

/** Pull the tier expressions out of the shipped module, so the sweep cannot drift from it.
 *  A regex rather than an import because the module is TypeScript and this is plain node —
 *  it fails loudly if the shape changes, which is the point. */
function tierValues() {
	const src = readFileSync(TIERS_SRC, 'utf8');
	const grab = (name) => {
		const m = src.match(new RegExp(`export const ${name}[^=]*= (\`[^\`]*\`|'[^']*')`));
		if (!m) throw new Error(`sweep-rail-contrast: could not read \`${name}\` from present-rail-tiers.ts — did its shape change?`);
		return m[1].slice(1, -1);
	};
	const trackSrc = src.match(/export const trackTier[^=]*=\s*\(here[^)]*\):\s*string\s*=>\s*`([^`]*)`/);
	if (!trackSrc) throw new Error('sweep-rail-contrast: could not read `trackTier`');
	return {
		// These ARE template placeholders — they are the literal text being substituted out of
		// the shipped source, not an interpolation this file forgot to perform.
		// biome-ignore lint/suspicious/noTemplateCurlyInString: substituting the shipped template's own placeholder
		track: trackSrc[1].replace('${here ? 26 : 16}', '16'),
		// biome-ignore lint/suspicious/noTemplateCurlyInString: substituting the shipped template's own placeholder
		trackHere: trackSrc[1].replace('${here ? 26 : 16}', '26'),
		ink: grab('bufferedInk'),
		progress: grab('progressTier'),
	};
}

const palettes = [...new Set([...readFileSync(TOKENS_CSS, 'utf8').matchAll(/data-palette="([a-z0-9-]+)"/g)].map((m) => m[1]))];

async function main() {
	const json = process.argv.includes('--json');
	const tiers = tierValues();
	const browser = await chromium.launch();
	const page = await browser.newPage();
	await page.goto(`${ORIGIN}/studio/`, { waitUntil: 'domcontentloaded' });

	const results = await page.evaluate(
		({ palettes, tiers }) => {
			// getComputedStyle gives `rgb(r g b)` OR `color(srgb r g b)` — the latter in 0-1
			// floats, which is the trap that once produced a 14.8:1 reading for a failing pair.
			const parse = (s) => {
				const nums = (s.match(/-?[\d.]+(?:e-?\d+)?/g) || []).slice(0, 3).map(Number);
				if (nums.length < 3) return null;
				const scale = /color\(/.test(s) ? 255 : 1;
				return nums.map((n) => Math.max(0, Math.min(255, n * scale)));
			};
			const lum = (rgb) => {
				const [r, g, b] = rgb.map((v) => {
					const c = v / 255;
					return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
				});
				return 0.2126 * r + 0.7152 * g + 0.0722 * b;
			};
			const ratio = (a, b) => {
				const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
				return (x + 0.05) / (y + 0.05);
			};

			const probe = document.createElement('div');
			probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:10px;height:10px;';
			document.body.appendChild(probe);
			const resolve = (value) => {
				probe.style.background = '';
				probe.style.background = value;
				return parse(getComputedStyle(probe).backgroundColor);
			};

			const root = document.documentElement;
			const before = { palette: root.dataset.palette, mode: root.dataset.mode };
			const rows = [];
			const accents = new Set();
			for (const palette of palettes) {
				for (const mode of ['light', 'dark']) {
					root.dataset.palette = palette;
					root.dataset.mode = mode;
					// Force a style recalc before reading, so the probe cannot report the
					// previous palette's resolution.
					void root.offsetHeight;
					const accent = resolve('var(--accent)');
					const bg = resolve('var(--bg)');
					const track = resolve(tiers.track);
					const trackHere = resolve(tiers.trackHere);
					const ink = resolve(tiers.ink);
					if (!accent || !bg || !track || !trackHere || !ink) continue;
					accents.add(accent.join(','));
					rows.push({
						palette,
						mode,
						inkVsTrack: +ratio(ink, track).toFixed(2),
						inkVsTrackHere: +ratio(ink, trackHere).toFixed(2),
						trackVsBg: +ratio(track, bg).toFixed(2),
						accentVsBg: +ratio(accent, bg).toFixed(2),
					});
				}
			}
			root.dataset.palette = before.palette ?? '';
			root.dataset.mode = before.mode ?? '';
			probe.remove();
			return { rows, distinctAccents: accents.size };
		},
		{ palettes, tiers },
	);

	await browser.close();
	const { rows, distinctAccents } = results;

	// The guard that would have caught the descendant-scoping mistake: if the sweep never
	// actually switched palettes, every row resolved the same accent and the run proves nothing.
	if (distinctAccents < 5) {
		console.error(`sweep-rail-contrast: only ${distinctAccents} distinct accent values across ${rows.length} combinations — the palette switch is NOT taking effect. Refusing to report.`);
		process.exit(2);
	}

	const failing = rows.filter((r) => r.inkVsTrack < THRESHOLD || r.inkVsTrackHere < THRESHOLD);
	if (json) {
		console.log(JSON.stringify({ threshold: THRESHOLD, combinations: rows.length, distinctAccents, failing: failing.length, rows }, null, 2));
	} else {
		const worst = (k) => rows.reduce((a, r) => (r[k] < a[k] ? r : a));
		console.log(`\n${rows.length} palette/mode combinations · ${distinctAccents} distinct accents · WCAG 1.4.11 bar ${THRESHOLD}:1\n`);
		console.log('| check | worst | where | below 3:1 |');
		console.log('|---|---|---|---|');
		for (const [label, key] of [
			['buffered ink vs track', 'inkVsTrack'],
			['buffered ink vs current-slide track', 'inkVsTrackHere'],
			['track vs bg (resting weight)', 'trackVsBg'],
			['accent vs bg (the total range available)', 'accentVsBg'],
		]) {
			const w = worst(key);
			const under = rows.filter((r) => r[key] < THRESHOLD).length;
			console.log(`| ${label} | ${w[key]}:1 | ${w.palette} ${w.mode} | ${under} / ${rows.length} |`);
		}
		console.log(failing.length ? `\nFAIL — ${failing.length} combination(s) below ${THRESHOLD}:1: ${failing.map((r) => `${r.palette} ${r.mode}`).join(', ')}` : `\nPASS — every combination clears ${THRESHOLD}:1 on both track relationships.`);
		console.log('\nNote: buffered vs played is a PATTERN difference (striped vs solid), not a tone\nrelationship, so it is deliberately not scored here. Both are the same ink.');
	}
	process.exit(failing.length ? 1 : 0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
