// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FRONT_MATTER_KEYS } from '../components/studio/editor-complete';
import { FRONT_MATTER_DOCS, GROUPS } from './front-matter-docs';

// The reference page renders one row per key in the Studio's key list, joined to this
// table. A key in one and not the other would either vanish from the reference or
// document a key the editor does not know, so both directions are pinned.

const keys = FRONT_MATTER_KEYS.map((k) => k.key);

describe('front-matter reference coverage', () => {
	it('documents every key the Studio offers', () => {
		expect(keys.filter((k) => !FRONT_MATTER_DOCS[k])).toEqual([]);
	});

	it('documents no key the Studio does not offer', () => {
		expect(Object.keys(FRONT_MATTER_DOCS).filter((k) => !keys.includes(k))).toEqual([]);
	});

	it('puts every key in a known group', () => {
		const ids = new Set(GROUPS.map((g) => g.id));
		expect(Object.entries(FRONT_MATTER_DOCS).filter(([, d]) => !ids.has(d.group)).map(([k]) => k)).toEqual([]);
	});
});
