// The Drawing Board — the ArchitectModel adapter (the on-device model ladder).
//
// One interface, four backends, behind feature detection. App code never
// branches on the backend: complete() ALWAYS resolves to text/JSON, falling
// through the ladder to the deterministic floor when no model is present, so a
// missing model degrades to the proven Phase-1 behaviour rather than breaking.
//
//   generation:  built-in Prompt API  →  WebLLM (opt-in)  →  floor (templated)
//   embeddings:  Transformers.js bge-small (CDN, always the same model)  →  null
//
// The model NEVER owns correctness — callers compute the deterministic answer and
// pass it as `fallback`; the model only (optionally) improves the phrasing. See
// engineering/decisions/2026-06-08-drawing-board-phase-2-build.md for why the
// heavy runtimes load from CDN on demand (no npm deps) and how this is verified
// without real hardware (a MockBackend exercises the model-on path in CI).
//
// Sibling render-path note: this is docs-only (the Drawing Board); it does not
// touch the three engine render paths.

// CDN entrypoints for the heavy, opt-in runtimes. Swap these for bundled
// import()s if a future deployment needs self-hosted weights — the adapter
// interface is unchanged.
const WEBLLM_URL = 'https://esm.run/@mlc-ai/web-llm';
const TRANSFORMERS_URL = 'https://esm.run/@huggingface/transformers';
// OpenRouter — the cloud tier (Converse). The user connects their own OpenRouter
// account once via one-click OAuth (PKCE — no key to copy-paste) and their credits
// cover usage; free to us, no backend. OpenAI-compatible, so complete() mirrors the
// WebLLM path. 500+ models — the UI offers a picker with live pricing.
// DEFAULT_OR_MODEL is only the first-connect default; the user can switch any time.
// All endpoints are CORS-enabled for browser use, so no server is involved.
const OPENROUTER_AUTH_URL = 'https://openrouter.ai/auth';
const OPENROUTER_KEYS_URL = 'https://openrouter.ai/api/v1/auth/keys';
const OPENROUTER_KEY_URL = 'https://openrouter.ai/api/v1/auth/key'; // GET: this key's usage + limit
const OPENROUTER_CREDITS_URL = 'https://openrouter.ai/api/v1/credits'; // GET: account wallet (total_credits/total_usage)
const OPENROUTER_KEYS_SETTINGS_URL = 'https://openrouter.ai/settings/keys'; // where a user sets a per-key spend limit
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
// The connect-time default is OpenRouter's server-resolved "latest" ALIAS (the
// `~vendor/family-latest` ids), not a pinned version — so it can never rot when a
// model is retired/renamed (a pinned id 404s "No endpoints found"; the alias keeps
// resolving to the current latest). Verified callable; resolves e.g. to
// anthropic/claude-4.5-haiku-*. See engineering/decisions/2026-06-29-studio-model-liveness.md.
const DEFAULT_OR_MODEL = '~anthropic/claude-sonnet-latest';
const OR_KEY_LS = 'lattice-db-or-key'; // the user's OpenRouter API key (persists)
const OR_MODEL_LS = 'lattice-db-or-model'; // chosen model id
const OR_VERIFIER_LS = 'lattice-db-or-verifier'; // transient PKCE verifier (deleted after exchange)
const OR_CATALOG_LS = 'lattice-db-or-catalog'; // {fetchedAt, models} — TTL-cached /models catalog
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000; // refetch the catalog at most once a day
// A retired/renamed model id fails with this signature — the trigger to self-heal
// to the rot-proof latest alias (a pinned id the user stored can die under them).
const isDeadModelError = (status, body) => (status === 400 || status === 404) && /not a valid model|no endpoints found|no allowed providers/i.test(String(body || ''));
const EMBED_MODEL = 'Xenova/bge-small-en-v1.5';
const WEBLLM_MODEL = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
// The universal generation tier: a small instruct model that runs in WASM via
// Transformers.js — no WebGPU, works on Safari / mobile. Qwen2.5-0.5B at q4 is
// ~350 MB; benchmarked in Node against SmolLM2-135M, it's the smallest model
// that gives genuinely useful, non-rambling answers for the narrow tasks here
// (short coaching + rewrites). 135M was coherent at the sentence level but
// invented numbers and ignored instructions. Desktops reach for the built-in
// Prompt API or the WebLLM tier for stronger answers.
const UNIVERSAL_MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct';
// Decoding for the small model: greedy loops on a tiny model, so penalize
// repetition and forbid repeating any 3-gram. Verified in Node to stop the
// degenerate loops the phone showed. Short generations (it's slow per token).
// The SAME numbers are inlined into WORKER_SRC below — keep them in sync.
const GEN_OPTS = { max_new_tokens: 128, do_sample: false, repetition_penalty: 1.3, no_repeat_ngram_size: 3 };

const hasWindow = typeof window !== 'undefined';
const G = typeof globalThis !== 'undefined' ? globalThis : {};

// ── Feature detection (all guarded — returns false/unavailable in Node) ───────

export function detectWebGPU() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

// The built-in Prompt API surfaces as `LanguageModel` (Chrome/Edge). Its
// availability() is 'available' | 'downloadable' | 'downloading' | 'unavailable'.
export async function detectPromptApi() {
  try {
    const LM = G.LanguageModel;
    if (!LM || typeof LM.availability !== 'function') return 'unavailable';
    return await LM.availability();
  } catch {
    return 'unavailable';
  }
}

// ── Backends ──────────────────────────────────────────────────────────────────
//
// A backend is { complete({messages, json, fallback, signal, onToken}), name }.
// complete() may throw; the adapter catches and floors.

// The deterministic floor: returns exactly what the caller computed. This is the
// whole offline guarantee in one function.
const floorBackend = {
  name: 'floor',
  async complete({ json, fallback }) {
    return json ? (fallback ?? {}) : (fallback ?? '');
  },
};

// Built-in Prompt API. Streams tokens through onToken when given.
function promptApiBackend() {
  let session = null;
  return {
    name: 'prompt-api',
    async complete({ messages, json, signal, onToken }) {
      const LM = G.LanguageModel;
      if (!LM) throw new Error('Prompt API absent');
      if (!session) {
        const sys = messages.find((m) => m.role === 'system');
        session = await LM.create(sys ? { initialPrompts: [{ role: 'system', content: sys.content }] } : {});
      }
      const turns = messages.filter((m) => m.role !== 'system').map((m) => `${m.role}: ${m.content}`).join('\n');
      const prompt = json ? `${turns}\n\nReply with ONLY valid JSON.` : turns;
      if (onToken && typeof session.promptStreaming === 'function') {
        let full = '';
        const stream = session.promptStreaming(prompt, signal ? { signal } : undefined);
        for await (const chunk of stream) { full += chunk; onToken(chunk); }
        return full;
      }
      return await session.prompt(prompt, signal ? { signal } : undefined);
    },
    destroy() { try { session?.destroy?.(); } catch {} session = null; },
  };
}

// WebLLM — opt-in, WebGPU, ~1GB download. Loaded from CDN only when summoned.
function webllmBackend() {
  let engine = null;
  return {
    name: 'webllm',
    async load(onProgress, signal) {
      const webllm = await import(/* @vite-ignore */ WEBLLM_URL);
      engine = await webllm.CreateMLCEngine(WEBLLM_MODEL, {
        // WebLLM's progress is already a 0–1 fraction — pass it through in the
        // same {progress, text} shape the universal backend uses.
        initProgressCallback: (p) => onProgress?.({ progress: p?.progress || 0, text: p?.text }),
      });
      if (signal?.aborted) throw new Error('aborted');
      return true;
    },
    ready() { return !!engine; },
    async complete({ messages, json, signal, onToken }) {
      if (!engine) throw new Error('WebLLM not summoned');
      const req = {
        messages,
        stream: !!onToken,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      };
      if (onToken) {
        let full = '';
        const chunks = await engine.chat.completions.create(req);
        for await (const c of chunks) {
          if (signal?.aborted) break;
          const t = c.choices?.[0]?.delta?.content || '';
          full += t; if (t) onToken(t);
        }
        return full;
      }
      const r = await engine.chat.completions.create(req);
      return r.choices?.[0]?.message?.content ?? '';
    },
  };
}

// ── OpenRouter (the cloud tier) ───────────────────────────────────────────────
//
// A localStorage helper pair + PKCE primitives shared by the OAuth flow. The key
// lives in localStorage so the connection survives reloads (ready() is simply
// "has a key"); the PKCE verifier is transient and deleted once exchanged.
function readLS(k) { try { return localStorage.getItem(k); } catch { return null; } }
function writeLS(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }

// The model catalog is TTL-cached in localStorage so the picker doesn't refetch on
// every open and so price/name survive a reload — and it can be served stale if a
// later fetch fails. A fresh entry (< CATALOG_TTL_MS) is returned as-is; anything
// older/garbled reads as a miss so the next listModels() refetches.
function readCachedCatalog() {
  try {
    const raw = readLS(OR_CATALOG_LS);
    if (!raw) return null;
    const { fetchedAt, models } = JSON.parse(raw);
    if (!Array.isArray(models) || !models.length || Date.now() - fetchedAt > CATALOG_TTL_MS) return null;
    return models;
  } catch { return null; }
}
function writeCachedCatalog(models) { try { writeLS(OR_CATALOG_LS, JSON.stringify({ fetchedAt: Date.now(), models })); } catch {} }

function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function pkceVerifier() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return base64url(a);
}
async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

// OpenRouter pricing strings are per-token USD; convert to per-MILLION. Variable/
// router models (Auto Router, Body Builder, …) report a negative sentinel ("-1")
// and unpriced rows can be missing/non-numeric — return null for "no fixed price"
// so the UI can label it ("pricing varies") instead of printing "$-1000000". A
// genuine free model reports "0" → 0 (kept; the UI shows "free").
export function orPricePerM(raw) {
  if (raw == null || (typeof raw === 'string' && raw.trim() === '')) return null;
  const n = Number(raw) * 1e6;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Does this OpenRouter model support prompt caching (the `cache_control` breakpoint)?
// OpenRouter applies caching automatically and silently ignores the breakpoint on
// models that don't support it, so this is a UI-honesty gate (don't offer a toggle
// that does nothing) rather than a correctness one. Keyed on the vendor prefix —
// the providers OpenRouter documents as supporting prompt caching.
const OR_CACHE_VENDORS = new Set(['anthropic', 'openai', 'deepseek', 'google', 'x-ai']);
export function orSupportsCache(id) {
  return OR_CACHE_VENDORS.has(String(id || '').split('/')[0]);
}

// The vendors whose prompt caching needs an EXPLICIT `cache_control` breakpoint to
// fire. Anthropic + Google cache only the prefix you mark; OpenAI / DeepSeek / x-ai
// cache automatically (no breakpoint, so we leave their messages untouched — a plain
// string, which they prefer). Subset of OR_CACHE_VENDORS.
const OR_CACHE_BREAKPOINT_VENDORS = new Set(['anthropic', 'google']);

// Mark the static SYSTEM block for prompt caching so a repeated, byte-identical
// system prompt (our authoring canon is ~7K tokens, re-sent on EVERY call) is paid in
// full ONCE per ~5-min TTL and read at ~0.1x on calls 2..N — instead of re-billed at
// 1x each time. Only the FIRST `system` message is marked (the user turn and any
// per-request dedup-neighbor `assistant` block vary, so they stay OUTSIDE the cached
// prefix). Only for vendors that need an explicit breakpoint; below a provider's min
// cacheable size the breakpoint is a silent no-op, so marking is always safe. Pure —
// returns a new array, inputs untouched; a string `content` becomes the one-text-part
// array form OpenRouter expects the `cache_control` field on.
export function withCachedSystem(messages, modelId) {
  if (!OR_CACHE_BREAKPOINT_VENDORS.has(String(modelId || '').split('/')[0])) return messages;
  let marked = false;
  return (messages || []).map((m) => {
    if (marked || !m || m.role !== 'system' || typeof m.content !== 'string') return m;
    marked = true;
    return { ...m, content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }] };
  });
}

// OpenRouter cloud backend — the { ready, complete } shape plus the OAuth methods
// (beginAuth → redirect → completeAuth) and the catalog (listModels, with
// per-million pricing) the settings picker reads. OpenAI-compatible streaming. The
// deck text leaves the device → gated behind explicit consent in the UI before
// connect() is ever offered.
function openRouterBackend(defaultModel = DEFAULT_OR_MODEL, defaultMaxTokens = 0) {
  const referer = () => (typeof location !== 'undefined' ? location.origin : 'https://lattice.dev');
  let catalogCache = readCachedCatalog(); // id→{name,…} catalog; seeded from the TTL localStorage cache so price/name survive a reload
  return {
    name: 'openrouter',
    ready() { return !!readLS(OR_KEY_LS); },
    hasPendingAuth() { return !!readLS(OR_VERIFIER_LS); },
    getModel() { return readLS(OR_MODEL_LS) || defaultModel; },
    // Where the user sets a HARD, server-enforced per-key spend limit. We can't set
    // it from the browser PKCE flow (the redirect can't carry a limit, and the
    // code-creation endpoint is session-bound), so we deep-link them to it.
    keySettingsUrl() { return OPENROUTER_KEYS_SETTINGS_URL; },
    setModel(id) { writeLS(OR_MODEL_LS, id || null); },
    keySnapshot() { return readLS(OR_KEY_LS); }, // for the Disconnect Undo (restore without re-OAuth)
    restore(key) { writeLS(OR_KEY_LS, key || null); },
    // This key's account readout: usage (always) + limit/remaining (when a per-key
    // limit is set). Best-effort, client-side, the user's own key — null on failure
    // so the UI just hides the strip. Pay-as-you-go keys report a null limit.
    async accountInfo() {
      const key = readLS(OR_KEY_LS);
      if (!key) return null;
      try {
        const res = await fetch(OPENROUTER_KEY_URL, { headers: { Authorization: 'Bearer ' + key } });
        if (!res.ok) return null;
        const d = (await res.json()).data || {};
        return {
          usage: d.usage ?? null,
          limit: d.limit ?? null,
          remaining: d.limit_remaining ?? null,
          usageMonthly: d.usage_monthly ?? null,
          limitReset: d.limit_reset ?? null, // e.g. 'monthly'
          isFreeTier: d.is_free_tier ?? null,
        };
      } catch { return null; }
    },
    // The ACCOUNT wallet — total credits purchased + total usage → real balance.
    // Best-effort: the docs note a management key, but a normal user key reads it in
    // practice; null on any failure so the UI just falls back to the per-key figures.
    async creditsInfo() {
      const key = readLS(OR_KEY_LS);
      if (!key) return null;
      try {
        const res = await fetch(OPENROUTER_CREDITS_URL, { headers: { Authorization: 'Bearer ' + key } });
        if (!res.ok) return null;
        const d = (await res.json()).data || {};
        if (d.total_credits == null && d.total_usage == null) return null;
        const credits = Number(d.total_credits) || 0;
        const usage = Number(d.total_usage) || 0;
        return { credits, usage, balance: credits - usage };
      } catch { return null; }
    },
    // The current model's display name (catalog `name`, e.g. "DeepSeek: R1"), for the
    // reply attribution heading. Falls back to the raw id before the catalog loads.
    modelName() {
      const id = readLS(OR_MODEL_LS) || defaultModel;
      return catalogCache?.find((m) => m.id === id)?.name || id;
    },
    // The active model's per-MILLION price pair, for the pre-send estimate + display.
    // Null until the catalog has loaded (listModels) — callers degrade gracefully.
    modelPrice() {
      const id = readLS(OR_MODEL_LS) || defaultModel;
      const m = catalogCache?.find((x) => x.id === id);
      return m ? { promptPerM: m.promptPerM, completionPerM: m.completionPerM } : null;
    },
    disconnect() { writeLS(OR_KEY_LS, null); writeLS(OR_VERIFIER_LS, null); },
    // OAuth step 1: stash a PKCE verifier and return the URL to redirect to. The
    // caller navigates there; OpenRouter returns to callbackUrl with ?code=.
    async beginAuth(callbackUrl) {
      const verifier = pkceVerifier();
      writeLS(OR_VERIFIER_LS, verifier);
      const challenge = await pkceChallenge(verifier);
      const u = new URL(OPENROUTER_AUTH_URL);
      u.searchParams.set('callback_url', callbackUrl);
      u.searchParams.set('code_challenge', challenge);
      u.searchParams.set('code_challenge_method', 'S256');
      return u.toString();
    },
    // OAuth step 2: exchange the returned ?code (+ stored verifier) for a
    // user-scoped API key. Persists the key, clears the verifier.
    async completeAuth(code) {
      const verifier = readLS(OR_VERIFIER_LS);
      const res = await fetch(OPENROUTER_KEYS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
      });
      if (!res.ok) throw new Error('OpenRouter auth failed (' + res.status + ')');
      const j = await res.json();
      if (!j.key) throw new Error('OpenRouter returned no key');
      writeLS(OR_KEY_LS, j.key);
      writeLS(OR_VERIFIER_LS, null);
      return true;
    },
    // The model catalog with pricing normalized to per-MILLION tokens (the API
    // gives per-token USD strings). Public endpoint; the key is not required.
    async listModels() {
      // Serve the cache (session memo → fresh localStorage) before any network. A
      // self-heal clears catalogCache + the LS entry, so the next call refetches.
      if (catalogCache) return catalogCache;
      const cached = readCachedCatalog();
      if (cached) { catalogCache = cached; return cached; }
      let res;
      try { res = await fetch(OPENROUTER_MODELS_URL); }
      catch (e) { if (catalogCache) return catalogCache; throw e; } // serve stale rather than break the picker
      if (!res.ok) {
        if (catalogCache) return catalogCache;
        throw new Error('OpenRouter models failed (' + res.status + ')');
      }
      const j = await res.json();
      catalogCache = (j.data || []).map((m) => ({
        id: m.id,
        name: m.name || m.id,
        promptPerM: m.pricing ? orPricePerM(m.pricing.prompt) : null,
        completionPerM: m.pricing ? orPricePerM(m.pricing.completion) : null,
        contextLength: m.context_length || m.top_provider?.context_length || null,
        maxOutput: m.top_provider?.max_completion_tokens || null,
        vision: Array.isArray(m.architecture?.input_modalities) && m.architecture.input_modalities.includes('image'),
      }));
      writeCachedCatalog(catalogCache);
      return catalogCache;
    },
    async complete({ messages, json, onToken, signal, onUsage, maxTokens, plugins }) {
      const key = readLS(OR_KEY_LS);
      if (!key) throw new Error('OpenRouter not connected');
      // usage:{include:true} guarantees the authoritative per-request `usage.cost`
      // (USD) rides back in the response — the source of the per-Lattice spend tally.
      // Cache the static system prefix (the big authoring canon) so a fan-out of
      // calls re-reads it at ~0.1x instead of re-paying full input each time.
      const body = { model: this.getModel(), messages: withCachedSystem(messages, this.getModel()), stream: !!onToken, usage: { include: true } };
      // Optional plugins (e.g. the file-parser plugin that extracts an inlined
      // reference PDF server-side, #640). Passed through verbatim when present.
      if (plugins?.length) body.plugins = plugins;
      // max_tokens bounds worst-case completion cost (a runaway reply can't blow the
      // budget). Opt-in per instance: only the Studio sets a ceiling; the Drawing Board
      // (defaultMaxTokens 0) stays uncapped, so its long deck rewrites aren't truncated.
      const cap = maxTokens || defaultMaxTokens;
      if (cap > 0) body.max_tokens = cap;
      if (json) body.response_format = { type: 'json_object' };
      const headers = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key,
        'HTTP-Referer': referer(), // OpenRouter app-ranking headers (optional, polite)
        'X-Title': 'Lattice Drawing Board',
      };
      const send = (modelId) => fetch(OPENROUTER_CHAT_URL, { method: 'POST', headers, body: JSON.stringify({ ...body, model: modelId }), signal });
      let res = await send(body.model);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        // Self-heal: a retired/renamed model id (a stale stored pick can die under
        // the user) → retry ONCE with the rot-proof latest alias, and drop the
        // cached catalog so the picker refetches fresh next open.
        if (isDeadModelError(res.status, errText) && body.model !== defaultModel) {
          catalogCache = null;
          writeLS(OR_CATALOG_LS, null);
          res = await send(defaultModel);
        }
        if (!res.ok) {
          const detail = res.bodyUsed ? errText : await res.text().catch(() => '');
          throw new Error('OpenRouter error ' + res.status + (detail ? ': ' + detail.slice(0, 160) : ''));
        }
      }
      if (!onToken || !res.body) {
        const data = await res.json();
        if (onUsage && data.usage) { try { onUsage(data.usage); } catch {} }
        return data.choices?.[0]?.message?.content ?? '';
      }
      // SSE stream: lines of `data: {json}`; `: OPENROUTER PROCESSING` keep-alives
      // (no `data:` prefix) are skipped; `data: [DONE]` ends it.
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let full = '';
      let usage = null; // the final stream chunk carries usage (cost) when usage:include is set
      const reportUsage = () => { if (onUsage && usage) { try { onUsage(usage); } catch {} } };
      while (true) {
        const { value, done } = await reader.read();
        if (done || signal?.aborted) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') { reportUsage(); return full; }
          try {
            const obj = JSON.parse(payload);
            const t = obj.choices?.[0]?.delta?.content || '';
            if (t) { full += t; onToken(t); }
            if (obj.usage) usage = obj.usage;
          } catch {}
        }
      }
      reportUsage();
      return full;
    },
  };
}

// Transformers.js (WASM) generation — the UNIVERSAL tier. A small instruct model
// loaded from CDN on demand; runs everywhere (no WebGPU), so it's the fallback
// for Safari / mobile where the built-in Prompt API and WebLLM aren't available.
// Slower than the others, so keep prompts short (the chat already truncates).
const MAX_NEW_TOKENS = 128; // a tiny model on a phone is slow per token — keep replies short

// The worker body (module worker, runs the model OFF the main thread so the UI
// never freezes and tokens can paint as they stream). It dynamic-imports
// Transformers.js from the CDN, loads the pipeline on WASM, and streams. If the
// page is cross-origin isolated (SharedArrayBuffer available), onnxruntime-web
// uses multiple threads automatically — no code change here.
const WORKER_SRC = `
let lib = null, gen = null;
self.onmessage = async (e) => {
  const d = e.data || {};
  try {
    if (d.type === 'load') {
      lib = await import(d.url);
      gen = await lib.pipeline('text-generation', d.model, {
        device: 'wasm', dtype: 'q4',
        progress_callback: (p) => self.postMessage({ type: 'progress', progress: (p && p.progress) || 0, file: p && p.file, status: p && p.status }),
      });
      self.postMessage({ type: 'loaded' });
    } else if (d.type === 'generate') {
      const streamer = new lib.TextStreamer(gen.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: (t) => self.postMessage({ type: 'token', id: d.id, t }) });
      const out = await gen(d.messages, { max_new_tokens: d.max || 128, do_sample: false, repetition_penalty: 1.3, no_repeat_ngram_size: 3, streamer });
      const g = out && out[0] && out[0].generated_text;
      const text = Array.isArray(g) ? ((g[g.length - 1] && g[g.length - 1].content) || '') : (typeof g === 'string' ? g : '');
      self.postMessage({ type: 'done', id: d.id, text });
    }
  } catch (err) {
    self.postMessage({ type: d.type === 'load' ? 'load-error' : 'gen-error', id: d.id, error: String((err && err.message) || err) });
  }
};
`;

// The universal generation backend. Prefers a Web Worker (non-blocking, streams);
// falls back to main-thread inference where module workers aren't available.
function transformersGenBackend() {
  let worker = null;
  let isReady = false;
  let mainGen = null; // main-thread fallback pipeline
  let mainLib = null;
  let nextId = 1;
  const pending = new Map(); // generate id -> { onToken, resolve, reject }
  let onLoaded = null;
  let onLoadErr = null;
  let onProg = null;

  function makeWorker() {
    if (worker) return worker;
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    worker = new Worker(url, { type: 'module' });
    worker.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === 'progress') onProg?.({ progress: (d.progress || 0) / 100, text: d.file, status: d.status });
      else if (d.type === 'loaded') { isReady = true; onLoaded?.(true); }
      else if (d.type === 'load-error') onLoadErr?.(new Error(d.error || 'load failed'));
      else if (d.type === 'token') pending.get(d.id)?.onToken?.(d.t);
      else if (d.type === 'done') { const p = pending.get(d.id); pending.delete(d.id); p?.resolve?.(d.text || ''); }
      else if (d.type === 'gen-error') { const p = pending.get(d.id); pending.delete(d.id); p?.reject?.(new Error(d.error || 'generation failed')); }
    };
    worker.onerror = (ev) => onLoadErr?.(new Error(ev.message || 'worker error'));
    return worker;
  }

  // Main-thread fallback (no module-worker support): the previous in-page path.
  async function loadMain(onProgress) {
    mainLib = await import(/* @vite-ignore */ TRANSFORMERS_URL);
    mainGen = await mainLib.pipeline('text-generation', UNIVERSAL_MODEL, {
      device: 'wasm',
      dtype: 'q4',
      progress_callback: (p) => onProgress?.({ progress: (p?.progress || 0) / 100, text: p?.file || p?.status, status: p?.status }),
    });
    isReady = true;
  }

  return {
    name: 'transformers',
    async load(onProgress, signal) {
      // Try the worker first; fall back to main-thread if it can't even be created.
      try {
        makeWorker();
      } catch {
        await loadMain(onProgress);
        return true;
      }
      onProg = onProgress;
      try {
        await new Promise((resolve, reject) => {
          onLoaded = resolve;
          onLoadErr = reject;
          worker.postMessage({ type: 'load', url: TRANSFORMERS_URL, model: UNIVERSAL_MODEL });
          if (signal) signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
        return true;
      } catch (e) {
        // The worker loaded but couldn't bring up the model (e.g. an iOS
        // module-worker cross-origin-import restriction). Tear it down and fall
        // back to main-thread inference so the model still works (just blocking).
        if (String(e?.message) === 'aborted') throw e;
        try { worker.terminate(); } catch {}
        worker = null;
        await loadMain(onProgress);
        return true;
      }
    },
    ready() { return isReady; },
    async complete({ messages, onToken, signal }) {
      if (!isReady) throw new Error('universal model not loaded');
      // Worker path — stream tokens back without blocking the UI.
      if (worker) {
        const id = nextId++;
        return new Promise((resolve, reject) => {
          pending.set(id, { onToken, resolve, reject });
          worker.postMessage({ type: 'generate', id, messages, max: MAX_NEW_TOKENS });
          if (signal) signal.addEventListener('abort', () => { pending.delete(id); reject(new Error('aborted')); }, { once: true });
        });
      }
      // Main-thread fallback.
      const streamer = onToken
        ? new mainLib.TextStreamer(mainGen.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: (t) => onToken(t) })
        : undefined;
      const out = await mainGen(messages, { ...GEN_OPTS, streamer });
      const g = out?.[0]?.generated_text;
      if (Array.isArray(g)) return g.at(-1)?.content ?? '';
      return typeof g === 'string' ? g : '';
    },
  };
}

// ── JSON discipline — force structure, validate before returning ──────────────

export function extractJson(text) {
  if (text && typeof text === 'object') return text;
  if (typeof text !== 'string') return null;
  // Tolerate prose around the object / a fenced ```json block.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(body.slice(start, end + 1)); } catch { return null; }
}

// ── The adapter ───────────────────────────────────────────────────────────────

/** @param {{ getSettings?: () => Record<string, unknown>, explicitTierWins?: boolean, defaultModel?: string, defaultMaxTokens?: number }} [opts] */
export function createArchitectModel({ getSettings, explicitTierWins = false, defaultModel = DEFAULT_OR_MODEL, defaultMaxTokens = 0 } = {}) {
  const settings = () => (getSettings ? getSettings() : {}) || {};
  const modelOn = () => settings().modelEnabled !== false; // default on; one switch off
  // Tier-precedence policy. Default (false): the connected cloud always wins over a
  // local tier — the Drawing Board relies on this (it has no "back to cloud" control,
  // so a loaded local model must stay dormant under a connection). When true (the
  // Studio): a DELIBERATE on-device pick (tierPref set by the user) outranks the
  // cloud, so "connected" and "active" are decoupled — the user runs on-device while
  // staying connected, and one tap (tierPref→'auto') resumes the cloud. See
  // engineering/decisions/2026-06-29-studio-tier-precedence.md.

  let injected = null; // test hook — a MockBackend
  const prompt = promptApiBackend();
  const webllm = webllmBackend();
  let openrouter = openRouterBackend(defaultModel, defaultMaxTokens);
  let universal = transformersGenBackend();
  let promptAvail = 'unknown';
  let embedder = null; // lazy Transformers.js pipeline
  let embedTried = false;
  let tierPref = 'auto'; // 'auto' | 'prompt-api' | 'webllm' | 'universal' | 'floor'

  async function refreshAvailability() {
    promptAvail = await detectPromptApi();
    return promptAvail;
  }

  // Pick the active generation backend by readiness + preference. The model-off
  // switch wins over everything (incl. an injected test backend) — that's the
  // offline guarantee and the test hook for forcing the floor.
  function pickBackend() {
    if (!modelOn() || tierPref === 'floor') return floorBackend;
    if (injected) return injected;
    // A deliberate on-device selection that is actually ready (the user picked this
    // tier — not the 'auto' default).
    const explicit =
      (tierPref === 'webllm' && webllm.ready() && webllm) ||
      (tierPref === 'universal' && universal.ready() && universal) ||
      (tierPref === 'prompt-api' && promptAvail === 'available' && prompt) ||
      null;
    // Studio policy (explicitTierWins): an explicit on-device pick outranks the
    // connected cloud — the user chose to run local while staying connected.
    if (explicitTierWins && explicit) return explicit;
    // The connected OpenRouter cloud (Converse) is otherwise the best backend and is
    // the default active tier whenever connected.
    if (openrouter.ready()) return openrouter;
    // No cloud: an explicit pick applies, then the auto ladder — WebLLM (advanced,
    // explicitly summoned) → built-in Prompt API (free, instant) → Transformers.js
    // universal (loaded WASM) → floor.
    if (explicit) return explicit;
    if (webllm.ready()) return webllm;
    if (promptAvail === 'available') return prompt;
    if (universal.ready()) return universal;
    return floorBackend;
  }

  async function complete(opts) {
    const { json, fallback } = opts;
    const backend = pickBackend();
    if (backend === floorBackend) return floorBackend.complete(opts);
    try {
      const out = await backend.complete(opts);
      if (!json) return (out && String(out).trim()) || fallback || '';
      const parsed = extractJson(out);
      return parsed ?? (fallback ?? {}); // validate-or-floor
    } catch {
      return floorBackend.complete(opts); // any model failure → the floor
    }
  }

  // Embeddings — always the same bge-small model, loaded from CDN once, cached by
  // the browser Cache API. Returns Array<number>[] or null (caller keyword-falls
  // back). Never throws.
  async function embed(texts) {
    if (!modelOn() || !hasWindow) return null;
    const list = Array.isArray(texts) ? texts : [texts];
    if (injected?.embed) return injected.embed(list);
    if (!embedder && !embedTried) {
      embedTried = true;
      try {
        const t = await import(/* @vite-ignore */ TRANSFORMERS_URL);
        embedder = await t.pipeline('feature-extraction', EMBED_MODEL);
      } catch { embedder = null; }
    }
    if (!embedder) return null;
    try {
      const out = await embedder(list, { pooling: 'mean', normalize: true });
      // transformers.js returns a Tensor; .tolist() → number[][].
      return typeof out.tolist === 'function' ? out.tolist() : out;
    } catch { return null; }
  }

  // Announce a generation-tier change (connect / disconnect / model swap / summon)
  // so live surfaces re-evaluate what they offer — e.g. the Coach's per-finding
  // "Fix" button, gated on a capable tier, appears the moment a model connects
  // instead of waiting for the next deck edit. Fire-and-forget; SSR/Node no-op.
  const emitChange = () => {
    if (!hasWindow) return;
    try { window.dispatchEvent(new Event('db-model-changed')); } catch {}
  };

  return {
    complete,
    embed,
    refreshAvailability,
    availability() {
      return {
        generation: pickBackend().name,
        promptApi: promptAvail,
        webgpu: detectWebGPU(),
        webllmReady: webllm.ready(),
        universalReady: universal.ready(),
        openRouterReady: openrouter.ready(),
        embeddings: modelOn() && hasWindow,
        modelOn: modelOn(),
      };
    },
    setTier(name) { tierPref = name; emitChange(); },
    // OpenRouter cloud tier — one-click OAuth (PKCE), the user's own account.
    // beginOpenRouterAuth() returns the URL to redirect to; the page navigates
    // there. On return (?code=) the page calls resumeOpenRouterAuth(code), which
    // exchanges the code for a key — OpenRouter is then the active cloud backend.
    hasPendingOpenRouterAuth() { return openrouter.hasPendingAuth(); },
    async beginOpenRouterAuth(callbackUrl) { return openrouter.beginAuth(callbackUrl); },
    async resumeOpenRouterAuth(code) {
      await openrouter.completeAuth(code);
      emitChange();
      return true;
    },
    listOpenRouterModels() { return openrouter.listModels(); },
    openRouterModel() { return openrouter.getModel(); },
    setOpenRouterModel(id) { openrouter.setModel(id); emitChange(); },
    openRouterModelName() { return openrouter.modelName(); },
    openRouterAccount() { return openrouter.accountInfo(); },
    openRouterCredits() { return openrouter.creditsInfo(); }, // the account wallet (balance)
    openRouterKeySettingsUrl() { return openrouter.keySettingsUrl(); }, // where to set a hard per-key cap
    openRouterModelPrice() { return openrouter.modelPrice(); }, // active model's per-M price (for estimates)
    // Snapshot/restore the stored key so the settings UI can offer an Undo on
    // Disconnect (mirroring the deck-deletion guardrail) without re-running OAuth.
    openRouterKeySnapshot() { return openrouter.keySnapshot(); },
    // The connected key, for sibling adapters that reuse the same OAuth connection
    // (e.g. the VoiceModel's openrouter-tts rung). Null when not connected.
    openRouterKey() { return openrouter.keySnapshot(); },
    restoreOpenRouter(key) { openrouter.restore(key); emitChange(); },
    disconnectOpenRouter() { openrouter.disconnect(); emitChange(); },
    // WebLLM opt-in — the deliberate "summon the Architect" (~1GB, WebGPU) download.
    async summon(onProgress, signal) {
      await webllm.load(onProgress, signal);
      tierPref = 'webllm';
      emitChange();
      return true;
    },
    // The universal Transformers.js tier — the no-WebGPU fallback (Safari/mobile).
    // ~350MB WASM model loaded on demand; once loaded it's used when there's no
    // Prompt API. Never throws to the caller's flow — caller surfaces progress.
    async loadUniversal(onProgress, signal) {
      await universal.load(onProgress, signal);
      emitChange();
      return true;
    },
    webgpu: detectWebGPU(),
    // Test hooks (used by the Node suite to exercise the model-on path + ladder).
    __setBackend(b) { injected = b; },
    __setPromptAvailability(a) { promptAvail = a; },
    __setUniversal(b) { universal = b; },
    __setOpenRouter(b) { openrouter = b; },
  };
}

// A scripted backend for tests + previews — streams canned tokens / returns
// canned JSON, so the full compose→stream→parse→apply flow is exercised with no
// real model. Not used in production paths.
export function MockBackend({ reply = 'mock reply', jsonReply = null, embedDim = 32 } = {}) {
  return {
    name: 'mock',
    async complete({ json, onToken, fallback }) {
      if (json) return jsonReply ?? fallback ?? {};
      const text = typeof reply === 'function' ? reply() : reply;
      if (onToken) for (const tok of String(text).split(/(\s+)/)) onToken(tok);
      return text;
    },
    async embed(list) {
      // Deterministic bag-of-words pseudo-embeddings: each token is hashed to a
      // dimension and counted. Stable across runs AND lexically meaningful, so the
      // retrieval pipeline (embed → cosineRank) can be tested end-to-end — shared
      // tokens raise cosine, disjoint vocab → ~0 — without a real embedder.
      return list.map((s) => {
        const v = new Array(embedDim).fill(0);
        for (const tok of String(s).toLowerCase().split(/\W+/).filter(Boolean)) {
          let h = 0;
          for (let i = 0; i < tok.length; i++) h = (h * 31 + tok.charCodeAt(i)) >>> 0;
          v[h % embedDim] += 1;
        }
        return v;
      });
    },
  };
}
