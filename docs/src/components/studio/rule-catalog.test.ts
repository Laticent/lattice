import { describe, expect, it } from 'vitest';
import { RULE_NAMES } from '../../../../lib/core/resolve-rule.js';
import { activeRule, RULES } from './rule-catalog';

// Rot-guard: the Studio display catalog MUST stay in step with the engine RULE_NAMES.
describe('rule-catalog ↔ RULE_NAMES', () => {
	const names = new Set(RULE_NAMES);

	it('every catalog entry is a registered rule value', () => {
		for (const s of RULES) {
			expect(names.has(s.name), `catalog "${s.name}" is not in RULE_NAMES`).toBe(true);
		}
	});

	it('every registered value has a catalog entry', () => {
		const cataloged = new Set(RULES.map((s) => s.name));
		for (const name of RULE_NAMES) {
			expect(cataloged.has(name), `rule "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});

	it('activeRule falls back to the auto default for unknown / empty', () => {
		expect(activeRule('nonsense').name).toBe('auto');
		expect(activeRule('').name).toBe('auto');
		expect(activeRule('short').name).toBe('short');
	});
});
