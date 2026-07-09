/**
 * lattice-engine — directive parsing.
 *
 * Reproduces the subset of Marpit's directive system Lattice actually uses,
 * at the source level: front-matter (global) directives, the `<!-- key: val -->`
 * comment form (global), and the `<!-- _key: val -->` spot form (this slide
 * only). Resolution follows Marpit's native "spot replaces global" semantics —
 * the deck-wide `class:` APPEND behaviour Lattice wants is layered ON TOP by the
 * existing `deckClassPropagate` plugin (lib/integrations/markdown-it/plugins.js), which
 * the engine composes unchanged. We deliberately match marp-core's historical
 * directive semantics here so that plugin keeps doing exactly what it always
 * did, now on the owned engine.
 *
 * Marp reference: @marp-team/marpit lib/markdown/directives/*. The applied
 * attribute set (class / data-<kebab> / style --<kebab> / pagination / bg) is
 * mirrored from directives/apply.js — see applyDirectives() below.
 *
 * Sibling implementations this must stay in parity with:
 *   - lib/playground/index.js (browser) — same.
 *   - lattice-emulator.js — inlines its own directive reads.
 */



// Directives Lattice decks actually use, plus the structural ones Marpit owns.
// Anything here becomes a `data-<kebab>` attribute + a `--<kebab>` custom prop
// on the section, matching marp-core. The list is intentionally explicit rather
// than open-ended: an unknown `<!-- foo: bar -->` comment is left as a comment
// (and discarded at render), exactly as marp-core treats non-directive HTML
// comments under a recognised directive set.
const KNOWN_DIRECTIVES = new Set([
  'theme', 'paginate', 'header', 'footer', 'class', 'backgroundColor',
  'backgroundImage', 'backgroundPosition', 'backgroundRepeat', 'backgroundSize',
  'color', 'size', 'style', 'lang', 'marp', 'logo',
  // Focus & highlighting (engineering/decisions/2026-06-16-focus-highlighting.md).
  // `_focus` names an ordinal target ("row 4", "item 3", "col 5", "line 3-4");
  // `_focusStyle` overrides the content-aware default (spotlight|ring|list-fill);
  // `_focusSteps` is a pipe-separated walk that expands one slide into N.
  'focus', 'focusStyle', 'focusSteps',
  // Narrative build (engineering/decisions/2026-06-16-narrative-step-spec.md).
  // `_build` opts a slide into progressive disclosure — value is a subset of the
  // `_focus` grammar (axis + grouping): `_build`, `_build: rows`, `_build: 1, 2-3`,
  // `_build: none`. The build resolver reads `data-build` off the section.
  'build',
  // Debug bounding boxes (engineering/decisions/2026-07-01-debug-bounding-boxes.md).
  // `debug` (front matter, deck-wide) or `_debug` (this slide) turns on the layout
  // debug overlay in the PREVIEWERS only — it stamps `data-debug` on the section,
  // which the export pipeline strips so exported bytes are unchanged. Value is a
  // profile keyword (`on`/`off`/`all`) or a space/comma list of facet levers
  // (`identity size layout class box`). Bare `<!-- _debug -->` ≡ the default profile.
  'debug',
]);

// Flag directives — may be written bare, with NO `: value` (e.g. `<!-- _build -->`
// ≡ an empty value). Every other directive still REQUIRES a colon, so a prose
// comment that happens to be a bare known-directive word (`<!-- color -->`,
// `<!-- header -->`) is left untouched as a comment, not silently consumed.
const FLAG_DIRECTIVES = new Set(['build', 'debug']);

// Directives that are global-only when written WITHOUT the `_` spot prefix in
// front matter (theme/size/style are deck-level by nature). Everything else can
// be either global (applies from here on) or spot (`_` prefix → this slide).
const GLOBAL_ONLY = new Set(['theme', 'marp', 'size', 'lang']);

// Directives applied to each <section> as `data-<kebab>` + `--<kebab>` (and,
// for some, special handling). Mirrors marp-core: the deck-level globals
// `style` / `size` / `marp` / `logo` are consumed by the engine (or, for logo,
// the HTML-stage deck-logo plugin) and never become section attributes.
const APPLIED_DIRECTIVES = new Set([
  'theme', 'paginate', 'header', 'footer', 'class', 'color',
  'backgroundColor', 'backgroundImage', 'backgroundPosition',
  'backgroundRepeat', 'backgroundSize', 'lang',
  // Focus emits `data-focus` / `data-focus-style` on the section; the focus
  // resolver transformer reads them. `focusSteps` is consumed earlier (slide
  // expansion) and is intentionally NOT applied as a section attribute.
  'focus', 'focusStyle',
  // `build` emits `data-build` on the section; the build resolver reads it and
  // stamps `data-build-step` per unit + `data-build-steps` on the section.
  'build',
  // `debug` emits `data-debug` on the section; the preview debug-overlay agent
  // reads it. Deliberately NOT in GLOBAL_ONLY, so `_debug` can scope one slide.
  // No `--debug` custom prop is emitted (nothing reads it) — see slides.js.
  'debug',
]);

const kebab = (s) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/**
 * Parse a YAML-ish front-matter block (the leading `---\n…\n---`). Marp's
 * front matter is a flat key: value map; we parse that shape directly rather
 * than pull in a YAML dependency. Returns { directives, body } where body is
 * the markdown with the front matter stripped.
 */
function parseFrontMatter(src) {
  const directives = {};
  // CRLF-tolerant: a Windows-authored deck's `---\r\n…\r\n---` must strip too,
  // or the front matter leaks into the body (and a `split: headings` deck would
  // then divide on the leaked heading — a cross-path slide-count divergence).
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return { directives, body: src };
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w]*)\s*:\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    directives[kv[1]] = stripQuotes(kv[2]);
  }
  return { directives, body: src.slice(m[0].length) };
}

function stripQuotes(v) {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Extract `<!-- key: value -->` / `<!-- _key: value -->` comment directives
 * from a single slide's source. Returns the directive map (spot keys keep their
 * `_` so the resolver can tell them apart) plus the body with directive
 * comments removed. Non-directive comments are left intact for markdown-it.
 */
function parseCommentDirectives(slideSrc) {
  const local = {};
  const global = {};
  const body = slideSrc.replace(/<!--([\s\S]*?)-->/g, (full, inner) => {
    const trimmed = inner.trim();
    // Value is optional so a flag-style directive can be written bare —
    // `<!-- _build -->` (≡ `_build:` with an empty value). Only an exact
    // `_?<knownDirective>` with nothing trailing matches, so prose comments are
    // unaffected. Mirrors how `_build` defaults to the primary collection.
    const kv = /^(_?)([A-Za-z][\w]*)\s*(?::\s*([\s\S]*))?$/.exec(trimmed);
    if (!kv) return full; // not a directive — keep the comment
    const [, spot, key, value] = kv;
    if (!KNOWN_DIRECTIVES.has(key)) return full;
    // A bare word (no colon) is a directive ONLY for flag directives; otherwise
    // it's prose — leave the comment as-is.
    if (value === undefined && !FLAG_DIRECTIVES.has(key)) return full;
    (spot ? local : global)[key] = stripQuotes(value ?? '');
    return '';
  });
  return { local, global, body };
}

module.exports = {
  KNOWN_DIRECTIVES,
  GLOBAL_ONLY,
  APPLIED_DIRECTIVES,
  FLAG_DIRECTIVES,
  kebab,
  parseFrontMatter,
  parseCommentDirectives,
};
