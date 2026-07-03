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
// it is reachable only behind a dev flag, for prototyping the UX. See
// engineering/decisions/2026-06-14-read-aloud-kokoro.md.
//
// Sibling render-path note: this is docs-only (the Drawing Board); it does not
// touch the three engine render paths.

// CDN entrypoint for the in-browser engine (no npm dep; loaded on demand the
// first time the user summons the local voice). Mirrors architect-model.js.
const KOKORO_URL = 'https://esm.run/kokoro-js';
const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
// Cloud voice = OpenRouter audio OUTPUT via chat-completions (NOT a `/audio/speech`
// route — OpenRouter has no TTS models). An audio-output model speaks the text back
// as a streamed, base64 audio delta. CORS-enabled for the browser, authenticated
// with the SAME key the architect model already holds.
// Docs: https://openrouter.ai/docs/guides/overview/multimodal/audio
const OR_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

const DEFAULT_OR_TTS_MODEL = 'openai/gpt-audio-mini'; // cheapest audio-output model
const DEFAULT_OR_VOICE = 'nova'; // warm, boardroom-neutral (alloy/echo/fable/onyx/nova/shimmer)
const DEFAULT_KOKORO_VOICE = 'af_heart';

// localStorage prefs (the lattice-db-* namespace the Drawing Board uses).
const RUNG_LS = 'lattice-db-voice-rung'; // 'auto' | 'openrouter' | 'kokoro' | 'off'
const OR_VOICE_LS = 'lattice-db-voice-or';
const OR_TTS_MODEL_LS = 'lattice-db-voice-or-model';
const KOKORO_VOICE_LS = 'lattice-db-voice-kokoro';
const DEV_SPEECH_LS = 'lattice-db-voice-dev-speech'; // '1' opts into the banned rung

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
export function splitSentences(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return [];
  // Break after sentence terminators (.!?…) when followed by whitespace/end.
  // Over-splitting an abbreviation only adds a tiny gap — never a correctness bug.
  const parts = s.match(/[^.!?…]*[.!?…]+(?=\s|$)|[^.!?…]+$/g) || [s];
  return parts.map((p) => p.trim()).filter(Boolean);
}

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
    async synth({ text, voice, signal }) {
      const key = getKey();
      if (!key) throw new Error('OpenRouter not connected');
      // Audio OUTPUT goes through chat-completions with modalities:['text','audio'];
      // stream:true is MANDATORY (the audio arrives as base64 deltas). A short system
      // prompt pins the model to verbatim narration, not conversation.
      const res = await (fetchImpl || fetch)(OR_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + key,
          'HTTP-Referer': referer(),
          'X-Title': 'Lattice Drawing Board',
        },
        body: JSON.stringify({
          model: getModel(),
          modalities: ['text', 'audio'],
          audio: { voice: voice || getVoice(), format: 'wav' },
          stream: true,
          messages: [
            { role: 'system', content: 'You are a text-to-speech engine. Speak the user\'s message aloud verbatim, in a natural, measured boardroom delivery. Do not add, omit, summarize, answer, or comment — read the exact text and nothing else.' },
            { role: 'user', content: text },
          ],
        }),
        signal,
      });
      if (!res.ok) {
        let detail = ''; try { detail = (await res.text()).slice(0, 160); } catch {}
        throw new Error('OpenRouter TTS error ' + res.status + (detail ? ': ' + detail : ''));
      }
      const b64 = await readAudioStream(res);
      if (!b64) throw new Error('no audio in response (model may not support audio output)');
      return b64ToBlob(b64, 'audio/wav');
    },
  };
}

// Read OpenRouter's SSE stream and concatenate the base64 audio deltas
// (choices[0].delta.audio.data). Falls back to a non-streamed message.audio.data.
async function readAudioStream(res) {
  if (!res.body || !res.body.getReader) {
    try { const j = await res.json(); return j?.choices?.[0]?.message?.audio?.data || ''; } catch { return ''; }
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let b64 = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return b64;
      try {
        const j = JSON.parse(payload);
        const c = j?.choices?.[0];
        const d = c?.delta?.audio?.data || c?.message?.audio?.data;
        if (d) b64 += d;
      } catch {}
    }
  }
  return b64;
}

// base64 → Blob, browser-safe (atob; no Buffer dependency).
function b64ToBlob(b64, type) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
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
    async synth({ text, voice, signal }) {
      if (!isReady) throw new Error('Kokoro not summoned');
      const v = voice || getVoice();
      if (worker) {
        const id = nextId++;
        return new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject });
          worker.postMessage({ type: 'generate', id, text, voice: v });
          if (signal) signal.addEventListener('abort', () => { pending.delete(id); reject(new Error('aborted')); }, { once: true });
        });
      }
      const audio = await mainTts.generate(text, { voice: v });
      return wavBlob(audio.audio, audio.sampling_rate);
    },
  };
}

// ── The adapter ───────────────────────────────────────────────────────────────

export function createVoiceModel({ getOpenRouterKey, getSettings, fetchImpl } = {}) {
  const settings = () => (getSettings ? getSettings() : {}) || {};
  const getKey = () => (getOpenRouterKey ? getOpenRouterKey() : null) || null;

  const rungPref = () => readLS(RUNG_LS) || 'auto';
  const orVoice = () => readLS(OR_VOICE_LS) || DEFAULT_OR_VOICE;
  const orModel = () => readLS(OR_TTS_MODEL_LS) || DEFAULT_OR_TTS_MODEL;
  const kokoroVoice = () => readLS(KOKORO_VOICE_LS) || DEFAULT_KOKORO_VOICE;
  // The banned rung is reachable only when a dev explicitly opts in.
  const allowSpeech = () => readLS(DEV_SPEECH_LS) === '1' || settings().voiceDevSpeech === true;

  const openrouter = openRouterRung({ getKey, getModel: orModel, getVoice: orVoice, fetchImpl });
  const kokoro = kokoroRung({ getVoice: kokoroVoice });
  let injected = null; // test hook

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
  function unlock() {
    const ctx = getCtx();
    if (!ctx) return;
    try { if (ctx.state === 'suspended') ctx.resume(); } catch {}
    try {
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, 22050);
      s.connect(ctx.destination);
      s.start(0);
    } catch {}
  }

  function playBlob(blob, signal) {
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

  // speak() narrates `text`, sentence by sentence, and resolves when finished (or
  // aborted). It NEVER rejects — a rung failure falls through to silence. A new
  // speak() (or stop()) cancels any in-flight narration first (barge-in).
  async function speak({ text, voice, signal, onSentence, onState } = {}) {
    stop();
    const ctl = new AbortController();
    activeCtl = ctl;
    const sig = ctl.signal;
    if (signal) {
      if (signal.aborted) ctl.abort();
      else signal.addEventListener('abort', () => ctl.abort(), { once: true });
    }
    const rung = pickRung();
    onState?.({ rung: rung.name, speaking: true });
    const sentences = splitSentences(text);
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
        // Blob rungs, with one-ahead prefetch for low gap between sentences.
        let next = sentences.length ? rung.synth({ text: sentences[0], voice, signal: sig }).catch(() => null) : null;
        for (let i = 0; i < sentences.length; i++) {
          if (sig.aborted) break;
          const blob = await next;
          next = i + 1 < sentences.length ? rung.synth({ text: sentences[i + 1], voice, signal: sig }).catch(() => null) : null;
          if (sig.aborted) break;
          await waitIfPaused(sig);
          onSentence?.(sentences[i]);
          await playBlob(blob, sig);
        }
      }
    } finally {
      if (activeCtl === ctl) activeCtl = null;
      onState?.({ rung: rung.name, speaking: false, aborted: sig.aborted });
    }
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
    speaking() { return !!activeCtl; },
    paused() { return !!pausedGate; },
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
    async previewVoice({ rung, voice: v } = {}) {
      const r = rung === 'openrouter' ? openrouter : rung === 'kokoro' ? kokoro : null;
      if (!r) return { ok: false, error: 'unknown voice' };
      if (!r.ready()) return { ok: false, error: rung === 'openrouter' ? 'cloud voice not connected' : 'voice not ready' };
      stop();
      const ctl = new AbortController();
      activeCtl = ctl;
      try {
        const blob = await r.synth({ text: 'This is how your slides will sound.', voice: v, signal: ctl.signal });
        if (!blob || !blob.size) return { ok: false, error: 'no audio returned (empty response)' };
        // Race playback against a watchdog: a decoded clip that never reaches
        // 'ended' means the audio context is stuck suspended (iOS, no gesture) —
        // report it rather than hang the button.
        const ctx = getCtx();
        const played = await Promise.race([
          playBlob(blob, ctl.signal),
          new Promise((res) => setTimeout(() => res({ ok: false, error: 'no sound — audio ' + (ctx ? ctx.state : 'unavailable') }), 8000)),
        ]);
        return played.ok ? { ok: true } : { ok: false, error: played.error };
      } catch (e) { return { ok: false, error: String(e?.message || e) }; }
      finally { if (activeCtl === ctl) activeCtl = null; }
    },
    // Prefs.
    rungPref, setRungPref(name) { writeLS(RUNG_LS, name || null); emitChange(); },
    orVoice, setOrVoice(v) { writeLS(OR_VOICE_LS, v || null); },
    orModel, setOrModel(m) { writeLS(OR_TTS_MODEL_LS, m || null); },
    kokoroVoice, setKokoroVoice(v) { writeLS(KOKORO_VOICE_LS, v || null); },
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
