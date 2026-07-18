import { describe, expect, it } from 'vitest';
import { getClassTokens, setClassTokens } from './slide-directives';
import { applyVariant, componentLooks, humanizeVariant, variantActive, variantSample } from './slide-variants';

// Variants as class-token surgery (2026-07-18-slide-variants-in-gallery.md). The token
// mutators (slide-directives) are covered separately; these lock the variant semantics:
// axis-aware replace, additive add, multi-token variants, and default-clear.

const BASE = '<!-- _class: quote -->\n\n> Words.\n\n— Someone';
const withTokens = (tokens: string[]) => setClassTokens(BASE, tokens);
const toks = (chunk: string) => getClassTokens(chunk);

const AXES = { insight: ['insight-key', 'insight-takeaway'], claim: ['claim-hero', 'claim-quiet'] };
const ALL = ['insight-key', 'insight-takeaway', 'claim-hero', 'claim-quiet', 'dark', 'tint-corner at-tl'];

describe('slide-variants — variant looks are class tokens', () => {
	it('componentLooks leads with Default and tags each look with its axis', () => {
		const looks = componentLooks(['insight-key', 'dark'], AXES);
		expect(looks[0]).toEqual({ token: '', label: 'Default', axis: '' });
		expect(looks.find((l) => l.token === 'insight-key')).toEqual({ token: 'insight-key', label: 'insight key', axis: 'insight' });
		expect(looks.find((l) => l.token === 'dark')?.axis).toBe(''); // additive
	});

	it('humanizeVariant swaps dashes for spaces', () => {
		expect(humanizeVariant('insight-next-step')).toBe('insight next step');
	});

	it('variantSample adds the token to the skeleton _class (empty = unchanged)', () => {
		expect(variantSample(BASE, '')).toBe(BASE);
		expect(toks(variantSample(BASE, 'insight-key'))).toEqual(['quote', 'insight-key']);
		// A multi-token variant merges BOTH sub-tokens…
		expect(toks(variantSample(BASE, 'tint-corner at-tl'))).toEqual(['quote', 'tint-corner', 'at-tl']);
		// …and never double-adds when re-applied.
		const once = variantSample(BASE, 'tint-corner at-tl');
		expect(variantSample(once, 'tint-corner at-tl')).toBe(once);
	});

	it('applyVariant replaces within an exclusive axis', () => {
		const cur = withTokens(['quote', 'insight-key']);
		expect(toks(applyVariant(cur, 'insight-takeaway', AXES, ALL))).toEqual(['quote', 'insight-takeaway']); // not both
	});

	it('applyVariant adds an additive look without disturbing others', () => {
		const cur = withTokens(['quote', 'insight-key']);
		expect(toks(applyVariant(cur, 'dark', AXES, ALL))).toEqual(['quote', 'insight-key', 'dark']);
	});

	it('applyVariant handles a multi-token additive look idempotently', () => {
		const once = applyVariant(BASE, 'tint-corner at-tl', AXES, ALL);
		expect(toks(once)).toEqual(['quote', 'tint-corner', 'at-tl']);
		expect(applyVariant(once, 'tint-corner at-tl', AXES, ALL)).toBe(once); // no double-add
	});

	it('applyVariant default strips every variant token (axis + additive + multi), keeps the rest', () => {
		const cur = withTokens(['quote', 'insight-key', 'dark', 'tint-corner', 'at-tl', 'no-footer']);
		// no-footer is neither an axis member nor a known variant → survives; the component stays.
		expect(toks(applyVariant(cur, '', AXES, ALL))).toEqual(['quote', 'no-footer']);
	});

	it('variantActive requires ALL sub-tokens of a look to be present', () => {
		const present = new Set(['quote', 'tint-corner', 'at-tl']);
		expect(variantActive(present, 'tint-corner at-tl')).toBe(true);
		expect(variantActive(new Set(['quote', 'tint-corner']), 'tint-corner at-tl')).toBe(false);
		expect(variantActive(present, 'insight-key')).toBe(false);
		expect(variantActive(present, '')).toBe(false);
	});
});
