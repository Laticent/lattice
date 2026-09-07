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
	readingSlideIndex,
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

describe('slideTranscript — comment stripping reaches a fixed point', () => {
	test('a nested/crafted comment cannot survive one pass and leak through', () => {
		const crafted = '<!<!-- x -->-- <script>alert(1)</script> -->\n\n# Real heading\n';
		const t = slideTranscript(crafted);
		expect(t).not.toContain('<!--');
		expect(t).not.toContain('script');
		expect(t).toContain('Real heading');
	});
});

// The inverse of the walk's scroll (#2103). These cases are the ones the rejected rules
// (an anchor line, the viewport centre) each get wrong, plus the narrow-width case that
// forced the hysteresis clause — see the docblock on `readingSlideIndex`.
describe('readingSlideIndex — the slide the reader is actually on', () => {
	/** REAL geometry, measured on `?c=kpi` at 1440x900: 13 slides, 668px apart, each 652px
	 *  of VISUAL height in a 693px pane. The stepper scrolls to `top - 16`. */
	const KPI = Array.from({ length: 13 }, (_, i) => ({ top: 36 + i * 668, height: 652 }));
	const VH = 693;
	/** …and on the phone, 390x844, where the same deck lays out three slides to a pane and
	 *  the filmstrip's scroll clamps 365px short of putting the last one at the top. */
	const PHONE = Array.from({ length: 13 }, (_, i) => ({ top: 36 + i * 195, height: 179 }));
	const PHONE_VH = 579;
	const PHONE_MAX_SCROLL = 2010;
	const stepTo = (bands: { top: number }[], i: number) => Math.max(0, bands[i].top - 16);

	test('an empty deck reads as slide 0 rather than throwing', () => {
		expect(readingSlideIndex([], 0, VH)).toBe(0);
		expect(readingSlideIndex([], 4000, VH, 3)).toBe(0);
	});

	test('every slide the stepper lands on reads back as that slide', () => {
		for (let i = 0; i < KPI.length; i++) {
			expect(readingSlideIndex(KPI, stepTo(KPI, i), VH)).toBe(i);
		}
	});

	test('the top and the bottom of the filmstrip read as the first and last slides', () => {
		expect(readingSlideIndex(KPI, 0, VH)).toBe(0);
		expect(readingSlideIndex(KPI, KPI[12].top + KPI[12].height - VH, VH)).toBe(12);
	});

	test('a free scroll between two slides reads as whichever fills more of the pane', () => {
		expect(readingSlideIndex(KPI, stepTo(KPI, 5) + 100, VH)).toBe(5);
		expect(readingSlideIndex(KPI, stepTo(KPI, 5) + 500, VH)).toBe(6);
	});

	test('the index rises monotonically as the reader scrolls down', () => {
		let prev = 0;
		for (let y = 0; y <= KPI[12].top + KPI[12].height; y += 37) {
			const i = readingSlideIndex(KPI, y, VH);
			expect(i).toBeGreaterThanOrEqual(prev);
			prev = i;
		}
		expect(prev).toBe(12);
	});

	test('a slide SHORTER than the pane still reads back from its own landing', () => {
		// The case that breaks a centre-line rule: at 200px tall in a 693px pane the pane's
		// centre after a step to slide i sits inside slide i+1, so a centre rule reports
		// i+1 for a jump to i. Overlap does not.
		const short = Array.from({ length: 8 }, (_, i) => ({ top: 20 + i * 200, height: 184 }));
		for (let i = 0; i < 6; i++) expect(readingSlideIndex(short, stepTo(short, i), 693)).toBe(i);
	});

	test('a slide TALLER than the pane reads as itself the whole way down', () => {
		const tall = Array.from({ length: 4 }, (_, i) => ({ top: i * 1600, height: 1560 }));
		for (const y of [0, 400, 900, 1200]) expect(readingSlideIndex(tall, y, VH)).toBe(0);
		// The handover is where the gap between two tall slides tips the pane over, not at
		// the next slide's top: by 1400 the reader sees 160px of slide 0 and 493 of slide 1.
		expect(readingSlideIndex(tall, 1400, VH)).toBe(1);
	});

	test('a tie splits to the LOWER index — the counter never runs ahead of the reader', () => {
		const two = [
			{ top: 0, height: 400 },
			{ top: 400, height: 400 },
		];
		expect(readingSlideIndex(two, 200, 400)).toBe(0);
	});

	// ── The hysteresis clause ──────────────────────────────────────────────────

	test('the END of a phone filmstrip keeps the last slide, which pure overlap cannot', () => {
		// Three slides fully on screen and the scroll clamped: slides 11, 12 and 13 each
		// show ~179px, so the unbiased winner is the LOWEST of them. The reader who just
		// pressed End is looking at the end of the deck, and the bar must say so.
		expect(readingSlideIndex(PHONE, PHONE_MAX_SCROLL, PHONE_VH)).toBe(11);
		expect(readingSlideIndex(PHONE, PHONE_MAX_SCROLL, PHONE_VH, 12)).toBe(12);
	});

	test('a small nudge of the wheel does not twitch the counter off the current slide', () => {
		const at = stepTo(PHONE, 5);
		expect(readingSlideIndex(PHONE, at + 50, PHONE_VH, 5)).toBe(5);
		expect(readingSlideIndex(PHONE, at + 90, PHONE_VH, 5)).toBe(5);
	});

	test('but a real scroll off the slide DOES move the counter', () => {
		// Once the current slide is gone from the pane there is nothing left to keep.
		expect(readingSlideIndex(PHONE, stepTo(PHONE, 5) + 195, PHONE_VH, 5)).toBe(6);
		expect(readingSlideIndex(KPI, stepTo(KPI, 5) + 2000, VH, 5)).toBe(8);
		// The defect this whole function exists for: a wheel from the title to slide 6 with
		// the chrome still claiming slide 1.
		expect(readingSlideIndex(KPI, 3620, VH, 0)).toBe(5);
	});

	test('hysteresis cannot resurrect an index the deck no longer has', () => {
		expect(readingSlideIndex(KPI, 0, VH, 99)).toBe(0);
		expect(readingSlideIndex(KPI, 3620, VH, -1)).toBe(5);
	});

	test('every phone step lands on a slide the reader can actually see', () => {
		// The honest invariant, asserted directly: whatever index comes back, that slide is
		// on screen. Held across the whole deck at the width where three share the pane.
		for (let i = 0; i < PHONE.length; i++) {
			const y = Math.min(stepTo(PHONE, i), PHONE_MAX_SCROLL);
			const got = readingSlideIndex(PHONE, y, PHONE_VH, i);
			const b = PHONE[got];
			const visible = Math.min(y + PHONE_VH, b.top + b.height) - Math.max(y, b.top);
			expect(visible, `slide ${got + 1} is off screen at scroll ${y}`).toBeGreaterThan(b.height * 0.5);
		}
	});
});
