// The cheapest-voice ranker — which OpenRouter speech model the "Always use the cheapest
// voice" workspace setting picks when the author has not chosen one themselves.
//
// Pure and node-safe (no DOM, no `@/` alias, no TypeScript import): voice-model.js imports
// it, and voice-model.js must stay loadable under plain `node --test`.
//
// WHY THE LISTED PRICE IS NOT THE COST. OpenRouter's catalog gives each speech model a
// `prompt` price and a `completion` price. Most engines bill the input text only, but the
// Gemini TTS family ALSO bills the audio it produces as output tokens — and that second
// line is almost all of the bill. Measured 2026-09-27 on one 289-character paragraph:
//
//   google/gemini-3.8-flash-tts   55 prompt + 591 audio tokens   $0.005347   ≈ $18.50 / M chars
//   hexgrad/kokoro-82m            input only                     $0.000179   ≈  $0.62 / M chars
//
// Ranking on the prompt price alone would call Gemini ($0.50/M) the cheapest voice when it
// is ~30× the price of Kokoro. So the ranker adds the output line, converted to characters
// with the audio-token rate measured above (591 tokens / 289 chars).
//
// It stays an ESTIMATE from the catalog's listed prices, not a bill: Kokoro's listing
// ($4/M) is itself higher than what it was billed ($0.62/M). The listing overstating the
// cheap model only widens the gap, so the ranking holds; the decision note records it.
// engineering/decisions/2026-09-27-voice-default-and-cheapest-toggle.md.

/** Audio output tokens per input character, measured on gemini-3.8-flash-tts
 *  (591 tokens for 289 characters, 18.4 s of 24 kHz audio). */
export const AUDIO_TOKENS_PER_CHAR = 2.04;

/** Two models whose estimated cost is within this fraction of the cheapest count as the
 *  same price, and the better voice wins between them. */
export const PRICE_TIE_BAND = 0.1;

// The better voice first. Only consulted to break a price tie (within PRICE_TIE_BAND), so
// it needs to order the models that plausibly sit near each other on price, not the whole
// catalog. A model not listed here ranks below every listed one. This is an editorial
// judgment, not a measurement: newer generation above older, full above lite, and the
// vetted Featured engines (tts-catalog.js) above the rest. Revisit when the catalog moves.
export const TTS_QUALITY_RANK = [
	'google/gemini-3.8-flash-tts',
	'microsoft/mai-voice-2',
	'x-ai/grok-voice-tts-1.0',
	'google/gemini-3.1-flash-tts-preview',
	'fish-audio/s2.1-pro',
	'google/gemini-3.8-flash-lite-tts',
	'hexgrad/kokoro-82m',
	'canopylabs/orpheus-3b-0.1-ft',
	'sesame/csm-1b',
];

/**
 * Estimated USD per million input characters for a catalog entry
 * (`{ promptPerM, completionPerM }`, the shape listOpenRouterVoiceModels() yields).
 * Null when the model publishes no price at all — it cannot be ranked.
 */
export function ttsCostPerMChars(m) {
	const p = m?.promptPerM;
	const c = m?.completionPerM;
	if (p == null && c == null) return null;
	return (p ?? 0) + (c ?? 0) * AUDIO_TOKENS_PER_CHAR;
}

const rankOf = (id) => {
	const i = TTS_QUALITY_RANK.indexOf(String(id || '').toLowerCase());
	return i === -1 ? Number.POSITIVE_INFINITY : i;
};

/**
 * The model id the cheapest-voice setting picks, or null when nothing qualifies.
 *
 * - Free models are excluded: every `:free` tier is rate-limited, and a limit hit halfway
 *   through a deck stalls the narration or fails the export.
 * - Among the rest, every model whose estimated cost is within PRICE_TIE_BAND of the
 *   cheapest is a candidate, and the best-ranked candidate wins (TTS_QUALITY_RANK).
 * - Ties past that break on cost, then id, so the answer never depends on catalog order.
 */
export function pickCheapestTtsModel(models) {
	const priced = [];
	for (const m of models || []) {
		if (!m?.id) continue;
		const cost = ttsCostPerMChars(m);
		if (cost == null || cost <= 0) continue; // unpriced, or free (rate-limited)
		priced.push({ id: m.id, cost });
	}
	if (!priced.length) return null;
	const floor = Math.min(...priced.map((x) => x.cost));
	const candidates = priced.filter((x) => x.cost <= floor * (1 + PRICE_TIE_BAND));
	candidates.sort((a, b) => rankOf(a.id) - rankOf(b.id) || a.cost - b.cost || a.id.localeCompare(b.id));
	return candidates[0].id;
}
