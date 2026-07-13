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
	/** The curated "top voices" for this engine — a small highlighted set shown
	 *  first in the voice picker's ★ Featured group, distinct from `cachedVoices`
	 *  (which is "has a committed sample", now often the whole roster). Optional;
	 *  when absent the picker falls back to `cachedVoices` (see featuredVoiceIds). */
	featuredVoices?: string[];
	/** Curated voice→gender for engines whose ids DON'T encode it (Gemini, Grok,
	 *  Orpheus, MAI, Voxtral) — sourced from each provider's own published voice
	 *  docs, not guessed by ear (Gemini's is Google's official Gender column). The
	 *  id-structural engines (Kokoro's `<lang><gender>_`, Zonos' `_female`/`_male`)
	 *  derive it directly and need no entry. A voice absent from this map (e.g. CSM's
	 *  persona-less "read_speech_a") simply shows no badge — never a guess. */
	voiceGenders?: Record<string, 'F' | 'M'>;
	/** Only set on the one engine (today: mai-voice-2) where OpenRouter's own
	 *  `supported_voices` is a non-exhaustive sample, not the real roster — see the
	 *  JSON's `_note` on that entry. Supplements (never replaces) the live list. */
	voiceOverride?: string[];
	/** Whether this model's `speed` request param actually changes the audio —
	 *  live-tested per engine (see each entry's `_speedNote`), NOT inferred from
	 *  OpenRouter's `supported_parameters` (that field never lists `speed` for any
	 *  TTS model, supported or not — it's not diagnostic here). A model this catalog
	 *  has no entry for defaults to unsupported (speedSupported, below) — same
	 *  "admit we don't know" stance as an uncataloged voice roster. */
	speedSupport: boolean;
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

/** Whether a cloud model's `speed` control actually does anything, live-tested
 *  per engine (see the catalog JSON's `_speedNote`s) — an OpenRouter TTS model
 *  passes `speed` straight to its own backend, and providers differ on whether
 *  they implement it at all; several silently ignore it rather than error.
 *  Defaults to `false` for a model this catalog has no entry for (an unverified
 *  model is treated the same as a known-unsupported one — never optimistically
 *  enabled), and `true` for the unset/empty id (Kokoro, the connect-time
 *  default, verified). */
export function speedSupported(modelId: string): boolean {
	const engine = engineForModel(modelId);
	return engine ? (ENGINES[engine]?.speedSupport ?? false) : false;
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
 *  not in the engine's `cachedVoices` set (the voices with a committed sample — now
 *  often the whole roster), a model this catalog has no cache metadata for, or a
 *  non-default speed. `docs/public/` is served at the site root, so this doubles as
 *  the fetchable URL. */
export function cachedSampleUrl(modelId: string, voiceId: string, speed: number): string | null {
	if (speed !== 1) return null;
	if (!voiceId) return null;
	const engine = engineForModel(modelId);
	if (!engine) return null;
	const def = ENGINES[engine];
	if (!def?.requiresAsset) return null;
	if (!def.cachedVoices.includes(voiceId)) return null; // no committed sample — live path
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

/** The explanatory copy shown IN PLACE of the speed slider for a model whose
 *  `speed` param is live-verified to do nothing (see speedSupported above) —
 *  this voice always speaks at its own natural pace. */
export const NO_SPEED_HINT = "This voice doesn't support adjustable speed — it always plays at its natural pace.";

// ── Voice picker information architecture ──────────────────────────────────────
// The picker groups a model's roster as: a ★ Featured highlight, then — ONLY where
// the voice id actually encodes it — one group per language; engines whose ids are
// bare names (Gemini's "Kore"/"Puck", Grok, Orpheus, CSM) can't be grouped by
// language, so they collapse to a single "All voices" list. Gender is a per-row badge
// where KNOWN, never a nesting level — it degrades gracefully to nothing when unknown.
// LANGUAGE is derived from id STRUCTURE only (never a hand-typed roster, same reason
// the roster itself is live-fetched — see the file header): Kokoro's `<lang><gender>`,
// Voxtral's `<lang>_name`, Azure/MAI's `xx-XX-Name`. GENDER comes from the id where it
// encodes it (Kokoro, Zonos) and otherwise from the catalog's curated, provider-sourced
// `voiceGenders` map — gender of a named voice is stable metadata (unlike which voices
// exist), so a small sourced map doesn't carry the roster's drift risk. See
// engineering/decisions/2026-07-13-tts-picker-ia.md.

const KOKORO_LANG_FULL: Record<string, string> = { a: 'US English', b: 'UK English', e: 'Spanish', f: 'French', h: 'Hindi', i: 'Italian', j: 'Japanese', p: 'Portuguese', z: 'Chinese' };
const VOXTRAL_LANG_FULL: Record<string, string> = { en: 'US English', gb: 'UK English', fr: 'French' };
const LOCALE_LANG: Record<string, string> = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ja: 'Japanese', zh: 'Chinese' };
// Display order for language groups: Kokoro's own prefix order, then Voxtral's, then
// anything else falls to alphabetical (locale-keyed engines like MAI).
const LANG_ORDER = ['a', 'b', 'e', 'f', 'h', 'i', 'j', 'p', 'z', 'en', 'gb', 'fr'];

export type VoiceMeta = { langKey?: string; langLabel?: string; gender?: 'F' | 'M'; name: string };

/** Structure a voice id carries, derived from its SHAPE for the picker's grouping +
 *  gender badge. `name` is the display name with any language/locale prefix stripped
 *  (so a language group can show "Heart" instead of "Heart · US"); `langKey`/
 *  `langLabel` are set only when the id encodes a language; `gender` is resolved from
 *  the id (Kokoro/Zonos) or the engine's curated `voiceGenders` map, and is absent
 *  when unknown. A bare-name id with no mapped gender returns just `{ name }`. */
export function voiceMeta(modelId: string, voiceId: string): VoiceMeta {
	const engine = engineForModel(modelId);
	const id = voiceId || '';
	// Gender: structural from the id where the engine encodes it (Kokoro, Zonos —
	// handled inline below); otherwise the catalog's curated, provider-sourced
	// voiceGenders map (Gemini/Grok/Orpheus/Voxtral/MAI); otherwise unknown.
	const mapped = (engine ? ENGINES[engine]?.voiceGenders?.[id] : undefined) || undefined;

	const k = /^([abefhijpz])([fm])_(\w+)$/.exec(id);
	if (engine === 'kokoro' && k && KOKORO_LANG_FULL[k[1]]) {
		return { langKey: k[1], langLabel: KOKORO_LANG_FULL[k[1]], gender: k[2] === 'f' ? 'F' : 'M', name: titleCase(k[3]) };
	}
	// Zonos spells gender out in the id ("american_female" / "british_male").
	const z = /_(female|male)$/i.exec(id);
	if (z && (engine === 'zonos-transformer' || engine === 'zonos-hybrid')) {
		return { gender: z[1].toLowerCase() === 'female' ? 'F' : 'M', name: prettyVoiceLabel(id) };
	}
	const vx = /^(en|gb|fr)_(\w+?)(?:_(\w+))?$/i.exec(id);
	if (engine === 'voxtral' && vx && VOXTRAL_LANG_FULL[vx[1].toLowerCase()]) {
		const key = vx[1].toLowerCase();
		return { langKey: key, langLabel: VOXTRAL_LANG_FULL[key], gender: mapped, name: titleCase(vx[2]) + (vx[3] ? ` (${vx[3]})` : '') };
	}
	const loc = /^([a-z]{2})-([A-Z]{2})-([^:]+)/.exec(id);
	if (loc) {
		const langName = LOCALE_LANG[loc[1]] || loc[1].toUpperCase();
		return { langKey: `${loc[1]}-${loc[2]}`, langLabel: `${langName} · ${loc[2]}`, gender: mapped, name: titleCase(loc[3]) };
	}
	return { gender: mapped, name: prettyVoiceLabel(id) };
}

/** The curated top voices for a model — the catalog's `featuredVoices`, or its
 *  `cachedVoices` when none is declared (a small-roster engine is its own highlight),
 *  or `[]` for an uncataloged model. */
export function featuredVoiceIds(modelId: string): string[] {
	const engine = engineForModel(modelId);
	const def = engine ? ENGINES[engine] : undefined;
	if (!def) return [];
	return def.featuredVoices?.length ? def.featuredVoices : def.cachedVoices;
}

export type VoiceRow = { id: string; label: string; gender?: 'F' | 'M' };
export type VoiceGroup = { key: string; label: string; voices: VoiceRow[] };

/** Turn a flat live roster into the picker's IA: a ★ Featured highlight (in the
 *  catalog's declared order) plus grouped remainder — one group per language where
 *  the ids encode it, otherwise a single "All voices" list. Featured voices are NOT
 *  repeated in the groups below (no duplicate rows). Pure + fs-free, so it unit-tests
 *  and runs in the browser bundle identically. */
export function groupVoices(modelId: string, voices: Voice[]): { featured: VoiceRow[]; groups: VoiceGroup[] } {
	const byId = new Map(voices.map((v) => [v.id, v]));
	const featuredIds = featuredVoiceIds(modelId).filter((id) => byId.has(id));
	const featuredSet = new Set(featuredIds);
	const featured: VoiceRow[] = featuredIds.map((id) => ({ id, label: (byId.get(id) as Voice).label, gender: voiceMeta(modelId, id).gender }));

	const rest = voices.filter((v) => !featuredSet.has(v.id));
	const hasLang = rest.some((v) => voiceMeta(modelId, v.id).langKey);
	const groups: VoiceGroup[] = [];
	if (hasLang) {
		const byLang = new Map<string, VoiceGroup>();
		for (const v of rest) {
			const m = voiceMeta(modelId, v.id);
			const key = m.langKey ?? '_other';
			const label = m.langLabel ?? 'Other';
			if (!byLang.has(key)) byLang.set(key, { key, label, voices: [] });
			(byLang.get(key) as VoiceGroup).voices.push({ id: v.id, label: m.name || v.label, gender: m.gender });
		}
		const ordered = [...byLang.values()].sort((a, b) => {
			const ia = LANG_ORDER.indexOf(a.key);
			const ib = LANG_ORDER.indexOf(b.key);
			if (ia !== -1 && ib !== -1) return ia - ib;
			if (ia !== -1) return -1;
			if (ib !== -1) return 1;
			return a.label.localeCompare(b.label);
		});
		for (const g of ordered) {
			g.voices.sort((a, b) => a.label.localeCompare(b.label));
			groups.push(g);
		}
	} else if (rest.length) {
		groups.push({ key: 'all', label: 'All voices', voices: rest.map((v) => ({ id: v.id, label: v.label, gender: voiceMeta(modelId, v.id).gender })).sort((a, b) => a.label.localeCompare(b.label)) });
	}
	return { featured, groups };
}
