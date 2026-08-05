/**
 * lib/core/resolve-color-mode.js
 *
 * The deck front-matter `color-mode:` register — the FIRST-CLASS way to author a
 * deck's color mode (see engineering/decisions/2026-07-11-color-mode-frontmatter.md).
 * Four values, one intent each; every render + authoring surface honors them:
 *
 *   color-mode: light      → `color-light`      PIN light  (document fidelity)
 *   color-mode: dark       → `dark`             PIN dark   (document fidelity)
 *   color-mode: system     → `color-system`     follow the receiver's OS (prefers-color-scheme)
 *   color-mode: inherited  → `color-inherited`  adopt the host container's mode (site/Studio
 *                                                toggle when embedded; the OS when standalone)
 *
 * The light value maps to `color-light` (NOT the bare `light`) on purpose: `section.<x>.light`
 * is a pre-existing LAYOUT component (the bright centered `divider.light` "subtopic" variant),
 * so stamping `light` deck-wide would silently re-layout every divider. `color-light` is a
 * collision-free color-scheme-only token (like `color-system`/`color-inherited`). `dark` has
 * no such component collision, so it reuses the existing `section.dark` (which also carries the
 * dark-canvas background treatment). The per-slide `_class: light` still uses the bare `light`.
 *
 * Like `mode:`/`finish:`, both render paths read this key and APPEND the mapped
 * class token to every `<section>`; the CSS lives in lib/base/base.modifiers.css
 * (`section.dark`/`section.light` already; `section.color-system` = `color-scheme:light dark`;
 * `section.color-inherited` = `color-scheme:inherit`, which the section takes from the deck
 * root each surface controls). Unset renders the theme's own default — no token.
 *
 * `color-mode:` SUPERSEDES the legacy `class: dark`/`class: light`/`class: print` color axis,
 * which stays a DEPRECATED alias for a deck that sets nothing else. Where a deck carries BOTH,
 * the key wins and the alias is DROPPED rather than merged — filtered where the register is read,
 * so it is never stamped (lib/core/deck-class-register.js). The linter flags the leftover. A per-slide
 * `<!-- _class: dark|light -->` is unchanged — it stays the per-slide override (front matter is
 * deck-wide by definition, so there is no per-slide `color-mode:`).
 *
 * Pure + dependency-free so it bundles into the browser runtime (esbuild) and is
 * unit-testable in isolation. Shared by lattice-emulator.js,
 * lib/integrations/markdown-it/plugins.js, and lib/runtime/index.js so all three
 * render paths produce identical class lists (HARD RULE #1).
 */

const { frontMatterValue, topLevelFrontMatterValue } = require('./front-matter-key');

// Register value → the class token appended to every section. '' = no token (unset renders the
// theme default; there is no register row for "unset" — an absent/unknown key maps to '').
const COLOR_MODE_REGISTER = Object.freeze({
  light: 'color-light',
  dark: 'dark',
  system: 'color-system',
  inherited: 'color-inherited',
  // PRINT is a fifth, medium-not-scheme value: it renders the whole deck in the
  // B&W-safe ink-on-white print band (section.print; base.modifiers.css), for
  // paper handouts. Mutually exclusive with the scheme values (a printed deck is
  // ink, not light/dark) — that exclusivity rides COLOR_MODE_TOKENS for free. It
  // maps to the bare `print` class (no component collision), and is the authoring
  // sibling of the engine `--print` export flag.
  print: 'print',
});

/** The recognized color-mode names (for the deck-lint vocabulary + docs + UI pickers). */
const COLOR_MODE_NAMES = Object.freeze(Object.keys(COLOR_MODE_REGISTER));

/**
 * Extract the raw `color-mode:` value from a deck source's front matter, or null.
 *
 * Routed through the SAME `frontMatterBody` + `topLevelFrontMatterValue` pair
 * everything else on this axis reads, rather than a fourth private regex. The
 * private one captured `["']?([A-Za-z0-9_-]+)["']?[ \t]*$`, so it returned null —
 * "no key" — on a value the shared reader returns verbatim
 * (`light  # migrated 2026-08`). Both then resolve to no color mode, so the split
 * never produced a wrong CANVAS; it produced two different answers to "did the
 * author write this key at all", which is the question the linter asks. One
 * reader, one answer (#1416).
 */
function readFrontMatterColorMode(md) {
  const fm = frontMatterBody(md);
  if (!fm) return null;
  return topLevelFrontMatterValue(fm, 'color-mode');
}

/**
 * Split a class value — a front-matter `class:` payload, a `<!-- _class: … -->`
 * payload, or a live `section.className` — into WHOLE TOKENS.
 *
 * One spelling, exported, because every question on this axis is whole-token
 * membership and the alternatives are not equivalent: `\bprint\b` also matches
 * inside `print-safe` (a `-` is a word boundary), which is how a class value the
 * propagation kernel rejects could still set the print band.
 */
function classTokens(value) {
  return String(value ?? '').split(/\s+/).filter(Boolean);
}

/**
 * THE deck's `color-mode:` class token — '' when the key is unset or its value
 * is not a register name. `fmBody` is the front-matter BODY (no `---` fences).
 *
 * ONE READER, and the reason is a shipped defect rather than tidiness. This
 * question had three spellings: an anchored `^…$` key/value regex in the
 * propagation kernel, an unanchored `([A-Za-z]+)\b` in `deckPrintBand` below,
 * and `frontMatterValue` in `deckDarkBand`. A trailing YAML comment separates
 * them —
 *
 *     color-mode: light  # migrated 2026-08
 *     class: print
 *
 * — because the unanchored read still sees a value while the anchored one does
 * not. That deck baked its diagrams for one band and painted the canvas for
 * another: the exact #1326 ink/chip shape, arriving through the fix for it.
 *
 * Routed through the shared linear-time reader so it costs what every other
 * front-matter read costs, and so "what is this key's value" has one answer
 * across the engine. A value with a trailing comment resolves to no color mode,
 * consistently, on every consumer — the deck linter flags it
 * (`unknown-color-mode`) rather than any reader guessing.
 *
 * TOP-LEVEL, because `--print` and the export boundary WRITE this key and both
 * write at column 0. A nested `color-mode:` read as the deck register let the
 * render path drop a `class:` token the exported bytes kept — see
 * `topLevelFrontMatterValue`.
 */
function deckColorModeToken(fmBody) {
  return colorModeClass(topLevelFrontMatterValue(fmBody, 'color-mode') || '');
}

/** True if `value` is a recognized color-mode register name. */
function isKnownColorMode(value) {
  return typeof value === 'string' && Object.hasOwn(COLOR_MODE_REGISTER, value.trim().toLowerCase());
}

/** Map a color-mode value to its class token ('' for unset/unknown). */
function colorModeClass(value) {
  if (typeof value !== 'string') return '';
  const key = value.trim().toLowerCase();
  return Object.hasOwn(COLOR_MODE_REGISTER, key) ? COLOR_MODE_REGISTER[key] : '';
}

/** Convenience: read the `color-mode:` value from a full deck source + map it. */
function colorModeClassFromSource(md) {
  return colorModeClass(readFrontMatterColorMode(md) || '');
}

/**
 * Is this render in the B&W PRINT band?
 *
 * THE single predicate for that question, and it must stay single. The emulator
 * BAKES a Mermaid diagram's label ink for the band it is rendering, while CSS
 * paints the chip underneath — two halves of one decision. They were briefly
 * derived from two different conditions (the texture guard from the CLI flag, the
 * bake from a wider test that also honors front-matter `class: print` /
 * `color-mode: print`), and a deck authoring those keys baked print ink with the
 * guard never firing: dark ink on a pinned dark chip at 1.28:1. Both halves now
 * call this.
 *
 * Lives in the shared kernel (HARD RULE #1) rather than in the emulator so it is
 * unit-testable as BEHAVIOR. Its previous home made the only available assertion a
 * source-text `assert.match` on the emulator file, which cannot fail for a semantic
 * error — renaming the stamped attribute or stubbing the predicate to `false` both
 * left the guard dead with the gate fully green.
 *
 * `--print` and `--image-mode print` need no term here: `withPrintColorMode`
 * (lattice-emulator.js) writes `color-mode: print` into the front matter before
 * this ever sees the source. `flagPrint` stays as a belt-and-braces term for a
 * caller that has the flag but not the merge — and it must be passed the flag that
 * DROVE the merge (`WANT_PRINT`, which `--image-mode print` also sets), not the
 * narrower `--print` boolean.
 */
/**
 * The deck's front-matter FENCE (`---` … `---`, delimiters included), or ''.
 *
 * ONE spelling of the extraction, exported so every predicate that must only
 * listen to front matter — deckPrintBand here, deckDarkBand in
 * lib/core/diagram-band.js — is scoped identically. Two halves of the band
 * decision reading DIFFERENT amounts of the deck is the #1326 failure mode in
 * miniature: a body line reading `class: dark` in prose would have set the band
 * for one half and not the other.
 *
 * Named `…Fence`, not `…Block`: lib/core/deck-front-matter.js already exports a
 * `frontMatterBlock` that returns an escaped HTML `<div>` for embedding. Two
 * same-named exports in lib/core, one raw markdown and one HTML, is an import
 * footgun waiting to happen.
 *
 * Anchored at the string start with no `m` flag on purpose: a `---` slide
 * separator mid-document is not front matter. Accepts a fence that has already
 * been sliced out (it re-matches itself), so a caller may pass either.
 *
 * Tolerates a leading BOM, and NOTHING ELSE beyond what the engine accepts.
 * A Windows-saved deck really does carry a BOM and `tools/export-marp.js` reads
 * the deck unnormalized, so BOM tolerance can only ever ADD agreement — by the
 * time source reaches the render path, ingest has stripped it
 * (`SANCTIONED_EOL_BOUNDARIES`), so there is no input where this and the engine
 * disagree because of it.
 *
 * A PADDED opening fence (`--- `) was briefly tolerated here too, and that was a
 * different thing wearing the same "belt-and-braces" label: nothing else in the
 * repo accepts it. `parseFrontMatter` (lib/engine/directives.js) is `^---\r?\n`,
 * and so are `boundary-parser.js`, `deck-class-register.js` and
 * `withPrintColorMode`. So `--- \ncolor-mode: print\n---` read as a print deck
 * HERE and as no front matter AT ALL to the engine — print ink baked onto a
 * canvas that never got the class. That is the #1326 ink/chip shape arriving
 * through the change that closes it, and on `main` the two agreed (both saw
 * nothing). Widening a reader past the renderer is not tolerance, it is a split.
 */
const FRONT_MATTER_FENCE = /^﻿?---\r?\n[\s\S]*?\r?\n---/;

function frontMatterFence(md) {
  const m = String(md ?? '').match(FRONT_MATTER_FENCE);
  return m ? m[0] : '';
}

/** The front-matter BODY — the YAML between the fences. '' when there is none. */
function frontMatterBody(md) {
  const fence = frontMatterFence(md);
  return fence ? fence.replace(/^﻿?---\r?\n/, '').replace(/\r?\n---$/, '') : '';
}

function deckPrintBand(md, flagPrint = false) {
  if (flagPrint) return true;
  const fm = frontMatterBody(md);
  if (!fm) return false;
  // `color-mode:` SUPERSEDES the legacy `class:` color axis — including `class:
  // print`. When the key is set it is the WHOLE answer: a deck that says
  // `color-mode: light` and still carries a leftover `class: print` renders a
  // light canvas, so it must not bake print ink onto it. Reading the key through
  // `deckColorModeToken` is what makes this predicate and the propagation kernel
  // answer from the same bytes; short-circuiting on a second, looser read of the
  // same key is what produced a print canvas with light-baked ink (#1416 R2).
  const token = deckColorModeToken(fm);
  if (token) return token === 'print';
  // No `color-mode:` — the legacy alias still resolves. WHOLE-token membership,
  // matching the propagation kernel: `\bprint\b` also matches inside `print-safe`.
  //
  // LOOSE, unlike the `color-mode:` read above, and the asymmetry is the engine's
  // rather than a preference. `parseFrontMatter` (lib/engine/directives.js) calls
  // `line.trim()` before matching its key/value, so it stamps a `class:` at ANY
  // indentation — including one nested under another key — onto every section. This
  // predicate must answer for the canvas the engine ACTUALLY PAINTS, so reading it
  // more strictly than the thing that stamps it is not caution, it is a split:
  // ` class: print` rendered a `section.print` canvas while this said "not print",
  // and the diagram baked LIGHT ink onto it. That is the #1326 ink/chip family, in
  // the narrowing direction, and it is why `class:` and `color-mode:` are read
  // differently here — `color-mode:` has no engine-side stamper, only Lattice
  // writers, and every one of those writes at column 0.
  return classTokens(frontMatterValue(fm, 'class')).includes('print');
}

/**
 * The source a `--print` / `--image-mode print` render actually renders: the deck
 * with `color-mode: print` written into its front matter.
 *
 * The engine's print flag has to become a deck-wide REGISTER at some point — the
 * print canvas reaches a slide the same way any deck-wide color mode does, through
 * the propagation kernel — and this is that point.
 *
 * IT WRITES THE FIRST-CLASS KEY, NOT THE LEGACY `class:` ALIAS, and that is a fix
 * rather than a rename. The flag used to merge `print` into `class:`, which
 * `color-mode:` supersedes — so on any deck that set `color-mode:` at all, the flag
 * silently produced a light or dark canvas while the diagram ink and
 * `manifest.json` both said print. Measured: print ink #1A1A1A on a dark chip
 * rgb(46,46,46), 1.28:1. A CLI flag is the strongest available statement of intent
 * ("this deck is going on paper"), so it writes the register that WINS.
 *
 * Lives here, not in the CLI that calls it, so it is testable as behavior and so
 * the permutation table can drive the flag axis the same way the CLI does.
 *
 * An existing `color-mode:` line is replaced IN PLACE and any duplicate dropped:
 * two of them would leave Lattice reading the first and js-yaml the last.
 */
function withPrintColorMode(source) {
  const src = String(source ?? '');
  // A LEADING BOM does not stop this being front matter. Every other ingest in
  // the engine folds it at the door (`lib/engine/index.js`); a writer that does
  // not would silently prepend a SECOND front-matter block to a Windows-saved
  // deck. The trailing newline after the closing `---` is optional for the same
  // reason: a file that ends at the fence still has front matter.
  const fm = src.match(/^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/);
  if (!fm) return `---\ncolor-mode: print\n---\n\n${src}`; // no front matter → add one
  const [full, open, body, close] = fm;
  // COLUMN 0 only. An INDENTED `color-mode:` is not the deck's register — it is a
  // key nested under another one, or a line inside a block scalar (`style: |`) —
  // and rewriting it corrupts the deck while leaving the real key untouched (or,
  // worse, dropped as a "duplicate"). The register is a top-level YAML key; match
  // exactly that.
  let seen = false;
  const lines = body.split('\n').flatMap((line) => {
    if (!/^color-mode:/.test(line)) return [line];
    if (seen) return []; // duplicate register — collapsed into the first
    seen = true;
    return [line.replace(/^color-mode:[^\r\n]*(\r?)$/, 'color-mode: print$1')];
  });
  const merged = seen ? lines.join('\n') : `${body}\ncolor-mode: print`;
  // SLICE, NOT `String.replace`. With a string pattern, `replace` still expands
  // `$&`, `` $` ``, `$'` and `$n` in the REPLACEMENT — so a front matter carrying
  // a price in a `footer:` (`footer: "cost $& up"`) had its own front matter
  // spliced into that value, `` $` `` silently deleted the text before it, and
  // `$'` injected the entire deck body into the string. Total, silent corruption
  // on the print path. Its sibling writer (`withSanitizedDeckClass`) reassembles
  // with `slice` and was immune; this one now does the same.
  return src.slice(0, fm.index) + open + merged + close + src.slice(fm.index + full.length);
}

module.exports = {
  COLOR_MODE_REGISTER,
  COLOR_MODE_NAMES,
  readFrontMatterColorMode,
  isKnownColorMode,
  colorModeClass,
  colorModeClassFromSource,
  classTokens,
  deckColorModeToken,
  withPrintColorMode,
  frontMatterFence,
  frontMatterBody,
  deckPrintBand,
};
