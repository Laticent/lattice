import catalog from '@/playground/tts-voice-catalog.json';

// The TTS voice-catalog LOGIC layer. The DATA is split across two places on
// purpose: the voice ROSTER for every model is fetched LIVE from OpenRouter's own
// `supported_voices` field (voice-model.js's listOpenRouterVoiceModels(), the same
// catalog fetch that already lists TTS models) — never hand-typed here, so a
// roster can't silently drift from what a model actually supports (the "zoe"
// lesson: an earlier hand-curated list included a voice that 500s on every real
// call; OpenRouter's own published list never did). This file's JSON sidecar
// (tts-voice-catalog.json) carries only what genuinely needs hand-maintenance:
// which live model a cache-directory slug maps to, whether it's worth asset-
// caching, the provider's actual audio format, and the bounded "featured" subset
// of voices that got a pre-generated sample. See the redesign section of
// engineering/decisions/2026-07-09-studio-cloud-ondevice-config-split.md.

export type Voice = { id: string; label: string };
type Engine = {
	modelId: string;
	requiresAsset: boolean;
	audioFormat?: 'mp3' | 'wav';
	cachedVoices: string[];
	/** Only set on the one engine (today: mai-voice-2) where OpenRouter's own
	 *  `supported_voices` is a non-exhaustive sample, not the real roster — see the
	 *  JSON's `_note` on that entry. Supplements (never replaces) the live list. */
	voiceOverride?: string[];
};

const ENGINES = (catalog as { engines: Record<string, Engine> }).engines;

/** The engine slug (`kokoro`, `grok`, …) a cloud model id resolves to, or `null`
 *  for a model this catalog has no cache metadata for (every model still WORKS via
 *  the live path — this only gates asset caching). An empty/unset id resolves to
 *  `kokoro` — the connect-time default. Case-insensitive (OpenRouter ids are
 *  lowercase-canonical, but defensive). */
export function engineForModel(modelId: string): string | null {
	const id = (modelId || '').toLowerCase();
	if (!id) return 'kokoro';
	for (const [engine, def] of Object.entries(ENGINES)) {
		if (def.modelId.toLowerCase() === id) return engine;
	}
	return null;
}

const KOKORO_LANG: Record<string, string> = { a: 'US', b: 'UK', e: 'ES', f: 'FR', h: 'HI', i: 'IT', j: 'JP', p: 'BR', z: 'CN' };

function titleCase(s: string): string {
	return s.replace(/[_-]+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A voice id → a display label, derived (never hand-typed, so it can never go
 *  stale against a live-fetched roster). Decodes the two structured naming
 *  conventions actually seen in the wild — Kokoro's `<lang><gender>_<name>` (the
 *  language-prefix table is Kokoro's own documented convention, huggingface.co/
 *  hexgrad/Kokoro-82M/blob/main/VOICES.md) and Azure/MAI's `xx-XX-Name[:Model]` —
 *  and falls back to a plain title-cased spacing of underscores/hyphens for
 *  everything else (snake_case ids like `en_paul_happy`, `american_female`, a bare
 *  `eve`). Always well-formed, never wrong in a way hand-typed prose could be. */
export function prettyVoiceLabel(id: string): string {
	const kokoro = /^([abefhijpz])([fm])_(\w+)$/.exec(id);
	if (kokoro) {
		const lang = KOKORO_LANG[kokoro[1]];
		if (lang) return `${titleCase(kokoro[3])} · ${lang}`;
	}
	const stripped = id.replace(/:.+$/, ''); // drop a trailing ":Model-Name" qualifier
	const locale = /^([a-z]{2}-[A-Z]{2})-([A-Za-z]+)$/.exec(stripped);
	if (locale) return `${locale[2]} · ${locale[1]}`;
	return titleCase(stripped);
}

/** Build the dropdown roster for a model from its LIVE `supported_voices` (as
 *  returned by listTtsModels()/listOpenRouterVoiceModels()), supplemented by
 *  voiceOverride on the rare engine where that live field is known incomplete
 *  (see the Engine type). Voices are deduped and label-derived. `liveVoices` for a
 *  model OpenRouter doesn't currently list, or one with a genuinely empty
 *  published roster, is `[]` — the caller renders the disabled/explained state,
 *  never a free-text field (see VoicePicker in TtsSettings.tsx). */
export function voicesForModel(modelId: string, liveVoices: string[]): Voice[] {
	const engine = engineForModel(modelId);
	const override = engine ? ENGINES[engine]?.voiceOverride : undefined;
	const ids = override ? Array.from(new Set([...override, ...liveVoices])) : liveVoices;
	return ids.map((id) => ({ id, label: prettyVoiceLabel(id) }));
}

/** The voice-reset decision for a MODEL switch: if the current voice isn't on the
 *  new model's roster, returns the roster's first id to reset to; `null` when the
 *  current voice is already valid OR the new roster is empty (nothing to reset
 *  FROM/TO — the caller's UI disables instead). Pure — takes the already-resolved
 *  roster, not a modelId, so it doesn't need the live catalog itself. */
export function voiceResetOnModelChange(voices: Voice[], currentVoice: string): string | null {
	if (!voices.length) return null;
	if (voices.some((v) => v.id === currentVoice)) return null;
	return voices[0].id;
}

/** Resolve a stored voice id against a roster: the id itself if it's still valid,
 *  else the roster's first entry (never a free-text passthrough — every model
 *  OpenRouter lists has real voices now, so there's nothing to "preserve" a custom
 *  string for). `''` when the roster itself is empty. */
export function resolveVoice(voices: Voice[], stored: string): string {
	if (voices.some((v) => v.id === stored)) return stored;
	return voices[0]?.id ?? '';
}

/** The on-disk sample path for a (model, voice) pair at the DEFAULT speed — the
 *  only speed that's pre-generated — or null when there's nothing cached: a voice
 *  outside the engine's featured `cachedVoices` subset, a model this catalog has
 *  no cache metadata for, or a non-default speed. `docs/public/` is served at the
 *  site root, so this doubles as the fetchable URL. */
export function cachedSampleUrl(modelId: string, voiceId: string, speed: number): string | null {
	if (speed !== 1) return null;
	if (!voiceId) return null;
	const engine = engineForModel(modelId);
	if (!engine) return null;
	const def = ENGINES[engine];
	if (!def?.requiresAsset) return null;
	if (!def.cachedVoices.includes(voiceId)) return null; // outside the featured subset — live path
	const ext = def.audioFormat === 'wav' ? 'wav' : 'mp3';
	// A voice id can contain characters invalid in a Windows filename (MAI-Voice-2's
	// ids carry a literal ":") — mirrors tools/generate-voice-samples.mjs's own
	// safeFilename EXACTLY, so a generated file and its lookup URL always agree.
	const filename = voiceId.replace(/:/g, '_');
	return `/voice-samples/${engine}/${encodeURIComponent(filename)}.${ext}`;
}

/** Kokoro's fixed model id — the on-device engine has no "model" concept of its
 *  own (there's only one), so callers that need a modelId for the cache lookup
 *  (on-device previews) pass this. Also the exact id used to look up Kokoro's live
 *  roster in the SAME fetched models array the cloud picker uses (Kokoro's live
 *  catalog entry is unauthenticated and fetched regardless of tier). */
export const KOKORO_MODEL_ID = ENGINES.kokoro.modelId;

/** The explanatory copy for a model with no usable voice roster (empty `voices`
 *  from the live catalog — currently a theoretical case; every model OpenRouter
 *  publishes today has one). Generic and honest rather than editorializing a
 *  reason we don't actually know. */
export const NO_VOICES_HINT = "This model hasn't published a voice list on OpenRouter yet — check its OpenRouter page.";
