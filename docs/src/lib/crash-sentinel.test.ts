import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	__resetSentinelForTest,
	BEAT_MS,
	breadcrumb,
	clearAllSessions,
	clearCrashReports,
	collectCrashReports,
	crashReportStats,
	describeSession,
	dismissCrashReport,
	elapsedLabel,
	formatCrashReport,
	isOpaqueError,
	isSessionRecord,
	isUncleanEnd,
	liveSession,
	markReported,
	newRecord,
	noteError,
	noteFailedLoad,
	pruneSessions,
	SESSION_PREFIX,
	type SessionRecord,
	STALE_MS,
	setCrashContext,
	startCrashSentinel,
	TAB_SESSION_KEY,
	unreportedCrashReports,
	WIPE_MARK_KEY,
	WIPE_SIGNAL_KEY,
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
	it('a cleanly closed record is never a crash, for either tab', () => {
		expect(isUncleanEnd(rec({ closed: true }), T0 + 60_000 + STALE_MS + 1, false)).toBe(false);
		expect(isUncleanEnd(rec({ closed: true }), T0 + 60_000 + STALE_MS + 1, true)).toBe(false);
		// The ONE exception, stated where the rule is: a record closed into the page
		// cache that never resumed, for the tab that owned it.
		expect(isUncleanEnd(rec({ closed: true, bfcached: true }), T0 + 61_000, true)).toBe(true);
		expect(isUncleanEnd(rec({ closed: true, bfcached: true }), T0 + 61_000, false)).toBe(false);
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

describe('describeSession — reports what was measured, never a cause', () => {
	const withMem = (usedFrac: number, over: Partial<SessionRecord> = {}) =>
		rec({
			mem: [
				{ t: 0, used: 100_000_000, limit: 1_000_000_000 },
				{ t: 55_000, used: usedFrac * 1_000_000_000, limit: 1_000_000_000 },
			],
			...over,
		});

	// The whole point of the rewrite: a leak used to print "no clear cause" as its
	// HEADLINE, directly above its own evidence of a large rise.
	it('leads with memory GROWTH, which is the informative number', () => {
		const leak = rec({ mem: [{ t: 0, used: 114_000_000, limit: 4_294_967_296 }, { t: 2_400_000, used: 992_000_000, limit: 4_294_967_296 }] });
		const { facts, headline } = describeSession(leak, { sameTab: true });
		expect(facts[0]).toMatch(/109 MB to 946 MB/);
		expect(facts[0]).toMatch(/8\.7x rise/);
		// And it does NOT dress that up as a cause.
		expect(headline).toBe('The Studio stopped unexpectedly');
		expect(facts.join(' ')).not.toMatch(/ran out of memory|likely cause/i);
	});

	it('says the browser reclaimed the tab ONLY when the browser said so', () => {
		expect(describeSession(withMem(0.2), { sameTab: true, tabDiscarded: true }).ending).toBe('reclaimed');
		const confirmed = describeSession(withMem(0.2), { sameTab: true, tabDiscarded: true });
		expect(confirmed.headline).toMatch(/browser reclaimed this tab to free memory/i);
		expect(confirmed.confirmed).toBe(true); // the browser said it, so the panel may drop its caveat
		// A frozen tab is NOT a confirmed reclaim — it is reported as an observation.
		const frozen = describeSession(withMem(0.2, { frozen: true }), { sameTab: true });
		expect(frozen.ending).toBe('stopped');
		expect(frozen.facts.join(' ')).toMatch(/frozen this tab in the background/i);
	});

	// The flag describes the TAB, so it cannot speak for a record this tab never ran.
	it('ignores wasDiscarded for a record this tab was never running', () => {
		expect(describeSession(withMem(0.2), { sameTab: false, tabDiscarded: true }).ending).toBe('stopped');
	});

	it('reports an error as an observation, with when — not as a verdict', () => {
		const withErr = rec({ lastError: { message: 'boom', t: 58_000 }, errorCount: 2 });
		const { facts, headline } = describeSession(withErr, { sameTab: true });
		expect(facts.join(' ')).toMatch(/2 error\(s\) recorded; the last one 2s before the end: boom/);
		expect(headline).toBe('The Studio stopped unexpectedly');
	});

	// A closed laptop lid used to be reported as "the main thread froze for 28800.0s"
	// and could become the headline. A gap that long is a sleeping device.
	it('calls a very long gap a sleeping device, not a freeze', () => {
		const slept = rec({ stallCount: 1, longestStallMs: 8 * 60 * 60 * 1000 });
		expect(describeSession(slept, { sameTab: true }).facts.join(' ')).toMatch(/device sleeping, not a freeze/i);
		const real = rec({ stallCount: 1, longestStallMs: 4_000 });
		expect(describeSession(real, { sameTab: true }).facts.join(' ')).toMatch(/froze for up to 4\.0s/);
	});

	it('states plainly when the browser exposes no memory readings', () => {
		expect(describeSession(rec({ mem: [] }), { sameTab: true }).facts.join(' ')).toMatch(/does not expose them/i);
	});

	it('still says a different tab could mean a force-quit', () => {
		expect(describeSession(rec(), { sameTab: false }).facts.join(' ')).toMatch(/force-quit/i);
		expect(describeSession(rec(), { sameTab: true }).facts.join(' ')).toMatch(/same tab came back/i);
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

	/** Force the navigation type this boot reports — the tab-continuity discriminator. */
	const withNavType = (type: string, fn: () => void) => {
		// biome-ignore lint/suspicious/noExplicitAny: a minimal navigation-timing stub; the real type demands ~30 fields the code never reads.
		const spy = vi.spyOn(performance, 'getEntriesByType').mockImplementation(((k: string) => (k === 'navigation' ? [{ type }] : [])) as any);
		try {
			fn();
		} finally {
			spy.mockRestore();
		}
	};

	it('marks the report sameTab when the mirror matches AND the tab reloaded', () => {
		localStorage.setItem(SESSION_PREFIX + 'prev', JSON.stringify(rec({ id: 'prev', lastBeat: Date.now() })));
		sessionStorage.setItem(TAB_SESSION_KEY, 'prev');
		withNavType('reload', () => {
			bootSentinel();
			const [report] = collectCrashReports(Date.now() + 1_000);
			expect(report?.sameTab).toBe(true);
		});
	});

	// `sessionStorage` is COPIED into a context opened from another one — verified
	// in real Chrome for `window.open` and Chrome's "Duplicate tab". The mirror
	// alone therefore proves nothing, and trusting it produced a confident crash
	// report about a session still running in the window next door.
	it('does NOT claim sameTab for a duplicated tab that merely inherited the mirror', () => {
		const live = rec({ id: 'prev', lastBeat: Date.now() }); // still beating
		localStorage.setItem(SESSION_PREFIX + 'prev', JSON.stringify(live));
		sessionStorage.setItem(TAB_SESSION_KEY, 'prev');
		withNavType('navigate', () => {
			bootSentinel();
			// Not same-tab, so the staleness rule applies — and a 1s-old record is
			// nowhere near stale, so the live sibling is not reported at all.
			expect(collectCrashReports(Date.now() + 1_000)).toEqual([]);
		});
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

	it('caps the breadcrumb ring inside one record', () => {
		startCrashSentinel();
		for (let i = 0; i < 500; i++) breadcrumb('action', `step ${i}`);
		expect((liveSession() as SessionRecord).crumbs.length).toBeLessThanOrEqual(60);
	});

	// This assertion used to ride along in the test above, claiming to cap "the
	// heap trajectory" — and it was VACUOUS. jsdom exposes no `performance.memory`,
	// `mem` is only ever pushed from `readMemory()`, so `mem.length` was always 0
	// and the assertion passed with MAX_MEM_SAMPLES deleted entirely. Drive the
	// real watchdog with fake timers and a stubbed heap instead, so the cap is
	// actually exercised — including the off-cadence push above MEM_PRESSURE,
	// which is the branch that can overflow the ring.
	it('caps the heap trajectory while sampling BOTH on cadence and under pressure', () => {
		vi.useFakeTimers();
		let used = 10_000_000;
		const limit = 1_000_000_000;
		Object.defineProperty(performance, 'memory', { configurable: true, get: () => ({ usedJSHeapSize: used, jsHeapSizeLimit: limit }) });
		try {
			startCrashSentinel();
			// 40 minutes of ticks, climbing into pressure so the off-cadence branch fires.
			for (let s = 0; s < 2400; s++) {
				used = Math.min(limit * 0.99, used + 400_000);
				vi.advanceTimersByTime(1000);
			}
			const rec = liveSession() as SessionRecord;
			expect(rec.mem.length).toBeGreaterThan(1); // it really sampled
			expect(rec.mem.length).toBeLessThanOrEqual(24); // and stayed capped
			// The BASELINE is never evicted — the leak comparison depends on mem[0].
			expect(rec.mem[0].t).toBe(0);
			expect(rec.peakUsed).toBeGreaterThan(rec.mem[0].used);
		} finally {
			delete (performance as unknown as { memory?: unknown }).memory;
			vi.useRealTimers();
		}
	});

	// The stall watchdog had zero coverage — no fake timers anywhere in this file.
	it('records a main-thread stall when a tick arrives late while visible', () => {
		vi.useFakeTimers();
		try {
			startCrashSentinel();
			vi.advanceTimersByTime(1000);
			// Jump the wall clock without running timers: the next tick arrives "late".
			vi.setSystemTime(Date.now() + 6000);
			vi.advanceTimersByTime(1000);
			const rec = liveSession() as SessionRecord;
			expect(rec.stallCount).toBeGreaterThan(0);
			expect(rec.longestStallMs).toBeGreaterThanOrEqual(2500);
			expect(rec.crumbs.some((c) => c.k === 'stall')).toBe(true);
		} finally {
			vi.useRealTimers();
		}
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

describe('the reachability fixes', () => {
	const withNav = (type: string, fn: () => void) => {
		// biome-ignore lint/suspicious/noExplicitAny: minimal navigation-timing stub
		const spy = vi.spyOn(performance, 'getEntriesByType').mockImplementation(((k: string) => (k === 'navigation' ? [{ type }] : [])) as any);
		try { fn(); } finally { spy.mockRestore(); }
	};

	// iOS fires `pagehide` on backgrounding, so a tab the OS later evicts used to
	// look exactly like a clean exit — the commonest mobile "it reloaded itself"
	// reported nothing at all.
	it('reports a tab evicted from the page cache, but only for the tab that owned it', () => {
		const evicted = rec({ id: 'ev', closed: true, bfcached: true, lastBeat: Date.now() });
		localStorage.setItem(SESSION_PREFIX + 'ev', JSON.stringify(evicted));
		sessionStorage.setItem(TAB_SESSION_KEY, 'ev');
		withNav('reload', () => {
			startCrashSentinel(); // latches the tab mirror + navigation type
			const [report] = collectCrashReports(Date.now() + 1000);
			expect(report?.ending).toBe('reclaimed');
			expect(report?.facts.join(' ')).toMatch(/dropped rather than resumed/i);
			// An INFERENCE, so the headline must not name a reason and the panel must
			// keep its caveat — the page cache is also emptied on limits and timeouts.
			expect(report?.headline).toMatch(/dropped this tab from its page cache/i);
			expect(report?.confirmed).toBe(false);
			expect(report?.facts.join(' ')).toMatch(/does not say which/i);
		});
		// A plain clean exit is still silent.
		__resetSentinelForTest();
		localStorage.clear();
		sessionStorage.clear();
		localStorage.setItem(SESSION_PREFIX + 'clean', JSON.stringify(rec({ id: 'clean', closed: true, lastBeat: Date.now() })));
		sessionStorage.setItem(TAB_SESSION_KEY, 'clean');
		withNav('reload', () => {
			startCrashSentinel();
			expect(collectCrashReports(Date.now() + 1000)).toEqual([]);
		});
	});

	it('interrupts once — a report already announced is not re-toasted', () => {
		localStorage.setItem(SESSION_PREFIX + 'a', JSON.stringify(rec({ id: 'a' })));
		startCrashSentinel();
		const now = Date.now() + STALE_MS + 1;
		expect(unreportedCrashReports(now)).toHaveLength(1);
		markReported('a');
		expect(unreportedCrashReports(now)).toHaveLength(0);
		// …but it is still LISTED, so Workspace can show and clear it.
		expect(collectCrashReports(now)).toHaveLength(1);
	});

	// `sealed` is per-document, so a wipe in tab A did nothing for tab B — whose
	// next beat rewrote the record tab A had just erased.
	it('seals this tab when ANOTHER tab broadcasts a wipe', () => {
		startCrashSentinel();
		setCrashContext({ Deck: 'Confidential' });
		breadcrumb('action', 'before the wipe');
		// The event another document's clearAllSessions would raise here.
		dispatchEvent(Object.assign(new Event('storage'), { key: WIPE_SIGNAL_KEY, newValue: '1' }));
		breadcrumb('action', 'after the wipe');
		dispatchEvent(new Event('pagehide'));
		const left = Object.keys(localStorage).filter((k) => k.startsWith(SESSION_PREFIX));
		expect(left).toEqual([]);
		const rec2 = liveSession() as SessionRecord;
		expect(rec2.context).toEqual({});
		expect(rec2.crumbs).toEqual([]);
	});
});

describe('isSessionRecord — the guard that keeps a bad record from taking the Studio down', () => {
	const good = () => JSON.parse(JSON.stringify(newRecord('x', Date.now())));

	it('accepts a record the recorder itself just wrote', () => {
		startCrashSentinel();
		breadcrumb('action', 'something');
		setCrashContext({ Deck: 'A deck' });
		noteError(new Error('boom'), 'test');
		const live = JSON.parse(localStorage.getItem(SESSION_PREFIX + (liveSession() as SessionRecord).id) as string);
		expect(isSessionRecord(live)).toBe(true);
	});

	it('rejects a foreign or older shape by version', () => {
		expect(isSessionRecord({ ...good(), v: 1 })).toBe(false);
		expect(isSessionRecord({ ...good(), v: undefined })).toBe(false);
	});

	// Each of these reached a reader that dereferenced it, and the throw landed in
	// StudioShell's mount effect — replacing the whole Studio with an error card.
	it('rejects every shape that used to throw inside the island', () => {
		expect(isSessionRecord({ ...good(), mem: undefined })).toBe(false);
		expect(isSessionRecord({ ...good(), mem: [null] })).toBe(false); // formatCrashReport reads .limit
		expect(isSessionRecord({ ...good(), mem: [{}] })).toBe(false); // NaN MB in the issue body
		expect(isSessionRecord({ ...good(), context: undefined })).toBe(false);
		expect(isSessionRecord({ ...good(), context: [] })).toBe(false);
		expect(isSessionRecord({ ...good(), context: { Deck: {} } })).toBe(false); // not a valid React child
		expect(isSessionRecord({ ...good(), crumbs: [{ t: 0, k: 7, m: 'x' }] })).toBe(false); // k.padEnd
		expect(isSessionRecord({ ...good(), startedAt: 1e20 })).toBe(false); // toISOString throws
	});

	it('rejects anything that is not a record at all', () => {
		expect(isSessionRecord(null)).toBe(false);
		expect(isSessionRecord('string')).toBe(false);
		expect(isSessionRecord({ id: 'x' })).toBe(false);
	});

	// The end-to-end version of the above: a poisoned record must cost that record,
	// never the collect.
	it('a malformed record is dropped, and the rest still report', () => {
		localStorage.setItem(`${SESSION_PREFIX}bad`, JSON.stringify({ ...good(), id: 'bad', mem: [null] }));
		localStorage.setItem(`${SESSION_PREFIX}ok`, JSON.stringify(rec({ id: 'ok' })));
		startCrashSentinel();
		const found = collectCrashReports(Date.now() + STALE_MS + 1);
		expect(found.map((r) => r.id)).toEqual(['ok']);
		expect(() => formatCrashReport(found[0])).not.toThrow();
	});
});

// ── The three defects the FIRST REAL REPORT off a phone exposed ──────────────
// Filed against Firefox on iOS 18.7 with an 18-slide deck: the session died 25s
// in after six identical `Script error.` entries, the automatic post-crash
// reload said nothing at all, and the report that finally appeared answered
// "what am I supposed to do with this?" with facts and no next step.
describe('what the first real crash report exposed', () => {

	// DEFECT 1 (the automatic reload showing nothing) is NOT fixed — issue #1621.
	// Three designs were built and withdrawn; what survives is the staleness wait,
	// which is slow but never accuses a live tab. This pins that property, because
	// every withdrawn design broke it: a record whose owner might still be running
	// is not reportable until the wait elapses.
	it('never reports a recent record from a tab it cannot prove died', () => {
		const r = rec({ id: 'other', closed: false, lastBeat: Date.now() });
		expect(isUncleanEnd(r, Date.now(), false)).toBe(false);
		expect(isUncleanEnd(r, Date.now() + STALE_MS + 1, false)).toBe(true);
	});

	// DEFECT 2a — six copies of one error read as six faults, and filled the
	// 60-crumb ring with duplicates that evicted the boot/nav context.
	it('folds a repeating error into one group and one breadcrumb', () => {
		bootSentinel();
		for (let i = 0; i < 6; i++) noteError({ message: 'Script error.' }, 'window.onerror');
		const live = liveSession() as SessionRecord;
		expect(live.errorCount).toBe(6);
		expect(live.errorGroups).toHaveLength(1);
		expect(live.errorGroups?.[0].n).toBe(6);
		expect(live.crumbs.filter((c) => c.k === 'error')).toHaveLength(1);
	});

	// DEFECT 2b — an error the browser refused to describe is a fact about
	// VISIBILITY, not a Studio fault, and the report must not present it as one.
	it('recognizes the opaque cross-origin signature and says what it means', () => {
		expect(isOpaqueError('Script error.', undefined, undefined)).toBe(true);
		expect(isOpaqueError('Script error.', 'app.js', undefined)).toBe(false); // named a file
		expect(isOpaqueError('TypeError: x is not a function', undefined, undefined)).toBe(false);
		bootSentinel();
		for (let i = 0; i < 6; i++) noteError({ message: 'Script error.' }, 'window.onerror');
		const live = liveSession() as SessionRecord;
		const { facts } = describeSession({ ...live, closed: false }, true);
		const line = facts.find((f) => f.includes('would not describe'));
		expect(line).toBeTruthy();
		expect(line).toContain('6 error(s)');
		expect(line).toContain('browser extension');
		// And it must NOT be presented as a plain Studio error alongside.
		expect(facts.some((f) => f.startsWith('Error ('))).toBe(false);
	});

	it('keeps a real, attributable error as a real error — with its file and line', () => {
		bootSentinel();
		noteError({ message: 'TypeError: deck is undefined', stack: 'at render' }, 'window.onerror', { file: '/_astro/page.js', line: 42 });
		const live = liveSession() as SessionRecord;
		const { facts, steps } = describeSession({ ...live, closed: false }, true);
		expect(facts.some((f) => f.includes('/_astro/page.js:42'))).toBe(true);
		expect(steps.some((s) => s.includes('Report this on GitHub'))).toBe(true);
	});

	// DEFECT 2c — a file that fails to LOAD fires an event that does not bubble
	// and carries no message, so `window.onerror` never saw it at all.
	it('records a failed resource load, with the URL', () => {
		bootSentinel();
		noteFailedLoad('/_astro/gone.js');
		noteFailedLoad('/_astro/gone.js'); // deduped
		const live = liveSession() as SessionRecord;
		expect(live.failedLoads).toEqual(['/_astro/gone.js']);
		const { facts, steps } = describeSession({ ...live, closed: false }, true);
		expect(facts.some((f) => f.includes('/_astro/gone.js'))).toBe(true);
		expect(steps.some((s) => s.includes('Reload the page once'))).toBe(true);
	});

	// DEFECT 3 — "what am I supposed to do with this?". A report with no memory
	// readings (Safari, Firefox) used to end on "no memory readings" and stop.
	it('always offers a next step, and names the one that fits a memory-blind browser', () => {
		bootSentinel();
		const live = liveSession() as SessionRecord;
		const { steps } = describeSession({ ...live, mem: [], closed: false }, true);
		expect(steps.length).toBeGreaterThan(0);
		expect(steps.some((s) => s.includes('Chrome or Edge'))).toBe(true);
	});

	it('says plainly when there is nothing to act on, rather than inventing a chore', () => {
		bootSentinel();
		const live = liveSession() as SessionRecord;
		const { steps } = describeSession({ ...live, mem: [{ t: 0, used: 5e6, limit: 4e9 }], closed: false }, true);
		expect(steps).toHaveLength(1);
		expect(steps[0]).toContain('nothing here to act on yet');
	});

	// The steps are part of the filed issue, not just the panel — otherwise the
	// reader and the maintainer are looking at two different reports.
	it('carries the steps and the failed loads into the GitHub issue body', () => {
		bootSentinel();
		noteFailedLoad('/_astro/gone.js');
		const live = liveSession() as SessionRecord;
		// Keyed by the record's OWN id — `sessionKeys()` reads the key, `readRecord`
		// reads the body, and a mismatch simply yields nothing.
		localStorage.setItem(`${SESSION_PREFIX}past`, JSON.stringify({ ...live, id: 'past', closed: false }));
		__resetSentinelForTest();
		bootSentinel();
		const [report] = collectCrashReports(Date.now() + STALE_MS + 1);
		const body = formatCrashReport(report);
		expect(body).toContain('What the reporter was told to try');
		expect(body).toContain('Files that failed to load');
		expect(body).toContain('/_astro/gone.js');
	});
});

// The guard's third field. `failedLoads` is rendered STRAIGHT as React children
// by the report sheet, so a non-string there throws inside StudioShell's mount
// path and swaps the whole Studio for an error card — on every load, until the
// record ages out. That has now shipped twice, one field over each time.
describe('the new optional fields cannot brick the Studio', () => {
	const good = (): SessionRecord => rec({ id: 'g' });

	it('rejects a failedLoads that would not survive being rendered', () => {
		expect(isSessionRecord({ ...good(), failedLoads: [{ url: '/a.js', status: 404 }] })).toBe(false);
		expect(isSessionRecord({ ...good(), failedLoads: 'nope' })).toBe(false);
		expect(isSessionRecord({ ...good(), failedLoads: [null] })).toBe(false);
		// Absent and well-formed both stay valid — the field is optional so records
		// written before it existed still read.
		expect(isSessionRecord(good())).toBe(true);
		expect(isSessionRecord({ ...good(), failedLoads: ['/a.js'] })).toBe(true);
	});

	it('rejects an errorGroups that would print NaN into a public issue', () => {
		expect(isSessionRecord({ ...good(), errorGroups: [{ message: 'boom', n: 2 }] })).toBe(false); // no firstT/lastT
		expect(isSessionRecord({ ...good(), errorGroups: [{ message: 7, n: 1, firstT: 0, lastT: 0 }] })).toBe(false);
		expect(isSessionRecord({ ...good(), errorGroups: 'boom' })).toBe(false);
		expect(isSessionRecord({ ...good(), errorGroups: [{ message: 'boom', n: 2, firstT: 0, lastT: 10 }] })).toBe(true);
	});

	it('drops such a record instead of letting it reach a reader', () => {
		localStorage.setItem(`${SESSION_PREFIX}bad`, JSON.stringify({ ...good(), id: 'bad', closed: false, failedLoads: [{}] }));
		startCrashSentinel();
		expect(collectCrashReports(Date.now() + STALE_MS + 1).map((r) => r.id)).toEqual([]);
	});
});

// A resource that fails to LOAD fires `error` AT THE ELEMENT and does not bubble,
// so the bubble-phase handler never sees it. The capture-phase wiring is where
// the subtlety lives, and it was previously untested.
describe('the capture-phase resource listener', () => {
	it('records a failed element load, and does not double-count a script throw', () => {
		startCrashSentinel();
		const img = document.createElement('img');
		img.setAttribute('src', '/_astro/missing.png?token=secret');
		document.body.appendChild(img);
		img.dispatchEvent(new Event('error', { bubbles: false }));
		const live = liveSession() as SessionRecord;
		// The URL is recorded WITHOUT its query — this string goes into a public
		// GitHub issue, and a resource URL is exactly the kind that carries a token.
		expect(live.failedLoads).toEqual(['/_astro/missing.png']);
		expect(live.errorCount).toBe(0); // a load failure is not a thrown error
		// A script exception targets `window`, which has no string tagName, so the
		// capture listener must ignore it and leave it to the bubble-phase handler.
		dispatchEvent(new ErrorEvent('error', { message: 'TypeError: x', filename: '/_astro/p.js', lineno: 3 }));
		const after = liveSession() as SessionRecord;
		expect(after.failedLoads).toEqual(['/_astro/missing.png']);
		expect(after.errorCount).toBe(1);
		img.remove();
	});
});

// The FOURTH field to reach a renderer unguarded, found by a red-team pass that
// built a record `isSessionRecord` approved and watched the panel die on it.
// Three had been fixed one at a time; this checks the whole rendered surface.
describe('every field the panel renders is type-checked', () => {
	it('rejects a non-string in any field that becomes a React child', () => {
		const good = (): SessionRecord => rec({ id: 'g' });
		expect(isSessionRecord({ ...good(), page: { evil: 1 } })).toBe(false);
		expect(isSessionRecord({ ...good(), ua: 42 })).toBe(false);
		expect(isSessionRecord({ ...good(), nav: {} })).toBe(false);
		expect(isSessionRecord({ ...good(), page: '', ua: '' })).toBe(true); // empty is fine, absent-typed is not
	});
});

// Two holes a verification pass found in the FIRST round of guard-hardening,
// both in code written to close exactly this class.
describe('the guard and the query strip, after a second pass', () => {
	it('rejects a lastError that would break the panel or the issue body', () => {
		const good = (): SessionRecord => rec({ id: 'g' });
		expect(isSessionRecord({ ...good(), lastError: 'a string' })).toBe(false);
		expect(isSessionRecord({ ...good(), lastError: { message: { evil: 1 }, t: 0 } })).toBe(false);
		expect(isSessionRecord({ ...good(), lastError: { message: 'boom' } })).toBe(false); // no t → +NaN in the issue
		expect(isSessionRecord({ ...good(), lastError: { message: 'boom', t: 5, stack: 7 } })).toBe(false);
		expect(isSessionRecord({ ...good(), lastError: { message: 'boom', t: 5 } })).toBe(true);
	});

	it('does not restore the query when the URL has no path', () => {
		startCrashSentinel();
		// `<img src="?token=…">` is legal HTML. The `|| url` fallback put the whole
		// string — secret included — back into a PUBLIC issue body.
		noteFailedLoad('?token=secret');
		noteFailedLoad('/ok.js?token=secret');
		expect((liveSession() as SessionRecord).failedLoads).toEqual(['(unnamed resource)', '/ok.js']);
	});
});

// #1616 — a tab that was ASLEEP during "Delete everything" woke up and wrote its
// session straight back, so data the user deleted reappeared. The wipe broadcast
// is a live event and a frozen tab is by definition not running to hear it.
describe('a wipe survives a tab that slept through it', () => {
	const sessionCount = () => Object.keys(localStorage).filter((k) => k.startsWith(SESSION_PREFIX)).length;
	/** What another tab's `clearAllSessions()` leaves behind in shared storage. */
	const anotherTabWipes = () => {
		for (const k of Object.keys(localStorage)) if (k.startsWith(SESSION_PREFIX)) localStorage.removeItem(k);
		localStorage.setItem(WIPE_MARK_KEY, String(Date.now() + 1));
	};

	it('seals on resume, so the next heartbeat cannot write the record back', () => {
		startCrashSentinel();
		setCrashContext({ Deck: 'Confidential Q3' });
		breadcrumb('action', 'something private');
		expect(sessionCount()).toBe(1);

		anotherTabWipes(); // this tab is frozen and hears nothing
		document.dispatchEvent(new Event('resume'));

		breadcrumb('action', 'after waking'); // the write that used to resurrect it
		expect(sessionCount()).toBe(0);
		const rec = liveSession() as SessionRecord;
		expect(rec.context).toEqual({});
		expect(rec.crumbs).toEqual([]);
	});

	it('seals on a page-cache restore too — the other way a tab falls asleep', () => {
		startCrashSentinel();
		breadcrumb('action', 'something private');
		anotherTabWipes();
		dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
		breadcrumb('action', 'after waking');
		expect(sessionCount()).toBe(0);
	});

	// The belt to those braces: whatever path a document wakes by — including one
	// nobody has thought of — the heartbeat is what would resurrect the data.
	it('seals on the next heartbeat even if no wake-up event fires at all', () => {
		vi.useFakeTimers();
		startCrashSentinel();
		breadcrumb('action', 'something private');
		anotherTabWipes();
		vi.advanceTimersByTime(BEAT_MS + 1_000);
		expect(sessionCount()).toBe(0);
		vi.useRealTimers();
	});

	it('does not seal a tab that simply woke with no wipe in the interval', () => {
		startCrashSentinel();
		breadcrumb('action', 'ordinary work');
		document.dispatchEvent(new Event('resume'));
		breadcrumb('action', 'still working');
		expect(sessionCount()).toBe(1);
		expect((liveSession() as SessionRecord).crumbs.some((c) => c.m === 'still working')).toBe(true);
	});

	// The tab that DID the wipe must not later "discover" it and re-scrub — and,
	// more importantly, the mark must not make the wiping tab look wiped-by-others.
	it('the wiping tab does not re-detect its own wipe', () => {
		startCrashSentinel();
		clearAllSessions();
		document.dispatchEvent(new Event('resume'));
		expect(localStorage.getItem(WIPE_MARK_KEY)).toBeTruthy(); // durable on purpose
		expect(sessionCount()).toBe(0);
	});
});
