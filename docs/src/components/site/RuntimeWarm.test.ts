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

describe('live app pages warm the runtime', () => {
	for (const page of ['studio.astro', 'playground.astro']) {
		it(`${page} imports and renders <RuntimeWarm />`, () => {
			const s = read(join('pages', page));
			expect(s).toContain("import RuntimeWarm from '../components/site/RuntimeWarm.astro'");
			expect(s).toMatch(/<RuntimeWarm\s*\/>/);
			// And it still builds its own runtimeUrl from the same pieces — the
			// invariant the prefetch depends on to hit the same cache entry.
			expect(s).toContain(RUNTIME_FILE);
		});
	}
});
