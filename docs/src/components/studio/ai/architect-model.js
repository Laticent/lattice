// The Drawing Board — the ArchitectModel adapter (the on-device model ladder).
//
// One interface, four backends, behind feature detection. App code never
// branches on the backend: complete() ALWAYS resolves to text/JSON, falling
// through the ladder to the deterministic floor when no model is present, so a
// missing model degrades to the proven Phase-1 behavior rather than breaking.
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
// Sibling render-path note: this is docs-site app code (the Studio's AI cluster —
// it moved here from the Drawing Board's tree in the succession's P1); it does not
// touch the engine render paths.

import { familyOf, healTarget } from '../../../lib/model-family.js';
import { clearOutOfCredit, healSelections, isRetired, markRetired, noteKeyRefusal, noteOutOfCredit } from '../../../lib/model-retired.js';
import { CHAT_CLOUD_PROVIDERS, chatModelFor, fillFromConnections, isSet, readChatSelection, readImageSelection, selectChat, watchSelectionStorage } from '../../../lib/model-selection.js';
import { isOpenRouterKeyEvent, KEY_PROVIDERS, noteOpenRouterStatus, openRouterKeyAgeMs, openRouterKeyRejected, providerKeyState, readOpenRouterKey, readProviderKey, writeOpenRouterKey, writeOpenRouterVia } from '../../../lib/openrouter-key.js';
import { classifyProviderError } from '../../../lib/provider-errors.js';
import { directBackend } from './direct-providers.js';

// Re-exported so architect.ts can open the sealed key from this lazily loaded chunk.
export { loadOpenRouterKey, loadProviderKey } from '../../../lib/openrouter-key.js';

import { withCachedSystem, withCachedTail } from './or-cache.js';
import { readCachingEnabled, setChatRouteReader } from './spend.js';

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
const FRESH_KEY_MS = 60_000; // a key written this recently gets two more asks before a 401 counts
const OPENROUTER_CREDITS_URL = 'https://openrouter.ai/api/v1/credits'; // GET: account wallet (total_credits/total_usage)
const OPENROUTER_KEYS_SETTINGS_URL = 'https://openrouter.ai/settings/keys'; // where a user sets a per-key spend limit
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_GENERATION_URL = 'https://openrouter.ai/api/v1/generation'; // GET ?id=<gen> → this request's authoritative total_cost
// The connect-time default is OpenRouter's server-resolved "latest" ALIAS (the
// `~vendor/family-latest` ids), not a pinned version — so it can never rot when a
// model is retired/renamed (a pinned id 404s "No endpoints found"; the alias keeps
// resolving to the current latest). Verified callable; resolves e.g. to
// anthropic/claude-4.5-haiku-*. See engineering/decisions/2026-06-29-studio-model-liveness.md.
const DEFAULT_OR_MODEL = '~anthropic/claude-sonnet-latest';
// A catalog fetch that has not answered in this long is abandoned, so the next call can try again.
const CATALOG_FETCH_TIMEOUT_MS = 15000;
// The author's OpenRouter key is read and written ONLY through lib/openrouter-key.js.
const OR_VERIFIER_LS = 'lattice-db-or-verifier'; // transient PKCE verifier (deleted after exchange)
const OR_CATALOG_LS = 'lattice-db-or-catalog'; // {fetchedAt, models} — TTL-cached /models catalog
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000; // refetch the catalog at most once a day
const EMBED_MODEL = 'Xenova/bge-small-en-v1.5';
// Backstop for a warm embed worker that dies silently (no `onerror`) — resolve the
// awaiting caller to null (→ lexical fallback) rather than hang the generate path.
const EMBED_TIMEOUT_MS = 12000;
const WEBLLM_MODEL = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
// The universal generation tier: a small instruct model that runs in WASM via
// Transformers.js — no WebGPU, works on Safari / mobile. Qwen2.5-0.5B at q4 is
// ~350 MB; benchmarked in Node against SmolLM2-135M, it's the smallest model
// that gives genuinely useful, non-rambling answers for the narrow tasks here
// (short coaching + rewrites). 135M was coherent at the sentence level but
// invented numbers and ignored instructions. Desktops reach for the built-in
// Prompt API or the WebLLM tier for stronger answers.
const UNIVERSAL_MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct';
// The on-device chat models by selection provider, for the readouts (the chip, the Workspace).
const DEVICE_MODEL_IDS = { webllm: WEBLLM_MODEL, universal: UNIVERSAL_MODEL, 'prompt-api': 'prompt-api' };
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

/**
 * Are these on-device weights already in Cache Storage? Reads the browser's caches only: no
 * network request. The model spine warms a SELECTED on-device model at boot only when this is
 * true, and never downloads ~1 GB unprompted (owner decision, 2026-11-07).
 */
export async function detectCachedWeights(modelId) {
  try {
    if (typeof caches === 'undefined') return false;
    for (const cn of await caches.keys()) {
      const cache = await caches.open(cn);
      for (const req of await cache.keys()) if (req.url.includes(modelId)) return true;
    }
    return false;
  } catch { return false; }
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

// Prompt-cache policy — which vendors cache, and how a request marks the system
// block — lives in ./or-cache.js, imported above. It was split out of this file so
// the Workspace settings UI can read `orSupportsCache` SYNCHRONOUSLY on its render
// path without a static import of this whole provider layer, which is otherwise
// reached only through architect.ts's dynamic import() and so is not in the eager
// Studio bundle (#1773).

// OpenRouter cloud backend — the { ready, complete } shape plus the OAuth methods
// (beginAuth → redirect → completeAuth) and the catalog (listModels, with
// per-million pricing) the settings picker reads. OpenAI-compatible streaming. The
// deck text leaves the device → gated behind explicit consent in the UI before
// connect() is ever offered.
function openRouterBackend(defaultModel = DEFAULT_OR_MODEL, defaultMaxTokens = 0) {
  const referer = () => (typeof location !== 'undefined' ? location.origin : 'https://lattice.dev');
  let catalogCache = readCachedCatalog(); // id→{name,…} catalog; seeded from the TTL localStorage cache so price/name survive a reload
  let catalogInflight = null; // the one catalog fetch in progress: concurrent callers (chat, picker, alias lookup) share it instead of each fetching
  let catalogGen = 0; // bumped when the cache is invalidated: a fetch that started before must not write its stale answer back
  // Every write of the key goes through lib/openrouter-key.js, so a fresh key (or none)
  // always clears the "rejected" mark the previous key earned.
  const setKey = (key) => writeOpenRouterKey(key);
  // OpenRouter's answer about the key a request carried: a 401 marks it rejected (revoked,
  // deleted or expired), a 2xx clears an earlier mark, and an answer about a key that is no
  // longer stored is ignored (lib/openrouter-key.js). The key itself stays, so the author sees
  // "rejected · Reconnect" rather than a silent fall to "not connected".
  const noteStatus = (status, key) => noteOpenRouterStatus(status, key);
  return {
    name: 'openrouter',
    ready() { return !!readOpenRouterKey(); },
    hasPendingAuth() { return !!readLS(OR_VERIFIER_LS); },
    keyInvalid() { return openRouterKeyRejected(); },
    // The model comes from the chat selection (lib/model-selection.js): the selected one when
    // OpenRouter is the selected provider, else the author's last OpenRouter pick, else the default.
    getModel() { return chatModelFor('openrouter') || defaultModel; },
    // Where the user sets a HARD, server-enforced per-key spend limit. We can't set
    // it from the browser PKCE flow (the redirect can't carry a limit, and the
    // code-creation endpoint is session-bound), so we deep-link them to it.
    keySettingsUrl() { return OPENROUTER_KEYS_SETTINGS_URL; },
    setModel(id) { selectChat({ provider: 'openrouter', model: id || '' }); },
    keySnapshot() { return readOpenRouterKey(); }, // for the Disconnect Undo (restore without re-OAuth)
    restore(key) { setKey(key || null); if (key) this.listModels().catch(() => {}); },
    // This key's account readout: usage (always) + limit/remaining (when a per-key
    // limit is set). Best-effort, client-side, the user's own key — null on failure
    // so the UI just hides the strip. Pay-as-you-go keys report a null limit.
    async accountInfo() {
      const key = readOpenRouterKey();
      if (!key) return null;
      try {
        let res = await fetch(OPENROUTER_KEY_URL, { headers: { Authorization: 'Bearer ' + key } });
        // A key OpenRouter minted seconds ago (a fresh sign-in) can answer 401 here before it is
        // live everywhere. Ask again, twice, before calling it rejected: a key that is really
        // dead is still marked within about ten seconds (owner report, 2026-11-08: "Key
        // rejected" right after signing in, while the same key read Ready elsewhere).
        let asks = 1;
        for (const wait of [2500, 7000]) {
          if (res.status !== 401 || openRouterKeyAgeMs() > FRESH_KEY_MS || key !== readOpenRouterKey()) break;
          await new Promise((r) => setTimeout(r, wait));
          res = await fetch(OPENROUTER_KEY_URL, { headers: { Authorization: 'Bearer ' + key } });
          asks++;
        }
        if (res.status === 401 && key === readOpenRouterKey()) {
          const why = await res.clone().json().then((j) => j?.error?.message ?? '').catch(() => '');
          const age = openRouterKeyAgeMs();
          noteKeyRefusal('openrouter', { status: 401, message: why, ageMs: Number.isFinite(age) ? age : null, asks });
        }
        noteStatus(res.status, key);
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
      const key = readOpenRouterKey();
      if (!key) return null;
      try {
        // Not tapped for the rejected mark: OpenRouter documents /credits as needing a
        // management key, so a refusal here does not prove the key is dead.
        const res = await fetch(OPENROUTER_CREDITS_URL, { headers: { Authorization: 'Bearer ' + key } });
        if (!res.ok) return null;
        const d = (await res.json()).data || {};
        if (d.total_credits == null && d.total_usage == null) return null;
        const credits = Number(d.total_credits) || 0;
        const usage = Number(d.total_usage) || 0;
        return { credits, usage, balance: credits - usage };
      } catch { return null; }
    },
    // The AUTHORITATIVE cost of one generation, by its stream id — used to correct the
    // ESTIMATE recorded when a streamed turn is aborted (Stop), where the usage chunk
    // never arrived. OpenRouter computes cost asynchronously, so it may 404/omit the cost
    // for a moment after the request ends; retry a few times with backoff. Best-effort:
    // null on any failure, so the estimate simply stands (never a fabricated correction).
    async generationCost(id) {
      const key = readOpenRouterKey();
      if (!key || !id) return null;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = await fetch(`${OPENROUTER_GENERATION_URL}?id=${encodeURIComponent(id)}`, { headers: { Authorization: 'Bearer ' + key } });
          if (res.ok) {
            const d = (await res.json()).data || {};
            const cost = Number(d.total_cost);
            if (Number.isFinite(cost)) return cost;
          }
        } catch { /* transient — retry */ }
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
      return null;
    },
    // The current model's display name (catalog `name`, e.g. "DeepSeek: R1"), for the
    // reply attribution heading. Falls back to the raw id before the catalog loads.
    modelName() {
      const id = this.getModel();
      return catalogCache?.find((m) => m.id === id)?.name || id;
    },
    // The active model's per-MILLION price pair, for the pre-send estimate + display.
    // Null until the catalog has loaded (listModels) — callers degrade gracefully.
    modelPrice(forId) {
      const id = forId || this.getModel();
      let m = catalogCache?.find((x) => x.id === id);
      // A `~vendor/name-latest` alias is not itself listed: price it at its family's dearest member, so a spending cap errs on the
      // safe side.
      if (!m && id.startsWith('~')) {
        const family = id.slice(1).replace(/-latest$/, '');
        const kin = (catalogCache || []).filter((x) => x.id.startsWith(family) && x.promptPerM != null);
        m = kin.sort((a, b) => (b.completionPerM ?? 0) - (a.completionPerM ?? 0))[0];
      }
      // `contextLength` only for a listed model: an alias's dearest family member may have a different window, so it stays null there.
      return m ? { promptPerM: m.promptPerM, completionPerM: m.completionPerM, imagePerM: m.imagePerM ?? null, contextLength: m.id === id ? m.contextLength ?? null : null } : null;
    },
    disconnect() { setKey(null); writeLS(OR_VERIFIER_LS, null); },
    clearPendingAuth() { writeLS(OR_VERIFIER_LS, null); }, // drop a dead PKCE verifier; the key, if any, stays
    // A PASTED key, checked before it is stored: the status /auth/key answers for it (0 when
    // the request never reached OpenRouter). Read-only and free; nothing is written here.
    async checkKey(key) {
      try {
        const res = await fetch(OPENROUTER_KEY_URL, { headers: { Authorization: 'Bearer ' + key } });
        return res.status;
      } catch { return 0; }
    },
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
      setKey(j.key);
      writeLS(OR_VERIFIER_LS, null);
      // A key was just written, so something can spend now: have the price list before it does (see the prefetch at model creation).
      this.listModels().catch(() => {});
      return true;
    },
    // The model catalog with pricing normalized to per-MILLION tokens (the API
    // gives per-token USD strings). Public endpoint; the key is not required.
    // Forget the catalog (memo and stored copy): the next listModels() refetches, and a fetch already out cannot write its answer back.
    catalogSnapshot() { return catalogCache; }, // the priced list, for the direct providers' estimates (null before it loads)
    invalidateCatalog() {
      catalogCache = null;
      catalogGen++;
      catalogInflight = null;
      writeLS(OR_CATALOG_LS, null);
    },
    listModels() {
      if (catalogCache) return Promise.resolve(catalogCache);
      if (!catalogInflight) {
        // Cleared only if still ours: a fetch that predates a self-heal must not clear the slot of the fresh one that replaced it.
        const p = this.loadCatalog().finally(() => { if (catalogInflight === p) catalogInflight = null; });
        catalogInflight = p;
      }
      return catalogInflight;
    },
    async loadCatalog() {
      // Serve the cache (session memo → fresh localStorage) before any network. A
      // self-heal clears catalogCache + the LS entry, so the next call refetches.
      if (catalogCache) return catalogCache;
      const cached = readCachedCatalog();
      if (cached) { catalogCache = cached; return cached; }
      const gen = catalogGen;
      let res;
      // A fetch that never answers would pin every caller to this one in-flight promise, so it is abandoned after 15 s (the next call tries again).
      try { res = await fetch(OPENROUTER_MODELS_URL, typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(CATALOG_FETCH_TIMEOUT_MS) } : undefined); }
      catch (e) { if (catalogCache) return catalogCache; throw e; } // serve stale rather than break the picker
      if (!res.ok) {
        if (catalogCache) return catalogCache;
        throw new Error('OpenRouter models failed (' + res.status + ')');
      }
      const j = await res.json();
      const list = (j.data || []).map((m) => ({
        id: m.id,
        name: m.name || m.id,
        promptPerM: m.pricing ? orPricePerM(m.pricing.prompt) : null,
        completionPerM: m.pricing ? orPricePerM(m.pricing.completion) : null,
        // 30 of 461 models list it (19 without the :batch variants; all Google, 2026-10-13), each equal to its prompt price; null elsewhere.
        imagePerM: m.pricing ? orPricePerM(m.pricing.image) : null,
        contextLength: m.context_length || m.top_provider?.context_length || null,
        maxOutput: m.top_provider?.max_completion_tokens || null,
        vision: Array.isArray(m.architecture?.input_modalities) && m.architecture.input_modalities.includes('image'),
        // Absent on a catalog cached before this field existed: callers read `undefined` as unknown.
        video: Array.isArray(m.architecture?.input_modalities) && m.architecture.input_modalities.includes('video'),
        // The model a `~…-latest` alias currently points at (OpenRouter's `alias_target.slug`); null for a plain id, and absent on a catalog cached before this field.
        aliasSlug: m.alias_target?.slug || null,
      }));
      // The cache was invalidated while this fetch was out: hand back what it got, but touch neither the cache nor the stored copy, which belong to the refetch the invalidation asked for.
      if (gen !== catalogGen) return list;
      catalogCache = list;
      writeCachedCatalog(list);
      return list;
    },
    async complete({ messages, json, onToken, signal, onUsage, onGenerationId, onFinishReason, maxTokens, plugins, cacheTtl, tools, toolChoice, onToolCalls, onToolStart, onReasoning, cacheTail, model: modelOverride, pinnedModel, onAnsweredBy, reasoningEffort }) {
      const key = readOpenRouterKey();
      if (!key) throw new Error('OpenRouter not connected');
      // usage:{include:true} guarantees the authoritative per-request `usage.cost`
      // (USD) rides back in the response — the source of the per-Lattice spend tally.
      // Cache the static system prefix (the big authoring canon) so a fan-out of
      // calls re-reads it at ~0.1x instead of re-paying full input each time — unless
      // the author opted OUT in settings. The opt-out is a real user choice (a cache
      // WRITE costs 1.25x, so a user who sends one-off turns rather than bursts pays
      // more for caching than they save); it was previously written but never read,
      // so the toggle did nothing. Consulted per turn so a change takes effect next send.
      const cacheOn = readCachingEnabled();
      // `cacheTtl` opts a caller into a LONGER breakpoint than the provider default (5 min).
      // The chat asks for '1h': a conversation has think-gaps, and a 1h write costs 2x base
      // input against 1.25x for 5m — but one avoided re-write of the ~17K-token prefix more
      // than pays that back, so it wins after a single gap longer than five minutes. Ported
      // with its reasoning from the Drawing Board's chat, which set it explicitly.
      // `cacheTail` (the chat agent's tool loop) adds a rolling breakpoint on the newest
      // message so each round reads the previous rounds from cache; see withCachedTail.
      // `model` lets ONE call run on a different model than the chat's (the Library's photo description uses the image model
      // the author picked); `reasoningEffort` asks a reasoning-capable model to think harder. Neither is set by any other caller.
      const modelId = modelOverride || pinnedModel || this.getModel();
      const cached = cacheOn ? withCachedSystem(messages, modelId, cacheTtl) : messages;
      const body = { model: modelId, messages: cacheOn && cacheTail ? withCachedTail(cached, modelId) : cached, stream: !!onToken, usage: { include: true } };
      if (reasoningEffort) body.reasoning = { effort: reasoningEffort };
      // Optional plugins (e.g. the file-parser plugin that extracts an inlined
      // reference PDF server-side, #640). Passed through verbatim when present.
      if (plugins?.length) body.plugins = plugins;
      // max_tokens bounds worst-case completion cost (a runaway reply can't blow the
      // budget). Opt-in per instance: only the Studio sets a ceiling; the Drawing Board
      // (defaultMaxTokens 0) stays uncapped, so its long deck rewrites aren't truncated.
      const cap = maxTokens || defaultMaxTokens;
      if (cap > 0) body.max_tokens = cap;
      if (json) body.response_format = { type: 'json_object' };
      // Tool calling (the Studio chat agent). The tools ride verbatim; the calls the model
      // makes come back through `onToolCalls` once the reply ends — the text return value
      // stays the prose, so every caller that never passes tools is unaffected.
      if (tools?.length) {
        body.tools = tools;
        // 'none' still sends the tools: Anthropic-family endpoints refuse a history that holds
        // tool calls unless the tools are defined, so the agent's last round says 'none' instead
        // of dropping them.
        if (toolChoice) body.tool_choice = toolChoice;
      }
      const reportTools = (calls) => {
        if (!onToolCalls || !calls?.length) return;
        try { onToolCalls(calls); } catch {}
      };
      const headers = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key,
        'HTTP-Referer': referer(), // OpenRouter app-ranking headers (optional, polite)
        'X-Title': 'Lattice Drawing Board',
      };
      const send = (modelId) => fetch(OPENROUTER_CHAT_URL, { method: 'POST', headers, body: JSON.stringify({ ...body, model: modelId }), signal });
      // A retired model is healed one level up, within its family and on this route only
      // (architect-model `complete`, 2026-11-08-studio-ai-routes-ux.md rule 1): this transport
      // never swaps the model on its own. It reports the id that ANSWERED, so a provider that
      // reroutes a retired id silently is caught.
      const res = await send(body.model);
      if (!res.ok) {
        noteStatus(res.status, key);
        const detail = await res.text().catch(() => '');
        if (res.status === 401) {
          const age = openRouterKeyAgeMs();
          noteKeyRefusal('openrouter', { status: 401, message: /"message"\s*:\s*"([^"]*)/.exec(detail)?.[1] ?? detail, ageMs: Number.isFinite(age) ? age : null });
        }
        throw new Error('OpenRouter error ' + res.status + (detail ? ': ' + detail.slice(0, 160) : ''));
      }
      const answered = (id) => { if (onAnsweredBy && id) { try { onAnsweredBy(id); } catch {} onAnsweredBy = null; } };
      noteStatus(res.status, key); // a success clears a rejected mark this key earned earlier
      // `finish_reason` is the transport's own account of WHY the reply stopped. Nothing
      // read it before, so a reply cut off at max_tokens ('length') was indistinguishable
      // from a finished one — and the edit parser downstream then salvaged a partial slide
      // out of it. Reported, never thrown: a truncated reply still has usable prose.
      const reportFinish = (r) => { if (onFinishReason && r) { try { onFinishReason(r); } catch {} } };
      if (!onToken || !res.body) {
        const data = await res.json();
        answered(data.model);
        if (onUsage && data.usage) { try { onUsage(data.usage); } catch {} }
        reportFinish(data.choices?.[0]?.finish_reason || data.choices?.[0]?.native_finish_reason);
        reportTools(data.choices?.[0]?.message?.tool_calls);
        return data.choices?.[0]?.message?.content ?? '';
      }
      // SSE stream: lines of `data: {json}`; `: OPENROUTER PROCESSING` keep-alives
      // (no `data:` prefix) are skipped; `data: [DONE]` ends it.
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let full = '';
      let usage = null; // the final stream chunk carries usage (cost) when usage:include is set
      let finish = null; // the chunk that ends the turn carries finish_reason ('stop' | 'length' | …)
      // Streamed tool calls arrive as fragments keyed by `index`: the first carries the id
      // and name, the rest append to `function.arguments` (a JSON string, split anywhere).
      const calls = [];
      const startedCalls = new Set();
      // An error OpenRouter sends INSIDE a 200 stream (the provider dropped mid-reply). Its
      // HTTP status was already 200, so nothing above saw it; read, it used to end the turn as
      // an empty reply and run any half-streamed tool call on cut-off arguments.
      let streamError = null;
      const reportUsage = () => {
        if (onUsage && usage) { try { onUsage(usage); } catch {} }
        reportFinish(finish);
        reportTools(calls.filter(Boolean));
      };
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
            // The generation id (same across chunks) — surfaced once so the caller can
            // fetch the authoritative cost if this turn is later aborted (usage never arrives).
            if (obj.id && onGenerationId) { try { onGenerationId(obj.id); } catch {} onGenerationId = null; }
            answered(obj.model);
            const t = obj.choices?.[0]?.delta?.content || '';
            if (t) { full += t; onToken(t); }
            // A reasoning model streams its thinking beside the answer (`delta.reasoning`, or the
            // structured `reasoning_details`). It is already billed and already on the wire, so
            // surfacing it asks for nothing more: we never send a `reasoning` setting to get it.
            if (onReasoning) {
              const dl = obj.choices?.[0]?.delta;
              const th = (typeof dl?.reasoning === 'string' && dl.reasoning) || (Array.isArray(dl?.reasoning_details) ? dl.reasoning_details.map((x) => (typeof x?.text === 'string' ? x.text : typeof x?.summary === 'string' ? x.summary : '')).join('') : '');
              if (th) { try { onReasoning(th); } catch {} }
            }
            for (const d of obj.choices?.[0]?.delta?.tool_calls || []) {
              // No `index` (some providers omit it): a fragment WITH an id starts a call, one
              // without continues the last — never a nameless call of its own.
              const i = Number.isInteger(d.index) ? d.index : d.id || !calls.length ? calls.length : calls.length - 1;
              const c = (calls[i] ||= { id: '', type: 'function', function: { name: '', arguments: '' } });
              if (d.id) c.id = d.id;
              if (d.function?.name) {
                c.function.name += d.function.name;
                // A call's NAME arrives in its first fragments, long before its arguments finish —
                // a whole slide inside `edit_slides` streams for seconds with no prose. Tell the
                // caller once per call so the panel can say what is being drafted meanwhile.
                if (onToolStart && !startedCalls.has(i)) { startedCalls.add(i); try { onToolStart(c.function.name); } catch {} }
              }
              if (d.function?.arguments) c.function.arguments += d.function.arguments;
            }
            const fr = obj.choices?.[0]?.finish_reason || obj.choices?.[0]?.native_finish_reason;
            if (fr) finish = fr;
            if (obj.usage) usage = obj.usage;
            if (obj.error) streamError = obj.error;
          } catch {}
          // Thrown only to a caller that sent TOOLS (the chat agent), which turns it into the
          // cause and a remedy. Every other caller keeps the partial prose it had before.
          if (streamError && body.tools) {
            if (onUsage && usage) { try { onUsage(usage); } catch {} }
            try { reader.cancel(); } catch {} // release the body rather than leave it open
            throw new Error('OpenRouter error ' + (Number(streamError.code) >= 400 ? streamError.code : 502) + ': ' + JSON.stringify({ error: streamError }).slice(0, 300));
          }
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

// ── Embeddings (bge-small) — WORKER-ONLY ──────────────────────────────────────
// The embedder runs in a module Web Worker, NEVER on the main thread — the same
// off-thread model the generation tier uses, applied to feature-extraction. This
// is deliberate and load-bearing: a ~30MB onnxruntime-web WASM pipeline init on
// the MAIN thread blocks the UI and, on a memory-constrained browser (mobile),
// OOM-crashes the tab. That was the Fabricate "generate a component" freeze/crash
// (2026-07-19-dedup-embedder-hot-load.md); this is its structural fix, so semantic
// dedup can be always-on without ever touching the main thread. There is NO
// main-thread fallback (unlike generation, which needs *some* backend): every
// embed caller already degrades to a lexical ranker, so a browser with no module-
// worker support simply gets null → lexical, never a main-thread load.
const EMBED_WORKER_SRC = `
let lib = null, embedder = null;
self.onmessage = async (e) => {
  const d = e.data || {};
  try {
    if (d.type === 'load') {
      lib = await import(d.url);
      embedder = await lib.pipeline('feature-extraction', d.model);
      self.postMessage({ type: 'loaded' });
    } else if (d.type === 'embed') {
      const out = await embedder(d.texts, { pooling: 'mean', normalize: true });
      const vectors = typeof out.tolist === 'function' ? out.tolist() : out;
      self.postMessage({ type: 'embedded', id: d.id, vectors });
    }
  } catch (err) {
    self.postMessage({ type: d.type === 'load' ? 'load-error' : 'embed-error', id: d.id, error: String((err && err.message) || err) });
  }
};
`;

// The worker-backed embedder. `load()` is single-flight and NEVER throws — it
// resolves true when the model is ready, false on any failure (no worker support,
// blob/module-worker restriction, CDN/model load error), latching the result so a
// hard failure isn't retried in a loop. `embed()` returns vectors, or null when
// not ready / on any failure. Both are safe to call from the main thread: the
// heavy work happens in the worker.
function embeddingsBackend() {
  let worker = null;
  let isReady = false;
  let loadPromise = null; // single-flight latch (kept on failure — matches the old `embedTried`)
  let nextId = 1;
  const pending = new Map(); // embed id -> { resolve }
  let onLoaded = null;
  let onLoadErr = null;

  function makeWorker() {
    const url = URL.createObjectURL(new Blob([EMBED_WORKER_SRC], { type: 'text/javascript' }));
    const w = new Worker(url, { type: 'module' });
    w.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === 'loaded') { isReady = true; onLoaded?.(true); }
      else if (d.type === 'load-error') onLoadErr?.(new Error(d.error || 'load failed'));
      // An embed failure resolves to null (never rejects) — the caller falls back lexically.
      else if (d.type === 'embedded') { const p = pending.get(d.id); pending.delete(d.id); p?.resolve?.(d.vectors || null); }
      else if (d.type === 'embed-error') { const p = pending.get(d.id); pending.delete(d.id); p?.resolve?.(null); }
    };
    w.onerror = () => {
      if (!isReady) onLoadErr?.(new Error('worker error'));
      // A worker error after load: fail every in-flight embed to null, don't hang.
      else { for (const p of pending.values()) p.resolve?.(null); pending.clear(); }
    };
    return w;
  }

  return {
    ready() { return isReady; },
    // Load the model in the worker. Single-flight; never throws; latches its result.
    load() {
      if (isReady) return Promise.resolve(true);
      if (loadPromise) return loadPromise;
      loadPromise = new Promise((resolve) => {
        let w;
        try { w = makeWorker(); } catch { resolve(false); return; }
        worker = w;
        onLoaded = () => resolve(true);
        onLoadErr = () => { try { w.terminate(); } catch {} worker = null; resolve(false); };
        try { w.postMessage({ type: 'load', url: TRANSFORMERS_URL, model: EMBED_MODEL }); }
        catch { onLoadErr(); } // terminate + null worker + resolve(false), same as a load failure
      });
      return loadPromise;
    },
    // Embed via the worker. Null when not ready or on any failure. Never throws.
    // A timeout backstops a worker that dies SILENTLY mid-embed (a browser OOM-kill
    // that fires no `onerror`): without it the awaiting caller — including
    // dedupComponents in the generate hot path — would hang forever. On timeout we
    // resolve null so the caller falls back to its lexical ranker. Generous enough
    // that a live (even slow-phone) bge-small embed of a component catalog never
    // trips it; short enough that a dead worker can't stall generation.
    embed(list) {
      if (!worker || !isReady) return Promise.resolve(null);
      const id = nextId++;
      return new Promise((resolve) => {
        const timer = setTimeout(() => { if (pending.delete(id)) resolve(null); }, EMBED_TIMEOUT_MS);
        pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); } });
        try { worker.postMessage({ type: 'embed', id, texts: list }); }
        catch { clearTimeout(timer); pending.delete(id); resolve(null); }
      });
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

/** @param {{ getSettings?: () => Record<string, unknown>, defaultModel?: string, defaultMaxTokens?: number }} [opts] */
export function createArchitectModel({ getSettings, defaultModel = DEFAULT_OR_MODEL, defaultMaxTokens = 0 } = {}) {
  const settings = () => (getSettings ? getSettings() : {}) || {};
  const modelOn = () => settings().modelEnabled !== false; // default on; one switch off
  // Who answers is the author's stored selection, never a readiness ladder: see `resolve` below
  // and engineering/decisions/2026-11-07-studio-model-spine.md (which supersedes the
  // 2026-06-29 tier-precedence policy and its `explicitTierWins` flag).

  let injected = null; // test hook — a MockBackend
  const prompt = promptApiBackend();
  const webllm = webllmBackend();
  let openrouter = openRouterBackend(defaultModel, defaultMaxTokens);
  // The direct providers (OpenAI, Gemini, Anthropic) on the author's own key, made on first
  // use. Each prices its usage from OpenRouter's public catalog (direct-providers.js).
  const directs = {};
  // Spend a caller does not attribute itself is the chat model's, on the chat route.
  setChatRouteReader(() => { const s = readChatSelection(); return s.source === 'cloud' ? s.provider : ''; });
  const directFor = (p) => (directs[p] ||= directBackend(p, { catalog: () => openrouter.listModels(), catalogNow: () => openrouter.catalogSnapshot?.() ?? null, defaultMaxTokens }));
  // THE CHAT SELECTION decides who answers (lib/model-selection.js): one stored record, read on
  // every call, never a readiness ladder. `cloud()` is the selected cloud provider's backend (or
  // the author's last cloud provider while an on-device model is selected, for the cloud-only
  // readouts such as spend). A chosen direct provider whose sealed key is still opening reads
  // `warming`, never OpenRouter: that would bill the wrong account (BYOK phase 2).
  const lastCloudProvider = () => {
    const s = readChatSelection();
    if (s.source === 'cloud') return s.provider;
    return CHAT_CLOUD_PROVIDERS.find((p) => s.last[p]) ?? 'openrouter';
  };
  const backendFor = (p) => (p === 'openrouter' ? openrouter : directFor(p));
  const cloud = () => backendFor(lastCloudProvider());
  // A connected user's price list is wanted before their first spend (the budget gate compares an estimate against the cap, and
  // with no price it lets the call through), so fetch it now rather than when something happens to ask. Cached for 24 h, public, best-effort.
  // A direct provider is priced from the same public catalog, so it is fetched for any stored key.
  if (readOpenRouterKey() || KEY_PROVIDERS.some((p) => p !== 'openrouter' && readProviderKey(p))) openrouter.listModels().catch(() => {});
  let universal = transformersGenBackend();
  let promptAvail = 'unknown';
  const embeddings = embeddingsBackend(); // bge-small, WORKER-ONLY (never the main thread)
  // The model-off floor switch (Workspace "AI off", tests). The only in-memory tier state left.
  let floorForced = false;
  // On-device downloads in flight, so a selected-but-loading model reads `warming` (with its
  // progress), and whether each model's weights are already cached in this browser.
  const loading = { webllm: false, universal: false };
  const progress = { webllm: 0, universal: 0 };
  const cached = { webllm: false, universal: false };
  const deviceBackend = (p) => (p === 'webllm' ? webllm : universal);
  // Warm the SELECTED on-device model when its weights are already cached (no download, no
  // network check). Called at boot and when the author selects one. Not cached: it stays
  // `unavailable` and the Workspace offers "Load (~size)".
  async function warmSelected() {
    const sel = readChatSelection();
    const p = sel.provider;
    if (p !== 'webllm' && p !== 'universal') return;
    if (deviceBackend(p).ready() || loading[p]) return;
    cached[p] = await detectCachedWeights(DEVICE_MODEL_IDS[p]);
    emitChange();
    const b = deviceBackend(p);
    if (!cached[p] || b.ready() || readChatSelection().provider !== p || loading[p]) return;
    loading[p] = true;
    progress[p] = 0;
    emitChange();
    try {
      await b.load((x) => { progress[p] = x?.progress || 0; emitChange(); });
    } catch { /* stays unavailable; the Workspace offers Load */ }
    finally { loading[p] = false; emitChange(); }
  }
  // Another tab changed the selection or a key: re-announce here so this tab's UI follows.
  if (hasWindow) {
    watchSelectionStorage();
    try { window.addEventListener('storage', (e) => { if (isOpenRouterKeyEvent(e)) emitChange(); }); } catch {}
  }

  async function refreshAvailability() {
    promptAvail = await detectPromptApi();
    return promptAvail;
  }

  // Resolve the SELECTION. Returns the selected backend and its readiness; never another one.
  //   ready      — it can answer now
  //   warming    — it will be ready without the author doing anything (a key opening, a
  //                download in progress, the built-in model's availability not probed yet)
  //   needs-key  — a cloud provider with no key, or a rejected one
  //   unavailable— an on-device model that is not downloaded / not supported here
  function resolve() {
    const sel = readChatSelection();
    // Not set: nothing chosen yet (2026-11-08-studio-ai-routes-ux.md). Nothing answers, and nothing
    // is guessed: the floor stands in so a call says "choose a chat model".
    if (!isSet(sel)) return { sel, backend: floorBackend, state: 'unset' };
    if (sel.source === 'device') {
      if (sel.provider === 'webllm') return { sel, backend: webllm, state: webllm.ready() ? 'ready' : loading.webllm ? 'warming' : 'unavailable' };
      if (sel.provider === 'universal') return { sel, backend: universal, state: universal.ready() ? 'ready' : loading.universal ? 'warming' : 'unavailable' };
      const state = promptAvail === 'available' ? 'ready' : promptAvail === 'unknown' ? 'warming' : 'unavailable';
      return { sel, backend: prompt, state };
    }
    const backend = backendFor(sel.provider);
    // A rejected key still answers (and fails visibly with the provider's own error); the
    // Workspace shows it as rejected. Only a key that is not open yet, or none, stops the call.
    const state = backend.ready() ? (isRetired(sel.provider, backend.getModel?.()) ? 'retired' : 'ready') : providerKeyState(sel.provider) === 'opening' ? 'warming' : 'needs-key';
    return { sel, backend, state };
  }

  // The backend that answers a call: the resolved selection when ready, else the floor (which
  // answers nothing). The model-off switch wins over everything (incl. an injected test backend)
  // — that's the offline guarantee and the test hook for forcing the floor.
  function pickBackend() {
    if (!modelOn() || floorForced) return floorBackend;
    if (injected) return injected;
    const r = resolve();
    return r.state === 'ready' ? r.backend : floorBackend;
  }

  /** The readiness of the selection, for the UI and the chat's "not ready" notice. */
  function readiness() {
    if (!modelOn() || floorForced) return { state: 'off', source: 'cloud', provider: 'openrouter', model: '' };
    if (injected) return { state: 'ready', source: 'cloud', provider: 'openrouter', model: '' };
    const { sel, backend, state } = resolve();
    const model = sel.source === 'cloud' ? backend.getModel() : (DEVICE_MODEL_IDS[sel.provider] ?? '');
    const p = sel.provider;
    const extra = p === 'webllm' || p === 'universal' ? { progress: loading[p] ? progress[p] : null, cached: cached[p] } : {};
    // A Not-set selection reports as cloud with no provider: its readouts (spend, the card) are the
    // cloud ones until something is chosen, and its state says 'unset'.
    return { state, source: sel.source === 'none' ? 'cloud' : sel.source, provider: sel.provider, model, ...extra };
  }

  // VERSION HEALING (2026-11-08-studio-ai-routes-ux.md rule 1), one healer for every cloud
  // route. A model the route answers as gone is checked against the route's LIVE list (a model
  // still listed is not retired: "no endpoints" can mean a live model refusing a parameter). A
  // retired one moves to the newest newer version of its own family on the same route, which is
  // stored and announced, and the call runs once more on it; with nothing newer the selection
  // reads "Model retired" and the error reaches the caller. Never another family, provider or route.
  const TOOL_REFUSAL = /support tool use|support tools?\b|handle the requested parameters|function tools?\b[^.]*not supported/i;
  const errStatus = (e) => {
    const m = String(e?.message || '').match(/ error (\d{3})(?::\s*([\s\S]*))?/);
    return m ? { status: Number(m[1]), detail: m[2] || '' } : null;
  };
  async function healing(backend, route, asked, opts) {
    const call = (model) => {
      const o = model === asked ? opts : { ...opts, model };
      const run = opts.__pin ? { ...o, pinnedModel: model } : o;
      // A provider that answers with another model than the one asked (OpenRouter can reroute a
      // retired id) is held to the same rule: a newer version of the same family is a heal,
      // anything else stops the selection.
      return backend.complete({ ...run, onAnsweredBy: (id) => { noteAnswered(route, model, id, opts.onModel); run.onAnsweredBy?.(id); } });
    };
    try {
      const out = await call(asked);
      clearOutOfCredit(route);
      return out;
    } catch (e) {
      const err = errStatus(e);
      if (err && classifyProviderError(err.status, err.detail) === 'billing') noteOutOfCredit(route);
      if (!asked || !err || classifyProviderError(err.status, err.detail) !== 'model-gone' || TOOL_REFUSAL.test(err.detail)) throw e;
      let live = null;
      try {
        backend.invalidateCatalog?.();
        live = await backend.listModels?.();
      } catch {
        live = null;
      }
      // No list to check against, or the model is still listed: not retired. The error stands.
      if (!Array.isArray(live) || !live.length || live.some((m) => m.id === asked)) throw e;
      const to = healTarget(asked, live);
      if (!to) {
        markRetired({ provider: route, model: asked });
        throw e;
      }
      healSelections({ provider: route, from: asked, to });
      opts.onModel?.(to);
      return await call(to);
    }
  }
  function noteAnswered(route, asked, answered, onModel) {
    if (!answered || !asked || answered === asked || asked.startsWith('~') || asked.startsWith('openrouter/')) return;
    const fa = familyOf(asked);
    const fb = familyOf(answered);
    if (fa && fb) {
      if (fa.key !== fb.key) markRetired({ provider: route, model: asked, answeredBy: answered });
      else if (healTarget(asked, [{ id: answered }]) === answered) {
        healSelections({ provider: route, from: asked, to: answered });
        // A pinned turn moves its pin too, so its next round asks for the healed model.
        onModel?.(answered);
      }
      return;
    }
    // Ids the table cannot place: a different vendor is a different provider, which is never a heal.
    const vendor = (id) => (id.includes('/') ? id.split('/')[0] : '');
    if (vendor(asked) && vendor(answered) && vendor(asked) !== vendor(answered)) markRetired({ provider: route, model: asked, answeredBy: answered });
  }

  async function complete(opts) {
    const { json, fallback } = opts;
    // A pinned call (one chat turn, see `pin`) runs on the backend + model fixed at its start,
    // whatever the selection says now.
    // A call on an explicit ROUTE (the image reader on its own provider: 2026-11-08-studio-ai-routes-ux.md
    // §4.2) runs on that provider's backend for this call only, whatever the chat selection is.
    // AI off (or the floor forced) wins over an explicit route too: nothing on a route may spend then.
    const routeOk = modelOn() && !floorForced && CHAT_CLOUD_PROVIDERS.includes(opts.route);
    const backend = opts.__pin ? opts.__pin.backend : opts.route ? (routeOk ? backendFor(opts.route) : floorBackend) : pickBackend();
    if (backend === floorBackend) return floorBackend.complete(opts);
    // The route and the model this call runs on, read the way the backends read them.
    const route = backend.provider ?? 'openrouter';
    const asked = (opts.model && (route === 'openrouter' || !opts.model.includes('/')) ? opts.model : opts.__pin?.model || backend.getModel?.()) || '';
    try {
      const out = await healing(backend, route, asked, opts);
      if (!json) return (out && String(out).trim()) || fallback || '';
      const parsed = extractJson(out);
      return parsed ?? (fallback ?? {}); // validate-or-floor
    } catch (e) {
      // An explicit user Stop is NOT a model failure — it must reach the caller, which
      // keeps the streamed partial and charges an estimate for tokens already spent
      // (architect.ts chatComplete). Falling through to the floor here swallowed the
      // abort, discarded the reply, and recorded $0 for a request the provider had
      // already billed — so a hard-stop budget cap could be evaded by repeatedly
      // starting and stopping turns. Every OTHER failure still floors.
      if (e?.name === 'AbortError') throw e;
      // A TOOL call's failure reaches the caller too. The chat agent cannot tell an empty
      // floor reply from "the model said nothing", and it has a better fallback than the
      // floor: the one-shot chat, for a model that refuses `tools` outright.
      if (opts?.tools?.length) throw e;
      // A caller that can NAME the failure opts in with `surfaceErrors`. The theme and
      // component faculties do: flooring a 402 into an empty reply left them saying "no
      // usable palette" or "no model connected" when the account was out of credits.
      // Cloud only: describeModelError reads OpenRouter's statuses, and an on-device
      // failure worded as "never reached OpenRouter" would mislead. Those still floor.
      if (opts?.surfaceErrors && backend.name === 'openrouter') throw e;
      return floorBackend.complete(opts); // any model failure → the floor
    }
  }

  // Embeddings — the bge-small model, run WORKER-ONLY (see embeddingsBackend).
  // Returns Array<number>[] or null (the caller keyword-falls back). Never throws.
  //
  // `allowLoad` (default true) gates whether we WAIT for a cold load:
  //   • true  — await the worker load, then embed (e.g. the Drawing Board retrieval,
  //     which wants the vectors and can wait for the one-time download). Off-thread,
  //     so the UI never freezes while it loads.
  //   • false — the latency-sensitive hot path (Fabricate's dedup nudge): embed NOW
  //     only if the worker is already warm, otherwise kick a BACKGROUND warm and
  //     return null so the caller ranks lexically this time. The background warm is
  //     safe (it runs in the worker), so semantic dedup comes online for the next
  //     generation without ever blocking or crashing this one
  //     (engineering/decisions/2026-07-19-dedup-embedder-hot-load.md +
  //     2026-07-19-embedder-web-worker.md).
  async function embed(texts, { allowLoad = true } = {}) {
    if (!modelOn() || !hasWindow) return null;
    const list = Array.isArray(texts) ? texts : [texts];
    if (injected?.embed) return injected.embed(list);
    if (!embeddings.ready()) {
      if (allowLoad) await embeddings.load();
      else { void embeddings.load(); return null; } // warm off-thread for next time; lexical now
    }
    return embeddings.embed(list); // null when the (worker) load failed → lexical fallback
  }

  // Announce a generation-tier change (connect / disconnect / model swap / summon)
  // so live surfaces re-evaluate what they offer — e.g. the Coach's per-finding
  // "Fix" button, gated on a capable tier, appears the moment a model connects
  // instead of waiting for the next deck edit. Fire-and-forget; SSR/Node no-op.
  const emitChange = () => {
    if (!hasWindow) return;
    try { window.dispatchEvent(new Event('db-model-changed')); } catch {}
  };

  // A selected on-device model whose weights are cached comes back by itself after a reload.
  if (hasWindow) void warmSelected();

  return {
    complete,
    embed,
    refreshAvailability,
    availability() {
      return {
        generation: pickBackend().name,
        readiness: readiness(),
        promptApi: promptAvail,
        webgpu: detectWebGPU(),
        webllmReady: webllm.ready(),
        universalReady: universal.ready(),
        openRouterReady: cloud().ready(),
        openRouterKeyInvalid: !!cloud().keyInvalid?.(),
        provider: cloud().provider ?? 'openrouter',
        embeddings: modelOn() && hasWindow,
        modelOn: modelOn(),
      };
    },
    /**
     * Fix the backend and model for ONE unit of work (a chat turn): the returned model answers
     * every round on them, and its readouts (model id, name, price) name them, whatever the
     * selection becomes meanwhile. Cost and the chip are credited to the model that answered.
     */
    async pin() {
      // The built-in model's availability is a probe, not a stored fact: settle it before pinning.
      if (promptAvail === 'unknown' && readChatSelection().provider === 'prompt-api') await refreshAvailability().catch(() => {});
      const backend = pickBackend();
      // Read the readouts in the SAME tick as the pick: the catalog fetch below awaits, and a
      // selection changed meanwhile must not make the snapshot describe a backend this turn
      // does not run on (chatComplete branches on its `generation`).
      const snapshot = this.availability();
      // A real cloud backend names its model; an injected test backend reads the adapter's.
      const isCloud = backend.name === 'openrouter';
      let modelId = !isCloud ? '' : typeof backend.getModel === 'function' ? backend.getModel() : (this.openRouterModel?.() ?? '');
      // A direct provider with no stored pick derives its default from its list: load it now, so
      // the whole turn runs on (and is credited to) one concrete model.
      if (isCloud && !modelId && backend.listModels) { await backend.listModels().catch(() => {}); modelId = backend.getModel(); }
      const pinned = { backend, model: modelId };
      const priceOf = (id) => (!isCloud ? null : backend.modelPrice ? backend.modelPrice(id) : (this.openRouterModelPrice?.(id) ?? null));
      return {
        ...this,
        availability: () => snapshot,
        complete: (opts) => this.complete({ ...opts, __pin: pinned, onModel: (id) => { pinned.model = id; opts?.onModel?.(id); } }),
        openRouterModel: () => pinned.model,
        openRouterModelName: () => {
          if (!isCloud || !backend.listModels) return pinned.model;
          return backend.modelName?.call({ ...backend, getModel: () => pinned.model }) ?? pinned.model;
        },
        openRouterModelPrice: (id) => priceOf(id || pinned.model),
      };
    },
    /**
     * The tier verbs, now selections: 'auto' = the author's cloud provider (its last pick);
     * 'prompt-api' | 'webllm' | 'universal' = that on-device model; 'floor' = the model-off switch.
     */
    setTier(name) {
      if (name === 'floor') { floorForced = true; emitChange(); return; }
      floorForced = false;
      if (name === 'auto') selectChat({ provider: lastCloudProvider() });
      else { selectChat({ provider: name }); void warmSelected(); }
    },
    // OpenRouter cloud tier — one-click OAuth (PKCE), the user's own account.
    // beginOpenRouterAuth() returns the URL to redirect to; the page navigates
    // there. On return (?code=) the page calls resumeOpenRouterAuth(code), which
    // exchanges the code for a key — OpenRouter is then the active cloud backend.
    hasPendingOpenRouterAuth() { return openrouter.hasPendingAuth(); },
    async beginOpenRouterAuth(callbackUrl) { return openrouter.beginAuth(callbackUrl); },
    async resumeOpenRouterAuth(code) {
      try {
        await openrouter.completeAuth(code);
      } catch (e) {
        // A code and its verifier are good for ONE exchange. Once OpenRouter has ANSWERED
        // and refused, the pair can never succeed, so drop the verifier and let the author
        // start over. A network failure is different: the code was never spent, so the
        // verifier stays and a reload can still finish the sign-in.
        if (/auth failed|returned no key/.test(String(e?.message))) openrouter.clearPendingAuth();
        throw e;
      }
      // Signing in connects OpenRouter; it fills only a Not-set selection (rule 1) and records
      // how OpenRouter was connected, for the card ("Signed in" vs "Key …ab12").
      writeOpenRouterVia('oauth');
      fillFromConnections();
      emitChange();
      return true;
    },
    clearPendingOpenRouterAuth() { openrouter.clearPendingAuth(); },
    checkOpenRouterKey(key) { return openrouter.checkKey(key); },
    listOpenRouterModels() { return cloud().listModels(); },
    openRouterModel() { return cloud().getModel(); },
    // Selecting a model selects its provider too (one record): it is active immediately.
    setOpenRouterModel(id, provider = lastCloudProvider()) { backendFor(provider).setModel(id); },
    openRouterModelName() { return cloud().modelName(); },
    openRouterAccount() { return cloud().accountInfo(); },
    openRouterCredits() { return cloud().creditsInfo(); }, // the account wallet (balance)
    openRouterKeySettingsUrl() { return cloud().keySettingsUrl(); }, // where to set a hard per-key cap
    openRouterModelPrice(id) { return cloud().modelPrice(id); }, // active model's per-M price (for estimates)
    openRouterGenerationCost(id) { return cloud().generationCost(id); }, // authoritative cost of one generation (aborted-turn reconciliation)
    // Snapshot/restore the stored key so the settings UI can offer an Undo on
    // Disconnect (mirroring the deck-deletion guardrail) without re-running OAuth.
    openRouterKeySnapshot() { return openrouter.keySnapshot(); },
    // The connected key, for sibling adapters that reuse the same OAuth connection
    // (e.g. the VoiceModel's openrouter-tts rung). Null when not connected.
    openRouterKey() { return openrouter.keySnapshot(); },
    restoreOpenRouter(key) { openrouter.restore(key); emitChange(); },
    disconnectOpenRouter() { openrouter.disconnect(); emitChange(); },
    // ── Direct provider keys (§7 step 2) ──
    /**
     * The IMAGE READER as it stands (2026-11-08-studio-ai-routes-ux.md §2): same as chat (the
     * default) or its own route and model. `state`: ready | warming | needs-key | unset (chat not
     * set, under same-as-chat) | no-vision (same as chat, and chat runs on this device).
     * @returns {{ mode: 'same' | 'own', provider: string, model: string, state: string }}
     */
    imageReader() {
      const img = readImageSelection();
      // AI switched off: the reader is off too, whatever its route says.
      if (!modelOn() || floorForced) return { mode: img.mode, provider: img.provider, model: '', state: 'off' };
      if (img.mode === 'own') {
        const b = backendFor(img.provider);
        const model = img.model || b.getModel?.() || '';
        const state = b.ready() ? (isRetired(img.provider, model) ? 'retired' : 'ready') : providerKeyState(img.provider) === 'opening' ? 'warming' : 'needs-key';
        return { mode: 'own', provider: img.provider, model, state };
      }
      const r = resolve();
      if (r.state === 'unset') return { mode: 'same', provider: '', model: '', state: 'unset' };
      if (r.sel.source === 'device') return { mode: 'same', provider: r.sel.provider, model: '', state: 'no-vision' };
      return { mode: 'same', provider: r.sel.provider, model: r.backend.getModel?.() ?? '', state: r.state };
    },
    /** A route's model list and price (the image reader's route, which can differ from chat's). */
    listModelsOn(provider) { return backendFor(provider).listModels(); },
    modelPriceOn(provider, id) { return backendFor(provider).modelPrice?.(id) ?? null; },
    /** The provider the cloud tier runs on now ('openrouter' unless a direct key is active). */
    activeProvider() { return cloud().provider ?? 'openrouter'; },
    /** Check a pasted direct-provider key against its free `/models` listing: the HTTP status, 0 when unreachable. */
    checkProviderKey(provider, key) { return provider === 'openrouter' ? openrouter.checkKey(key) : directFor(provider).checkKey(key); },
    /**
     * Store a key. Connecting adds models; it never changes a set selection. It fills only a
     * selection that is Not set (2026-11-08-studio-ai-routes-ux.md rule 1), and returns what it
     * filled so the caller can say so.
     */
    saveProviderKey(provider, key) {
      if (provider === 'openrouter') { openrouter.restore(key); writeOpenRouterVia('key'); }
      else { directFor(provider).restore(key); directFor(provider).invalidateCatalog(); directFor(provider).listModels().catch(() => {}); }
      floorForced = false;
      const filled = fillFromConnections();
      // Every view of the keys (Connections, the cards) re-reads on this, filled or not.
      emitChange();
      return filled;
    },
    /** Remove a provider's key. The selection stays as chosen and reads `needs-key`: nothing substitutes another provider. */
    removeProviderKey(provider) {
      if (provider === 'openrouter') { openrouter.disconnect(); }
      else { directFor(provider).disconnect(); }
      emitChange();
    },
    /** Remove every stored key (Privacy & Data → clear). */
    disconnectAllProviders() {
      openrouter.disconnect();
      for (const p of KEY_PROVIDERS) if (p !== 'openrouter') directFor(p).disconnect();
      emitChange();
    },
    /** Which providers hold a key in this browser (the API key tab's list). */
    providersWithKeys() { return KEY_PROVIDERS.filter((p) => (p === 'openrouter' ? !!readOpenRouterKey() : !!readProviderKey(p))); },
    /** Select a provider's chat model (its last pick, else its default). */
    switchProvider(provider) { floorForced = false; selectChat({ provider }); },
    // WebLLM opt-in — the deliberate "summon the Architect" (~1GB, WebGPU) download.
    async summon(onProgress, signal) {
      loading.webllm = true;
      emitChange();
      try { await webllm.load((x) => { progress.webllm = x?.progress || 0; onProgress?.(x); emitChange(); }, signal); } finally { loading.webllm = false; }
      // Downloading is not choosing (2026-11-08-studio-ai-routes-ux.md rule 5): the model is
      // available now; the author picks it under Models in use.
      emitChange();
      return true;
    },
    // The universal Transformers.js tier — the no-WebGPU fallback (Safari/mobile).
    // ~350MB WASM model loaded on demand; once loaded it's used when there's no
    // Prompt API. Never throws to the caller's flow — caller surfaces progress.
    async loadUniversal(onProgress, signal) {
      loading.universal = true;
      emitChange();
      try { await universal.load((x) => { progress.universal = x?.progress || 0; onProgress?.(x); emitChange(); }, signal); } finally { loading.universal = false; }
      emitChange();
      return true;
    },
    webgpu: detectWebGPU(),
    // Test hooks (used by the Node suite to exercise the model-on path + ladder).
    __setBackend(b) { injected = b; },
    __setPromptAvailability(a) { promptAvail = a; },
    __setUniversal(b) { universal = b; },
    __setOpenRouter(b) { openrouter = b; },
    __invalidateCatalog() { openrouter.invalidateCatalog(); }, // test hook: the dead-model self-heal's invalidation, without a dead model
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
