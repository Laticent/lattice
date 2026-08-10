import { describe, expect, it } from 'vitest';
import { getClassTokens, setClassTokens } from './slide-directives';
import { applyVariant, componentLooks, humanizeVariant, variantActive, variantNoop, variantSample } from './slide-variants';

// Variants as class-token surgery (2026-07-18-slide-variants-in-gallery.md). The token
// mutators (slide-directives) are covered separately; these lock the variant semantics:
// axis-aware replace, additive add, multi-token variants, and default-clear.

const BASE = '<!-- _class: quote -->\n\n> Words.\n\n— Someone';
const toks = (chunk: string) => getClassTokens(chunk);

// A DECLARED variant set — the component's own alternate forms (like kpi's), NOT the
// universal config (dark / no-footer / insight-*) that lives in slide settings.
const KPI = ['attention', 'ops', 'compliance', 'trajectory', 'spotlight'];
const KBASE = '<!-- _class: kpi -->\n\n1. 100\n   - Done';
const kwith = (tokens: string[]) => setClassTokens(KBASE, tokens);

// kpi's five looks really ARE one family — declare it the way a manifest would.
const KPI_AXES = [{ label: 'Emphasis', exclusive: true, members: KPI }];

// `map`'s real shape (lib/components/chart/map/map.manifest.json): a pick-ONE Basemap
// with a default, PLUS independent modifiers that legitimately stack. The catalog ships
// `map world highlight robinson`, so a blanket pick-one family would silently eat two of
// the author's three tokens.
const MAP = ['us', 'world', 'highlight', 'robinson', 'grouped'];
const MAP_AXES = [
	{ label: 'Basemap', exclusive: true, default: 'world', members: ['world', 'us'] },
	{ label: 'Modifier', members: ['highlight', 'robinson', 'grouped'] },
];
const MBASE = '<!-- _class: map -->\n\n## Where we sell';
const mwith = (tokens: string[]) => setClassTokens(MBASE, tokens);

describe('slide-variants — variant looks are class tokens', () => {
	it('componentLooks leads with Default then the declared variants', () => {
		const looks = componentLooks(KPI);
		expect(looks[0]).toEqual({ token: '', label: 'Default', axis: '', exclusive: true });
		// Unclassified — no manifest axes supplied — so the look TOGGLES rather than swaps.
		expect(looks.find((l) => l.token === 'ops')).toEqual({ token: 'ops', label: 'ops', axis: '', exclusive: false });
		expect(looks).toHaveLength(KPI.length + 1);
	});

	it('componentLooks tags each look from the component\'s OWN axes', () => {
		const looks = componentLooks(MAP, {}, MAP_AXES);
		// Pick-ONE basemap → the tile swaps…
		expect(looks.find((l) => l.token === 'world')).toEqual({ token: 'world', label: 'world', axis: 'Basemap', exclusive: true });
		// …while a modifier stacks, so its tile is a toggle.
		expect(looks.find((l) => l.token === 'highlight')).toEqual({ token: 'highlight', label: 'highlight', axis: 'Modifier', exclusive: false });
	});

	it('humanizeVariant swaps dashes for spaces', () => {
		expect(humanizeVariant('insight-next-step')).toBe('insight next step');
	});

	it('variantSample adds the token to the skeleton _class (empty = unchanged)', () => {
		expect(variantSample(KBASE, '')).toBe(KBASE);
		expect(toks(variantSample(KBASE, 'ops'))).toEqual(['kpi', 'ops']);
		// A multi-token variant merges BOTH sub-tokens…
		expect(toks(variantSample(BASE, 'tint-corner at-tl'))).toEqual(['quote', 'tint-corner', 'at-tl']);
		// …and never double-adds when re-applied.
		const once = variantSample(BASE, 'tint-corner at-tl');
		expect(variantSample(once, 'tint-corner at-tl')).toBe(once);
	});

	it('applyVariant swaps within an EXCLUSIVE axis the component declares', () => {
		const cur = kwith(['kpi', 'ops']);
		// Reshaping to another kpi form REPLACES the current one — never `kpi ops spotlight`.
		expect(toks(applyVariant(cur, 'spotlight', {}, KPI, KPI_AXES))).toEqual(['kpi', 'spotlight']);
	});

	it('applyVariant keeps INDEPENDENT axes independent — the #1281 over-strip trap', () => {
		// `map world highlight robinson` ships in examples/global-south.md. Changing the
		// basemap must not eat the modifiers, and adding a modifier must not eat the basemap.
		const cur = mwith(['map', 'world', 'highlight', 'robinson']);
		expect(toks(applyVariant(cur, 'us', {}, MAP, MAP_AXES))).toEqual(['map', 'highlight', 'robinson', 'us']);
		expect(toks(applyVariant(cur, 'grouped', {}, MAP, MAP_AXES))).toEqual(['map', 'world', 'highlight', 'robinson', 'grouped']);
	});

	it('applyVariant TOGGLES an unclassified look, so it can never stack forever', () => {
		// No manifest axes → we do not know the grouping. Adding is safe, and clicking the
		// same tile again takes it back off. What must NOT happen is silent stripping.
		let cur = kwith(['kpi', 'ops']);
		cur = applyVariant(cur, 'spotlight', {}, KPI, []);
		expect(toks(cur)).toEqual(['kpi', 'ops', 'spotlight']);
		expect(toks(applyVariant(cur, 'spotlight', {}, KPI, []))).toEqual(['kpi', 'ops']);
	});

	it('applyVariant Default restores an exclusive axis\'s declared default', () => {
		// A map with no basemap is not a base form, it is a broken slide.
		const cur = mwith(['map', 'us', 'highlight', 'grouped']);
		expect(toks(applyVariant(cur, '', {}, MAP, MAP_AXES))).toEqual(['map', 'world']);
	});

	it('applyVariant keeps non-variant tokens (universal config from slide settings) untouched', () => {
		const cur = kwith(['kpi', 'ops', 'dark', 'no-footer']);
		// dark / no-footer are not the component's variants → they survive a reshape.
		expect(toks(applyVariant(cur, 'spotlight', {}, KPI, KPI_AXES))).toEqual(['kpi', 'dark', 'no-footer', 'spotlight']);
	});

	it('applyVariant treats a multi-token look as one unit, on and back off', () => {
		const once = applyVariant(BASE, 'tint-corner at-tl', {}, [], []);
		expect(toks(once)).toEqual(['quote', 'tint-corner', 'at-tl']);
		// Never a double-add; a second pick clears BOTH sub-tokens together.
		expect(toks(applyVariant(once, 'tint-corner at-tl', {}, [], []))).toEqual(['quote']);
	});

	it('applyVariant default (empty token) strips every declared variant, keeps the rest', () => {
		const cur = kwith(['kpi', 'ops', 'dark']);
		// Back to the base kpi form; dark (universal config) stays — it's not a kpi variant.
		expect(toks(applyVariant(cur, '', {}, KPI, KPI_AXES))).toEqual(['kpi', 'dark']);
	});

	it('applyVariant never stacks across repeated reshapes (#1281)', () => {
		// The reported bug: reshaping again and again grew `_class` — `kpi ops spotlight
		// trajectory` — instead of swapping. Walk the family and assert exactly one member
		// survives at every step, then that Default returns the slide to the base form.
		let cur = KBASE;
		for (const look of ['ops', 'spotlight', 'trajectory', 'attention']) {
			cur = applyVariant(cur, look, {}, KPI, KPI_AXES);
			expect(toks(cur)).toEqual(['kpi', look]);
		}
		expect(toks(applyVariant(cur, '', {}, KPI, KPI_AXES))).toEqual(['kpi']);
	});

	it('applyVariant Default keeps the author\'s UNIVERSAL slide settings', () => {
		// `scale-*` / `no-period` / `tone-*` are vocab-axis tokens set in the slide drawer,
		// not looks this picker offers — Reshape must not delete a setting it never showed,
		// because there is no tile to get it back from.
		const VOCAB = { scale: ['scale-s', 'scale-xl'], period: ['no-period'], tone: ['tone-warn'] };
		const cur = kwith(['kpi', 'ops', 'scale-xl', 'no-period', 'dark']);
		expect(toks(applyVariant(cur, '', VOCAB, KPI, KPI_AXES))).toEqual(['kpi', 'scale-xl', 'no-period', 'dark']);
	});

	it('applyVariant re-picking the ACTIVE exclusive look changes nothing at all', () => {
		// setGroupToken removes-then-appends, so a naive re-pick reordered `_class`
		// (`map world highlight` → `map highlight world`): no visual change, but it dirties
		// the deck and burns an undo checkpoint on a click that did nothing.
		const cur = mwith(['map', 'world', 'highlight']);
		expect(applyVariant(cur, 'world', {}, MAP, MAP_AXES)).toBe(cur);
	});

	it('applyVariant Default is byte-identical when it has nothing to change', () => {
		// The guard used to sit only on the exclusive branches, so Default still reordered:
		// `map world dark` → `map dark world` (strip, then append the axis default AFTER the
		// surviving `dark`). Same tokens, new bytes, an undo step spent on nothing.
		const cur = mwith(['map', 'world', 'dark']);
		expect(applyVariant(cur, '', {}, MAP, MAP_AXES)).toBe(cur);
		// Protecting the universal tokens created MORE of these, not fewer: before the fix
		// these were real edits (the vocab token got stripped), now they change nothing.
		const withVocab = mwith(['map', 'world', 'scale-xl']);
		expect(applyVariant(withVocab, '', { scale: ['scale-xl'] }, MAP, MAP_AXES)).toBe(withVocab);
	});

	it('variantNoop tells the Default tile whether clicking would really change nothing', () => {
		// The bug this closes: a bare `map` has no look active, so the Default tile badged
		// itself "Current" and previewed the slide unchanged — then clicking it wrote
		// `map world`, because Default restores the axis default.
		expect(variantNoop(MBASE, '', {}, MAP, MAP_AXES)).toBe(false);
		expect(toks(applyVariant(MBASE, '', {}, MAP, MAP_AXES))).toEqual(['map', 'world']);
		// Once the default IS present, Default really is a no-op.
		expect(variantNoop(mwith(['map', 'world']), '', {}, MAP, MAP_AXES)).toBe(true);
	});

	it('variantActive requires ALL sub-tokens of a look to be present', () => {
		const present = new Set(['quote', 'tint-corner', 'at-tl']);
		expect(variantActive(present, 'tint-corner at-tl')).toBe(true);
		expect(variantActive(new Set(['quote', 'tint-corner']), 'tint-corner at-tl')).toBe(false);
		expect(variantActive(present, 'ops')).toBe(false);
		expect(variantActive(present, '')).toBe(false);
	});
});
