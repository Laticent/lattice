// The Drawing Board — the VoiceModel adapter (the read-aloud voice ladder).
//
// Twin of architect-model.js: one interface, rungs behind capability/connection
// detection. App code calls speak() and NEVER branches on the rung — speak()
// always resolves (falling through to a silent floor), so a missing voice
// degrades to "no audio" rather than breaking the surface. The voice never owns
// correctness; it only narrates text the caller already has.
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
// must not use the `@/…` alias or import a TypeScript module. A caller that needs
// the voice to speak EXACTLY a caption engine's sentences passes them via
// speak({ sentences }) rather than making this module import that engine.

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

// How many sentences' synth requests speak() keeps in flight at once (see the
// scheduler in speak(), below). Bounded, not unbounded fire-all: a long deck
// shouldn't spike into dozens of simultaneous OpenRouter requests (rate limit
// / cost / wasted work if the listener navigates away seconds in) just to
// smooth out playback gaps a small overlap already fixes. 3 is a deliberate
// middle ground between "enough head start that a slow response is masked by
// the time its turn to play arrives" and "not so many that one slide's read-
// aloud looks like a burst attack on the API."
const SYNTH_CONCURRENCY = 3;

// warm()'s OWN cap, separate from SYNTH_CONCURRENCY — warm() runs WHILE the
// current slide's own speak() scheduler may still have up to SYNTH_CONCURRENCY
// requests of its own in flight (that overlap is the whole point: prefetch the
// next slide during the current one's playback), so sharing one number would
// let a single autoplay transition burst to SYNTH_CONCURRENCY + SYNTH_CONCURRENCY
// requests at once — quietly doubling the "not a burst attack on the API"
// ceiling the comment above actually promises. Kept small and separate instead:
// warm-ahead only needs to win the race for the NEXT slide's first sentence or
// two before the transition arrives; it doesn't need the same head-start budget
// speak() gives a slide already on screen.
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
// one hands back a blob-LIKE object — {size, type, arrayBuffer()} — playBlob can
// decode directly, same header layout). Deliberately NOT a real `Blob`: this
// codebase's own rung mocks (voice-model.test.ts) always use this exact duck-
// typed shape rather than a real Blob, because jsdom's Blob has no
// `.arrayBuffer()` method — matching that shape here means production and tests
// exercise the identical code path through playBlob, and it avoids an extra
// Blob-wrap/unwrap round trip that buys nothing (the bytes are already an
// ArrayBuffer). A real Blob works fine in every real browser target too, if a
// future caller needs one — this just isn't that caller.
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
  // closed-over `buf` itself — playBlob's `decodeAudioData` DETACHES whatever
  // ArrayBuffer it's given (a real, spec'd side effect, not a bug in this
  // codebase), and this blob-like object is cached (audioCache) and REPLAYED —
  // "Play sample" clicked twice, or the same narration sentence spoken again.
  // Handing back the same `buf` reference every time meant the first play
  // decoded fine and every replay threw "Cannot decode detached ArrayBuffer" —
  // caught live in a real browser (jsdom's mocked decodeAudioData in the test
  // suite doesn't detach, so no test exercised this). A real Blob's own
  // `.arrayBuffer()` already re-reads fresh bytes per call for exactly this
  // reason; `.slice(0)` gives this duck-typed stand-in the same replay safety.
  return { size: buf.byteLength, type: 'audio/wav', arrayBuffer: async () => buf.slice(0) };
}

// ── Rungs ─────────────────────────────────────────────────────────────────────
//
// A blob rung is { name, ready(), synth({text, voice, signal}) → Promise<Blob> }.
// The adapter owns sequencing + playback; rungs only produce audio. speechSynthesis
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
      // into a WAV Blob below so playBlob's decodeAudioData can still play it).
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
      return blob; // mp3; playBlob's decodeAudioData handles it
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

  // ── Playback (one owned WebAudio context; all rungs feed it Blobs) ───────────
  // WebAudio, not an <audio> element: iOS/Safari reliably plays a DECODED buffer
  // triggered after an async gap (download + synth / cloud fetch) and routes through
  // the channel that ignores the hardware ringer switch — whereas a programmatic
  // <audio>.play() after the tap's gesture is gone stays silent ("downloaded but not
  // audible"). decodeAudioData also handles BOTH formats (Kokoro WAV + OpenRouter
  // MP3) and would surface genuinely empty audio rather than fail quietly.
  let audioCtx = null;
  let currentSource = null; // the AudioBufferSourceNode currently playing
  let activeCtl = null; // internal AbortController for the current speak()
  let pausedGate = null; // a promise held while paused; resolves when resumed
  let resumeFn = null; // resolver for pausedGate

  function getCtx() {
    if (!audioCtx && hasWindow) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    return audioCtx;
  }

  // iOS / Safari audio unlock. A WebAudio context starts 'suspended' until a real
  // user gesture resumes it; playback triggered later (after the async download +
  // synth) is then allowed. Call this SYNCHRONOUSLY from the tap (read-aloud button /
  // play-sample) — resuming + ticking a 1-sample buffer blesses the context. No-op
  // where WebAudio is absent. Idempotent.
  //
  // CRITICAL for iOS: a bare AudioContext renders through the "ambient" audio session,
  // which the hardware silent/ring switch MUTES — so playback succeeds (currentTime
  // advances, onended fires) yet nothing is heard. (An earlier comment here claimed
  // WebAudio "ignores the ringer switch"; that was backwards.) Promote the session to
  // 'playback' (Safari 16.4+, guarded) so audio goes through the media channel that
  // ignores the mute switch, like an <audio> element. See WebKit bug 237322.
  function unlock() {
    const ctx = getCtx();
    if (!ctx) return;
    try {
      const s = typeof navigator !== 'undefined' && navigator.audioSession;
      if (s) navigator.audioSession.type = 'playback';
    } catch {}
    try { if (ctx.state === 'suspended') ctx.resume(); } catch {}
    try {
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, 22050);
      s.connect(ctx.destination);
      s.start(0);
    } catch {}
  }

  // `onStart` (optional, additive) fires at the TRUE audio start with the measured
  // { onsetMs, durationMs } — the anchors a caption cursor re-anchors to (Cadenza's
  // hybrid timing). Read at src.start(0), NOT at onSentence fire-time, so the
  // highlight can't lead the voice by the decode gap. No caller that omits it is affected.
  function playBlob(blob, signal, onStart) {
    return new Promise((resolve) => {
      const ctx = getCtx();
      if (!ctx) { resolve({ ok: false, error: 'no AudioContext' }); return; }
      if (!blob) { resolve({ ok: false, error: 'no audio' }); return; }
      let src = null;
      let settled = false;
      const finish = (res) => {
        if (settled) return; settled = true;
        signal?.removeEventListener?.('abort', onAbort);
        if (currentSource === src) currentSource = null;
        resolve(res || { ok: true });
      };
      const onAbort = () => { try { src?.stop(); } catch {} finish({ ok: true, aborted: true }); };
      if (signal) {
        if (signal.aborted) { resolve({ ok: true, aborted: true }); return; }
        signal.addEventListener('abort', onAbort, { once: true });
      }
      blob.arrayBuffer().then((ab) => {
        if (settled) return;
        // Callback form of decodeAudioData for older Safari (promise form is newer).
        ctx.decodeAudioData(ab, (audioBuf) => {
          if (settled) return;
          try {
            if (ctx.state === 'suspended') ctx.resume().catch(() => {});
            src = ctx.createBufferSource();
            src.buffer = audioBuf;
            src.connect(ctx.destination);
            src.onended = () => finish({ ok: true });
            currentSource = src;
            src.start(0);
            // The measured span, captured at the real start. Best-effort + guarded so
            // instrumentation can never break playback.
            if (onStart) { try { onStart({ onsetMs: ctx.currentTime * 1000, durationMs: (audioBuf?.duration || 0) * 1000 }); } catch {} }
          } catch (e) { finish({ ok: false, error: 'play failed: ' + (e?.message || e) }); }
        }, (e) => finish({ ok: false, error: 'decode failed (' + (e?.message || e || 'unsupported audio') + ')' }));
      }).catch((e) => finish({ ok: false, error: 'read failed: ' + (e?.message || e) }));
    });
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

  // A cancelable delay — resolves after `ms`, or immediately if `signal` aborts.
  function sleep(ms, signal) {
    return new Promise((res) => {
      if (ms <= 0 || signal?.aborted) { res(); return; }
      const t = setTimeout(res, ms);
      signal?.addEventListener?.('abort', () => { clearTimeout(t); res(); }, { once: true });
    });
  }

  // The BREATH inserted between one sentence's clip and the next — sized from the
  // sentence's trailing punctuation. A clocked voice plays each sentence's clip back to
  // back, so without a gap the narration rushes ("no time to breathe"). But the clip
  // ALSO already carries its own sentence-final silence, so this is only a LIGHT top-up,
  // NOT the full caption-estimate pause — a first cut at the pause matched the estimate's
  // pauseAfter (cadence.ts) exactly and read too long. These values are deliberately
  // SMALLER than cadence.ts's PAUSE_MS, which is race-SAFE: the estimate re-anchors the
  // next sentence to `realEnd + gap`, and any `gap ≤ estimate pauseAfter` leaves the
  // highlight resting in the silence rather than racing into it (only a LARGER gap would
  // reintroduce the race). INTERIM — these constants are a heuristic pending a proper
  // prosody/human-pace model (2026-07-12 narration-pace thread). A sentence with no
  // terminator gets no breath.
  const SENTENCE_PAUSE_MS = { ',': 70, ';': 100, ':': 100, '.': 160, '!': 160, '?': 160, '…': 200 };
  function sentenceGapMs(sentence) {
    const m = String(sentence ?? '').match(/[.,!?;:…]+$/);
    if (!m) return 0;
    let max = 0;
    for (const ch of m[0]) max = Math.max(max, SENTENCE_PAUSE_MS[ch] ?? 0);
    return max;
  }

  // speak() narrates `text`, sentence by sentence, and resolves when finished (or
  // aborted). It NEVER rejects — a rung failure falls through to silence. A new
  // speak() (or stop()) cancels any in-flight narration first (barge-in).
  async function speak({ text, sentences: providedSentences, voice, speed, signal, onSentence, onSentenceTiming, onState } = {}) {
    stop();
    // An explicit per-call speed wins; otherwise fall to the persisted pref (1 = default).
    const effSpeed = speed ?? speedPref();
    const ctl = new AbortController();
    activeCtl = ctl;
    const sig = ctl.signal;
    if (signal) {
      if (signal.aborted) ctl.abort();
      else signal.addEventListener('abort', () => ctl.abort(), { once: true });
    }
    const rung = pickRung();
    onState?.({ rung: rung.name, speaking: true });
    // A caller may pass its OWN sentence boundaries (e.g. a caption engine's cue
    // split) so the spoken sentence at index i is exactly its cue i — the onset
    // forwarded by onSentenceTiming then re-anchors the right word. Otherwise we
    // fall to our own splitter.
    const sentences =
      Array.isArray(providedSentences) && providedSentences.length
        ? providedSentences.map((s) => String(s).trim()).filter(Boolean)
        : splitSentences(text);
    // Capture the FIRST real failure reason so the caller can show it. Previously the
    // synth error (a good HTTP-status message) and playBlob's decode/play error were
    // both discarded, making every failure look like identical silence — the blind
    // path the audio trio flagged. A synth error (the network/API reason) wins over
    // playBlob's generic 'no audio', since it's the more diagnostic message.
    let lastError = null;
    const errStr = (e) => (e?.message) ? e.message : String(e || 'unknown');
    // `.catch()` alone only covers a REJECTION — a hung fetch/worker that never
    // settles at all would stall this sentence (and every one after it, via the
    // one-ahead prefetch) forever, reading as narration that silently freezes
    // mid-deck. Race against a timeout that resolves to null (skip this sentence,
    // keep going) rather than aborting `sig` — one slow sentence shouldn't kill
    // playback for the rest of the deck the way it's appropriate to for a single
    // self-contained Play-sample preview (see previewVoice's own fix, above).

    // The voice a rung will ACTUALLY use — mirrors each rung's own internal
    // `voice || getVoice()` fallback EXACTLY, including the `||` (not `??`):
    // an independent-checker pass confirmed a `??` mirror here would diverge
    // from the real rungs for a falsy-but-non-nullish `voice` (e.g. `''`) —
    // the real rung resolves the live persisted voice pref for that input,
    // but a `??` mirror would freeze the cache key on `''` forever, so a
    // later voice-pref CHANGE would silently hit a stale-voice cache entry.
    // No current caller passes `voice: ''` (verified — read-aloud.ts omits
    // it, cadenza.astro/drawing-board-settings.js always pass a real id), so
    // this was a dormant landmine, not yet reachable, but a direct
    // contradiction of this cache's whole reason for keying on voice at all.
    const effVoiceFor = (rungName) =>
      voice || (rungName === 'openrouter-tts' ? orVoice() : rungName === 'kokoro' ? kokoroVoice() : '');

    // Two IDENTICAL sentences scheduled in the same fillSlots() batch below
    // (a slide repeating a phrase across two bullets) join the SAME in-flight
    // request instead of each firing an independent one — fixed via
    // `inFlightSynths`, below, rather than just relying on `audioCache` (which
    // only gets populated once a request RESOLVES, too late to help a
    // concurrent duplicate).
    const synth = (t) => {
      const cacheKey = cacheKeyFor(rung.name, modelIdFor(rung.name), effVoiceFor(rung.name), effSpeed, t);
      const cached = audioCache.get(cacheKey);
      if (cached) return Promise.resolve(cached);
      // Join an in-flight request for this exact key — UNLESS it belongs to
      // an already-aborted call (see inFlightSynths's own comment for why
      // that check matters for a barge-in replaying the same text).
      const inflight = inFlightSynths.get(cacheKey);
      if (inflight && !inflight.sig.aborted) return inflight.promise;
      // Cleared the moment EITHER side settles — Promise.race doesn't cancel the
      // loser, so an uncleared timer would linger 20s per sentence, every sentence,
      // even on the healthy path (a real timer-leak risk across a long deck).
      let timer;
      const p = Promise.race([
        rung.synth({ text: t, voice, speed: effSpeed, signal: sig }).then((blob) => {
          if (blob) cacheSet(cacheKey, blob);
          return blob;
        }).catch((e) => {
          if (!sig.aborted && !lastError) lastError = errStr(e);
          return null;
        }).finally(() => clearTimeout(timer)),
        new Promise((res) => {
          timer = setTimeout(() => {
            if (!sig.aborted && !lastError) lastError = 'timed out waiting for audio (20s)';
            res(null);
          }, 20000);
        }),
      ]).finally(() => {
        // Only remove OUR OWN entry — a newer call may have already
        // overwritten this key (the barge-in case above) by the time we settle.
        if (inFlightSynths.get(cacheKey)?.promise === p) inFlightSynths.delete(cacheKey);
      });
      inFlightSynths.set(cacheKey, { promise: p, sig });
      return p;
    };
    try {
      if (rung.name === 'speechSynthesis') {
        for (const s of sentences) {
          if (sig.aborted) break;
          await waitIfPaused(sig);
          onSentence?.(s);
          await speakViaSpeech(s, sig);
        }
      } else if (rung.name === 'silent' || !sentences.length) {
        // Floor: nothing to play.
      } else {
        // Blob rungs: fire every sentence's synth up front, capped concurrency —
        // NOT tied to playback progress the way a one-ahead pipeline is. A
        // one-ahead pipeline only hides synth latency up to the PREVIOUS
        // sentence's playback duration; a short sentence (a bullet fragment, a
        // number) plays back in under a second while a network round trip
        // costs whatever it costs regardless of text length, so the pipe
        // starves and every transition becomes its own latency bet. Keeping
        // SYNTH_CONCURRENCY requests in flight at all times — refilled the
        // moment a slot frees, independent of how far playback has gotten —
        // gives every sentence's audio the maximum possible head start instead
        // of just the prior sentence's (often much shorter) slack. The
        // audioCache above means a cache hit barely occupies a slot at all, so
        // a replay-heavy narration isn't bottlenecked by this cap either.
        const pending = new Array(sentences.length);
        let started = 0;
        let active = 0;
        const fillSlots = () => {
          // Gated on `!pausedGate` too — an adversarial review found that
          // without this, pausing narration didn't stop the scheduler at
          // all: every already-in-flight request completing just refilled
          // the next queued sentence regardless of pause state, so a single
          // pause-to-think could silently synthesize the ENTIRE REST of the
          // deck in the background (unbounded — not merely "3× the old
          // one-ahead pipeline's worst case," since that pipeline's own loop
          // iteration was itself gated on `waitIfPaused` before advancing,
          // capping its wasted-ahead synthesis at exactly one sentence).
          // Real cost on a BYO OpenRouter key, not just a latency nit.
          while (!sig.aborted && !pausedGate && active < SYNTH_CONCURRENCY && started < sentences.length) {
            const idx = started++;
            active++;
            pending[idx] = synth(sentences[idx]).finally(() => {
              active--;
              fillSlots(); // a slot just freed — start the next queued sentence, if any
            });
          }
          // Stopped early because we're PAUSED (not done, not aborted) — resume()
          // resolves this exact pausedGate promise instance when the user
          // unpauses, even though the outer `pausedGate` variable will have
          // already been reassigned to null by then; chaining onto the
          // instance (not the variable) is what makes this self-correcting
          // across repeated pause/resume cycles without any new shared state.
          if (!sig.aborted && pausedGate && started < sentences.length) {
            pausedGate.then(() => fillSlots());
          }
        };
        fillSlots();
        for (let i = 0; i < sentences.length; i++) {
          if (sig.aborted) break;
          const blob = await pending[i];
          if (sig.aborted) break;
          await waitIfPaused(sig);
          onSentence?.(sentences[i]);
          // Additive: forward the MEASURED onset/duration + the sentence INDEX (so a
          // consumer never has to infer it from text, which duplicate sentences make
          // ambiguous) to a caption cursor. Omitted → playBlob's onStart is undefined.
          const onStart = onSentenceTiming
            ? ({ onsetMs, durationMs }) => onSentenceTiming({ index: i, text: sentences[i], onsetMs, durationMs })
            : undefined;
          const played = await playBlob(blob, sig, onStart);
          // A decode/play failure (not a mere missing blob, which the synth error above
          // already explains) is worth surfacing too.
          if (played && played.ok === false && played.error && played.error !== 'no audio' && !lastError) {
            lastError = played.error;
          }
          // Breathe between sentences — a real pause the clip itself doesn't carry, sized
          // to match the caption estimate's gap so the highlight rests in it (see
          // sentenceGapMs). Not after the last sentence, and short-circuited on abort.
          if (i < sentences.length - 1 && !sig.aborted) await sleep(sentenceGapMs(sentences[i]), sig);
        }
      }
    } finally {
      if (activeCtl === ctl) activeCtl = null;
      onState?.({ rung: rung.name, speaking: false, aborted: sig.aborted, error: lastError || undefined });
    }
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

  function waitIfPaused(signal) {
    if (!pausedGate) return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => { if (!pausedGate || signal.aborted) resolve(); };
      pausedGate.then(check);
      signal?.addEventListener?.('abort', () => resolve(), { once: true });
    });
  }

  function stop() {
    if (activeCtl) { try { activeCtl.abort(); } catch {} activeCtl = null; }
    // Release any paused waiter so a stop-while-paused unwinds cleanly.
    const r = resumeFn; pausedGate = null; resumeFn = null; r?.();
    try { currentSource?.stop(); } catch {}
    currentSource = null;
    try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch {}
  }

  function pause() {
    // Suspending the context pauses the in-flight clip mid-stream (no offset
    // bookkeeping); the pausedGate also holds the NEXT sentence.
    try { audioCtx?.suspend?.(); } catch {}
    try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.pause(); } catch {}
    if (!pausedGate) pausedGate = new Promise((res) => { resumeFn = res; });
  }
  function resume() {
    try { audioCtx?.resume?.().catch(() => {}); } catch {}
    try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.resume(); } catch {}
    const r = resumeFn; pausedGate = null; resumeFn = null; r?.();
  }

  return {
    speak,
    stop,
    pause,
    resume,
    unlock,
    warm,
    speaking() { return !!activeCtl; },
    paused() { return !!pausedGate; },
    // The owned WebAudio clock, in ms — the monotonic time source a caption cursor
    // ticks against (onsets from onSentenceTiming are read off the SAME clock). 0
    // before any audio has played. Read-only; never creates the context.
    audioTimeMs() { return audioCtx ? audioCtx.currentTime * 1000 : 0; },
    // The AudioContext lifecycle state for diagnostics: 'none' (never created),
    // 'suspended' (needs a gesture / interrupted), or 'running'. Read-only.
    audioState() { return audioCtx ? audioCtx.state : 'none'; },
    // Audio hardware output latency in ms — the gap between the clock (currentTime)
    // and what's actually HEARD. A caption cursor subtracts this so the highlight
    // matches the ear rather than leading it. 0 where the browser doesn't report it.
    outputLatencyMs() {
      if (!audioCtx) return 0;
      const l = audioCtx.outputLatency || audioCtx.baseLatency || 0;
      return l * 1000;
    },
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
    // Play a short sample with an EXPLICIT rung + voice (the Voice tab's "play
    // sample"). Bypasses the auto ladder so each voice can be auditioned directly.
    // Resolves false if that rung isn't ready (cloud not connected / Kokoro not
    // loaded). Never rejects.
    // Returns { ok, error } so the UI can SHOW why a sample failed (the synth HTTP
    // error, an unsupported-MP3 decode, or audio still blocked) instead of silently
    // doing nothing — the only way to diagnose iOS without a Mac/console.
    async previewVoice({ rung, voice: v, speed, model } = {}) {
      const r = rung === 'openrouter' ? openrouter : rung === 'kokoro' ? kokoro : null;
      if (!r) return { ok: false, error: 'unknown voice' };
      if (!r.ready()) return { ok: false, error: rung === 'openrouter' ? 'cloud voice not connected' : 'voice not ready' };
      stop();
      const ctl = new AbortController();
      activeCtl = ctl;
      const effSpeed = speed ?? speedPref();
      // Same resolved-voice mirroring as speak()'s effVoiceFor — `||`, not
      // `??`, matching the real rungs' own `voice || getVoice()` exactly
      // (see effVoiceFor's comment for why the distinction matters). `rung`
      // here is the caller's tier NAME ('openrouter'/'kokoro'), matching
      // r.ready()'s own ternary above.
      const effVoice = v || (rung === 'openrouter' ? orVoice() : kokoroVoice());
      // `model` is an explicit per-call override — the Workspace model
      // PICKER's own ▶ row-preview button passes the id of the row being
      // auditioned, which may not be the currently ACTIVE model at all
      // (previewTtsVoice already resolved it for the CACHE lookup one layer
      // up; this is the live-fallback half of that same fix). Without this,
      // `modelIdFor` falls back to the persisted active model regardless of
      // which row was clicked — a live preview of an unselected, uncached
      // model silently played through whatever model WAS active instead (bug,
      // 2026-07-09-studio-cloud-ondevice-config-split.md's "model-row-preview"
      // follow-up). Kokoro has no alternate-model concept, so this only
      // applies to the openrouter rung. Used for BOTH the cache key and the
      // synth call below — a mismatch between the two would mean a row
      // preview could read or write another model's cache entry.
      const effModel = (rung === 'openrouter' && model) || modelIdFor(r.name);
      // Repeat "Play sample" clicks for the SAME voice/model/speed are pure
      // duplicate synths of a fixed string — the same cache speak() uses, keyed
      // by the rung's real name (r.name — 'openrouter-tts'/'kokoro', not the
      // caller's shorthand) so a preview and a later spoken sentence that happen
      // to share text could even share a cache entry.
      const cacheKey = cacheKeyFor(r.name, effModel, effVoice, effSpeed, PREVIEW_TEXT);
      // The PLAYBACK phase below already has an 8s watchdog; the SYNTH phase (the
      // network fetch to OpenRouter, or the Kokoro worker round-trip) previously had
      // NONE — a hung request left this awaiting forever, stuck on "Playing…" with no
      // way out short of closing the panel. Race it against a timeout that also aborts
      // `ctl`, so an abort-aware rung (fetch, worker) genuinely cancels — and even
      // where it can't (Kokoro's main-thread fallback), the race still resolves,
      // unsticking the UI regardless. `synthTimer` is cleared the moment EITHER side
      // settles (not just on the happy path) — Promise.race doesn't cancel the loser,
      // so an uncleared timer would linger for the full 20s on every call, healthy or
      // not, a real (if small) timer leak across a long presentation.
      let synthTimer;
      try {
        const cached = audioCache.get(cacheKey);
        const blob = cached ?? await Promise.race([
          r.synth({ text: PREVIEW_TEXT, voice: v, speed: effSpeed, model: rung === 'openrouter' ? effModel : undefined, signal: ctl.signal }).then((b) => {
            if (b) cacheSet(cacheKey, b);
            return b;
          }).finally(() => clearTimeout(synthTimer)),
          new Promise((res) => { synthTimer = setTimeout(() => { ctl.abort(); res(null); }, 20000); }),
        ]);
        if (!blob?.size) return { ok: false, error: blob === null ? 'timed out waiting for audio (20s) — check your connection' : 'no audio returned (empty response)' };
        // Race playback against a watchdog: a decoded clip that never reaches
        // 'ended' means the audio context is stuck suspended (iOS, no gesture) —
        // report it rather than hang the button. Same leak/clear concern as above.
        const ctx = getCtx();
        let playTimer;
        const played = await Promise.race([
          playBlob(blob, ctl.signal).finally(() => clearTimeout(playTimer)),
          new Promise((res) => { playTimer = setTimeout(() => res({ ok: false, error: 'no sound — audio ' + (ctx ? ctx.state : 'unavailable') }), 8000); }),
        ]);
        clearTimeout(playTimer);
        return played.ok ? { ok: true } : { ok: false, error: played.error };
      } catch (e) { return { ok: false, error: String(e?.message || e) }; }
      finally { clearTimeout(synthTimer); if (activeCtl === ctl) activeCtl = null; }
    },
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
