import { describe, expect, it } from 'vitest';
import { MANIFEST_KEYS, manifestCompletion } from './manifest-complete';

// The pure matcher behind the JSON manifest autocomplete. CodeMirror positions
// are mapped in the wrapper; here we prove the SCHEMA logic — it can only suggest
// values the gate accepts.
describe('manifest-complete — schema-aware JSON completion', () => {
	it('suggests enum values inside an enum field’s string', () => {
		const r = manifestCompletion('  "bucket": "co');
		expect(r?.kind).toBe('value');
		expect(r?.token).toBe('co');
		expect(r?.options).toContain('comparison');
		expect(r?.options).toContain('inventory');
	});

	it('suggests the adapt mode values for the nested mode key', () => {
		const r = manifestCompletion('    "mode": "');
		expect(r?.options).toEqual(['native', 'reflow']);
	});

	it('suggests the manifest keys when typing a property name', () => {
		const r = manifestCompletion('  "fun');
		expect(r?.kind).toBe('key');
		expect(r?.token).toBe('fun');
		expect(r?.options).toEqual(MANIFEST_KEYS);
	});

	it('suggests keys right after an opening brace or comma', () => {
		expect(manifestCompletion('{ "')?.kind).toBe('key');
		expect(manifestCompletion('  "tags": [], "')?.kind).toBe('key');
	});

	it('does not suggest enum values for a free-text field or a number', () => {
		expect(manifestCompletion('  "description": "A grid of ')).toBeNull();
		expect(manifestCompletion('  "sweet": 4')).toBeNull();
	});

	it('does not resolve prototype-named keys to inherited Object members', () => {
		// Regression: a bare MANIFEST_ENUMS[key] lookup resolved
		// Object.prototype.constructor for `"constructor": "` and crashed .map().
		for (const key of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
			expect(manifestCompletion(`  "${key}": "`)).toBeNull();
		}
	});
});
