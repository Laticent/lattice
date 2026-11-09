// RETIRED MODELS, VERSION HEALING AND OUT-OF-CREDIT — page-scoped facts a route told us, and the
// one write that moves a set selection on its own (a heal within its family). Split from
// model-selection.js because only lazy code reads or writes them (the model module, the voice
// module, the Workspace sheet); the selection store is on the Studio's boot path and these are
// not (docs/route-budget.json). engineering/decisions/2026-11-08-studio-ai-routes-ux.md rule 1.

import { readChatSelection, readImageSelection, readVoiceSelection, selectChat, selectImage, selectVoice } from './model-selection.js';
import { providerLabel } from './provider-registry.js';

const hasWindow = typeof window !== 'undefined';
function emit(name) {
	if (!hasWindow) return;
	try {
		window.dispatchEvent(new Event(name));
	} catch {
		/* no event support */
	}
}

// ── Out of credit (2026-11-08-studio-ai-routes-ux.md, state vocabulary) ──────────────────────
// Known only from a request: the provider answered a billing failure. The connection and key work,
// so nothing is switched off; Connections shows "out of credit at 14:02" until a later request on
// that route succeeds or the page reloads.
const outOfCredit = new Map();

/** Record that a route answered a billing failure, now. */
export function noteOutOfCredit(provider) {
	if (!provider) return;
	const had = outOfCredit.has(provider);
	outOfCredit.set(provider, Date.now());
	if (!had) emit('db-model-changed');
}

/** A request on the route succeeded: it has credit again. */
export function clearOutOfCredit(provider) {
	if (outOfCredit.delete(provider)) emit('db-model-changed');
}

/** When the route last answered a billing failure on this page (ms), or null. */
export const outOfCreditAt = (provider) => outOfCredit.get(provider) ?? null;

// ── Retired models and version healing (2026-11-08-studio-ai-routes-ux.md rule 1) ───────────

/** The event that announces a retired model: healed (`to` set) or stopped (`to` null). */
export const MODEL_RETIRED_EVENT = 'lattice:model-retired';

// Models a route told us are retired, for this page: a selection naming one reads "Model retired".
// A reload asks the provider again.
const retired = new Set();
const retiredKey = (provider, model) => `${provider}:${model}`;

/** Whether a route told us this model is retired (this page only). */
export const isRetired = (provider, model) => !!model && retired.has(retiredKey(provider, model));

// The event carries the route's label, so the shell that shows the notice does not need the
// provider table on its boot path; it formats the model names itself, lazily. (This module stays
// plain JS with plain-JS imports: the Node unit tier loads it without a bundler.)
function announceRetired(detail) {
	if (!hasWindow) return;
	detail = { ...detail, route: providerLabel(detail.provider) || detail.provider };
	try {
		window.dispatchEvent(new CustomEvent(MODEL_RETIRED_EVENT, { detail }));
	} catch {
		/* no event support */
	}
}

/**
 * Mark a model retired with no newer version in its family on this route: every selection that
 * names it reads "Model retired" and waits for the author. Nothing else is selected in its place.
 * `answeredBy` names the model a provider answered with instead (a silent reroute).
 * @param {{ provider: string, model: string, answeredBy?: string }} r
 */
export function markRetired({ provider, model, answeredBy }) {
	if (!model || retired.has(retiredKey(provider, model))) return;
	retired.add(retiredKey(provider, model));
	emit('db-model-changed');
	emit('db-voice-changed');
	announceRetired({ provider, model, to: null, kinds: selectionsNaming(provider, model), ...(answeredBy ? { answeredBy } : {}) });
}

/** Which selections name this model on this route ('chat' | 'image' | 'voice'). */
function selectionsNaming(provider, model) {
	const kinds = [];
	const chat = readChatSelection();
	if (chat.provider === provider && chat.model === model) kinds.push('chat');
	const img = readImageSelection();
	if (img.mode === 'own' && img.provider === provider && img.model === model) kinds.push('image');
	const voice = readVoiceSelection();
	if (voice.provider === provider && voice.model === model) kinds.push('voice');
	return kinds;
}

/**
 * HEAL a retired version: every selection that names `from` on `provider` moves to `to`, the newer
 * version of the same family on the same route (the caller found it with `healTarget`). It is the
 * one change to a set selection the Studio makes on its own, and it is always announced. A voice
 * keeps its voice (a family shares its roster). Returns the kinds it moved.
 * @param {{ provider: string, from: string, to: string }} h
 */
export function healSelections({ provider, from, to }) {
	const kinds = selectionsNaming(provider, from);
	if (kinds.includes('chat')) selectChat({ provider, model: to });
	if (kinds.includes('image')) selectImage({ mode: 'own', provider, model: to });
	if (kinds.includes('voice')) selectVoice({ provider, model: to, voice: readVoiceSelection().voice });
	retired.add(retiredKey(provider, from));
	announceRetired({ provider, model: from, to, kinds });
	return kinds;
}

// ── What a provider answered about a REFUSED key (owner report, 2026-11-08) ────────────────
// A key that reads "Key rejected" right after a sign-in had no record of why. The last refusal is
// kept for this page (status, the provider's own words, how long after the key was written, how
// many asks) and Connections shows it, so the next report names the cause instead of a guess.
// Never the key itself.
const refusals = new Map();

/**
 * Record a provider's refusal of a key: `{ status, message, ageMs, asks, at }`.
 * @param {string} provider
 * @param {{ status: number, message?: string, ageMs?: number | null, asks?: number, shape?: string, sent?: string, issued?: string }} r
 */
export function noteKeyRefusal(provider, { status, message = '', ageMs = null, asks = 1, shape = '', sent = '', issued = '' }) {
	// No event of its own: the caller records this BEFORE it marks the key rejected, and that mark's
	// one change event is what the Workspace re-reads on.
	refusals.set(provider, { status, message: String(message).replace(/\s+/g, ' ').trim().slice(0, 140), ageMs, asks, shape, sent, issued, at: Date.now(), acceptedAfterMs: null });
}

/** A refused key was later accepted: keep the record, and say after how long (ms since it was written). */
export function noteKeyAccepted(provider, ageMs) {
	const r = refusals.get(provider);
	if (r) refusals.set(provider, { ...r, acceptedAfterMs: Number.isFinite(ageMs) ? ageMs : null });
}

/** The last refusal a provider gave this page, or null. */
export const lastKeyRefusal = (provider) => refusals.get(provider) ?? null;

/** Tests only: forget every retired model and out-of-credit mark. */
export function __resetRetiredForTests() {
	retired.clear();
	outOfCredit.clear();
	refusals.clear();
}
