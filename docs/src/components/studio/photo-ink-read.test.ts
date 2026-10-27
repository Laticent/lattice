import { beforeEach, describe, expect, it } from 'vitest';
import { type CardBox, cachedVerdict, decide, keepVerdict, photoUrl, placementOf } from './photo-ink-read';

describe('placementOf', () => {
	it('takes the slide class, then the deck word, then bottom-left', () => {
		expect(placementOf(['image', 'spotlight', 'at-tr'], ['at-bl'])).toBe('at-tr');
		expect(placementOf(['image', 'spotlight'], ['at-top'])).toBe('at-top');
		expect(placementOf(['image', 'spotlight'], [])).toBe('at-bl');
	});
});

describe('decide', () => {
	it('names the ink that reads on a dark or a light photo', () => {
		expect(decide([20, 24, 32], 0)).toEqual({ kind: 'ink', ink: 'light' });
		expect(decide([240, 238, 230], 0)).toEqual({ kind: 'ink', ink: 'dark' });
	});
	it('says neither on a mid-gray photo under a clear card, where no ink reaches 4.5:1', () => {
		expect(decide([121, 121, 121], 0)).toEqual({ kind: "neither" });
	});
	it('a solid card carries its own contrast, so some ink always reads', () => {
		expect(decide([121, 121, 121], 100).kind).toBe('ink');
	});
});

describe('the kept answer', () => {
	beforeEach(() => localStorage.clear());
	const card = (over: Partial<CardBox> = {}): CardBox => ({ ref: 'sample:photo-wide.svg', placement: 'at-bl', backing: 0, shape: '', ...over });
	it('survives (it is in localStorage) and is keyed by photo, placement, backing and card shape', () => {
		keepVerdict(card(), { kind: 'ink', ink: 'light' }, 'live');
		expect(cachedVerdict(card())).toEqual({ verdict: { kind: 'ink', ink: 'light' }, src: 'live' });
		expect(cachedVerdict(card({ placement: 'at-tr' }))).toBeUndefined();
		expect(cachedVerdict(card({ backing: 55 }))).toBeUndefined();
		expect(cachedVerdict(card({ shape: 'card-lg' }))).toBeUndefined();
	});
	it('keeps "neither" but not "unknown", so a photo that failed to load is tried again', () => {
		keepVerdict(card({ ref: 'a' }), { kind: 'neither' }, 'estimate');
		keepVerdict(card({ ref: 'b' }), { kind: 'unknown' }, 'estimate');
		expect(cachedVerdict(card({ ref: 'a' }))?.verdict).toEqual({ kind: 'neither' });
		expect(cachedVerdict(card({ ref: 'b' }))).toBeUndefined();
	});
	it('keys an embedded photo by a short hash, never by its payload', () => {
		const ref = `data:image/png;base64,${'A'.repeat(50_000)}`;
		keepVerdict(card({ ref }), { kind: 'ink', ink: 'dark' }, 'estimate');
		expect(localStorage.getItem('lattice-photo-ink:v2')?.length ?? 0).toBeLessThan(200);
		expect(cachedVerdict(card({ ref }))?.verdict).toEqual({ kind: 'ink', ink: 'dark' });
	});
	it('does not keep a blob: photo, whose URL changes on every load', () => {
		keepVerdict(card({ ref: 'blob:https://site.test/1' }), { kind: 'neither' }, 'live');
		expect(localStorage.getItem('lattice-photo-ink:v2')).toBeNull();
	});
	it('forgets an answer after a week, and ignores a tampered one', () => {
		localStorage.setItem('lattice-photo-ink:v2', JSON.stringify({}));
		keepVerdict(card(), { kind: 'ink', ink: 'light' }, 'live');
		const all = JSON.parse(localStorage.getItem('lattice-photo-ink:v2') ?? '{}');
		const k = Object.keys(all)[0];
		all[k].at -= 8 * 24 * 60 * 60 * 1000;
		localStorage.setItem('lattice-photo-ink:v2', JSON.stringify(all));
		expect(cachedVerdict(card())).toBeUndefined();
		all[k] = { ink: 'x', at: Date.now(), src: 'live' };
		localStorage.setItem('lattice-photo-ink:v2', JSON.stringify(all));
		expect(cachedVerdict(card())).toBeUndefined();
	});
	it('a broken store reads as empty, never throws', () => {
		localStorage.setItem('lattice-photo-ink:v2', '{not json');
		expect(cachedVerdict(card())).toBeUndefined();
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
