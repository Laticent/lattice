import { describe, expect, it } from 'vitest';
import { arrowTarget, lastArrowEnd } from './context-sources.js';

// The flowchart source reads a row's arrows with one pass over its words (context-sources.js `lastArrowEnd`): a row
// is untrusted text read on the main thread (HARD RULE #22), and the regex it replaced backtracked exponentially.
describe('flowchart arrows', () => {
	it('finds the last arrow, plain, heavy or labeled', () => {
		expect(arrowTarget('Storefront -> Pay')).toBe('Pay');
		expect(arrowTarget('Storefront => Payments -> Led')).toBe('Led');
		expect(arrowTarget('A -ships via-> Le')).toBe('Le');
		expect(arrowTarget('A -sync-> Le')).toBe('Le');
		expect(arrowTarget('A <-> ')).toBe('');
	});
	it('reads past a fan-out to the target being typed', () => {
		expect(arrowTarget('A -> B & C & Le')).toBe('Le');
	});
	it('has no target without an arrow, before its space, or inside a span', () => {
		expect(arrowTarget('Storefront')).toBeNull();
		expect(arrowTarget('Storefront ->')).toBeNull();
		expect(arrowTarget('A -> B `dia')).toBeNull();
		expect(arrowTarget('A -unclosed label B')).toBeNull();
	});
	it('a hyphen inside a name is not an arrow', () => {
		expect(lastArrowEnd('Pre-sales team')).toBe(-1);
	});
	it('reads a 100,000-character hostile row in one pass', () => {
		// The shape CodeQL reported against the old pattern: `<-` then many `\t&`.
		const row = `<-${'\t&'.repeat(50_000)}x`;
		expect(arrowTarget(row)).toBe('x');
	});
});
