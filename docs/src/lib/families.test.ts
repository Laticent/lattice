import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { BUCKET_FALLBACK_KEYS, FAMILY_DEFS, familyOf } from './families.mjs';

// The docs picker's shape taxonomy, and the FLOOR under it.
//
// `FAMILY_DEFS` is editorial and stays hand-written: it deliberately keeps `split-*` whole
// and makes math its own family rather than a lodger in "Code & math". A machine can group
// by bucket; only a person can say which shape family a component reads as.
//
// What `familyOf()` gained is a bucket fallback BEFORE `'other'`, so a component nobody has
// curated lands somewhere plausible instead of in a bucket nobody named — a dropped chart
// reaches the picker with no edit here. That fallback moves four components that ship today,
// and this file pins WHICH four. It is a user-visible change to the component browser, so a
// fifth joining them should be a decision, not a side effect of adding a component.
//
// See engineering/decisions/2026-09-13-projected-rosters.md § "families.mjs is a floor".

type Manifest = { name: string; bucket?: string; function?: string };

const require = createRequire(import.meta.url);
const loadAll: () => Manifest[] = require('../../../lib/components').loadAll;
const bucketOf = (m: Manifest) => m.bucket || m.function;

describe('familyOf', () => {
	it('prefers the curated membership over the bucket', () => {
		// `math` is its own family, not the `math` bucket's fallback by luck: both say math,
		// so use a case where they genuinely differ. `timeline-list` is a CHART bucket
		// component curated into "Timelines & roadmaps".
		expect(familyOf('timeline-list', 'chart')).toBe('timelines');
		expect(familyOf('roadmap', 'chart')).toBe('timelines');
		// …while an uncurated chart falls through to the bucket.
		expect(familyOf('tempo-bars', 'chart')).toBe('charts');
	});

	it('falls back to `other` with no bucket, and for a bucket with no mapping', () => {
		expect(familyOf('tempo-bars')).toBe('other');
		expect(familyOf('whatever', 'connect')).toBe('other');
	});

	it('every fallback target is a real family key', () => {
		const keys = new Set(FAMILY_DEFS.map((d) => d.key));
		for (const [bucket, family] of BUCKET_FALLBACK_KEYS) {
			expect(keys, `${bucket} → ${family} is not a FAMILY_DEFS key`).toContain(family);
		}
	});

	it('moves exactly four shipped components out of `other`', () => {
		const moved = loadAll()
			.filter((m) => familyOf(m.name, bucketOf(m)) !== familyOf(m.name))
			.map((m) => [m.name, familyOf(m.name, bucketOf(m))])
			.sort();
		expect(moved).toEqual([
			['matrix-grid', 'charts'],
			['policy-recommendation', 'legal'],
			['scene', 'images'],
			['video', 'images'],
		]);
	});

	it('leaves six in `other`, whose buckets have no unambiguous shape family', () => {
		// Not a defect to fix mechanically: `connect`, `progression`, `inventory`,
		// `statement` and `evidence` each span more than one shape, so picking a family
		// for them is an editorial call. Pinned so the residue stays visible.
		const other = loadAll()
			.filter((m) => familyOf(m.name, bucketOf(m)) === 'other')
			.map((m) => m.name)
			.sort();
		expect(other).toEqual(['contact', 'cycle', 'inventory', 'premise', 'team-profile', 'wifi']);
	});
});
