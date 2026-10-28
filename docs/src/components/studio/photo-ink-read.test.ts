import { beforeEach, describe, expect, it } from 'vitest';
import { inkScenes, judge } from '../../../../lib/core/photo-contrast.mjs';
import { type CardBox, cachedFix, keepFix, photoUrl, placementOf } from './photo-ink-read';

describe('placementOf', () => {
	it('takes the slide class, then the deck word, then bottom-left', () => {
		expect(placementOf(['image', 'spotlight', 'at-tr'], ['at-bl'])).toBe('at-tr');
		expect(placementOf(['image', 'spotlight'], ['at-top'])).toBe('at-top');
		expect(placementOf(['image', 'spotlight'], [])).toBe('at-bl');
	});
});

describe('the estimate, from the kernel (photo-contrast.mjs judge + inkScenes)', () => {
	// The off-screen estimate is the same judge the measured read uses, on the stylesheet's own ink scenes.
	const est = (photo: number[], backing: number, body = false) =>
		judge({ photo, ink: null, pins: inkScenes('spotlight', backing, body) }, { inkFirst: true, solidReads: true }).fix;
	it('names the ink that reads on a dark or a light photo', () => {
		expect(est([20, 24, 32], 0)).toBe('ink-light');
		expect(est([240, 238, 230], 0)).toBe('ink-dark');
	});
	it('falls back to a solid card on a mid-gray photo under a clear card, where no ink reaches 4.5:1', () => {
		expect(est([121, 121, 121], 0)).toBe('solid');
	});
	it('a solid card carries its own contrast, so some ink always reads', () => {
		expect(['ink-light', 'ink-dark']).toContain(est([121, 121, 121], 100));
	});
	it('judges the lighter body ink too when the slide has a paragraph', () => {
		// On this gray the white heading reads at 4.95:1 and the body ink (0.88 alpha) at 4.26:1, so with a paragraph neither ink clears.
		expect(est([112, 112, 112], 0, false)).toBe('ink-light');
		expect(est([112, 112, 112], 0, true)).toBe('solid');
	});
});

describe('the kept fix', () => {
	beforeEach(() => localStorage.clear());
	const KEY = 'lattice-photo-ink:v3';
	const card = (over: Partial<CardBox> = {}): CardBox => ({ ref: 'sample:photo-wide.svg', placement: 'at-bl', backing: 0, shape: '', ...over });
	it('survives (it is in localStorage) and is keyed by photo, placement, backing and card shape', () => {
		keepFix(card(), 'ink-light', 9.4, 'live');
		expect(cachedFix(card())).toEqual({ fix: 'ink-light', ratio: 9.4, src: 'live' });
		expect(cachedFix(card({ placement: 'at-tr' }))).toBeUndefined();
		expect(cachedFix(card({ backing: 55 }))).toBeUndefined();
		expect(cachedFix(card({ shape: 'card-lg' }))).toBeUndefined();
	});
	it('keeps a solid card and "no fix", never a pin', () => {
		keepFix(card({ ref: 'a' }), 'solid', null, 'estimate');
		keepFix(card({ ref: 'b' }), null, null, 'live');
		keepFix(card({ ref: 'c' }), 'dark', 8, 'live');
		expect(cachedFix(card({ ref: 'a' }))?.fix).toBe('solid');
		expect(cachedFix(card({ ref: 'b' }))?.fix).toBeNull();
		expect(cachedFix(card({ ref: 'c' }))).toBeUndefined();
	});
	it('keys an embedded photo by a short hash, never by its payload', () => {
		const ref = `data:image/png;base64,${'A'.repeat(50_000)}`;
		keepFix(card({ ref }), 'ink-dark', 7, 'estimate');
		expect(localStorage.getItem(KEY)?.length ?? 0).toBeLessThan(200);
		expect(cachedFix(card({ ref }))?.fix).toBe('ink-dark');
	});
	it('does not keep a blob: photo, whose URL changes on every load', () => {
		keepFix(card({ ref: 'blob:https://site.test/1' }), 'solid', null, 'live');
		expect(localStorage.getItem(KEY)).toBeNull();
	});
	it('forgets an answer after a week, and ignores a tampered one', () => {
		keepFix(card(), 'ink-light', 9, 'live');
		const all = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		const k = Object.keys(all)[0];
		all[k].at -= 8 * 24 * 60 * 60 * 1000;
		localStorage.setItem(KEY, JSON.stringify(all));
		expect(cachedFix(card())).toBeUndefined();
		all[k] = { fix: 'x', at: Date.now(), src: 'live' };
		localStorage.setItem(KEY, JSON.stringify(all));
		expect(cachedFix(card())).toBeUndefined();
	});
	it('a broken store reads as empty, never throws', () => {
		localStorage.setItem(KEY, '{not json');
		expect(cachedFix(card())).toBeUndefined();
	});
});

describe('photoUrl', () => {
	it('passes web and data photos through, and has no answer for a relative path', async () => {
		expect(await photoUrl('https://example.test/a.jpg')).toBe('https://example.test/a.jpg');
		expect(await photoUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
		expect(await photoUrl('img/a.jpg')).toBeNull();
	});
	it('resolves a sample against the Studio boot data, and has no answer off the Studio', async () => {
		expect(await photoUrl('sample:photo-wide.svg')).toBeNull();
		const boot = document.createElement('script');
		boot.type = 'application/json';
		boot.setAttribute('data-studio-boot', '');
		boot.textContent = JSON.stringify({ themeBase: 'https://site.test/playground/v/abc/themes/' });
		document.body.append(boot);
		expect(await photoUrl('sample:photo-wide.svg')).toBe('https://site.test/playground/v/abc/samples/photo-wide.svg');
		boot.remove();
	});
});
