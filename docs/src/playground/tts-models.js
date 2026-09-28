// Facts about OpenRouter speech models that more than one module needs, kept in a leaf
// module so the light importers (the voice catalog, the export panel) do not pull in
// voice-model.js, which the Studio loads lazily. Plain, node-safe JS, no imports.

// The whole Gemini TTS family answers PCM only — measured 2026-09-27 on
// google/gemini-3.8-flash-tts: `response_format:"mp3"` → 400 "Gemini TTS only supports
// response_format=\"pcm\"". Matching the family, not a list, covers the next release too.
const GEMINI_TTS = /^google\/gemini-[\w.-]*-tts(?:-[\w.-]+)?(?::[\w-]+)?$/i;

/** True for a Gemini speech model (PCM-only on OpenRouter), including a `:free` variant. */
export function isGeminiTtsModel(model) {
	return GEMINI_TTS.test(String(model || ''));
}
