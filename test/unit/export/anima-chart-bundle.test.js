/**
 * THE CHART PATH MUST NOT BE ABLE TO REACH ZDOG — a bundle-SHAPE gate, not a behavior test.
 *
 * A chart scene is always `source:'svg'` (`chartToScene` builds an `SvgScene` from the
 * chart's own rendered marks), so the built-primitive backend is unreachable from the chart
 * path. It was still SHIPPED there: `hydrate.ts` imported both backends at module scope and
 * picked between them inline, so any entry that touched the host dragged in both. Measured
 * on a chart-only entry, minified: Zdog was 31,018 bytes raw / 8,316 gzip of 65,613 — 47% of
 * a chart player, for code that cannot execute. Retiring the Vivus backend for the chart path
 * (charts emit no draw verb, so they use `backends/marks.ts`) took the rest: the entry is now
 * 20,981 raw / 8,183 gzip, down from 65,613 / 20,759.
 *
 * THE FIX HAS TWO PARTS, AND THIS FILE EXISTS BECAUSE THE FIRST ALONE DID NOTHING:
 *   1. the host takes `rendererFor` as a required option and imports no backend itself; and
 *   2. the svg-only registry lives in its OWN FILE (`backends/registry-svg.ts`).
 * With (1) but not (2) the saving was 3,223 bytes — esbuild will not drop a Zdog import that
 * merely sits unused beside `svgRendererFor` in the same module, because the package is not
 * provably side-effect-free. "Nothing calls it" is therefore NOT enough to keep it out, which
 * is precisely the kind of invariant that regresses silently: re-merging the two registries,
 * or repointing `chart-anima-hydrate.ts` at `registry.ts`, restores all 31KB with every other
 * test still green.
 *
 * It asserts ABSENCE BY MARKER rather than a byte budget on purpose. A size ceiling drifts
 * with every unrelated change to the shared core and gets re-blessed on autopilot; "Zdog is
 * not in this file" states the actual invariant and cannot be satisfied by rounding.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '../../..');
const LIB = path.join(ROOT, 'docs/src/lib');

/** Bundle the chart hydration path exactly as a chart-only player entry would. */
async function bundleChartPath() {
	const built = await esbuild.build({
		stdin: {
			contents: "import { hydrateChart } from './chart-anima-hydrate';\nglobalThis.__x = hydrateChart;\n",
			resolveDir: LIB,
			loader: 'ts',
			sourcefile: 'chart-entry.ts',
		},
		bundle: true,
		format: 'iife',
		platform: 'browser',
		target: ['chrome109'],
		minify: true,
		write: false,
		legalComments: 'none',
		alias: { '@': path.join(ROOT, 'docs/src') },
	});
	return built.outputFiles[0].text;
}

test('the chart path drops Zdog entirely', async () => {
	const code = await bundleChartPath();
	assert.equal(/[Zz]dog/.test(code), false, 'Zdog reached a chart-only bundle — check that chart-anima-hydrate.ts imports backends/registry-svg.js, not backends/registry.js');
});

test('the shared painter IS on the chart path, so the absence check can tell presence from emptiness', async () => {
	const code = await bundleChartPath();
	// The control for the assertion above. `foreignobject` is a STRIP_TAGS literal in
	// `backends/svg-paint.ts` — a string, so it survives minification where identifiers do
	// not. If this ever fails, the Zdog check above is passing on a bundle that contains
	// nothing rather than on one that correctly excludes a backend.
	assert.ok(code.includes('foreignobject'), 'the shared svg painter is missing from the chart path — the bundle is not what this test thinks it is');
});

test('the DRAWING library is absent too — charts emit no draw verb', async () => {
	const code = await bundleChartPath();
	// `chart-anima.ts` builds only `reveal` + `slide`, so the chart path uses the marks
	// backend and must not pull anime.js in. This is the other half of the byte win: the
	// drawing library belongs only in a bundle that can reach a drawing scene.
	assert.equal(/createDrawable/.test(code), false, 'the drawing library reached a chart-only bundle — check that registry-svg.js points at marks.js, not drawable.js');
});

test('the bundle is real, so the absence assertion is not vacuous', async () => {
	const code = await bundleChartPath();
	assert.ok(code.length > 10000, `chart bundle suspiciously small (${code.length} bytes) — an empty build would pass the Zdog check trivially`);
	assert.ok(code.includes('data-anima-role'), 'the chart mark selector is missing — this is not the chart path');
});
