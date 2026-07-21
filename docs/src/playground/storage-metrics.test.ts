// Unit tests for the STORAGE overlay's pure data module. jsdom gives us a real
// localStorage; the async APIs (Storage estimate, Cache Storage) aren't in jsdom,
// so those functions are asserted to degrade to null rather than throw.

import { afterEach, describe, expect, it } from 'vitest';
import { COMMENTS_KEY_PREFIX } from '@/components/studio/slide-comments';
// Import the REAL key prefixes so the category matchers are drift-tested against
// their source, not against strings this test independently re-declares.
import { CHAT_DRAFT_PREFIX, CHAT_PREFIX, SNAP_PREFIX, SRC_PREFIX } from '@/components/studio/studio-store';
import { PG_SNAPSHOT_KEY, SNAPSHOT_KEY } from './snapshot-cache';
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
		localStorage.setItem('lattice-studio-settings', '{}'); // app state & prefs
		localStorage.setItem('unrelated-key', 'other'); // other keys

		const s = scanLocalStorage();
		const byKey = Object.fromEntries(s.categories.map((c) => [c.key, c]));
		expect(byKey.sources.keys).toBe(1);
		expect(byKey.checkpoints.keys).toBe(1);
		expect(byKey.chats.keys).toBe(1);
		expect(byKey.drafts.keys).toBe(1); // chatdraft did NOT fall into chats
		expect(byKey.comments.keys).toBe(1);
		expect(byKey.snapshots.keys).toBe(1);
		expect(byKey.app.keys).toBe(1);
		expect(byKey.other.keys).toBe(1);
	});

	// Drift guard (adversarial-trio, Munger #5): the category matchers are hand-mirrored
	// from studio-store's key prefixes. Assert each REAL prefix (imported from its source)
	// still routes to its DEDICATED category — so renaming a prefix in studio-store, or a
	// matcher falling out of sync, fails here instead of silently dumping that data into
	// the 'app' catch-all and rotting the breakdown. A brand-new content prefix with no
	// const of its own still can't be caught automatically (logged follow-up).
	it('every real studio-store content prefix routes to its dedicated category (no catch-all drift)', () => {
		const cases: [string, string][] = [
			[`${SRC_PREFIX}deck1`, 'sources'],
			[`${SNAP_PREFIX}deck1`, 'checkpoints'],
			[`${CHAT_PREFIX}deck1`, 'chats'],
			[`${CHAT_DRAFT_PREFIX}deck1`, 'drafts'],
			[`${COMMENTS_KEY_PREFIX}deck1`, 'comments'],
			[SNAPSHOT_KEY, 'snapshots'],
			[PG_SNAPSHOT_KEY, 'snapshots'],
		];
		for (const [key, expected] of cases) {
			localStorage.clear();
			localStorage.setItem(key, 'v');
			const [cat] = scanLocalStorage().categories;
			expect(cat.key, `${key} should route to '${expected}', not the '${cat.key}' catch-all`).toBe(expected);
		}
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
	it('pins the unit boundaries (a < → <= regression must fail here)', () => {
		expect(formatBytes(0)).toBe('0 B');
		expect(formatBytes(1023)).toBe('1023 B');
		expect(formatBytes(1024)).toBe('1.0 KB'); // exactly 1KB crosses into KB
		expect(formatBytes(10 * 1024)).toBe('10 KB'); // ≥10KB drops the decimal
		expect(formatBytes(1024 * 1024 - 1)).toBe('1024 KB');
		expect(formatBytes(1024 * 1024)).toBe('1.0 MB'); // exactly 1MB crosses into MB
	});
	it('formats scan time as a COARSE figure — whole ms, <1ms floor, 0ms empty', () => {
		expect(formatMs(0)).toBe('0ms');
		expect(formatMs(-0)).toBe('0ms');
		expect(formatMs(0.4)).toBe('<1ms'); // sub-ms is below the clock's real resolution
		expect(formatMs(0.999)).toBe('<1ms');
		expect(formatMs(1)).toBe('1ms');
		expect(formatMs(5.5)).toBe('6ms');
		expect(formatMs(12.6)).toBe('13ms');
	});
});
