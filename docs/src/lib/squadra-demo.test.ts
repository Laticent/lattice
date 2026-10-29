import { describe, expect, it } from 'vitest';
import { fix, lint } from './squadra/index';
import { compileDemo, DEMO_RULES, SAMPLE } from './squadra-demo';

// The demo page claims what the real library does with its six rules; these keep the claims true.
const src = { path: 'plan.notes', text: SAMPLE, language: 'notes' };

describe('the Squadra demo ruleset', () => {
	it('loads the three honest rules and refuses each broken one, for the reason the page names', () => {
		const rs = compileDemo();
		const codes = (id: string) => new Set(rs.refused.filter((p) => p.rule === id).map((p) => p.code));
		for (const r of DEMO_RULES) expect(codes(r.id).size > 0, r.id).toBe(r.broken);
		expect(codes('notes/no-venue')).toContain('good-fired');
		expect(codes('notes/next-section')).toContain('fix-changed-shape');
		expect(codes('notes/tbd')).toContain('fix-did-not-resolve');
	});

	it('fixes the sample in one pass and leaves the fenced example as written', () => {
		const r = fix(compileDemo(), src);
		expect(r.passes).toBe(1);
		expect(r.applied.map((a) => a.rule).sort()).toEqual(['notes/no-todo', 'notes/no-todo', 'notes/no-trailing-space', 'notes/one-space']);
		expect(r.text).toContain('an example, left as written: TODO  here');
		expect(r.text).toContain('call the venue DONE\nbook the room\n');
		expect(r.remaining).toEqual([]);
	});

	it('never runs a refused rule on the text', () => {
		const findings = lint(compileDemo(), [src]).findings.filter((f) => !f.rule.startsWith('squadra/'));
		expect(findings.some((f) => ['notes/no-venue', 'notes/next-section', 'notes/tbd'].includes(f.rule))).toBe(false);
	});

	it('compiles only the rules a reader turns on', () => {
		expect(compileDemo(['notes/no-todo']).refused).toEqual([]);
		expect(lint(compileDemo([]), [src]).findings).toEqual([]);
	});
});
