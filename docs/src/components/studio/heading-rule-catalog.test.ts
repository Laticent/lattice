// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
import { HEADING_RULE_NAMES } from '../../../../lib/core/resolve-heading-rule.js';
import { activeHeadingRule, HEADING_RULES } from './heading-rule-catalog';

// Rot-guard: the Studio display catalog MUST stay in step with the engine HEADING_RULE_NAMES.
describe('heading-rule-catalog ↔ HEADING_RULE_NAMES', () => {
	const names = new Set(HEADING_RULE_NAMES);

	it('every catalog entry is a registered rule value', () => {
		for (const s of HEADING_RULES) {
			expect(names.has(s.name), `catalog "${s.name}" is not in HEADING_RULE_NAMES`).toBe(true);
		}
	});

	it('every registered value has a catalog entry', () => {
		const cataloged = new Set(HEADING_RULES.map((s) => s.name));
		for (const name of HEADING_RULE_NAMES) {
			expect(cataloged.has(name), `rule "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});

	it('activeHeadingRule falls back to the auto default for unknown / empty', () => {
		expect(activeHeadingRule('nonsense').name).toBe('auto');
		expect(activeHeadingRule('').name).toBe('auto');
		expect(activeHeadingRule('short').name).toBe('short');
	});
});
