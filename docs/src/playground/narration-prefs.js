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
	if (raw == null || raw === AUTO) return AUTO;
	const n = Number(raw);
	return Number.isFinite(n) && n >= 0 ? Math.min(MAX_LOOKAHEAD, Math.floor(n)) : AUTO;
}

export function setLookaheadPref(value) {
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
	if (pref !== AUTO) return pref;
	const { n, p95 } = latencyStats(voiceKey || '');
	if (n < 5) return DEFAULT_LOOKAHEAD; // too few samples to be a signal, not a coincidence
	if (p95 < 400) return 1; // a sentence lands well inside one slide's speech — one slide of runway is plenty
	if (p95 < 1500) return 2;
	if (p95 < 3000) return 3;
	return MAX_LOOKAHEAD;
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
