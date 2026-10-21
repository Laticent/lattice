import { describe, expect, it } from 'vitest';
import { bool, cleanView, defineViewKeys, int, obj, oneOf, opt, pattern, VIEW_MAX_BYTES, VIEW_MAX_KEYS } from './view.js';

// The view carries WHERE a member is. Every value is a place from a fixed list, an integer in a range,
// or an id of a fixed form; there is no free-text kind to carry what someone typed and has not committed.
const keys = defineViewKeys({
	panel: oneOf(['coach', 'lenses', 'deck']),
	present: obj({ idx: int(0, 10_000), page: int(0, 10_000), lens: pattern(/^[A-Za-z0-9_-]+$/), hash: opt(pattern(/^[0-9a-f]{1,8}$/)) }),
	typing: bool,
});

describe('view schema', () => {
	it('keeps a declared key whose value passes, and drops the rest by name', () => {
		const { view, dropped } = cleanView({ panel: 'deck', typing: 'yes', secret: 'x', present: { idx: 2, page: 0, lens: 'full', extra: 1 } }, keys);
		expect(view).toEqual({ panel: 'deck', present: { idx: 2, page: 0, lens: 'full' } });
		expect(dropped).toEqual(['typing']);
	});

	it('a value outside its list, or out of range, is dropped, never repaired', () => {
		expect(cleanView({ panel: 'chat' }, keys).view).toEqual({});
		expect(cleanView({ present: { idx: -1, page: 0, lens: 'full' } }, keys).view).toEqual({});
		expect(cleanView({ present: { idx: 1.5, page: 0, lens: 'full' } }, keys).view).toEqual({});
		expect(cleanView({ present: { idx: 1, page: 0 } }, keys).view).toEqual({});
		expect(cleanView({ present: { idx: 1, page: 0, lens: 'a b' } }, keys).view).toEqual({});
	});

	it('inherited names are not keys, and are not list members', () => {
		for (const raw of [{ constructor: 'x' }, JSON.parse('{"__proto__":{"panel":"deck"}}'), { toString: 'x' }, { hasOwnProperty: 1 }]) {
			expect(Object.keys(cleanView(raw, keys).view)).toEqual([]);
		}
		for (const name of ['constructor', '__proto__', 'toString']) expect(cleanView({ panel: name }, keys).view).toEqual({});
	});

	it('the whole view is bounded in UTF-8 bytes, and over the limit later keys are dropped', () => {
		const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
		const wide = defineViewKeys(Object.fromEntries(ids.map((k) => [k, pattern(/^[a-z]+$/)])));
		const long = 'x'.repeat(60);
		const { view, dropped } = cleanView(Object.fromEntries(ids.map((k) => [k, long])), wide);
		expect(new TextEncoder().encode(JSON.stringify(view)).length).toBeLessThanOrEqual(VIEW_MAX_BYTES);
		expect(Object.keys(view).length).toBeLessThan(10);
		expect(dropped.length).toBeGreaterThan(0);
	});

	it('a view of anything but an object is empty', () => {
		for (const raw of [null, undefined, 'panel', 3, ['panel'], true]) expect(cleanView(raw, keys)).toEqual({ view: {}, dropped: [] });
	});

	it('refuses a declaration that is too wide, mis-named, or carries free text by another name', () => {
		const many = Object.fromEntries(Array.from({ length: VIEW_MAX_KEYS + 1 }, (_, i) => [`k${i}`, bool]));
		expect(() => defineViewKeys(many)).toThrow();
		expect(() => defineViewKeys({ 'Bad-Name': bool })).toThrow();
		expect(() => defineViewKeys(Object.fromEntries([['__proto__', bool]]))).toThrow(); // an own key with a prototype name
		expect(() => pattern(/abc/)).toThrow(); // not anchored
		expect(() => pattern(/^.*$/, 5000)).toThrow(); // too long to be an id
		expect(() => oneOf([])).toThrow();
	});
});
