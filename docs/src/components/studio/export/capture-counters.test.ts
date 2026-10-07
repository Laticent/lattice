// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { captureStyleProperties } from './deck-export.js';

// html-to-image copies only the properties the browser LISTS for a computed style, and
// Chrome's list leaves out the counter properties. Without them no counter was reset or
// incremented in the clone, and every `counter()` on a slide (timeline discs, agenda
// numbers) exported as 0. The pixels are checked on the real Studio export; this pins the list.
describe('captureStyleProperties', () => {
	it('adds the counter properties to what the browser lists, once each', () => {
		const props = captureStyleProperties();
		for (const p of ['counter-reset', 'counter-increment', 'counter-set']) expect(props.filter((x: string) => x === p)).toHaveLength(1);
		expect(props).toEqual(expect.arrayContaining(Array.from(getComputedStyle(document.documentElement))));
	});

	it('is one list for every capture, because html-to-image keeps the first it is given', () => {
		expect(captureStyleProperties()).toBe(captureStyleProperties());
	});
});
