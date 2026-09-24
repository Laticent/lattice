// @vitest-environment node
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPONENT_GUIDES, guidesFor } from './component-guides.mjs';

// The component pages link to the Status and labels guide through this map. A
// component rename or a moved guide page would otherwise leave a link that 404s
// with nothing to catch it, so both ends are pinned here.

const docsRoot = join(__dirname, '..', '..');
const repoRoot = join(docsRoot, '..');
const require = createRequire(import.meta.url);
const { loadAll } = require(join(repoRoot, 'lib/components/index.js'));
const names = new Set(loadAll().map((m: { name: string }) => m.name));

function pageExists(slug: string) {
	const base = join(docsRoot, 'src/content/docs', slug);
	return ['.md', '.mdx', '/index.md', '/index.mdx'].some((ext) => existsSync(base + ext));
}

describe('component guide links', () => {
	it('names only components that exist', () => {
		const missing = Object.keys(COMPONENT_GUIDES).filter((n) => !names.has(n));
		expect(missing).toEqual([]);
	});

	it('points only at guide pages that exist', () => {
		const dead = Object.values(COMPONENT_GUIDES)
			.flat()
			.map((g) => g.slug)
			.filter((slug) => !pageExists(slug));
		expect(dead).toEqual([]);
	});

	it('returns an empty list for a component with no guide', () => {
		expect(guidesFor('title')).toEqual([]);
	});
});
