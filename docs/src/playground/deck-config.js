import { SIZE_OPTIONS } from './deck-sizes.js';

// Deck setup — the universal front-matter config panel.
//
// A first-class home for a deck's Marp front matter, so the author never
// hand-writes YAML and the Markdown body stays content-only ("the deck stays
// clean"). The controls read/write a MANAGED `---` block at the very top of a
// deck source through an injected getSource/setSource pair — so the panel is
// decoupled from where the source lives. It backs three surfaces:
//   • Drawing Board / Playground — SOURCE-backed: the block lives inline at the
//     top of the editor's markdown (persists + exports with the deck for free).
//   • Workbench (Theme / Layout Studio) — STATE-backed: the studio hands the
//     panel a VIRTUAL source (`block + fixed specimen/skeleton`); setSource
//     strips the block back off and stores just it, applying it at render time —
//     so a fixed preview deck is configurable "behind the scenes", no raw YAML.
//
// `fields` (optional) is an allow-list of which managed keys to render — the
// surface's PROFILE. Omitted = every field (the Drawing Board's full author
// set). A preview surface passes the render-register subset (finish,
// size, paginate, form) so deck chrome (header/footer/lang/…) stays out of a
// theme/component preview. The parse/serialize layer is field-agnostic; only the
// rendered rows are filtered.
//
// The parse/serialize helpers are PURE (no DOM, no storage) and unit-tested in
// test/unit/playground/deck-config.test.js. createConfigPanel() is the only DOM
// consumer and is never called at import, so the module loads in Node.
//
// Front-matter grammar matches Marp / lib/engine/directives.js: a leading
// `---\n…\n---` flat key:value block. We re-emit a minimal block — only
// non-default keys, always led by `marp: true` so the exported `.md` renders
// through marp-cli — and remove the block entirely when nothing is configured.

// The managed fields and their "default" (omitted) value. A field at its default
// is dropped from the block, so a pristine deck carries no front matter at all.
const FIELD_DEFAULTS = {
  // `theme` is the deck's palette — the one value the top-bar picker, this
  // drawer's select, and the editor all reflect (full three-way sync). It's
  // written explicitly into the deck (transparent, portable) rather than forced
  // on at render time. Validity is enforced where it's PROPAGATED (the
  // controller only syncs a registered palette), not here — writeFrontMatter
  // never scrubs a hand-typed value out of the author's source.
  theme: '',
  // (Accessibility / colour-vision-deficiency is no longer a separate front-matter
  // key — the a11y-* palettes are plain themes now, written through `theme:` like
  // any other. There is no `accessibility:` axis.)
  // `finish` is the deck-wide BACKDROP register (lib/core/resolve-finish.js):
  // '' / 'none' is the baseline (omitted), 'atrium' … 'gallery' opt in a backdrop.
  finish: '',
  // `mode` is the deck-wide rendering-MODE register (lib/core/resolve-mode.js):
  // '' / 'boardroom' is the baseline (omitted), 'sketch' / 'sketch-clean' opt in.
  // Orthogonal to `finish:` — the two compose.
  mode: '',
  // (The `tokens:` directive + its Drawing-Board A/B toggle were retired once the
  // universal-token canonical flip completed — there is one vocabulary now.)
  // `split` is how the body divides into slides (lib/core/resolve-split.js):
  // 'headings' (the default → omitted) splits on each h1/h2 (eyebrow-aware, `---`
  // still honoured) so the deck needs no separators; 'rule' opts back to `---`-only.
  split: 'headings',
  // `autosplit` opts the deck into the Fit Ladder's SPLIT move: an over-capacity
  // slide is divided across extra pages at render (lib/core/auto-split.js). Off
  // (default → omitted) / on; `true`/`yes` are read as on, the canonical written
  // value is `on`. A portrait/square-family behavior — a no-op at a landscape
  // @size, where collapse + shed resolve overflow first (lint warns via
  // `autosplit-landscape-noop`). Surfaced as a boolean, like `paginate`.
  autosplit: 'off',
  size: 'hd', // default landscape (memorable name; 16:9 geometry) (themes also define 4K / standard)
  paginate: 'false',
  header: '',
  footer: '',
  class: '',
  // `form` is the deck-wide Form composition model: 'standard' (masthead band +
  // bay + progress rail) is the DEFAULT — so it's the omitted value, and a deck
  // at standard carries no `form:` key. 'minimal' (band + bay, no rail) and 'off'
  // (the opt-out) are the explicit values written into the block. `on`/`true`/`yes`
  // read as standard; `false`/`no` read as off. Mirrors readFormMode in plugins.js.
  form: 'standard',
  // `validate` governs the editor's INLINE validation — the deck-grammar lint
  // findings (the same the Architect lists) drawn as underlines + hover fixes. On
  // is the default (so it's the omitted value); a deck opts OUT with `validate: off`
  // — e.g. one leaning on bespoke/local classes where the underlines are noise.
  // Lives in front matter so the choice TRAVELS with the deck (and its exported .md).
  validate: 'on',
  math: '', // '' / 'katex' = the default KaTeX renderer; 'mathjax' switches
  lang: '',
  // `backdrop.strength` is an axis of the NESTED `backdrop:` map (not a flat key):
  // the deck-wide finish dimmer (0–1; 1 = full = the omitted default). It reads/
  // writes the `backdrop:` block specially (splitFrontMatter captures that block as
  // one object entry so the flat emitter can't flatten it). See lib/core/
  // resolve-backdrop.js + engineering/decisions/2026-07-01-finish-restraint-controls.md.
  'backdrop.strength': '',
  // `backdrop.clearance` is a nested toggle: 'on' recedes the finish behind the
  // content box (default off/omitted). Like strength, an axis of the `backdrop:` map.
  'backdrop.clearance': '',
};
const MANAGED = Object.keys(FIELD_DEFAULTS);

// Human labels for the finish-register (backdrop) options (the names themselves
// come from the resolve-finish handoff, so an added finish still appears —
// titleCased — without touching this map).
const FINISH_LABELS = {
  none: 'None — no backdrop',
};

// Human labels for the mode-register (rendering-mode) options.
const MODE_LABELS = {
  boardroom: 'Boardroom — clean baseline',
  sketch: 'Sketch — hand-drawn',
  'sketch-clean': 'Sketch · clean body',
};

// Emit order for known keys; any unmanaged keys we preserved trail in their
// original order. `marp` leads (it's what tells marp-cli to render the deck).
const EMIT_ORDER = ['marp', 'theme', 'mode', 'finish', 'backdrop', 'split', 'autosplit', 'size', 'paginate', 'header', 'footer', 'class', 'form', 'validate', 'math', 'lang'];

// Field PROFILES per surface — the `fields` allow-list createConfigPanel takes.
//   author  — every field (the Drawing Board: full set, theme three-way synced).
//   noTheme — full set minus `theme` (the Playground: its top-bar palette picker
//             is the theme control, and there's no source-theme sync there, so a
//             drawer theme row would be a confusing no-op).
//   preview — the render registers only (the Workbench: knobs that change how a
//             theme/component PREVIEWS — finish/size/paginate/form —
//             with no deck chrome and no theme, which the studio itself owns).
export const CONFIG_PROFILES = Object.freeze({
  author: null,
  noTheme: ['mode', 'finish', 'backdrop.strength', 'backdrop.clearance', 'split', 'autosplit', 'size', 'paginate', 'header', 'footer', 'class', 'form', 'validate', 'math', 'lang'],
  // `autosplit` is a deck-AUTHORING concern (does my over-capacity content
  // divide?), not a theme/component PREVIEW register — so it's deliberately out
  // of the preview profile (a fixed specimen never overflows). It rides the full
  // author set + the Playground (noTheme) only.
  preview: ['mode', 'finish', 'backdrop.strength', 'backdrop.clearance', 'size', 'paginate', 'form'],
});

const TRUEY = /^(true|yes|on|1)$/i;
const FALSEY = /^(false|no|off|0)$/i;

// Canonicalise a `form:` value to one of the three modes. Mirrors readFormMode
// in lib/integrations/markdown-it/plugins.js: 'standard' is the DEFAULT, so an
// absent/empty value (and any `on`/`true`/`yes`) resolves to standard; only the
// explicit `off`/`false`/`no` opts out, and `minimal` drops the rail.
function formMode(raw) {
  const v = (raw == null ? '' : String(raw)).trim().toLowerCase();
  if (/^(off|false|no)$/.test(v)) return 'off';
  if (v === 'minimal') return 'minimal';
  return 'standard';
}

function stripQuotes(v) {
  const t = (v || '').trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

// Split the leading `---\n…\n---` block into ordered [key, value] entries (flat
// scalar map, per Marp) plus the body with the block removed. `present` flags
// whether a block existed. Mirrors the front-matter regex in directives.js.
function splitFrontMatter(source) {
  const src = source || '';
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return { entries: [], body: src, present: false };
  const entries = [];
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // The one NESTED key: `backdrop:` (a bare map header) — capture its indented
    // children as a single object entry so the flat emitter can't flatten it into
    // stray `backdrop:` + `strength:` scalars. See resolve-backdrop.js.
    if (line.trim() === 'backdrop:') {
      const child = {};
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
        const sub = /^\s+([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(lines[i + 1]);
        if (sub) child[sub[1]] = sub[2].trim();
        i++;
      }
      entries.push(['backdrop', child]);
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line.trim());
    if (kv) entries.push([kv[1], kv[2].trim()]);
    // Non key:value lines (blanks, stray comments) are dropped — Marp front
    // matter is a flat scalar map, matching parseFrontMatter in directives.js.
  }
  return { entries, body: src.slice(m[0].length), present: true };
}

// The form-facing view of a deck's current front matter — pre-fills the drawer's
// controls ("some of which are filled in"). paginate is surfaced as a boolean;
// everything else as a trimmed string with sensible defaults.
export function readFrontMatter(source) {
  const { entries, present } = splitFrontMatter(source);
  const map = {};
  for (const [k, v] of entries) map[k] = k === 'backdrop' ? v : stripQuotes(v);
  // `backdrop.strength`: the axis of the nested block, clamped 0–1; '' when
  // absent or at the default (1). The form surfaces it as a `backdrop.strength`
  // field; it never round-trips as a flat key.
  const bdRaw = map.backdrop && map.backdrop.strength;
  const bdNum = bdRaw == null || bdRaw === '' ? NaN : Number.parseFloat(bdRaw);
  const backdropStrength = Number.isFinite(bdNum) ? String(Math.min(1, Math.max(0, bdNum))) : '';
  // `backdrop.clearance`: 'on' when the nested axis is truthy, '' (off) otherwise.
  const clRaw = map.backdrop && map.backdrop.clearance;
  const backdropClearance = TRUEY.test(String(clRaw || '').trim()) ? 'on' : '';
  return {
    theme: map.theme || '',
    mode: map.mode || '',
    finish: map.finish || '',
    'backdrop.strength': backdropStrength,
    'backdrop.clearance': backdropClearance,
    split: (map.split || 'headings').trim().toLowerCase() === 'rule' ? 'rule' : 'headings',
    // `autosplit` is binary — surfaced as a boolean (like paginate) for the switch.
    autosplit: TRUEY.test(map.autosplit || ''),
    size: map.size || 'hd',
    paginate: TRUEY.test(map.paginate || ''),
    header: map.header || '',
    footer: map.footer || '',
    class: map.class || '',
    // Absent `form:` → 'standard' (the default), so the drawer reflects that Form
    // is on out of the box; an explicit `form: off` / `minimal` pre-fills as typed.
    form: formMode(map.form),
    // `validate` is binary, default ON — surfaced as a boolean (like paginate) for
    // the switch. On unless the deck explicitly opts out with a falsey value.
    validate: !FALSEY.test((map.validate || '').trim()),
    math: map.math || '',
    lang: map.lang || '',
    // Whether the deck carries any NON-THEME managed front matter — drives the
    // trigger's "configured" cue. `theme` is excluded: with full sync nearly
    // every deck has one, so it isn't a signal of bespoke setup.
    configured: present && (
      MANAGED.some((k) => k !== 'theme' && !k.startsWith('backdrop.') && map[k] != null && map[k] !== '' && !isDefault(k, map[k]))
      || backdropStrength !== '' || backdropClearance !== ''
    ),
  };
}

function isDefault(key, value) {
  if (key === 'paginate') return !TRUEY.test(value);
  // `autosplit` is binary — off (any non-truthy) is the omitted default.
  if (key === 'autosplit') return !TRUEY.test(value);
  // `validate` is binary, default ON — so on (any non-falsey) is the omitted
  // default; only an explicit `validate: off` is written into the block.
  if (key === 'validate') return !FALSEY.test(String(value).trim());
  if (key === 'math') return value === '' || value === 'katex';
  // `form` defaults to 'standard' (on) — that's the omitted value; only `off` /
  // `minimal` are written into the block.
  if (key === 'form') return formMode(value) === 'standard';
  // 'none' is the named backdrop baseline — the same no-class result as omitting
  // finish, so it's treated as the default and dropped from the block.
  if (key === 'finish') { const f = (value == null ? '' : String(value)).trim().toLowerCase(); return f === '' || f === 'none'; }
  // 'boardroom' is the named style (mode) baseline — dropped from the block.
  if (key === 'mode') { const s = (value == null ? '' : String(value)).trim().toLowerCase(); return s === '' || s === 'boardroom'; }
  // 'headings' is the default — same render as omitting split, so it's dropped
  // from the block; only the explicit 'rule' opt-out is written.
  if (key === 'split') { const s = (value == null ? '' : String(value)).trim().toLowerCase(); return s === '' || s === 'headings'; }
  // backdrop.strength: 1 (full) is the default — the omitted value; so is empty/invalid.
  if (key === 'backdrop.strength') { const n = Number.parseFloat(value); return !Number.isFinite(n) || Math.min(1, Math.max(0, n)) === 1; }
  // backdrop.clearance: off (any non-truthy) is the omitted default; only `on` is written.
  if (key === 'backdrop.clearance') return !TRUEY.test(String(value).trim());
  return (value == null ? '' : String(value)) === FIELD_DEFAULTS[key];
}

// Coerce a control's value into the canonical front-matter string, or null when
// it's at its default (and should be omitted). `value` is a boolean for
// paginate, a string otherwise.
function normalize(key, value) {
  if (key === 'paginate') return value === true || TRUEY.test(value || '') ? 'true' : null;
  // `autosplit` writes the canonical `on` when enabled; off omits the key. The
  // engine reads on/true/yes — we always emit `on` (matches the example decks).
  if (key === 'autosplit') return value === true || TRUEY.test(value || '') ? 'on' : null;
  // `validate` is default ON, so on omits the key; only an opt-OUT is written, as
  // the canonical `off`. The switch passes a boolean (checked = validation on).
  if (key === 'validate') return value === false || FALSEY.test(String(value).trim()) ? 'off' : null;
  const v = (value == null ? '' : String(value)).trim();
  if (key === 'math') return v === '' || v === 'katex' ? null : v;
  // `form`: standard (the default) omits the key; off / minimal are written.
  if (key === 'form') { const m = formMode(v); return m === 'standard' ? null : m; }
  // none = backdrop baseline → omit (same no-class render as no key at all).
  if (key === 'finish') { const f = v.toLowerCase(); return f === '' || f === 'none' ? null : f; }
  // boardroom = style (mode) baseline → omit.
  if (key === 'mode') { const s = v.toLowerCase(); return s === '' || s === 'boardroom' ? null : s; }
  if (key === 'split') { return v.toLowerCase() === 'rule' ? 'rule' : null; }
  // backdrop.strength: clamp 0–1; 1 (full) / empty / invalid → omit the axis.
  if (key === 'backdrop.strength') {
    const n = Number.parseFloat(v);
    if (!Number.isFinite(n)) return null;
    const c = Math.min(1, Math.max(0, n));
    return c === 1 ? null : String(c);
  }
  // backdrop.clearance: on writes `on`; off/empty omits the axis (default off).
  if (key === 'backdrop.clearance') return value === true || TRUEY.test(v) ? 'on' : null;
  if (v === '' || v === FIELD_DEFAULTS[key]) return null;
  return v;
}

// A scalar that needs quoting to round-trip through a flat YAML reader: a colon
// or hash (would start an inline mapping / comment) or edge whitespace. Booleans,
// sizes and keywords never trip this, so they stay bare like the example decks.
function quoteIfNeeded(value) {
  const v = String(value);
  if (/[:#]/.test(v) || /^\s|\s$/.test(v) || v === '') return `"${v.replace(/"/g, '\\"')}"`;
  return v;
}

// Set (or clear) ONE managed field and return the rewritten source. Re-reads the
// current block each call, so it composes with manual edits and never clobbers
// unmanaged keys (style, backgroundColor, a hand-typed theme, …). Managed keys
// are canonicalized + re-quoted as needed; unmanaged keys are emitted verbatim
// (we don't know their grammar). When the block would hold nothing but `marp`,
// it's removed entirely — back to a clean deck.
export function writeFrontMatter(source, key, value) {
  const { entries, body, present } = splitFrontMatter(source);

  // Partition the existing block: managed keys → bare canonical values we own;
  // everything else → preserved verbatim in original order. `marp` is re-derived.
  const managed = new Map();
  const preserved = [];
  let backdrop = {}; // the nested `backdrop:` map, edited via the `backdrop.*` keys
  for (const [k, raw] of entries) {
    if (k === 'marp') continue;
    if (k === 'backdrop') {
      // raw is the captured child object; keep only real axis values.
      for (const [ax, av] of Object.entries(raw || {})) if (av != null && av !== '') backdrop[ax] = av;
    } else if (MANAGED.includes(k)) {
      const n = normalize(k, k === 'paginate' ? raw : stripQuotes(raw));
      if (n != null) managed.set(k, n);
    } else {
      preserved.push([k, raw]);
    }
  }

  // Apply the incoming change (null = clear → at default). A `backdrop.<axis>` key
  // edits the nested map; everything else is a flat managed key.
  if (key.startsWith('backdrop.')) {
    const axis = key.slice('backdrop.'.length);
    const norm = normalize(key, value);
    if (norm == null) delete backdrop[axis];
    else backdrop[axis] = norm;
  } else {
    const norm = normalize(key, value);
    if (norm == null) managed.delete(key);
    else managed.set(key, norm);
  }

  const backdropAxes = Object.entries(backdrop).filter(([, v]) => v != null && v !== '');
  if (managed.size === 0 && preserved.length === 0 && backdropAxes.length === 0) {
    // Nothing configured → drop the block; collapse the gap it left behind.
    return present ? body.replace(/^\n+/, '') : source;
  }

  const presAt = (k) => preserved.find(([pk]) => pk === k);
  const lines = ['marp: true']; // leads the block so an exported .md renders
  for (const k of EMIT_ORDER) {
    if (k === 'marp') continue;
    if (k === 'backdrop') {
      if (backdropAxes.length) {
        lines.push('backdrop:');
        for (const [ax, v] of backdropAxes) lines.push(`  ${ax}: ${v}`);
      }
      continue;
    }
    if (managed.has(k)) lines.push(`${k}: ${quoteIfNeeded(managed.get(k))}`);
    const p = presAt(k);
    if (p) lines.push(`${p[0]}: ${p[1]}`); // e.g. a hand-typed theme, at its slot
  }
  for (const [pk, pv] of preserved) {
    if (!EMIT_ORDER.includes(pk)) lines.push(`${pk}: ${pv}`); // trailing unknowns
  }
  return `---\n${lines.join('\n')}\n---\n\n${body.replace(/^\n+/, '')}`;
}

// ── the drawer panel ──────────────────────────────────────────────────────────
// Builds the contextual controls, pre-filled from the deck's current front
// matter, and writes each change straight back into the editor source (which
// re-renders + autosaves via the controller's onEdit). DOM-only; called when the
// drawer opens.
/**
 * @param {{
 *   host?: HTMLElement | null,
 *   trigger?: HTMLElement | null,
 *   getSource?: () => string,
 *   setSource?: (next: string) => void,
 *   palettes?: string[],
 *   finishes?: string[],
 *   modes?: string[],
 *   getDefaultTheme?: () => string,
 *   fields?: string[] | null,
 *   note?: string,
 * }} [opts]
 */
export function createConfigPanel({ host, trigger, getSource, setSource, palettes = [], finishes = [], modes = [], getDefaultTheme = () => '', fields = null, note } = {}) {
  if (!host || typeof getSource !== 'function' || typeof setSource !== 'function') {
    return { render() {}, syncTrigger() {}, writeFrontMatter };
  }

  // The surface's field PROFILE: an allow-list of which managed keys to render.
  // null = every field (the full author set). `show(key)` gates each row.
  const allow = Array.isArray(fields) ? new Set(fields) : null;
  const show = (key) => !allow || allow.has(key);

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const titleCase = (s) => s.replace(/(^|-)(\w)/g, (_, sep, c) => (sep ? ' ' : '') + c.toUpperCase());

  // Reflect whether the deck carries managed front matter on the trigger — a
  // quiet accent cue (matching the model chip's active state) that the deck has
  // been configured. Cheap; safe to call on every edit.
  function syncTrigger() {
    if (!trigger) return;
    try { trigger.classList.toggle('is-set', readFrontMatter(getSource()).configured); } catch { /* no-op */ }
  }

  // Apply a single field, then refresh the trigger cue. We do NOT re-render the
  // panel so text inputs keep focus + caret while typing.
  function apply(key, value) {
    try { setSource(writeFrontMatter(getSource(), key, value)); } catch { /* editor gone */ }
    syncTrigger();
  }

  // A label + hint pair (the left side of every row).
  function text(label, hint) {
    const t = el('div', 'db-pref-text');
    t.append(el('span', 'db-pref-label', label));
    if (hint) t.append(el('span', 'db-pref-hint', hint));
    return t;
  }

  // An inline select row (theme, size, math) — label/hint left, <select> right.
  // `rerender` re-paints the panel after a change (the theme row uses it so the
  // "unknown theme" note + the select settle on the new valid value).
  function selectRow(key, label, hint, options, current, rerender = false) {
    const row = el('div', 'db-pref-row');
    const sel = el('select', 'db-pref-select');
    sel.setAttribute('aria-label', label);
    for (const [value, optLabel] of options) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = optLabel;
      if (value === current) o.selected = true;
      sel.append(o);
    }
    sel.addEventListener('change', () => { apply(key, sel.value); if (rerender) render(); });
    row.append(text(label, hint), sel);
    return row;
  }

  // A switch row (paginate) — reuses the settings switch styling.
  function switchRow(key, label, hint, on) {
    const row = el('label', 'db-or-switch');
    const sw = el('span', 'db-switch');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'db-switch-input';
    cb.checked = !!on;
    cb.setAttribute('aria-label', label);
    cb.addEventListener('change', () => apply(key, cb.checked));
    sw.append(cb, el('span', 'db-switch-knob'));
    row.append(text(label, hint), sw);
    return row;
  }

  // A slider row (backdrop strength) — label/hint left, a range input + live %
  // readout right. 0–1 dial (1 = full = the omitted default); writes on input.
  function sliderRow(key, label, hint, value) {
    const row = el('div', 'db-pref-row');
    const wrap = el('div', 'db-pref-slider');
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '1';
    range.step = '0.05';
    range.value = value === '' || value == null ? '1' : String(value);
    range.className = 'db-pref-range';
    range.setAttribute('aria-label', label);
    const pct = (v) => `${Math.round(Number.parseFloat(v) * 100)}%`;
    const out = el('span', 'db-pref-slider-value', pct(range.value));
    range.addEventListener('input', () => { out.textContent = pct(range.value); apply(key, range.value); });
    wrap.append(range, out);
    row.append(text(label, hint), wrap);
    return row;
  }

  // A stacked text field (header, footer, class, lang) — label/hint above a
  // full-width input, since these run long. Writes debounced as you type so the
  // live preview tracks the edit without thrashing the editor on every keystroke.
  function textField(key, label, hint, value, placeholder) {
    const box = el('div', 'db-config-field');
    box.append(text(label, hint));
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'db-config-input';
    inp.value = value || '';
    if (placeholder) inp.placeholder = placeholder;
    inp.setAttribute('aria-label', label);
    let t = null;
    inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => apply(key, inp.value), 250); });
    inp.addEventListener('change', () => { clearTimeout(t); apply(key, inp.value); });
    box.append(inp);
    return box;
  }

  function render() {
    const fm = readFrontMatter(getSource());
    host.innerHTML = '';

    host.append(el('p', 'db-settings-note', note ||
      'These live in the deck’s front matter — managed for you, so the Markdown stays clean. ' +
      'They apply to the whole deck and travel with an exported .md.'));

    // Theme — the deck's palette, written into the front matter and kept in sync
    // with the top-bar palette picker (same value, set in either place). Light /
    // dark is the separate top-bar toggle, so the options are the base palettes.
    if (show('theme') && palettes.length) {
      const raw = fm.theme;
      const valid = !!raw && palettes.includes(raw);
      const current = valid ? raw : (getDefaultTheme() || palettes[0] || '');
      host.append(selectRow('theme', 'Theme',
        'Palette — synced with the top-bar picker', // transparent, not magic
        palettes.map((p) => [p, titleCase(p)]), current, true));
      if (raw && !valid) {
        // Don't propagate a nonexistent theme — say so, and keep rendering the
        // fallback rather than blanking the deck.
        host.append(el('p', 'db-settings-note db-config-warn',
          `“${raw}” isn’t a known theme — the deck renders with ${current} until you pick a valid one.`));
      }
    }

    // Mode — the deck-wide rendering MODE (boardroom / sketch / sketch-clean),
    // orthogonal to the palette AND the backdrop. Boardroom is the baseline, so
    // picking it clears the key (a clean deck carries no mode:).
    if (show('mode') && modes.length) {
      const current = fm.mode && modes.includes(fm.mode) ? fm.mode : 'boardroom';
      host.append(selectRow('mode', 'Mode',
        'The rendering hand — clean or sketch — applies to the whole deck',
        modes.map((s) => [s, MODE_LABELS[s] || titleCase(s)]), current));
    }

    // Finish — the deck-wide BACKDROP register (none / atrium … gallery), the
    // palette-blind layer stack painted behind content; composes with the mode. None
    // is the baseline, so picking it clears the key (a deck with no backdrop).
    if (show('finish') && finishes.length) {
      const current = fm.finish && finishes.includes(fm.finish) ? fm.finish : 'none';
      host.append(selectRow('finish', 'Finish',
        'A palette-blind backdrop behind content — applies to the whole deck',
        finishes.map((f) => [f, FINISH_LABELS[f] || titleCase(f)]), current));
    }

    // Backdrop strength — dims the whole finish (0–100%). A control ON the backdrop
    // layer, orthogonal to which finish is chosen; 100% is full (the default).
    if (show('backdrop.strength')) {
      host.append(sliderRow('backdrop.strength', 'Finish strength',
        'Dim the finish so it sits back behind the content', fm['backdrop.strength']));
    }

    // Backdrop clearance — recede the finish behind the content box so the words
    // sit on clean canvas; the finish reads as a frame at the margins. Opt-in.
    if (show('backdrop.clearance')) {
      host.append(switchRow('backdrop.clearance', 'Clear behind content',
        'Recede the finish behind the text so it reads only at the margins', fm['backdrop.clearance'] === 'on'));
    }

    // Slide splitting — how the body divides into slides. 'headings' (the
    // default) starts a slide at each ## (the first # is the lead) so the deck
    // needs no separators; 'rule' opts back to needing a `---` between slides.
    if (show('split')) {
      host.append(selectRow('split', 'Slide splitting',
        'Start a new slide on each ## heading (default) or only on ---',
        [['headings', 'On ## headings'], ['rule', 'On --- dividers']], fm.split));
    }

    // Auto-split — opt the deck into the Fit Ladder's SPLIT move: an over-capacity
    // slide is divided across extra pages. A portrait/square-family behavior, so the
    // hint names the gate (lint warns on a landscape deck). It's a build-time pass
    // (lattice-emulator.js) — UNLIKE form (a live CSS class), it shows only on
    // EXPORT, never in this live preview. The hint says so, so the toggle doesn't
    // read as broken when the preview doesn't visibly change.
    if (show('autosplit')) {
      host.append(switchRow('autosplit', 'Auto-split overflow',
        'Split an over-capacity slide across extra pages — portrait & square sizes, applied on export (not shown in the live preview)', fm.autosplit));
    }

    if (show('size')) {
      host.append(selectRow('size', 'Slide size', 'Landscape, or a portrait / square format for social & mobile', SIZE_OPTIONS, fm.size));
    }

    if (show('paginate')) host.append(switchRow('paginate', 'Page numbers', 'Show pagination on every slide', fm.paginate));
    if (show('header')) host.append(textField('header', 'Header', 'Running header text on every slide', fm.header, 'e.g. Lattice · Q3 Board Review'));
    if (show('footer')) host.append(textField('footer', 'Footer', 'Running footer text on every slide', fm.footer, 'e.g. Confidential'));

    // Form — the deck-wide composition model (masthead band + bay + rail). On by
    // default, so 'standard' leads and carries the "(default)" cue; pick 'off' to
    // opt out or 'minimal' to drop the rail.
    if (show('form')) {
      host.append(selectRow('form', 'Form', 'Masthead band, meta/status bay & progress rail, deck-wide', [
        ['standard', 'Standard — band, bay & rail (default)'],
        ['minimal', 'Minimal — band & bay, no rail'],
        ['off', 'Off — no deck chrome'],
      ], fm.form));
    }

    // Inline validation — the editor's live deck-grammar check (the same findings
    // the Architect lists), drawn as underlines + hover fixes. On by default; a
    // deck can opt out (e.g. one built on bespoke local classes). The choice rides
    // in the front matter, so it travels with the deck.
    if (show('validate')) {
      host.append(switchRow('validate', 'Inline validation',
        'Underline layout/component grammar issues as you type, with a hover fix', fm.validate));
    }

    // Advanced — the lower-traffic deck-authoring keys. Only shown when the
    // profile includes at least one of them (a preview surface omits them all).
    if (show('class') || show('math') || show('lang')) {
      host.append(el('h3', 'db-settings-head db-settings-subhead', 'Advanced'));
      if (show('class')) host.append(textField('class', 'Default slide class', 'A class applied to every slide (e.g. dark)', fm.class, 'e.g. dark'));
      if (show('math')) {
        host.append(selectRow('math', 'Math renderer', 'How $…$ math is typeset', [
          ['', 'KaTeX (default)'],
          ['mathjax', 'MathJax'],
        ], fm.math === 'mathjax' ? 'mathjax' : ''));
      }
      if (show('lang')) host.append(textField('lang', 'Language', 'The deck’s document language tag', fm.lang, 'e.g. en'));
    }

    syncTrigger();
  }

  return { render, syncTrigger, writeFrontMatter };
}
