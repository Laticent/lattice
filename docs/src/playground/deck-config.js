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
  // `color-mode` is the deck-wide COLOR-MODE key (lib/core/resolve-color-mode.js):
  // '' (theme default) is the baseline (omitted); light/dark PIN a side, `system`
  // follows the viewer's OS, `inherited` adopts the host (site) mode. The first-class
  // successor to the legacy `class: dark/light` color axis.
  'color-mode': '',
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
  // `glossary` opts the deck into the auto-glossary: a reference-appendix slide built from
  // the `acronyms:` registry's `definition` fields (lib/core/glossary-auto.mjs, #920). Off
  // (default → omitted) / `auto`. Surfaced as a boolean, like `autosplit`; the canonical
  // written value is `auto`. No-op unless the deck's `acronyms:` registry defines a term.
  glossary: 'off',
  // `lift` opts the deck into card ELEVATION — the "Struck" box-shadow that lifts card
  // surfaces (cards-grid, kpi tiles, stats, …) off the slide (lib/core/resolve-lift.js).
  // Off (default → omitted) / `on`; surfaced as a boolean like `autosplit`, the canonical
  // written value is `on`. Per-slide `_class: lifted` / `flat` override it.
  lift: 'off',
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

// The color-mode options + labels (a fixed 4-value register + the theme-default baseline).
const COLOR_MODE_OPTIONS = [
  ['', 'Theme default'],
  ['light', 'Light'],
  ['dark', 'Dark'],
  ['system', 'System — follow the OS'],
  ['inherited', 'Match site / host'],
];

// Emit order for known keys; any unmanaged keys we preserved trail in their
// original order. `marp` leads (it's what tells marp-cli to render the deck).
const EMIT_ORDER = ['marp', 'theme', 'mode', 'color-mode', 'finish', 'split', 'autosplit', 'glossary', 'lift', 'size', 'paginate', 'header', 'footer', 'class', 'form', 'validate', 'math', 'lang'];

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
  noTheme: ['mode', 'color-mode', 'finish', 'split', 'autosplit', 'glossary', 'lift', 'size', 'paginate', 'header', 'footer', 'class', 'form', 'validate', 'math', 'lang'],
  // `autosplit` is a deck-AUTHORING concern (does my over-capacity content
  // divide?), not a theme/component PREVIEW register — so it's deliberately out
  // of the preview profile (a fixed specimen never overflows). It rides the full
  // author set + the Playground (noTheme) only.
  preview: ['mode', 'color-mode', 'finish', 'size', 'paginate', 'form', 'lift'],
});

const TRUEY = /^(true|yes|on|1)$/i;
const FALSEY = /^(false|no|off|0)$/i;

// Canonicalise a `form:` value to a mode. Mirrors readFormMode in
// lib/integrations/markdown-it/plugins.js: 'standard' is the DEFAULT, so an
// absent/empty value (and any `on`/`true`/`yes`) resolves to standard; only the
// explicit `off`/`false`/`no` opts out. (`minimal` retired 2026-07-03 → resolves
// to standard; its "no rail" look is now `class: no-progress`.)
function formMode(raw) {
  const v = (raw == null ? '' : String(raw)).trim().toLowerCase();
  if (/^(off|false|no)$/.test(v)) return 'off';
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
    // A NESTED block: a bare `key:` header (column 0, no value) whose following lines are
    // indented — e.g. `finish-override:`. Capture its raw child lines verbatim as one
    // entry `[key, { block: [...] }]`, so a flat Deck-setup edit re-emits the block
    // untouched instead of flattening it into stray scalars. (The retired `backdrop:`
    // block, if any leftover, rides the same preserve path.)
    const head = /^([A-Za-z_][\w-]*):[ \t]*$/.exec(line);
    if (head && i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
      const block = [];
      // Capture indented children; a BLANK line inside the block doesn't end it (an author
      // may space layers apart) — only a non-blank line at/left of column 0 does. Matches the
      // Studio writer (front-matter.ts parseFm), so the two can't disagree and shred a
      // `finish-override:` block's later layers into stray top-level scalars.
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || (lines[i + 1].trim() === '' && /^\s+\S/.test(lines[i + 2] || '')))) {
        block.push(lines[i + 1]);
        i++;
      }
      entries.push([head[1], { block }]);
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
  // Nested-block entries (`{ block: [...] }`, e.g. finish-override:) are preserved
  // verbatim, not form-managed — keep them out of the scalar map's stringly view.
  for (const [k, v] of entries) if (!(v?.block)) map[k] = stripQuotes(v);
  return {
    theme: map.theme || '',
    mode: map.mode || '',
    'color-mode': map['color-mode'] || '',
    finish: map.finish || '',
    split: (map.split || 'headings').trim().toLowerCase() === 'rule' ? 'rule' : 'headings',
    // `autosplit` is binary — surfaced as a boolean (like paginate) for the switch.
    autosplit: TRUEY.test(map.autosplit || ''),
    // `glossary` is binary — on when the deck opts in with `glossary: auto`.
    glossary: (map.glossary || '').trim().toLowerCase() === 'auto',
    // `lift` is binary — on when the deck opts in with `lift: on`.
    lift: TRUEY.test(map.lift || ''),
    size: map.size || 'hd',
    paginate: TRUEY.test(map.paginate || ''),
    header: map.header || '',
    footer: map.footer || '',
    class: map.class || '',
    // Absent `form:` → 'standard' (the default), so the drawer reflects that Form
    // is on out of the box; an explicit `form: off` pre-fills as typed.
    form: formMode(map.form),
    // `validate` is binary, default ON — surfaced as a boolean (like paginate) for
    // the switch. On unless the deck explicitly opts out with a falsey value.
    validate: !FALSEY.test((map.validate || '').trim()),
    math: map.math || '',
    lang: map.lang || '',
    // Whether the deck carries any NON-THEME managed front matter — drives the
    // trigger's "configured" cue. `theme` is excluded: with full sync nearly
    // every deck has one, so it isn't a signal of bespoke setup.
    configured: present &&
      MANAGED.some((k) => k !== 'theme' && map[k] != null && map[k] !== '' && !isDefault(k, map[k])),
  };
}

function isDefault(key, value) {
  if (key === 'paginate') return !TRUEY.test(value);
  // `autosplit` is binary — off (any non-truthy) is the omitted default.
  if (key === 'autosplit') return !TRUEY.test(value);
  // `glossary` is binary — off is the omitted default; only `glossary: auto` is written.
  if (key === 'glossary') return (value == null ? '' : String(value)).trim().toLowerCase() !== 'auto';
  // `lift` is binary — off is the omitted default; only `lift: on` is written.
  if (key === 'lift') return !TRUEY.test((value == null ? '' : String(value)).trim());
  // `validate` is binary, default ON — so on (any non-falsey) is the omitted
  // default; only an explicit `validate: off` is written into the block.
  if (key === 'validate') return !FALSEY.test(String(value).trim());
  if (key === 'math') return value === '' || value === 'katex';
  // `form` defaults to 'standard' (on) — that's the omitted value; only `off`
  // is written into the block.
  if (key === 'form') return formMode(value) === 'standard';
  // 'none' is the named backdrop baseline — the same no-class result as omitting
  // finish, so it's treated as the default and dropped from the block.
  if (key === 'finish') { const f = (value == null ? '' : String(value)).trim().toLowerCase(); return f === '' || f === 'none'; }
  // 'boardroom' is the named style (mode) baseline — dropped from the block.
  if (key === 'mode') { const s = (value == null ? '' : String(value)).trim().toLowerCase(); return s === '' || s === 'boardroom'; }
  // 'headings' is the default — same render as omitting split, so it's dropped
  // from the block; only the explicit 'rule' opt-out is written.
  if (key === 'split') { const s = (value == null ? '' : String(value)).trim().toLowerCase(); return s === '' || s === 'headings'; }
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
  // `glossary` writes the canonical `auto` when enabled; off omits the key. The switch
  // passes a boolean; a hand-typed `auto` is honored too.
  if (key === 'glossary') return value === true || (value != null && String(value).trim().toLowerCase() === 'auto') ? 'auto' : null;
  // `lift` writes the canonical `on` when enabled; off omits the key.
  if (key === 'lift') return value === true || TRUEY.test(value || '') ? 'on' : null;
  // `validate` is default ON, so on omits the key; only an opt-OUT is written, as
  // the canonical `off`. The switch passes a boolean (checked = validation on).
  if (key === 'validate') return value === false || FALSEY.test(String(value).trim()) ? 'off' : null;
  const v = (value == null ? '' : String(value)).trim();
  if (key === 'math') return v === '' || v === 'katex' ? null : v;
  // `form`: standard (the default) omits the key; only `off` is written.
  if (key === 'form') { const m = formMode(v); return m === 'standard' ? null : m; }
  // none = backdrop baseline → omit (same no-class render as no key at all).
  if (key === 'finish') { const f = v.toLowerCase(); return f === '' || f === 'none' ? null : f; }
  // boardroom = style (mode) baseline → omit.
  if (key === 'mode') { const s = v.toLowerCase(); return s === '' || s === 'boardroom' ? null : s; }
  if (key === 'split') { return v.toLowerCase() === 'rule' ? 'rule' : null; }
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
  const preserved = []; // [k, rawScalar] OR [k, { block: [...] }] — emitted verbatim
  for (const [k, raw] of entries) {
    if (k === 'marp') continue;
    if (raw?.block) {
      preserved.push([k, raw]); // a nested block (finish-override:, …) — never form-managed
    } else if (MANAGED.includes(k)) {
      const n = normalize(k, k === 'paginate' ? raw : stripQuotes(raw));
      if (n != null) managed.set(k, n);
    } else {
      preserved.push([k, raw]);
    }
  }

  // Apply the incoming change (null = clear → at default). Every managed field is flat.
  const norm = normalize(key, value);
  if (norm == null) managed.delete(key);
  else managed.set(key, norm);

  if (managed.size === 0 && preserved.length === 0) {
    // Nothing configured → drop the block; collapse the gap it left behind.
    return present ? body.replace(/^\n+/, '') : source;
  }

  // Emit a preserved entry: a nested block re-emits its header + verbatim child lines;
  // a flat unmanaged scalar re-emits at its slot.
  const emitPreserved = (pk, pv) => (pv?.block ? [`${pk}:`, ...pv.block] : [`${pk}: ${pv}`]);
  const presAt = (k) => preserved.find(([pk]) => pk === k);
  const lines = ['marp: true']; // leads the block so an exported .md renders
  for (const k of EMIT_ORDER) {
    if (k === 'marp') continue;
    if (managed.has(k)) lines.push(`${k}: ${quoteIfNeeded(managed.get(k))}`);
    const p = presAt(k);
    if (p) lines.push(...emitPreserved(p[0], p[1])); // e.g. a hand-typed theme, at its slot
  }
  for (const [pk, pv] of preserved) {
    if (!EMIT_ORDER.includes(pk)) lines.push(...emitPreserved(pk, pv)); // trailing unknowns
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

    // Color mode — the deck-wide COLOR-MODE key. Theme default is the baseline (picking
    // it clears the key); light/dark PIN a side, System follows the viewer's OS, and
    // "Match site / host" adopts the host container's mode. Honored by every render surface.
    if (show('color-mode')) {
      const cur = COLOR_MODE_OPTIONS.some(([v]) => v === fm['color-mode']) ? fm['color-mode'] : '';
      host.append(selectRow('color-mode', 'Color mode',
        'The mode the deck opens in everywhere — pin light/dark, follow the OS, or match the host',
        COLOR_MODE_OPTIONS, cur));
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

    // Backdrop is a BAKED layer of the finish now (strength / clearance), tuned in the
    // Fabricate designer and overridden per-deck through the `finish-override:` map — no
    // longer a Deck-setup control (the retired top-level `backdrop:` block).

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

    // Auto-glossary — generate a reference-appendix slide from the acronym registry's
    // definitions (#920). Unlike auto-split, this DOES show in the live preview (the
    // shared transform runs at the render chokepoint), so no "export only" caveat. The
    // hint names the prerequisite (an `acronyms:` registry with definitions) so the
    // toggle doesn't read as broken when a deck without one shows no new slide.
    if (show('glossary')) {
      host.append(switchRow('glossary', 'Auto-glossary',
        'Append a glossary slide built from your acronyms: definitions — needs at least one term with a definition', fm.glossary));
    }

    // Card lift — the opt-in "Struck" elevation. Lifts card surfaces off the slide with a
    // zero-blur shadow that reads in both light and dark and survives the PDF export
    // (resolve-lift.js). Shows in the live preview. Per-slide `_class: lifted` / `flat`
    // override the deck default in the source.
    if (show('lift')) {
      host.append(switchRow('lift', 'Card lift',
        'Lift card surfaces off the slide with a subtle shadow — reads in light & dark, safe in the PDF export', fm.lift));
    }

    if (show('size')) {
      host.append(selectRow('size', 'Slide size', 'Landscape, or a portrait / square format for social & mobile', SIZE_OPTIONS, fm.size));
    }

    if (show('paginate')) host.append(switchRow('paginate', 'Page numbers', 'Show pagination on every slide', fm.paginate));
    if (show('header')) host.append(textField('header', 'Header', 'Running header text on every slide', fm.header, 'e.g. Lattice · Q3 Board Review'));
    if (show('footer')) host.append(textField('footer', 'Footer', 'Running footer text on every slide', fm.footer, 'e.g. Confidential'));

    // Form — the deck-wide composition model (masthead band + bay + rail). On by
    // default, so 'standard' leads and carries the "(default)" cue; pick 'off' to
    // opt out. (To drop just the rail, use the Section-rail chrome control —
    // `class: no-progress`; the old `form: minimal` was retired 2026-07-03.)
    if (show('form')) {
      host.append(selectRow('form', 'Form', 'Masthead band, meta/status bay & progress rail, deck-wide', [
        ['standard', 'Standard — band, bay & rail (default)'],
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
