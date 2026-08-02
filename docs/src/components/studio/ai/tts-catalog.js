// The OpenRouter TTS-model catalog — curated lens lists + pure formatting/filtering
// helpers, the TTS twin of or-catalog.js (the chat-model picker's catalog). Reuses
// or-catalog.js's generic helpers (vendorOf/shortName/fmtPrice/groupByVendor/inSet/
// isFreeModel all operate on the same {id, name, promptPerM, completionPerM} shape
// regardless of whether the model is chat or speech — HARD RULE #15, don't
// reinvent) and adds only what's genuinely TTS-specific: the curated Featured/Value
// sets, a single-price-dimension meta line (TTS has no meaningful "completion"
// price — audio out isn't billed as output tokens the way chat completions are),
// and the empty-state copy.
//
// A catalog entry is the shape voice-model.js's listOpenRouterVoiceModels() yields:
//   { id, name, promptPerM, completionPerM, voices }
// where `voices` is the model's live `supported_voices` array — the single source
// of truth every voice dropdown derives from (see tts-voice-catalog.ts).

import { fmtPrice, groupByVendor, inSet, isFreeModel, shortName, vendorOf } from './or-catalog.js';

export { fmtPrice, groupByVendor, isFreeModel, shortName, vendorOf };

// The models we've fully vetted end-to-end: live-tested voices, cached samples
// committed for a featured subset of each. Pinned exact ids (not family prefixes
// like the chat picker's OR_FEATURED) — each is a single dated release, not an
// evolving family, so there's no "next version" to prefix-match.
export const TTS_FEATURED = [
	'hexgrad/kokoro-82m',
	'x-ai/grok-voice-tts-1.0',
	'google/gemini-3.1-flash-tts-preview',
	'canopylabs/orpheus-3b-0.1-ft',
	'microsoft/mai-voice-2',
];

// The cheapest-per-character tier (the "Value" lens) — everything at or under
// $10/M characters at time of curation. Kokoro is the standout (~$0.62/M).
export const TTS_VALUE = [
	'hexgrad/kokoro-82m',
	'google/gemini-3.1-flash-tts-preview',
	'zyphra/zonos-v0.1-transformer',
	'zyphra/zonos-v0.1-hybrid',
	'sesame/csm-1b',
	'canopylabs/orpheus-3b-0.1-ft',
];

// The picker's four lenses, in display order. [key, label] — the label is the tab.
export const TTS_VIEWS = [
	['featured', 'Featured'],
	['value', 'Value'],
	['free', 'Free'],
	['all', 'All'],
];

// TTS pricing is a single dimension (characters in → audio out; there's no
// per-output-token "completion" cost the way a chat completion has one — every
// live TTS model reports completion:0). One price line, not the chat picker's
// "$X/M in · $Y/M out".
export const ttsPriceLabel = (m) => (m.promptPerM != null ? `${fmtPrice(m.promptPerM)}/M chars` : 'pricing varies');

// Filter the catalog for a view ('featured' | 'value' | 'free' | 'all') and a
// free-text query (matched against name + id, case-insensitive). Pure — returns a
// new array, original untouched. Mirrors or-catalog.js's filterModels.
export function filterTtsModels(models, view, query) {
	const q = (query || '').trim().toLowerCase();
	let items = (models || []).filter((m) => `${m.name || ''} ${m.id}`.toLowerCase().includes(q));
	if (view === 'featured') items = items.filter((m) => inSet(TTS_FEATURED, m.id));
	else if (view === 'value') items = items.filter((m) => inSet(TTS_VALUE, m.id));
	else if (view === 'free') items = items.filter(isFreeModel);
	return items;
}

// The empty-state message for a view that filtered everything out.
export const emptyTtsMessage = (view) => (view === 'all' ? 'No TTS models match.'
	: view === 'free' ? 'No free TTS models in the catalog right now.'
		: `No ${view} TTS models match — try All.`);

// A coarse value tier for a per-million-character price — the "$/$$/$$$" badge that
// lets the eye rank cost at a glance without reading the exact number. Buckets chosen
// off the live spread (2026-07-13): the two standouts Kokoro (~$0.62/M) + Gemini
// (~$1/M) are `$`; the mid cluster Zonos/Orpheus/CSM (~$7/M) is `$$`; Grok/Voxtral/MAI
// ($15–$22/M) are `$$$`. Free (0) and unknown return null — the Free lens / a missing
// price line already speak for those.
export function priceTier(m) {
	const p = m?.promptPerM;
	if (p == null || p === 0) return null;
	if (p <= 2) return '$';
	if (p <= 10) return '$$';
	return '$$$';
}

// The picker's rows for a view, as an ordered list of {label, models} groups. The
// browse-everything 'all' lens keeps vendor grouping (navigation by maker); the
// curated Featured/Value/Free lenses drop it for a single flat list sorted by price
// LOW→HIGH (label:null — the component renders no header), so the cheapest, best-value
// models — Kokoro then Gemini — sort to the top where the eye lands first.
export function ttsModelGroups(models, view, query) {
	const items = filterTtsModels(models, view, query);
	if (view === 'all') return groupByVendor(items).map((g) => ({ label: g.vendor, models: g.models }));
	const sorted = items.slice().sort((a, b) => (a.promptPerM ?? Number.POSITIVE_INFINITY) - (b.promptPerM ?? Number.POSITIVE_INFINITY));
	return sorted.length ? [{ label: null, models: sorted }] : [];
}
