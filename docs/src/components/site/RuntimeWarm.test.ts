// Gate: the preview RUNTIME bundle is prefetched on every live app surface, and
// the prefetch URL can't drift from the URL the island actually loads it by.
//
// WHY A SOURCE-STRING TEST (not a built-HTML one): the unit tier never runs a
// real `astro build`, so it can't read dist/. But the two failure modes worth
// guarding are both visible in source: (1) an app page silently loses the
// `<RuntimeWarm />` include (the fetch falls back onto the first-render critical
// path — the FRAME REBUILD regression this fixes), and (2) RuntimeWarm's URL
// expression drifts from the pages' own `runtimeUrl`, so the prefetch and the
// iframe's `<script src>` stop sharing one cache entry and the prefetch warms
// nothing. Both are caught here without a build.
// See engineering/decisions/2026-07-11-preview-performance-diagnosis.md (B④).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..'); // docs/src/components/site → docs/src
const read = (p: string) => readFileSync(join(src, p), 'utf8');

// The canonical way BOTH the RuntimeWarm component and each app page's
// `options.runtimeUrl` compose the served runtime URL — a hash-versioned base
// (assetBase) + the fixed filename. If either side stops matching this, the
// prefetch and the iframe request diverge and the warm is dead.
const RUNTIME_FILE = "'lattice-runtime.js'";

describe('RuntimeWarm.astro', () => {
	const warm = read('components/site/RuntimeWarm.astro');

	it('emits a low-priority prefetch (not preload) for the runtime as a script', () => {
		expect(warm).toMatch(/<link\s+rel="prefetch"\s+as="script"\s+href=\{runtimeUrl\}\s*\/>/);
		// preload would compete with the render-blocking CSS / LCP element and warn
		// on unused-in-a-subframe; the whole point is the browser's lowest priority.
		expect(warm).not.toContain('rel="preload"');
	});

	it('derives the URL the SAME way the app pages derive runtimeUrl (shared cache entry)', () => {
		expect(warm).toContain('assetBase()');
		expect(warm).toContain('joinBase(base');
		expect(warm).toContain(RUNTIME_FILE);
	});
});

// Surfaces that live-render a preview ON LOAD — the hero (index), the app pages
// (studio/playground), and every component page (its specimen renders eagerly).
// Each must warm the runtime so the first render doesn't cold-fetch it. The three
// pages that build their OWN runtimeUrl also carry the shared-cache invariant; the
// component LAYOUT delegates the URL to Specimen.astro (asserted separately below).
describe('live-preview surfaces warm the runtime', () => {
	const cases = [
		{ file: 'pages/index.astro', ownsUrl: true },
		{ file: 'pages/studio.astro', ownsUrl: true },
		{ file: 'pages/playground.astro', ownsUrl: true },
		{ file: 'layouts/ComponentsLayout.astro', ownsUrl: false },
	];
	for (const { file, ownsUrl } of cases) {
		it(`${file} imports and renders <RuntimeWarm />`, () => {
			const s = read(file);
			expect(s).toContain("import RuntimeWarm from '../components/site/RuntimeWarm.astro'");
			expect(s).toMatch(/<RuntimeWarm\s*\/>/);
			// The pages that build their own runtimeUrl must keep composing it the same
			// way — the invariant the prefetch depends on to hit one cache entry.
			if (ownsUrl) expect(s).toContain(RUNTIME_FILE);
		});
	}

	it('the component specimen (warmed by ComponentsLayout) is the runtime consumer', () => {
		// ComponentsLayout carries <RuntimeWarm/> but delegates the actual runtime
		// load to the specimen partial it wraps — so THAT is where the URL lives.
		expect(read('components/Specimen.astro')).toContain(RUNTIME_FILE);
	});
});
