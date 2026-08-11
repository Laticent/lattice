/**
 * The Studio crash sentinel — a local flight recorder for the failure class no
 * in-page handler can ever catch.
 *
 * THE PROBLEM. "The Studio crashed and the page refreshed" is not a JavaScript
 * exception. When the tab's renderer process dies (out of memory, a GPU fault,
 * an OS kill) or the browser DISCARDS a backgrounded tab to reclaim memory, the
 * page's JS is already gone: `window.onerror` never fires, `unhandledrejection`
 * never fires, React's ErrorBoundary never runs, `beforeunload` never runs, and
 * the console is wiped by the reload that follows. Every reporting mechanism the
 * docs site has (ErrorBoundary, the chunk-load card, `console.error`) is a
 * SURVIVOR'S mechanism — it needs the page to still be alive. None of them can
 * see this.
 *
 * THE MECHANISM. The only thing that survives a renderer death is what was
 * written down BEFORE it. So this module keeps a small session record in
 * `localStorage`, rewritten on a 5s heartbeat, carrying a ring of breadcrumbs, a
 * coarse memory trajectory, main-thread stalls, and the last error seen. On a
 * clean exit (`pagehide`) the record is stamped `closed`. On the NEXT boot, a
 * record that was never closed is a session that ended without saying goodbye —
 * and that is the report.
 *
 * WHAT THIS CAN AND CANNOT PROVE. An unclosed record means "this session ended
 * without a clean unload". It does NOT prove a crash: a force-quit, a device
 * reboot, or a battery death look identical from in here. Two things sharpen it:
 *
 *   · TAB CONTINUITY — the live session id is mirrored into `sessionStorage`,
 *     which is scoped to the TAB and survives a crash-and-restore but not a new
 *     tab. If a boot finds the tab still pointing at an unclosed record, the same
 *     tab reloaded itself — the exact symptom being reported, and not something a
 *     force-quit produces.
 *   · THE FREEZE SIGNAL — the Page Lifecycle API's `freeze` fires when a
 *     backgrounded tab becomes discard-eligible. A record whose last state is
 *     frozen ended in a browser DISCARD, which also presents to the user as "it
 *     reloaded itself" but has a different cause (and a different fix) from an
 *     out-of-memory renderer crash.
 *
 * Everything below distinguishes what was OBSERVED from what is INFERRED, and
 * the report copy does too. A confident wrong diagnosis is worse than an honest
 * "ended unexpectedly, here is the trail".
 *
 * PRIVACY. Nothing leaves the browser. There is no endpoint, no beacon, no
 * server — consistent with the rest of the site (a static bundle with no request
 * path of its own; see lib/feedback-issue.ts). Breadcrumbs are LABELS, never
 * deck content: callers pass "inserted slide", not the slide. Reporting is an
 * explicit user action that hands a pre-filled GitHub issue to the user's own
 * account, which they read before submitting.
 *
 * COST. One `setInterval(1000)` that writes ~4-8KB every 5th tick, plus four
 * passive listeners. Records are capped, pruned to the newest few, and expire —
 * this must not become the storage-accumulation problem it exists to diagnose
 * (engineering/decisions/2026-07-21-storage-accumulation-diagnostic.md).
 */

export const RECORD_VERSION = 2; // bumped: `bfcached`/`reported` added, and `closed` changed meaning

/** `localStorage` key prefix — one record per session. Prefixed `lattice-studio-` like every other Studio key. */
export const SESSION_PREFIX = 'lattice-studio-session-';
/** `sessionStorage` (TAB-scoped) mirror of the live session id — the tab-continuity signal. */
export const TAB_SESSION_KEY = 'lattice-studio-tab-session';
/**
 * Window event that opens the report panel. The panel is owned by StudioShell
 * (it holds the collected reports and their dismissal state) while the standing
 * entry point lives in the Workspace sheet, a sibling — so the two talk through
 * an event rather than a prop threaded across the whole shell.
 */
export const OPEN_CRASH_REPORT_EVENT = 'lattice:open-crash-report';
/**
 * Cross-tab wipe signal. Written-then-removed by `clearAllSessions` so every
 * OTHER Studio tab on this origin seals itself — see the `storage` listener.
 */
// NOT under SESSION_PREFIX — `sessionKeys()` scans by that prefix, so a signal
// key living under it would be read back as a (malformed) session record.
export const WIPE_SIGNAL_KEY = 'lattice-studio-wipe-signal';

/** Heartbeat period: how stale `lastBeat` can be on a healthy session. */
export const BEAT_MS = 5_000;
/** Watchdog tick — also the stall probe. */
const TICK_MS = 1_000;
/** A tick this late means the main thread was blocked for at least this long. */
const STALL_MS = 2_500;
/**
 * How stale another tab's record must be before this boot may call it ended.
 *
 * This was 90s, and 90s was wrong — the comment justifying it contained the
 * error. Chrome's intensive throttling gives a hidden tab roughly one timer
 * callback per MINUTE, and the original reasoning stopped there. But a callback
 * is a TICK, and `tick()` only writes a beat every fifth tick, so a healthy
 * hidden tab refreshes `lastBeat` about once every FIVE minutes. At 90s a
 * perfectly alive background tab was harvested as a crash — reproduced on the
 * real Studio, and it is the most ordinary way anyone uses this app (leave the
 * Studio open, work elsewhere, come back).
 *
 * The floor is therefore the throttled beat interval, not the throttled tick
 * interval: 60s × (BEAT_MS / TICK_MS) = 5 minutes. Doubled for headroom against
 * a machine that was briefly suspended or is simply slow. Records from THIS tab
 * skip the wait entirely (see `isSameTab`), so the case the user actually
 * reports — a tab that died and reloaded — is still detected in seconds; only
 * the cannot-prove-it-was-this-tab path waits.
 */
export const STALE_MS = 10 * 60_000;

const MAX_CRUMBS = 60;
const MAX_MEM_SAMPLES = 24;
/** Push a memory sample every N beats (5s × 6 = 30s of trajectory per sample). */
const MEM_EVERY_BEATS = 6;
/** Keep at most this many past records, newest first. */
const KEEP_RECORDS = 5;
/** Records older than this are dropped on boot, reported or not. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Heap fraction at or above which memory pressure is the leading explanation. */
export const MEM_PRESSURE = 0.85;

/**
 * A recording gap longer than this is a sleeping device, not a blocked thread.
 * Closing a laptop lid does not reliably fire `visibilitychange`, so on wake the
 * first tick sees the whole sleep as one late callback — and that used to be
 * reported as "the main thread froze for 28800.0s", and could become the verdict.
 */
const SLEEP_MS = 120_000;

const CRUMB_MAX_CHARS = 180;
/** Context labels a report may carry. Caps the one field a caller controls the SHAPE of. */
const MAX_CONTEXT_KEYS = 12;

export type BreadcrumbKind =
	| 'boot'
	| 'action'
	| 'nav'
	| 'render'
	| 'error'
	| 'stall'
	| 'memory'
	| 'lifecycle';

export type Breadcrumb = {
	/** ms since the session started — a relative clock reads better in a timeline than 13-digit epochs. */
	t: number;
	k: BreadcrumbKind;
	m: string;
};

export type MemSample = { t: number; used: number; limit: number };

export type RecordedError = {
	message: string;
	stack?: string;
	source?: string;
	/** ms since the session started. */
	t: number;
	/** The script the browser named, when it named one. */
	file?: string;
	line?: number;
	/**
	 * The browser refused to say what threw: `"Script error."`, no file, no line,
	 * no stack. See `isOpaqueError` — this is a fact about VISIBILITY, and the
	 * report must say so rather than present the empty husk as a finding.
	 */
	opaque?: boolean;
};

/**
 * Identical errors, folded.
 *
 * The first real report from a phone listed the same `Script error.` six times
 * in the trail and summarized it as "6 error(s) recorded", which reads as six
 * distinct faults. It was one fault repeating. Grouping by message turns a wall
 * of noise into "×6, from +1.9s to +25.7s", which is the shape a human can
 * actually act on — and makes a genuinely varied error set visibly different
 * from a single stuck one.
 *
 * Deliberately carries no stack: the stacks live on `lastError`, and a ring of
 * them would multiply the record's size for a diminishing return.
 */
export type ErrorGroup = {
	message: string;
	/** How many times this message was seen. */
	n: number;
	/** ms since session start, first and last occurrence. */
	firstT: number;
	lastT: number;
	file?: string;
	line?: number;
	opaque?: boolean;
};

/** How many DISTINCT error messages a record keeps. Beyond this, only the count grows. */
export const MAX_ERROR_GROUPS = 6;

/**
 * Did the browser sanitize this error into an empty husk?
 *
 * When a script from another origin throws, browsers replace the message with
 * exactly `"Script error."` and blank the filename, line and stack, so the page
 * cannot read cross-origin source through its own error handler. The signature
 * is unmistakable, and recognizing it matters more than it looks: this page
 * loads NO cross-origin scripts — the static markup carries only same-origin
 * `/_astro/*.js` (checked against the deployed site), and the two scripts added
 * at RUNTIME are same-origin too: the engine bundle `ensureEngine` injects
 * (`load-engine.ts`) and the inline page scripts. The CDN URLs for Mermaid and
 * KaTeX go into the preview IFRAME's `srcdoc`, and an error inside an iframe
 * never reaches the parent's `window.onerror` — so they cannot be the source
 * either. With every path checked, an opaque error is
 * almost certainly NOT Studio code — it is an extension, a content blocker or
 * an injected script. Reporting it as one of "your" errors sends the reader
 * hunting through code that never ran.
 */
export function isOpaqueError(message: string, file?: string, stack?: string): boolean {
	return !file && !stack && /^script error\.?$/i.test(message.trim());
}

export type SessionRecord = {
	v: number;
	id: string;
	startedAt: number;
	lastBeat: number;
	/** Set on a clean `pagehide`. Its ABSENCE is the whole signal. */
	closed?: boolean;
	/** Set while the tab is frozen (discard-eligible); cleared on resume. */
	frozen?: boolean;
	/**
	 * Set when `pagehide` fired with `persisted` — the page went into the
	 * back/forward cache rather than being torn down. Cleared if it comes back.
	 * A record left in this state was evicted from that cache and never resumed,
	 * which is how an iOS tab eviction presents: Safari fires `pagehide` on
	 * backgrounding, so the ONLY trace of a reclaim there is this flag.
	 */
	bfcached?: boolean;
	/** The user has already been told about this one — see `markReported`. */
	reported?: boolean;
	page: string;
	ua: string;
	/** How this document was entered — `reload` on a crash-restore. */
	nav?: string;
	/** Caller-supplied labels (deck title, slide count, posture). Never deck content. */
	context: Record<string, string>;
	crumbs: Breadcrumb[];
	mem: MemSample[];
	/** Highest `usedJSHeapSize` seen, and the limit it was measured against. */
	peakUsed?: number;
	memLimit?: number;
	lastError?: RecordedError;
	/**
	 * Distinct error messages, folded — see `ErrorGroup`. OPTIONAL on purpose:
	 * records written before this field existed simply lack it, and every reader
	 * falls back to `lastError`. That is why this change did NOT bump
	 * `RECORD_VERSION` — a version bump discards every record already sitting in a
	 * user's browser, which would have thrown away the very report that prompted
	 * this work. Bump only when new code would MISREAD an old record; adding an
	 * optional field it can ignore is not that.
	 */
	errorGroups?: ErrorGroup[];
	/** URLs that failed to LOAD (script/style/image), newest last. See `onCapturedError`. */
	failedLoads?: string[];
	errorCount: number;
	stallCount: number;
	longestStallMs: number;
};

/**
 * What the session ENDED AS — not what we think killed it.
 *
 * Two values, because only two things are actually knowable from inside a page:
 * the browser TOLD us it reclaimed the tab (`document.wasDiscarded`), or the
 * session simply stopped without closing cleanly. Everything else this module
 * observes — heap growth, an error, a freeze — is reported as a measured FACT
 * alongside, never promoted into a cause.
 *
 * The earlier design had five verdicts and named a cause. It was wrong in the
 * way that matters: `memory` tested the JS heap against `jsHeapSizeLimit`
 * (~4 GB on desktop), while a Studio tab dies from renderer memory that number
 * cannot see — so the canonical case, a slow leak, printed "no clear cause"
 * directly above its own "heap grew 9x" evidence. The browser does know the
 * real answer, and will only send it to a SERVER endpoint (verified: after a
 * real renderer crash, a page observing `ReportingObserver` type 'crash' on the
 * next load sees nothing). This site has no server by design, so the honest
 * move is to report what was measured and let the reader conclude.
 */
export type CrashEnding = 'reclaimed' | 'stopped';

/**
 * What THIS boot knows about the session it is judging. Both facts are readable
 * only at start-up, before the recorder overwrites its own tracks.
 */
export type ClassifyContext = {
	/** The tab-scoped mirror still named this record — the same tab came back. */
	sameTab: boolean;
	/**
	 * `document.wasDiscarded` on this load: the browser stating that THIS tab was
	 * previously discarded. Only meaningful together with `sameTab` — it describes
	 * the tab, so it can only speak for the record that tab was running.
	 */
	tabDiscarded?: boolean;
	/**
	 * This boot CHALLENGED the owning tab and it did not answer — see
	 * `watchLateCrashReports`. Weaker than `sameTab` (which is proof the same tab
	 * came back) but far stronger than the staleness timer, and it must reach the
	 * copy: without it the late path printed "a different tab or a later visit…
	 * may also have ended with a force-quit", which is the OPPOSITE of what was
	 * established, on the exact path built to serve a tab that died and came back.
	 */
	ownerDead?: boolean;
};

export type CrashReport = {
	id: string;
	record: SessionRecord;
	ending: CrashEnding;
	/** A factual headline — it names a reason only where the browser stated one. */
	headline: string;
	/** The browser itself stated the reason. Everything else is an observation. */
	confirmed: boolean;
	/** What was MEASURED, in plain sentences. No conclusions. */
	facts: string[];
	/** What the reader can actually DO next — see `describeSession`. */
	steps: string[];
	/** True when the SAME tab came back — the "it reloaded itself" case. */
	sameTab: boolean;
	startedAt: number;
	/** Last heartbeat — the closest thing to a time of death we have. */
	endedAt: number;
	durationMs: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Pure core — no storage, no globals. Everything below this line is unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

const clip = (s: string, n = CRUMB_MAX_CHARS): string => {
	const flat = String(s ?? '').replace(/\s+/g, ' ').trim();
	return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat;
};

/** A blank record — exported shape used by both the recorder and the tests. */
export function newRecord(id: string, now: number, seed: Partial<SessionRecord> = {}): SessionRecord {
	return {
		v: RECORD_VERSION,
		id,
		startedAt: now,
		lastBeat: now,
		page: '',
		ua: '',
		context: {},
		crumbs: [],
		mem: [],
		errorCount: 0,
		stallCount: 0,
		longestStallMs: 0,
		...seed,
	};
}

/**
 * Is this record shaped like one of ours, and written by a version whose shape
 * we still understand?
 *
 * The first cut checked four fields and called itself a guard against "a
 * hand-edited or foreign value". It was not one, and the gap was severe rather
 * than academic: a record missing `mem` sailed through, `classifySession` then
 * dereferenced `rec.mem[rec.mem.length - 1]`, and the throw landed inside
 * StudioShell's MOUNT effect — where the island boundary replaced the entire
 * Studio with an error card, on every load, until the record aged out seven days
 * later. A diagnostic that bricks the app it diagnoses is the worst possible
 * failure, and it was reachable without touching devtools: this site is a PWA,
 * so a service-worker-cached older bundle can read records a newer one wrote
 * (and vice versa).
 *
 * So: check the VERSION — `RECORD_VERSION` existed from the start and was
 * written but never read, which is the whole reason a shape change could go
 * undetected — and check every field the readers actually dereference. Anything
 * else is discarded as unreadable rather than trusted; `readRecord` drops it.
 */
export function isSessionRecord(v: unknown): v is SessionRecord {
	if (!v || typeof v !== 'object') return false;
	const r = v as Partial<SessionRecord>;
	// A record from a future/older shape is not ours to interpret.
	if (r.v !== RECORD_VERSION) return false;
	if (typeof r.id !== 'string' || !r.id) return false;
	if (!Number.isFinite(r.startedAt) || !Number.isFinite(r.lastBeat)) return false;
	// Every collection a reader walks unguarded must actually be walkable.
	if (!Array.isArray(r.crumbs) || !Array.isArray(r.mem)) return false;
	if (!r.context || typeof r.context !== 'object' || Array.isArray(r.context)) return false;
	// Context VALUES are rendered as React children — a non-string is "Objects are
	// not valid as a React child", i.e. the whole island down.
	for (const v of Object.values(r.context)) if (typeof v !== 'string') return false;
	// The counters `classifySession` formats.
	if (!Number.isFinite(r.errorCount) || !Number.isFinite(r.stallCount) || !Number.isFinite(r.longestStallMs)) return false;
	// THE NEW OPTIONAL FIELDS GET THE SAME TREATMENT AS THE OLD ONES. They are
	// optional so an older record still reads (which is why RECORD_VERSION did not
	// move), but "optional" is about ABSENCE — a field that IS present and the
	// wrong shape is the exact failure this guard exists for, and both of these
	// reach a reader that dereferences them: `failedLoads` is rendered straight as
	// React children by the report sheet, and a non-string there throws inside
	// StudioShell's island and replaces the whole Studio with an error card. That
	// has now shipped twice, one field over each time; this is the third field and
	// it is not going to be the third time.
	if (r.failedLoads !== undefined) {
		if (!Array.isArray(r.failedLoads) || r.failedLoads.some((u) => typeof u !== 'string')) return false;
	}
	if (r.errorGroups !== undefined) {
		if (!Array.isArray(r.errorGroups)) return false;
		for (const g of r.errorGroups) {
			if (!g || typeof g !== 'object' || typeof g.message !== 'string') return false;
			// `firstT`/`lastT` are formatted by `stamp()`, which turns a missing value
			// into "NaNh NaNm" — printed, unnoticed, into a PUBLIC GitHub issue.
			if (!Number.isFinite(g.n) || !Number.isFinite(g.firstT) || !Number.isFinite(g.lastT)) return false;
		}
	}
	// A timestamp that `new Date().toISOString()` would throw on is not evidence.
	if (Math.abs(r.startedAt as number) > 8.64e15 || Math.abs(r.lastBeat as number) > 8.64e15) return false;
	// Crumb shape — `formatCrashReport` calls `c.k.padEnd`, which a numeric `k` fails.
	for (const c of r.crumbs) {
		if (!c || typeof c !== 'object' || typeof c.k !== 'string' || typeof c.m !== 'string' || !Number.isFinite(c.t)) return false;
	}
	// MEM ELEMENTS TOO. The first hardening pass validated crumbs and stopped —
	// and `mem: [null]` still sailed through to `formatCrashReport`, which
	// dereferences `.limit` on the last sample. That throw renders from the sheet's
	// useMemo, so it took the whole Studio down exactly like the bug this guard was
	// written to close, one field over.
	for (const m of r.mem) {
		if (!m || typeof m !== 'object' || !Number.isFinite(m.t) || !Number.isFinite(m.used) || !Number.isFinite(m.limit)) return false;
	}
	return true;
}

/**
 * Did this session end without a clean unload — and may THIS boot say so yet?
 *
 * `sameTab` short-circuits the staleness wait: the tab-scoped mirror can only
 * point at a record written by this very tab, so there is no live second tab to
 * mistake for a corpse.
 */
export function isUncleanEnd(rec: SessionRecord, now: number, sameTab: boolean, ownerDead = false): boolean {
	// A record closed INTO the page cache that never resumed was evicted, not
	// exited — and only the tab it belonged to can tell the difference, because
	// coming back at all is what would have cleared the flag. This is the iOS
	// reclaim path; without it Safari's backgrounding `pagehide` made the most
	// common mobile "it reloaded itself" invisible.
	if (rec.closed && rec.bfcached && sameTab) return true;
	if (rec.closed) return false;
	// A record from the future (clock change, an edited value) is not evidence.
	if (rec.lastBeat > now + BEAT_MS) return false;
	// `ownerDead` is the OBSERVED version of the staleness wait — see
	// `watchLateCrashReports`. Where the wait guesses from one timestamp that
	// nobody is home, this watched the record for a stretch and saw that nothing
	// wrote to it. That is strictly better evidence, and it arrives in seconds
	// rather than minutes.
	return sameTab || ownerDead || now - rec.lastBeat > STALE_MS;
}


const mb = (bytes: number): string => `${Math.round(bytes / 1_048_576)} MB`;

export function describeSession(rec: SessionRecord, ctx: boolean | ClassifyContext): { ending: CrashEnding; headline: string; confirmed: boolean; facts: string[]; steps: string[] } {
	const { sameTab, tabDiscarded = false, ownerDead = false } = typeof ctx === 'boolean' ? { sameTab: ctx, tabDiscarded: false, ownerDead: false } : ctx;
	const facts: string[] = [];
	const endT = rec.lastBeat - rec.startedAt;
	const last = rec.mem[rec.mem.length - 1];
	const first = rec.mem[0];

	// ── MEMORY: lead with GROWTH, which is the informative number, not the
	// fraction of a limit the tab never reaches. A tab dies from renderer memory
	// (DOM, the preview iframe, workers, export buffers) that `usedJSHeapSize`
	// does not count, so "92% of the limit" essentially never happens while
	// "grew 9x in 40 minutes" happens every time there is a leak.
	if (last && first && last.t > first.t) {
		const growth = first.used > 0 ? last.used / first.used : 1;
		const line = `Memory went from ${mb(first.used)} to ${mb(last.used)} over ${stamp(last.t - first.t)}`;
		facts.push(growth >= 1.5 ? `${line} — a ${growth.toFixed(1)}x rise.` : `${line}.`);
	} else if (last) {
		facts.push(`Memory was ${mb(last.used)} at the last reading.`);
	} else {
		facts.push('No memory readings — this browser does not expose them (Safari and Firefox do not).');
	}
	if (last?.limit && last.used / last.limit >= MEM_PRESSURE) {
		facts.push(`The JavaScript heap was near this browser's own ceiling (${mb(last.used)} of ${mb(last.limit)}).`);
	}

	// ── HOW IT ENDED. `wasDiscarded` is the browser answering; everything else
	// is us observing that it stopped.
	// TWO DIFFERENT STRENGTHS OF EVIDENCE, and they must not share a sentence.
	// `wasDiscarded` is the browser stating it reclaimed the tab. `bfcached` is
	// only "the page went into the back/forward cache and never came back" — and a
	// page leaves that cache for several reasons that are not memory at all (entry
	// limits, timeouts, `no-store`, a held lock). Printing "closed this tab to free
	// memory" for the second one re-committed the exact overclaim this rewrite
	// removed, so the two now say what each actually knows.
	const confirmedDiscard = sameTab && tabDiscarded;
	const evicted = !!rec.bfcached && sameTab && !confirmedDiscard;
	if (confirmedDiscard) facts.push('The browser reports that it reclaimed this tab to free memory (`document.wasDiscarded` was set on the next load).');
	else if (evicted) facts.push('The tab went into the browser\'s page cache when you switched away and was dropped rather than resumed. Browsers do that under memory pressure, but also on cache limits and timeouts — this does not say which.');
	else if (rec.frozen) facts.push('The browser had frozen this tab in the background, and it never resumed.');

	// ── ERRORS. Report them and when; do not rank them. Grouped, and split by
	// whether the browser actually let us SEE the error — six copies of an opaque
	// `Script error.` presented as "6 error(s) recorded" is a wall of noise that
	// reads as six Studio faults, which is what the first real report looked like.
	const groups = Array.isArray(rec.errorGroups) ? rec.errorGroups.filter((g) => g && typeof g.message === 'string' && Number.isFinite(g.n)) : [];
	const opaqueGroups = groups.filter((g) => g.opaque);
	const realGroups = groups.filter((g) => !g.opaque);
	const opaqueCount = opaqueGroups.reduce((n, g) => n + g.n, 0);
	for (const g of realGroups) {
		const at = g.n > 1 ? `${g.n}x, from ${stamp(g.firstT)} to ${stamp(g.lastT)} into the session` : `at ${stamp(g.firstT)} into the session`;
		facts.push(`Error (${at}): ${g.message}${g.file ? ` — ${g.file}${g.line ? `:${g.line}` : ''}` : ''}`);
	}
	if (opaqueCount) {
		// CALIBRATED, not confident. The reasoning is in `isOpaqueError`: this page
		// serves only same-origin scripts, so a same-origin throw would have carried
		// a message and a stack. That makes a browser extension the likeliest source
		// — likeliest, not certain, which is what the wording has to convey.
		facts.push(
			`${opaqueCount} error(s) the browser would not describe — reported only as "Script error." with no file, line or stack. That is what a browser shows for a script it will not let the page read, and the Studio's own scripts are not in that category, so these most likely came from a browser extension or an injected script rather than from the Studio.`,
		);
	}
	if (!groups.length && rec.lastError) {
		// A record written before errors were grouped. Read it the old way rather
		// than showing nothing.
		const gap = Math.max(0, Math.round((endT - rec.lastError.t) / 1000));
		facts.push(`${rec.errorCount} error(s) recorded; the last one ${gap}s before the end: ${rec.lastError.message}`);
	}
	if (Array.isArray(rec.failedLoads) && rec.failedLoads.length) {
		facts.push(`${rec.failedLoads.length} file(s) failed to load — starting with ${rec.failedLoads[0]}. A file the page needs going missing mid-session is usually a deploy landing under an open tab, or a blocked request.`);
	}

	// ── FREEZES. A gap longer than any credible task is a sleeping device, not a
	// blocked thread — saying "the main thread froze for 8 hours" of a closed
	// laptop lid is simply false, and it used to be able to become the verdict.
	if (rec.stallCount) {
		const longest = rec.longestStallMs;
		facts.push(
			longest >= SLEEP_MS
				? `A ${stamp(longest)} gap in recording — almost certainly the device sleeping, not a freeze.`
				: `The page froze for up to ${(longest / 1000).toFixed(1)}s (${rec.stallCount} time(s)).`,
		);
	}

	// ── WHOSE TAB. Stated as what it is: a signal about identity, not a cause.
	facts.push(
		sameTab
			? 'The same tab came back, so it was not closed and reopened by hand.'
			: ownerDead
				? 'This session belonged to this tab, and the Studio asked whether it was still running before saying anything. Nothing answered, so it was not simply left open somewhere else.'
				: 'A different tab or a later visit — this session may also have ended with a force-quit, a shutdown, or a lost device.',
	);

	// ── WHAT TO DO. The first real report was answered with "what am I supposed to
	// do with this?" — a fair question, and a defect in the report rather than in
	// the reader. Facts without a next step are a puzzle handed to someone who did
	// not ask for one. Every line below is tied to something actually observed in
	// THIS record; there is no generic advice, and when the honest answer is "this
	// cannot be narrowed from here", it says that instead of inventing a task.
	const steps: string[] = [];
	if (realGroups.length) {
		steps.push('Report this on GitHub — the error above names the code that failed, which is the part we can act on directly.');
	}
	if (Array.isArray(rec.failedLoads) && rec.failedLoads.length) {
		steps.push('Reload the page once. A file that failed to load is usually a stale tab left behind by a deploy, and a reload fetches the current set.');
	}
	if (!rec.mem.length) {
		// The iOS/Firefox case. Saying "no memory readings" and stopping is what
		// made the report feel inert.
		steps.push(
			'If this keeps happening, open the same deck in Chrome or Edge once and let it run. Those browsers report memory to the page and this one does not, so a repeat there would show whether memory was climbing — which is the single thing this report cannot tell you on this browser.',
		);
	}
	if (opaqueCount && !realGroups.length) {
		steps.push('If you use a content blocker or browser extension here, try once with it off. The errors recorded were ones the browser would not let the page read, which is what an extension\'s own scripts look like from in here.');
	}
	if (rec.stallCount && rec.longestStallMs < SLEEP_MS) {
		steps.push('The freeze above is worth reporting with the deck attached — a reproducible stall is something we can profile.');
	}
	if (!steps.length) {
		steps.push('There is nothing here to act on yet: the session ended without leaving a distinguishing mark. If it happens again, the next report plus this one is a pattern, and two reports are worth filing together.');
	}

	return {
		ending: confirmedDiscard || evicted ? 'reclaimed' : 'stopped',
		// Factual in all three branches. Only the first names a reason, because
		// only the first has the browser's word for it.
		headline: confirmedDiscard
			? 'The browser reclaimed this tab to free memory'
			: evicted
				? 'The browser dropped this tab from its page cache'
				: 'The Studio stopped unexpectedly',
		/** True only where the browser itself stated the reason. Drives the caveat. */
		confirmed: confirmedDiscard,
		facts,
		steps,
	};
}

/** The headline for a toast or a list row — already factual, computed by `describeSession`. */
export function crashReportTitle(report: CrashReport): string {
	return report.headline;
}

const stamp = (ms: number): string => {
	const s = Math.max(0, Math.round(ms / 1000));
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

/**
 * How far into the session a breadcrumb sits. Sub-minute keeps tenths (the scale
 * a stall is read at); past that it becomes an elapsed clock, because a long
 * session's trail rendered as `+3140.0s` is a number nobody converts in their
 * head — and long sessions are exactly the ones that end in an out-of-memory
 * report. Shared by the panel and the markdown so the two never disagree.
 */
export function elapsedLabel(ms: number): string {
	const total = Math.max(0, Math.round(ms / 1000));
	if (total < 60) return `+${(Math.max(0, ms) / 1000).toFixed(1)}s`;
	const s = total % 60;
	const m = Math.floor(total / 60) % 60;
	const h = Math.floor(total / 3600);
	const pad = (n: number) => String(n).padStart(2, '0');
	return h ? `+${h}:${pad(m)}:${pad(s)}` : `+${m}:${pad(s)}`;
}

/**
 * The whole report as markdown — one artifact for the clipboard AND for the
 * GitHub issue body, so what the user reads is byte-identical to what they post.
 */
export function formatCrashReport(report: CrashReport): string {
	const r = report.record;
	const lines: string[] = [];
	lines.push(`### Studio session ended unexpectedly — ${crashReportTitle(report)}`);
	lines.push('');
	lines.push(`- **Ended as:** ${report.ending === 'reclaimed' ? 'the browser reclaimed the tab' : 'stopped without closing cleanly'}`);
	lines.push(`- **Started:** ${new Date(report.startedAt).toISOString()}`);
	lines.push(`- **Last heartbeat:** ${new Date(report.endedAt).toISOString()} (ran ${stamp(report.durationMs)})`);
	lines.push(`- **Page:** ${r.page || '(unknown)'}`);
	if (r.nav) lines.push(`- **Entered by:** ${r.nav}`);
	lines.push(`- **Browser:** ${r.ua || '(unknown)'}`);
	for (const [k, v] of Object.entries(r.context)) if (v) lines.push(`- **${k}:** ${v}`);
	lines.push('');
	lines.push('**What was measured**');
	lines.push('');
	for (const f of report.facts) lines.push(`- ${f}`);
	if (report.steps.length) {
		lines.push('');
		lines.push('**What the reporter was told to try**');
		lines.push('');
		for (const s of report.steps) lines.push(`- ${s}`);
	}
	if (Array.isArray(r.failedLoads) && r.failedLoads.length) {
		lines.push('');
		lines.push('**Files that failed to load**');
		lines.push('');
		lines.push('```');
		for (const u of r.failedLoads) lines.push(u);
		lines.push('```');
	}
	if (r.mem.length) {
		lines.push('');
		lines.push(`**Heap trajectory** (limit ${mb(r.memLimit ?? r.mem[r.mem.length - 1].limit)}, peak ${mb(r.peakUsed ?? 0)})`);
		lines.push('');
		lines.push('```');
		for (const m of r.mem) lines.push(`${elapsedLabel(m.t).padStart(9)}  ${mb(m.used).padStart(7)}  ${Math.round((m.used / (m.limit || 1)) * 100)}%`);
		lines.push('```');
	}
	if (r.lastError) {
		lines.push('');
		lines.push(`**Last error** (at ${elapsedLabel(r.lastError.t)}${r.lastError.source ? `, ${r.lastError.source}` : ''})`);
		lines.push('');
		lines.push('```');
		lines.push(r.lastError.message);
		if (r.lastError.stack) lines.push(r.lastError.stack);
		lines.push('```');
	}
	lines.push('');
	lines.push('**Trail** (most recent last)');
	lines.push('');
	lines.push('```');
	if (r.crumbs.length) for (const c of r.crumbs) lines.push(`${elapsedLabel(c.t).padStart(9)}  ${c.k.padEnd(9)} ${c.m}`);
	else lines.push('(no breadcrumbs recorded)');
	lines.push('```');
	return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage — every access defended. A storage-blocked browser (private mode, a
// disabled-cookies profile) must degrade to "no recording", never to a throw on
// the Studio's boot path.
// ─────────────────────────────────────────────────────────────────────────────

function safeGet(store: Storage | undefined, key: string): string | null {
	try {
		return store?.getItem(key) ?? null;
	} catch {
		return null;
	}
}

function safeSet(store: Storage | undefined, key: string, value: string): boolean {
	try {
		store?.setItem(key, value);
		return true;
	} catch {
		return false;
	}
}

function safeRemove(store: Storage | undefined, key: string): void {
	try {
		store?.removeItem(key);
	} catch {
		/* storage unavailable */
	}
}

const ls = (): Storage | undefined => {
	try {
		return globalThis.localStorage;
	} catch {
		return undefined;
	}
};
const ss = (): Storage | undefined => {
	try {
		return globalThis.sessionStorage;
	} catch {
		return undefined;
	}
};

/** Every session key currently in `localStorage`, oldest-started first. */
function sessionKeys(): string[] {
	const store = ls();
	if (!store) return [];
	const keys: string[] = [];
	try {
		for (let i = 0; i < store.length; i++) {
			const k = store.key(i);
			if (k?.startsWith(SESSION_PREFIX)) keys.push(k);
		}
	} catch {
		return [];
	}
	return keys;
}

function readRecord(key: string): SessionRecord | null {
	const raw = safeGet(ls(), key);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		return isSessionRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

/**
 * Drop expired and surplus records. Called on every boot so the recorder can
 * never become an unbounded writer — the failure mode of every "just log it
 * locally" diagnostic.
 */
export function pruneSessions(now: number, keepId?: string): void {
	const records: SessionRecord[] = [];
	for (const k of sessionKeys()) {
		const rec = readRecord(k);
		if (!rec) {
			safeRemove(ls(), k); // unparseable — it can only take up room
			continue;
		}
		if (rec.id === keepId) continue;
		if (now - rec.startedAt > MAX_AGE_MS) {
			safeRemove(ls(), SESSION_PREFIX + rec.id);
			continue;
		}
		records.push(rec);
	}
	// KEEP THE EVIDENCE, NOT MERELY THE NEWEST. Sorting by recency alone deleted
	// crash records preferentially in a crash loop — every reload mints a fresh
	// (clean) record, so the one that mattered fell past the cap within five
	// loads. Worse since STALE_MS became 10 minutes: a non-same-tab crash is not
	// even ELIGIBLE to be reported for ten minutes, and six ordinary boots inside
	// that window used to erase it before the user could ever see it. Rank by
	// worth first — un-announced unclean records outlive announced ones, which
	// outlive clean ones — and only then by recency.
	const worth = (r: SessionRecord) => (r.closed && !r.bfcached ? 0 : r.reported ? 1 : 2);
	records.sort((a, b) => worth(b) - worth(a) || b.startedAt - a.startedAt);
	for (const rec of records.slice(KEEP_RECORDS)) safeRemove(ls(), SESSION_PREFIX + rec.id);
}

// Captured at start(), BEFORE the tab mirror is overwritten — this is the only
// moment the previous tab session id is still readable.
let priorTabSessionId: string | null = null;
let liveId: string | null = null;
/**
 * `document.wasDiscarded` as read at start-up — the browser's own verdict that
 * this tab was discarded and is now being restored. Latched here because the flag
 * describes the LOAD, and everything downstream runs later.
 */
let priorTabDiscarded = false;
/**
 * How THIS document was entered, latched at start-up. Load-bearing for tab
 * continuity — see `isSameTab`.
 */
let bootNavType = '';

/**
 * Did the SAME tab come back, or is this a COPY of another tab's session?
 *
 * The mirror alone is not proof, and the original code said it was: per spec, a
 * browsing context created BY another one inherits a COPY of its session
 * storage. Verified in this repo's own Chromium — `window.open` (and Chrome's
 * "Duplicate tab") carries the mirror across, while an independently-opened tab
 * does not. So duplicating a Studio tab produced a confident crash report about
 * a session still running in the window next door, and offered a Discard button
 * that deleted the LIVE tab's record.
 *
 * The navigation type separates them. A tab that died and came back — the case
 * this signal exists to catch — is entered by `reload`; Chromium reloads the
 * page after a renderer kill, and a user recovering a dead tab reloads it too. A
 * duplicate or a `window.open` is entered by `navigate`, and inherits the mirror
 * without ever having owned the session.
 *
 * Residual, stated rather than hidden: a browser "restore previous session" can
 * replay both the mirror and a reload-shaped navigation, so a force-quit
 * followed by session restore can still read as same-tab. That is why the
 * same-tab copy no longer claims a crash outright — it reports that the tab came
 * back, and leaves the cause to the trail.
 */
function isSameTab(rec: SessionRecord): boolean {
	if (!priorTabSessionId || rec.id !== priorTabSessionId) return false;
	return bootNavType === 'reload';
}

/**
 * Sessions this boot PROVED abandoned, mapped to the `lastBeat` they carried at
 * the moment of proof.
 *
 * A bare `Set` was wrong: proof of death is a statement about a MOMENT, and a
 * set makes it permanent. If the owner turns out to be alive after all — it
 * answers late, or its throttled heartbeat finally lands — every later
 * `collectCrashReports` in this page kept returning the live session as a
 * corpse, because nothing ever re-checked. Keyed by the beat we saw, the entry
 * simply stops matching the moment the owner writes again, so the record
 * re-validates itself on every read instead of trusting a one-time verdict.
 */
const provenDeadOwners = new Map<string, number>();

/** Has this session been proven dead, AND has nothing written to it since? */
function ownerProvenDead(rec: SessionRecord): boolean {
	const at = provenDeadOwners.get(rec.id);
	return at !== undefined && rec.lastBeat === at;
}

/**
 * How long to wait for a live owner to answer the liveness ping.
 *
 * This is an EVENT round-trip, not a heartbeat interval — see
 * `watchLateCrashReports` for why that distinction is the whole design. A
 * `storage` event is dispatched to other documents as an ordinary task; two
 * seconds is enormous for that even on a loaded phone.
 */
export const OWNER_PROBE_MS = 2_000;

/**
 * Cross-tab liveness challenge, and the answer to it. Written-then-removed like
 * `WIPE_SIGNAL_KEY`, and deliberately NOT under `SESSION_PREFIX` — `sessionKeys()`
 * scans by that prefix and would read a signal back as a malformed record.
 */
export const PING_KEY = 'lattice-studio-ping';
export const PONG_KEY = 'lattice-studio-pong';

/**
 * Report the crash the automatic post-crash reload could not.
 *
 * THE BUG THIS FIXES, from the first real report off a phone: the user's tab
 * died and the browser reloaded it by itself, and the Studio said nothing. They
 * only saw the report after pressing reload BY HAND. The cause is that immediate
 * reporting requires `isSameTab`, which requires the Navigation Timing type to be
 * `reload` — and on that browser the browser's OWN recovery load was not typed
 * `reload`. Everything else fell through to the 10-minute staleness wait, so the
 * one boot where the user was actually looking showed nothing.
 *
 * Rather than special-case a browser I cannot test (HARD RULE #23 — real iOS is
 * out of reach from here), this stops depending on the navigation type at all
 * for that decision. The tab mirror already proves the record belongs to THIS
 * tab's lineage; the only competing explanation is a DUPLICATED tab, whose
 * original is still running — and a running session writes a heartbeat. So:
 * watch the record. If nothing writes to it for `OWNER_PROBE_MS`, nobody owns it
 * and it ended. If it advances, the owner is alive and we stay quiet, exactly as
 * before.
 *
 * The cost is a delay of ~21s instead of ~10 minutes on the path that matters,
 * and the evidence is observed rather than assumed.
 *
 * @returns an unsubscribe function; safe to call before `start`.
 */
export function watchLateCrashReports(onLate: (reports: CrashReport[]) => void, probeMs = OWNER_PROBE_MS): () => void {
	if (!priorTabSessionId || bootNavType === 'reload') return () => {};
	const id = priorTabSessionId;
	let before: SessionRecord | null = null;
	try {
		before = readRecord(SESSION_PREFIX + id);
	} catch {
		return () => {};
	}
	// Already closed cleanly, already gone, or already reportable by the ordinary
	// rules — nothing for the watch to add.
	if (!before || before.id === liveId || (before.closed && !before.bfcached)) return () => {};
	// A FROZEN tab is alive but forbidden to run: the Page Lifecycle spec suspends
	// its tasks, so it cannot answer, and silence from it proves nothing at all.
	// Leave it to the staleness wait rather than convicting on an alibi it was not
	// permitted to give.
	if (before.frozen) return () => {};

	const beatBefore = before.lastBeat;
	let answered = false;
	const onPong = (ev: StorageEvent) => {
		if (ev.key !== PONG_KEY || !ev.newValue) return;
		// Only an answer to THIS challenge counts. A pong naming another session is
		// some other tab's conversation.
		try {
			if ((JSON.parse(ev.newValue) as { id?: string }).id === id) answered = true;
		} catch {
			/* a malformed pong is not an answer */
		}
	};
	addEventListener('storage', onPong);
	// The challenge. Written-then-removed so it cannot accumulate; the write is
	// what raises the event in every other document on this origin.
	try {
		const store = ls();
		store?.setItem(PING_KEY, JSON.stringify({ id, at: Date.now() }));
		safeRemove(store, PING_KEY);
	} catch {
		/* storage blocked — the timeout below still runs and falls back to the beat check */
	}

	const timer = setTimeout(() => {
		removeEventListener('storage', onPong);
		// SOMEONE ANSWERED. The owning tab is alive and this document merely
		// inherited its session mirror by being duplicated from it.
		if (answered) return;
		try {
			const after = readRecord(SESSION_PREFIX + id);
			// Gone (pruned or wiped) — nothing to report.
			if (!after) return;
			// Belt to the ping's braces: a heartbeat landing during the window is
			// also proof of life, and costs nothing to check.
			if (after.lastBeat !== beatBefore || after.frozen || (after.closed && !after.bfcached)) return;
			provenDeadOwners.set(id, after.lastBeat);
			const late = unreportedCrashReports(Date.now()).filter((r) => r.id === id);
			if (late.length) onLate(late);
		} catch {
			// A record that turned unreadable mid-watch is handled by the per-record
			// guard in `collectCrashReports`; there is nothing to salvage here.
		}
	}, probeMs);
	return () => {
		removeEventListener('storage', onPong);
		clearTimeout(timer);
	};
}

/**
 * Every past session that ended without a clean unload, newest first. The live
 * session is excluded by id; a still-running SECOND TAB is excluded by the
 * staleness rule in `isUncleanEnd`.
 */
export function collectCrashReports(now: number): CrashReport[] {
	const out: CrashReport[] = [];
	// PER-RECORD try/catch, plus the guard in `isSessionRecord`. Belt and braces
	// on purpose: this runs inside StudioShell's mount effect, so ANY throw here
	// unmounts the whole island into the boundary's error card — measured, on the
	// real Studio, from a single malformed record. A crash reporter that can take
	// down the app it reports on is worse than no crash reporter, so one
	// unreadable record must cost exactly that record, never the Studio.
	for (const k of sessionKeys()) {
		try {
			const rec = readRecord(k);
			if (!rec || rec.id === liveId) continue;
			const sameTab = isSameTab(rec);
			const ownerDead = ownerProvenDead(rec);
			if (!isUncleanEnd(rec, now, sameTab, ownerDead)) continue;
			const { ending, headline, confirmed, facts, steps } = describeSession(rec, { sameTab, tabDiscarded: priorTabDiscarded, ownerDead });
			out.push({
				id: rec.id,
				record: rec,
				ending,
				headline,
				confirmed,
				facts,
				steps,
				sameTab,
				startedAt: rec.startedAt,
				endedAt: rec.lastBeat,
				durationMs: Math.max(0, rec.lastBeat - rec.startedAt),
			});
		} catch {
			// Unreadable in a way the guard did not anticipate — drop the record so
			// it cannot poison every future boot too.
			safeRemove(ls(), k);
		}
	}
	return out.sort((a, b) => b.endedAt - a.endedAt);
}

/**
 * Remember that the user has been TOLD about this one. The toast fires on a
 * boot-time collect, so without a marker a report the user simply ignored came
 * back on every subsequent load until they explicitly discarded it — an alarm
 * that repeats until acknowledged is an alarm people learn to ignore, taking the
 * one real report with it. The record stays (Workspace still lists it); only the
 * interruption is spent.
 */
export function markReported(id: string): void {
	const rec = readRecord(SESSION_PREFIX + id);
	if (!rec) return;
	rec.reported = true;
	if (safeSet(ls(), SESSION_PREFIX + id, JSON.stringify(rec))) return;
	// A full store used to swallow this, so the toast fired again on every boot —
	// the exact alarm fatigue the marker exists to prevent. Shed the trail (the
	// part that grows) and retry, mirroring `persist`.
	rec.crumbs = rec.crumbs.slice(-12);
	rec.mem = rec.mem.slice(-6);
	safeSet(ls(), SESSION_PREFIX + id, JSON.stringify(rec));
}

/** Reports the user has not been interrupted about yet. */
export function unreportedCrashReports(now: number): CrashReport[] {
	return collectCrashReports(now).filter((r) => !r.record.reported);
}

/** Forget one report (the user read it, or filed it). */
export function dismissCrashReport(id: string): void {
	safeRemove(ls(), SESSION_PREFIX + id);
}

/** Forget every stored session but the live one — the Workspace → Crash reports action. */
export function clearCrashReports(): void {
	for (const k of sessionKeys()) {
		if (liveId && k === SESSION_PREFIX + liveId) continue;
		safeRemove(ls(), k);
	}
}

/**
 * Forget EVERY session record, the live one included — for Privacy & Data's
 * "Delete Everything", which promises to leave nothing behind.
 *
 * Distinct from `clearCrashReports` on purpose: that one spares the live record
 * because clearing your history should not blind the recorder mid-session. This
 * one does not, because a privacy sweep that skips the record currently holding
 * your deck's title would make the promise false. The recorder keeps running and
 * simply re-creates its record on the next beat, with a fresh trail.
 */
export function clearAllSessions(): void {
	// SEAL FIRST, delete second. Scrubbing the live record is not enough on its
	// own, and this was measured on the real Studio rather than reasoned about:
	// "Delete Everything" reloads the page ~1.1s later, and in that window the
	// shell's own React effects legitimately re-populate the record (the deck
	// state changes, so the `setCrashContext` effect re-runs) and `pagehide`
	// then persists it on the way out — putting a fully-populated record back
	// under a key that had just been deleted. Racing those effects is
	// unwinnable; refusing to write is not. Every write path is a no-op from
	// here until the next page load calls `startCrashSentinel`.
	sealed = true;
	for (const k of sessionKeys()) safeRemove(ls(), k);
	safeRemove(ss(), TAB_SESSION_KEY);
	// Tell every other Studio tab to seal itself and drop its live record. Written
	// then removed so a later wipe fires a fresh event (a `storage` event only
	// fires when the value CHANGES).
	safeSet(ls(), WIPE_SIGNAL_KEY, String(Date.now()));
	safeRemove(ls(), WIPE_SIGNAL_KEY);
	if (live) {
		live.crumbs.length = 0;
		live.mem.length = 0;
		live.context = {};
		live.lastError = undefined;
		live.errorCount = 0;
	}
}

/**
 * Bytes these records occupy right now — so the storage accounting that exists to
 * make accumulation VISIBLE can actually see them. A diagnostic that is invisible
 * to the storage diagnostic is how the next accumulation bug hides.
 */
export function crashReportStats(): { count: number; bytes: number } {
	let count = 0;
	let bytes = 0;
	for (const k of sessionKeys()) {
		const raw = safeGet(ls(), k);
		if (raw === null) continue;
		count++;
		bytes += k.length + raw.length;
	}
	return { count, bytes };
}

// ─────────────────────────────────────────────────────────────────────────────
// The recorder
// ─────────────────────────────────────────────────────────────────────────────

let live: SessionRecord | null = null;
let stop: (() => void) | null = null;
/**
 * Set by `clearAllSessions` — the user asked to be forgotten, so nothing more is
 * written for the rest of this page's life. Cleared only by a fresh
 * `startCrashSentinel`, i.e. the next load. See that function for why a scrub
 * alone was measurably not enough.
 */
let sealed = false;
/** Breadcrumbs dropped before `start()` ran (an early import racing the island). */
const preStart: Breadcrumb[] = [];

function newId(now: number): string {
	try {
		const uuid = globalThis.crypto?.randomUUID?.();
		if (uuid) return uuid.slice(0, 8) + now.toString(36);
	} catch {
		/* no crypto (very old browser / insecure context) */
	}
	return `${now.toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

type Mem = { usedJSHeapSize: number; jsHeapSizeLimit: number };
function readMemory(): Mem | null {
	try {
		const m = (globalThis.performance as unknown as { memory?: Mem })?.memory;
		if (!m || typeof m.usedJSHeapSize !== 'number' || !m.jsHeapSizeLimit) return null;
		return m;
	} catch {
		return null;
	}
}

function navigationType(): string {
	try {
		const e = performance.getEntriesByType?.('navigation')?.[0] as { type?: string } | undefined;
		return e?.type ?? '';
	} catch {
		return '';
	}
}

/**
 * Write the live record. On a quota failure, shed the trail (the part that grows)
 * and retry once — a recorder that dies of its own weight reports nothing at all.
 */
function persist(): void {
	if (!live || sealed) return;
	const key = SESSION_PREFIX + live.id;
	if (safeSet(ls(), key, JSON.stringify(live))) return;
	live.crumbs = live.crumbs.slice(-12);
	live.mem = live.mem.slice(-6);
	safeSet(ls(), key, JSON.stringify(live));
}

/** Record one labeled step. Callers pass LABELS — never deck text, never user prose. */
export function breadcrumb(kind: BreadcrumbKind, message: string): void {
	if (sealed) return;
	const m = clip(message);
	if (!m) return;
	if (!live) {
		preStart.push({ t: 0, k: kind, m });
		if (preStart.length > MAX_CRUMBS) preStart.shift();
		return;
	}
	live.crumbs.push({ t: Date.now() - live.startedAt, k: kind, m });
	if (live.crumbs.length > MAX_CRUMBS) live.crumbs.shift();
}

/**
 * Attach or update the labels shown at the top of a report (deck title, posture,
 * slide count).
 *
 * The KEY COUNT is capped, not just the value length. Values were clipped from
 * the start, but nothing stopped a caller from writing an unbounded set of
 * distinct keys (`slide-1`, `slide-2`, …) — the one path in this module that
 * could have grown without limit, which is exactly the failure this recorder
 * must not have. Once full, existing keys still update; new ones are dropped.
 */
export function setCrashContext(patch: Record<string, string | number | undefined>): void {
	if (!live || sealed) return;
	for (const [k, v] of Object.entries(patch)) {
		if (v === undefined || v === null || v === '') delete live.context[k];
		else if (k in live.context || Object.keys(live.context).length < MAX_CONTEXT_KEYS) live.context[clip(k, 40)] = clip(String(v), 80);
	}
}

/**
 * Record an error the page DID survive. Non-fatal today, but it is the trail that
 * makes the next report legible — and the ErrorBoundary feeds this too, so a
 * caught React fault is in the record even though it never reached `window`.
 */
export function noteError(err: unknown, source?: string, where?: { file?: string; line?: number }): void {
	if (!live || sealed) return;
	const e = err as { message?: string; stack?: string } | undefined;
	const message = clip(e?.message || String(err ?? 'unknown error'), 300);
	const stack = e?.stack ? clip(e.stack, 1200) : undefined;
	const file = where?.file ? clip(where.file, 200) : undefined;
	const line = Number.isFinite(where?.line) ? where?.line : undefined;
	const opaque = isOpaqueError(message, file, stack);
	const t = Date.now() - live.startedAt;
	live.errorCount++;
	live.lastError = { message, stack, source, t, file, line, opaque: opaque || undefined };

	// FOLD BY MESSAGE. A stuck error fires on a timer and would otherwise fill the
	// 60-crumb ring with copies of itself, evicting the boot and nav crumbs that
	// give the trail its context — which is exactly what happened in the first
	// real report from a phone.
	const groups = (live.errorGroups ??= []);
	const hit = groups.find((g) => g.message === message);
	if (hit) {
		hit.n++;
		hit.lastT = t;
	} else if (groups.length < MAX_ERROR_GROUPS) {
		groups.push({ message, n: 1, firstT: t, lastT: t, file, line, opaque: opaque || undefined });
	}
	// Only the FIRST of a repeating message gets a breadcrumb. The group carries
	// the repeat count, so the trail keeps its narrative instead of becoming a log.
	if (!hit) breadcrumb('error', source ? `${source}: ${message}` : message);
}

/**
 * A resource failed to LOAD — a script, stylesheet, image or font 404'd, was
 * blocked, or died mid-flight.
 *
 * These never reached the recorder before, because a failed load fires an event
 * that does not bubble and carries no message: `window.onerror` never sees it,
 * so the single most diagnosable Studio failure — a code-split chunk that
 * vanished when the site redeployed under an open tab — recorded nothing at all
 * while the page fell apart. The capture-phase listener that feeds this is the
 * only way to observe it, and unlike a sanitized `Script error.` it names the
 * exact URL.
 */
export function noteFailedLoad(url: string): void {
	if (!live || sealed) return;
	// STRIP THE QUERY, like `page` does. This string goes into a PUBLIC GitHub
	// issue body, and a resource URL is exactly the kind that carries a signed
	// token or a one-time key in its query. The module already refuses to record
	// `location.search` for this reason (see `startCrashSentinel`); a second field
	// that posts raw URLs would have quietly reopened the same hole. The path is
	// what identifies the file; the query never adds anything worth the risk.
	const u = clip(url.split(/[?#]/)[0] || url, 200);
	const list = (live.failedLoads ??= []);
	if (list.includes(u)) return;
	if (list.length >= 8) list.shift();
	list.push(u);
	breadcrumb('error', `failed to load ${u}`);
}

/** Is the recorder running? (The Astro entry starts it; a second call is a no-op.) */
export function sentinelRunning(): boolean {
	return !!live;
}

/** The live record, for tests and the diagnostics readout. Never mutate it. */
export function liveSession(): Readonly<SessionRecord> | null {
	return live;
}

/**
 * Open a session and start recording. Idempotent — returns the existing stopper
 * if already running, so a double include (page script + island) is harmless.
 *
 * Call this as EARLY as possible: the interesting crashes happen deep in a long
 * session, but a boot-time one is only visible if the recorder was already up.
 */
export function startCrashSentinel(): () => void {
	if (stop) return stop;
	if (typeof document === 'undefined') return () => {};

	sealed = false; // a new page load is a new session; the seal was for the old one
	const now = Date.now();
	// Read the tab mirror BEFORE overwriting it — this is the tab-continuity
	// signal, and there is exactly one moment it is readable.
	priorTabSessionId = safeGet(ss(), TAB_SESSION_KEY);
	// The browser's OWN answer to "was this tab discarded?", available only on the
	// load that follows the discard (Chromium; absent elsewhere, which reads as
	// false and falls back to the `frozen` inference).
	priorTabDiscarded = document.wasDiscarded === true;
	bootNavType = navigationType();

	const id = newId(now);
	liveId = id;
	live = newRecord(id, now, {
		// PATHNAME ONLY — never `location.search`. The report is built to be pasted
		// into a PUBLIC GitHub issue, and this module runs from a HOISTED page
		// script: it captures and persists before the island hydrates, which is
		// before `resumePendingAuth` scrubs the OpenRouter OAuth callback's
		// `?code=` off the URL. Verified end to end on the real Studio — the
		// authorization code reached the "Report on GitHub" href, and sat in
		// localStorage for up to seven days readable by any same-origin script.
		// docs/public/sw.js refuses to cache query-stringed navigations for exactly
		// this reason; this is the equivalent guard. A query string is recorded as
		// a bare PRESENCE flag, which keeps the one diagnostic bit ("this load had
		// params") without carrying a single one of their values.
		page: `${location.pathname}${location.search ? ' (with query params)' : ''}`,
		ua: navigator.userAgent,
		nav: bootNavType,
	});
	for (const c of preStart) live.crumbs.push(c);
	preStart.length = 0;
	safeSet(ss(), TAB_SESSION_KEY, id);

	const mem0 = readMemory();
	if (mem0) {
		live.mem.push({ t: 0, used: mem0.usedJSHeapSize, limit: mem0.jsHeapSizeLimit });
		live.memLimit = mem0.jsHeapSizeLimit;
		live.peakUsed = mem0.usedJSHeapSize;
	}
	breadcrumb('boot', `studio boot (${live.nav || 'navigate'})${priorTabDiscarded ? ', tab restored after a browser discard' : ''}`);
	// Prune BEFORE the first persist so a full store has room for the new record.
	pruneSessions(now, id);
	persist();

	let ticks = 0;
	let beats = 0;
	let lastTick = now;
	let lastVisible = document.visibilityState === 'visible';

	const tick = () => {
		if (!live) return;
		const t = Date.now();
		const gap = t - lastTick;
		const visible = document.visibilityState === 'visible';
		// A late tick only means a STALL if the tab was visible across the whole
		// gap — a hidden tab is throttled by the browser on purpose, and calling
		// that a freeze would fill every report with noise.
		if (gap > STALL_MS && visible && lastVisible) {
			live.stallCount++;
			live.longestStallMs = Math.max(live.longestStallMs, gap);
			breadcrumb('stall', `main thread blocked ${(gap / 1000).toFixed(1)}s`);
		}
		lastTick = t;
		lastVisible = visible;
		ticks++;
		if (ticks % (BEAT_MS / TICK_MS) !== 0) return;

		beats++;
		live.lastBeat = t;
		const m = readMemory();
		if (m) {
			live.memLimit = m.jsHeapSizeLimit;
			live.peakUsed = Math.max(live.peakUsed ?? 0, m.usedJSHeapSize);
			const frac = m.usedJSHeapSize / m.jsHeapSizeLimit;
			const due = beats % MEM_EVERY_BEATS === 0;
			// Always keep the newest sample when pressure is high: the LAST reading
			// before the end is what the verdict turns on, and a 30s sampling gap
			// could leave the report showing a comfortable heap for a tab that died
			// of memory ten seconds later.
			if (due || frac >= MEM_PRESSURE) {
				live.mem.push({ t: t - live.startedAt, used: m.usedJSHeapSize, limit: m.jsHeapSizeLimit });
				if (live.mem.length > MAX_MEM_SAMPLES) {
					// Drop the SECOND sample, never the first: the opening reading is the
					// baseline the growth comparison needs.
					live.mem.splice(1, 1);
				}
			}
		}
		persist();
	};

	const timer = setInterval(tick, TICK_MS);

	const onError = (ev: ErrorEvent) => {
		noteError(ev.error ?? { message: ev.message }, ev.filename ? `${ev.filename}:${ev.lineno}` : 'window.onerror', {
			file: ev.filename || undefined,
			line: ev.lineno || undefined,
		});
		persist();
	};
	/**
	 * CAPTURE PHASE, and only for element targets.
	 *
	 * A resource that fails to load fires `error` AT THE ELEMENT and does not
	 * bubble, so the bubble-phase `onError` above never runs for it. Listening in
	 * the capture phase on `window` is the documented way to see them. Script
	 * exceptions also pass through here, but their `target` is `window` rather
	 * than an element — that test is what keeps the two paths from double-counting
	 * the same fault.
	 */
	const onCapturedError = (ev: Event) => {
		const el = ev.target as Element | null;
		if (!el || typeof (el as { tagName?: unknown }).tagName !== 'string') return;
		const url = el.getAttribute?.('src') || el.getAttribute?.('href');
		if (url) noteFailedLoad(url);
		persist();
	};
	const onRejection = (ev: PromiseRejectionEvent) => {
		noteError(ev.reason, 'unhandledrejection');
		persist();
	};
	const onCsp = (ev: SecurityPolicyViolationEvent) => {
		breadcrumb('error', `CSP blocked ${ev.violatedDirective}: ${ev.blockedURI}`);
		persist();
	};
	const onVisibility = () => {
		if (!live) return;
		breadcrumb('lifecycle', document.visibilityState);
		live.lastBeat = Date.now();
		persist();
	};
	// pagehide is the ONE reliable end-of-life event (beforeunload/unload do not
	// fire on mobile Safari). `persisted` means the page went into the bfcache and
	// may come back — close it anyway; `pageshow` reopens it if it does.
	const onPageHide = (ev: PageTransitionEvent) => {
		if (!live) return;
		live.lastBeat = Date.now();
		live.closed = true;
		// `persisted` means the page went into the back/forward cache and MAY come
		// back — so it is closed, but not necessarily finished. Recording which kind
		// of ending it was is what closes the iOS blind spot: Safari fires pagehide
		// when the app is backgrounded, so a tab the OS later evicts leaves a record
		// that is `closed` AND `bfcached`, with no `pageshow` to clear it. Without
		// this flag that eviction is indistinguishable from a clean exit, and the
		// commonest "it reloaded itself" on an iPhone reported nothing at all.
		live.bfcached = !!ev?.persisted;
		breadcrumb('lifecycle', ev?.persisted ? 'pagehide (into the page cache)' : 'pagehide');
		persist();
	};
	// `pageshow` fires on EVERY load, not only a bfcache restore — measured on the
	// real Studio, where a plain first load logged "pageshow (restored)" as its
	// second breadcrumb. Only `persisted` means the page came back from the
	// bfcache; anything else is the ordinary load that already opened this record,
	// and re-stamping it would put a lie in every trail.
	const onPageShow = (ev: PageTransitionEvent) => {
		if (!live || !ev.persisted) return;
		live.closed = false;
		live.frozen = false;
		live.bfcached = false; // it DID come back — not an eviction after all
		breadcrumb('lifecycle', 'pageshow (bfcache restore)');
		live.lastBeat = Date.now();
		persist();
	};
	// The Page Lifecycle API. `freeze` is the browser announcing this tab is now
	// discard-eligible — the record is left OPEN on purpose so that a tab which is
	// then discarded reports as a discard rather than vanishing silently.
	const onFreeze = () => {
		if (!live) return;
		live.frozen = true;
		live.lastBeat = Date.now();
		breadcrumb('lifecycle', 'freeze (tab discard-eligible)');
		persist();
	};
	const onResume = () => {
		if (!live) return;
		live.frozen = false;
		breadcrumb('lifecycle', 'resume');
		persist();
	};

	// A privacy wipe in ANOTHER tab has to reach this one. `sealed` is module
	// state, so tab A sealing itself did nothing for tab B — whose next beat
	// rewrote the record tab A had just erased, deck title and all, making
	// "Delete Everything" false whenever a second Studio tab was open. The
	// `storage` event fires in every OTHER document on the origin, which is
	// exactly the reach that was missing.
	const onStorage = (ev: StorageEvent) => {
		// ANSWER A LIVENESS CHALLENGE. This is the half of `watchLateCrashReports`
		// that runs in the tab being asked about, and the reason the whole design
		// works where a timer could not: a `storage` event is delivered as an
		// ordinary task, NOT a timer callback, so a hidden tab under Chrome's
		// intensive throttling — which cuts its heartbeat to roughly one write
		// every five minutes — still answers in milliseconds. Proof of life
		// therefore stops depending on when the owner happens to tick.
		if (ev.key === PING_KEY && ev.newValue) {
			if (sealed || !live) return;
			try {
				if ((JSON.parse(ev.newValue) as { id?: string }).id !== live.id) return;
			} catch {
				return; // a malformed challenge is not addressed to anyone
			}
			try {
				const store = ls();
				store?.setItem(PONG_KEY, JSON.stringify({ id: live.id, at: Date.now() }));
				safeRemove(store, PONG_KEY);
			} catch {
				/* storage blocked; the asker falls back to the heartbeat check */
			}
			return;
		}
		if (ev.key !== WIPE_SIGNAL_KEY || !ev.newValue) return;
		sealed = true;
		if (live) {
			live.crumbs.length = 0;
			live.mem.length = 0;
			live.context = {};
			live.lastError = undefined;
			live.errorCount = 0;
		}
		safeRemove(ls(), SESSION_PREFIX + (liveId ?? ''));
	};
	addEventListener('storage', onStorage);

	addEventListener('error', onError);
	addEventListener('error', onCapturedError, true);
	addEventListener('unhandledrejection', onRejection);
	document.addEventListener('securitypolicyviolation', onCsp);
	document.addEventListener('visibilitychange', onVisibility);
	addEventListener('pagehide', onPageHide as EventListener);
	addEventListener('pageshow', onPageShow as EventListener);
	document.addEventListener('freeze', onFreeze);
	document.addEventListener('resume', onResume);

	stop = () => {
		clearInterval(timer);
		removeEventListener('storage', onStorage);
		removeEventListener('error', onError);
		removeEventListener('error', onCapturedError, true);
		removeEventListener('unhandledrejection', onRejection);
		document.removeEventListener('securitypolicyviolation', onCsp);
		document.removeEventListener('visibilitychange', onVisibility);
		removeEventListener('pagehide', onPageHide as EventListener);
		removeEventListener('pageshow', onPageShow as EventListener);
		document.removeEventListener('freeze', onFreeze);
		document.removeEventListener('resume', onResume);
		if (live) {
			live.closed = true;
			live.lastBeat = Date.now();
			persist();
		}
		live = null;
		liveId = null;
		stop = null;
	};
	return stop;
}

/** Test-only reset — drops module state without touching storage. */
export function __resetSentinelForTest(): void {
	if (stop) stop();
	live = null;
	liveId = null;
	stop = null;
	priorTabSessionId = null;
	priorTabDiscarded = false;
	sealed = false;
	preStart.length = 0;
	// Module-level and therefore NOT reset by clearing storage: a session proven
	// dead in one test stayed proven in the next, so a later test could pass or
	// fail for reasons that had nothing to do with the code under test.
	provenDeadOwners.clear();
	bootNavType = '';
}
