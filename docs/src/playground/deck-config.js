import frontMatterKey from '../../../lib/core/front-matter-key.js';
import { paginateOn } from '../../../lib/core/meta-keys.mjs';

// What `key` resolves to under the deck's `preset:` when the deck does not write it — the
// engine's own table (lib/core/front-matter-key.js), so a preset's backdrop or card lift reads
// as the deck's current value here, and picking the engine default under a preset that
// changes it WRITES the override instead of deleting the key (which would hand control back
// to the preset). engineering/decisions/2026-09-26-deck-presets-and-settings-tiers.md.
export const lookBaseline = (preset, key) => frontMatterKey.presetEffective(String(preset || '').split(/[ \t]#/)[0].trim().toLowerCase(), key);

// Deck setup — the front-matter layer behind the Playground's Deck settings sheet.
//
// A first-class home for a deck's Marp front matter, so the author never
// hand-writes YAML and the Markdown body stays content-only ("the deck stays
// clean"). The sheet's rows (DeckConfigPanel.tsx, drawn with the Studio's
// CatalogSelect) read and write a MANAGED `---` block at the very top of a deck
// source through an injected getSource/setSource pair, so this layer has no
// opinion about where a deck lives. The block lives inline at the top of the
// editor's markdown, so it persists and exports with the deck for free.
//
// Everything here is PURE (no DOM, no storage) and unit-tested in
// test/unit/playground/deck-config.test.js, so the module loads in Node. The
// rows themselves are tested in DeckConfigPanel.test.tsx. (Until 2026-10-27 this
// module also drew the rows as vanilla DOM, `createConfigPanel`, with native
// <select>s; the panel moved to React so its pickers match the Studio's.)
//
// Front-matter grammar matches Marp / lib/engine/directives.js: a leading
// `---\n…\n---` flat key:value block. We re-emit a minimal block — only
// non-default keys, always led by `marp: true` so the exported `.md` renders
// through marp-cli — and remove the block entirely when nothing is configured.

// The managed fields and their "default" (omitted) value. A field at its default
// is dropped from the block, so a pristine deck carries no front matter at all.
const FIELD_DEFAULTS = {
  // `theme` is the deck's palette — the one value the top-bar picker, the
  // sheet's Theme row, and the editor all reflect (full three-way sync). It's
  // written explicitly into the deck (transparent, portable) rather than forced
  // on at render time. Validity is enforced where it's PROPAGATED (the
  // controller only syncs a registered palette), not here — writeFrontMatter
  // never scrubs a hand-typed value out of the author's source.
  theme: '',
  // (Accessibility / color-vision-deficiency is no longer a separate front-matter
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
  // still honored) so the deck needs no separators; 'rule' opts back to `---`-only.
  split: 'headings',
  // `glossary` opts the deck into the auto-glossary: a reference-appendix slide built from
  // the `acronyms:` registry's `definition` fields (lib/core/glossary-auto.mjs, #920). Off
  // (default → omitted) / `auto`. Surfaced as a boolean, like `paginate`; the canonical
  // written value is `auto`. No-op unless the deck's `acronyms:` registry defines a term.
  glossary: 'off',
  // `lift` opts the deck into card ELEVATION — the "Struck" box-shadow that lifts card
  // surfaces (cards-grid, kpi tiles, stats, …) off the slide (lib/core/resolve-lift.js).
  // Off (default → omitted) / `on`; surfaced as a boolean like `paginate`, the canonical
  // written value is `on`. Per-slide `_class: lifted` / `flat` override it.
  lift: 'off',
  size: 'hd', // default landscape (memorable name; 16:9 geometry) (themes also define 4K / standard)
  // Page numbers are ON by default (the owner's ruling, 2026-10-20); a deck opts out with `paginate: false`.
  paginate: 'true',
  header: '',
  footer: '',
  class: '',
  // `validate` governs the editor's INLINE validation — the deck-grammar lint
  // findings (the same the Architect lists) drawn as underlines + hover fixes. On
  // is the default (so it's the omitted value); a deck opts OUT with `validate: off`
  // — e.g. one leaning on bespoke/local classes where the underlines are noise.
  // Lives in front matter so the choice TRAVELS with the deck (and its exported .md).
  validate: 'on',
  // (`math:` was a managed field with a Math-renderer control until 2026-08-18. NOTHING
  // in lib/ or lattice.js reads the key — a grep for `mathjax` across the engine
  // returns only the control that wrote it. Lattice types all math with KaTeX; the value
  // means something only to marp-core, i.e. to an exported .md later rendered by marp-cli.
  // A control that LOOKS like an input and is not is exactly what lib/core/export-settings.js
  // argues against, so the row is gone. The key is no longer MANAGED, which means a deck
  // that already carries one keeps it verbatim through the `preserved` path — retiring a
  // control must not delete an author's line.)
  lang: '',
  // THE LOOK — `preset:` and the family registers a preset sets (lib/core/front-matter-key.js
  // PRESETS). Each is '' at rest: the value the deck resolves to is the preset's, and only a
  // choice that DIFFERS from the preset is written (see normalize). The Studio surfaces these
  // as first-class settings; the Playground had none of them, so a deck's headline alignment,
  // heading rule, eyebrow and corners could only be changed by knowing the key names.
  preset: '',
  headline: '',
  rule: '',
  eyebrow: '',
  corners: '',
  // `venue:` — the room the deck is shown in; the engine sizes type for its back row
  // (lib/core/resolve-venue.js). `laptop` is the designed size and the omitted default.
  venue: '',
};
const MANAGED = Object.keys(FIELD_DEFAULTS);

// The preset-family registers this module manages. Values are the engine's own
// (lib/core/resolve-{headline,rule,eyebrow,corners}.js); the Playground's panel takes their
// options and labels from the Studio's catalogs (DeckConfigPanel.tsx).
const LOOK_KEYS = ['headline', 'rule', 'eyebrow', 'corners'];

// The preset picker's rows: each preset's name, label and the finish it sets, so the row's
// chip can show that backdrop. From the engine's own table, in its order.
export const PRESET_OPTIONS = frontMatterKey.PRESET_NAMES.map((name) => ({
  name,
  label: frontMatterKey.PRESETS[name].label,
  finish: frontMatterKey.presetEffective(name, 'finish') || 'none',
}));
// Emit order for known keys; any unmanaged keys we preserved trail in their
// original order. `marp` leads (it's what tells marp-cli to render the deck).
const EMIT_ORDER = ['marp', 'theme', 'preset', 'mode', 'color-mode', 'finish', 'headline', 'rule', 'eyebrow', 'corners', 'split', 'glossary', 'lift', 'size', 'venue', 'paginate', 'header', 'footer', 'class', 'validate', 'lang'];

const TRUEY = /^(true|yes|on|1)$/i;
const FALSEY = /^(false|no|off|0)$/i;

function stripQuotes(v) {
  const t = (v || '').trim();
  // A double-quoted value undoes exactly the two escapes `quoteIfNeeded` writes (`\\` and `\"`), so
  // writing and reading back is a round trip and repeated panel edits cannot pile escapes up (the
  // checker on #1958's second cut: three unrelated writes left 15 backslashes in one header).
  if (t.length > 1 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/\\([\\"])/g, '$1');
  if (t.length > 1 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1);
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

// The form-facing view of a deck's current front matter — pre-fills the sheet's
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
    // A preset's backdrop reads as the current value; `none` stays the empty baseline.
    finish: map.finish || (lookBaseline(map.preset, 'finish') === 'none' ? '' : lookBaseline(map.preset, 'finish')),
    split: (map.split || 'headings').trim().toLowerCase() === 'rule' ? 'rule' : 'headings',
    // `glossary` is binary — on when the deck opts in with `glossary: auto`.
    glossary: (map.glossary || '').trim().toLowerCase() === 'auto',
    // `lift` is binary — on when the deck opts in with `lift: on`.
    lift: map.lift ? TRUEY.test(map.lift) : lookBaseline(map.preset, 'lift') === 'on',
    size: map.size || 'hd',
    paginate: paginateOn(map.paginate),
    header: map.header || '',
    footer: map.footer || '',
    class: map.class || '',
    // `validate` is binary, default ON — surfaced as a boolean (like paginate) for
    // the switch. On unless the deck explicitly opts out with a falsey value.
    validate: !FALSEY.test((map.validate || '').trim()),
    lang: map.lang || '',
    preset: frontMatterKey.isKnownPreset(map.preset || '') ? String(map.preset).trim().toLowerCase() : '',
    // What each look register resolves to: the deck's own value, else its preset's.
    headline: (map.headline || lookBaseline(map.preset, 'headline')).trim().toLowerCase(),
    rule: (map.rule || lookBaseline(map.preset, 'rule')).trim().toLowerCase(),
    eyebrow: (map.eyebrow || lookBaseline(map.preset, 'eyebrow')).trim().toLowerCase(),
    corners: (map.corners || lookBaseline(map.preset, 'corners')).trim().toLowerCase(),
    venue: (map.venue || 'laptop').trim().toLowerCase(),
    // Whether the deck carries any NON-THEME managed front matter — drives the
    // trigger's "configured" cue. `theme` is excluded: with full sync nearly
    // every deck has one, so it isn't a signal of bespoke setup.
    configured: present &&
      MANAGED.some((k) => k !== 'theme' && map[k] != null && map[k] !== '' && !isDefault(k, map[k])),
  };
}

function isDefault(key, value) {
  // `paginate` is binary, default ON: only an explicit `paginate: false` is written, like `validate: off`.
  if (key === 'paginate') return paginateOn(value);
  // `glossary` is binary — off is the omitted default; only `glossary: auto` is written.
  if (key === 'glossary') return (value == null ? '' : String(value)).trim().toLowerCase() !== 'auto';
  // `lift` is binary — off is the omitted default; only `lift: on` is written.
  if (key === 'lift') return !TRUEY.test((value == null ? '' : String(value)).trim());
  // `validate` is binary, default ON — so on (any non-falsey) is the omitted
  // default; only an explicit `validate: off` is written into the block.
  if (key === 'validate') return !FALSEY.test(String(value).trim());
  // 'none' is the named backdrop baseline — the same no-class result as omitting
  // finish, so it's treated as the default and dropped from the block.
  if (key === 'finish') { const f = (value == null ? '' : String(value)).trim().toLowerCase(); return f === '' || f === 'none'; }
  // 'boardroom' is the named style (mode) baseline — dropped from the block.
  if (key === 'mode') { const s = (value == null ? '' : String(value)).trim().toLowerCase(); return s === '' || s === 'boardroom'; }
  // 'headings' is the default — same render as omitting split, so it's dropped
  // from the block; only the explicit 'rule' opt-out is written.
  if (key === 'split') { const s = (value == null ? '' : String(value)).trim().toLowerCase(); return s === '' || s === 'headings'; }
  // The look registers: the engine's own default reads as unset (the preset's is a choice).
  if (LOOK_KEYS.includes(key)) { const s = (value == null ? '' : String(value)).trim().toLowerCase(); return s === '' || s === frontMatterKey.PRESET_DEFAULTS[key]; }
  if (key === 'preset') { const s = (value == null ? '' : String(value)).trim().toLowerCase(); return s === '' || s === 'classic'; }
  if (key === 'venue') { const s = (value == null ? '' : String(value)).trim().toLowerCase(); return s === '' || s === 'laptop'; }
  return (value == null ? '' : String(value)) === FIELD_DEFAULTS[key];
}

// Coerce a control's value into the canonical front-matter string, or null when
// it's at its default (and should be omitted). `value` is a boolean for
// paginate, a string otherwise.
function normalize(key, value, preset) {
  if (key === 'paginate') return value === false || !paginateOn(value) ? 'false' : null;
  // engine reads on/true/yes — we always emit `on` (matches the example decks).
  // `glossary` writes the canonical `auto` when enabled; off omits the key. The switch
  // passes a boolean; a hand-typed `auto` is honored too.
  if (key === 'glossary') return value === true || (value != null && String(value).trim().toLowerCase() === 'auto') ? 'auto' : null;
  // `lift` writes the canonical `on` when enabled; off omits the key.
  // Under a preset that turns lift on, off is the override that gets written.
  if (key === 'lift') { const want = value === true || TRUEY.test(value || '') ? 'on' : 'off'; return want === lookBaseline(preset, 'lift') ? null : want; }
  // `validate` is default ON, so on omits the key; only an opt-OUT is written, as
  // the canonical `off`. The switch passes a boolean (checked = validation on).
  if (key === 'validate') return value === false || FALSEY.test(String(value).trim()) ? 'off' : null;
  const v = (value == null ? '' : String(value)).trim();
  // none = backdrop baseline → omit (same no-class render as no key at all).
  // Under a preset with a backdrop, `none` is the override that gets written.
  if (key === 'finish') { const f = v.toLowerCase(); return f === '' || f === lookBaseline(preset, 'finish') ? null : f; }
  // boardroom = style (mode) baseline → omit.
  if (key === 'mode') { const s = v.toLowerCase(); return s === '' || s === 'boardroom' ? null : s; }
  if (key === 'split') { return v.toLowerCase() === 'rule' ? 'rule' : null; }
  // A look register at the value the deck's preset already gives it is omitted; any other
  // value is the override, written — the same rule `finish` and `lift` follow above.
  if (LOOK_KEYS.includes(key)) { const s = v.toLowerCase(); return s === '' || s === lookBaseline(preset, key) ? null : s; }
  if (key === 'preset') { const s = v.toLowerCase(); return s === '' || s === 'classic' ? null : s; }
  if (key === 'venue') { const s = v.toLowerCase(); return s === '' || s === 'laptop' ? null : s; }
  if (v === '' || v === FIELD_DEFAULTS[key]) return null;
  return v;
}

// A scalar that needs quoting to round-trip through a flat YAML reader: a colon
// or hash (would start an inline mapping / comment) or edge whitespace. Booleans,
// sizes and keywords never trip this, so they stay bare like the example decks.
function quoteIfNeeded(value) {
  const v = String(value);
  if (!(/[:#]/.test(v) || /^\s|\s$/.test(v) || v === '')) return v;
  // The engine reads a quoted span RAW (`frontMatterScalar` unfolds no escape), so the value goes
  // in unescaped wherever a quote can hold it unchanged (#1958):
  //   - no `\` and no `"`: double quotes, as before;
  //   - a `\` or `"` and no `'`: single quotes, which neither the engine nor YAML reads escapes in;
  //   - a `'` too, but no `"` and no trailing `\`: double quotes, raw, which the engine reads back
  //     whole (a `\` only skips the character after it while it looks for the closing quote).
  // What is left (a `'` together with a `"` or a trailing `\`) has no form both readers take
  // unchanged, so it is escaped the YAML way, `\` and `"` both: the closing quote stays a quote,
  // and the engine shows the escapes raw. The old code escaped only `"`, so a trailing `\` still
  // swallowed the closing quote and ran the string into the next key.
  if (!/[\\"]/.test(v)) return `"${v}"`;
  if (!v.includes("'")) return `'${v}'`;
  if (!v.includes('"') && !v.endsWith('\\') && !v.includes('\\\\')) return `"${v}"`;
  return `"${v.replace(/[\\"]/g, '\\$&')}"`;
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
  // The deck's preset decides which value of a family key is the omitted baseline.
  const presetEntry = entries.find(([k, v]) => k === 'preset' && !v?.block);
  // When the change IS the preset, the deck's other keys are read against the NEW one. Read
  // against the old, an author's own `headline: left` under Editorial (whose baseline is left)
  // counted as "at the preset" and was deleted — and under Brand the deck then centered.
  const preset = key === 'preset' ? String(value ?? '').trim().toLowerCase() : presetEntry ? stripQuotes(presetEntry[1]) : '';
  for (const [k, raw] of entries) {
    if (k === 'marp') continue;
    if (raw?.block) {
      preserved.push([k, raw]); // a nested block (finish-override:, …) — never form-managed
    } else if (MANAGED.includes(k)) {
      const n = normalize(k, k === 'paginate' ? raw : stripQuotes(raw), preset);
      if (n != null) managed.set(k, n);
    } else {
      preserved.push([k, raw]);
    }
  }

  // Apply the incoming change (null = clear → at default). Every managed field is flat.
  const norm = normalize(key, value, preset);
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
