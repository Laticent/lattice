import catalog from '@/playground/tts-voice-catalog.json';

// The curated TTS voice map, in one place — read by both TtsSettings.tsx (the
// picker UI) and read-aloud.ts (the local-first sample cache lookup), so the two
// can never drift against each other. The DATA lives in tts-voice-catalog.json
// (also read directly by tools/generate-voice-samples.mjs and tools/check-
// ownership.js, which can't import a .ts module) — this file is the browser-side
// LOGIC over that shared data. See engineering/decisions/2026-07-09-studio-cloud-
// ondevice-config-split.md.

export type Voice = { id: string; label: string };
type MatchRule = Partial<Record<'includes' | 'startsWith', string>>;
type Engine = { modelId: string | null; requiresAsset: boolean; audioFormat?: 'mp3' | 'wav'; match: MatchRule[]; voices: Voice[]; hint?: string };

const ENGINES = (catalog as { engines: Record<string, Engine> }).engines;

function matches(id: string, rules: MatchRule[]): boolean {
	return rules.some((rule) =>
		Object.entries(rule).every(([kind, value]) => {
			if (!value) return true;
			if (kind === 'includes') return id.includes(value);
			if (kind === 'startsWith') return id.startsWith(value);
			return false;
		}),
	);
}

/** The engine slug (`kokoro`, `grok`, …) a cloud model id resolves to, or `null`
 *  for an unrecognized model. An empty/unset id resolves to `kokoro` — the
 *  connect-time default. */
export function engineForModel(modelId: string): string | null {
	const id = (modelId || '').toLowerCase();
	if (!id) return 'kokoro';
	for (const [engine, def] of Object.entries(ENGINES)) {
		if (matches(id, def.match)) return engine;
	}
	return null;
}

/** The curated voice roster for a cloud model id, or [] when the model is
 *  unrecognized OR when it genuinely has no named-voice concept to curate
 *  (guessing a wrong roster — or forcing a "voice picker" onto a model that
 *  doesn't have named voices at all — is worse than admitting we don't know it).
 *  See tts-voice-catalog.json's per-engine comments for why each "no" engine has
 *  none. Kokoro is also the connect-time default, so an empty/unset model id
 *  resolves to its roster too. */
export function voicesForModel(modelId: string): Voice[] {
	const engine = engineForModel(modelId);
	return engine ? (ENGINES[engine]?.voices ?? []) : [];
}

/** Some models have NO named-voice concept at all (voice cloning, numeric speaker
 *  slots) — "enter a voice id" is misleading for them, not just "unrecognized." A
 *  specific hint beats the generic fallback message wherever we know why. */
export function noRosterHint(modelId: string): string | undefined {
	const engine = engineForModel(modelId);
	return engine ? ENGINES[engine]?.hint : undefined;
}

/** Resolve a stored voice id against a curated roster: either the id itself
 *  (known) or the OTHER sentinel (unknown — the free text holds the real value). */
export const OTHER = '__other__';
export function resolveVoice(voices: Voice[], stored: string): { select: string; other: string } {
	if (!stored) return { select: voices[0]?.id ?? OTHER, other: '' };
	if (voices.some((v) => v.id === stored)) return { select: stored, other: '' };
	return { select: OTHER, other: stored };
}

/** The voice-reset decision for a cloud MODEL switch: if the new model's roster is
 *  non-empty and doesn't already contain the currently effective voice, returns the
 *  roster's default id to reset to; otherwise null (no reset). Deliberately null —
 *  not an empty-string reset — when the new roster is EMPTY (an unrecognized or
 *  no-named-voice model): free text is valid for any model, so there's nothing to
 *  reset FROM/TO, and resetting there would blank the visible field without
 *  persisting the clear (a UI/storage desync where the old value silently
 *  reappears on next reload — the #846 follow-up regression). */
export function voiceResetOnModelChange(newModelId: string, currentVoice: string): string | null {
	const roster = voicesForModel(newModelId);
	if (roster.length && !roster.some((v) => v.id === currentVoice)) return roster[0].id;
	return null;
}

/** The on-disk sample path for a (model, voice) pair at the DEFAULT speed — the
 *  only speed that's pre-generated (see the decision doc's speed-handling note) —
 *  or null when there's nothing cached: an uncurated/free-text voice, a model with
 *  no named-voice roster, or a non-default speed. `docs/public/` is served at the
 *  site root, so this doubles as the fetchable URL. */
export function cachedSampleUrl(modelId: string, voiceId: string, speed: number): string | null {
	if (speed !== 1) return null;
	if (!voiceId) return null;
	const engine = engineForModel(modelId);
	if (!engine) return null;
	const def = ENGINES[engine];
	if (!def?.requiresAsset) return null; // no live model backs this engine yet (e.g. openai) — nothing was generated
	if (!def.voices.some((v) => v.id === voiceId)) return null; // free-text/unrecognized voice — never cached
	const ext = def.audioFormat === 'wav' ? 'wav' : 'mp3'; // most engines return mp3; a model-specific quirk (e.g. Gemini, pcm-only) declares wav
	return `/voice-samples/${engine}/${encodeURIComponent(voiceId)}.${ext}`;
}

/** Kokoro's fixed model id — the on-device engine has no "model" concept of its
 *  own (there's only one), so callers that need a modelId for the cache lookup
 *  (on-device previews) pass this. */
export const KOKORO_MODEL_ID = ENGINES.kokoro.modelId as string;
