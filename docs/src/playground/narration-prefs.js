// Present narration preferences — the workspace-level knobs for how far ahead the
// deck's audio is fetched, and whether it is kept on this device between sessions.
//
// Mirrors the tiny shared-pref modules already in this directory
// (readaloud-overlay-prefs, storage-overlay-prefs): localStorage + a same-page change
// signal, so a flip in the Workspace sheet takes effect on the live Present surface
// without a reload.
//
// Node-safe and dependency-free (voice-model.js imports the cache flag): plain JS, no
// `@/` alias, no TypeScript import, every entry point guards `localStorage`.

import { latencyStats } from './narration-latency.js';

const LOOKAHEAD_KEY = 'lattice-present-lookahead';
const CACHE_KEY = 'lattice-present-narration-cache';

/** How many slides ahead Present prefetches when the pref is left on `auto`. Sized from
 *  the measured p95 synth latency for the active voice — see `resolveLookahead`. */
const AUTO = 'auto';
/** Prefetch the WHOLE deck. This is what a "Prepare the deck" action used to be — it is not
 *  a separate feature, just an unbounded window, which is why it belongs here as a value
 *  rather than as a button in the delivery surface. */
const ALL = 'all';
/** The hard ceiling on the prefetch window, whether chosen or auto-resolved. Above this
 *  a presenter is speculatively buying audio for slides they may never reach. */
export const MAX_LOOKAHEAD = 4;
/** Used when nothing has been measured yet — the same two slides the design settled on
 *  as the sane default, so a cold profile behaves well before any data exists. */
export const DEFAULT_LOOKAHEAD = 2;

const listeners = new Set();
function emit() {
	for (const fn of listeners) {
		try {
			fn();
		} catch {
			/* a bad listener never breaks the setter */
		}
	}
}

/** Subscribe to any narration-pref change. Returns an unsubscribe.
 *  The unsubscribe returns nothing on purpose — `Set.delete`'s boolean would make this
 *  unusable as a React effect cleanup (an EffectCallback must return void or a destructor). */
export function onNarrationPrefsChange(fn) {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}

function readLS(k) {
	try {
		return localStorage.getItem(k);
	} catch {
		return null;
	}
}
function writeLS(k, v) {
	try {
		if (v == null) localStorage.removeItem(k);
		else localStorage.setItem(k, v);
	} catch {
		/* storage unavailable */
	}
}

/** The raw pref: `'auto'` or a slide count 0–MAX_LOOKAHEAD. Defaults to `'auto'`. */
export function lookaheadPref() {
	const raw = readLS(LOOKAHEAD_KEY);
	if (raw === ALL) return ALL;
	if (raw == null || raw === AUTO) return AUTO;
	const n = Number(raw);
	return Number.isFinite(n) && n >= 0 ? Math.min(MAX_LOOKAHEAD, Math.floor(n)) : AUTO;
}

export function setLookaheadPref(value) {
	if (value === ALL) {
		writeLS(LOOKAHEAD_KEY, ALL);
		emit();
		return;
	}
	writeLS(LOOKAHEAD_KEY, value === AUTO ? AUTO : String(Math.max(0, Math.min(MAX_LOOKAHEAD, Math.floor(Number(value) || 0)))));
	emit();
}

/**
 * The prefetch window to actually use, in slides.
 *
 * An explicit pref wins. On `auto`, size it from the measured p95 synth latency for the
 * active voice (narration-latency.js): a fast voice needs barely any runway, a slow one
 * needs more. Thresholds are deliberately coarse — this picks a small integer, and
 * pretending to more precision than a 40-sample reservoir supports would be false.
 *
 * Falls back to DEFAULT_LOOKAHEAD until enough samples exist to mean anything.
 */
export function resolveLookahead(voiceKey) {
	const pref = lookaheadPref();
	// The whole deck: an unbounded window. The caller clamps to the deck length, so this
	// needs no special case anywhere downstream — the prefetch loop simply never runs out.
	if (pref === ALL) return Number.POSITIVE_INFINITY;
	if (pref !== AUTO) return pref;
	const { n, p95 } = latencyStats(voiceKey || '');
	if (n < 5) return DEFAULT_LOOKAHEAD; // too few samples to be a signal, not a coincidence
	if (p95 < 400) return 1; // a sentence lands well inside one slide's speech — one slide of runway is plenty
	if (p95 < 1500) return 2;
	if (p95 < 3000) return 3;
	return MAX_LOOKAHEAD;
}

// ── Delivery pace ────────────────────────────────────────────────────────────
// The between-slide beat. Stored here as a NAME plus optional exact overrides; the
// milliseconds themselves live in cadenza's `PACE_PRESETS` (the one pace kernel), because
// this module is imported by node-loadable voice-model.js and structurally cannot import a
// TypeScript module — the same constraint the file header describes. So: names and numbers
// travel through here, meaning comes from cadence.ts.

const PACE_KEY = 'lattice-present-pace';
const SLIDE_BEAT_KEY = 'lattice-present-slide-beat';
const SECTION_BEAT_KEY = 'lattice-present-section-beat';

const PACE_NAMES = ['brisk', 'natural', 'deliberate'];

/** The named delivery pace — 'brisk' | 'natural' | 'deliberate'. Defaults to 'natural'. */
export function pacePref() {
	const raw = String(readLS(PACE_KEY) ?? '');
	return PACE_NAMES.includes(raw) ? raw : 'natural';
}

export function setPacePref(name) {
	writeLS(PACE_KEY, PACE_NAMES.includes(name) ? name : null);
	emit();
}

/** Exact per-boundary overrides in ms, or `undefined` when unset (use the preset).
 *  `0` is a MEANINGFUL value — "no beat at all" — so this distinguishes unset from zero
 *  rather than treating both as falsy. */
export function beatOverride(kind) {
	const raw = readLS(kind === 'section' ? SECTION_BEAT_KEY : SLIDE_BEAT_KEY);
	if (raw == null || raw === '') return undefined;
	const n = Number(raw);
	return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function setBeatOverride(kind, ms) {
	const key = kind === 'section' ? SECTION_BEAT_KEY : SLIDE_BEAT_KEY;
	writeLS(key, ms == null || !Number.isFinite(Number(ms)) || Number(ms) < 0 ? null : String(Math.round(Number(ms))));
	emit();
}

/** Is synthesized narration kept on this device between sessions? Default ON — it is
 *  what makes the second run of a deck instant and free, and the Workspace Data tab
 *  surfaces and clears it. */
export function narrationCacheEnabled() {
	return readLS(CACHE_KEY) !== '0';
}

export function setNarrationCacheEnabled(on) {
	writeLS(CACHE_KEY, on ? null : '0');
	emit();
}
