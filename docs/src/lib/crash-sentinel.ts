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

export const RECORD_VERSION = 1;

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

/** Heartbeat period: how stale `lastBeat` can be on a healthy session. */
export const BEAT_MS = 5_000;
/** Watchdog tick — also the stall probe. */
const TICK_MS = 1_000;
/** A tick this late means the main thread was blocked for at least this long. */
const STALL_MS = 2_500;
/**
 * How stale another tab's record must be before this boot may call it ended.
 * Background tabs are timer-throttled to roughly one callback a minute, so a
 * live-but-hidden second tab beats slowly — anything under ~90s would harvest it
 * as a crash. Records from THIS tab skip the wait (tab continuity already proves
 * the tab reloaded).
 */
export const STALE_MS = 90_000;

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
/** How close to the end an error/stall must be to be treated as the thing that ended it. */
const SIGNAL_WINDOW_MS = 15_000;

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
};

export type SessionRecord = {
	v: number;
	id: string;
	startedAt: number;
	lastBeat: number;
	/** Set on a clean `pagehide`. Its ABSENCE is the whole signal. */
	closed?: boolean;
	/** Set while the tab is frozen (discard-eligible); cleared on resume. */
	frozen?: boolean;
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
	errorCount: number;
	stallCount: number;
	longestStallMs: number;
};

export type CrashVerdict = 'memory' | 'discarded' | 'error' | 'stall' | 'unknown';

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
};

export type CrashReport = {
	id: string;
	record: SessionRecord;
	verdict: CrashVerdict;
	/** One plain sentence naming the leading explanation. */
	reason: string;
	/** Every signal actually observed, most telling first. Displayed as a list. */
	signals: string[];
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

/** Is this record shaped like one of ours? Guards a hand-edited or foreign value. */
export function isSessionRecord(v: unknown): v is SessionRecord {
	if (!v || typeof v !== 'object') return false;
	const r = v as Partial<SessionRecord>;
	return typeof r.id === 'string' && typeof r.startedAt === 'number' && typeof r.lastBeat === 'number' && Array.isArray(r.crumbs);
}

/**
 * Did this session end without a clean unload — and may THIS boot say so yet?
 *
 * `sameTab` short-circuits the staleness wait: the tab-scoped mirror can only
 * point at a record written by this very tab, so there is no live second tab to
 * mistake for a corpse.
 */
export function isUncleanEnd(rec: SessionRecord, now: number, sameTab: boolean): boolean {
	if (rec.closed) return false;
	// A record from the future (clock change, an edited value) is not evidence.
	if (rec.lastBeat > now + BEAT_MS) return false;
	return sameTab || now - rec.lastBeat > STALE_MS;
}

const lastMemFraction = (rec: SessionRecord): number => {
	const last = rec.mem[rec.mem.length - 1];
	if (!last?.limit) return 0;
	return last.used / last.limit;
};

const mb = (bytes: number): string => `${Math.round(bytes / 1_048_576)} MB`;

/**
 * Name the leading explanation, and list everything observed.
 *
 * Order is deliberate and it is about ACTIONABILITY, not confidence: heap
 * pressure leads whenever it is present, because it is the one cause the author
 * can do something about (split the deck, close the presenter window) and the
 * one that explains a silent renderer death. A discard comes next — it also
 * presents as "the page reloaded", but it is the browser reclaiming memory from
 * a BACKGROUND tab, which is a different story to tell. Errors and stalls follow.
 * `unknown` is a real answer here, not a failure: an unclosed record with a quiet
 * trail is exactly what a force-quit or a flat battery looks like, and dressing
 * that up as a crash would be the confident falsehood this module is built to avoid.
 */
export function classifySession(rec: SessionRecord, ctx: boolean | ClassifyContext): { verdict: CrashVerdict; reason: string; signals: string[] } {
	const { sameTab, tabDiscarded = false } = typeof ctx === 'boolean' ? { sameTab: ctx, tabDiscarded: false } : ctx;
	const signals: string[] = [];
	const endT = rec.lastBeat - rec.startedAt;
	const frac = lastMemFraction(rec);
	const last = rec.mem[rec.mem.length - 1];
	const first = rec.mem[0];

	const memPressure = frac >= MEM_PRESSURE;
	if (last) {
		// `<1%` rather than a rounded `0%`: measured on the real Studio, an idle
		// session sat at 6 MB of a ~4 GB limit and the panel printed "heap at 0% of
		// the limit", which reads as a broken readout rather than a healthy one.
		const pct = frac > 0 && frac < 0.01 ? '<1' : Math.round(frac * 100);
		signals.push(
			memPressure
				? `JavaScript heap at ${pct}% of this browser's limit (${mb(last.used)} of ${mb(last.limit)}) at the last reading.`
				: `JavaScript heap at ${pct}% of the limit (${mb(last.used)}) at the last reading — not obviously pressured.`,
		);
		if (first && last.used > first.used * 1.5) signals.push(`Heap grew from ${mb(first.used)} to ${mb(last.used)} over the session — consistent with a leak.`);
	} else {
		signals.push('No heap readings — this browser does not expose `performance.memory` (Safari and Firefox do not).');
	}

	// `document.wasDiscarded` is the browser ANSWERING the question rather than us
	// inferring it: on the load after a discard, Chromium sets it on the restored
	// tab. `frozen` is only "was eligible", which is the weaker claim — so when the
	// native flag is present it supersedes, and the copy says which one we have.
	const confirmedDiscard = sameTab && tabDiscarded;
	if (confirmedDiscard) signals.push('The browser reports this tab as DISCARDED — `document.wasDiscarded` was set on the load that followed.');
	else if (rec.frozen) signals.push('The tab was FROZEN by the browser (backgrounded and discard-eligible) and never resumed — a discard is likely but not confirmed.');
	const errNearEnd = rec.lastError && endT - rec.lastError.t <= SIGNAL_WINDOW_MS;
	if (rec.lastError) {
		signals.push(
			errNearEnd
				? `An uncaught error fired ${Math.max(0, Math.round((endT - rec.lastError.t) / 1000))}s before the end: ${rec.lastError.message}`
				: `${rec.errorCount} error(s) during the session, the last one well before the end: ${rec.lastError.message}`,
		);
	}
	const lastStall = [...rec.crumbs].reverse().find((c) => c.k === 'stall');
	const stallNearEnd = !!lastStall && endT - lastStall.t <= SIGNAL_WINDOW_MS;
	if (rec.stallCount) {
		signals.push(
			stallNearEnd
				? `The main thread froze for ${(rec.longestStallMs / 1000).toFixed(1)}s just before the end (${rec.stallCount} stall(s) in all).`
				: `${rec.stallCount} main-thread stall(s), longest ${(rec.longestStallMs / 1000).toFixed(1)}s — none right at the end.`,
		);
	}
	signals.push(
		sameTab
			? 'The same browser tab came back — the tab reloaded itself rather than being reopened.'
			: 'A different tab or a later visit — this session may also have ended with a force-quit, a shutdown, or a lost device.',
	);

	// A CONFIRMED discard outranks even heap pressure. The two are not rivals — the
	// browser discards a background tab precisely BECAUSE memory is tight — but when
	// `wasDiscarded` is set we are no longer guessing at the mechanism, and telling
	// an author "you ran out of memory" (go split your deck) when the real answer is
	// "the browser reclaimed a tab you had left in the background" points them at the
	// wrong fix. Confirmation beats inference; the heap reading stays in `signals`.
	if (confirmedDiscard) {
		return {
			verdict: 'discarded',
			reason: 'The browser discarded this tab to reclaim memory while it was in the background — it says so itself on the reload. Returning to a discarded tab reloads the page, which is why it looked like a crash.',
			signals,
		};
	}
	if (memPressure) {
		return {
			verdict: 'memory',
			reason: 'The heap was close to this browser’s limit when the session ended — the likeliest cause is the tab running out of memory, which kills the page outright and reloads it.',
			signals,
		};
	}
	if (rec.frozen) {
		return {
			verdict: 'discarded',
			reason: 'The browser froze this tab in the background, and it never came back — the likeliest explanation is a discard to reclaim memory. Returning to a discarded tab reloads the page, which is why it looked like a crash.',
			signals,
		};
	}
	if (errNearEnd) {
		return { verdict: 'error', reason: 'An uncaught error fired moments before the session ended — see the trail below for what ran next.', signals };
	}
	if (stallNearEnd) {
		return { verdict: 'stall', reason: 'The main thread was blocked right before the end — a long-running task, and the tab may have been killed as unresponsive.', signals };
	}
	return {
		verdict: 'unknown',
		reason: sameTab
			? 'The tab reloaded itself with no error, no stall and no heap pressure recorded — the page stopped between one heartbeat and the next.'
			: 'This session ended without closing cleanly, and nothing in the trail says why. A force-quit, a shutdown or a lost device look the same from in here.',
		signals,
	};
}

const VERDICT_TITLE: Record<CrashVerdict, string> = {
	memory: 'Ran out of memory',
	discarded: 'Discarded by the browser',
	error: 'Ended after an error',
	stall: 'Ended while frozen',
	unknown: 'Ended unexpectedly',
};

/** The short headline for a toast or a list row. */
export function crashReportTitle(report: CrashReport): string {
	return VERDICT_TITLE[report.verdict];
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
	lines.push(`- **Verdict:** ${report.verdict} — ${report.reason}`);
	lines.push(`- **Started:** ${new Date(report.startedAt).toISOString()}`);
	lines.push(`- **Last heartbeat:** ${new Date(report.endedAt).toISOString()} (ran ${stamp(report.durationMs)})`);
	lines.push(`- **Page:** ${r.page || '(unknown)'}`);
	if (r.nav) lines.push(`- **Entered by:** ${r.nav}`);
	lines.push(`- **Browser:** ${r.ua || '(unknown)'}`);
	for (const [k, v] of Object.entries(r.context)) if (v) lines.push(`- **${k}:** ${v}`);
	lines.push('');
	lines.push('**What was observed**');
	lines.push('');
	for (const s of report.signals) lines.push(`- ${s}`);
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
	records.sort((a, b) => b.startedAt - a.startedAt);
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
 * Every past session that ended without a clean unload, newest first. The live
 * session is excluded by id; a still-running SECOND TAB is excluded by the
 * staleness rule in `isUncleanEnd`.
 */
export function collectCrashReports(now: number): CrashReport[] {
	const out: CrashReport[] = [];
	for (const k of sessionKeys()) {
		const rec = readRecord(k);
		if (!rec || rec.id === liveId) continue;
		const sameTab = !!priorTabSessionId && rec.id === priorTabSessionId;
		if (!isUncleanEnd(rec, now, sameTab)) continue;
		const { verdict, reason, signals } = classifySession(rec, { sameTab, tabDiscarded: priorTabDiscarded });
		out.push({
			id: rec.id,
			record: rec,
			verdict,
			reason,
			signals,
			sameTab,
			startedAt: rec.startedAt,
			endedAt: rec.lastBeat,
			durationMs: Math.max(0, rec.lastBeat - rec.startedAt),
		});
	}
	return out.sort((a, b) => b.endedAt - a.endedAt);
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
export function noteError(err: unknown, source?: string): void {
	if (!live || sealed) return;
	const e = err as { message?: string; stack?: string } | undefined;
	const message = clip(e?.message || String(err ?? 'unknown error'), 300);
	live.errorCount++;
	live.lastError = {
		message,
		stack: e?.stack ? clip(e.stack, 1200) : undefined,
		source,
		t: Date.now() - live.startedAt,
	};
	breadcrumb('error', source ? `${source}: ${message}` : message);
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

	const id = newId(now);
	liveId = id;
	live = newRecord(id, now, {
		page: `${location.pathname}${location.search}`,
		ua: navigator.userAgent,
		nav: navigationType(),
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
		noteError(ev.error ?? { message: ev.message }, ev.filename ? `${ev.filename}:${ev.lineno}` : 'window.onerror');
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
	const onPageHide = () => {
		if (!live) return;
		live.lastBeat = Date.now();
		live.closed = true;
		breadcrumb('lifecycle', 'pagehide');
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

	addEventListener('error', onError);
	addEventListener('unhandledrejection', onRejection);
	document.addEventListener('securitypolicyviolation', onCsp);
	document.addEventListener('visibilitychange', onVisibility);
	addEventListener('pagehide', onPageHide);
	addEventListener('pageshow', onPageShow as EventListener);
	document.addEventListener('freeze', onFreeze);
	document.addEventListener('resume', onResume);

	stop = () => {
		clearInterval(timer);
		removeEventListener('error', onError);
		removeEventListener('unhandledrejection', onRejection);
		document.removeEventListener('securitypolicyviolation', onCsp);
		document.removeEventListener('visibilitychange', onVisibility);
		removeEventListener('pagehide', onPageHide);
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
}
