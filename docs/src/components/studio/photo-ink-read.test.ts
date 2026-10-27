import { beforeEach, describe, expect, it } from 'vitest';
import { cachedVerdict, decide, keepVerdict, photoUrl, placementOf } from './photo-ink-read';

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
	it('survives (it is in localStorage) and is keyed by photo, placement and backing', () => {
		keepVerdict('sample:photo-wide.svg', 'at-bl', 0, { kind: 'ink', ink: 'light' });
		expect(cachedVerdict('sample:photo-wide.svg', 'at-bl', 0)).toEqual({ kind: 'ink', ink: 'light' });
		expect(cachedVerdict('sample:photo-wide.svg', 'at-tr', 0)).toBeUndefined();
		expect(cachedVerdict('sample:photo-wide.svg', 'at-bl', 55)).toBeUndefined();
	});
	it('keeps "neither" but not "unknown", so a photo that failed to load is tried again', () => {
		keepVerdict('a', 'at-bl', 0, { kind: 'neither' });
		keepVerdict('b', 'at-bl', 0, { kind: 'unknown' });
		expect(cachedVerdict('a', 'at-bl', 0)).toEqual({ kind: 'neither' });
		expect(cachedVerdict('b', 'at-bl', 0)).toBeUndefined();
	});
	it('a broken store reads as empty, never throws', () => {
		localStorage.setItem('lattice-photo-ink:v1', '{not json');
		expect(cachedVerdict('a', 'at-bl', 0)).toBeUndefined();
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
