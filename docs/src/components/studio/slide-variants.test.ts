import { describe, expect, it } from 'vitest';
import { getClassTokens, setClassTokens } from './slide-directives';
import { applyVariant, componentLooks, humanizeVariant, variantActive, variantSample } from './slide-variants';

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

describe('slide-variants — variant looks are class tokens', () => {
	it('componentLooks leads with Default then the declared variants', () => {
		const looks = componentLooks(KPI);
		expect(looks[0]).toEqual({ token: '', label: 'Default', axis: '' });
		expect(looks.find((l) => l.token === 'ops')).toEqual({ token: 'ops', label: 'ops', axis: '' });
		expect(looks).toHaveLength(KPI.length + 1);
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

	it("applyVariant treats a component's declared variants as a pick-ONE family", () => {
		const cur = kwith(['kpi', 'ops']);
		// Reshaping to another kpi form REPLACES the current one — never `kpi ops spotlight`.
		expect(toks(applyVariant(cur, 'spotlight', {}, KPI))).toEqual(['kpi', 'spotlight']);
	});

	it('applyVariant keeps non-variant tokens (universal config from slide settings) untouched', () => {
		const cur = kwith(['kpi', 'ops', 'dark', 'no-footer']);
		// dark / no-footer are not the component's variants → they survive a reshape.
		expect(toks(applyVariant(cur, 'spotlight', {}, KPI))).toEqual(['kpi', 'dark', 'no-footer', 'spotlight']);
	});

	it('applyVariant handles a multi-token additive look idempotently', () => {
		const AXES = {};
		const once = applyVariant(BASE, 'tint-corner at-tl', AXES, []);
		expect(toks(once)).toEqual(['quote', 'tint-corner', 'at-tl']);
		expect(applyVariant(once, 'tint-corner at-tl', AXES, [])).toBe(once); // no double-add
	});

	it('applyVariant default (empty token) strips every declared variant, keeps the rest', () => {
		const cur = kwith(['kpi', 'ops', 'dark']);
		// Back to the base kpi form; dark (universal config) stays — it's not a kpi variant.
		expect(toks(applyVariant(cur, '', {}, KPI))).toEqual(['kpi', 'dark']);
	});

	it('variantActive requires ALL sub-tokens of a look to be present', () => {
		const present = new Set(['quote', 'tint-corner', 'at-tl']);
		expect(variantActive(present, 'tint-corner at-tl')).toBe(true);
		expect(variantActive(new Set(['quote', 'tint-corner']), 'tint-corner at-tl')).toBe(false);
		expect(variantActive(present, 'ops')).toBe(false);
		expect(variantActive(present, '')).toBe(false);
	});
});
