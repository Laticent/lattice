/**
 * lattice-engine — directive parsing.
 *
 * Reproduces the subset of Marpit's directive system Lattice actually uses,
 * at the source level: front-matter (global) directives, the `<!-- key: val -->`
 * comment form (global), and the `<!-- _key: val -->` spot form (this slide
 * only). Resolution follows Marpit's native "spot replaces global" semantics —
 * the deck-wide `class:` APPEND behavior Lattice wants is layered ON TOP by the
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
 *   - lattice.js — inlines its own directive reads.
 */

// The one front-matter VALUE rule, shared with `frontMatterValue` /
// `topLevelFrontMatterValue` so the engine's own parse and every `resolve-*`
// register clean a scalar identically. This file is bundled for the browser by
// tools/build-playground.js (esbuild), so a `lib/core` require resolves the same
// way `lib/engine/index.js`'s several already do.
const { frontMatterScalar, withoutBlockScalarBodies } = require('../core/front-matter-key');



// THE VOCABULARY IS DATA, NOT A LIST HERE. Which keys are directives, which may be written bare,
// which are deck-only, which the engine applies to each <section> and which of those skip the
// `--*` custom property are fields of the `meta` plugin's manifest
// (lib/plugins/meta/meta.manifest.json), frozen into lib/plugins/meta.generated.mjs and derived in
// lib/core/meta-keys.mjs. Each flag carries its reason in the manifest's `describe`. This file used
// to keep them by hand, beside four other copies (engineering/decisions/2026-10-17-meta-record.md §3);
// a directive added there is added to every reader at once.
//
// An unknown `<!-- foo: bar -->` comment is still left as a comment (and discarded at render),
// exactly as marp-core treats non-directive HTML comments under a recognized directive set.
const {
  KNOWN_KEYS: KNOWN_DIRECTIVES,
  FLAG_KEYS: FLAG_DIRECTIVES,
  GLOBAL_ONLY_KEYS: GLOBAL_ONLY,
  SLIDE_ONLY_KEYS: SLIDE_ONLY_DIRECTIVES,
  APPLIED_KEYS: APPLIED_DIRECTIVES,
  NO_CUSTOM_PROP_KEYS: NO_CUSTOM_PROP,
  kebab,
} = require('../core/meta-keys.js');

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
  // A `style: |` body is CSS, not directives: `    color: #333;` inside a rule would
  // otherwise set the deck-wide `color` on every section.
  for (const line of withoutBlockScalarBodies(m[1]).split(/\r?\n/)) {
    // `:(.*)` then trimStart, not `:\s*(.*)`: two adjacent runs that can both take whitespace are
    // an ambiguous pattern CodeQL flags as polynomial on uncontrolled input
    // (js/polynomial-redos), and the value is the same either way.
    //
    // The key is anchored at COLUMN 0, not read through `line.trim()`. A deck-wide directive is
    // always a top-level key; trimming first read a key nested under any block (`lenses:`,
    // `acronyms:`) as the directive of the same name, so `lenses:\n  footer: {…}` printed the lens
    // registry, approval digest included, in every slide's footer, and a nested key after a real
    // directive clobbered it (#2050). `topLevelFrontMatterValue` (lib/core/front-matter-key.js)
    // is the strict reader this matches.
    const kv = /^([A-Za-z_]\w*)[ \t]*:(.*)$/.exec(line.trimEnd());
    if (!kv) continue;
    directives[kv[1]] = stripQuotes(kv[2].trimStart());
  }
  return { directives, body: src.slice(m[0].length) };
}

// Value cleaning is NOT local to this file. `frontMatterScalar` (lib/core/front-matter-key.js)
// is the one rule shared with `frontMatterValue` / `topLevelFrontMatterValue`, which is how
// every `resolve-*` register reads the same block. The local `stripQuotes` this replaced kept
// a trailing YAML comment as part of the value — `theme: cuoio  # brand` resolved to a palette
// name no theme file matches, so the deck fell back to the default here while Export-to-Marp
// (real YAML) kept `cuoio`. Two readers, one question, opposite answers.
function stripQuotes(v) {
  return frontMatterScalar(v);
}

// THE COMMENT FORM IS NOT READ HERE. The engine reads a directive off each comment `html_block` token with the shared
// grammar (`readDirectiveComment`, lib/core/comment-directive.mjs, in `lattice_directives`, lib/engine/slides.js), and
// a reader that holds source rather than tokens reads the deck model's comment blocks as islands
// (lib/core/directive-island.mjs, through `scanMetaSource`, lib/core/meta-record.mjs). The string-level
// `parseCommentDirectives` that lived here matched `<!--…-->` anywhere, fences and prose included, had no production
// caller, and went in Segno P3 (engineering/decisions/2026-10-22-segno-deck-pipeline.md §P3 landed).

module.exports = {
  KNOWN_DIRECTIVES,
  GLOBAL_ONLY,
  SLIDE_ONLY_DIRECTIVES,
  NO_CUSTOM_PROP,
  APPLIED_DIRECTIVES,
  FLAG_DIRECTIVES,
  kebab,
  parseFrontMatter,
};
