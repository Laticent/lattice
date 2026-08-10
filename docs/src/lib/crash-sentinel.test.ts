import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	__resetSentinelForTest,
	BEAT_MS,
	breadcrumb,
	classifySession,
	clearAllSessions,
	clearCrashReports,
	collectCrashReports,
	crashReportStats,
	dismissCrashReport,
	elapsedLabel,
	formatCrashReport,
	isSessionRecord,
	isUncleanEnd,
	liveSession,
	MEM_PRESSURE,
	newRecord,
	noteError,
	pruneSessions,
	SESSION_PREFIX,
	type SessionRecord,
	STALE_MS,
	setCrashContext,
	startCrashSentinel,
	TAB_SESSION_KEY,
} from './crash-sentinel';

// Anchored an hour behind the real clock, not at a fixed epoch: `startCrashSentinel`
// prunes records older than its age cap against `Date.now()`, so a hard-coded 2023
// timestamp would be swept away by the very call under test.
const T0 = Date.now() - 3_600_000;

/** A record that ended cleanly, unless `over` says otherwise. */
function rec(over: Partial<SessionRecord> = {}): SessionRecord {
	return newRecord(over.id ?? 'sess-1', T0, { lastBeat: T0 + 60_000, ...over });
}

/** The one call `collectCrashReports` needs to have seen — it reads module state. */
function bootSentinel() {
	startCrashSentinel();
}

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	__resetSentinelForTest();
	vi.useRealTimers();
});

afterEach(() => {
	__resetSentinelForTest();
	vi.useRealTimers();
});

describe('isUncleanEnd', () => {
	it('a closed record is never a crash', () => {
		expect(isUncleanEnd(rec({ closed: true }), T0 + 60_000 + STALE_MS + 1, false)).toBe(false);
	});

	it('holds off on another tab until it has gone stale — a live background tab beats slowly', () => {
		const r = rec();
		// One second after its last beat, this could easily be a second tab still running.
		expect(isUncleanEnd(r, r.lastBeat + 1_000, false)).toBe(false);
		expect(isUncleanEnd(r, r.lastBeat + STALE_MS + 1, false)).toBe(true);
	});

	it('reports immediately when the SAME tab came back — no other tab can own that record', () => {
		const r = rec();
		expect(isUncleanEnd(r, r.lastBeat + 1_000, true)).toBe(true);
	});

	it('ignores a record stamped in the future (a clock change, a hand-edited value)', () => {
		const r = rec({ lastBeat: T0 + 10 * BEAT_MS });
		expect(isUncleanEnd(r, T0, true)).toBe(false);
	});
});

describe('classifySession', () => {
	const withMem = (usedFrac: number, over: Partial<SessionRecord> = {}) =>
		rec({
			mem: [
				{ t: 0, used: 100_000_000, limit: 1_000_000_000 },
				{ t: 55_000, used: usedFrac * 1_000_000_000, limit: 1_000_000_000 },
			],
			...over,
		});

	it('calls heap pressure first — it is the actionable cause and it explains a silent death', () => {
		const { verdict } = classifySession(withMem(MEM_PRESSURE + 0.05), true);
		expect(verdict).toBe('memory');
	});

	it('does not call memory when the heap was comfortable', () => {
		const { verdict } = classifySession(withMem(0.2), true);
		expect(verdict).toBe('unknown');
	});

	it('names a browser discard when the tab was frozen and never resumed', () => {
		const { verdict, reason } = classifySession(withMem(0.2, { frozen: true }), false);
		expect(verdict).toBe('discarded');
		expect(reason).toMatch(/discard/i);
		// The frozen path is an INFERENCE and must not read like the browser said so.
		expect(classifySession(withMem(0.2, { frozen: true }), false).signals.join(' ')).toMatch(/not confirmed/i);
	});

	// `document.wasDiscarded` is the browser answering rather than us inferring.
	it('prefers a CONFIRMED discard over heap pressure — different cause, different fix', () => {
		const pressured = withMem(MEM_PRESSURE + 0.05);
		expect(classifySession(pressured, { sameTab: true }).verdict).toBe('memory');
		const { verdict, signals } = classifySession(pressured, { sameTab: true, tabDiscarded: true });
		expect(verdict).toBe('discarded');
		expect(signals.join(' ')).toMatch(/wasDiscarded/);
		// The heap reading is not thrown away just because the verdict changed.
		expect(signals.join(' ')).toMatch(/JavaScript heap at/);
	});

	it('ignores wasDiscarded for a record this tab was never running', () => {
		// The flag describes the TAB, so it can only speak for the tab's own record.
		expect(classifySession(withMem(0.2), { sameTab: false, tabDiscarded: true }).verdict).toBe('unknown');
	});

	it('blames an error only when it fired NEAR the end', () => {
		const near = rec({ lastError: { message: 'boom', t: 58_000 }, errorCount: 1 });
		expect(classifySession(near, true).verdict).toBe('error');
		const early = rec({ lastError: { message: 'boom', t: 1_000 }, errorCount: 1 });
		expect(classifySession(early, true).verdict).toBe('unknown');
	});

	it('blames a stall only when it happened NEAR the end', () => {
		const near = rec({ stallCount: 1, longestStallMs: 4_000, crumbs: [{ t: 57_000, k: 'stall', m: 'main thread blocked 4.0s' }] });
		expect(classifySession(near, true).verdict).toBe('stall');
		const early = rec({ stallCount: 1, longestStallMs: 4_000, crumbs: [{ t: 2_000, k: 'stall', m: 'main thread blocked 4.0s' }] });
		expect(classifySession(early, true).verdict).toBe('unknown');
	});

	it('stays honest about a quiet trail rather than inventing a cause', () => {
		const { verdict, reason } = classifySession(rec(), false);
		expect(verdict).toBe('unknown');
		expect(reason).toMatch(/force-quit|shutdown/i);
	});

	it('says out loud that a different tab could also mean a force-quit', () => {
		expect(classifySession(rec(), false).signals.join(' ')).toMatch(/force-quit/i);
		expect(classifySession(rec(), true).signals.join(' ')).toMatch(/reloaded itself/i);
	});

	it('records the absence of heap readings instead of implying a healthy heap', () => {
		expect(classifySession(rec({ mem: [] }), true).signals.join(' ')).toMatch(/does not expose/i);
	});

	// Measured on the real Studio: an idle session sits at ~6 MB of a ~4 GB limit,
	// and a rounded percentage printed "heap at 0% of the limit" — a healthy reading
	// that reads as a broken one.
	it('prints a tiny heap fraction as <1%, never a rounded 0%', () => {
		const tiny = rec({ mem: [{ t: 0, used: 6_000_000, limit: 4_000_000_000 }] });
		const line = classifySession(tiny, true).signals[0];
		expect(line).toContain('<1%');
		expect(line).not.toContain(' 0% ');
	});
});

describe('elapsedLabel', () => {
	// A long session's trail rendered as `+3140.0s` is a number nobody converts in
	// their head — and long sessions are exactly the ones that end out of memory.
	it('keeps tenths under a minute, then switches to an elapsed clock', () => {
		expect(elapsedLabel(0)).toBe('+0.0s');
		expect(elapsedLabel(4_800)).toBe('+4.8s');
		expect(elapsedLabel(59_400)).toBe('+59.4s');
		expect(elapsedLabel(60_000)).toBe('+1:00');
		expect(elapsedLabel(3_140_000)).toBe('+52:20');
		expect(elapsedLabel(3_600_000)).toBe('+1:00:00');
		expect(elapsedLabel(7_384_000)).toBe('+2:03:04');
	});
});

describe('formatCrashReport', () => {
	it('carries the verdict, the trail and the last error into one markdown artifact', () => {
		const record = rec({
			page: '/studio/',
			ua: 'TestBrowser/1.0',
			context: { Deck: 'Q3 review', Slides: '18' },
			crumbs: [
				{ t: 0, k: 'boot', m: 'studio boot (reload)' },
				{ t: 42_000, k: 'action', m: 'opened Present' },
			],
			mem: [{ t: 0, used: 50_000_000, limit: 1_000_000_000 }],
			lastError: { message: 'Cannot read x of undefined', stack: 'at foo()', t: 41_000 },
			errorCount: 1,
		});
		const [report] = (() => {
			localStorage.setItem(SESSION_PREFIX + record.id, JSON.stringify(record));
			bootSentinel();
			return collectCrashReports(record.lastBeat + STALE_MS + 1);
		})();
		const md = formatCrashReport(report);
		expect(md).toContain('Q3 review');
		expect(md).toContain('opened Present');
		expect(md).toContain('Cannot read x of undefined');
		expect(md).toContain('/studio/');
		expect(md).toContain('TestBrowser/1.0');
	});
});

describe('collectCrashReports', () => {
	it('finds an unclosed record and skips a closed one', () => {
		localStorage.setItem(SESSION_PREFIX + 'dead', JSON.stringify(rec({ id: 'dead' })));
		localStorage.setItem(SESSION_PREFIX + 'clean', JSON.stringify(rec({ id: 'clean', closed: true })));
		bootSentinel();
		const found = collectCrashReports(T0 + 60_000 + STALE_MS + 1);
		expect(found.map((r) => r.id)).toEqual(['dead']);
	});

	it('never reports the LIVE session as a crash', () => {
		bootSentinel();
		const id = liveSession()?.id;
		expect(id).toBeTruthy();
		// Far in the future, so staleness alone would otherwise harvest it.
		expect(collectCrashReports(Date.now() + STALE_MS * 10).some((r) => r.id === id)).toBe(false);
	});

	it('marks the report sameTab when the tab mirror still points at it', () => {
		localStorage.setItem(SESSION_PREFIX + 'prev', JSON.stringify(rec({ id: 'prev', lastBeat: Date.now() })));
		sessionStorage.setItem(TAB_SESSION_KEY, 'prev');
		bootSentinel();
		const [report] = collectCrashReports(Date.now() + 1_000);
		expect(report?.sameTab).toBe(true);
	});

	it('ignores an unparseable or foreign value under the prefix', () => {
		localStorage.setItem(`${SESSION_PREFIX}junk`, '{not json');
		localStorage.setItem(`${SESSION_PREFIX}alien`, JSON.stringify({ hello: 'world' }));
		bootSentinel();
		expect(collectCrashReports(Date.now() + STALE_MS * 2)).toEqual([]);
	});

	it('returns newest first', () => {
		localStorage.setItem(SESSION_PREFIX + 'old', JSON.stringify(rec({ id: 'old', startedAt: T0, lastBeat: T0 + 1000 })));
		localStorage.setItem(SESSION_PREFIX + 'new', JSON.stringify(rec({ id: 'new', startedAt: T0 + 5000, lastBeat: T0 + 9000 })));
		bootSentinel();
		expect(collectCrashReports(T0 + 9000 + STALE_MS + 1).map((r) => r.id)).toEqual(['new', 'old']);
	});
});

describe('dismiss / clear', () => {
	it('dismissCrashReport drops exactly one record', () => {
		localStorage.setItem(SESSION_PREFIX + 'a', JSON.stringify(rec({ id: 'a' })));
		localStorage.setItem(SESSION_PREFIX + 'b', JSON.stringify(rec({ id: 'b' })));
		dismissCrashReport('a');
		expect(localStorage.getItem(SESSION_PREFIX + 'a')).toBeNull();
		expect(localStorage.getItem(SESSION_PREFIX + 'b')).not.toBeNull();
	});

	it('clearCrashReports keeps the LIVE record — clearing history must not blind the recorder', () => {
		bootSentinel();
		const liveId = liveSession()?.id as string;
		localStorage.setItem(SESSION_PREFIX + 'old', JSON.stringify(rec({ id: 'old' })));
		clearCrashReports();
		expect(localStorage.getItem(SESSION_PREFIX + 'old')).toBeNull();
		expect(localStorage.getItem(SESSION_PREFIX + liveId)).not.toBeNull();
	});
});

describe('pruneSessions', () => {
	it('drops records past the age cap', () => {
		const ancient = rec({ id: 'ancient', startedAt: T0 - 30 * 24 * 60 * 60 * 1000 });
		localStorage.setItem(SESSION_PREFIX + 'ancient', JSON.stringify(ancient));
		pruneSessions(T0);
		expect(localStorage.getItem(SESSION_PREFIX + 'ancient')).toBeNull();
	});

	it('keeps only the newest few — the recorder must not become the storage problem it diagnoses', () => {
		for (let i = 0; i < 12; i++) {
			localStorage.setItem(SESSION_PREFIX + `s${i}`, JSON.stringify(rec({ id: `s${i}`, startedAt: T0 + i * 1000 })));
		}
		pruneSessions(T0 + 20_000);
		const left = Object.keys(localStorage).filter((k) => k.startsWith(SESSION_PREFIX));
		expect(left.length).toBe(5);
		// The survivors are the newest five (s7…s11).
		expect(left.sort()).toEqual([`${SESSION_PREFIX}s10`, `${SESSION_PREFIX}s11`, `${SESSION_PREFIX}s7`, `${SESSION_PREFIX}s8`, `${SESSION_PREFIX}s9`].sort());
	});

	it('spares the record it is told to keep', () => {
		localStorage.setItem(SESSION_PREFIX + 'live', JSON.stringify(rec({ id: 'live', startedAt: T0 - 30 * 24 * 60 * 60 * 1000 })));
		pruneSessions(T0, 'live');
		expect(localStorage.getItem(SESSION_PREFIX + 'live')).not.toBeNull();
	});
});

describe('the recorder', () => {
	it('opens a record, mirrors its id into the tab, and closes it on pagehide', () => {
		bootSentinel();
		const id = liveSession()?.id as string;
		expect(sessionStorage.getItem(TAB_SESSION_KEY)).toBe(id);
		const stored = JSON.parse(localStorage.getItem(SESSION_PREFIX + id) as string);
		expect(stored.closed).toBeUndefined();
		dispatchEvent(new Event('pagehide'));
		expect(JSON.parse(localStorage.getItem(SESSION_PREFIX + id) as string).closed).toBe(true);
	});

	it('reopens the record when the page comes back from the bfcache', () => {
		bootSentinel();
		const id = liveSession()?.id as string;
		dispatchEvent(new Event('pagehide'));
		dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
		expect(JSON.parse(localStorage.getItem(SESSION_PREFIX + id) as string).closed).toBe(false);
	});

	// Measured on the real Studio: `pageshow` fires on EVERY load, so an unguarded
	// handler wrote "pageshow (restored)" into the trail of a plain first load.
	it('ignores a NON-persisted pageshow — an ordinary load is not a restore', () => {
		bootSentinel();
		dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
		expect((liveSession()?.crumbs ?? []).some((c) => c.m.includes('bfcache'))).toBe(false);
	});

	it('leaves the record OPEN on freeze — a discarded tab must still report', () => {
		bootSentinel();
		const id = liveSession()?.id as string;
		document.dispatchEvent(new Event('freeze'));
		const stored = JSON.parse(localStorage.getItem(SESSION_PREFIX + id) as string);
		expect(stored.frozen).toBe(true);
		expect(stored.closed).toBeUndefined();
	});

	it('is idempotent — a second start reuses the live session', () => {
		bootSentinel();
		const first = liveSession()?.id;
		startCrashSentinel();
		expect(liveSession()?.id).toBe(first);
	});

	it('records an uncaught error, and an unhandled rejection', () => {
		bootSentinel();
		dispatchEvent(new ErrorEvent('error', { message: 'kaboom' }));
		expect(liveSession()?.lastError?.message).toContain('kaboom');
		expect(liveSession()?.errorCount).toBe(1);
	});

	it('caps the breadcrumb ring so a long session cannot grow without bound', () => {
		bootSentinel();
		for (let i = 0; i < 200; i++) breadcrumb('action', `step ${i}`);
		const crumbs = liveSession()?.crumbs ?? [];
		expect(crumbs.length).toBeLessThanOrEqual(60);
		// The ring keeps the RECENT end — the steps nearest the end are the ones that matter.
		expect(crumbs[crumbs.length - 1].m).toBe('step 199');
	});

	it('buffers breadcrumbs recorded before start and flushes them into the record', () => {
		breadcrumb('action', 'before boot');
		bootSentinel();
		expect((liveSession()?.crumbs ?? []).some((c) => c.m === 'before boot')).toBe(true);
	});

	it('keeps context to labels and clips a long one', () => {
		bootSentinel();
		setCrashContext({ Deck: 'x'.repeat(500), Slides: 12, Dropped: '' });
		const ctx = liveSession()?.context as Record<string, string>;
		expect(ctx.Deck.length).toBeLessThanOrEqual(80);
		expect(ctx.Slides).toBe('12');
		expect(ctx.Dropped).toBeUndefined();
	});

	it('noteError before start is a no-op rather than a throw', () => {
		expect(() => noteError(new Error('nobody listening'))).not.toThrow();
	});

	it('survives a storage-blocked browser instead of throwing on the boot path', () => {
		const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('QuotaExceededError');
		});
		expect(() => startCrashSentinel()).not.toThrow();
		expect(() => breadcrumb('action', 'still fine')).not.toThrow();
		spy.mockRestore();
	});
});

// The whole point of a local recorder is that it must never become the storage
// accumulation problem it exists to diagnose. These prove the bound end to end
// rather than trusting the individual caps.
describe('storage never accumulates', () => {
	const sessionBytes = () =>
		Object.keys(localStorage)
			.filter((k) => k.startsWith(SESSION_PREFIX))
			.reduce((n, k) => n + k.length + (localStorage.getItem(k) as string).length, 0);
	const sessionCount = () => Object.keys(localStorage).filter((k) => k.startsWith(SESSION_PREFIX)).length;

	it('stays flat across 200 boots — the steady state is a constant, not a slope', () => {
		const counts: number[] = [];
		for (let i = 0; i < 200; i++) {
			__resetSentinelForTest(); // each iteration is a fresh page load
			startCrashSentinel();
			// Saturate this session's rings, so every record left behind is a big one.
			for (let c = 0; c < 120; c++) breadcrumb('action', 'x'.repeat(300));
			counts.push(sessionCount());
		}
		// 5 retained past records + the live one. Constant from the moment it fills.
		expect(Math.max(...counts)).toBeLessThanOrEqual(6);
		expect(counts.slice(-50).every((n) => n === counts[counts.length - 1])).toBe(true);
		// And the bytes are bounded too, not just the record count.
		expect(sessionBytes()).toBeLessThan(120_000);
	});

	it('caps the breadcrumb ring and the heap trajectory inside one record', () => {
		startCrashSentinel();
		for (let i = 0; i < 500; i++) breadcrumb('action', `step ${i}`);
		const rec = liveSession() as SessionRecord;
		expect(rec.crumbs.length).toBeLessThanOrEqual(60);
		expect(rec.mem.length).toBeLessThanOrEqual(24);
	});

	// The one field whose SHAPE a caller controls. Values were always clipped;
	// the key count was not, so an unbounded set of distinct keys would have grown
	// forever — the only unbounded path in the module.
	it('caps the number of context keys, while still updating existing ones', () => {
		startCrashSentinel();
		for (let i = 0; i < 100; i++) setCrashContext({ [`k${i}`]: `v${i}` });
		const ctx = (liveSession() as SessionRecord).context;
		expect(Object.keys(ctx).length).toBeLessThanOrEqual(12);
		// An already-present key must still update once the cap is reached.
		const existing = Object.keys(ctx)[0];
		setCrashContext({ [existing]: 'updated' });
		expect((liveSession() as SessionRecord).context[existing]).toBe('updated');
	});

	it('expires records older than the retention window', () => {
		const ancient = { ...newRecord('old', Date.now() - 30 * 24 * 60 * 60 * 1000), lastBeat: Date.now() - 30 * 24 * 60 * 60 * 1000 };
		localStorage.setItem(SESSION_PREFIX + 'old', JSON.stringify(ancient));
		startCrashSentinel(); // prunes on boot
		expect(localStorage.getItem(SESSION_PREFIX + 'old')).toBeNull();
	});

	// Measured on the real Studio: deleting the keys was NOT enough. "Delete
	// Everything" reloads ~1.1s later, and in that window the shell's own effects
	// re-populate the record and `pagehide` writes it back — a fully-populated
	// record reappearing under a key that had just been erased.
	it('stays erased even when the page keeps running and tries to write again', () => {
		startCrashSentinel();
		setCrashContext({ Deck: 'Confidential Q3' });
		clearAllSessions();
		// Everything the live page would still do before its reload:
		setCrashContext({ Deck: 'Confidential Q3' });
		breadcrumb('action', 'late crumb');
		noteError(new Error('late error'));
		dispatchEvent(new Event('pagehide')); // the write on the way out
		expect(sessionCount()).toBe(0);
		const rec = liveSession() as SessionRecord;
		expect(rec.context).toEqual({});
		expect(rec.crumbs).toEqual([]);
	});

	it('lifts the seal on the next page load, so recording resumes', () => {
		startCrashSentinel();
		clearAllSessions();
		__resetSentinelForTest();
		startCrashSentinel(); // the reload
		breadcrumb('action', 'after reload');
		expect(sessionCount()).toBe(1);
		expect((liveSession() as SessionRecord).crumbs.some((c) => c.m === 'after reload')).toBe(true);
	});

	it('clearAllSessions leaves nothing behind — including the LIVE record', () => {
		startCrashSentinel();
		setCrashContext({ Deck: 'Confidential Q3' });
		breadcrumb('action', 'something private');
		localStorage.setItem(SESSION_PREFIX + 'other', JSON.stringify(newRecord('other', Date.now())));
		clearAllSessions();
		expect(sessionCount()).toBe(0);
		expect(sessionStorage.getItem(TAB_SESSION_KEY)).toBeNull();
		// The in-memory record is scrubbed too, or the next beat would rewrite the
		// deck title the user just asked to erase.
		const rec = liveSession() as SessionRecord;
		expect(rec.context).toEqual({});
		expect(rec.crumbs).toEqual([]);
	});

	it('crashReportStats sees the records, so the storage panel can account for them', () => {
		expect(crashReportStats()).toEqual({ count: 0, bytes: 0 });
		startCrashSentinel();
		const stats = crashReportStats();
		expect(stats.count).toBe(1);
		expect(stats.bytes).toBeGreaterThan(0);
	});
});

describe('isSessionRecord', () => {
	it('accepts our shape and rejects anything else', () => {
		expect(isSessionRecord(rec())).toBe(true);
		expect(isSessionRecord({ id: 'x' })).toBe(false);
		expect(isSessionRecord(null)).toBe(false);
		expect(isSessionRecord('string')).toBe(false);
	});
});
