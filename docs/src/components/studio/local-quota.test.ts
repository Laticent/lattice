// local-quota: how full the localStorage allowance is, in the units each engine was measured to use.
import { describe, expect, it } from 'vitest';
import { describeLocalUse, isWebKit, LOCAL_ALLOWANCE, LOCAL_WARN_AT, localStorageUse } from './local-quota';

/** A Storage stand-in holding `entries`. */
const storeOf = (entries: Record<string, string>) => {
	const keys = Object.keys(entries);
	return { length: keys.length, key: (i: number) => keys[i] ?? null, getItem: (k: string) => entries[k] ?? null };
};

describe('localStorageUse', () => {
	it('counts key and value characters against the measured allowance', () => {
		const u = localStorageUse(storeOf({ ab: 'xyz' }), false);
		expect(u.used).toBe(5);
		expect(u.allowance).toBe(LOCAL_ALLOWANCE);
		expect(u.warn).toBe(false);
	});

	it('warns from 80% of the allowance, not before', () => {
		const at = Math.ceil(LOCAL_ALLOWANCE * LOCAL_WARN_AT);
		expect(localStorageUse(storeOf({ k: 'x'.repeat(at - 2) }), false).warn).toBe(false);
		expect(localStorageUse(storeOf({ k: 'x'.repeat(at - 1) }), false).warn).toBe(true);
	});

	it('on WebKit an entry with a non-Latin-1 character counts twice; Latin-1 entries do not', () => {
		const entries = { a: 'café', b: 'em — dash' };
		expect(localStorageUse(storeOf(entries), false).used).toBe(1 + 4 + 1 + 9);
		expect(localStorageUse(storeOf(entries), true).used).toBe(1 + 4 + 2 * (1 + 9));
	});

	it('reports nothing, not a false alarm, when storage cannot be read', () => {
		const broken = { length: 1, key: () => { throw new Error('denied'); }, getItem: () => null };
		expect(localStorageUse(broken, false)).toMatchObject({ used: 0, warn: false });
		expect(localStorageUse(undefined, false).used).toBe(0);
	});

	it('names the engine by its vendor string, as measured', () => {
		expect(isWebKit({ vendor: 'Apple Computer, Inc.' })).toBe(true);
		expect(isWebKit({ vendor: 'Google Inc.' })).toBe(false);
		expect(isWebKit({ vendor: '' })).toBe(false); // Firefox
	});

	it('describes the fill in the words the warnings use', () => {
		expect(describeLocalUse({ used: 4_400_000, allowance: LOCAL_ALLOWANCE, fraction: 4_400_000 / LOCAL_ALLOWANCE, warn: true })).toBe('4.4\u00a0M of 5.2\u00a0M characters (84%)');
	});
});
