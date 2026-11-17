import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentSources } from './lastmod.mjs';

const REPO = path.resolve(__dirname, '../../..');

describe('contentSources', () => {
	it('maps each kind of page to its main-content source', () => {
		expect(contentSources('/', REPO)).toEqual(['docs/src/pages/index.astro']);
		expect(contentSources('/features/', REPO)).toEqual(['docs/src/pages/features.astro']);
		// The index renders the whole catalog, so every component is its content.
		expect(contentSources('/components/', REPO)).toEqual(['docs/src/pages/components/index.astro', 'lib/components', 'lib/plugins/chart-family/kinds']);
		expect(contentSources('/components/statement/quote/', REPO)).toEqual(['lib/components/statement/quote']);
		expect(contentSources('/components/chart/bar/', REPO)).toEqual(['lib/plugins/chart-family/kinds/bar']);
		expect(contentSources('/plugins/math/learn/', REPO)).toEqual(['docs/src/content/catalog/plugins/math.md']);
		expect(contentSources('/libraries/filo/learn/', REPO)).toEqual(['docs/src/content/catalog/libraries/filo.md']);
		expect(contentSources('/getting-started/', REPO)?.[0]).toMatch(/^docs\/src\/content\/docs\/getting-started\.mdx?$/);
	});

	it('returns null for a route it does not know, so the gate asks for a mapping', () => {
		expect(contentSources('/no-such-page/', REPO)).toBeNull();
		expect(contentSources('/plugins/no-such-plugin/', REPO)).toBeNull();
	});
});
