// The Drawing Board — model settings + the on-device tier controls (Phase 2).
//
// Makes the generation ladder visible and controllable: which tier is live, a
// switch to force the deterministic floor (privacy / offline), the on-demand
// downloads (universal Transformers.js everywhere; WebLLM on a desktop GPU), and
// remember/reconnect + remove for the cached weights. Everything degrades when a
// tier is unavailable — that degraded state is what's verified headless; the live
// download + inference need real hardware.

import { orSupportsCache } from './architect-model.js';
import { getPref, PREFS, setPref } from './drawing-board-prefs.js';
import {
  emptyMessage,
  filterModels,
  fmtTokens,
  fmtUSD,
  groupByVendor,
  metaLabel,
  OR_VIEWS,
  rowTitle,
  shortName,
} from './or-catalog.js';
import {
  PERF_OVERLAY_AVAILABLE,
  perfOverlayEnabled,
  setPerfOverlayEnabled,
} from './perf-overlay-prefs.ts';
import { setToursEnabled, toursEnabled } from './tour-prefs.js';

const MODEL_KEY = 'lattice-db-model'; // master on/off
const TIER_KEY = 'lattice-db-loaded-tier'; // which tier the user loaded (persisted)
const RESTORE_GUARD = 'lattice-db-restored'; // one auto-reconnect attempt per tab session

// OpenRouter Converse controls (set in the Cloud AI section, READ by the chat).
// Module-scope so drawing-board-chat.js can import the readers and feed them into
// buildChatMessages — the controls are useless until the chat actually consumes them.
const OR_CACHE_KEY = 'lattice-db-or-cache'; // prompt-caching opt-out (default on)
const OR_INSTR_KEY = 'lattice-db-architect-instructions'; // standing instructions
const DEDUP_KEY = 'lattice-db-dedup'; // component-gen dedup suggestions (default on)
const INSTR_MAX = 500; // word cap on standing instructions
export const readCachingEnabled = () => { try { return localStorage.getItem(OR_CACHE_KEY) !== 'off'; } catch { return true; } };
// When on (default), AI component generation suggests near-duplicate components
// before generating, so the author reuses rather than bloats the catalog (§5/§8).
export const readDedupEnabled = () => { try { return localStorage.getItem(DEDUP_KEY) !== 'off'; } catch { return true; } };
export const writeDedupEnabled = (on) => { try { localStorage.setItem(DEDUP_KEY, on ? 'on' : 'off'); } catch { /* unavailable */ } };
export const readStandingInstructions = () => { try { return localStorage.getItem(OR_INSTR_KEY) || ''; } catch { return ''; } };

// Per-Lattice spend tally — accumulated locally from each reply's authoritative
// `usage.cost` (USD). All-time persists (localStorage); session resets per tab
// (sessionStorage). recordSpend is called by the chat; the settings strip reads it.
const SPEND_TOTAL_KEY = 'lattice-db-spend-total';
const SPEND_SESSION_KEY = 'lattice-db-spend-session';
const SPEND_TOTAL_TOK_KEY = 'lattice-db-spend-total-tok';
const SPEND_SESSION_TOK_KEY = 'lattice-db-spend-session-tok';
// `globalThis.localStorage` is `undefined` (not a ReferenceError) when absent (Node),
// and the guards keep these fs-free + crash-free off the browser.
const addTo = (store, key, n) => { try { if (store) store.setItem(key, String((Number(store.getItem(key)) || 0) + n)); } catch {} };
const readN = (store, key) => { try { return store ? Number(store.getItem(key)) || 0 : 0; } catch { return 0; } };
export function recordSpend(cost, tokens = 0) {
  // Cost and tokens are recorded independently — a free model bills $0 but still
  // burns tokens, so the token tally must not be gated on a positive cost.
  const ls = globalThis.localStorage;
  const ss = globalThis.sessionStorage;
  const c = Number(cost);
  if (Number.isFinite(c) && c > 0) { addTo(ls, SPEND_TOTAL_KEY, c); addTo(ss, SPEND_SESSION_KEY, c); }
  const t = Number(tokens);
  if (Number.isFinite(t) && t > 0) { addTo(ls, SPEND_TOTAL_TOK_KEY, t); addTo(ss, SPEND_SESSION_TOK_KEY, t); }
}
export function readSpend() {
  const ls = globalThis.localStorage;
  const ss = globalThis.sessionStorage;
  return {
    total: readN(ls, SPEND_TOTAL_KEY),
    session: readN(ss, SPEND_SESSION_KEY),
    totalTokens: readN(ls, SPEND_TOTAL_TOK_KEY),
    sessionTokens: readN(ss, SPEND_SESSION_TOK_KEY),
  };
}

// Budgeting & alerting. The budget is anchored to the user's real OpenRouter credit
// (the ceiling), with an OPTIONAL tighter self-cap on this app's session spend. The
// unit is dollars; the warning fires at 80%; enforcement is the user's choice —
// 'alert' (toast only) or 'stop' (block new sends at 100%). Settings WRITE these;
// the chat READS them per turn.
const BUDGET_CAP_KEY = 'lattice-db-budget-cap'; // optional self-cap on session app spend ($); 0/empty = off
const BUDGET_MODE_KEY = 'lattice-db-budget-mode'; // 'alert' | 'stop'
const BUDGET_FLOOR_KEY = 'lattice-db-budget-floor'; // warn when OpenRouter balance < $X (for no-limit keys)
const BUDGET_WARN_FRAC = 0.8; // the agreed buffer — warn at 80% of the cap/limit
const numPref = (k) => { try { const n = Number(localStorage.getItem(k)); return Number.isFinite(n) && n > 0 ? n : 0; } catch { return 0; } };
export const readBudgetCap = () => numPref(BUDGET_CAP_KEY);
export const readBudgetFloor = () => numPref(BUDGET_FLOOR_KEY);
export const readBudgetMode = () => { try { return localStorage.getItem(BUDGET_MODE_KEY) === 'stop' ? 'stop' : 'alert'; } catch { return 'alert'; } };

// PURE budget evaluation — no DOM, no storage. Combines two independent gauges and
// returns the worst severity: the optional self-cap (this session's app spend) and
// the OpenRouter credit ceiling (low when ≤20% of a known limit, or ≤ the floor).
// `level`: 'ok' | 'warn' | 'over'; `blocked` is true only when over AND mode==='stop'.
/** @param {{ sessionSpend?: number, cap?: number, mode?: string, account?: ({ remaining?: number|null, limit?: number|null }|null), floor?: number }} [o] */
export function budgetStatus({ sessionSpend = 0, cap = 0, mode = 'alert', account = null, floor = 0 } = {}) {
  let level = 'ok';
  const reasons = [];
  const bump = (l) => { if (l === 'over' || (l === 'warn' && level === 'ok')) level = l; };
  if (cap > 0) {
    if (sessionSpend >= cap) { bump('over'); reasons.push(`session spend $${sessionSpend.toFixed(2)} reached your $${cap.toFixed(2)} cap`); }
    else if (sessionSpend >= BUDGET_WARN_FRAC * cap) { bump('warn'); reasons.push(`${Math.round((sessionSpend / cap) * 100)}% of your $${cap.toFixed(2)} session cap used`); }
  }
  if (account && account.remaining != null) {
    const r = account.remaining;
    if (r <= 0) { bump('over'); reasons.push('OpenRouter credit is exhausted'); }
    else {
      const lowByLimit = account.limit != null && account.limit > 0 && r <= (1 - BUDGET_WARN_FRAC) * account.limit;
      const lowByFloor = floor > 0 && r <= floor;
      if (lowByLimit || lowByFloor) { bump('warn'); reasons.push(`OpenRouter credit low ($${r.toFixed(2)} left)`); }
    }
  }
  return { level, blocked: level === 'over' && mode === 'stop', message: reasons.join('; ') || null };
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// A labelled <select> for one workspace preference. Keeps the option vocabulary
// next to its key, reads the current value, persists on change, and runs an
// optional side effect (e.g. re-pruning history when the cap drops).
function prefRow(name, label, hint, optionLabels, onChange) {
  const p = PREFS[name];
  const row = el('div', 'db-pref-row');
  const text = el('div', 'db-pref-text');
  text.append(el('span', 'db-pref-label', label));
  if (hint) text.append(el('span', 'db-pref-hint', hint));
  const sel = el('select', 'db-pref-select');
  sel.setAttribute('aria-label', label);
  const current = getPref(name);
  p.values.forEach((v, i) => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = optionLabels[i] || v;
    if (v === current) o.selected = true;
    sel.append(o);
  });
  sel.addEventListener('change', () => { setPref(name, sel.value); if (onChange) onChange(sel.value); });
  row.append(text, sel);
  return row;
}

// The Workspace section of the unified Settings popover — the "make it yours"
// preferences. Reads/writes via drawing-board-prefs; the store reads the same
// keys in its hot paths. AI-tier controls render below this (createModelSettings).
function workspaceSection() {
  const ws = el('section', 'db-settings-workspace');
  // (the 'Workspace' tab labels this section — no redundant heading)
  ws.append(prefRow('newDeck', 'New deck starts from', null, ['Starter scaffold', 'Blank canvas']));
  ws.append(prefRow('landingMode', 'On reload, Architect opens in', null, ['Remember last', 'Coach', 'Converse']));
  ws.append(prefRow('restoreDeck', 'On reload, show', null, ['Last deck edited', 'A fresh deck']));
  ws.append(prefRow('historyCap', 'Auto checkpoints kept per deck', null, ['10', '30', '100', 'All'],
    () => { try { window.__dbStore?.applyHistoryCap?.(); } catch {} }));
  ws.append(prefRow('deleteStyle', 'Deleting a deck', null, ['Asks to confirm', 'Undo toast']));
  const typeaheadRow = prefRow('typeahead', 'Open suggestions automatically',
    'Components only opens the popup as you enter a slide’s class directive; Everywhere covers directives, fences, and front matter too.',
    ['Components only', 'Everywhere', 'Off'],
    (v) => { try { window.__dbEditor?.setTypeahead?.(v); } catch {} });
  // Type-ahead has no effect while autocomplete is off — reflect that in the UI
  // by disabling the control so the dependency is legible (the pref still
  // persists; it re-applies the moment autocomplete is switched back on).
  const syncTypeaheadEnabled = (autoOn) => {
    const sel = typeaheadRow.querySelector('.db-pref-select');
    if (sel) sel.disabled = !autoOn;
    typeaheadRow.classList.toggle('is-disabled', !autoOn);
  };
  ws.append(prefRow('autocomplete', 'Editor autocomplete', null, ['On', 'Off'],
    (v) => { try { window.__dbEditor?.setAutocomplete?.(v === 'on'); } catch {} syncTypeaheadEnabled(v === 'on'); }));
  ws.append(typeaheadRow);
  syncTypeaheadEnabled(getPref('autocomplete') === 'on');
  ws.append(guidedToursToggle());
  if (PERF_OVERLAY_AVAILABLE) ws.append(perfOverlayToggle());
  return ws;
}

// Guided tours on/off — a global, cross-surface switch. Reads/writes the shared
// tour-prefs flag, so flipping it here also governs the Playground and
// Workbench. On this page it takes effect live: tour-prefs notifies the running
// tour, which adds or removes its topbar "Tour" button without a reload.
function guidedToursToggle() {
  const row = el('label', 'db-or-switch');
  const text = el('span', 'db-pref-text');
  text.append(el('span', 'db-pref-label', 'Guided tours'));
  text.append(el('span', 'db-pref-hint',
    'First-visit walkthroughs of the Playground, Workbench, and Drawing Board, plus the “Tour” button. Turn off to hide them everywhere.'));
  const sw = el('span', 'db-switch');
  const cb = el('input');
  cb.type = 'checkbox';
  cb.className = 'db-switch-input';
  cb.setAttribute('aria-label', 'Guided tours');
  cb.checked = toursEnabled();
  cb.addEventListener('change', () => setToursEnabled(cb.checked));
  sw.append(cb, el('span', 'db-switch-knob'));
  row.append(text, sw);
  return row;
}

// Performance overlay on/off — a global, cross-surface switch (mirrors the
// Guided-tours one). Reads/writes the shared perf-overlay-prefs flag, so flipping
// it here also governs the Playground, Workbench, landing and docs. The overlay
// mounts/unmounts live wherever it's loaded (perf-overlay-prefs notifies it).
function perfOverlayToggle() {
  const row = el('label', 'db-or-switch');
  const text = el('span', 'db-pref-text');
  text.append(el('span', 'db-pref-label', 'Performance overlay'));
  text.append(el('span', 'db-pref-hint',
    'A live readout — web vitals (LCP, CLS, INP, FCP, TTFB) plus runtime FPS, memory and CPU≈ — measured by this device, for checking real-world performance. Drag the grip to reposition; shows on every page until turned off.'));
  const sw = el('span', 'db-switch');
  const cb = el('input');
  cb.type = 'checkbox';
  cb.className = 'db-switch-input';
  cb.setAttribute('aria-label', 'Performance overlay');
  cb.checked = perfOverlayEnabled();
  cb.addEventListener('change', () => setPerfOverlayEnabled(cb.checked));
  sw.append(cb, el('span', 'db-switch-knob'));
  row.append(text, sw);
  return row;
}

const readEnabled = () => { try { return localStorage.getItem(MODEL_KEY) !== 'off'; } catch { return true; } };
const writeEnabled = (on) => { try { localStorage.setItem(MODEL_KEY, on ? 'on' : 'off'); } catch {} };
const readTier = () => { try { return localStorage.getItem(TIER_KEY); } catch { return null; } };
const writeTier = (t) => { try { t ? localStorage.setItem(TIER_KEY, t) : localStorage.removeItem(TIER_KEY); } catch {} };

// Coarse pointer ≈ phone/tablet. WebLLM (~1GB + heavy inference) reliably
// OOM-crashes a mobile browser tab, so we gate it to fine-pointer (desktop).
const coarsePointer = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

function fmtBytes(n) {
  if (!n) return '';
  const mb = n / 1048576;
  return mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : Math.round(mb) + ' MB';
}

// Real WebGPU support is more than `'gpu' in navigator` — headless Chromium
// exposes the object but has no adapter. Probe for an adapter (async).
export async function probeWebGPU() {
  try {
    if (typeof navigator === 'undefined' || !navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

// Human label for the active generation tier.
export function tierLabel(a) {
  if (!a.modelOn) return 'Deterministic (AI off)';
  if (a.generation === 'openrouter') return 'Cloud AI (OpenRouter)';
  if (a.generation === 'webllm') return 'WebLLM (on-device)';
  if (a.generation === 'prompt-api') return 'Built-in AI (on-device)';
  if (a.generation === 'transformers') return 'On-device AI (universal)';
  if (a.generation === 'mock') return 'Mock (testing)';
  return 'Deterministic floor';
}

// The curated read-aloud voices (the Voice tab). Kept short on purpose — the full
// Kokoro set is 54 voices across 8 languages; these are the strongest English
// voices for boardroom narration. [id, display name, descriptor, flagship?].
const KOKORO_VOICES = [
  ['af_heart', 'Heart', 'American · female', true],
  ['af_bella', 'Bella', 'American · female'],
  ['af_nicole', 'Nicole', 'American · female · soft'],
  ['af_aoede', 'Aoede', 'American · female'],
  ['am_michael', 'Michael', 'American · male'],
  ['am_fenrir', 'Fenrir', 'American · male'],
  ['bf_emma', 'Emma', 'British · female'],
  ['bm_george', 'George', 'British · male'],
];
// OpenRouter (OpenAI-compatible) TTS voices for the hosted rung.
const OR_VOICES = [
  ['nova', 'Nova', 'warm, neutral'],
  ['alloy', 'Alloy', 'balanced'],
  ['echo', 'Echo', 'crisp'],
  ['fable', 'Fable', 'expressive'],
  ['onyx', 'Onyx', 'deep'],
  ['shimmer', 'Shimmer', 'bright'],
];

// Visibility is owned by the drawer controller now (the settings panel lives in a
// slide-in drawer body): `isOpen()` tells us whether to bother re-rendering on a
// refresh, and `render()` is called when the drawer opens. The chip label is still
// driven here via `trigger`.
export function createModelSettings({ host, trigger, model, voice, onChange, isOpen = () => false }) {
  if (!host || !model) return { refresh() {}, render() {}, restore: async () => {}, openTab() {} };
  let abort = null;
  let reconnecting = false;
  let renderToken = 0;
  let lastError = null; // last on-device load error, surfaced in the popover
  let orModelsCache = null; // OpenRouter catalog (id/name/pricing), fetched once per session
  let activeTab = 'workspace'; // settings tab: 'workspace' | 'cloud' | 'ondevice' | 'voice'
  // Open Settings to a specific tab — the model chip deep-links to 'cloud'.
  function openTab(tab) { activeTab = tab; if (isOpen()) render(); }

  // The Voice tab renders off the voice model's (sync) availability(), but the
  // on-disk cache probe resolves async — re-render the open Voice tab when the
  // voice model announces a change (creation probe, a download, a removal). The
  // event never fires from render(), so this can't loop.
  if (typeof window !== 'undefined' && voice) {
    window.addEventListener('db-voice-changed', () => { if (activeTab === 'voice' && isOpen()) render(); });
  }

  // ── the trigger chip ────────────────────────────────────────────────────────
  // The chip is a settings button that also signals the live tier: gear (::before)
  // + a SHORT word + a status dot (::after, filled when AI is active). The full
  // tier name rides in the title attribute so the detail is a hover away.
  function chipLabel(a) {
    if (reconnecting) return 'Reconnecting…';
    if (!a.modelOn) return 'AI off';
    if (a.generation === 'openrouter') return 'Cloud';
    if (a.generation !== 'floor' && a.generation !== 'mock') return 'Local';
    if (lastError) return 'Tap to retry'; // surfaced so it isn't silent
    // Reconnect is a desktop affordance — on-device tiers don't run on a phone.
    if (readTier() && !coarsePointer()) return 'Reconnect'; // cached but not live this session
    return 'No AI';
  }
  // The status GLYPH (Lucide), mirroring chipLabel's branches — conveys the tier by
  // SHAPE so it's legible without colour (WCAG 1.4.1). cloud=cloud · cpu=on-device ·
  // circle-slash=off/floor · loader-circle=reconnecting · triangle-alert=failed.
  function tierIcon(a) {
    if (reconnecting) return 'loader-circle';
    if (!a.modelOn) return 'circle-slash';
    if (a.generation === 'openrouter') return 'cloud';
    if (a.generation !== 'floor' && a.generation !== 'mock') return 'cpu';
    if (lastError) return 'triangle-alert';
    return 'circle-slash';
  }
  function refresh() {
    if (trigger) {
      const a = model.availability();
      const label = trigger.querySelector('.db-model-chip-label');
      if (label) label.textContent = chipLabel(a); // gear ::before + dot ::after stay put
      else trigger.textContent = chipLabel(a);
      trigger.title = 'AI: ' + tierLabel(a) + ' — tap for settings';
      const active = reconnecting || (a.modelOn && a.generation !== 'floor');
      trigger.classList.toggle('is-floor', !active);
      trigger.dataset.tier = tierIcon(a); // CSS maps it to the per-state ::after glyph
    }
    if (isOpen()) render();
  }

  // ── a shared download flow ───────────────────────────────────────────────────
  async function runLoad(kind, loader, btn, bar, prog) {
    abort = new AbortController();
    btn.disabled = true;
    prog.hidden = false;
    // Ask for persistent storage right before a big download — the browser is far
    // likelier to grant it on a deliberate action, so the weights survive longer.
    try { await navigator.storage?.persist?.(); } catch {}
    lastError = null;
    try {
      await loader((p) => {
        const frac = Math.max(0, Math.min(1, p?.progress || 0)); // backends normalize to 0..1
        const pct = Math.round(frac * 100);
        bar.style.width = pct + '%';
        // After the files hit 100% there's a silent instantiate phase (compiling
        // the model) — say so, so a slow finish doesn't look like a hang.
        btn.textContent = pct >= 100 ? 'Preparing model…' : `Downloading… ${pct}%`;
      }, abort.signal);
      writeTier(kind);
      try { sessionStorage.setItem(RESTORE_GUARD, '1'); } catch {} // it's live now
      refresh();
      onChange?.();
    } catch (e) {
      // Don't swallow it — the user reported "downloads but never activates", which
      // is a silently-caught load failure. Surface the reason on-screen + console.
      lastError = (e && (e.message || String(e))) || 'unknown error';
      try { console.error('[Architect] on-device model failed to load:', e); } catch {}
      btn.disabled = false;
      btn.textContent = 'Load failed — retry';
      prog.hidden = true;
      refresh(); // re-render shows the error note
    }
  }

  async function removeModel() {
    try {
      const keys = await caches.keys();
      for (const k of keys) if (/transformers|webllm|mlc|onnx|model|hugging|xet/i.test(k)) await caches.delete(k);
    } catch {}
    writeTier(null);
    try { sessionStorage.removeItem(RESTORE_GUARD); } catch {}
    refresh();
  }

  // Inspect Cache Storage so the popover can say WHAT is downloaded (model names),
  // instead of an opaque origin-total number. Sizes aren't always on the cached
  // responses, so the readable list of names is the honest signal.
  async function cachedModels() {
    try {
      if (typeof caches === 'undefined') return [];
      const names = new Set();
      for (const cn of await caches.keys()) {
        if (!/transformers|webllm|mlc|onnx|hugging|xet|model/i.test(cn)) continue;
        const cache = await caches.open(cn);
        for (const req of await cache.keys()) {
          const m = req.url.match(/huggingface\.co\/[^/]+\/([^/?#]+)/i)
            || req.url.match(/(SmolLM2-\d+M-Instruct|Qwen[\d.]+-[\d.]+B-Instruct|bge-small-en-v1\.5)/i);
          if (m) names.add(m[1] || m[0]);
          else if (/mlc|web-llm/i.test(cn)) names.add('WebLLM');
        }
      }
      return [...names];
    } catch { return []; }
  }

  // ── Cloud AI (Converse) — the connected OpenRouter account ────────────────────
  // The connect button lives in the Converse panel; this section is the ongoing
  // control: the OpenRouter model picker (with pricing), caching, standing
  // instructions, and Disconnect. Shown only once OpenRouter is connected.

  // ── the OpenRouter model picker (accordion) + its sibling controls ────────────
  // OpenRouter ships 500+ models — a native <select> made that an unscannable wall
  // and printed nonsense pricing. The picker is now an in-place ACCORDION (no nested
  // drawer): collapsed it shows the current model + price with a chevron and a
  // "Tap to change model" hint; expanded it reveals search + a Featured/All toggle +
  // the vendor-grouped, priced list. Every control announces itself (cue + tip) —
  // nothing is "click and hope".
  // The curated lists, pricing/format/grouping helpers, and the view tabs live in
  // the shared catalog module (or-catalog.js) so the Studio Workspace picker reuses
  // the exact same curation — see the imports at the top of this file.
  const wordCount = (s) => { const t = s.trim(); return t ? t.split(/\s+/).length : 0; };

  function orPicker() {
    const wrap = el('div', 'db-or-picker');
    const summary = el('button', 'db-or-summary');
    summary.type = 'button';
    summary.setAttribute('aria-expanded', 'false');
    // Line 1: the model NAME. Line 2: its DETAILS (ctx · price). The "tap to change"
    // affordance is a caption BELOW the control (db-or-hint), like other fields.
    const sName = el('span', 'db-or-summary-name', model.openRouterModel());
    const sDetail = el('span', 'db-or-summary-detail', '');
    const sText = el('span', 'db-or-summary-text');
    sText.append(sName, sDetail);
    summary.append(sText, el('span', 'db-or-chevron'));

    const body = el('div', 'db-or-body');
    body.hidden = true;
    const search = el('input', 'db-or-search');
    search.type = 'search';
    search.placeholder = 'Search 500+ models…';
    search.setAttribute('aria-label', 'Search OpenRouter models');
    const seg = el('div', 'db-or-seg');
    const segBtns = {};
    for (const [key, label] of OR_VIEWS) {
      const btn = el('button', 'db-or-seg-btn' + (key === 'featured' ? ' is-on' : ''), label);
      btn.type = 'button';
      btn.addEventListener('click', () => {
        view = key;
        for (const k in segBtns) segBtns[k].classList.toggle('is-on', k === key);
        renderList();
      });
      segBtns[key] = btn;
      seg.append(btn);
    }
    const list = el('div', 'db-or-list');
    body.append(search, seg, list);
    const hint = el('p', 'db-or-hint', 'Tap to change model'); // caption below the control
    wrap.append(summary, body, hint);

    let view = 'featured';
    let q = '';
    const setSummary = () => {
      const cur = (orModelsCache || []).find((m) => m.id === model.openRouterModel());
      sName.textContent = cur ? shortName(cur) : model.openRouterModel();
      sDetail.textContent = cur ? metaLabel(cur) : '';
    };
    const renderList = () => {
      list.innerHTML = '';
      if (!orModelsCache) { list.append(el('p', 'db-or-empty', 'Loading models…')); return; }
      const items = filterModels(orModelsCache, view, q);
      if (!items.length) {
        list.append(el('p', 'db-or-empty', emptyMessage(view)));
        return;
      }
      for (const { vendor, models } of groupByVendor(items)) {
        list.append(el('div', 'db-or-group', vendor));
        for (const m of models) {
          const row = el('label', 'db-or-row');
          const sel = m.id === model.openRouterModel();
          if (sel) row.classList.add('is-sel');
          const r = document.createElement('input');
          r.type = 'radio'; r.name = 'db-or-model'; r.value = m.id; r.checked = sel;
          r.className = 'db-or-row-radio';
          r.addEventListener('change', () => {
            model.setOpenRouterModel(m.id);
            setSummary();
            body.hidden = true; summary.setAttribute('aria-expanded', 'false'); wrap.classList.remove('is-open');
            onChange?.();
            refresh(); // rebuild so the caching switch re-gates on the new model's support
          });
          const meta = el('span', 'db-or-row-meta');
          const nameEl = el('span', 'db-or-row-name', shortName(m));
          if (m.vision) nameEl.append(el('span', 'db-or-row-badge', 'vision'));
          meta.append(nameEl, el('span', 'db-or-row-price', metaLabel(m)));
          const t = rowTitle(m);
          if (t) row.title = t;
          row.append(r, meta);
          list.append(row);
        }
      }
    };
    summary.addEventListener('click', async () => {
      const open = body.hidden;
      body.hidden = !open;
      summary.setAttribute('aria-expanded', String(open));
      wrap.classList.toggle('is-open', open);
      if (open) {
        if (!orModelsCache) { try { orModelsCache = await model.listOpenRouterModels(); } catch {} }
        setSummary(); renderList(); search.focus();
      }
    });
    search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); renderList(); });
    // Preload the catalog so the COLLAPSED summary reads "Claude Sonnet 4 · $3/M…"
    // (friendly name + price) immediately, not the raw "vendor/model-id".
    if (orModelsCache) setSummary();
    else model.listOpenRouterModels().then((l) => { orModelsCache = l; setSummary(); }).catch(() => {});
    return wrap;
  }

  // Prompt caching — a labelled switch (cue + tip). Default on; the user can opt out.
  // Gated per-model: disabled with an honest "Not supported by this model" line when
  // the selected model's vendor doesn't support OpenRouter prompt caching, so the
  // toggle never lies. Re-gated on model change (the select handler calls refresh()).
  function cacheToggle() {
    const supported = orSupportsCache(model.openRouterModel());
    const row = el('label', 'db-or-switch' + (supported ? '' : ' is-disabled'));
    const text = el('span', 'db-pref-text');
    text.append(el('span', 'db-pref-label', 'Prompt caching'),
      el('span', 'db-pref-hint', supported
        ? 'Cheaper repeat turns — reuses the static prompt'
        : 'Not supported by this model'));
    const sw = el('span', 'db-switch');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'db-switch-input';
    cb.setAttribute('aria-label', 'Prompt caching');
    cb.disabled = !supported;
    cb.checked = supported && readCachingEnabled();
    cb.addEventListener('change', () => { try { localStorage.setItem(OR_CACHE_KEY, cb.checked ? 'on' : 'off'); } catch {} });
    sw.append(cb, el('span', 'db-switch-knob'));
    row.append(text, sw);
    return row;
  }

  // Standing instructions — a labelled textarea with a live word counter (cue + tip).
  function standingInstructions() {
    const box = el('div', 'db-or-instr');
    box.append(el('span', 'db-pref-label', 'Standing instructions'));
    box.append(el('span', 'db-pref-hint', 'Always tell the Architect this — applies to every chat (audience, tone, house style…)'));
    const ta = document.createElement('textarea');
    ta.className = 'db-or-instr-input';
    ta.rows = 3;
    ta.placeholder = 'e.g. We’re a fintech pitching Series B. Prefer dense tables. UK English.';
    try { ta.value = localStorage.getItem(OR_INSTR_KEY) || ''; } catch {}
    const counter = el('span', 'db-or-instr-count');
    const update = () => { const n = wordCount(ta.value); counter.textContent = `${n} / ${INSTR_MAX} words`; counter.classList.toggle('over', n > INSTR_MAX); };
    update();
    ta.addEventListener('input', () => { update(); try { localStorage.setItem(OR_INSTR_KEY, ta.value); } catch {} });
    box.append(ta, counter);
    return box;
  }

  // Connect from Settings (symmetric with Disconnect — you no longer have to go
  // hunt the Converse panel). One-click OAuth (PKCE): redirect to openrouter.ai;
  // the ?code= return is handled on load by the page, which re-renders connected.
  function connectControl() {
    const btn = el('button', 'db-btn db-btn-primary', 'Connect OpenRouter');
    btn.type = 'button';
    const err = el('p', 'db-settings-error');
    err.hidden = true;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Redirecting…';
      err.hidden = true;
      try {
        const url = await model.beginOpenRouterAuth(location.origin + location.pathname);
        location.href = url;
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Connect OpenRouter';
        err.textContent = 'Couldn’t start sign-in: ' + ((e && e.message) || e);
        err.hidden = false;
      }
    });
    const wrap = el('div', 'db-or-connect');
    wrap.append(btn, err);
    return wrap;
  }

  // Disconnect forgets the stored key (reconnecting means re-doing OAuth), so it
  // carries the same guardrail as deck deletion — chosen by the `deleteStyle`
  // preference: 'confirm' morphs into an inline "Disconnect?" bar; 'undo' does it
  // optimistically + a reversible toast (key snapshot restored on Undo).
  function doDisconnect() {
    model.disconnectOpenRouter();
    model.refreshAvailability().then(() => { refresh(); onChange?.(); });
  }
  function disconnectControl() {
    const wrap = el('div', 'db-or-disconnect');
    const showButton = () => {
      wrap.innerHTML = '';
      const dc = el('button', 'db-btn db-settings-remove', 'Disconnect OpenRouter');
      dc.type = 'button';
      dc.addEventListener('click', () => {
        if (getPref('deleteStyle') === 'undo') {
          const snap = model.openRouterKeySnapshot();
          doDisconnect();
          window.__dbStore?.toast?.('Disconnected OpenRouter.', 'Undo', () => {
            model.restoreOpenRouter(snap);
            model.refreshAvailability().then(() => { refresh(); onChange?.(); });
          });
        } else {
          showConfirm();
        }
      });
      wrap.append(dc);
    };
    const showConfirm = () => {
      wrap.innerHTML = '';
      const bar = el('div', 'db-confirm-bar');
      bar.append(el('span', 'db-confirm-msg', 'Disconnect OpenRouter? You’ll sign in again.'));
      const yes = el('button', 'db-btn db-settings-remove', 'Disconnect');
      yes.type = 'button';
      yes.addEventListener('click', doDisconnect);
      const no = el('button', 'db-btn', 'Cancel');
      no.type = 'button';
      no.addEventListener('click', showButton);
      bar.append(yes, no);
      wrap.append(bar);
    };
    showButton();
    return wrap;
  }

  // The account readout. The OpenRouter account `used`/`left` is AUTHORITATIVE
  // (fetched with the user's key) — that's the real spend. The local figure is only
  // an honest "this session" live tally (accumulated from each reply's usage.cost);
  // we deliberately DON'T show a local "all-time" — it would start at 0 on this
  // device and contradict the real account total (the bug you spotted: "$0.00").
  function accountStrip() {
    const box = el('div', 'db-or-account');
    const acct = el('p', 'db-or-account-line', 'Checking account…');
    const s = readSpend();
    const spend = el('p', 'db-or-account-line db-or-account-spend',
      `This session: ${fmtUSD(s.session)}${s.sessionTokens ? ` (${fmtTokens(s.sessionTokens)} tokens)` : ''}`);
    box.append(acct, spend);
    Promise.resolve(model.openRouterAccount?.()).then((info) => {
      if (!info) { acct.remove(); return; } // unavailable (e.g. no per-key limit on a management-only endpoint) → hide
      const left = info.remaining != null ? `${fmtUSD(info.remaining)} left` : null;
      const used = info.usage != null ? `${fmtUSD(info.usage)} used` : null;
      const parts = [left, used].filter(Boolean).join(' · ');
      if (parts) acct.textContent = `OpenRouter: ${parts}`;
      else { acct.remove(); return; }
      // flag a low balance (≤20% of a known limit, or ≤ the user's floor) so the
      // figure reads as a warning, not just info.
      const st = budgetStatus({ account: info, floor: readBudgetFloor() });
      if (st.level !== 'ok') acct.classList.add('is-low');
    }).catch(() => acct.remove());
    return box;
  }

  // The budget guardrail controls: an optional self-cap on this session's app spend,
  // the alert/stop choice, and a low-balance floor (for no-limit keys). Plain
  // localStorage writes — the chat reads them per turn via the exported readers.
  function budgetBlock() {
    const box = el('div', 'db-or-budget');
    box.append(el('span', 'db-pref-label', 'Budget'));
    box.append(el('span', 'db-pref-hint', 'Optional guardrail — warns at 80%, then alerts or stops at your cap.'));
    const dollarInput = (key, placeholder, aria, read) => {
      const wrap = el('span', 'db-or-budget-input');
      wrap.append(el('span', 'db-or-budget-dollar', '$'));
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = '0'; inp.step = '0.5'; inp.className = 'db-or-budget-num';
      inp.placeholder = placeholder; inp.setAttribute('aria-label', aria);
      const v = read(); if (v > 0) inp.value = String(v);
      inp.addEventListener('change', () => { try { localStorage.setItem(key, inp.value || ''); } catch {} });
      wrap.append(inp);
      return wrap;
    };
    const capRow = el('label', 'db-or-budget-row');
    capRow.append(el('span', null, 'Cap spend this session'), dollarInput(BUDGET_CAP_KEY, 'off', 'Session spend cap in dollars', readBudgetCap));
    box.append(capRow);

    const modeRow = el('div', 'db-or-budget-row');
    modeRow.append(el('span', null, 'When reached'));
    const seg = el('div', 'db-or-seg db-or-budget-mode');
    const alertBtn = el('button', 'db-or-seg-btn' + (readBudgetMode() === 'alert' ? ' is-on' : ''), 'Alert');
    const stopBtn = el('button', 'db-or-seg-btn' + (readBudgetMode() === 'stop' ? ' is-on' : ''), 'Stop');
    alertBtn.type = stopBtn.type = 'button';
    const pick = (val) => { try { localStorage.setItem(BUDGET_MODE_KEY, val); } catch {} alertBtn.classList.toggle('is-on', val === 'alert'); stopBtn.classList.toggle('is-on', val === 'stop'); };
    alertBtn.addEventListener('click', () => pick('alert'));
    stopBtn.addEventListener('click', () => pick('stop'));
    seg.append(alertBtn, stopBtn);
    modeRow.append(seg);
    box.append(modeRow);

    const floorRow = el('label', 'db-or-budget-row');
    floorRow.append(el('span', null, 'Warn when balance below'), dollarInput(BUDGET_FLOOR_KEY, 'off', 'Low-balance warning threshold in dollars', readBudgetFloor));
    box.append(floorRow);
    return box;
  }

  function cloudSection(a) {
    const sec = el('section', 'db-settings-cloud');
    // (the 'Cloud AI' tab labels this section — no redundant heading)
    if (!a.openRouterReady) {
      sec.append(el('p', 'db-settings-note',
        'Connect OpenRouter — your own account, one-click sign-in, your credits, any of 500+ models.'));
      sec.append(connectControl());
      return sec;
    }
    sec.append(accountStrip());
    sec.append(el('p', 'db-pref-label', 'OpenRouter model'));
    sec.append(orPicker());
    sec.append(cacheToggle());
    sec.append(standingInstructions());
    sec.append(budgetBlock());
    sec.append(disconnectControl());
    return sec;
  }

  // ── the popover ──────────────────────────────────────────────────────────────
  // The On-device AI tab — master switch, in-use indicator, tier readout, on-demand
  // loaders (universal / WebLLM), load errors, and the downloaded-model cache
  // controls. Built from the async probes (WebGPU / storage / cache list).
  function onDeviceSection(a, { webgpu, est, models }) {
    const heavyOk = webgpu && !coarsePointer(); // WebLLM only on a desktop GPU
    const panel = el('section', 'db-settings-ondevice');

    // Master switch.
    const row = el('label', 'db-settings-row');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = a.modelOn;
    cb.addEventListener('change', () => {
      writeEnabled(cb.checked);
      model.refreshAvailability().then(() => { refresh(); onChange?.(); });
    });
    row.append(cb, el('span', null, 'Use on-device AI when available'));
    panel.append(row);

    // What's actually in use right now — front and centre (the "which model" ask).
    const active = reconnecting || (a.modelOn && a.generation !== 'floor');
    const inUse = el('div', active ? 'db-settings-active on' : 'db-settings-active');
    const tIco = tierIcon(a);
    const ico = el('span', 'db-tier-ico' + (tIco === 'loader-circle' ? ' is-spin' : ''));
    ico.style.setProperty('--db-glyph', `var(--icon-${tIco})`);
    inUse.append(ico, el('span', null, 'In use: ' + tierLabel(a)));
    panel.append(inUse);

    panel.append(el('p', 'db-settings-note',
      'Off = fully deterministic (no model, nothing downloaded). Findings, scores and ' +
      'fixes are identical either way — the model only adds phrasing and conversation.'));

    // Tier readout.
    const tiers = el('div', 'db-settings-tiers');
    const tier = (name, state) => {
      const r = el('div', 'db-settings-tier');
      r.append(el('span', 'db-settings-tier-name', name), el('span', 'db-settings-tier-state', state));
      tiers.append(r);
    };
    tier('Built-in AI (Chrome/Edge)', a.promptApi === 'available' ? 'ready' : a.promptApi === 'downloadable' ? 'downloadable' : 'not here');
    tier('Universal (on-device)', a.universalReady ? 'in use' : coarsePointer() ? 'desktop only' : 'loadable');
    tier('Advanced · WebLLM', a.webllmReady ? 'in use' : heavyOk ? 'available' : coarsePointer() ? 'desktop only' : 'needs WebGPU');
    panel.append(tiers);

    const loadFlow = (kind, label, note, loader) => {
      const btn = el('button', 'db-btn db-btn-primary db-settings-summon', label);
      btn.type = 'button';
      const prog = el('div', 'db-settings-progress');
      const bar = el('i');
      prog.append(bar);
      prog.hidden = true;
      btn.addEventListener('click', () => runLoad(kind, loader, btn, bar, prog));
      panel.append(btn, prog, el('p', 'db-settings-note', note));
    };

    if (a.modelOn) {
      // On-device models are a DESKTOP capability. A phone tab can't hold the
      // weights (~350 MB–1 GB) without the OOM-reload we chased for weeks, and the
      // tiny models that do fit aren't worth it — so mobile gets no local tier at
      // all. Real conversation on a phone comes from Converse (cloud, OpenRouter).
      if (coarsePointer()) {
        panel.append(el('p', 'db-settings-note',
          'On-device AI runs on desktop only — phone tabs can’t hold the model. ' +
          'On this device, Coach gives you the deterministic review, and Converse ' +
          'gives you a real conversation (cloud-powered via OpenRouter).'));
      } else {
        // Universal Transformers.js — the no-GPU desktop path (works in any browser).
        if (a.promptApi !== 'available' && !a.universalReady && !a.webllmReady) {
          loadFlow('universal', 'Load on-device AI (~350 MB · any desktop browser)',
            'A one-time download so the Architect can converse privately on THIS computer — no GPU needed. It’s a compact model (modest answers), runs in your browser, and stays on your device. Prefer the highest quality? Use Converse (cloud) instead.',
            (p, s) => model.loadUniversal(p, s));
        }
        // WebLLM — desktop GPUs only (it crashes phone tabs).
        if (heavyOk && !a.webllmReady) {
          loadFlow('webllm', 'Advanced: WebLLM (~1 GB · desktop GPU)',
            'The highest-quality on-device tier, for capable desktops. Optional — the lighter tiers stay available.',
            (p, s) => model.summon(p, s));
        }
      }
    }

    // Surface the last load failure (was previously swallowed) so it's diagnosable.
    if (lastError) {
      const err = el('div', 'db-settings-error');
      err.append(el('strong', null, 'On-device AI couldn’t load. '));
      err.append(el('span', null, lastError));
      panel.append(err);
    }

    // Downloaded-model controls — show WHAT's cached (by name) so it's not a
    // mystery number, plus the on-device total, plus a clear Remove.
    if (models?.length || readTier() || a.universalReady || a.webllmReady) {
      panel.append(el('h3', 'db-settings-head db-settings-subhead', 'Downloaded on this device'));
      if (models?.length) {
        const list = el('ul', 'db-settings-models');
        for (const name of models) list.append(el('li', null, name));
        panel.append(list);
      } else {
        panel.append(el('p', 'db-settings-note', 'Nothing downloaded yet.'));
      }
      const cache = el('div', 'db-settings-cache');
      cache.append(el('span', 'db-settings-cache-label', est?.usage ? `~${fmtBytes(est.usage)} total (models + your decks)` : 'Cached on this device'));
      const rm = el('button', 'db-btn db-settings-remove', 'Remove models');
      rm.type = 'button';
      rm.title = 'Delete the cached model weights';
      rm.addEventListener('click', removeModel);
      cache.append(rm);
      panel.append(cache);
      panel.append(el('p', 'db-settings-note', 'Remove deletes the downloaded model weights to free space (they re-download if you load a model again). Your decks are kept.'));
    }
    return panel;
  }

  // ── the Voice tab — read-aloud configuration ─────────────────────────────────
  // Where the voice comes from (Auto · Cloud · On-device · Off), which voice (with
  // "play sample"), and the on-device download/remove. One shared `voice` model
  // backs this and Practice, so a pref set here takes effect there immediately.
  const VOICE_RUNG_PREFS = [['auto', 'Auto'], ['openrouter', 'Cloud'], ['kokoro', 'On‑device'], ['off', 'Off']];
  function voiceRungLabel(va) {
    if (va.rung === 'openrouter-tts') return 'Cloud (OpenRouter)';
    if (va.rung === 'kokoro') return 'On‑device (Kokoro)';
    if (va.rung === 'speechSynthesis') return 'System voice (dev)';
    return 'No voice yet';
  }
  function rungPrefHint(pref) {
    if (pref === 'openrouter') return 'Always use the hosted cloud voice (needs a connected account).';
    if (pref === 'kokoro') return 'Always use the on‑device voice (needs the one‑time download).';
    if (pref === 'off') return 'Read‑aloud is disabled — Practice stays silent.';
    // On mobile the on-device voice isn't offered, so Auto means cloud-or-nothing.
    if (!voice.availability().kokoroSupported) return 'Use the cloud voice when an account is connected (on‑device voice is desktop‑only).';
    return 'Use the cloud voice when an account is connected, otherwise the on‑device voice once downloaded.';
  }

  // A pickable voice list with a "play sample" on each row. Sampling needs the rung
  // ready (cloud connected / Kokoro loaded); otherwise the play buttons are disabled.
  function voicePicker({ rung, voices, current, set, canSample }) {
    const wrap = el('div', 'db-voice-picker');
    const list = el('div', 'db-voice-list');
    // Surfaces WHY a sample failed (HTTP error, unsupported audio, blocked playback)
    // right under the picker — the only on-device diagnostic on iOS.
    const sampleErr = el('p', 'db-settings-error db-voice-sample-err');
    sampleErr.hidden = true;
    voices.forEach(([id, name, desc, flag]) => {
      const row = el('div', 'db-voice-row' + (current === id ? ' is-on' : ''));
      const pick = el('button', 'db-voice-pick');
      pick.type = 'button';
      pick.setAttribute('aria-pressed', String(current === id));
      const meta = el('span', 'db-voice-meta');
      const nm = el('span', 'db-voice-name', name);
      if (flag) nm.append(el('span', 'db-voice-star', ' ★'));
      meta.append(nm, el('span', 'db-voice-desc', desc));
      pick.append(meta);
      pick.addEventListener('click', () => { set(id); refresh(); });
      const play = el('button', 'db-voice-sample');
      play.type = 'button';
      play.disabled = !canSample;
      play.title = canSample ? 'Play a sample of ' + name : 'Connect or download this voice to hear a sample';
      play.setAttribute('aria-label', play.title);
      play.innerHTML = '<span class="ico ico-play" aria-hidden="true"></span>';
      play.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!canSample) return;
        voice.unlock?.(); // resume the WebAudio context on the tap (iOS audio policy)
        play.disabled = true;
        play.innerHTML = '<span class="ico ico-loader spin" aria-hidden="true"></span>';
        sampleErr.hidden = true;
        let res;
        try { res = await voice.previewVoice({ rung, voice: id }); } catch (err) { res = { ok: false, error: String((err && err.message) || err) }; }
        if (res && res.ok === false) { sampleErr.textContent = 'Sample failed: ' + (res.error || 'unknown error'); sampleErr.hidden = false; }
        play.innerHTML = '<span class="ico ico-play" aria-hidden="true"></span>';
        play.disabled = !canSample;
      });
      row.append(pick, play);
      list.append(row);
    });
    wrap.append(list, sampleErr);
    return wrap;
  }

  function voiceSection() {
    const va = voice.availability();
    const panel = el('section', 'db-settings-voice');
    panel.append(el('p', 'db-settings-note',
      'Read‑aloud narrates the current slide’s speaker notes while you rehearse in Practice. Choose where the voice comes from and which voice to use.'));

    // In use — the live rung.
    const inUse = el('div', va.rung !== 'silent' ? 'db-settings-active on' : 'db-settings-active');
    inUse.append(el('span', null, 'In use: ' + voiceRungLabel(va)));
    panel.append(inUse);

    // Voice source — the rung preference, as a segmented control.
    panel.append(el('h3', 'db-settings-head db-settings-subhead', 'Voice source'));
    const seg = el('div', 'db-voice-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Voice source');
    const cur = voice.rungPref();
    // On-device is desktop-only — drop it from the source choices on mobile so it
    // isn't an option that silently falls back to cloud/silent.
    VOICE_RUNG_PREFS.filter(([key]) => key !== 'kokoro' || va.kokoroSupported).forEach(([key, label]) => {
      const b = el('button', 'db-voice-seg-btn' + (cur === key ? ' is-on' : ''), label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(cur === key));
      b.addEventListener('click', () => { voice.setRungPref(key); refresh(); });
      seg.append(b);
    });
    panel.append(seg);
    panel.append(el('p', 'db-settings-note', rungPrefHint(cur)));

    if (cur !== 'off') {
      // Cloud voice (OpenRouter).
      panel.append(el('h3', 'db-settings-head db-settings-subhead', 'Cloud voice (OpenRouter)'));
      if (va.openRouterReady) {
        panel.append(voicePicker({ rung: 'openrouter', voices: OR_VOICES, current: voice.orVoice(), set: (v) => voice.setOrVoice(v), canSample: true }));
      } else {
        panel.append(el('p', 'db-settings-note', 'Cheap, instant, no download — but it sends your notes to the cloud. Connect an account in Cloud AI to use it.'));
        const link = el('button', 'db-voice-link', 'Open Cloud AI →');
        link.type = 'button';
        link.addEventListener('click', () => { activeTab = 'cloud'; render(); });
        panel.append(link);
      }

      // On-device voice (Kokoro) — DESKTOP ONLY for now. On phones/tablets the
      // ~80 MB onnxruntime load is the unreliable, memory-heavy path on Safari/iOS,
      // so we don't offer it there; mobile uses the cloud voice above.
      panel.append(el('h3', 'db-settings-head db-settings-subhead', 'On‑device voice (Kokoro)'));
      if (!va.kokoroSupported) {
        panel.append(el('p', 'db-settings-note',
          'On‑device voice is desktop‑only for now — on phones and tablets, use the cloud voice above (no download, nothing to load into memory).'));
      } else {
        const stateTxt = va.kokoroReady ? 'Loaded — ready to speak'
          : va.kokoroCached ? 'Downloaded — loads on first use'
          : 'Not downloaded (~80 MB)';
        panel.append(el('div', 'db-voice-state' + (va.kokoroReady || va.kokoroCached ? ' is-on' : ''), stateTxt));

        if (!va.kokoroCached && !va.kokoroReady) {
          const btn = el('button', 'db-btn db-btn-primary db-settings-summon', 'Download voice (~80 MB)');
          btn.type = 'button';
          const prog = el('div', 'db-settings-progress');
          const bar = el('i');
          prog.append(bar);
          prog.hidden = true;
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            prog.hidden = false;
            try { await navigator.storage?.persist?.(); } catch {}
            try {
              await voice.loadKokoro((p) => {
                const pct = Math.round(Math.max(0, Math.min(1, p?.progress || 0)) * 100);
                bar.style.width = pct + '%';
                btn.textContent = pct >= 100 ? 'Preparing voice…' : `Downloading… ${pct}%`;
              });
              refresh();
            } catch {
              btn.disabled = false;
              btn.textContent = 'Download failed — retry';
              prog.hidden = true;
            }
          });
          panel.append(btn, prog);
          panel.append(el('p', 'db-settings-note',
            'A one‑time download so the voice runs entirely in your browser — no account, nothing leaves your device. It loads in a background worker.'));
        }

        panel.append(voicePicker({ rung: 'kokoro', voices: KOKORO_VOICES, current: voice.kokoroVoice(), set: (v) => voice.setKokoroVoice(v), canSample: va.kokoroReady }));
        if (!va.kokoroReady && va.kokoroCached) {
          panel.append(el('p', 'db-settings-note', 'Press play on a slide in Practice to load the voice into this tab, then return here to audition the voices.'));
        }

        if (va.kokoroCached || va.kokoroReady) {
          const cache = el('div', 'db-settings-cache');
          cache.append(el('span', 'db-settings-cache-label', 'Kokoro‑82M downloaded on this device'));
          const rm = el('button', 'db-btn db-settings-remove', 'Remove voice');
          rm.type = 'button';
          rm.title = 'Delete the cached voice weights';
          rm.addEventListener('click', async () => { await removeKokoro(); refresh(); });
          cache.append(rm);
          panel.append(cache);
        }
      }
    }

    panel.append(el('p', 'db-settings-note',
      'Privacy: the on‑device voice never leaves your device. The cloud voice sends the slide’s notes to OpenRouter to synthesize speech.'));
    return panel;
  }

  // Delete only the Kokoro voice weights from Cache Storage (leaves any AI model
  // caches intact), then re-probe so the Voice tab + Practice reflect "removed".
  async function removeKokoro() {
    try {
      for (const cn of await caches.keys()) {
        if (!/transformers|onnx|hugging|xet|model/i.test(cn)) continue;
        const cache = await caches.open(cn);
        for (const req of await cache.keys()) {
          if (/Kokoro-82M/i.test(req.url)) await cache.delete(req);
        }
      }
    } catch {}
    try { await voice?.probeKokoroCache?.(); } catch {}
  }

  // The tab strip — Workspace · Cloud AI · On-device · Voice. Splits the once-long
  // scroll into short panes; the model chip deep-links to the Cloud AI tab.
  function tabStrip() {
    const tabs = el('div', 'db-settings-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Settings sections');
    const TABS = [['workspace', 'Workspace'], ['cloud', 'Cloud AI'], ['ondevice', 'On-device'], ['voice', 'Voice']];
    TABS.forEach(([key, label], i) => {
      const b = el('button', 'db-settings-tab' + (activeTab === key ? ' is-on' : ''), label);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(activeTab === key));
      b.tabIndex = activeTab === key ? 0 : -1;
      b.addEventListener('click', () => { if (activeTab !== key) { activeTab = key; render(); } });
      b.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        activeTab = TABS[(i + d + TABS.length) % TABS.length][0];
        render();
        host.querySelector('.db-settings-tab.is-on')?.focus();
      });
      tabs.append(b);
    });
    return tabs;
  }

  async function render() {
    const my = ++renderToken;
    host.innerHTML = '';
    host.append(tabStrip());
    const panel = el('div', 'db-settings-panel');
    panel.setAttribute('role', 'tabpanel');
    host.append(panel);
    const a = model.availability();
    // Workspace + Cloud AI are synchronous — paint immediately. On-device needs the
    // async probes (WebGPU / storage / cache), so only that tab awaits them; the
    // renderToken guard drops a stale paint if a newer render/tab-switch superseded.
    if (activeTab === 'workspace') { panel.append(workspaceSection()); return; }
    if (activeTab === 'cloud') { panel.append(cloudSection(a)); return; }
    if (activeTab === 'voice') { if (voice) panel.append(voiceSection()); return; }
    const [webgpu, est, models] = await Promise.all([
      probeWebGPU(),
      (navigator.storage?.estimate ? navigator.storage.estimate().catch(() => null) : Promise.resolve(null)),
      cachedModels(),
    ]);
    if (my !== renderToken) return;
    panel.append(onDeviceSection(a, { webgpu, est, models }));
  }

  // ── reconnect a previously-loaded model after a page reload ───────────────────
  // The weights are cached, but the running engine lives in memory and is lost on
  // reload — so re-initialise it (fast from cache). One auto-attempt per tab
  // session (a guard breaks any crash-reload loop); after that it's the chip's
  // one-tap "Reconnect". WebLLM is never auto-restored on a phone.
  async function restore() {
    const tier = readTier();
    if (!tier || !model.availability().modelOn) return;
    // On-device tiers are desktop-only now — never re-init a local model on a
    // phone (the weights can't survive the tab; Converse covers chat there).
    if (coarsePointer()) return;
    if (tier === 'webllm' && !(await probeWebGPU())) return;
    try {
      if (sessionStorage.getItem(RESTORE_GUARD) === '1') return;
      sessionStorage.setItem(RESTORE_GUARD, '1');
    } catch {}
    reconnecting = true;
    refresh();
    try {
      if (tier === 'universal') await model.loadUniversal(() => {});
      else if (tier === 'webllm') await model.summon(() => {});
      onChange?.();
    } catch {
      // Leave the flag so the chip offers a manual reconnect; don't loop.
    }
    reconnecting = false;
    refresh();
  }

  refresh();
  return { refresh, render, restore, openTab, isEnabled: readEnabled };
}
