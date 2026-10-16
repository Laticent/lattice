import { describe, expect, it } from 'vitest';
import { canonicalJson } from './hash';

// canonicalJson follows JSON.stringify's rules, so a value that is not plain JSON still hashes as
// JSON would write it, and its output is always valid JSON (library trio, LTT-3 / LTT-R1).
describe('canonicalJson', () => {
	it('sorts keys at every depth and keeps array order', () => {
		expect(canonicalJson({ b: 1, a: { d: [3, 1], c: 2 } })).toBe('{"a":{"c":2,"d":[3,1]},"b":1}');
	});

	it('writes a hole and an undefined array entry as null, so the output is JSON', () => {
		// biome-ignore lint/suspicious/noSparseArray: the hole is the case under test
		const out = canonicalJson([1, , 3]);
		expect(out).toBe('[1,null,3]');
		expect(JSON.parse(canonicalJson(new Array(2)))).toEqual([null, null]);
		expect(canonicalJson([undefined, () => 1])).toBe('[null,null]');
	});

	it('honors toJSON, so two different dates hash differently', () => {
		expect(canonicalJson(new Date(0))).toBe(JSON.stringify(new Date(0)));
		expect(canonicalJson(new Date(0))).not.toBe(canonicalJson(new Date(1)));
	});

	it('drops a key whose value JSON cannot write', () => {
		expect(canonicalJson({ a: 1, f: () => 1, s: Symbol('x'), u: undefined })).toBe('{"a":1}');
	});

	it('agrees with JSON.stringify on plain JSON, key order aside', () => {
		const v = { x: [1, 'two', null, true, { y: 1.5 }], z: ' ' };
		expect(JSON.parse(canonicalJson(v))).toEqual(JSON.parse(JSON.stringify(v)));
	});
});
