// The format a new photo is stored in when the person has not chosen one: the original (owner ruling 2026-11-13,
// engineering/decisions/2026-10-12-library-media-assets.md §3). A remembered choice still wins.
import { afterEach, describe, expect, it } from 'vitest';
import { PHOTO_FORMATS } from './media-import';
import { DEFAULT_PHOTO_FORMAT, loadPhotoFormat } from './PhotoFormatDialog';

const KEY = 'lattice-photo-format';

afterEach(() => localStorage.clear());

describe('loadPhotoFormat', () => {
	it('keeps the original when nothing was chosen before', () => {
		expect(DEFAULT_PHOTO_FORMAT).toBe('original');
		expect(loadPhotoFormat()).toBe('original');
	});

	it('returns the remembered choice for every format', () => {
		for (const f of PHOTO_FORMATS) {
			localStorage.setItem(KEY, f);
			expect(loadPhotoFormat()).toBe(f);
		}
	});

	it('ignores a remembered value that is not a format', () => {
		for (const bad of ['', 'gif', 'ORIGINAL', 'jpeg ', '{}']) {
			localStorage.setItem(KEY, bad);
			expect(loadPhotoFormat()).toBe('original');
		}
	});

	it('falls back to the original when storage throws', () => {
		const real = Storage.prototype.getItem;
		Storage.prototype.getItem = () => {
			throw new DOMException('blocked', 'SecurityError');
		};
		try {
			expect(loadPhotoFormat()).toBe('original');
		} finally {
			Storage.prototype.getItem = real;
		}
	});
});
