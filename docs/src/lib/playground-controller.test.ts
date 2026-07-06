// Unit: the playground's pure state kernel (2026-07-05 Specimen Book §4) —
// fingerprint-pristine, the one-shot handoff contract, the unknown-key
// fallback, the startup-mode precedence rule, and the variant-sync
// discriminator. DOM-free by design; the React layer only wires these.

import { describe, expect, test } from 'vitest';
import {
	type Catalog,
	classTokenLine,
	detectComponent,
	fingerprint,
	isPristine,
	makeHandoff,
	readHandoff,
	resolveComponent,
	resolveStartupView,
} from './playground-controller';

const CATALOG: Catalog = {
	'big-number': { skeleton: '', sample: '<!-- _class: big-number -->\n\n- 1\n', variants: [] },
	kpi: {
		skeleton: '',
		sample: '<!-- _class: kpi -->\n\n1. 4\n',
		variants: [{ key: 'spotlight', label: 'spotlight', caption: '', sample: '<!-- _class: kpi spotlight -->\n' }],
	},
};

describe('fingerprint / isPristine (invariant I3)', () => {
	test('an empty or whitespace draft is always pristine', () => {
		expect(isPristine('', null)).toBe(true);
		expect(isPristine('  \n ', 'anything')).toBe(true);
	});

	test('a draft matching its insert-time hash is pristine; an edited one is not', () => {
		const md = CATALOG.kpi.sample;
		const h = fingerprint(md);
		expect(isPristine(md, h)).toBe(true);
		expect(isPristine(`${md}\nedited`, h)).toBe(false);
	});

	test('catalog changed between insert and handoff: the OLD bytes stay pristine', () => {
		// The fleet-wide trap the fingerprint model exists to avoid: the catalog
		// sample is rewritten in a deploy, but the user's untouched draft still
		// hashes to what was inserted — it must NOT read as dirty.
		const oldSample = '<!-- _class: kpi -->\n\nold bytes\n';
		const h = fingerprint(oldSample);
		const newCatalogSample = CATALOG.kpi.sample;
		expect(oldSample).not.toBe(newCatalogSample);
		expect(isPristine(oldSample, h)).toBe(true);
	});

	test('no recorded hash and a non-empty draft reads dirty (protect by default)', () => {
		expect(isPristine('# something the user typed', null)).toBe(false);
	});
});

describe('handoff payload (invariant I4)', () => {
	test('round-trips through makeHandoff/readHandoff', () => {
		const h = readHandoff(makeHandoff('# deck', 'the landing page', 123));
		expect(h).toEqual({ md: '# deck', from: 'the landing page', ts: 123 });
	});

	test('malformed payloads read as no-handoff, never a throw', () => {
		expect(readHandoff(null)).toBeNull();
		expect(readHandoff('')).toBeNull();
		expect(readHandoff('not json')).toBeNull();
		expect(readHandoff('{"md":""}')).toBeNull();
		expect(readHandoff('{"from":"x"}')).toBeNull();
	});

	test('missing origin/ts default sanely', () => {
		const h = readHandoff('{"md":"# d"}');
		expect(h).toEqual({ md: '# d', from: 'link', ts: 0 });
	});
});

describe('resolveComponent — the unknown-key fallback (invariant I5)', () => {
	test('a live catalog name resolves to itself', () => {
		expect(resolveComponent(CATALOG, 'kpi')).toEqual({ name: 'kpi', fallback: false });
	});

	test('a renamed/retired component falls back to the first catalog entry, flagged', () => {
		expect(resolveComponent(CATALOG, 'retired-thing')).toEqual({ name: 'big-number', fallback: true });
	});

	test('no persisted pointer at all resolves silently', () => {
		expect(resolveComponent(CATALOG, null)).toEqual({ name: 'big-number', fallback: false });
	});
});

describe('resolveStartupView — the mode precedence rule (invariant I2)', () => {
	test('an incoming handoff forces edit', () => {
		expect(resolveStartupView({ hasHandoff: true, savedView: 'read', source: '', insertedHash: null })).toBe('edit');
	});

	test('an explicit saved view wins next', () => {
		expect(resolveStartupView({ hasHandoff: false, savedView: 'read', source: 'dirty', insertedHash: null })).toBe('read');
		expect(resolveStartupView({ hasHandoff: false, savedView: 'edit', source: '', insertedHash: null })).toBe('edit');
	});

	test('no saved view: pristine opens the walkthrough, a dirty draft opens the editor', () => {
		const md = '# mine';
		expect(resolveStartupView({ hasHandoff: false, savedView: null, source: '', insertedHash: null })).toBe('read');
		expect(resolveStartupView({ hasHandoff: false, savedView: null, source: md, insertedHash: fingerprint(md) })).toBe('read');
		expect(resolveStartupView({ hasHandoff: false, savedView: null, source: md, insertedHash: null })).toBe('edit');
	});
});

describe('classTokenLine — the variant-sync discriminator', () => {
	test('extracts and normalizes the first class token line', () => {
		expect(classTokenLine('<!-- _class:  kpi   spotlight -->\n\nbody')).toBe('kpi spotlight');
	});

	test('no class line reads as empty (the detached state)', () => {
		expect(classTokenLine('# just markdown')).toBe('');
	});

	test('body edits do not change the discriminator; class edits do', () => {
		const a = '<!-- _class: kpi spotlight -->\n\nfirst body';
		const b = '<!-- _class: kpi spotlight -->\n\nsecond body, totally different';
		const c = '<!-- _class: kpi -->\n\nfirst body';
		expect(classTokenLine(a)).toBe(classTokenLine(b));
		expect(classTokenLine(a)).not.toBe(classTokenLine(c));
	});
});

describe('detectComponent still anchors the draft state', () => {
	test('detects component + variant from the first class line', () => {
		expect(detectComponent(CATALOG, '<!-- _class: kpi spotlight -->')).toEqual({ name: 'kpi', variant: 'spotlight' });
	});

	test('returns null for a draft with no recognized component (the clear case)', () => {
		expect(detectComponent(CATALOG, '## plain markdown, no class line')).toBeNull();
	});
});
