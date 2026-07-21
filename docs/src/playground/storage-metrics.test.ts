// Unit tests for the STORAGE overlay's pure data module. jsdom gives us a real
// localStorage; the async APIs (Storage estimate, Cache Storage) aren't in jsdom,
// so those functions are asserted to degrade to null rather than throw.

import { afterEach, describe, expect, it } from 'vitest';
import { BYTES_PER_UNIT, estimateQuota, formatBytes, formatMs, rate, scanCaches, scanLocalStorage } from './storage-metrics';

afterEach(() => localStorage.clear());

describe('scanLocalStorage', () => {
	it('returns an empty scan when storage is empty', () => {
		const s = scanLocalStorage();
		expect(s).toMatchObject({ keys: 0, bytes: 0, categories: [], largest: null });
		expect(s.scanMs).toBeGreaterThanOrEqual(0);
	});

	it('counts every key and sums UTF-16 bytes (key + value)', () => {
		localStorage.setItem('ab', 'cd'); // 4 code units → 8 bytes
		const s = scanLocalStorage();
		expect(s.keys).toBe(1);
		expect(s.bytes).toBe(4 * BYTES_PER_UNIT);
	});

	it('buckets keys into the Studio categories, first-match-wins', () => {
		localStorage.setItem('lattice-studio-src-deck1', 'x'.repeat(100));
		localStorage.setItem('lattice-studio-snap-deck1', 'y'.repeat(50)); // checkpoints
		localStorage.setItem('lattice-studio-chat-deck1', 'z'.repeat(10)); // chats
		localStorage.setItem('lattice-studio-chatdraft-deck1', 'd'); // drafts (NOT chats)
		localStorage.setItem('lattice-studio-comments-deck1', 'c');
		localStorage.setItem('lattice-studio-last-slide', 's'); // snapshots
		localStorage.setItem('lattice-studio-settings', '{}'); // settings & prefs
		localStorage.setItem('unrelated-key', 'other'); // other origins

		const s = scanLocalStorage();
		const byKey = Object.fromEntries(s.categories.map((c) => [c.key, c]));
		expect(byKey.sources.keys).toBe(1);
		expect(byKey.checkpoints.keys).toBe(1);
		expect(byKey.chats.keys).toBe(1);
		expect(byKey.drafts.keys).toBe(1); // chatdraft did NOT fall into chats
		expect(byKey.comments.keys).toBe(1);
		expect(byKey.snapshots.keys).toBe(1);
		expect(byKey.settings.keys).toBe(1);
		expect(byKey.other.keys).toBe(1);
	});

	it('reports the single largest entry', () => {
		localStorage.setItem('small', 'x');
		localStorage.setItem('lattice-studio-src-big', 'x'.repeat(500));
		const s = scanLocalStorage();
		expect(s.largest?.key).toBe('lattice-studio-src-big');
	});

	it('scanMs reflects the injected clock (deterministic)', () => {
		localStorage.setItem('k', 'v');
		let t = 0;
		const clock = () => (t += 7); // start→7, end→14, so elapsed = 7
		expect(scanLocalStorage(clock).scanMs).toBe(7);
	});

	it('drops empty categories from the breakdown', () => {
		localStorage.setItem('lattice-studio-src-only', 'x');
		const s = scanLocalStorage();
		expect(s.categories.map((c) => c.key)).toEqual(['sources']);
	});
});

describe('estimateQuota / scanCaches degrade gracefully', () => {
	it('estimateQuota returns null when the Storage API is absent (jsdom)', async () => {
		await expect(estimateQuota()).resolves.toBeNull();
	});
	it('scanCaches returns null when the Cache API is absent (jsdom)', async () => {
		await expect(scanCaches()).resolves.toBeNull();
	});
});

describe('rate', () => {
	it('rates smaller-is-better against (good, ni) upper edges', () => {
		expect(rate(10, 50, 80)).toBe('good');
		expect(rate(60, 50, 80)).toBe('needs-improvement');
		expect(rate(90, 50, 80)).toBe('poor');
	});
	it('treats the edges as exclusive upper bounds', () => {
		expect(rate(50, 50, 80)).toBe('needs-improvement');
		expect(rate(80, 50, 80)).toBe('poor');
	});
});

describe('formatBytes / formatMs', () => {
	it('formats bytes with an escalating unit', () => {
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(2048)).toBe('2.0 KB');
		expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
	});
	it('formats sub-10ms with a decimal, above as whole ms', () => {
		expect(formatMs(0.4)).toBe('0.4ms');
		expect(formatMs(12.6)).toBe('13ms');
	});
});
