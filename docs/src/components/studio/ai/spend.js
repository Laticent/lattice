// The Studio's model spend + preference kernel — pure, DOM-free, Node-loadable.
//
// Split out of the Drawing Board's `drawing-board-settings.js` when the Studio took
// ownership of the AI cluster (engineering/decisions/2026-07-03-studio-succession.md
// §3). Everything here is storage + arithmetic: the OpenRouter preference readers, the
// per-Lattice spend tally, the budget gauge, and the two tier helpers. The DOM panel
// (`createModelSettings`) stayed behind on the frozen surface and dies with it.
//
// The storage KEYS keep their `lattice-db-*` names deliberately — they are user data
// (§3, "storage names are user data, not code"); renaming them would orphan a real
// user's budget, spend history, and standing instructions.

// OpenRouter Converse controls (written by the settings UI, READ by the chat).
// Module-scope so `chatComplete` can import the readers and feed them into the
// request — the controls are useless until the chat actually consumes them.
export const OR_CACHE_KEY = 'lattice-db-or-cache'; // prompt-caching opt-out (default on)
export const OR_INSTR_KEY = 'lattice-db-architect-instructions'; // standing instructions
const DEDUP_KEY = 'lattice-db-dedup'; // component-gen dedup suggestions (default on)
export const readCachingEnabled = () => { try { return localStorage.getItem(OR_CACHE_KEY) !== 'off'; } catch { return true; } };
// The opt-out needs a WRITER on a surviving surface. Its only one was the Drawing Board's
// settings panel, which died with that route — leaving anyone who had ever ticked it off
// stuck paying full input price on every turn with no way back. The Studio's Workspace
// sheet owns the control now.
export const writeCachingEnabled = (on) => { try { localStorage.setItem(OR_CACHE_KEY, on ? 'on' : 'off'); } catch { /* unavailable */ } };
// When on (default), AI component generation suggests near-duplicate components
// before generating, so the author reuses rather than bloats the catalog (§5/§8).
export const readDedupEnabled = () => { try { return localStorage.getItem(DEDUP_KEY) !== 'off'; } catch { return true; } };
export const writeDedupEnabled = (on) => { try { localStorage.setItem(DEDUP_KEY, on ? 'on' : 'off'); } catch { /* unavailable */ } };
// The component-generation EFFORT dial (2026-07-19-component-effort-dial.md): how many
// design self-refine rounds run after generation. The lever is effort, not spend —
// low (today's one-shot) · medium (DEFAULT — one refine) · high · maximum. Persisted
// per browser. The user-facing default lives HERE; `generateComponent`'s `?? 'low'` is
// only a programmatic fallback for a caller that passes no effort at all.
const EFFORT_KEY = 'lattice-db-component-effort';
const EFFORTS = ['low', 'medium', 'high', 'maximum'];
export const readComponentEffort = () => { try { const v = localStorage.getItem(EFFORT_KEY); return EFFORTS.includes(v) ? v : 'medium'; } catch { return 'medium'; } };
export const writeComponentEffort = (level) => { try { if (EFFORTS.includes(level)) localStorage.setItem(EFFORT_KEY, level); } catch { /* unavailable */ } };
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

// A SIGNED correction to the running cost tally. Unlike recordSpend (which only ever
// ACCUMULATES a positive charge), this can be NEGATIVE — used to reconcile an aborted
// turn's estimate to its authoritative cost, which is often LOWER than the estimate
// (prompt caching), so the gauge must be able to true DOWN, not only up. Each store is
// floored at 0 so a correction can never drive the tally negative.
export function adjustSpend(costDelta) {
  const d = Number(costDelta);
  if (!Number.isFinite(d) || d === 0) return;
  const bump = (store, key) => { try { if (store) store.setItem(key, String(Math.max(0, (Number(store.getItem(key)) || 0) + d))); } catch {} };
  bump(globalThis.localStorage, SPEND_TOTAL_KEY);
  bump(globalThis.sessionStorage, SPEND_SESSION_KEY);
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
export const BUDGET_CAP_KEY = 'lattice-db-budget-cap'; // optional self-cap on session app spend ($); 0/empty = off
export const BUDGET_MODE_KEY = 'lattice-db-budget-mode'; // 'alert' | 'stop'
export const BUDGET_FLOOR_KEY = 'lattice-db-budget-floor'; // warn when OpenRouter balance < $X (for no-limit keys)
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
