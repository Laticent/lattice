// Unit: the playground's pure state kernel (2026-07-05 Specimen Book §4) —
// fingerprint-pristine, the one-shot handoff contract, the unknown-key
// fallback, the startup-mode precedence rule, and the variant-sync
// discriminator. DOM-free by design; the React layer only wires these.

import { describe, expect, test } from 'vitest';
import {
	adjacentComponent,
	type Catalog,
	classTokenLine,
	detectComponent,
	fingerprint,
	isPristine,
	makeHandoff,
	parsePlaygroundUrl,
	playgroundQuery,
	readHandoff,
	readPlan,
	resolveComponent,
	resolvePlanStep,
	resolveStartupView,
	slideTranscript,
	walkChipLabel,
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

// ── PR 6: the Explore surface's kernel (plans, URL scheme, walk helpers) ─────

describe('readPlan — plan consumption including the 404/garbage path', () => {
	const good = JSON.stringify({ name: 'kpi', slides: [{ kind: 'title', caption: 'c', md: '# t' }] });

	test('parses a staged plan payload', () => {
		expect(readPlan(good)).toEqual({ name: 'kpi', slides: [{ kind: 'title', caption: 'c', md: '# t' }] });
	});

	test('404 bodies, garbage, and foreign shapes read as no-plan — never a throw', () => {
		expect(readPlan(null)).toBeNull();
		expect(readPlan('')).toBeNull();
		expect(readPlan('<html>404</html>')).toBeNull();
		expect(readPlan('{"name":"kpi","slides":[]}')).toBeNull();
		expect(readPlan('{"name":"kpi","slides":[{"kind":"title"}]}')).toBeNull();
	});

	test('missing captions default to empty, not undefined', () => {
		const p = readPlan('{"name":"x","slides":[{"kind":"default","md":"m"}]}');
		expect(p?.slides[0].caption).toBe('');
	});
});

describe('resolvePlanStep — the I5 unknown-step fallback', () => {
	const plan = { name: 'kpi', slides: [{ kind: 'title', caption: '', md: '' }, { kind: 'variant:dense', caption: '', md: '' }] };

	test('a live kind lands on its slide', () => {
		expect(resolvePlanStep(plan, 'variant:dense')).toEqual({ index: 1, notice: null });
	});

	test('no step is silently the title slide', () => {
		expect(resolvePlanStep(plan, null)).toEqual({ index: 0, notice: null });
	});

	test('a renamed/removed kind falls back to the title slide with a notice', () => {
		const r = resolvePlanStep(plan, 'variant:retired');
		expect(r.index).toBe(0);
		expect(r.notice).toContain('retired');
		expect(r.notice).toContain('kpi');
	});
});

describe('URL scheme — parse and serialize', () => {
	test('reads ?c&view&s (and accepts view=explore as read)', () => {
		expect(parsePlaygroundUrl('?c=kpi&view=read&s=variant:dense')).toEqual({ c: 'kpi', view: 'read', s: 'variant:dense', v: null });
		expect(parsePlaygroundUrl('?view=explore')).toMatchObject({ view: 'read' });
		expect(parsePlaygroundUrl('?view=nonsense')).toMatchObject({ view: null });
		expect(parsePlaygroundUrl('')).toEqual({ c: null, view: null, s: null, v: null });
	});

	test('serializes the walk position, omitting defaults', () => {
		expect(playgroundQuery({ c: 'kpi', view: 'read', s: 'variant:dense' })).toBe('?c=kpi&view=read&s=variant%3Adense');
		expect(playgroundQuery({ c: 'kpi', view: 'read', s: 'title' })).toBe('?c=kpi&view=read');
		expect(playgroundQuery({})).toBe('');
	});

	test('an explicit ?view= wins over the persisted view, loses to a handoff', () => {
		expect(resolveStartupView({ hasHandoff: false, savedView: 'edit', urlView: 'read', source: '', insertedHash: null })).toBe('read');
		expect(resolveStartupView({ hasHandoff: true, savedView: 'edit', urlView: 'read', source: '', insertedHash: null })).toBe('edit');
	});
});

describe('walk helpers', () => {
	test('adjacentComponent walks the picker order and stops at the ends', () => {
		const order = ['a', 'b', 'c'];
		expect(adjacentComponent(order, 'a', 1)).toBe('b');
		expect(adjacentComponent(order, 'c', 1)).toBeNull();
		expect(adjacentComponent(order, 'a', -1)).toBeNull();
		expect(adjacentComponent(order, 'zz', 1)).toBeNull();
	});

	test('walk chips are full words, never single letters (§0.6)', () => {
		expect(walkChipLabel('title')).toBe('Title');
		expect(walkChipLabel('stress')).toBe('Stress test');
		expect(walkChipLabel('anti-patterns')).toBe('Anti-patterns');
		expect(walkChipLabel('variant:dense', { dense: 'dense rows' })).toBe('dense rows');
		expect(walkChipLabel('composition:dark')).toBe('+ dark');
		for (const k of ['title', 'default', 'stress', 'see-also', 'variant:dense', 'composition:dark']) {
			expect(walkChipLabel(k).length).toBeGreaterThan(1);
		}
	});

	test('slideTranscript extracts readable copy, drops directives and syntax', () => {
		const md = '<!-- _class: kpi -->\n<!-- _footer: "x" -->\n\n## Heading here\n\n1. **42%** metric\n   - detail line\n\n| a | b |\n| --- | --- |\n| c1 | c2 |\n';
		const t = slideTranscript(md);
		expect(t).toContain('Heading here');
		expect(t).toContain('42% metric');
		expect(t).toContain('detail line');
		expect(t).toContain('c1 · c2');
		expect(t).not.toContain('_class');
		expect(t).not.toContain('**');
	});
});
