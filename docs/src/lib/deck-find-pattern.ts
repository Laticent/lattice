// PATTERN SEARCH FOR THE CHAT'S find_text AND replace_text — the half that may run a regular expression
// (#3208 item 6; the owner's call on 2026-11-19: "regex in a Worker").
//
// A pattern the model writes runs over deck text the author did not write either: `(a+)+$` against a long
// heading backtracks for minutes, and on the page's main thread that freezes the Studio with no way to stop
// it. JavaScript cannot interrupt a running RegExp; it can only end the thread it runs on. So a pattern never
// runs on the main thread. The kernel (deck-find.ts) collects the strings it would search, `runPattern`
// searches them inside a Worker (deck-find-pattern.worker.ts), and the page ends that Worker when it misses
// `PATTERN_TIMEOUT_MS`. What comes back is plain data — where each match is and what its groups captured —
// and the kernel does everything else (fields, escaping, the structure check) the same way for a pattern as
// for literal words.
//
// Compiling a pattern is safe on the main thread (no input, no backtracking), so a bad pattern is refused
// there, before any Worker starts.
//
// Not src/lib/worker-pool.js: that pool's contract is "on any failure, run the job on the main thread", and a
// pattern that timed out is exactly the job that must never run there. This runner refuses instead.

/** One match, as plain data a Worker can send: where it starts, what it matched, what each group captured. */
export interface RawMatch {
	readonly index: number;
	readonly text: string;
	/** `$1`, `$2`… in order; a group that did not take part is undefined. */
	readonly groups: readonly (string | undefined)[];
	/** `$<name>`; absent when the pattern names no group. */
	readonly named?: Readonly<Record<string, string | undefined>>;
}

/** How long a pattern may run over the whole deck before its Worker is ended. A deck is a few thousand lines;
 *  a sane pattern finishes in milliseconds, and this also covers starting the Worker. */
export const PATTERN_TIMEOUT_MS = 2000;

/** The most matches one search returns. A pattern like `.` matches every character; past this it is not a
 *  find, and the answer would not fit the model's context anyway. */
export const PATTERN_MAX_MATCHES = 5000;

export interface PatternJob {
	readonly source: string;
	readonly flags: string;
	readonly texts: readonly string[];
}

export type PatternResult = { ok: true; matches: RawMatch[][] } | { ok: false; reason: 'timeout' | 'too-many' | 'failed'; message: string };

/** The regular-expression source a find runs: the pattern itself, or the literal words escaped, wrapped for
 *  whole-word matching. `\p{M}`: a combining accent belongs to its word, so whole-word `cafe` does not match
 *  the `cafe` of `café`. */
export function patternSource(query: string, o: { regex?: boolean; wholeWord?: boolean }): string {
	const core = o.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return o.wholeWord ? `(?<![\\p{L}\\p{M}\\p{N}_])(?:${core})(?![\\p{L}\\p{M}\\p{N}_])` : core;
}

export const patternFlags = (o: { caseSensitive?: boolean }) => (o.caseSensitive ? 'gu' : 'giu');

/** Compile a pattern, or say in one line why it does not compile. Safe on the main thread. */
export function compilePattern(query: string, o: { regex?: boolean; wholeWord?: boolean; caseSensitive?: boolean }): RegExp | { error: string } {
	try {
		return new RegExp(patternSource(query, o), patternFlags(o));
	} catch (e) {
		return { error: String((e as Error)?.message ?? e).replace(/^Invalid regular expression: /, '') };
	}
}

/** Every non-empty match of one global regular expression in one string. An empty match finds nothing a
 *  reader could see and would replace nothing, so it is skipped (and the search steps past it). */
export function matchesIn(re: RegExp, text: string): RawMatch[] {
	const out: RawMatch[] = [];
	for (const m of text.matchAll(re)) {
		if (!m[0]) continue;
		out.push({ index: m.index, text: m[0], groups: m.slice(1), ...(m.groups ? { named: { ...m.groups } } : {}) });
	}
	return out;
}

/** THE ONLY PLACE A MODEL-WRITTEN PATTERN RUNS: inside the Worker, never on the page's main thread. */
export function runPattern(job: PatternJob): PatternResult {
	let re: RegExp;
	try {
		re = new RegExp(job.source, job.flags);
	} catch (e) {
		return { ok: false, reason: 'failed', message: String((e as Error)?.message ?? e) };
	}
	const matches: RawMatch[][] = [];
	let total = 0;
	for (const t of job.texts) {
		const found = matchesIn(re, t);
		total += found.length;
		if (total > PATTERN_MAX_MATCHES) return { ok: false, reason: 'too-many', message: `more than ${PATTERN_MAX_MATCHES} matches` };
		matches.push(found);
	}
	return { ok: true, matches };
}

/** The part of a Worker this runner uses, so a test can stand in for one. */
export interface PatternWorker {
	onmessage: ((e: { data: unknown }) => void) | null;
	onerror: ((e: { message?: string }) => void) | null;
	onmessageerror?: ((e: unknown) => void) | null;
	postMessage(message: PatternJob): void;
	terminate(): void;
}

export type PatternRunner = (job: PatternJob) => Promise<PatternResult>;

/** Run each job in a FRESH Worker and end it when it answers, fails or misses the deadline. A fresh one per
 *  job because ending a Worker is the only way to stop a pattern, and a find is one call per turn at most. */
export function workerPatternRunner(spawn: () => PatternWorker, timeoutMs = PATTERN_TIMEOUT_MS): PatternRunner {
	return (job) =>
		new Promise<PatternResult>((resolve) => {
			let worker: PatternWorker;
			try {
				worker = spawn();
			} catch (e) {
				resolve({ ok: false, reason: 'failed', message: `the pattern worker did not start (${(e as Error)?.message ?? e})` });
				return;
			}
			let settled = false;
			const finish = (r: PatternResult) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				worker.terminate();
				resolve(r);
			};
			const timer = setTimeout(() => finish({ ok: false, reason: 'timeout', message: `no answer in ${timeoutMs} ms` }), timeoutMs);
			worker.onmessage = (e) => {
				const r = e.data as PatternResult | null;
				finish(r && typeof r === 'object' && 'ok' in r ? r : { ok: false, reason: 'failed', message: 'the pattern worker sent something unreadable' });
			};
			worker.onerror = (e) => finish({ ok: false, reason: 'failed', message: e?.message || 'the pattern worker failed' });
			worker.onmessageerror = () => finish({ ok: false, reason: 'failed', message: 'the pattern worker sent something unreadable' });
			worker.postMessage(job);
		});
}

/** `$&`, `$1`…`$99`, `$<name>` and `$$` in a replacement, as String.prototype.replace reads them. A `$` that
 *  names no group stays as typed. (`` $` `` and `$'` are not offered: a match's surroundings are the slide's,
 *  and copying them in is a structural edit, not a word change.) */
export function expandReplacement(template: string, m: RawMatch): string {
	return template.replace(/\$(?:(\$)|(&)|<([^>]*)>|(\d{1,2}))/g, (all, dollar, amp, name, num) => {
		if (dollar) return '$';
		if (amp) return m.text;
		if (name !== undefined) return m.named && Object.hasOwn(m.named, name) ? (m.named[name] ?? '') : all;
		const two = Number(num);
		if (num.length === 2 && two >= 1 && two <= m.groups.length) return m.groups[two - 1] ?? '';
		const one = Number(num[0]);
		if (one >= 1 && one <= m.groups.length) return (m.groups[one - 1] ?? '') + num.slice(1);
		return all;
	});
}

/**
 * The replacement in the case of the words it replaces, the way a word processor's "preserve case" does:
 * `OCT` → `OCTOBER`, `Oct` → `October`, `oct` → `october`. Two or more cased letters all upper (an all-caps
 * eyebrow) → the replacement in capitals; all lower → in lower case; the first letter upper and the rest
 * lower (or a single capital) → the replacement's first letter capitalized, the rest as typed. Mixed case
 * (`iPhone`) or no letters at all → as typed.
 */
export function withCaseOf(matched: string, rep: string): string {
	const cased = [...matched].filter((c) => c.toUpperCase() !== c.toLowerCase());
	if (!cased.length) return rep;
	const isUpper = (c: string) => c === c.toUpperCase();
	if (cased.length >= 2 && cased.every(isUpper)) return rep.toUpperCase();
	if (cased.every((c) => !isUpper(c))) return rep.toLowerCase();
	if (isUpper(cased[0]) && cased.slice(1).every((c) => !isUpper(c))) {
		const at = [...rep].findIndex((c) => c.toUpperCase() !== c.toLowerCase());
		if (at < 0) return rep;
		const chars = [...rep];
		chars[at] = chars[at].toUpperCase();
		return chars.join('');
	}
	return rep;
}
