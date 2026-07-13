// The Drawing Board — the VoiceModel adapter (the read-aloud voice ladder).
//
// Twin of architect-model.js: one interface, rungs behind capability/connection
// detection. This adapter is a BYTE SOURCE — it synthesizes audio BYTES and never
// branches on the rung for the caller; every public call always resolves (falling
// through to a silent/null floor), so a missing voice degrades to "no audio"
// rather than breaking the surface. Playback belongs to the caller (the Suono
// library) — this module no longer owns a WebAudio context or plays anything. The
// voice never owns correctness; it only produces bytes for text the caller has.
//
//   openrouter-tts (hosted, BYO key)  →  kokoro (in-browser WASM/WebGPU, shipped)
//     →  speechSynthesis (DEV/TEST ONLY)  →  silent (the floor)
//
// `speechSynthesis` is the per-device lottery we explicitly ban in production —
// it is reachable only behind a dev flag (or an explicit `allowBrowserVoice`
// opt-in a demo surface passes), for prototyping the UX and for the /cadenza
// reference page's keyless fallback. See
// engineering/decisions/2026-06-14-read-aloud-kokoro.md.
//
// Sibling render-path note: this is docs-only (the Drawing Board); it does not
// touch the three engine render paths.
//
// Node-loadable by DESIGN: test/unit/playground/voice-model.test.js imports this
// module under plain `node --test` (no Vite alias, no TS resolution), so this file
// must not use the `@/…` alias or import a TypeScript module.

// CDN entrypoint for the in-browser engine (no npm dep; loaded on demand the
// first time the user summons the local voice). Mirrors architect-model.js.
const KOKORO_URL = 'https://esm.run/kokoro-js';
const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
// Cloud voice = OpenRouter's dedicated TTS endpoint (/api/v1/audio/speech), the
// OpenAI-compatible speech route. It takes { model, input, voice, response_format }
// and returns a RAW audio byte stream (mp3) — NOT a chat message with base64 deltas.
// (An earlier version wrongly went through chat-completions with a non-TTS model, so
// no audio ever came back.) CORS-enabled for the browser, authenticated with the SAME
// key the architect model already holds.
// Docs: https://openrouter.ai/docs/guides/overview/multimodal/tts
// TTS models: https://openrouter.ai/api/v1/models?output_modalities=speech
const OR_SPEECH_URL = 'https://openrouter.ai/api/v1/audio/speech';

// Voices are MODEL-specific (OpenAI-style alloy/nova only work with an OpenAI TTS
// model; Kokoro uses its own af_*/am_* ids). The default is hosted Kokoro — by far
// the cheapest OpenRouter speech model (~$0.62/M chars vs mai-voice-2's $22/M) and,
// unlike the on-device Kokoro rung, it needs no 80 MB download so it works on mobile.
// `af_heart` is the same Kokoro voice the on-device rung defaults to. Both overridable
// via the localStorage prefs below.
const DEFAULT_OR_TTS_MODEL = 'hexgrad/kokoro-82m';
const DEFAULT_OR_VOICE = 'af_heart';
const DEFAULT_KOKORO_VOICE = 'af_heart';

// The fixed sample line every "Play sample" preview speaks — pulled out as a
// constant so previewVoice's cache key and its synth call can't drift apart.
const PREVIEW_TEXT = 'This is how your slides will sound.';

// OpenRouter pricing strings are per-character (TTS) USD; convert to per-MILLION,
// same convention + edge cases as architect-model.js's orPricePerM twin (kept as a
// tiny local copy, not an import — this file must stay plain-Node-loadable with no
// dependency on architect-model.js's larger, browser-leaning import graph. See the
// Node-loadable-by-design note at the top of this file).
function orPricePerM(raw) {
  if (raw == null || (typeof raw === 'string' && raw.trim() === '')) return null;
  const n = Number(raw) * 1e6;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// The OpenRouter TTS-capable model catalog — public + unauthenticated, same shape
// contract as architect-model.js's chat-model listModels(): id/name/pricing, PLUS
// `voices` — the model's published `supported_voices` array straight off the live
// catalog response. This is the single source of truth for every voice dropdown
// (docs/src/components/studio/tts-voice-catalog.ts derives from it) — no more
// hand-curated, doc-scraped rosters that can silently drift from what the model
// actually supports (the "zoe" lesson: a hand-typed list can include a voice that
// doesn't work; a live-sourced one can't include one OpenRouter doesn't publish).
// Memoized for the session (a settings-panel open shouldn't refetch); never throws
// — an empty array on any failure, same degrade-gracefully contract as every other
// catalog fetch in this codebase.
const OR_TTS_CATALOG_URL = 'https://openrouter.ai/api/v1/models?output_modalities=speech';
let ttsCatalogPromise = null;
export function listOpenRouterVoiceModels() {
  if (!ttsCatalogPromise) {
    ttsCatalogPromise = (async () => {
      try {
        const res = await fetch(OR_TTS_CATALOG_URL);
        if (!res.ok) return [];
        const j = await res.json();
        return (j.data || []).map((m) => ({
          id: m.id,
          name: m.name || m.id,
          promptPerM: m.pricing ? orPricePerM(m.pricing.prompt) : null,
          completionPerM: m.pricing ? orPricePerM(m.pricing.completion) : null,
          voices: Array.isArray(m.supported_voices) ? m.supported_voices : [],
        }));
      } catch {
        return [];
      }
    })();
  }
  return ttsCatalogPromise;
}

// localStorage prefs — namespaced by `keyPrefix` (default 'db', the Drawing
// Board's original namespace) so the Studio can pass 'studio' and get its OWN
// voice prefs instead of silently sharing the Drawing Board's. See
// engineering/decisions/2026-07-09-studio-cloud-ondevice-config-split.md.
const voiceKeys = (prefix) => ({
  RUNG: `lattice-${prefix}-voice-rung`, // 'auto' | 'openrouter' | 'kokoro' | 'off'
  OR_VOICE: `lattice-${prefix}-voice-or`,
  OR_TTS_MODEL: `lattice-${prefix}-voice-or-model`,
  KOKORO_VOICE: `lattice-${prefix}-voice-kokoro`,
  DEV_SPEECH: `lattice-${prefix}-voice-dev-speech`, // '1' opts into the banned rung
  SPEED: `lattice-${prefix}-voice-speed`, // a multiplier, e.g. '1.25'; unset = 1
});

const hasWindow = typeof window !== 'undefined';

function readLS(k) { try { return localStorage.getItem(k); } catch { return null; } }
function writeLS(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }

export function detectWebGPU() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

// Coarse pointer ≈ phone/tablet. A MAIN-THREAD Kokoro load (onnxruntime + ~80 MB)
// spikes memory enough to OOM-reload a mobile tab — the very bug the same-origin
// worker fixes. So on mobile we NEVER fall back to the main-thread loader: if the
// worker can't load, we surface the error and the user falls to the cloud voice.
function coarsePointer() {
  return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
}

// Is the Kokoro model already on disk? transformers.js (under kokoro-js) caches the
// weights in Cache Storage, the SAME signal the Settings drawer reads to list
// "Downloaded on this device". The Practice button used to ask only whether the
// model was loaded INTO MEMORY (isReady), so a cached-but-not-yet-loaded model
// showed a misleading "download ~80 MB" glyph. This lets the UI say "ready"
// (pressing just loads from cache, fast) instead. Best-effort + never throws.
export async function detectKokoroCached() {
  try {
    if (typeof caches === 'undefined') return false;
    for (const cn of await caches.keys()) {
      if (!/transformers|onnx|hugging|xet|model/i.test(cn)) continue;
      const cache = await caches.open(cn);
      for (const req of await cache.keys()) {
        if (/Kokoro-82M/i.test(req.url)) return true;
      }
    }
    return false;
  } catch { return false; }
}

// ── Sentence segmentation ─────────────────────────────────────────────────────
// Narration is spoken sentence-by-sentence so we get low time-to-first-audio,
// can abort mid-note the instant the user navigates, and (later) insert
// pause-beat silences between sentences. Pure + deterministic → unit-tested.
//
// This MIRRORS Cadenza's canonical splitSentences (docs/src/lib/cadenza/segment.ts)
// exactly — a deliberate LOCAL COPY, not an import, because this module must stay
// node-loadable (no `@/` alias / TS import; see the file header). A cross-check test
// pins the two byte-identical so they can't drift. Break AFTER a terminator (.!?…)
// followed by whitespace (lookbehind), so a mid-token dot ($4.2M, 3.5x) never splits.
//
// A caller that must keep the spoken sentences in lockstep with a caption engine's
// cues can still pass that engine's own split via speak({ sentences }); with the two
// splitters identical it's belt-and-suspenders, not a correctness requirement.
export function splitSentences(text) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return [];
  return s.split(/(?<=[.!?…])\s+/).map((p) => p.trim()).filter(Boolean);
}

// ── Audio cache (skip a re-synth when replaying an unchanged sentence — e.g.
// navigating back to a slide already read aloud this session, or re-sampling a
// voice already previewed) ────────────────────────────────────────────────────
//
// Keyed on EVERYTHING that changes the resulting audio bytes: which rung, which
// MODEL (OpenRouter serves multiple TTS models via one rung; Kokoro's on-device
// model is fixed today but included for symmetry — a second on-device model
// later can't silently share a cache entry with this one), voice, speed, and
// the sentence text itself. A stale cache hit — replaying yesterday's voice
// after switching models — would be a worse bug than no caching at all, so
// every one of those five must be in the key, not just the text.
//
// `JSON.stringify` of the tuple is the key, not manual delimiter-joining — a
// hand-picked separator character risks colliding with real authored text (an
// earlier draft of this used a literal space, which of course appears in
// every sentence); JSON.stringify escapes quotes/backslashes internally so
// the tuple boundary can never be forged by the text itself. No real hash
// needed either: Map equality is exact-string, and a cryptographic digest
// only earns its keep when persisting to a fixed-key-length store, which
// this doesn't (in-memory, cleared on reload — the deck's spoken audio
// isn't worth persisting across sessions the way the ~80 MB Kokoro MODEL
// weights are, see detectKokoroCached above).
function cacheKeyFor(rungName, modelId, voice, speed, text) {
  return JSON.stringify([rungName, modelId || '', voice || '', speed, text]);
}

// A small FIFO cap so a very long deck / long session can't grow this
// unbounded. Deliberately simple (insertion order, no access-time tracking) —
// eviction here is a safety net, not a hit-rate optimization: a typical
// session's real working set (a few dozen sentences × one voice/model/speed
// combo at a time) sits well under this.
const AUDIO_CACHE_LIMIT = 200;

// warm()'s prefetch cap. Bounded, not unbounded fire-all: a long deck shouldn't
// spike into dozens of simultaneous OpenRouter requests (rate limit / cost /
// wasted work if the listener navigates away seconds in). Kept small — warm-ahead
// only needs to win the race for the NEXT slide's first sentence or two before the
// transition arrives, so it doesn't look like a burst attack on the API.
const WARM_CONCURRENCY = 1;

// ── WAV encode (Kokoro returns Float32 PCM; OpenRouter returns MP3) ────────────
// Unify playback on one <audio> element by encoding Kokoro's raw samples into a
// 16-bit PCM WAV Blob. Pure → unit-tested for header correctness.
export function wavBlob(samples, sampleRate) {
  const f32 = samples instanceof Float32Array ? samples : Float32Array.from(samples || []);
  const n = f32.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);
  const wstr = (off, str) => { for (let i = 0; i < str.length; i++) dv.setUint8(off + i, str.charCodeAt(i)); };
  wstr(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); wstr(8, 'WAVE');
  wstr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  wstr(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, f32[i]));
    dv.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return typeof Blob !== 'undefined' ? new Blob([buf], { type: 'audio/wav' }) : buf;
}

// A model whose OpenRouter speech endpoint 400s on response_format:"mp3" and
// only returns raw PCM (live-verified 2026-07-11: google/gemini-3.1-flash-tts-
// preview). Kept as a tiny local fact rather than read from
// tts-voice-catalog.json's `audioFormat` field, for the same node-loadable-by-
// design reason as orPricePerM/splitSentences above (this file must not import
// JSON needing bundler resolution — see the file header). Mirrors
// tools/generate-voice-samples.mjs's synth()/pcmToWav() byte-for-byte; keep the
// two in sync if a second PCM-only model ever needs one — EXPORTED so
// test/unit/playground/voice-model.test.js can assert this Set never drifts
// from the catalog's own audioFormat:"wav" entries (red-team finding,
// 2026-07-11): unlike the voice roster, this ISN'T live-sourced, so nothing
// else catches a mismatch except that test.
export const PCM_ONLY_MODELS = new Set(['google/gemini-3.1-flash-tts-preview']);

// Wraps raw 16-bit PCM bytes in a standard 44-byte WAV header, reading the real
// sample rate/channels off the response's own Content-Type header (e.g.
// "audio/pcm;rate=24000;channels=1") rather than assuming one — a per-model
// quirk, not a universal constant. Browser twin of generate-voice-samples.mjs's
// pcmToWav()/parsePcmContentType() (that one writes a Node Buffer to disk; this
// one hands back a blob-LIKE object — {size, type, arrayBuffer()} — the consumer
// (Suono) can decode directly, same header layout). Deliberately NOT a real `Blob`:
// this codebase's own rung mocks (voice-model.test.ts) always use this exact duck-
// typed shape rather than a real Blob, because jsdom's Blob has no `.arrayBuffer()`
// method — matching that shape here keeps production and tests on one shape, and it
// avoids an extra Blob-wrap/unwrap round trip that buys nothing (the bytes are
// already an ArrayBuffer). A real Blob works fine in every real browser target too,
// if a future caller needs one — this just isn't that caller.
function pcmBlobFromResponse(pcmBytes, contentType) {
  const rate = Number(/rate=(\d+)/.exec(contentType || '')?.[1]) || 24000;
  const channels = Number(/channels=(\d+)/.exec(contentType || '')?.[1]) || 1;
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = rate * blockAlign;
  const n = pcmBytes.length;
  const buf = new ArrayBuffer(44 + n);
  const dv = new DataView(buf);
  const wstr = (off, str) => { for (let i = 0; i < str.length; i++) dv.setUint8(off + i, str.charCodeAt(i)); };
  wstr(0, 'RIFF'); dv.setUint32(4, 36 + n, true); wstr(8, 'WAVE');
  wstr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, channels, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, byteRate, true); dv.setUint16(32, blockAlign, true); dv.setUint16(34, bitsPerSample, true);
  wstr(36, 'data'); dv.setUint32(40, n, true);
  new Uint8Array(buf, 44).set(pcmBytes);
  // `arrayBuffer()` returns a FRESH COPY (`.slice(0)`) on every call, not the
  // closed-over `buf` itself — the consumer's `decodeAudioData` (Suono) DETACHES
  // whatever ArrayBuffer it's given (a real, spec'd side effect, not a bug in this
  // codebase), and this blob-like object is cached (audioCache) and REPLAYED —
  // "Play sample" clicked twice, or the same narration sentence spoken again.
  // Handing back the same `buf` reference every time meant the first play decoded
  // fine and every replay threw "Cannot decode detached ArrayBuffer" — caught live
  // in a real browser. A real Blob's own `.arrayBuffer()` already re-reads fresh
  // bytes per call for exactly this reason; `.slice(0)` gives this duck-typed
  // stand-in the same replay safety.
  return { size: buf.byteLength, type: 'audio/wav', arrayBuffer: async () => buf.slice(0) };
}

// ── Rungs ─────────────────────────────────────────────────────────────────────
//
// A blob rung is { name, ready(), synth({text, voice, signal}) → Promise<Blob> }.
// The adapter owns rung SELECTION + byte caching; rungs produce audio bytes and the
// CALLER (Suono) plays them — this module no longer owns playback. speechSynthesis
// is special-cased (it plays itself); silent is the floor (produces nothing).

// OpenRouter TTS — a fetch on the architect's existing OAuth key. Deck text leaves
// the device (gated by the same consent the architect connect flow already takes).
function openRouterRung({ getKey, getModel, getVoice, fetchImpl }) {
  const referer = () => (typeof location !== 'undefined' ? location.origin : 'https://lattice.dev');
  return {
    name: 'openrouter-tts',
    ready() { return !!getKey(); },
    // `model`, if given, overrides the persisted "active" model for THIS call
    // only (never writes it) — the escape hatch previewVoice() needs to
    // audition a model-picker ROW that isn't selected yet (bug: 2026-07-09-
    // studio-cloud-ondevice-config-split.md's "model-row-preview" follow-up).
    // speak()'s own narration path never passes this — it always narrates the
    // one active model — so `getModel()` remains its only source, unaffected.
    async synth({ text, voice, signal, speed, model: modelOverride }) {
      const key = getKey();
      if (!key) throw new Error('OpenRouter not connected');
      const model = modelOverride || getModel();
      const wantsPcm = PCM_ONLY_MODELS.has(model);
      // OpenAI-compatible speech route: POST the text, get a raw audio byte stream
      // back (mp3 for almost every model; PCM for the rare exception above, wrapped
      // into a WAV Blob below so the consumer's decodeAudioData (Suono) can play it).
      // `speed` is an optional multiplier (default 1.0); a model that doesn't
      // support it silently ignores it rather than erroring (live-verified per
      // model — see tts-voice-catalog.json's speedSupport/_speedNote — so passing
      // it is always safe even though it's a no-op for most of these 9 models).
      const res = await (fetchImpl || fetch)(OR_SPEECH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + key,
          'HTTP-Referer': referer(),
          'X-Title': 'Lattice Drawing Board',
        },
        body: JSON.stringify({
          model,
          input: text,
          voice: voice || getVoice(),
          response_format: wantsPcm ? 'pcm' : 'mp3',
          ...(speed && speed !== 1 ? { speed } : {}),
        }),
        signal,
      });
      if (!res.ok) {
        // Surface the API's reason (bad model slug, unknown voice, no credit) instead
        // of a silent fall-through — the only way to diagnose without the console.
        let detail = ''; try { detail = (await res.text()).slice(0, 200); } catch {}
        throw new Error('OpenRouter TTS error ' + res.status + (detail ? ': ' + detail : ''));
      }
      if (wantsPcm) {
        const contentType = res.headers.get('content-type') || '';
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (!bytes.length) throw new Error('OpenRouter returned empty audio');
        return pcmBlobFromResponse(bytes, contentType);
      }
      const blob = await res.blob();
      if (!blob?.size) throw new Error('OpenRouter returned empty audio');
      return blob; // mp3; the consumer's decodeAudioData (Suono) handles it
    },
  };
}

// Kokoro in-browser rung. Prefers a SAME-ORIGIN module Worker (see kokoro-worker.js
// — that origin is what lets iOS run synthesis off the main thread); falls back to
// main-thread synthesis only if the Worker can't be constructed at all. Loaded only
// when summoned (the deliberate ~80 MB download), like the WebLLM/universal tiers.
function kokoroRung({ getVoice }) {
  let worker = null;
  let isReady = false;
  let mainLib = null; // main-thread fallback
  let mainTts = null;
  let nextId = 1;
  const pending = new Map();
  let onLoaded = null;
  let onLoadErr = null;
  let onProg = null;

  function dtypeAndDevice() {
    // On-device Kokoro is desktop-only (see kokoroSupported); desktop with a GPU
    // gets full-quality fp32/WebGPU, otherwise q8 on wasm.
    return detectWebGPU() ? { dtype: 'fp32', device: 'webgpu' } : { dtype: 'q8', device: 'wasm' };
  }

  function makeWorker() {
    if (worker) return worker;
    // Vite emits this as a hashed, SAME-ORIGIN asset (not a blob:), so the worker's
    // runtime cross-origin import() of kokoro-js is permitted on Safari/iOS.
    worker = new Worker(new URL('./kokoro-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === 'progress') onProg?.({ progress: (d.progress || 0) / 100, text: d.file, status: d.status });
      else if (d.type === 'loaded') { isReady = true; onLoaded?.(true); }
      else if (d.type === 'load-error') onLoadErr?.(new Error(d.error || 'load failed'));
      else if (d.type === 'audio') { const p = pending.get(d.id); pending.delete(d.id); p?.resolve?.(wavBlob(d.samples, d.rate)); }
      else if (d.type === 'gen-error') { const p = pending.get(d.id); pending.delete(d.id); p?.reject?.(new Error(d.error || 'synthesis failed')); }
    };
    worker.onerror = (ev) => onLoadErr?.(new Error(ev.message || 'worker error'));
    return worker;
  }

  async function loadMain(onProgress) {
    mainLib = await import(/* @vite-ignore */ KOKORO_URL);
    const KokoroTTS = mainLib.KokoroTTS || mainLib.default?.KokoroTTS;
    const { dtype, device } = dtypeAndDevice();
    mainTts = await KokoroTTS.from_pretrained(KOKORO_MODEL, {
      dtype, device,
      progress_callback: (p) => onProgress?.({ progress: (p?.progress || 0) / 100, text: p?.file || p?.status, status: p?.status }),
    });
    isReady = true;
  }

  return {
    name: 'kokoro',
    ready() { return isReady; },
    async load(onProgress, signal) {
      const { dtype, device } = dtypeAndDevice();
      try { makeWorker(); } catch (e) {
        if (coarsePointer()) throw e; // never OOM the main thread on a phone
        await loadMain(onProgress); return true;
      }
      onProg = onProgress;
      try {
        await new Promise((resolve, reject) => {
          onLoaded = resolve; onLoadErr = reject;
          worker.postMessage({ type: 'load', url: KOKORO_URL, model: KOKORO_MODEL, dtype, device });
          if (signal) signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
        return true;
      } catch (e) {
        if (String(e?.message) === 'aborted') throw e;
        try { worker.terminate(); } catch {}
        worker = null;
        // On mobile the main-thread fallback is the exact OOM-reload we're avoiding
        // — surface the failure (the UI offers cloud / retry) instead.
        if (coarsePointer()) throw e;
        await loadMain(onProgress);
        return true;
      }
    },
    // `speed` is a native kokoro-js generate() option (like the cloud rung's OpenRouter
    // `speed` param) — real phoneme-duration pacing, not a client-side playback-rate hack.
    async synth({ text, voice, signal, speed }) {
      if (!isReady) throw new Error('Kokoro not summoned');
      const v = voice || getVoice();
      if (worker) {
        const id = nextId++;
        return new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject });
          worker.postMessage({ type: 'generate', id, text, voice: v, speed });
          if (signal) signal.addEventListener('abort', () => { pending.delete(id); reject(new Error('aborted')); }, { once: true });
        });
      }
      const audio = await mainTts.generate(text, { voice: v, ...(speed && speed !== 1 ? { speed } : {}) });
      return wavBlob(audio.audio, audio.sampling_rate);
    },
  };
}

// The BREATH inserted between one sentence's clip and the next — sized from the
// sentence's trailing punctuation. A clocked voice plays each sentence's clip back to
// back, so without a gap the narration rushes ("no time to breathe"). But the clip ALSO
// already carries its own sentence-final silence, so the AUDIO gap is only a fraction of
// the caption estimate's pause. These values are cadenza's graded PAUSE_MS (cadence.ts:
// comma 200 / clause 350 / sentence 550 / ellipsis 650) × 0.3 — the CLIP-SILENCE DISCOUNT.
// This is a DELIBERATE second copy of the ratio, not the same table: voice-model.js is
// node-loadable with no `@/` alias or TS import (see the file header), so it structurally
// CANNOT import cadence.ts — the two must be kept in step by hand. The ratio (breath ≤
// estimate pauseAfter) is what makes it race-SAFE: the estimate re-anchors the next
// sentence to `realEnd + gap`, and any `gap ≤ estimate pauseAfter` leaves the highlight
// resting in the silence rather than racing into it (only a LARGER gap reintroduces the
// race). A cross-file test pins `SENTENCE_PAUSE_MS[k] ≤ pauseAfter(k)` so the copies can't
// silently drift. A sentence with no terminator gets no breath.
export const SENTENCE_PAUSE_MS = { ',': 60, ';': 105, ':': 105, '.': 165, '!': 165, '?': 165, '…': 195 };

// ── The adapter ───────────────────────────────────────────────────────────────

// NOTE: no `= false`/`= 'db'` default on any destructured param here — a defaulted
// binding makes tsc (checkJs) infer the param type as ONLY the properties that HAVE
// a default (e.g. `{ keyPrefix?: string }`), which drops getOpenRouterKey and breaks
// every typed caller (read-aloud.ts, architect.ts's Studio bridge). Default inside
// the body instead — `=== true` / `|| 'db'` below are already correct for undefined,
// so an inline default is unnecessary anyway.
export function createVoiceModel({ getOpenRouterKey, getSettings, fetchImpl, allowBrowserVoice, keyPrefix } = {}) {
  const settings = () => (getSettings ? getSettings() : {}) || {};
  const getKey = () => (getOpenRouterKey ? getOpenRouterKey() : null) || null;
  const K = voiceKeys(keyPrefix || 'db');

  const rungPref = () => readLS(K.RUNG) || 'auto';
  const orVoice = () => readLS(K.OR_VOICE) || DEFAULT_OR_VOICE;
  const orModel = () => readLS(K.OR_TTS_MODEL) || DEFAULT_OR_TTS_MODEL;
  const kokoroVoice = () => readLS(K.KOKORO_VOICE) || DEFAULT_KOKORO_VOICE;
  // A speed multiplier both rungs forward natively (OpenRouter's API param; Kokoro's
  // own generate() option) — not a client-side playbackRate hack. 1 = default pace,
  // omitted from the wire request (see openRouterRung.synth / kokoroRung.synth).
  const speedPref = () => { const v = Number(readLS(K.SPEED)); return Number.isFinite(v) && v > 0 ? v : 1; };
  // The banned rung is reachable only when a dev opts in (localStorage / settings)
  // OR a caller explicitly passes `allowBrowserVoice` — the escape hatch for a
  // surface that WANTS the device-lottery voice as its keyless fallback (today only
  // the /cadenza reference page, to let a visitor hear the read-along without a key).
  // Off by default, so the production Playground read-aloud stays silent-floored per
  // engineering/decisions/2026-06-14-read-aloud-kokoro.md.
  const allowSpeech = () => allowBrowserVoice === true || readLS(K.DEV_SPEECH) === '1' || settings().voiceDevSpeech === true;

  const openrouter = openRouterRung({ getKey, getModel: orModel, getVoice: orVoice, fetchImpl });
  const kokoro = kokoroRung({ getVoice: kokoroVoice });
  let injected = null; // test hook

  // This instance's audio cache — scoped per createVoiceModel() call (per
  // keyPrefix), matching the existing Studio/Drawing-Board pref isolation
  // (2026-07-09-studio-cloud-ondevice-config-split.md) rather than sharing one
  // cache across surfaces.
  const audioCache = new Map(); // cacheKeyFor(...) → Blob
  function cacheSet(key, blob) {
    if (!audioCache.has(key) && audioCache.size >= AUDIO_CACHE_LIMIT) {
      const oldest = audioCache.keys().next().value;
      if (oldest !== undefined) audioCache.delete(oldest);
    }
    audioCache.set(key, blob);
  }
  // In-flight synth de-dup: two IDENTICAL sentences scheduled in the same
  // concurrency batch (a slide repeating a phrase across two bullets) used to
  // both miss `audioCache` and fire independent real requests, since the
  // cache only gets populated once a request RESOLVES. Joining an already
  // in-flight request for the SAME key fixes that for free. Stores `sig`
  // alongside the promise so a joiner can tell "this entry belongs to a call
  // that's already been stopped/aborted" from "genuinely still in flight" —
  // without that check, a barge-in (a new speak() stopping a prior one, then
  // immediately requesting the SAME text) could join the OLD call's
  // about-to-resolve-null promise instead of firing its own fresh request:
  // `stop()` sets `sig.aborted` SYNCHRONOUSLY, but the promise chain reacting
  // to that abort only settles (and cleans up its map entry) on a LATER
  // microtask — so the new call's synchronous scheduling would otherwise see
  // a stale, doomed entry still sitting in the map.
  const inFlightSynths = new Map(); // cacheKeyFor(...) → { promise, sig }
  // The MODEL id for a given rung name — only OpenRouter's rung varies by model
  // (Kokoro's on-device model is fixed); anything else (mock/injected/
  // speechSynthesis) has no model concept, so it's simply excluded from the key.
  function modelIdFor(rungName) {
    if (rungName === 'openrouter-tts') return orModel();
    if (rungName === 'kokoro') return KOKORO_MODEL;
    return '';
  }

  // Is Kokoro on disk? Probed async (Cache Storage) and cached here so the
  // synchronous availability() the button reads can distinguish "downloaded but not
  // loaded" from "never downloaded". Probed once on creation; re-probed after a
  // summon or a Settings "Remove models".
  let kokoroCachedFlag = false;
  async function probeKokoroCache() {
    kokoroCachedFlag = await detectKokoroCached();
    emitChange();
    return kokoroCachedFlag;
  }
  if (hasWindow) probeKokoroCache();

  const silentRung = { name: 'silent', ready() { return true; }, async synth() { return null; } };
  const speechReady = () => typeof speechSynthesis !== 'undefined' && allowSpeech();
  // On-device Kokoro is DESKTOP-ONLY for now. On a phone/tablet the ~80 MB
  // onnxruntime load is the unreliable, memory-heavy path on Safari/iOS, so we
  // don't offer it there — mobile uses the cloud voice. A coarse pointer (no mouse)
  // is the proxy for phone/tablet; the cloud voice works on every device.
  const kokoroSupported = () => !coarsePointer();

  function pickRung() {
    if (rungPref() === 'off') return silentRung;
    if (injected) return injected;
    if (rungPref() === 'openrouter' && openrouter.ready()) return openrouter;
    if (rungPref() === 'kokoro' && kokoroSupported() && kokoro.ready()) return kokoro;
    // auto ladder: connected cloud → summoned local (desktop only) → (dev) speech → silent.
    if (openrouter.ready()) return openrouter;
    if (kokoroSupported() && kokoro.ready()) return kokoro;
    if (speechReady()) return { name: 'speechSynthesis' };
    return silentRung;
  }

  // synthOne — synthesize ONE sentence to audio BYTES, the byte SOURCE for an EXTERNAL player (the
  // Studio read-aloud's Suono sequence, which owns the AudioContext + scheduler + clock). It picks the
  // active rung, uses this instance's shared byte cache + in-flight dedup, and PLAYS NOTHING (no
  // AudioContext here). Returns `{ rung, bytes, key }`:
  //   • rung  — the active rung name, so the caller decides how to play: a blob rung → decode+play the
  //             bytes on its own clock; 'speechSynthesis' → the caller drives speakThis() (that rung
  //             plays itself, no bytes — it can't cross a bytes-only player); 'silent' → nothing.
  //   • bytes — a Blob/blob-like for a blob rung; null for silent / speechSynthesis / empty text.
  //   • key   — the exact cache key, handed back so the caller's own decoded-buffer cache can share
  //             this identity (Suono's `keyOf`), and so a warm/replay lines up bit-for-bit.
  // Uses this instance's shared byte cache + in-flight dedup with the same timeout discipline warm()
  // applies; playback is the caller's (Suono's) job.
  async function synthOne({ text, voice, speed, signal } = {}) {
    const rung = pickRung();
    const effSpeed = speed ?? speedPref();
    // Mirror each rung's own `voice || getVoice()` fallback EXACTLY (|| not ??) — see speak()'s
    // effVoiceFor note for why a `??` mirror would freeze a stale-voice cache key.
    const effVoice = voice || (rung.name === 'openrouter-tts' ? orVoice() : rung.name === 'kokoro' ? kokoroVoice() : '');
    const key = cacheKeyFor(rung.name, modelIdFor(rung.name), effVoice, effSpeed, text);
    if (!text || rung.name === 'silent' || rung.name === 'speechSynthesis') {
      return { rung: rung.name, bytes: null, key };
    }
    const cached = audioCache.get(key);
    if (cached) return { rung: rung.name, bytes: cached, key };
    // Join an in-flight request for this key — unless it belongs to an already-aborted call (the same
    // barge-in safety speak()'s synth() documents).
    const joined = inFlightSynths.get(key);
    if (joined && !joined.sig.aborted) return { rung: rung.name, bytes: await joined.promise, key };
    let timer;
    const p = Promise.race([
      rung.synth({ text, voice, speed: effSpeed, signal })
        .then((blob) => { if (blob) cacheSet(key, blob); return blob; })
        .catch(() => null)
        .finally(() => clearTimeout(timer)),
      new Promise((res) => { timer = setTimeout(() => res(null), 20000); }),
    ]).finally(() => { if (inFlightSynths.get(key)?.promise === p) inFlightSynths.delete(key); });
    inFlightSynths.set(key, { promise: p, sig: signal ?? new AbortController().signal });
    return { rung: rung.name, bytes: await p, key };
  }

  function speakViaSpeech(text, signal) {
    return new Promise((resolve) => {
      if (typeof speechSynthesis === 'undefined') { resolve(); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.onend = resolve; u.onerror = resolve;
      if (signal) signal.addEventListener('abort', () => { try { speechSynthesis.cancel(); } catch {} resolve(); }, { once: true });
      try { speechSynthesis.speak(u); } catch { resolve(); }
    });
  }

  // Background prefetch: populate `audioCache` for `sentences` WITHOUT playing
  // anything — the counterpart to speak()'s in-playback concurrency scheduler,
  // but for the gap ACROSS a slide boundary rather than between sentences of
  // the same slide. speak()'s SYNTH_CONCURRENCY overlap only ever runs while
  // that slide is already playing; the FIRST sentence of the NEXT slide has
  // nothing overlapping it, so autoplay chaining (Present's onFinish → next
  // slide) always paid a full cold-start synth latency at every transition —
  // exactly the gap the within-slide fix didn't reach. A caller (Present, while
  // autoplaying) calls this with the upcoming slide's sentences as soon as the
  // CURRENT slide starts, so by the time onFinish chains to it, its audio is
  // already in `audioCache` (or in flight and about to land).
  //
  // Shares `audioCache` + `inFlightSynths` with speak()'s own `synth(t)` so the
  // two can never race into duplicate requests for the same key — whichever
  // fires first, the other joins it. Best-effort only: no lastError plumbing
  // (nobody is waiting on this), no waitIfPaused/onSentence/onState (nothing to
  // report to), and a synth failure here just leaves the cache unpopulated —
  // speak() will synth it for real, for keeps, when it actually gets there.
  //
  // KNOWN, ACCEPTED DUPLICATION (Munger-inversion finding): this pump()'s
  // cache-key/dedup/timeout body is a near-copy of speak()'s own synth(t)
  // scheduler above, deliberately NOT refactored into one shared helper —
  // extracting one would mean re-touching speak()'s already independently
  // red-teamed, adversarially-verified internals for a purely cosmetic DRY
  // win, which is a worse trade than the duplication itself. The real risk
  // this creates: if a future change adds a per-call `voice` override to
  // speak()'s `effVoiceFor` (today only `orVoice()`/`kokoroVoice()`), warm()'s
  // `effVoice` here won't automatically follow it, and nothing but code
  // review would catch the two cache-key derivations drifting apart. Flagged
  // for a follow-up extraction if/when that happens, not before.
  //
  // `signal` (optional) lets a caller stop THIS call from firing any FURTHER
  // requests once it goes away — e.g. Present's autoplay effect aborts its
  // signal on cleanup (autoplay turned off, the slide advanced again before
  // this warm finished, or Present closed), so an abandoned warm doesn't keep
  // working through the rest of the upcoming slide's sentences in the
  // background (independent-checker finding: unbounded here would be the
  // same real-cost mistake speak()'s own pause-gating fix addressed
  // elsewhere in this file). Deliberately does NOT forcibly cancel a request
  // already in flight when `signal` aborts — that request's `inFlightSynths`
  // entry may by then be JOINED by a different, still-live caller (another
  // warm() for the same text, or a real speak() that reaches this sentence
  // first); tearing down the shared promise out from under a joiner who never
  // asked to abort would hand them a false failure. WARM_CONCURRENCY already
  // bounds this to at most one such already-started, left-to-finish request
  // per abandoned warm() call — a small, capped cost, not a leak.
  // WARM_CONCURRENCY is a budget for THIS VOICE-MODEL INSTANCE, not per call —
  // `warmQueue`/`warmActive` live here (createVoiceModel's scope), shared by
  // every warm() invocation, because a caller can legitimately call warm()
  // MORE THAN ONCE while earlier calls are still draining: Present's autoplay
  // effect re-fires on every `clamped` change while autoplay is on, which
  // includes a presenter manually clicking Next/Prev a few times in a row,
  // not just autoplay's own advances. A per-call-local counter (the original
  // shape here) bounded nothing ACROSS those calls — each fired its own
  // request immediately regardless of how many earlier ones were still in
  // flight, so N rapid navigation steps meant N concurrent real, billed
  // requests with no cap at all (red-team finding, empirically reproduced:
  // 5 distinct-text warm() calls fired 5 concurrent real requests). Routing
  // every call through one shared queue + one shared active-count is what
  // actually delivers the "not a burst attack on the API" property the
  // per-call WARM_CONCURRENCY cap only ever claimed to.
  const warmQueue = []; // { rung, effVoice, effSpeed, text, signal }
  let warmActive = 0;
  function pumpWarmQueue() {
    while (warmActive < WARM_CONCURRENCY && warmQueue.length) {
      const item = warmQueue.shift();
      // This item's own caller walked away before its turn came up — skip it
      // rather than spend a slot on a prefetch nobody's waiting on anymore
      // (lazy version of the old per-call "stop firing further requests").
      if (item.signal?.aborted) continue;
      const cacheKey = cacheKeyFor(item.rung.name, modelIdFor(item.rung.name), item.effVoice, item.effSpeed, item.text);
      if (audioCache.has(cacheKey)) continue;
      const inflight = inFlightSynths.get(cacheKey);
      if (inflight && !inflight.sig.aborted) continue;
      warmActive++;
      const sig = new AbortController().signal; // this request's own lifetime — never the enqueuing caller's `signal` (see warm()'s own comment)
      let timer;
      const p = Promise.race([
        item.rung.synth({ text: item.text, voice: item.effVoice, speed: item.effSpeed, signal: sig }).then((blob) => {
          if (blob) cacheSet(cacheKey, blob);
          return blob;
        }).catch(() => null).finally(() => clearTimeout(timer)),
        new Promise((res) => { timer = setTimeout(() => res(null), 20000); }),
      ]).finally(() => {
        if (inFlightSynths.get(cacheKey)?.promise === p) inFlightSynths.delete(cacheKey);
        warmActive--;
        pumpWarmQueue(); // a slot just freed — drain whatever's queued, from ANY caller
      });
      inFlightSynths.set(cacheKey, { promise: p, sig });
    }
  }
  function warm(sentences, { signal } = {}) {
    const rung = pickRung();
    // Scoped to `openrouter-tts` only (Munger-inversion finding). This whole
    // prefetch exists to hide NETWORK round-trip latency — genuinely
    // parallel HTTP requests don't compete with each other. Kokoro synthesis
    // is CPU/GPU-bound on ONE shared, effectively single-threaded resource
    // (the same-origin worker; onnxruntime-web's WASM backend has no
    // multi-threading without cross-origin isolation, which this static
    // docs site doesn't have — see kokoro-worker.js). Warming the NEXT
    // slide there doesn't hide any latency the user perceives as "waiting
    // for network" — it just adds a competing consumer of the one resource
    // the CURRENT slide's own still-synthesizing sentences also need,
    // risking a genuinely audible delay to the narration already playing.
    // `speechSynthesis`/`silent` were already excluded (no blob to cache).
    if (rung.name !== 'openrouter-tts') return;
    if (!Array.isArray(sentences) || !sentences.length) return;
    const effSpeed = speedPref();
    // Mirrors speak()'s own effVoiceFor exactly (including the '' fallback for
    // anything that isn't openrouter-tts/kokoro) — the cache key this computes
    // must match what speak() looks up later bit-for-bit, or every warmed
    // entry is a silent cache miss.
    const effVoice = rung.name === 'openrouter-tts' ? orVoice() : rung.name === 'kokoro' ? kokoroVoice() : '';
    const todo = sentences.map((s) => String(s || '').trim()).filter(Boolean);
    for (const t of todo) warmQueue.push({ rung, effVoice, effSpeed, text: t, signal });
    pumpWarmQueue();
  }

  // stop/pause/resume now control ONLY the browser speechSynthesis rung (the one
  // rung that plays itself). Every other rung is a pure byte source — the CALLER
  // (Suono) owns that playback, so it starts/pauses/stops those clips itself; there
  // is no owned WebAudio context here to touch anymore. Read-aloud and /cadenza
  // still call these for the speechSynthesis rung. Never throw.
  function stop() {
    try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch {}
  }
  function pause() {
    try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.pause(); } catch {}
  }
  function resume() {
    try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.resume(); } catch {}
  }

  // Synthesize the fixed PREVIEW_TEXT sample for an EXPLICIT rung/voice/model (bypassing the auto
  // ladder) and return its BYTES — the caller plays them (Suono). Never rejects; never plays audio.
  // Returns { ok, bytes, key, error }. `rung` is the tier NAME 'openrouter' | 'kokoro' (as previewVoice took).
  // Preserves previewVoice's exact cache-key derivation (rung's real `.name`, effModel, effVoice,
  // effSpeed, PREVIEW_TEXT) so a preview and a real sentence can still share a cache entry.
  async function synthSample({ rung, voice: v, speed, model, signal } = {}) {
    const r = rung === 'openrouter' ? openrouter : rung === 'kokoro' ? kokoro : null;
    if (!r) return { ok: false, bytes: null, key: '', error: 'unknown voice' };
    if (!r.ready()) return { ok: false, bytes: null, key: '', error: rung === 'openrouter' ? 'cloud voice not connected' : 'voice not ready' };
    const effSpeed = speed ?? speedPref();
    const effVoice = v || (rung === 'openrouter' ? orVoice() : kokoroVoice());
    const effModel = (rung === 'openrouter' && model) || modelIdFor(r.name);
    const key = cacheKeyFor(r.name, effModel, effVoice, effSpeed, PREVIEW_TEXT);
    const cached = audioCache.get(key);
    if (cached) return { ok: true, bytes: cached, key };
    let timer;
    const ctl = new AbortController();
    const sig = signal ?? ctl.signal;
    try {
      const blob = await Promise.race([
        r.synth({ text: PREVIEW_TEXT, voice: v, speed: effSpeed, model: rung === 'openrouter' ? effModel : undefined, signal: sig }).then((b) => { if (b) cacheSet(key, b); return b; }).finally(() => clearTimeout(timer)),
        new Promise((res) => { timer = setTimeout(() => { ctl.abort(); res(null); }, 20000); }),
      ]);
      if (!blob?.size) return { ok: false, bytes: null, key, error: blob === null ? 'timed out waiting for audio (20s) — check your connection' : 'no audio returned (empty response)' };
      return { ok: true, bytes: blob, key };
    } catch (e) { return { ok: false, bytes: null, key, error: (e?.message) || String(e || 'synth failed') }; }
  }

  return {
    // synthOne — the byte SOURCE for an external player (Studio's Suono sequence). See its definition.
    synthOne,
    // synthSample — the byte SOURCE for the Voice-tab "play sample" audition (explicit rung/voice/model,
    // bypassing the ladder); the caller (Suono) plays the returned bytes. See its definition.
    synthSample,
    // Speak ONE sentence via the browser speechSynthesis rung (which plays itself, no bytes) — the
    // parallel path a bytes-only external player uses when pickRung() lands on 'speechSynthesis'.
    speakThis: speakViaSpeech,
    // stop/pause/resume control ONLY the speechSynthesis rung now — every other rung's playback is
    // the caller's (Suono's). See their definitions.
    stop,
    pause,
    resume,
    warm,
    rung() { return pickRung().name },
    kokoroSupported,
    availability() {
      return {
        rung: pickRung().name,
        openRouterReady: openrouter.ready(),
        kokoroReady: kokoro.ready(),
        kokoroCached: kokoroCachedFlag, // on disk (may not be loaded into memory yet)
        kokoroSupported: kokoroSupported(), // on-device is desktop-only
        webgpu: detectWebGPU(),
        speechAllowed: allowSpeech(),
      };
    },
    // Summon the in-browser Kokoro model (the deliberate ~80 MB download). Mirrors
    // architect-model's summon()/loadUniversal(). Surfaces progress; never throws
    // into the caller's flow beyond an explicit reject the UI can show.
    async loadKokoro(onProgress, signal) { await kokoro.load(onProgress, signal); kokoroCachedFlag = true; emitChange(); return true; },
    // Re-probe the on-disk cache (after Settings "Remove models", say).
    probeKokoroCache,
    // Prefs.
    // Every pref setter emits `db-voice-changed` so EVERY subscribed surface re-reads —
    // the TTS settings panel, the Present voice indicator, a second open Workspace. Only
    // setRungPref did before, so changing the MODEL/voice/speed wrote to storage but
    // broadcast nothing, and other surfaces kept showing the stale pick until remount.
    rungPref, setRungPref(name) { writeLS(K.RUNG, name || null); emitChange(); },
    orVoice, setOrVoice(v) { writeLS(K.OR_VOICE, v || null); emitChange(); },
    orModel, setOrModel(m) { writeLS(K.OR_TTS_MODEL, m || null); emitChange(); },
    kokoroVoice, setKokoroVoice(v) { writeLS(K.KOKORO_VOICE, v || null); emitChange(); },
    speedPref, setSpeed(n) { const v = Number(n); writeLS(K.SPEED, Number.isFinite(v) && v > 0 && v !== 1 ? String(v) : null); emitChange(); },
    webgpu: detectWebGPU(),
    // Test hooks (exercise the ladder + sequencing without real audio/models).
    __setRung(b) { injected = b; },
  };
}

// Announce a voice-tier change so live surfaces re-evaluate what they offer
// (mirrors architect-model's db-model-changed event).
function emitChange() {
  if (!hasWindow) return;
  try { window.dispatchEvent(new Event('db-voice-changed')); } catch {}
}

// A scripted rung for tests + previews — records what it was asked to synth and
// returns tiny canned WAV blobs, so the full split→prefetch→play flow is
// exercised with no real model or audio device.
export function MockRung({ name = 'mock' } = {}) {
  const calls = [];
  return {
    name,
    ready() { return true; },
    calls,
    async synth({ text }) { calls.push(text); return wavBlob(new Float32Array(8), 24000); },
  };
}
