/**
 * Pure, dependency-free lint core — the SINGLE SOURCE of the deck-authoring
 * footgun checks, shared by:
 *   - the Node linter (lib/authoring/lint.js → tools/lint-deck.js, the CLI),
 *   - lib/components/index.js's validate() (which re-exports the constants +
 *     detectors from here), and
 *   - the browser (the Drawing Board's Architect panel).
 *
 * It has NO `fs` and NO `require` of lib/components, so it bundles cleanly for
 * the browser. The name/modifier VOCABULARY (which component names + modifier
 * tokens exist) is data, not logic, so it is injected: the Node linter builds it
 * from the live manifests; the browser passes a vocab precomputed at
 * docs-build time. `lintTextWith(source, vocab)` is the shared engine both call.
 */

const { splitTopLevel, separatorLines } = require('./slide-split');
// Pure + fs-free, like this module (HARD RULE #7) — the register's vocabulary is
// read from its owner rather than re-typed here, so a new level cannot become a
// lint false positive.
const { OVERFLOW_MARKER_LEVELS } = require('../core/resolve-overflow-marker');
const { EXPORT_SETTINGS_TYPE } = require('../core/export-settings');
// THE deck-wide `class:` register's own refusal rule — the same call the engine's
// propagation kernel makes, so a warning and a render can never disagree about
// which token was dropped. Pure and fs-free (HARD RULE #7): it reads the generated
// stage catalog, which is data, and the shared front-matter reader.
const { deckClassRefusalsFromFrontMatter } = require('../core/deck-class-register');
// MODE TOKENS are a THIRD `_class:` vocabulary, beside components and modifiers, and the
// linter has to know all three or it flags a working directive. `_class: boardroom` opts
// one slide out of a `mode: sketch` deck and `_class: sketch` opts one in on a plain deck
// — the engine reads exactly this (`resolveDiagramLook` / `resolveDiagramHandType`,
// lib/core/diagram-look.js, rule 2). No deck had used one as a directive until the #1674
// demo, so the gap sat unnoticed: they were only ever mentioned in prose.
//
// MODE_TOKENS, NOT MODE_NAMES. `resolve-mode.js` keeps "TWO VOCABULARIES … apart on
// purpose": MODE_NAMES is what a front-matter `mode:` accepts (`sketch-clean`), while
// MODE_TOKENS is what lands in a class list (`sketch-clean-body`). Using the former here
// blessed `_class: sketch-clean` — a dead directive no CSS rule matches — and still
// rejected `_class: sketch-clean-body`, the real token `mode: sketch-clean` stamps. The
// first cut of this fix did exactly that; the adversarial trio's checker caught it.
const { MODE_TOKENS } = require('../core/resolve-mode');
const { topLevelFrontMatterValue, frontMatterScalar } = require('../core/front-matter-key');

// THE class-directive reader — shared with the editor's autocomplete, and it reads
// BOTH forms (the spot `<!-- _class: … -->` and the running global `<!-- class: … -->`)
// off whole-line comments only. The regex this replaces saw the spot form alone, so
// on a deck using the global form every slide from the directive onward was linted
// against a class it does not have — and, the real directive being invisible, whatever
// `_class:` the PROSE happened to quote took its place. See
// lib/core/class-directive-scan.mjs.
const { slideClassDirectives } = require('../core/class-directive-scan.mjs');

// WHICH optional editorial blocks a layout actually renders (#1651). Pure and
// fs-free like this module (HARD RULE #7). Read from its owner so a lint warning
// and a render can never disagree about whether a blockquote becomes a callout.
const { supportsBlock } = require('../core/authoring-blocks');

// Focus & highlighting directives (engineering/decisions/2026-06-16-focus-
// highlighting.md). Linted for grammar — a known axis and a well-formed ordinal
// target — so a typo (`rows 4`, `line abc`, `_focusStyle: glow`) is caught
// before render rather than silently no-op'ing.
const FOCUS_DIRECTIVE = /<!--\s*_focus:\s*([^>]+?)\s*-->/;
const FOCUS_STYLE_DIRECTIVE = /<!--\s*_focusStyle:\s*([^>]+?)\s*-->/;
const FOCUS_STEPS_DIRECTIVE = /<!--\s*_focusSteps:\s*([^>]+?)\s*-->/;
const FOCUS_AXES = new Set(['item', 'row', 'col', 'cell', 'line']);
const FOCUS_STYLES = new Set(['spotlight', 'ring', 'list-fill', 'blur', 'pop']);

// Returns an error string if `spec` (one `_focus` target list) is malformed,
// else null. `cell R,C` pairs are pulled out first (comma is the general target
// separator), then each remaining `<axis> <ordinal>` is checked.
function focusSpecError(spec) {
  if (!spec?.trim()) return 'empty target';
  const rest = spec.replace(/\bcell\s+\d+\s*,\s*\d+/gi, '');
  if (/\bcell\b/i.test(rest)) return 'cell needs "R,C" (e.g. cell 4,5)';
  for (const part of rest.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = /^([a-z]+)\s+(.+)$/i.exec(part);
    if (!m) return `'${part}' is not "<axis> <ordinal>"`;
    const axis = m[1].toLowerCase();
    if (!FOCUS_AXES.has(axis)) return `'${axis}' is not a focus axis (item, row, col, cell, line)`;
    if (!/^\d+(-\d+)?( +\d+(-\d+)?)*$/.test(m[2].trim())) return `'${m[2].trim()}' is not an ordinal or range`;
  }
  return null;
}

// Modifier token families recognized by prefix — the decoration / position /
// state vocabularies whose fragments (`at-tl`, `tint-corner`, `mark-orbit`,
// `with-period`, `no-footer`, `tone-pass`, `treatment-none`, `checks-tonal`,
// `finish` / `finish-atrium` / `finish-none`) are too many to enumerate and not
// author-misspellable in a way worth flagging. (The deck-wide `finish:` register
// that maps these classes is linted separately via finishNames.) `backdrop` is
// retained as a recognized prefix for the back-compat `backdrop-none` opt-out.
const MODIFIER_PREFIXES = ['tint-', 'mark-', 'with-', 'at-', 'no-', 'tone-', 'treatment-', 'checks-', 'fill-', 'finish', 'backdrop'];

// Deprecated `image` modifiers retained as back-compat aliases of the adaptive
// compositions (full→spotlight, contain/museum→gallery — see
// lib/core/image-aspect.js LEGACY_ALIASES). They still render, so a deck using
// them stays valid (and lint-clean) even though they're no longer featured
// `variants`. See engineering/decisions/2026-06-19-adaptive-image.md.
const DEPRECATED_CLASSES = Object.freeze(new Set(['full', 'contain', 'museum']));

/**
 * Card-style layouts where the li is a card with a bold title slot (font-weight
 * from the parent li) + optional body slot. For these, inline `- **Title.** body`
 * makes the body inherit the title's bold — the canonical shape is nested:
 *   - Title
 *     - body
 */
const CARD_STYLE_LAYOUTS = Object.freeze([
  'cards-grid', 'cards-stack',
  'compare-prose',
  'matrix-2x2', 'verdict-grid', 'decision', 'citation-card',
  'pricing', 'q-and-a',
  'cycle',
  'policy-recommendation',
]);

/**
 * Layouts whose ordered-list items render as counter | statement grid rows. A
 * `<strong>` span inside the statement splits the row, so these require PLAIN
 * ordered-list statements (the layout already sets display weight).
 */
const STATEMENT_OL_LAYOUTS = Object.freeze(['principles']);

/**
 * Ledger / numbered layouts whose body slot is authored as an ORDERED list
 * (`ol > li`) — the leading column is an auto counter and the canonical shape is
 *   1. Name
 *      - body
 * For these, the `- **Title.** body` UNORDERED inline-bold shape (what the coach
 * tends to emit) is doubly wrong: wrong list type AND the body inherits the
 * title bold. The fix is the numbered shape, not nested bullets. Derived from
 * each manifest's `ol > li` body-slot selector; kpi/stats also carry the
 * NUMBER_SLOT bodyless rule, q-and-a is excluded (it accepts ol OR ul).
 */
const LEDGER_OL_LAYOUTS = Object.freeze([
  'agenda', 'authority-chain', 'kpi', 'list-criteria', 'list-steps',
  'list-tabular', 'regulatory-update', 'stats', 'state-chart', 'timeline-list',
]);

/**
 * Panel-split layouts whose right-panel items are "title + nested body" slots.
 * slotLabelLift only bolds the title when a nested body delimits it, so a
 * bodyless item renders as flat text. Contract is the nested shape.
 * (split-panel right-panel items follow the nested-body contract.)
 */
const SPLIT_SLOT_LAYOUTS = Object.freeze([
  'split-panel', 'split-compare',
]);

/**
 * Number-slot layouts whose items are "big number + nested label". Same
 * nested-body requirement as SPLIT_SLOT_LAYOUTS (reuses findSplitBodylessItem —
 * the detector is shape-generic).
 */
const NUMBER_SLOT_LAYOUTS = Object.freeze(['kpi', 'stats']);

// Orientation-lock lint RETIRED 2026-06-25. The retire-landscape-locks program gave every
// layout a portrait form (compare-table → card-per-row, compare-code → cover-code, redline →
// collapse+block-split, kanban → lane-per-slide), so no layout declares
// orientation:["landscape"] and the orientation-mismatch deck warning had nothing left to
// guard. Per the Fit Spine's earn-its-keep axiom (delete dormant mechanisms, don't park
// them), the LANDSCAPE_ONLY_LAYOUTS / PORTRAIT_ONLY_LAYOUTS / AUTOSPLIT_ADAPTS lists, their
// lint rule, and the sync test are removed. The manifest `orientation` contract is still
// validated at build time by checkAdaptDeclarations (tools/check-ownership.js), so a future
// lock can't land unnoticed. See engineering/decisions/2026-06-25-retire-landscape-locks-portrait-everything.md.
// THE size registry, read from its owner. This module is pure and browser-safe
// (HARD RULE #7) and lib/engine/sizes.js is too, so the linter now derives the
// deck's canvas from the SAME table the renderer resolves against — no injection,
// no fallback, no drift.
//
// It used to hold a hand-copied name→family table here, because the registry
// lived in a CSS comment that an fs-free module could not read, and its own note
// called that copy "a LAST RESORT, not the source of truth" (the #1218 drift
// class). Moving the registry into a module deleted the copy rather than
// documenting it. See engineering/decisions/2026-08-16-size-registry-ownership.md.
const { sizeFor } = require('../engine/sizes');

/**
 * The `size:` FRONT-MATTER directive's raw value, or undefined.
 *
 * Scoped to the leading `---` block, exactly as the emulator scopes its own
 * extraction (lattice-emulator.js: "so a `size:` in prose / a code block can't
 * trip it"). A whole-source scan reads a YAML sample inside a fenced block as
 * the deck's size — and since this now drives per-family CAPACITY budgets, not
 * just one autosplit warning, that would retune every threshold in the deck off
 * a code listing.
 */
function deckSizeName(source) {
  const fm = source.match(/^---\r?\n[\s\S]*?\r?\n---/)?.[0];
  if (!fm) return undefined;
  return fm.match(/^\s*size:\s*["']?([\w:/.-]+)/m)?.[1];
}

/**
 * The adaptive family a deck renders into ('wide'|'square'|'tall'|'strip').
 * Derived from the deck's resolved geometry — the same registry the renderer
 * resolves against, classified by the same boundaries the engine and runtime
 * stamp with (lib/adaptive/families.js). An unregistered `size:` resolves to the
 * hd default, hence 'wide'; `lint:deck` reports the unknown name separately.
 */
function deckFamily(source) {
  const name = deckSizeName(source);
  if (!name) return 'wide';
  const { width, height } = sizeFor(name);
  const w = parseFloat(width);
  const h = parseFloat(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || h <= 0) return 'wide';
  const a = w / h;
  // Mirrors FAMILIES in lib/adaptive/families.js (min exclusive, max inclusive).
  if (a > 1.05) return 'wide';
  if (a > 0.9) return 'square';
  if (a > 0.5) return 'tall';
  return 'strip';
}

/**
 * `autosplit:` is a RETIRED directive (2026-07-29). Splitting is intrinsic: a deck is
 * authored once and presented at many sizes, so its page count is a function of the
 * content and the box, never an authoring switch. See
 * engineering/decisions/2026-07-29-autosplit-is-not-a-toggle.md.
 *
 * A retired directive is flagged rather than ignored, because silence reads as "this
 * still works": a deck carrying `autosplit: off` would otherwise look like it had
 * opted out while the engine paginated it anyway. `off` is therefore the ERROR case —
 * it asks for something the engine no longer offers — and `on` is a `suggestion`,
 * since it asks for what already happens and the only cost is a stale line.
 *
 * BOTH messages are family-aware, because the claim "this deck paginates anyway" is only
 * true where the SPLIT move runs. At `wide` it does not (lattice-emulator.js
 * `AUTOSPLIT_APPLIES`), so telling a landscape author their `autosplit: off` is overridden
 * asserts the opposite of what the engine will do — the lie-to-the-author defect this rule
 * exists to prevent, in the rule itself. Caught by the adversarial checker on #1234.
 */
const AUTOSPLIT_DIRECTIVE = /^\s*autosplit:\s*(\S+)\s*$/im;

function findRetiredAutosplitDirective(source) {
  // `\r?\n` on both sides: a CRLF deck has front matter like any other, and a reader that
  // silently sees none reports "no directive here" for a deck that carries one.
  const fmMatch = String(source || '').match(/^---\r?\n[\s\S]*?\r?\n---/);
  if (!fmMatch) return [];
  const hit = fmMatch[0].match(AUTOSPLIT_DIRECTIVE);
  if (!hit) return [];
  const off = /^(off|false|no)$/i.test(hit[1]);
  const paginates = deckFamily(source) !== 'wide';
  return [{
    slide: 1,
    rule: 'autosplit-retired',
    severity: off ? 'error' : 'suggestion',
    classToken: 'autosplit',
    line: hit[0].trim(),
    message: off
      ? (paginates
        ? 'autosplit: off is retired — splitting is intrinsic at this @size, so this deck WILL paginate a slide that does not fit, despite this line.'
        : 'autosplit: off is retired — the line does nothing. (At a landscape @size nothing would have paginated anyway: the split move does not run there.)')
      : 'autosplit: is retired — splitting is intrinsic, so this line no longer does anything.',
    fix: off
      ? 'Remove the line. To keep ONE slide whole on purpose, mark that slide `<!-- stress-slide -->` — it is a specimen, not a deck-wide setting. Measurement rigs use the emulator\'s --no-split flag.'
      : 'Remove the line — a slide that does not fit is divided without asking at every presentation @size (square · portrait · story · mobile). A landscape @size never paginates.',
  }];
}

/**
 * `paginate: skip` / `paginate: hold` are Marp values Lattice does NOT implement, and it
 * downgrades them to `false` in silence.
 *
 * The engine's model is that every slide HAS a page number — the counter advances on every
 * section — and only whether the number is DISPLAYED is per-slide (`lib/engine/slides.js`:
 * a hidden slide is still counted, so the next visible one reads its true position, which a
 * parity sweep once caught rendering as "1" instead of "2"). Marp's two extra values break
 * that model deliberately: `skip` removes the slide from the count entirely, and `hold`
 * shows a number without advancing it. Lattice implements neither — `truthy()` rejects all
 * three of `false`/`skip`/`hold` identically, so each just hides the badge while the slide
 * keeps its place in the numbering.
 *
 * For `false` that IS the intent. For `skip` and `hold` the author asked for a renumbering
 * they will not get, and the deck still renders — so nothing tells them. Hence a rule: this
 * is the "silence reads as it works" case the retired-autosplit rule above exists for.
 *
 * `suggestion`, not `error`: the rendered result is a legitimate one (the badge is hidden,
 * which is most of what either value implies), so the deck is not broken — it just does not
 * renumber. Both spot (`_paginate`) and global forms are flagged, in front matter and in
 * directive comments, since the engine treats them the same way — but ONLY in those two
 * places: prose that merely mentions the value, and any form of code block, are left alone.
 */
// ANCHORED to the two places a directive can actually live: a `<!-- … -->` comment, or a
// front-matter line. The first cut used a bare `^` alternation under /m, which matches ANY
// line start — so a slide whose PROSE says "paginate: skip is not supported" tripped its own
// rule, as did an indented code block. Verified by an inversion review; the anchor is what
// makes the "only fires on real directives" claim true rather than aspirational.
const PAGINATE_UNSUPPORTED_COMMENT_RE = /<!--[ \t]*(_?paginate)[ \t]*:[ \t]*(skip|hold)\b/i;
const PAGINATE_UNSUPPORTED_FM_RE = /^[ \t]*(paginate)[ \t]*:[ \t]*(skip|hold)\b/im;

// Blank every form of code the engine renders literally, so a sample in the docs — including
// THIS rule's own documentation — is never read as a directive. Backtick fences were the only
// form the first cut stripped; tilde fences and indented blocks both slipped through.
function withoutCodeBlocks(text) {
  return String(text)
    .replace(/^[ \t]*```[\s\S]*?^[ \t]*```/gm, '')   // ``` fence
    .replace(/^[ \t]*~~~[\s\S]*?^[ \t]*~~~/gm, '')   // ~~~ fence
    .replace(/^(?: {4}|\t)[^\n]*$/gm, '')             // indented code block
    .replace(/`[^`\n]*`/g, ' ');                      // inline code span
}

function findUnsupportedPaginateValues(source) {
  const text = String(source || '');
  const out = [];
  const seen = new Set();
  // Slide numbering follows this file's convention — `splitTopLevel` chunks with the two
  // front-matter chunks discounted (`idx - fm + 1`) — rather than counting `---` by hand,
  // which mis-reported by two because front matter's own fences are separators too.
  const fm = fmChunks(text);
  // Front matter is chunk 1, and only there does a BARE `paginate:` line count as a directive
  // — everywhere else it is prose until it sits in a comment.
  splitTopLevel(text).forEach((chunk, idx) => {
    const body = withoutCodeBlocks(chunk);
    const m = body.match(PAGINATE_UNSUPPORTED_COMMENT_RE)
      || (idx < fm ? body.match(PAGINATE_UNSUPPORTED_FM_RE) : null);
    if (!m) return;
    const [, key, valueRaw] = m;
    const value = valueRaw.toLowerCase();
    // One finding per distinct directive+value: a deck that marks ten slides `skip` has one
    // thing to learn, not ten.
    const dedupeKey = `${key}:${value}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    // A front-matter hit is deck-level, so it reports against slide 1 (matching the retired
    // `autosplit:` rule) rather than a non-positive index.
    const slide = Math.max(1, idx - fm + 1);
    out.push({
      slide,
      rule: 'paginate-unsupported-value',
      severity: 'suggestion',
      classToken: 'paginate',
      line: m[0].replace(/^<!--/, '').trim(),
      message: value === 'skip'
        ? `paginate: skip is not implemented — it hides the number but the slide is STILL counted, so later slides keep their positions (Marp's skip would drop it from the count).`
        : `paginate: hold is not implemented — it hides the number instead of showing one without advancing it (Marp's hold would repeat the previous number).`,
      fix: `Use \`${key}: false\` if hiding the badge is what you want — that is exactly what this line already does. Lattice numbers every slide and treats visibility as the only per-slide choice, so there is no way to renumber a deck around a slide.`,
    });
  });
  return out;
}

// An HTML comment opened and never closed. The parser runs it to EOF, so everything after
// it disappears from the rendered deck — but the more dangerous consequence is on EXPORT:
// the note extractor's comment matcher requires a terminator, so an unterminated comment
// yields NO note body, `--strip-notes` finds nothing to remove, and the text ships verbatim
// in the shared file's embedded source. An author who typed `<!--` and meant to hide
// something gets the opposite of what they asked for, silently.
//
// Deliberately a LINT finding rather than a scrub: making the strip match to EOF would
// delete the rest of the deck from the author's own source, which is worse than the leak
// it fixes. The author has to see it and close the comment.
const UNTERMINATED_COMMENT_RE = /<!--(?![\s\S]*?--!?>)/;

// Neutralize comment MARKERS inside code regions, instead of deleting the lines they sit on.
//
// `withoutCodeBlocks` also strips every line indented four spaces or more, as an indented
// code block. That is right for the rules it was written for and WRONG here: a hanging-indent
// speaker note —
//
//     <!-- Talk track:
//          open with the number, then the ask.
//          Keep it under two minutes. -->
//
// — loses the line carrying its terminator, so a perfectly well-formed comment reads as
// unterminated and the author gets an ERROR telling them their notes will ship when they
// asked to strip them. A false alarm about a privacy failure is the worst kind: the rational
// response is to stop trusting the strip.
//
// Fenced blocks and inline spans still have their markers removed, since showing sample
// markup is exactly what they are for. Indented code is deliberately left alone: an indented
// block containing an UNCLOSED `<!--` would still be flagged, which is a far rarer shape than
// an indented comment and is resolved by fencing it — a false negative here would cost a
// silent leak, so the trade is made in the direction of the cheaper miss.
function withoutCodeCommentMarkers(text) {
  // BLANKED TO SPACES, not deleted. Deleting a multi-character marker in one pass can
  // RECONSTITUTE it from the text either side — `<!<!----` loses the inner `<!--` and the
  // remaining halves close up into a fresh `<!--` — so a code fence could still hand this
  // rule a marker it thought it had removed, and the author would get a false "your notes
  // will ship" error. Spaces cannot combine into a marker, so one pass is sufficient, and
  // keeping the length preserves the offsets the finding's line extraction relies on.
  const blank = (m) => m.replace(/<!--|--!?>/g, (s) => ' '.repeat(s.length));
  return String(text)
    .replace(/^[ \t]*```[\s\S]*?^[ \t]*```/gm, blank)
    .replace(/^[ \t]*~~~[\s\S]*?^[ \t]*~~~/gm, blank)
    .replace(/`[^`\n]*`/g, blank);
}

/**
 * Find an HTML comment that is never closed.
 * @param {string} source raw deck source
 * @returns {object[]} findings
 */
function findUnterminatedComment(source) {
  const findings = [];
  const text = String(source == null ? '' : source);
  // `splitTopLevel` emits the front matter as its own leading chunks, so a raw `idx + 1`
  // reports every slide number two too high on any deck with front matter — i.e. every
  // Lattice deck. An author told "slide 4 leaks your notes" about a clean slide 4 will not
  // find it. Same `idx - fm + 1` convention every other rule in this file uses.
  const fm = fmChunks(text);
  splitTopLevel(text).forEach((chunk, idx) => {
    // Code regions legitimately contain `<!--` as sample text — but see the helper: their
    // markers are neutralized rather than their LINES deleted, because deleting indented
    // lines eats the terminator of an ordinary hanging-indent comment.
    const body = withoutCodeCommentMarkers(chunk);
    const m = body.match(UNTERMINATED_COMMENT_RE);
    if (!m) return;
    const line = (body.slice(m.index).split('\n')[0] || '<!--').trim();
    findings.push({
      slide: Math.max(1, idx - fm + 1),
      rule: 'unterminated-comment',
      severity: 'error',
      classToken: 'comment',
      line: line.slice(0, 80),
      message:
        'This HTML comment is never closed, so everything after it is swallowed — and on export it is WORSE than invisible: `--strip-notes` cannot find an unterminated comment, so the text ships in the shared file\'s embedded source even when you asked for notes to be stripped.',
      fix: 'Close the comment with `-->`.',
    });
  });
  return findings;
}

/**
 * Detect the inline `- **Title.** body` authoring pattern. Returns the first
 * offending line, or null. Body text after a strong on the same bullet.
 */
function findInlineTitleBodyLine(sample) {
  if (!sample) return null;
  for (const line of sample.split('\n')) {
    // Card-style layouts can carry an ordered OR unordered list (the ordered
    // form supplies a numbered badge), and the autobold-li rule bleeds bold
    // into the body for BOTH. Catch `- **Title.** body` and `1. **Title.** body`.
    if (/^(?:[-*]|\d+\.) \*\*[^*]+\*\*\.?\s+\S/.test(line)) return line;
  }
  return null;
}

/**
 * Detect the ORDERED-list flavour of the inline title+body footgun
 * (`1. **Title.** body`). Card-style layouts want an UNORDERED nested shape, so
 * an ordered list with a bold lead-in is wrong twice over (wrong list type +
 * the body inherits the title bold). Returns the first offending line, or null.
 */
function findOrderedInlineTitleBodyLine(sample) {
  if (!sample) return null;
  for (const line of sample.split('\n')) {
    if (/^\s*\d+\.\s+\*\*[^*]+\*\*[.:]?\s+\S/.test(line)) return line;
  }
  return null;
}

/**
 * Detect a `**bold**` span inside an ordered-list item (`1. … **x** …`).
 * Returns the first offending line, or null.
 */
function findBoldOrderedStatement(sample) {
  if (!sample) return null;
  for (const line of sample.split('\n')) {
    if (/^\s*\d+\.\s+.*\*\*/.test(line)) return line;
  }
  return null;
}

/**
 * Detect a top-level list item with NO nested child bullet on a split-slot
 * slide. Returns the first offending line, or null. Catches both the inline
 * `- Title. body` and the bare `- Title` shapes — neither gets lifted.
 */
function findSplitBodylessItem(sample) {
  if (!sample) return null;
  const lines = sample.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/^([-*]|\d+\.)\s+\S/.test(lines[i])) continue;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    const next = lines[j] || '';
    if (!/^\s+([-*]|\d+\.)\s+\S/.test(next)) return lines[i];
  }
  return null;
}

/**
 * Detect the big-number hero authored as a HEADING instead of the required
 * first list item. big-number's `number` slot is `ul > li:first-child`; an
 * author who writes the number as a `#`/`##` heading (the intuitive move)
 * leaves that required slot empty and the hero renders blank. True when the
 * slide has a heading but NO top-level list item — the signature of that
 * mistake. A big-number with a list item (hero present) or with neither
 * (an empty stub, a different problem) is left alone. Pure; shared detector.
 */
function findBigNumberHeroInHeading(slide) {
  if (!slide) return false;
  // Strip fenced code first so a `#` comment INSIDE a code block isn't misread as
  // a heading (mirrors countPrimaryCollection, which strips code before counting).
  const body = slide.replace(/^[ \t]*```[\s\S]*?^[ \t]*```/gm, '');
  const hasHeading = /^#{1,6}\s+\S/m.test(body);
  if (!hasHeading) return false;
  return countPrimaryCollection(slide, 'item') === 0;
}

/**
 * Count a slide's PRIMARY collection along `axis` — the markdown-stage,
 * top-level approximation the capacity rule uses for instant feedback before
 * any render. Deliberately APPROXIMATE: it counts top-level list markers /
 * pipe-table rows / pipe-table columns / fenced-code lines from raw markdown,
 * so a deeply nested or HTML-authored collection it can't see returns 0 (no
 * warning) rather than a false positive. The render-exact count
 * (lib/core/collections.js on resolved HTML) is the authority; this is the live
 * tripwire. Returns an integer (0 = nothing countable found).
 */
function countPrimaryCollection(slide, axis) {
  if (!slide || !axis) return 0;
  // Code lines: the first fenced block's interior line count.
  if (axis === 'line') {
    const m = slide.match(/^[ \t]*```[^\n]*\n([\s\S]*?)\n[ \t]*```/m);
    return m ? m[1].split('\n').length : 0;
  }
  // Strip fenced code so list-/table-looking lines inside code don't count.
  const body = slide.replace(/^[ \t]*```[\s\S]*?^[ \t]*```/gm, '');
  if (axis === 'item') {
    // Top-level list markers only — column 0, no leading indent; nested body
    // bullets are indented and excluded.
    let n = 0;
    for (const line of body.split('\n')) {
      if (/^(?:[-*]|\d+\.)\s+\S/.test(line)) n++;
    }
    return n;
  }
  if (axis === 'row' || axis === 'col') {
    const pipeRows = body.split('\n').filter((l) => /^\s*\|.*\|\s*$/.test(l));
    if (pipeRows.length < 2) return 0;
    if (axis === 'col') {
      const cells = pipeRows[0].trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
      return cells.length;
    }
    // GFM: the separator is ALWAYS the second pipe row — test it positionally so
    // a data row of dash placeholders (`| n/a | - | - |`) is never mistaken for
    // the separator and under-counted.
    const sepIsSecond = /-/.test(pipeRows[1]) && /^\s*\|?[\s:|-]+\|?\s*$/.test(pipeRows[1]);
    return Math.max(0, pipeRows.length - 1 - (sepIsSecond ? 1 : 0));
  }
  return 0;
}

/**
 * The character budget one fenced code line has before the pane CLIPS it, per
 * layout and per box. Only the layouts that DO NOT WRAP appear here: a wrapping
 * pane turns a long line into extra rows, which is a fit question the capacity
 * rules already own, not a silent truncation.
 *
 * WHY THIS IS A TABLE OF MEASUREMENTS. The pane is `overflow: hidden` and the
 * code is `white-space: pre`, so a too-long line is cut mid-token with no
 * scrollbar, no ellipsis, and no build-time complaint — the export simply ships
 * a slide that says something other than the source does. Nothing else in the
 * pipeline can see it: the overflow probe measures HEIGHT, and a clipped line
 * costs none. So the budget has to come from geometry, and geometry has to be
 * measured in the engine that does the clipping.
 *
 * MEASURED, in this repo's Chromium, against a real emulator render of a probe
 * deck — the same measurement the guard test re-runs, so it is reproducible on
 * demand rather than folklore. Per box, the `pre` CONTENT box divided by the
 * advance width of `--font-mono` at `--fs-meta`:
 *
 *   box      layout          pre content   font-size    advance    fits
 *   wide     compare-code      516.000px   14.976px    8.9812px      57
 *   wide     code             1104.000px   14.976px    8.9812px     122
 *   square   code              905.175px   22.128px   13.2752px      68
 *   tall     code              893.025px   30.016px   18.0095px      49
 *   strip    code              879.255px   30.016px   18.0095px      48
 *
 * The advance is 0.5997 of the font size — JetBrains Mono's fixed pitch — so any
 * of these recomputes as `floor(contentPx / (fontSizePx * 0.6))`. `--font-mono`
 * and `--fs-meta` are base tokens (lib/base/base.tokens.css), NOT theme-owned, so
 * one table covers every theme. Within a family the content box moves a few px
 * across @sizes (the padding tokens are container-relative): `tall` measures
 * 893.025px at `portrait` and 883.305px at `reel`, and both floor to 49.
 *
 * WHY compare-code IS `wide`-ONLY. At square/tall/strip its panes stack to ONE
 * column and switch to `pre-wrap` (compare-code.styles.css "Family reflow"), so
 * a long line wraps instead of clipping. `code` never wraps in any box, which is
 * why it carries all four. Landscape compare-code also cannot escape into the
 * wrapping carousel split: `resplitDoc` is gated on `AUTOSPLIT_APPLIES`
 * (lattice-emulator.js), which is false at `wide`.
 *
 * The numbers are pinned by a behavioral guard that re-measures them in a real
 * browser (test/unit/components/code-line-width.test.js), so they cannot rot
 * silently if the padding, the type scale, or the mono font changes. That test
 * also asserts the SCOPE — that every layout listed here still fails to wrap,
 * and every one omitted still does — so the table cannot drift out of step with
 * the stylesheet in either direction.
 */
const CODE_LINE_BUDGET = Object.freeze({
  'compare-code': Object.freeze({ wide: 57 }),
  code: Object.freeze({ wide: 122, square: 68, tall: 49, strip: 48 }),
});

/**
 * Modifiers that resize the STAGE, and so move the code pane out from under the
 * budgets above. MEASURED at `wide` on a `code` slide: bare 1104px (122 columns),
 * `claim-hero` and `claim-bleed` 1172px (130), `compact` 1116px (124). The width
 * rule stays silent on a slide carrying any of them rather than judging it
 * against a number that is not its pane's.
 */
const STAGE_RESIZING_MODIFIERS = new Set(['claim-hero', 'claim-bleed', 'compact']);

/** CSS's initial `tab-size`, which the engine never overrides. */
const CODE_TAB_SIZE = 8;

/**
 * Unicode East Asian WIDE and FULLWIDTH ranges — the characters that occupy TWO
 * mono columns rather than one. CJK ideographs, kana, Hangul, the fullwidth
 * ASCII forms, and pictographic emoji.
 *
 * Without this the rule has a silent hole exactly where it hurts most. Measured
 * in this repo's Chromium at `--fs-meta`, against an ASCII advance of 8.981px:
 * 日 and 한 and Ａ all measure 14.969px, あ 15.32px, and an emoji 19px. So a
 * comment in Japanese counts barely more than half its true width, and a line
 * that genuinely runs off the pane says nothing. Verified before fixing: a
 * 39-"column" Japanese comment rendered 575px into a 516px pane — clipped, and
 * the rule was silent.
 *
 * Two columns is the Unicode convention (UAX #11), and it is deliberately what
 * this uses rather than the 1.667 ratio measured above. That ratio is an
 * artifact of THIS box's CJK fallback — `--font-mono` is JetBrains Mono, which
 * ships no CJK, so the glyphs come from whatever the system substitutes, and a
 * machine with a true double-width CJK mono would measure 2.0. Pinning the
 * font-independent convention is the portable choice; the cost is that a
 * CJK-dense line is judged slightly early on this box (a landscape pane holds
 * ~34 ideographs and the rule speaks past 28). That is the right direction for
 * the error to run: the alternative failure is an export that silently ships a
 * truncated line, which is the whole reason the rule exists.
 */
const WIDE_RANGES = [
  [0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf],
  [0x4e00, 0x9fff], [0xa000, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff],
  [0xfe10, 0xfe19], [0xfe30, 0xfe6f], [0xff00, 0xff60], [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f], [0x1f900, 0x1f9ff],
  [0x20000, 0x2fffd], [0x30000, 0x3fffd],
];

function isWideChar(cp) {
  for (const [lo, hi] of WIDE_RANGES) {
    if (cp < lo) return false; // ranges are ascending, so we can stop early
    if (cp <= hi) return true;
  }
  return false;
}

/**
 * The rendered column width of one source line — the count that matters, which
 * is not `line.length`.
 *
 * Three things `.length` gets wrong, all of which change the verdict:
 *   · a TAB advances to the next multiple of `tab-size`, so a tab-indented line
 *     occupies more columns than it has characters;
 *   · a WIDE character (CJK, kana, Hangul, fullwidth, emoji) occupies two;
 *   · an astral character is TWO UTF-16 units but one character, so `.length`
 *     double-counts every emoji and every CJK extension-B ideograph.
 * Iterating the string yields code points, which fixes the third by
 * construction.
 */
function codeLineColumns(line) {
  let col = 0;
  for (const ch of String(line)) {
    if (ch === '\t') col += CODE_TAB_SIZE - (col % CODE_TAB_SIZE);
    else col += isWideChar(ch.codePointAt(0)) ? 2 : 1;
  }
  return col;
}

/**
 * The widest line across EVERY fenced block on the slide, as
 * `{ columns, text }` — or null when the slide fences no code.
 *
 * All blocks, not just the first: a `compare-code` slide is two blocks by
 * definition, and the too-long line is as likely to be in the right pane as the
 * left. (`countPrimaryCollection(slide, 'line')` deliberately reads only the
 * FIRST block, because it answers a different question — how MANY lines the
 * primary collection has, not how WIDE the widest one is.)
 *
 * This scans lines rather than reusing that function's fence regex, because
 * measuring WIDTH needs three things counting does not, each of which was a real
 * wrong answer before it was handled:
 *
 *   · `~~~` fences. markdown-it renders them identically to ``` — same `<pre>`,
 *     same clipping — so a regex that knows only backticks reports nothing at
 *     all for a 300-column line.
 *   · The fence's own INDENT. markdown-it strips the opening fence's indentation
 *     from every content line, so a block nested in a list item renders N columns
 *     narrower than its source reads. Counting the source verbatim inflated a
 *     4-space-indented block by 4 columns and warned about width that is not
 *     there.
 *   · An UNCLOSED fence. markdown-it closes it at end of input and renders the
 *     rest as code, so bailing out on a missing terminator makes the widest lines
 *     on a malformed slide invisible.
 *
 * Trailing whitespace and a CR are dropped before measuring. Neither paints, and
 * counting the CR made every fenced line in a CRLF-saved deck report one column
 * wider than it renders — a deterministic false alarm on every slide of that
 * deck, which is exactly the noise that gets a rule switched off.
 */
function widestCodeLine(slide) {
  if (!slide) return null;
  let best = null;
  let fence = null; // { marker, indent } while inside a block
  for (const raw of String(slide).split('\n')) {
    const line = raw.replace(/\r$/, '');
    const open = line.match(/^([ \t]*)(`{3,}|~{3,})(.*)$/);
    if (!fence) {
      // An opening fence's info string may not contain a backtick (CommonMark),
      // which is what keeps an inline ``` in prose from opening a block.
      if (open && !(open[2][0] === '`' && open[3].includes('`'))) {
        fence = { marker: open[2][0], indent: open[1].length };
      }
      continue;
    }
    // A closing fence is the same marker character, at least as long, and carries
    // nothing after it.
    if (open && open[2][0] === fence.marker && open[2].length >= 3 && !open[3].trim()) {
      fence = null;
      continue;
    }
    // Strip the opening fence's indent (markdown-it does) and any trailing
    // whitespace (it paints nothing, so it cannot be "clipped").
    const content = line.slice(0, fence.indent).trim() === ''
      ? line.slice(fence.indent)
      : line.replace(/^[ \t]+/, '');
    const text = content.replace(/\s+$/, '');
    const columns = codeLineColumns(text);
    if (!best || columns > best.columns) best = { columns, text };
  }
  return best;
}

// The human noun for an axis, pluralized — `col` reads as "column(s)", not
// "col(s)". Used in capacity messages and the generated docs Capacity line.
const AXIS_NOUN = Object.freeze({ item: 'item', row: 'row', col: 'column', cell: 'cell', line: 'line' });
function axisNoun(axis, n) {
  const base = AXIS_NOUN[axis] || String(axis);
  return n === 1 ? base : `${base}s`;
}

/** The actionable fix string a capacity finding prints, from its `escalateTo`. */
function capacityFix(cap) {
  const all = Array.isArray(cap.escalateTo) ? cap.escalateTo.filter(Boolean) : [];
  // Separate sibling-component targets from the generic "split across slides"
  // phrase so the sentence reads cleanly regardless of how escalateTo mixes them.
  const comps = all.filter((t) => !/split/i.test(t));
  if (!comps.length) return 'Split the content across multiple slides.';
  return `Switch to ${comps.join(' / ')}, or split across slides.`;
}

/** True if `token` is a recognized modifier (set membership or prefix family). */
function isKnownModifier(token, vocab) {
  if (vocab.modifiers.has(token)) return true;
  // A mode CLASS TOKEN is a legal per-slide class — the register is the source of truth,
  // so adding a mode never needs a second edit here.
  if (MODE_TOKENS.includes(token)) return true;
  return MODIFIER_PREFIXES.some((p) => token.startsWith(p));
}

/**
 * Convert the bold card-style inline shape `- **Title.** body` to the canonical
 * nested form:
 *   - Title
 *     - body
 * Returns the replacement (two lines), or null if the line is not this exact,
 * deterministic shape. Bare titles (`- Title`) and ambiguous non-bold inline
 * splits are intentionally NOT auto-fixed — there is no safe, unique split — so
 * those findings keep their `fix` guidance instead. Pure; shared by the Node
 * path and the Drawing Board's "Apply fix" quick action.
 */
function autofixNestedTitle(line) {
  if (!line) return null;
  const m = line.match(/^(\s*)([-*])\s+\*\*(.+?)\*\*\.?\s+(\S.*?)\s*$/);
  if (!m) return null;
  const [, indent, bullet, title, body] = m;
  // Strip a trailing sentence punctuation from the title (`**Title.**` → Title).
  const cleanTitle = title.trim().replace(/[.:!?]+$/, '');
  return `${indent}${bullet} ${cleanTitle}\n${indent}  ${bullet} ${body.trim()}`;
}

/**
 * Convert the unordered inline-bold shape on a LEDGER/numbered layout
 * (`- **Title.** body`) to the ordered ledger form the layout wants:
 *   1. Title
 *      - body
 * The literal ordinal is always `1.` — Markdown auto-numbers an ordered list, so
 * a slide of `1.` items renders 1, 2, 3 — and the nested body indents three
 * spaces to clear the `1. ` marker. Returns null if the line isn't the shape.
 */
function autofixOrderedNestedTitle(line) {
  if (!line) return null;
  const m = line.match(/^(\s*)[-*]\s+\*\*(.+?)\*\*\.?\s+(\S.*?)\s*$/);
  if (!m) return null;
  const [, indent, title, body] = m;
  const cleanTitle = title.trim().replace(/[.:!?]+$/, '');
  return `${indent}1. ${cleanTitle}\n${indent}   - ${body.trim()}`;
}

/**
 * Swap a retired gantt span delimiter (`→` / `–` / `—` / `->`) for the canonical
 * `..`, but ONLY inside the line's TRAILING inline-code pills (the span tokens) —
 * inline code earlier in the label is prose the detector treats as such, so it is
 * left untouched. Mirrors the detector's trailing-pill peel. Returns the rewritten
 * line, or null if no retired delimiter in a trailing pill needs changing.
 */
function autofixGanttDelimiter(line) {
  if (!line || !/(?:→|–|—|->)/.test(line)) return null;
  // Peel the trailing run of `…` pills (the same tokens the detector reads),
  // leaving the label head — which may itself contain inline code — alone.
  let head = line;
  const pills = [];
  let m;
  while ((m = head.match(/(\s*)`([^`]+)`(\s*)$/))) {
    pills.unshift({ pre: m[1], inner: m[2], post: m[3] });
    head = head.slice(0, m.index);
  }
  if (!pills.length) return null;
  let changed = false;
  const rebuilt = pills
    .map((p) => {
      const inner = p.inner.replace(/\s*(?:→|–|—|->)\s*/g, '..');
      if (inner !== p.inner) changed = true;
      return `${p.pre}\`${inner}\`${p.post}`;
    })
    .join('');
  return changed ? head + rebuilt : null;
}

/**
 * Swap one whole TOKEN in a line — the machine fix behind a `replace` finding.
 *
 * Token-boundary matched, not substring: a register value or a `_class` token is a
 * word, and a naive `line.replace(from, to)` would rewrite `text` inside `pretext`
 * or `context`. Only the FIRST occurrence changes, which is the one the finding is
 * about. Returns null when the token is not on the line, so `applyFix` reports "could
 * not apply" rather than silently returning the line unchanged.
 */
function replaceToken(line, from, to) {
  if (!line || !from || !to) return null;
  const escaped = String(from).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // No nested quantifier: one escaped literal between two boundary assertions, so the
  // match is linear and a static analyzer has nothing to flag (the ReDoS shape a
  // quantified group whose body can contain its own separator produces).
  const re = new RegExp(`(^|[^A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`);
  if (!re.test(line)) return null;
  return line.replace(re, (_m, pre) => `${pre}${to}`);
}

/**
 * Attach a MACHINE-APPLIABLE fix to a "'x' is not a known y" finding, when exactly one
 * candidate is close enough to be unambiguous.
 *
 * Every register validator below reports the same shape — a value, and the canonical
 * list it should have come from — and every one of them could only ever offer PROSE
 * ("set it to one of: …"), which is the half of #1658 that reads as the tool knowing
 * the answer and making you type it anyway. `nearestRegion` already computes a bounded,
 * deterministic "did you mean" for map names; this reuses it, so a typo'd register
 * becomes a one-click fix with no model call and no second suggestion algorithm.
 *
 * `didYouMean` is carried separately from `message` deliberately: the message is what
 * every existing surface prints and asserts, and the suggestion belongs on the BUTTON
 * ("Fix: use 'sketch'"), where it says what pressing it will do.
 *
 * Conservative by construction — `nearestRegion` returns null past a length-scaled edit
 * distance, so an unrelated word gets no button and keeps its prose guidance.
 */
function withTokenSuggestion(finding, candidates) {
  const value = finding?.classToken;
  if (!value || !candidates) return finding;
  const list = [...candidates].map((c) => String(c));
  const near = nearestRegion(String(value), list);
  if (!near || near === String(value)) return finding;
  return { ...finding, autofixable: true, didYouMean: near, replace: { from: String(value), to: near } };
}

// The autofix transform for a finding, computed from the ACTUAL source line (so
// indentation is preserved). Returns the replacement text (which may be multiple lines)
// or null when the finding has no machine fix / the line isn't the fixable shape. The
// default covers the bold inline shape shared by the card-style and split rules.
//
// Takes the FINDING, not just its rule, because a structured `replace` is data the rule
// alone cannot supply: seventeen register validators share one fix shape (swap this
// token for that one) and differ only in which list the candidate came from.
function fixReplacement(finding, line) {
  if (finding?.replace) return replaceToken(line, finding.replace.from, finding.replace.to);
  switch (finding?.rule) {
    case 'ledger-inline-title':
      return autofixOrderedNestedTitle(line);
    case 'gantt-retired-delimiter':
      return autofixGanttDelimiter(line);
    default:
      return autofixNestedTitle(line);
  }
}

/**
 * Apply an auto-fixable finding to `source`, returning the new source — or null
 * if it can't be applied cleanly (not an auto-fixable shape, or the line can't
 * be located in the finding's slide). Scoped to the finding's `---`-chunk so an
 * identical line on another slide isn't touched. The replacement is computed
 * from the located source line, so the line's indentation is preserved.
 */
function applyFix(source, finding) {
  if (!finding || finding.line == null) return null;
  const lines = source.split('\n');
  const target = finding.line.trim();
  // finding.slide is the human 1-based number; the raw `---`-chunk that holds it
  // is `slide + fm - 1` (fm = front-matter chunks). Scope the fix to that chunk.
  // The chunk walk MUST count boundaries the same way `finding.slide` was numbered —
  // fence-aware (a `---` inside a code fence is not a boundary) and CRLF-tolerant —
  // or a fenced `---` before the target desyncs the scope and the fix silently drops
  // (which also halts `applyAllFixes`). `separatorLines` is that shared predicate.
  const targetChunk = finding.slide + fmChunks(source) - 1;
  const seps = separatorLines(lines);
  let chunk = 0;
  for (let i = 0; i < lines.length; i++) {
    if (seps.has(i)) { chunk++; continue; }
    if (chunk === targetChunk && lines[i].trim() === target) {
      const repl = fixReplacement(finding, lines[i]);
      if (repl == null) return null;
      return lines.slice(0, i).concat(repl.split('\n'), lines.slice(i + 1)).join('\n');
    }
  }
  return null;
}

/**
 * Apply EVERY auto-fixable finding in `source`, returning the fixed source. Each
 * fix shifts line numbers, so we re-lint and apply one fix per pass until none
 * remain (or a fix no-ops / can't apply). Bounded against any pathological loop.
 * Pure; the shared engine behind the Drawing Board's "Fix all" and the CLI's
 * `--fix`. `vocab` is the same map `lintTextWith` takes.
 */
function applyAllFixes(source, vocab) {
  let cur = source || '';
  for (let pass = 0; pass < 500; pass++) {
    const fixable = lintTextWith(cur, vocab).find((f) => f.autofixable);
    if (!fixable) break;
    const next = applyFix(cur, fixable);
    if (next == null || next === cur) break;
    cur = next;
  }
  return cur;
}

// Bounded Levenshtein edit distance — returns the distance, or `max + 1` as
// soon as it provably exceeds `max` (so a far-off candidate bails cheap). Pure,
// used only for the map "did you mean" suggestion.
function editDistance(a, b, max) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > max) return max + 1;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// Nearest valid region/group name to an unresolved one, or null if nothing is
// close enough. Threshold scales gently with length (a one-word typo, not a
// different country). `candidates` is the list of canonical display names.
function nearestRegion(name, candidates) {
  const q = name.toLowerCase();
  const max = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3;
  let best = null, bestD = max + 1;
  for (const c of candidates) {
    const d = editDistance(q, c.toLowerCase(), max);
    if (d < bestD) { bestD = d; best = c; if (d === 0) break; }
  }
  return bestD <= max ? best : null;
}

/**
 * Find list items in `map` slides whose lead name the basemap can't resolve —
 * the spelling-variance footgun world maps live with (`Cote dIvore`, `Brasil`).
 * `mapVocab` is injected data: `{ us: {valid:Set<normalized>, names:[…]},
 * world: {…} }`, where `valid` holds every normalized name/alias/group and
 * `names` the canonical labels to suggest from. Returns findings with a
 * deterministic "did you mean" — no model call, the whole point of doing it
 * here. Pure; shared by the CLI and the Drawing Board.
 */
// Front matter occupies the first two `---`-split chunks (the empty pre-fence
// text + the YAML body) when the deck opens with a complete `---…---` block. A
// finding's `slide` is the HUMAN 1-based slide number with front matter
// excluded — matching the preview's "Slide N", the [slide N] edit markers, and
// the Reveal jump — so a raw chunk index maps to it via `idx - fmChunks + 1`.
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/;
function fmChunks(source) {
  return FRONT_MATTER.test(String(source || '')) ? 2 : 0;
}

function findUnknownMapRegions(source, mapVocab) {
  if (!mapVocab) return [];
  const findings = [];
  const norm = (s) => String(s).toLowerCase().replace(/[.’']/g, '').replace(/\s+/g, ' ').trim();
  const slides = splitTopLevel(source);
  const directives = slideClassDirectives(source);
  const fm = fmChunks(source);
  slides.forEach((slide, idx) => {
    const tokens = (directives[idx]?.payload || '').split(/\s+/).filter(Boolean);
    if (!tokens.includes('map')) return;
    // Mirror pickBasemap: `us` / `usa` select the US states; otherwise the
    // world map is the default (bare `map` is a world map).
    const which = tokens.includes('us') || tokens.includes('usa') ? 'us' : 'world';
    const vocab = mapVocab[which];
    if (!vocab) return;
    // Only TOP-LEVEL bullets are region rows; a deeper-indented bullet is an
    // authored per-region detail sublist (the mark-detail feature) and must not
    // be checked as a region name. Mirror the kernel, which reads only top-level
    // <li>s. The region level is the shallowest bullet indent on the slide.
    const bulletLines = slide.split('\n')
      .map((raw) => ({ raw, m: raw.match(/^(\s*)[-*]\s+(.+)$/) }))
      .filter((x) => x.m);
    if (!bulletLines.length) return;
    const baseIndent = Math.min(...bulletLines.map((x) => x.m[1].length));
    for (const { raw, m: li } of bulletLines) {
      if (li[1].length > baseIndent) continue; // nested detail sublist — skip
      // Drop the trailing inline-code value (`48.2`) — the rest is the name.
      const name = li[2].replace(/`[^`]*`\s*$/, '').replace(/[*_]/g, '').trim();
      if (!name) continue;
      if (vocab.valid.has(norm(name))) continue;
      const suggestion = nearestRegion(name, vocab.names);
      findings.push({
        slide: idx - fm + 1,
        rule: 'unknown-map-region',
        severity: 'warning',
        classToken: 'map',
        line: raw.trim(),
        message: `'${name}' is not a ${which === 'world' ? 'country' : 'state'} the ${which} basemap recognises` +
          (suggestion ? ` — did you mean '${suggestion}'?` : ''),
        fix: suggestion
          ? `Use '${suggestion}' (full name, code, or a known alias all resolve).`
          : `Check the name against the ${which} basemap — full name, code, or a known alias.`,
      });
    }
  });
  return findings;
}

/**
 * Lint deck source against an injected vocabulary. Returns an array of findings:
 *   { slide, rule, severity, classToken, line, message, fix }
 * `vocab` is `{ names: Set<string>, modifiers: Set<string> }`. `slide` is the
 * HUMAN 1-based slide number (front matter excluded). This is the shared engine;
 * lib/authoring/lint.js builds the vocab from manifests, the browser passes one
 * precomputed at build time.
 */
function lintTextWith(source, vocab) {
  const findings = [];
  // The capacity rules below fork on the deck's FAMILY, because the SPLIT move does: past
  // `hard` at `wide` is `capacity-overflow` (no split move there — the ring is the terminal),
  // and at square/tall/strip it is the `capacity-autosplit` advisory. The milder capacity-crowd
  // (soft < n <= hard) applies in every box: it is an editorial judgment about a crowded slide,
  // not a prediction of overflow. See lib/core/auto-split.js +
  // engineering/decisions/2026-07-29-autosplit-is-not-a-toggle.md.
  const cardStyle = new Set(CARD_STYLE_LAYOUTS);
  const ledgerOl = new Set(LEDGER_OL_LAYOUTS);
  const statementOl = new Set(STATEMENT_OL_LAYOUTS);
  const splitSlot = new Set(SPLIT_SLOT_LAYOUTS);
  const numberSlot = new Set(NUMBER_SLOT_LAYOUTS);
  // Split layouts whose left-panel anchor is an <h2> the transform extracts
  // (headline, or the split-panel `metric` hero number). The split-panel
  // `pullquote` variant is excluded — its anchor is a blockquote.
  const isH2AnchoredSplit = (tokens) =>
    (tokens.includes('split-panel') && !tokens.includes('pullquote')) ||
    tokens.includes('split-compare');
  // Split on slide separators (a line that is exactly `---`). The front-matter
  // chunks carry no `_class`, so they're skipped; `fm` rebases the chunk index
  // onto the human 1-based slide number authors and the preview see.
  const slides = splitTopLevel(source);
  const fm = fmChunks(source);
  // The BOX the deck renders into, for the per-family capacity budgets below.
  const family = deckFamily(source);
  // Deck-wide `claim:` → its stamped token (framed/unknown → none), so the
  // bleed safety cap below catches `claim: bleed` front-matter, not just a
  // per-slide `claim-bleed` token. A per-slide claim-* overrides it.
  const fmClaimBlock = String(source || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const deckClaimRaw = fmClaimBlock && (fmClaimBlock[1].match(/^\s*claim:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m) || [])[1];
  const deckClaimName = deckClaimRaw ? deckClaimRaw.trim().toLowerCase() : '';
  const deckClaimToken = ['quiet', 'hero', 'bleed'].includes(deckClaimName) ? `claim-${deckClaimName}` : null;
  // Deck-wide `finish:` (backdrop) value, front-matter scoped. A real finish
  // (anything but none) paints a backdrop over EVERY slide — including the
  // title/closing bookends, whose inverse surface + display-white text it can
  // wash out. Used by the bookend-finish-contrast rule below.
  const deckFinishRaw = fmClaimBlock && (fmClaimBlock[1].match(/^\s*finish:\s*["']?([\w-]+)/m) || [])[1];
  const deckFinishName = deckFinishRaw ? deckFinishRaw.trim().toLowerCase() : '';
  // Only a REGISTERED finish paints a backdrop — an unknown value (a typo, or the
  // per-slide `finish-none` spelling written at deck level) resolves to no
  // backdrop in the engine (resolve-finish.js) and is flagged by `unknown-finish`
  // instead. Gate on the injected finish vocab so this rule agrees with the
  // engine and never contradicts unknown-finish; fall back to "any non-none" only
  // when the vocab is absent (an older browser handoff — where unknown-finish is
  // also inert, so there's nothing to contradict).
  const deckFinishKnown = vocab.finishNames
    ? new Set([...vocab.finishNames].map((n) => String(n).toLowerCase()))
    : null;
  const deckHasFinish = !!deckFinishName && deckFinishName !== 'none'
    && (!deckFinishKnown || deckFinishKnown.has(deckFinishName));

  const classDirectives = slideClassDirectives(source);
  slides.forEach((slide, idx) => {
    // `m` keeps the two fields every finding below reads — the raw directive TEXT
    // (`m[0]`, quoted back to the author) and the payload (`m[1]`). On a slide
    // governed by a running global, the text is the GLOBAL's line, which is where
    // the author has to go to change it.
    const dir = classDirectives[idx];
    if (!dir?.payload) return;
    const m = [dir.text, dir.payload];
    const tokens = dir.payload.split(/\s+/).filter(Boolean);

    // Rule 1 — unknown class/modifier tokens.
    for (const t of tokens) {
      if (vocab.names.has(t)) continue;
      if (isKnownModifier(t, vocab)) continue;
      if (DEPRECATED_CLASSES.has(t)) continue;
      // The candidate pool is the SAME vocabulary the check above rejected against —
      // components and modifiers together — so the suggestion can never name a token
      // this rule would immediately flag again.
      findings.push(withTokenSuggestion({
        slide: idx - fm + 1,
        rule: 'unknown-class',
        severity: 'warning',
        classToken: t,
        line: m[0],
        message: `'${t}' is not a known component or modifier`,
        fix: 'Check the spelling against dist/docs/components.json (component names) or design/design-system.md §6.5 (modifiers).',
      }, [...vocab.names, ...(vocab.modifiers || [])]));
    }

    // Rule — conflicting variants. At most ONE member of a mutually-exclusive axis
    // may sit on a slide; two fight at render (two type scales, two tones, `with-period`
    // AND `no-period`). Driven by the generated `exclusiveAxes` vocabulary so the rule
    // can't drift from the tokens. The finish axis is dynamic (preset + saved names), so
    // it's checked by prefix rather than a static member list. Warning severity — the
    // engine still renders (last wins), it's just ambiguous. See
    // engineering/decisions/2026-07-03-slide-context-editor.md §8.
    const exclusiveAxes = vocab.exclusiveAxes || {};
    for (const [axis, members] of Object.entries(exclusiveAxes)) {
      const hits = tokens.filter((t) => members.includes(t));
      if (hits.length > 1) {
        findings.push({
          slide: idx - fm + 1,
          rule: 'conflicting-variants',
          severity: 'warning',
          classToken: hits[1],
          line: m[0],
          message: `'${hits.join("' and '")}' conflict — a slide takes one ${axis} at a time`,
          fix: `Keep a single ${axis} token; remove the other${hits.length > 2 ? 's' : ''}.`,
        });
      }
    }
    // Finish axis — at most one finish selector (a `finish-<preset>` OR the
    // `finish-none` opt-out); several presets, or a preset alongside `finish-none`,
    // composite/contradict and only one wins.
    const finishHits = tokens.filter((t) => /^finish-.+/.test(t) && t !== 'finish-preview');
    if (finishHits.length > 1) {
      findings.push({
        slide: idx - fm + 1,
        rule: 'conflicting-variants',
        severity: 'warning',
        classToken: finishHits[1],
        line: m[0],
        message: `${finishHits.length} finish selectors on one slide — only one renders`,
        fix: 'Keep a single finish-<name> (or finish-none); remove the others.',
      });
    }

    // Rule — `claim-bleed` safety cap. A prose-dense/table component excludes
    // `claim-bleed` (its manifest `excludes`) because content run to the true
    // edge gets cropped by a projector/printer. Warn if used anyway; step down
    // to `claim-hero` (keeps a hairline safe zone). 2026-07-03 claim decision §8.
    if (vocab.claimExcludes) {
      const comp = tokens.find((t) => vocab.names.has(t));
      const excluded = comp && vocab.claimExcludes[comp];
      if (excluded) {
        // The claim in force on this slide: a per-slide claim-* wins; otherwise
        // the deck-wide `claim:` applies (mirrors the propagator's override).
        const ownClaim = tokens.find((t) => t.startsWith('claim-'));
        const effective = ownClaim || deckClaimToken;
        if (effective && excluded.includes(effective)) {
          const via = ownClaim ? `'${effective}'` : `deck-wide \`claim: ${deckClaimName}\``;
          findings.push({
            slide: idx - fm + 1,
            rule: 'claim-bleed-unsafe',
            severity: 'warning',
            classToken: effective,
            line: m[0],
            message: `${via} runs '${comp}' to the true edge, where its content is cropped`,
            fix: `Use 'claim-hero' instead (keeps a hairline safe zone), or drop this slide to 'claim-framed'; only media/canvas layouts should bleed.`,
          });
        }
      }
    }

    // Rule — `qr` variant payload guard. A qr-variant slide (closing/divider/
    // split-panel + `qr`) must resolve exactly ONE scannable payload: a bare-URL
    // bullet (auto), or a `- <value> `qr`` bullet. Missing / empty / duplicate
    // payloads render a blank or wrong code SILENTLY, so they lint loud (error).
    // See engineering/decisions/2026-07-01-qr-authoring-grammar.md § guards.
    if (tokens.includes('qr')) {
      // Payload-URL scheme — MUST match lib/components/connect/_qr-card/qr-payload.js
      // (PAYLOAD_URL_RE) so the transform and the linter agree on what auto-resolves.
      // Kept inline because lint-core requires nothing from lib/components (browser).
      const URL = /^(https?:\/\/|mailto:|tel:|WIFI:|BEGIN:VCARD)/i;
      let payloads = 0, empties = 0;
      const bulletRe = /^-\s+(.+?)\s*$/gm; // top-level bullets only (no leading indent)
      let b;
      while ((b = bulletRe.exec(slide))) {
        const item = b[1];
        const codeM = item.match(/`([^`]+)`\s*$/); // trailing inline-code key
        const key = codeM ? codeM[1].trim().toLowerCase() : '';
        const value = codeM ? item.slice(0, item.length - codeM[0].length).trim() : item.trim();
        if (key === 'qr') { payloads++; if (!value) empties++; }
        else if (!key && URL.test(value)) payloads++;
      }
      const sn = idx - fm + 1;
      if (empties) {
        findings.push({ slide: sn, rule: 'qr-empty-payload', severity: 'error', classToken: 'qr', line: m[0],
          message: 'the `qr` payload bullet has no value', fix: 'Give it a value: ``- https://… `qr` `` or ``- text `qr` ``.' });
      } else if (payloads === 0) {
        findings.push({ slide: sn, rule: 'qr-missing-payload', severity: 'error', classToken: 'qr', line: m[0],
          message: 'a `qr` slide has no scannable payload', fix: 'Add a payload bullet: `- https://…` (auto-detected), or ``- text `qr` `` to force text.' });
      } else if (payloads > 1) {
        findings.push({ slide: sn, rule: 'qr-duplicate-payload', severity: 'error', classToken: 'qr', line: m[0],
          message: `a \`qr\` slide has ${payloads} payloads; it renders only one`, fix: 'Keep one payload bullet; remove the extras.' });
      }
    }

    // Rule — content capacity. Each layout declares the comfortable element
    // count for the axis it is built on (manifest `capacity`, injected via
    // vocab); pouring more in crowds or overflows the slide. Approximate,
    // markdown-stage count → advisory warning with an escalateTo fix. Gated on
    // injected capacity data so a deck pays nothing when it's absent. See
    // engineering/decisions/2026-06-17-content-capacity-contract.md.
    if (vocab.capacity) {
      // A generated gallery stress slide deliberately sits in the crowd band
      // ((soft, hard] — the Specimen Book contract band, 2026-07-05 decision):
      // it EXISTS to show the upper limit. The `<!-- stress-slide -->` marker
      // (emitted only by tools/build-component-docs.js galleryPlan, gated on
      // specimenVoice) suppresses capacity-crowd — and past `hard` it suppresses BOTH
      // the overflow warning and the split advisory, because the marker also makes the
      // splitter leave the slide whole (see the marker's other half in
      // lib/core/auto-split.js): a specimen overflows on purpose and is never divided.
      const isStressSlide = /<!--\s*stress-slide\s*-->/.test(slide);
      for (const t of tokens) {
        const declared = vocab.capacity[t];
        if (!declared) continue;
        // Per-family counts win over the flat block: the same component holds a
        // very different number in each box (cards-grid measures a ceiling of 6
        // at wide and 3 at tall), so linting a portrait deck against a landscape
        // budget either warns on a slide that fits or stays silent on one that
        // clips. The flat block still supplies axis / min / escalateTo / note,
        // which do not vary by box. See
        // engineering/decisions/2026-07-27-family-stamp-replaces-container-queries.md.
        // Per-family may only TIGHTEN, never loosen. The flat block is the budget
        // that has actually shipped; the per-family numbers were hand-declared and
        // never oracle-validated (2026-06-17 contract §5 step 8), so letting one
        // RAISE a cap means enforcing an unverified number in the permissive
        // direction — the linter would stop warning about slides that really clip.
        // cards-grid is the worked case: flat hard 4, declared tall hard 6,
        // MEASURED tall ceiling 3 (tools/calibrate-capacity.js). Taking the min
        // keeps the finer model wherever it is stricter (which is the whole point
        // for tall/strip) and can never regress a warning that fires today.
        const perFamily = declared.families?.[family];
        const cap = perFamily ? { ...declared, ...perFamily } : declared;
        if (perFamily) {
          for (const k of ['sweet', 'soft', 'hard']) {
            if (declared[k] != null && cap[k] != null) cap[k] = Math.min(cap[k], declared[k]);
          }
        }
        const n = countPrimaryCollection(slide, cap.axis);
        if (!n) break; // nothing countable — don't guess
        const comfort = cap.sweet != null ? cap.sweet : cap.soft;
        if (cap.hard != null && n > cap.hard) {
          // A SPECIMEN says nothing at all. `<!-- stress-slide -->` makes the splitter leave
          // the slide whole (lib/core/auto-split.js) and its author has already declared they
          // know it is at the limit — both an overflow warning and a split promise would be
          // noise, and the split promise would be false.
          if (isStressSlide) continue;
          // WHICH TERMINAL is past the budget depends on the BOX, because the SPLIT move is
          // gated on it (lattice-emulator.js `AUTOSPLIT_APPLIES`): it runs at square · tall ·
          // strip and not at `wide`, since 16:9 is the box a deck is authored in and the
          // engine does not re-cut a slide its author composed. So:
          //
          //   wide            → no split move. Past the box is CLIPPED, and the ring says so.
          //                     `capacity-overflow`, a real warning, because the author has to act.
          //   square/tall/strip → the slide MAY be divided into a run. `capacity-autosplit`,
          //                     `info`, so a deliberate split doesn't red `lint:deck --strict`.
          //
          // NEITHER claims more than it knows, and the `wide` one had to be walked back once
          // already: it shipped saying "expect it to overflow" at `warning`, which is a FIT
          // prediction from a COUNT in the very change that removed the count as a fit trigger.
          // Ten one-word `checklist` items at `hd` are past `hard: 9` and render clean, so that
          // sentence reddened `--strict` on a deck with nothing wrong with it. `capacity` is an
          // editorial budget measured against a synthetic probe deck (2026-07-28-capacity-basis.md);
          // it knows the slide is past what the component comfortably holds, and it does not know
          // whether the glyphs fit. Say only the first.
          //
          // The severity stays `warning` rather than `info` for a reason that is about RECOURSE,
          // not confidence: at every other @size an over-full slide is divided automatically, so
          // the advisory is genuinely advisory. Here nothing will happen — so if it does not fit,
          // the author is the only one who can act.
          if (family === 'wide') {
            findings.push({
              slide: idx - fm + 1,
              rule: 'capacity-overflow',
              severity: 'warning',
              classToken: t,
              line: m[0],
              message: `'${t}' holds about ${comfort} ${axisNoun(cap.axis, comfort)} comfortably (max ~${cap.hard}); this slide has ${n}, and a landscape @size does not paginate — so if it does not fit, it is clipped` + (cap.note ? ` (${cap.note})` : ''),
              // Naming the non-split is the part an author cannot infer: every other @size
              // paginates, and the silence at landscape would otherwise read as a bug. What this
              // must NOT promise is the ring — the emulator strips the overflow marker before
              // printing ("a red box in front of a board is worse than the silent clip",
              // lattice-emulator.js), so the only signal outside this warning is a build-time
              // stderr line. An earlier draft of this string promised "clipped and ringed"; the
              // ring never reaches the artifact.
              fix: `${capacityFix(cap)} Nothing will divide it for you at a landscape @size, and the export tags the clipped slide "Content clipped" rather than dividing it — check the rendered page, or present at a portrait/square @size, where it paginates.`,
            });
            continue;
          }
          {
            // Page count mirrors lib/core/split-envelope.js `balancedPerPage` — the target
            // is a CEILING and the cut is spread evenly over the pages it implies. Pinned
            // against the kernel by test/unit/authoring/… so the two cannot drift.
            //
            // It is a FLOOR, not a promise, and the message says so. `resplitDoc` paces at the
            // TIGHTER of this authored target and the measured overflow ratio, so a box that
            // spills by 3× cuts smaller pages than the manifest asks and the run comes out
            // LONGER than the number here. Reporting it as exact was safe while the count
            // itself forced the split; now that only measurement does, the count can only
            // bound the answer from below.
            const target = cap.perPage ?? cap.sweet ?? cap.soft ?? cap.hard;
            const pages = Math.max(1, Math.ceil(n / target));
            // …and the per-page SIZES, mirroring `evenGroups` (lib/core/collections.js): the
            // first `n % pages` pages take one extra. The old text reported `ceil(n / pages)`
            // for every page, which described a deck that does not exist — 13 agenda items
            // came out 4/3/3/3 while the advisory promised "4 pages of 4" AND "every page is
            // paced the same". An exact split says "4"; an uneven one says "4–3" and drops the
            // same-pacing claim for "within one".
            const base = Math.floor(n / pages);
            const extra = n % pages;
            const paced = extra ? `${base + 1}–${base}` : `${base}`;
            const evenness = extra
              ? 'every page is within one of the others'
              : 'every page is paced the same';
            // The envelope's COVER needs a masthead to carry, and `readMasthead`
            // (lib/core/split-envelope.js) reads an `<h2>` specifically — so a slide
            // with no `## ` headline makes `splitEnvelope` return null and the run
            // falls back to the bare partition: paced pages, but no cover to open on.
            // Promising a cover there would be false (the same `/^##\s/m` probe Rule 5
            // uses for its h2-anchored check, so one idiom answers "has a headline").
            const hasHeadline = /^##\s/m.test(slide);
            const trim = `To keep it on ONE slide, trim to ${cap.hard} or fewer ${axisNoun(cap.axis, cap.hard)}.`;
            findings.push({
              slide: idx - fm + 1,
              rule: 'capacity-autosplit',
              severity: 'info',
              classToken: t,
              line: m[0],
              message: `'${t}' holds about ${comfort} ${axisNoun(cap.axis, comfort)} comfortably; this slide has ${n}, so if it does not fit the ${family} box auto-split divides it into ${pages} or more pages of ${paced}` + (cap.perPage != null ? ` (${t} paces ${cap.perPage} per page when split)` : ''),
              fix: hasHeadline
                ? `Intended? Nothing to do — if it splits, the run leads with a cover and ${evenness}. ${trim}`
                : `Intended? If it splits, ${evenness}, but this slide has no \`## \` headline, so the run gets no cover page to open on — add one. ${trim}`,
            });
            continue;
          }
        } else if (cap.soft != null && n > cap.soft && !isStressSlide) {
          findings.push({
            slide: idx - fm + 1,
            rule: 'capacity-crowd',
            severity: 'warning',
            classToken: t,
            line: m[0],
            message: `'${t}' reads best with ${comfort} or fewer ${axisNoun(cap.axis, comfort)}; this slide has ${n} — past ${cap.soft} it begins to crowd`,
            fix: capacityFix(cap),
          });
        }
        break; // one capacity check per slide (the layout token)
      }
    }

    // Rule — a fenced code line WIDER than the pane it renders into.
    //
    // This is the width half of capacity, and it is the half nothing else can
    // see. The capacity rules count ELEMENTS and the overflow probe measures
    // HEIGHT; a line past the pane's right edge costs neither. It is cut
    // mid-token by the pane's `overflow: hidden`, with no scrollbar to recover
    // it and no ellipsis to admit it, so the artifact ships a slide that says
    // something other than the source does — quietly. The clip is the DELIBERATE
    // behavior at landscape (compare-code.styles.css: a clipped line is a loud,
    // local failure, where wrapping was a quiet one that broke pane-to-pane
    // pairing, dropped trailing lines from the export, and baked hard breaks
    // into the PDF text layer). This rule is that decision's other half — the
    // thing that tells the author, at write time, which line to shorten.
    //
    // Budgets and their derivation: CODE_LINE_BUDGET above. Layouts absent from
    // it WRAP in this box and so cannot clip; nothing is said about them.
    //
    // Severity `info` — advisory, and deliberately NOT `warning`, because in
    // this repo `warning` is not advisory: `tools/lint-deck.js` fails on any
    // warning under `--strict`, and CI runs `lint:deck:all --strict` over all
    // 255 decks. A `warning` here would therefore be a merge gate on every
    // future PR in the repo, enforced from a table of five numbers MEASURED IN A
    // BROWSER — while the guard that keeps those numbers honest skips in CI,
    // which has no Chromium by contract. A blocking rule whose calibration never
    // runs where it blocks is a lever pointed at everyone else's work.
    //
    // The comparison to `capacity-overflow` (which IS a warning) does not carry,
    // for two reasons beyond severity. That rule has an escape hatch that costs
    // nothing — `<!-- stress-slide -->` — whereas here the same marker also tells
    // the splitter to leave the slide whole, so silencing a width advisory would
    // change how the deck PAGINATES. And this rule reads the deck's front-matter
    // `@size` only: a deck authored at `wide` is judged against the LOOSEST
    // budget in the table, so a line it passes at 122 columns is cut in half when
    // the same source is presented at `tall`. Advisory is the honest register for
    // a measurement that narrow.
    // A modifier that resizes the stage moves the pane with it, and the budget
    // table is keyed by (layout, family) only — so on these slides it is simply
    // the wrong number. MEASURED at `wide`: bare `code` gives a 1104px pane (122
    // columns), `claim-hero` and `claim-bleed` give 1172px (130), and `compact`
    // gives 1116px (124). Judging a `claim-hero` slide against 122 tells an author
    // that eight columns are "clipped off the rendered slide" when they are on it
    // — and `examples/claim.md`, `code.gallery.md` and `compare-code.gallery.md`
    // all ship exactly these combinations, so it is a live false alarm, not a
    // hypothetical.
    //
    // Say nothing rather than say something false. Keying the table on the
    // modifier as well would mean 24 more measured cells for three shipped
    // slides, and every one of them another number that can rot silently; a
    // missed clip is the same failure the corpus had before this rule existed,
    // while a false alarm on a slide that renders correctly is the failure that
    // gets a rule deleted. Same instinct as `countPrimaryCollection` returning 0
    // rather than guessing.
    const stageResized = tokens.some((t) => STAGE_RESIZING_MODIFIERS.has(t));
    // The TIGHTEST budget among the slide's layout tokens, not the first one
    // found. `_class: code compare-code` is pathological authoring, but taking
    // whichever token happened to be typed first made the verdict depend on word
    // order — silent at 80 columns one way, warning the other. Whichever layout
    // the engine paints, the tighter answer is the one that cannot under-report.
    let t = null;
    let budget = null;
    for (const tok of tokens) {
      const b = CODE_LINE_BUDGET[tok]?.[family];
      if (b != null && (budget == null || b < budget)) { t = tok; budget = b; }
    }
    // A specimen sits at the limit on purpose, exactly as it does for capacity —
    // the marker means "I know, that is the point".
    const widthCheckable = budget != null && !stageResized
      && !/<!--\s*stress-slide\s*-->/.test(slide);
    // ONE finding per slide, for the worst line. A block whose author blew the
    // budget usually blew it on several lines, and one finding per line buries
    // the slide that has a different problem.
    const widest = widthCheckable ? widestCodeLine(slide) : null;
    if (widest && widest.columns > budget) {
      const over = widest.columns - budget;
      findings.push({
        slide: idx - fm + 1,
        rule: 'code-line-clipped',
        severity: 'info',
        classToken: t,
        line: m[0],
        message: `a fenced line on this '${t}' slide is ${widest.columns} columns wide; the ${family} pane fits about ${budget}, and code does not wrap here — the last ${over} ${over === 1 ? 'column is' : 'columns are'} clipped off the rendered slide`,
        fix: t === 'compare-code'
          // The escape hatch is real and worth naming: one full-width `code`
          // block fits more than twice what a half-pane does (122 vs 57), so a
          // pair where only ONE side is wide is often better authored as two
          // slides than trimmed.
          ? `Trim the line to ${budget} columns or fewer — wrapping the arguments across lines keeps it valid in most languages. If the snippet genuinely needs the width, give it a full-width \`code\` slide instead, which fits about ${CODE_LINE_BUDGET.code[family]}.`
          // The budget checked is the deck's OWN @size. A `code` block never
          // wraps in any box, so the same source presented at a narrower @size
          // clips far sooner — say so, rather than letting "fits about 122" read
          // as a guarantee it is not.
          : `Trim the line to ${budget} columns or fewer, or break the statement across lines.`
            + (family === 'wide' ? ` Note this is the landscape budget: \`code\` never wraps, so at a portrait or square @size the same block fits only about ${CODE_LINE_BUDGET.code.tall}–${CODE_LINE_BUDGET.code.square} columns.` : ''),
      });
    }

    // Rule 2 — card-style inline title+body (unordered OR ordered). Card-style
    // layouts want the unordered nested shape; an ordered `1. **Title.** body`
    // is wrong twice over (wrong list type + the body inherits the title bold).
    if (tokens.some((t) => cardStyle.has(t))) {
      const offending = findInlineTitleBodyLine(slide) || findOrderedInlineTitleBodyLine(slide);
      if (offending) {
        findings.push({
          slide: idx - fm + 1,
          rule: 'card-style-inline-title',
          severity: 'error',
          classToken: tokens.find((t) => cardStyle.has(t)),
          line: offending.trim(),
          autofixable: !!autofixNestedTitle(offending),
          message: 'inline "- **Title.** body" on a card-style slide — the body inherits the parent li bold',
          fix: 'Use the nested-list shape:\n    - Title\n      - body text',
        });
      }
    }

    // Rule 2b — ledger / numbered layouts authored as an UNORDERED inline-bold
    // list. These want the numbered ledger shape (`1. Name` / `   - body`); the
    // `- **Title.** body` shape is wrong list type AND inherits the title bold.
    if (tokens.some((t) => ledgerOl.has(t))) {
      const offending = findInlineTitleBodyLine(slide);
      if (offending) {
        findings.push({
          slide: idx - fm + 1,
          rule: 'ledger-inline-title',
          severity: 'error',
          classToken: tokens.find((t) => ledgerOl.has(t)),
          line: offending.trim(),
          autofixable: !!autofixOrderedNestedTitle(offending),
          message: 'inline "- **Title.** body" on a ledger/numbered slide — this layout wants an ordered (numbered) list, not an unordered bold lead-in',
          fix: 'Use the numbered ledger shape:\n    1. Name\n       - body text',
        });
      }
    }

    // Rule 3 — bold inside an ordered-list statement.
    if (tokens.some((t) => statementOl.has(t))) {
      const offending = findBoldOrderedStatement(slide);
      if (offending) {
        findings.push({
          slide: idx - fm + 1,
          rule: 'statement-ol-bold',
          severity: 'error',
          classToken: tokens.find((t) => statementOl.has(t)),
          line: offending.trim(),
          message: 'a **bold** span inside an ordered-list statement splits the counter grid row',
          fix: 'Use a plain declarative statement (the layout already sets display weight).',
        });
      }
    }

    // Rule 4 — split right-panel item with no nested body. Skipped on the `qr`
    // variant: its right zone is a single payload bullet the qr transform
    // consumes into a QR figure, not a nested-body point.
    if (tokens.some((t) => splitSlot.has(t)) && !tokens.includes('qr')) {
      const offending = findSplitBodylessItem(slide);
      if (offending) {
        findings.push({
          slide: idx - fm + 1,
          rule: 'split-bodyless-item',
          severity: 'error',
          classToken: tokens.find((t) => splitSlot.has(t)),
          line: offending.trim(),
          autofixable: !!autofixNestedTitle(offending),
          message: 'a right-panel item with no nested body on a split slide — the title won\'t render bold (slotLabelLift needs a nested body to lift)',
          fix: 'Use the nested-list shape:\n    - Title\n      - body text',
        });
      }
    }

    // Rule 5 — h2-anchored split slide with no `## ` headline.
    if (isH2AnchoredSplit(tokens) && !/^##\s/m.test(slide)) {
      const isMetric = tokens.includes('metric');
      const cls = tokens.find((t) => t === 'split-panel' || t === 'split-compare');
      findings.push({
        slide: idx - fm + 1,
        rule: 'split-missing-headline',
        severity: 'warning',
        classToken: cls,
        line: m[0],
        message: `'${cls}' has no '## ' headline — the transform lifts the <h2> into the left panel, so the headline${isMetric ? ' / hero number' : ''} renders empty`,
        fix: isMetric
          ? 'Add the hero number as an h2: `## 114<em>%</em>` (wrap the unit in `<em>` to style it smaller; plain `*%*` is not CommonMark emphasis next to a digit).'
          : 'Add a `## Headline` line for the left panel.',
      });
    }

    // Rule 6 — split-panel `pullquote` variant with no blockquote pull-quote.
    if (tokens.includes('split-panel') && tokens.includes('pullquote') && !/^>\s/m.test(slide)) {
      findings.push({
        slide: idx - fm + 1,
        rule: 'split-statement-missing-quote',
        severity: 'warning',
        classToken: 'split-panel',
        line: m[0],
        message: 'split-panel `pullquote` has no `> ` blockquote — the left panel\'s pull-quote (the variant\'s whole point) renders empty',
        fix: 'Add the quotation as a blockquote: `> The quote worth half the slide.`',
      });
    }

    // Rule 7 — split-compare option count must be exactly two.
    if (tokens.includes('split-compare')) {
      const opts = slide.split('\n').filter((l) => /^([-*]|\d+\.)\s+\S/.test(l)).length;
      if (opts !== 2) {
        findings.push({
          slide: idx - fm + 1,
          rule: 'split-compare-option-count',
          severity: 'warning',
          classToken: 'split-compare',
          line: m[0],
          message: `split-compare expects exactly two options; found ${opts}. The layout always highlights the 2nd option as 'preferred' and assumes a two-up`,
          fix: 'Use exactly two top-level list items; the 2nd renders as the preferred/chosen option.',
        });
      }
    }

    // Rule 8 — kpi/stats number item with no nested label/detail.
    if (tokens.some((t) => numberSlot.has(t))) {
      const offending = findSplitBodylessItem(slide);
      if (offending) {
        findings.push({
          slide: idx - fm + 1,
          rule: 'number-slot-bodyless-item',
          severity: 'warning',
          classToken: tokens.find((t) => numberSlot.has(t)),
          line: offending.trim(),
          message: 'a kpi/stats item with no nested label — the number won\'t render in display type (the lift needs a nested body to fire)',
          fix: 'Use the nested shape:\n    1. 73%\n       - faster close',
        });
      }
    }

    // Rule — big-number hero authored as a heading. big-number's REQUIRED
    // `number` slot is the first top-level list item (ul > li:first-child); an
    // author who writes the number as a `#`/`##` heading (the intuitive move)
    // leaves that slot empty and the giant number renders blank — a silent
    // mis-render only a rendered look reveals. Warn.
    if (tokens.includes('big-number') && findBigNumberHeroInHeading(slide)) {
      findings.push({
        slide: idx - fm + 1,
        rule: 'big-number-hero-heading',
        severity: 'warning',
        classToken: 'big-number',
        line: m[0],
        message: 'the big-number hero must be a list item, not a heading — a `#`/`##` heading leaves the required number slot empty, so the giant number renders blank',
        fix: 'Author the number as the first list item (optionally with a nested caption):\n    - 92%\n      - of the audience remembers one number.',
      });
    }

    // Rule — a deck-wide finish covers a title/closing bookend. This used to report
    // a CONTRAST FAILURE, and it was right to: the bookends are inverse "moments"
    // (display-white text on `--surface-inverse`) and every finish layer mixed
    // toward `var(--bg)` — the LIGHT deck canvas — so the backdrop painted a light
    // field over a dark bookend and the display text disappeared into it.
    //
    // That is fixed at the source. The finish now composites against
    // `--fin-canvas`, which follows the slide's own surface (base.finish.css,
    // #1656), so a finish on a bookend is legible and this no longer describes a
    // defect.
    //
    // The rule STAYS as an editorial note, because the house pattern is still a
    // clean bookend — a title slide is the one moment in a deck that wants nothing
    // behind it. Downgraded `warning` → `info` and reworded to say exactly that: an
    // author who wants the finish there is not making a mistake, and a lint that
    // keeps calling a working slide broken is worse than no lint at all.
    if (deckHasFinish && tokens.some((t) => t === 'title' || t === 'closing')) {
      const hasFinishToken = tokens.some((t) => /^finish(-|$)/.test(t));
      if (!hasFinishToken) {
        const bookend = tokens.find((t) => t === 'title' || t === 'closing');
        findings.push({
          slide: idx - fm + 1,
          rule: 'bookend-finish-contrast',
          severity: 'info',
          classToken: bookend,
          line: m[0],
          message: `deck-wide \`finish: ${deckFinishName}\` also paints behind this ${bookend} bookend — the house pattern keeps a bookend's surface clean`,
          fix: 'Add `finish-none` to the bookend for the house look, or leave it as it is if you want the finish there — both read correctly.',
        });
      }
    }

    // Rule — an editorial modifier with no host on this layout (#1651).
    //
    // `insight-*` renames the Key Insight callout's eyebrow, and `no-note`
    // suppresses the below-note promotion. Both are UNIVERSAL modifiers, so they
    // are accepted on every slide and the manifest lists them among every
    // component's `effectiveVariants` — but they only DO anything where the block
    // they govern exists. The two blocks are opt-out, and a layout that claims the
    // trailing element for something else renders neither: a `quote` takes its
    // blockquote as the quotation and its trailing paragraph as the attribution.
    //
    // So `<!-- _class: quote insight-key -->` is silently inert. Nothing rendered,
    // nothing warned, and the manifest had positively advertised the modifier. That
    // silence is what #1651 asked us to close, and `authoring.blocks` in the
    // generated manifest is the same contract this reads.
    //
    // Scoped to an EXPLICIT modifier, deliberately. Flagging the blockquote or the
    // trailing paragraph itself would fire on every correctly-authored quote in the
    // corpus — that prose is the component's own anatomy, not a misplaced block.
    // A modifier the author typed is unambiguous intent that went nowhere.
    const componentToken = tokens.find((t) => vocab.names.has(t));
    if (componentToken) {
      const inert = [];
      if (tokens.some((t) => /^insight-/.test(t)) && !supportsBlock(componentToken, 'key-insight')) {
        inert.push({ token: tokens.find((t) => /^insight-/.test(t)), block: 'key-insight', what: 'the Key Insight callout' });
      }
      if (tokens.includes('no-note') && !supportsBlock(componentToken, 'below-note')) {
        inert.push({ token: 'no-note', block: 'below-note', what: 'the below-note footnote' });
      }
      for (const { token, block, what } of inert) {
        findings.push({
          slide: idx - fm + 1,
          rule: 'block-unsupported',
          severity: 'warning',
          classToken: token,
          line: m[0],
          message: `\`${token}\` does nothing on a ${componentToken} slide — ${componentToken} does not render ${what}`,
          fix: `${componentToken} claims that element for its own anatomy, so there is nothing for \`${token}\` to govern. Drop the modifier, or move the content to a layout that renders ${block} (see \`authoring.blocks\` in dist/docs/components.json).`,
        });
      }
    }

    // Rule 11 — focus directive grammar. A malformed `_focus` / `_focusStyle` /
    // `_focusSteps` silently no-ops at render, so flag the typo here.
    const fd = slide.match(FOCUS_DIRECTIVE);
    if (fd) {
      const err = focusSpecError(fd[1]);
      if (err) {
        findings.push({
          slide: idx - fm + 1,
          rule: 'focus-spec',
          severity: 'warning',
          line: fd[0],
          message: `_focus ${err}`,
          fix: '_focus: <axis> <ordinal> — e.g. row 4, item 3, col 5, cell 4,5, line 3-4.',
        });
      }
    }
    const fs = slide.match(FOCUS_STYLE_DIRECTIVE);
    if (fs && !FOCUS_STYLES.has(fs[1].trim())) {
      findings.push({
        slide: idx - fm + 1,
        rule: 'focus-style',
        severity: 'warning',
        line: fs[0],
        message: `_focusStyle '${fs[1].trim()}' is not spotlight | ring | list-fill`,
        fix: 'Use one of: spotlight, ring, list-fill (or omit for the content-aware default).',
      });
    }
    const fsteps = slide.match(FOCUS_STEPS_DIRECTIVE);
    if (fsteps) {
      for (const step of fsteps[1].split('|').map((s) => s.trim()).filter(Boolean)) {
        const err = focusSpecError(step);
        if (err) {
          findings.push({
            slide: idx - fm + 1,
            rule: 'focus-steps',
            severity: 'warning',
            line: fsteps[0],
            message: `_focusSteps step '${step}': ${err}`,
            fix: 'Each step is a _focus spec — e.g. row 1 | row 2 | row 3.',
          });
          break;
        }
      }
    }
  });

  // Rule 9 — map list items the basemap can't resolve (with a "did you mean").
  // Gated on injected map vocab so non-map decks pay nothing.
  if (vocab.mapRegions) findings.push(...findUnknownMapRegions(source, vocab.mapRegions));

  // Rule 10 — unrecognized deck-wide `finish:` (backdrop) register value. `finish:`
  // is a Lattice front-matter extension (none / atrium / …); an unknown value
  // resolves to no classes and silently renders no backdrop, so a typo
  // (`finish: atriumm`) would ship a backdrop-less deck with no error. Flag it.
  // Gated on injected finish vocab so it costs nothing when the names aren't
  // supplied (e.g. an older browser-build handoff). The sibling `style:` axis
  // (boardroom / sketch — the rendering mode) is validated the same way.
  if (vocab.finishNames) findings.push(...findUnknownFinish(source, vocab.finishNames));
  if (vocab.modeNames) findings.push(...findUnknownMode(source, vocab.modeNames));
  if (vocab.colorModeNames) findings.push(...findUnknownColorMode(source, vocab.colorModeNames));
  findings.push(...findDeprecatedClassColorMode(source));
  // An unterminated `<!--` — a privacy trap on export, not just a rendering one.
  findings.push(...findUnterminatedComment(source));
  // A deck-wide `class:` token the engine refuses outright — a component name, or a
  // color token superseded by `color-mode:`. Both are silent no-ops without this.
  findings.push(...findRefusedDeckClass(source));
  if (vocab.claimNames) findings.push(...findUnknownClaim(source, vocab.claimNames));
  // The deck-wide `stamp:` / `tone:` SHAPE registers (state-marker / tone-marker style).
  // Like finish/mode, an unknown value resolves to no style class and silently renders
  // the uniform default shape, so a typo would ship unnoticed. Gated on injected vocab.
  if (vocab.stampStyleNames) findings.push(...findUnknownStamp(source, vocab.stampStyleNames));
  if (vocab.toneStyleNames) findings.push(...findUnknownToneStyle(source, vocab.toneStyleNames));
  // The deck-wide `spectrum:` register (white-label brand bar). An unknown value resolves
  // to no class → the rainbow default ships silently, so flag a typo. Gated on injected vocab.
  if (vocab.spectrumNames) findings.push(...findUnknownSpectrum(source, vocab.spectrumNames));
  // The sibling `spectrum-edge:` (bar placement) + the `rule:` (heading underline) /
  // `eyebrow:` (kicker) accent finishes — each an unknown value silently renders the
  // default, so flag a typo. Gated on injected vocab.
  if (vocab.spectrumEdgeNames) findings.push(...findUnknownSpectrumEdge(source, vocab.spectrumEdgeNames));
  if (vocab.spectrumCardNames) findings.push(...findUnknownSpectrumCard(source, vocab.spectrumCardNames));
  if (vocab.spectrumCardEdgeNames) findings.push(...findUnknownSpectrumCardEdge(source, vocab.spectrumCardEdgeNames));
  if (vocab.spectrumTrimNames) findings.push(...findUnknownSpectrumTrim(source, vocab.spectrumTrimNames));
  if (vocab.ruleNames) findings.push(...findUnknownRule(source, vocab.ruleNames));
  if (vocab.eyebrowNames) findings.push(...findUnknownEyebrow(source, vocab.eyebrowNames));
  if (vocab.headlineNames) findings.push(...findUnknownHeadline(source, vocab.headlineNames));
  if (vocab.liftNames) findings.push(...findUnknownLift(source, vocab.liftNames));
  if (vocab.cornersNames) findings.push(...findUnknownCorners(source, vocab.cornersNames));
  // The deck-wide `pace:` register (presentation rhythm). An unknown value falls through to
  // the viewer's own preset, so the author's directorial choice silently does nothing — the
  // one register whose typo is invisible on the AUTHOR's machine and only wrong on someone
  // else's. Gated on injected vocab.
  if (vocab.paceNames) findings.push(...findUnknownPace(source, vocab.paceNames));
  // A leftover top-level `backdrop:` block is retired (backdrop is a baked finish layer
  // now) — flag it with the migration to `finish-override:`. Needs no vocab.
  findings.push(...findRetiredBackdrop(source));

  // A single-letter/digit `lexicon:` key mis-narrates the whole deck (it rewrites every
  // embedded occurrence, not just the standalone token). Warn. Self-contained (no vocab).
  findings.push(...findSingleLetterLexiconKeys(source));

  // A leftover `form: minimal` is retired — flag it with the migration to the rail
  // control (`class: no-progress`). Needs no vocab.
  findings.push(...findRetiredFormMinimal(source));
  findings.push(...findStrayOverflowMarker(source));

  // Rule 11 — unrecognized deck-wide `split:` mode value. `split:` is a Lattice
  // front-matter extension (rule / headings); an unknown value resolves to the
  // `rule` baseline, so a typo (`split: heading`) would silently keep requiring
  // `---` separators. Flag it. Gated on injected split vocab, like finish above.
  if (vocab.splitNames) findings.push(...findUnknownSplit(source, vocab.splitNames));

  // Preview `debug:` levers — a typo in a facet list falls back to the default
  // profile rather than erroring, so warn (fixed vocabulary; no injected vocab).
  findings.push(...findBadDebugFacets(source));

  // Rule 12 — gantt token + schedule validation. The gantt contract is a typed
  // nested list (2026-06-21-gantt-component-redesign.md): every trailing
  // inline-code token must be a `..` span, a status, `after:`, or `milestone`,
  // and dependencies/dates must be coherent. Self-contained (no injected vocab).
  findings.push(...findGanttIssues(source));

  // Rule 13 — `autosplit:` is RETIRED. Flag it rather than ignore it: silence would read
  // as "this still works", and a deck carrying `autosplit: off` would look opted-out while
  // the engine paginated it anyway. Universal rule, deck-level (front-matter only).
  findings.push(...findRetiredAutosplitDirective(source));

  // Rule 14 — `paginate: skip` / `hold` are Marp values Lattice downgrades to `false` in
  // silence. Same reasoning as rule 13: the deck renders, so nothing tells the author the
  // renumbering they asked for is not happening.
  findings.push(...findUnsupportedPaginateValues(source));

  return findings;
}

// The closed status vocabulary a gantt bar/milestone may carry (mirrors
// chart-family's KB_STATUS — kept here so lint stays require-free).
const GANTT_STATUS = Object.freeze(new Set([
  'on-track', 'done', 'live', 'at-risk', 'warn', 'blocked', 'fail',
  'pilot', 'decision', 'deferred',
]));
const GANTT_MONTHS_LINT = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const GANTT_MONTHS_FULL_LINT = ['january','february','march','april','may','june','july','august','september','october','november','december'];

// Parse one gantt time point → { kind, year|null, idx } | { kind:'date', day }
// | null. Compact mirror of chart-family.parseTimePoint, for validation only.
function ganttTimePoint(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  const d = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (d) {
    const y = +d[1], mo = +d[2] - 1, dd = +d[3];
    const t = Date.UTC(y, mo, dd);
    const dt = new Date(t);
    // Reject a date that didn't round-trip (2026-13-01 / 2026-02-30) — Date.UTC
    // rolls over rather than returning NaN. Mirrors chart-family.parseTimePoint.
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo || dt.getUTCDate() !== dd) return null;
    return { kind: 'date', day: Math.round(t / 86400000) };
  }
  const q = s.match(/^(?:(\d{4})\s*)?Q([1-4])$/i);
  if (q) return { kind: 'q', year: q[1] ? +q[1] : null, idx: +q[2] - 1 };
  // Month — exact 3-letter abbrev or full name only, never a prefix.
  const m = s.match(/^(?:(\d{4})\s*)?([A-Za-z]+)$/);
  if (m) {
    const w = m[2].toLowerCase();
    let mi = w.length === 3 ? GANTT_MONTHS_LINT.indexOf(w) : -1;
    if (mi < 0) mi = GANTT_MONTHS_FULL_LINT.indexOf(w);
    if (mi >= 0) return { kind: 'm', year: m[1] ? +m[1] : null, idx: mi };
  }
  return null;
}

// Resolve a point to [start, end] in the slide's unit (days in date mode,
// month-index in ordinal). Mirror of chart-family.ganttPointSpan.
function ganttSpanVals(pt, mode, baseYear) {
  const dayOf = (y, mo, dd) => Math.round(Date.UTC(y, mo, dd) / 86400000);
  if (mode === 'date') {
    if (pt.kind === 'date') return [pt.day, pt.day];
    const y = pt.year != null ? pt.year : baseYear;
    if (pt.kind === 'q') return [dayOf(y, pt.idx * 3, 1), dayOf(y, pt.idx * 3 + 3, 1)];
    return [dayOf(y, pt.idx, 1), dayOf(y, pt.idx + 1, 1)];
  }
  if (pt.kind === 'date') {
    const dt = new Date(pt.day * 86400000);
    const ym = dt.getUTCFullYear() * 12 + dt.getUTCMonth();
    return [ym, ym + 1];
  }
  const y = pt.year != null ? pt.year : baseYear;
  if (pt.kind === 'q') return [y * 12 + pt.idx * 3, y * 12 + pt.idx * 3 + 3];
  return [y * 12 + pt.idx, y * 12 + pt.idx + 1];
}

/**
 * Gantt validation across the deck. Per `gantt` slide, parse the nested list's
 * tasks and their trailing inline-code tokens, then flag: a retired delimiter
 * (`→ / – / ->` instead of `..`), an unrecognized token, a malformed/mixed time
 * span, a dangling `after:` (names no task on the slide), and an impossible
 * schedule (a task starting before something it depends on finishes).
 * Operates on raw markdown — require-free, browser-safe.
 */
function findGanttIssues(source) {
  const findings = [];
  const slides = splitTopLevel(source);
  const directives = slideClassDirectives(source);
  const fm = fmChunks(source);
  slides.forEach((slide, idx) => {
    const dir = directives[idx];
    if (!(dir?.payload || '').split(/\s+/).filter(Boolean).includes('gantt')) return;
    // The raw directive text, quoted back to the author in every finding below.
    const cm = [dir.text];
    const slideNo = idx - fm + 1;

    // ── Parse lanes/tasks from the markdown list ──
    const tasks = [];
    let lastTaskIndent = -1;
    for (const raw of slide.split('\n')) {
      const lm = raw.match(/^(\s*)[-*]\s+(.*\S)\s*$/);
      if (!lm) continue;
      const indent = lm[1].replace(/\t/g, '    ').length;
      if (indent < 2) { lastTaskIndent = -1; continue; } // lane line — label only, nothing to validate
      // A bullet nested UNDER a task (deeper than the task line) is that task's
      // reveal detail (prose — the popover / speaker-note payload), not a task.
      // Skip it even if the prose happens to end in inline code (`PR #481`), so
      // detail is never mis-validated as a gantt token. Mirrors the kernel's
      // splitDetail (first nested sublist = detail).
      if (lastTaskIndent >= 0 && indent > lastTaskIndent) continue;
      const content = lm[2];
      // Strip the TRAILING run of inline-code pills the same way the renderer
      // does (stripTrailingPills) — so inline code *inside* a label stays part
      // of the label and isn't mis-read as a token.
      let rest = content;
      const codeTokens = [];
      let mt;
      while ((mt = rest.match(/\s*`([^`]+)`\s*$/))) {
        codeTokens.unshift(mt[1].trim());
        rest = rest.slice(0, mt.index);
      }
      if (!codeTokens.length) continue; // a plain nested bullet, not a task pill
      const label = rest.trim();
      const task = { label, line: raw.trim(), span: null, afters: [], hasMilestone: false };
      for (const tok of codeTokens) {
        if (/^after\s*:/i.test(tok)) {
          task.afters.push(...tok.replace(/^after\s*:/i, '').split(',').map((a) => a.trim()).filter(Boolean));
          continue;
        }
        if (/^milestone$/i.test(tok)) { task.hasMilestone = true; continue; }
        if (GANTT_STATUS.has(tok.toLowerCase())) continue;
        // A retired delimiter — the #1 migration tripwire.
        if (/(?:→|–|—|->)/.test(tok) && !tok.includes('..')) {
          findings.push({
            slide: slideNo, rule: 'gantt-retired-delimiter', severity: 'error',
            classToken: 'gantt', line: raw.trim(),
            autofixable: !!autofixGanttDelimiter(raw),
            message: `gantt span \`${tok}\` uses a retired delimiter — the only span delimiter is now \`..\``,
            fix: `Write the span as \`${tok.replace(/\s*(?:→|–|—|->)\s*/, '..')}\` (e.g. \`Q1..Q2\` or \`2026-01-01..2026-03-15\`).`,
          });
          task.span = { bad: true };
          continue;
        }
        // A span (range or single point)?
        if (tok.includes('..')) {
          const parts = tok.split('..').map((p) => p.trim());
          const [a, b] = parts;
          const pa = parts.length === 2 ? ganttTimePoint(a) : null;
          const pb = parts.length === 2 ? ganttTimePoint(b) : null;
          if (!pa || !pb) {
            findings.push({
              slide: slideNo, rule: 'gantt-bad-span', severity: 'error',
              classToken: 'gantt', line: raw.trim(),
              message: `gantt span \`${tok}\` is not a valid time range — each side must be a date (2026-03-15), a quarter (Q1 / 2026 Q1), or a month (Jan)`,
              fix: 'Use two parseable time points around `..`, e.g. `Q1..Q3` or `Jan..Mar`.',
            });
            task.span = { bad: true };
          } else {
            task.span = { startPt: pa, endPt: pb };
          }
          continue;
        }
        const lone = ganttTimePoint(tok);
        if (lone) { task.span = { startPt: lone, endPt: lone, point: true }; continue; }
        // Anything else is an unrecognized token.
        findings.push({
          slide: slideNo, rule: 'gantt-unknown-token', severity: 'warning',
          classToken: 'gantt', line: raw.trim(),
          message: `gantt token \`${tok}\` is not recognized — expected a \`..\` span, a status, \`after: …\`, or \`milestone\``,
          fix: `Status must be one of: ${[...GANTT_STATUS].join(', ')}. A span is \`START..END\`; a single point is a milestone.`,
        });
      }
      lastTaskIndent = indent;   // record task depth so its detail bullets are skipped
      tasks.push(task);
    }
    if (!tasks.length) return;

    // ── Mode + base year for cross-task schedule checks ──
    const pts = [];
    for (const t of tasks) if (t.span?.startPt) { pts.push(t.span.startPt); if (t.span.endPt) pts.push(t.span.endPt); }
    // Fold the eyebrow window into mode detection too (the renderer does), so a
    // date-only window over ordinal tasks is caught as mixed. The eyebrow is a
    // non-bullet line of inline-code pills; the window pill contains `..`.
    for (const raw of slide.split('\n')) {
      if (/^\s*[-*]\s/.test(raw)) continue;          // skip list items
      for (const cm2 of raw.matchAll(/`([^`]+)`/g)) {
        const tok = cm2[1].trim();
        if (!tok.includes('..') || /^today\b/i.test(tok)) continue;
        const parts = tok.split('..').map((p) => p.trim());
        if (parts.length !== 2) continue;
        const wa = ganttTimePoint(parts[0]), wb = ganttTimePoint(parts[1]);
        if (wa && wb) { pts.push(wa, wb); }
      }
    }
    if (!pts.length) return;
    const hasDate = pts.some((p) => p.kind === 'date');
    const hasOrdinal = pts.some((p) => p.kind === 'q' || p.kind === 'm');
    if (hasDate && hasOrdinal) {
      findings.push({
        slide: slideNo, rule: 'gantt-mixed-time', severity: 'warning',
        classToken: 'gantt', line: cm[0],
        message: 'gantt mixes real dates with ordinal periods (Q/month) on one chart — they cannot share a continuous axis',
        fix: 'Use either ISO dates everywhere or ordinal periods everywhere, not both.',
      });
    }
    const mode = hasDate ? 'date' : 'ordinal';
    const years = pts.map((p) => p.year).filter((y) => y != null);
    const baseYear = years.length ? Math.min(...years) : (mode === 'date' ? 2000 : 0);
    const byLabel = new Map();
    for (const t of tasks) {
      if (!t.span?.startPt) continue;
      const [s] = ganttSpanVals(t.span.startPt, mode, baseYear);
      const e = t.span.point ? s : ganttSpanVals(t.span.endPt, mode, baseYear)[1];
      t._start = s; t._end = e;
      byLabel.set(t.label.toLowerCase(), t);
    }

    // ── Dependency checks: dangling ref + impossible schedule ──
    for (const t of tasks) {
      for (const dep of t.afters) {
        const pred = byLabel.get(dep.toLowerCase());
        if (!pred) {
          findings.push({
            slide: slideNo, rule: 'gantt-dangling-after', severity: 'error',
            classToken: 'gantt', line: t.line,
            message: `gantt task "${t.label}" depends on "${dep}" via \`after:\`, but no task named "${dep}" is on this slide`,
            fix: 'Reference a task by its exact visible label, or remove the `after:` token.',
          });
          continue;
        }
        // Flag an INVERTED dependency — a task that begins before its
        // prerequisite even starts. (A one-period boundary overlap, e.g.
        // `Q1..Q2` → `Q2..Q3`, is idiomatic phasing and deliberately allowed.)
        if (t._start != null && pred._start != null && t._start < pred._start) {
          findings.push({
            slide: slideNo, rule: 'gantt-inverted-dependency', severity: 'warning',
            classToken: 'gantt', line: t.line,
            message: `gantt task "${t.label}" begins before its dependency "${pred.label}" even starts — the \`after:\` is inverted`,
            fix: `Schedule "${t.label}" to start at or after "${pred.label}", or fix the \`after:\` direction.`,
          });
        }
      }
    }
  });
  return findings;
}

/**
 * Front-matter `finish:` register validation. Reads the value from the leading
 * `---`-fenced front-matter block only (not body code spans), and returns a
 * single warning finding when it isn't one of the known register names. The
 * canonical name list is injected (lib/core/resolve-finish.js `FINISH_NAMES`),
 * keeping this core free of any require.
 */
function findUnknownFinish(source, finishNames) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  const fmFinish = fmBlock[1].match(/^\s*finish:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  if (!fmFinish) return [];
  const value = fmFinish[1].trim();
  const known = new Set([...finishNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [withTokenSuggestion({
    slide: 0,
    rule: 'unknown-finish',
    severity: 'warning',
    classToken: value,
    line: fmFinish[0].trim(),
    message: `'${value}' is not a known finish register — the deck would silently render no backdrop (was 'sketch'/'boardroom' a finish? those moved to \`mode:\`)`,
    fix: `Set front-matter \`finish:\` to one of: ${[...finishNames].join(', ')}.`,
  }, finishNames)];
}

/**
 * Front-matter `style:` register validation — the sibling of findUnknownFinish for
 * the rendering-mode axis (boardroom / sketch). Reads the value from the leading
 * `---`-fenced front-matter block only and warns when it isn't a known register name.
 * The canonical list is injected (lib/core/resolve-mode.js `MODE_NAMES`).
 */
function findUnknownMode(source, modeNames) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  const fmMode = fmBlock[1].match(/^\s*mode:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  if (!fmMode) return [];
  const value = fmMode[1].trim();
  const known = new Set([...modeNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [withTokenSuggestion({
    slide: 0,
    rule: 'unknown-mode',
    severity: 'warning',
    classToken: value,
    line: fmMode[0].trim(),
    message: `'${value}' is not a known mode register — the deck would silently render the boardroom baseline`,
    fix: `Set front-matter \`mode:\` to one of: ${[...modeNames].join(', ')}.`,
  }, modeNames)];
}

// The `pace:` register's names, for the linter. A SECOND copy of the list in
// `lib/core/resolve-pace.mjs`, and it has to be: that module is ESM (the docs production build
// is Rollup, which will not resolve named exports off a CommonJS file outside its root), and
// this one is CommonJS and browser-safe by contract. Neither can import the other synchronously.
// `test/unit/core/pace-names.test.js` pins every copy against every other, which is the seam
// that stops them drifting.
const PACE_NAMES = ['brisk', 'natural', 'deliberate'];

/**
 * Front-matter `pace:` register validation — the sibling of findUnknownMode for the
 * presentation-rhythm axis (brisk / natural / deliberate). Reads the value from the leading
 * `---`-fenced block only. The canonical list is injected (lib/core/resolve-pace.mjs
 * `PACE_NAMES`).
 */
function findUnknownPace(source, paceNames) {
  // CHARACTER-FOR-CHARACTER the resolver's parse (`paceLine` in lib/core/resolve-pace.mjs),
  // because a rule that reads the register differently from the code that CONSUMES it reports
  // on a different deck than the one that will play. The first version of this rule matched
  // only a clean bare word — so every value the resolver rejects for a trailing character
  // (`pace: brisk.`, `pace: delibrate # weighty deck`, a BOM'd deck) simply failed to match and
  // produced no finding at all: silence on exactly the typos it exists to catch. `pace-parse-parity`
  // in test/unit/core/pace-names.test.js drives the same table through both and pins them equal.
  const fmBlock = source.match(/^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (!fmBlock) return [];
  const fmPace = fmBlock[1].match(/^[ \t]*pace:[ \t]*(.*)$/m);
  if (!fmPace) return [];
  // The shared scalar rule. `pace:` stripped a trailing comment before any sibling
  // register did (see resolve-pace.mjs); that behaviour is now the repo-wide rule
  // rather than this key's exception, so this reads through it like every other.
  const value = frontMatterScalar(fmPace[1]);
  // An EMPTY value is `pace:` with nothing after it — a different mistake (an unfinished key,
  // or a YAML block the author meant to nest), and naming it "'' is not a known pace" reads as
  // noise. The resolver falls through to the workspace default either way.
  if (!value) return [];
  const known = new Set([...paceNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [withTokenSuggestion({
    slide: 0,
    rule: 'unknown-pace',
    severity: 'warning',
    classToken: value,
    line: fmPace[0].trim(),
    message: `'${value}' is not a known pace register — the deck would fall back to whatever pace the VIEWER's browser holds`,
    fix: `Set front-matter \`pace:\` to one of: ${[...paceNames].join(', ')}.`,
  }, paceNames)];
}

/**
 * Front-matter `color-mode:` register validation — the sibling of findUnknownMode for
 * the COLOR-mode axis. Warns when the value isn't a known register name
 * (light / dark / system / inherited), so a typo (`color-mode: darrk`) surfaces
 * instead of silently rendering the theme default. Names injected from
 * lib/core/resolve-color-mode.js `COLOR_MODE_NAMES`, keeping this core require-free.
 *
 * CHARACTER-FOR-CHARACTER the resolver's parse (`deckColorModeToken` →
 * `topLevelFrontMatterValue` → `colorModeClass`), for the same reason `findUnknownPace`
 * is: a rule that reads the register differently from the code that CONSUMES it
 * reports on a different deck than the one that will render. The first version
 * captured only `[A-Za-z0-9_-]+` to end-of-line, so `color-mode: light  # migrated
 * 2026-08` — which the resolver rejects, falling the deck through to the theme
 * default — simply failed to match and produced no finding at all: silence on
 * exactly the input #1416 was written around. The resolver does NOT strip a
 * trailing comment, so neither does this; the value it names is the value the
 * engine saw. COLUMN 0 for the same reason the resolver is: an indented
 * `color-mode:` is a nested key or a `style: |` block-scalar line, not the deck
 * register, and warning about one would report on a key nothing reads.
 */
function findUnknownColorMode(source, colorModeNames) {
  const fmBlock = source.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (!fmBlock) return [];
  const fm = fmBlock[1].match(/^color-mode:[ \t]*(.*)$/m);
  if (!fm) return [];
  // Through the SHARED scalar rule, which is what keeps this rule and
  // `deckColorModeToken` answering identically — the contract
  // `color-mode-parse-parity` pins. A trailing YAML comment is stripped here
  // because it is stripped there; before the two agreed by both being wrong.
  const value = frontMatterScalar(fm[1]);
  // An EMPTY value is `color-mode:` with nothing after it — an unfinished key rather
  // than a typo, and `'' is not a known color-mode` reads as noise. Same call as pace.
  if (!value) return [];
  const known = new Set([...colorModeNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [withTokenSuggestion({
    slide: 0,
    rule: 'unknown-color-mode',
    severity: 'warning',
    classToken: value,
    line: fm[0].trim(),
    message: `'${value}' is not a known color-mode — the deck would silently render the theme default`,
    fix: `Set front-matter \`color-mode:\` to one of: ${[...colorModeNames].join(', ')}.`,
  }, colorModeNames)];
}

/**
 * Deprecation nudge: a deck-wide `class: dark` / `class: light` is the LEGACY color
 * axis — still honored, but the first-class `color-mode:` key is the documented way
 * (and the only one with `system` / `inherited`). Info-severity, and only for the deck
 * that has NOT migrated: once a `color-mode:` key is present the alias is REFUSED
 * rather than merely redundant, which is a behavior change and so a warning —
 * `findRefusedDeckClass` below owns that case.
 */
function findDeprecatedClassColorMode(source) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  const body = fmBlock[1];
  if (/^\s*color-mode:\s*\S/m.test(body)) return [];
  const cm = body.match(/^\s*class:\s*["']?([^"'\n]*)["']?\s*$/m);
  if (!cm) return [];
  const token = cm[1].split(/\s+/).filter(Boolean).find((t) => t.toLowerCase() === 'dark' || t.toLowerCase() === 'light');
  if (!token) return [];
  const t = token.toLowerCase();
  return [{
    slide: 0,
    rule: 'deprecated-class-color-mode',
    severity: 'info',
    classToken: token,
    line: cm[0].trim(),
    message: `\`class: ${t}\` is the legacy color axis — prefer the first-class \`color-mode: ${t}\` (which also offers system / inherited)`,
    fix: `Replace the deck-wide \`class: ${t}\` with \`color-mode: ${t}\`.`,
  }];
}

/**
 * A token in the deck-wide `class:` register that the engine REFUSES — it is not
 * stamped on any section, so the author's instruction does nothing.
 *
 * Two reasons, and each is a silent no-op without this rule:
 *
 *   COMPONENT — `class: kpi` reads as "every slide in this deck is a KPI slide".
 *     The register is appended over a slide's own `_class:`, so it collides rather
 *     than composes: `_class: cards-grid` on a `class: kpi` deck used to put two
 *     components on one section and let CSS source order pick. Refused at the
 *     boundary now (lib/core/deck-class-register.js).
 *   COLOR-MODE — a color-axis token superseded by the `color-mode:` key. Not merely
 *     redundant: the token is DROPPED, so a half-migrated `color-mode: light` +
 *     `class: print` deck renders a light canvas, not a paper one.
 *
 * The vocabulary is INJECTED (HARD RULE #7 — this core stays pure and fs-free), and
 * the two sources cannot drift: `vocab.names` is built from the live component
 * manifests, and the kernel's `isComponentToken` reads the generated stage catalog,
 * which `resolve-component.test.js` pins 1:1 against those same manifests.
 */
function findRefusedDeckClass(source) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  const body = fmBlock[1];
  // COLUMN 0, matching the kernel below — this match is only used to QUOTE the
  // offending line back to the author, and quoting a nested key while the kernel
  // refused a token off the top-level one points the fix at the wrong line.
  //
  // GREEDY TO END OF LINE, and no capture: the value is the kernel's business, not
  // this line's. The `["']?([^"'\n]*)["']?[ \t]*$` it used to carry was ambiguous —
  // `[^"'\n]*` matches spaces and tabs, so does the trailing `[ \t]*`, and the
  // optional quotes let the engine split a run of trailing whitespace between them
  // every possible way before failing. That is a quadratic on author-controlled
  // deck source (`js/polynomial-redos`). `.*` cannot fail, so it never backtracks.
  const cm = body.match(/^class:.*$/m);
  if (!cm) return [];
  // THE KERNEL DECIDES, not a copy of its rule. A first cut of this function
  // re-spelled both halves — a `componentNames` set injected from the vocabulary
  // AND its own `^\s*color-mode:` regex. The second of those was a FOURTH reader
  // of the key, landed in the same change whose whole point was that there is one;
  // where two readers disagree the author gets a dropped token and no warning, or
  // a warning for a token that is not dropped. `deckClassRefusalsFromFrontMatter`
  // is the same call `deckClassPropagate` makes, so the message and the render
  // cannot come apart.
  const mode = topLevelFrontMatterValue(body, 'color-mode');
  return deckClassRefusalsFromFrontMatter(body).map(({ token, reason }) => ({
    slide: 0,
    rule: 'deck-wide-component',
    severity: 'warning',
    classToken: token,
    line: cm[0].trim(),
    message: reason === 'component'
      ? `\`class: ${token}\` names a COMPONENT deck-wide — every slide would be a ${token} slide. It is ignored.`
      : `\`class: ${token}\` is superseded by \`color-mode: ${String(mode || '').trim()}\` — the key wins, so this token is dropped, not merged`,
    fix: reason === 'component'
      ? `Name the layout per slide with \`<!-- _class: ${token} -->\`, or once for a run with \`<!-- class: ${token} -->\`.`
      : `Remove \`${token}\` from the deck-wide \`class:\` — \`color-mode:\` already governs the color axis.`,
  }));
}

/**
 * Front-matter `claim:` value validation. Mirrors findUnknownMode: reads the
 * value from the leading `---` block and warns when it isn't a known claim
 * register (framed / quiet / hero / bleed), so a typo (`claim: heo`) surfaces
 * instead of silently mapping to the framed baseline. Names injected from
 * lib/core/resolve-claim.js `CLAIM_NAMES`, keeping this core require-free.
 */
function findUnknownClaim(source, claimNames) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  const fmClaim = fmBlock[1].match(/^\s*claim:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  if (!fmClaim) return [];
  const value = fmClaim[1].trim();
  const known = new Set([...claimNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [withTokenSuggestion({
    slide: 0,
    rule: 'unknown-claim',
    severity: 'warning',
    classToken: value,
    line: fmClaim[0].trim(),
    message: `'${value}' is not a known claim register — the deck would silently render the framed baseline`,
    fix: `Set front-matter \`claim:\` to one of: ${[...claimNames].join(', ')}.`,
  }, claimNames)];
}

/**
 * Front-matter `stamp:` register validation — the sibling of findUnknownFinish for the
 * STATE-MARKER SHAPE axis (tab / seal / notch / …). Reads the value from the leading
 * `---`-fenced block only and warns when it isn't a known style name, so a typo
 * (`stamp: sael`) surfaces instead of silently rendering the uniform default shape.
 * The canonical list is injected (lib/core/resolve-stamp.js `STAMP_STYLE_NAMES`).
 */
function findUnknownStamp(source, stampStyleNames) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  const fmStamp = fmBlock[1].match(/^\s*stamp:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  if (!fmStamp) return [];
  const value = fmStamp[1].trim();
  const known = new Set([...stampStyleNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [withTokenSuggestion({
    slide: 0,
    rule: 'unknown-stamp',
    severity: 'warning',
    classToken: value,
    line: fmStamp[0].trim(),
    message: `'${value}' is not a known stamp style — the deck would silently render the uniform default (tab) shape`,
    fix: `Set front-matter \`stamp:\` to one of: ${[...stampStyleNames].join(', ')}.`,
  }, stampStyleNames)];
}

/**
 * Front-matter `tone:` register validation — the sibling of findUnknownStamp for the
 * TONE-MARKER SHAPE axis (rail / edge / glow). Warns when the value isn't a known tone
 * style, so a typo silently falling back to the default rail surfaces. The canonical
 * list is injected (lib/core/resolve-tone-style.js `TONE_STYLE_NAMES`).
 */
function findUnknownToneStyle(source, toneStyleNames) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  const fmTone = fmBlock[1].match(/^\s*tone:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  if (!fmTone) return [];
  const value = fmTone[1].trim();
  const known = new Set([...toneStyleNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [withTokenSuggestion({
    slide: 0,
    rule: 'unknown-tone',
    severity: 'warning',
    classToken: value,
    line: fmTone[0].trim(),
    message: `'${value}' is not a known tone style — the deck would silently render the default rail shape`,
    fix: `Set front-matter \`tone:\` to one of: ${[...toneStyleNames].join(', ')}.`,
  }, toneStyleNames)];
}

/**
 * Front-matter `spectrum:` register validation — the white-label brand-bar control
 * (on / off / solid). Warns when the value isn't recognized, so a typo silently shipping
 * the rainbow default surfaces. The canonical list is injected
 * (lib/core/resolve-spectrum.js `SPECTRUM_NAMES`), keeping this core require-free.
 */
function findUnknownSpectrum(source, spectrumNames) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  const fmSpectrum = fmBlock[1].match(/^\s*spectrum:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  if (!fmSpectrum) return [];
  const value = fmSpectrum[1].trim();
  const known = new Set([...spectrumNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [withTokenSuggestion({
    slide: 0,
    rule: 'unknown-spectrum',
    severity: 'warning',
    classToken: value,
    line: fmSpectrum[0].trim(),
    message: `'${value}' is not a known spectrum value — the deck would silently render the rainbow default`,
    fix: `Set front-matter \`spectrum:\` to one of: ${[...spectrumNames].join(', ')}.`,
  }, spectrumNames)];
}

/**
 * Front-matter `spectrum-edge:` register validation — the section-edge bar PLACEMENT
 * (top / left / right / bottom / off). Warns on an unrecognized value, which silently
 * renders the top-bar default. Canonical list injected (lib/core/resolve-spectrum.js
 * `SPECTRUM_EDGE_NAMES`), keeping this core require-free.
 */
function findUnknownSpectrumEdge(source, spectrumEdgeNames) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  const fmEdge = fmBlock[1].match(/^\s*spectrum-edge:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  if (!fmEdge) return [];
  const value = fmEdge[1].trim();
  const known = new Set([...spectrumEdgeNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [withTokenSuggestion({
    slide: 0,
    rule: 'unknown-spectrum-edge',
    severity: 'warning',
    classToken: value,
    line: fmEdge[0].trim(),
    message: `'${value}' is not a known spectrum-edge value — the deck would silently render the top bar`,
    fix: `Set front-matter \`spectrum-edge:\` to one of: ${[...spectrumEdgeNames].join(', ')}.`,
  }, spectrumEdgeNames)];
}

/**
 * Front-matter `spectrum-card:` register validation — the card-rail STYLE
 * (off / auto / solid / duo / mono / rainbow). Warns on an unrecognized value, which silently
 * renders the OFF default. Canonical list injected (lib/core/resolve-spectrum.js
 * `SPECTRUM_CARD_NAMES`), keeping this core require-free.
 */
function findUnknownSpectrumCard(source, spectrumCardNames) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  const fmCard = fmBlock[1].match(/^\s*spectrum-card:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  if (!fmCard) return [];
  const value = fmCard[1].trim();
  const known = new Set([...spectrumCardNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [withTokenSuggestion({
    slide: 0,
    rule: 'unknown-spectrum-card',
    severity: 'warning',
    classToken: value,
    line: fmCard[0].trim(),
    message: `'${value}' is not a known spectrum-card value — the deck would silently render no card rail`,
    fix: `Set front-matter \`spectrum-card:\` to one of: ${[...spectrumCardNames].join(', ')}.`,
  }, spectrumCardNames)];
}

/**
 * Front-matter `spectrum-card-edge:` register validation — the card rail PLACEMENT
 * (left / top / right / bottom). Warns on an unrecognized value, which silently renders the
 * `left` default. Canonical list injected (lib/core/resolve-spectrum.js
 * `SPECTRUM_CARD_EDGE_NAMES`), keeping this core require-free.
 */
function findUnknownSpectrumCardEdge(source, spectrumCardEdgeNames) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  const fmEdge = fmBlock[1].match(/^\s*spectrum-card-edge:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  if (!fmEdge) return [];
  const value = fmEdge[1].trim();
  const known = new Set([...spectrumCardEdgeNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [withTokenSuggestion({
    slide: 0,
    rule: 'unknown-spectrum-card-edge',
    severity: 'warning',
    classToken: value,
    line: fmEdge[0].trim(),
    message: `'${value}' is not a known spectrum-card-edge value — the deck would silently render the left rail`,
    fix: `Set front-matter \`spectrum-card-edge:\` to one of: ${[...spectrumCardEdgeNames].join(', ')}.`,
  }, spectrumCardEdgeNames)];
}

/**
 * Front-matter `spectrum-trim:` register validation — the opt-in that flows the spectrum onto
 * the structural accents (on / off). Warns on an unrecognized value, which silently renders the
 * quiet OFF default. Canonical list injected (lib/core/resolve-spectrum.js `SPECTRUM_TRIM_NAMES`),
 * keeping this core require-free.
 */
function findUnknownSpectrumTrim(source, spectrumTrimNames) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  const fmTrim = fmBlock[1].match(/^\s*spectrum-trim:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  if (!fmTrim) return [];
  const value = fmTrim[1].trim();
  const known = new Set([...spectrumTrimNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [withTokenSuggestion({
    slide: 0,
    rule: 'unknown-spectrum-trim',
    severity: 'warning',
    classToken: value,
    line: fmTrim[0].trim(),
    message: `'${value}' is not a known spectrum-trim value — the deck would silently leave the structural accents quiet`,
    fix: `Set front-matter \`spectrum-trim:\` to one of: ${[...spectrumTrimNames].join(', ')}.`,
  }, spectrumTrimNames)];
}

/**
 * Front-matter `rule:` register validation — the HEADING RULE accent finish
 * (auto / full / short / accent / none). Warns on an unrecognized value, which silently
 * renders the `auto` default. Canonical list injected (lib/core/resolve-rule.js
 * `RULE_NAMES`), keeping this core require-free.
 */
function findUnknownRule(source, ruleNames) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  const fmRule = fmBlock[1].match(/^\s*rule:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  if (!fmRule) return [];
  const value = fmRule[1].trim();
  const known = new Set([...ruleNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [withTokenSuggestion({
    slide: 0,
    rule: 'unknown-rule',
    severity: 'warning',
    classToken: value,
    line: fmRule[0].trim(),
    message: `'${value}' is not a known rule value — the deck would silently render the default heading underline`,
    fix: `Set front-matter \`rule:\` to one of: ${[...ruleNames].join(', ')}.`,
  }, ruleNames)];
}

/**
 * Front-matter `eyebrow:` register validation — the EYEBROW accent finish
 * (plain / dot / bar / arrow / underline). Warns on an unrecognized value, which silently
 * renders the bare `plain` default. Canonical list injected (lib/core/resolve-eyebrow.js
 * `EYEBROW_NAMES`), keeping this core require-free.
 */
function findUnknownEyebrow(source, eyebrowNames) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  const fmEyebrow = fmBlock[1].match(/^\s*eyebrow:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  if (!fmEyebrow) return [];
  const value = fmEyebrow[1].trim();
  const known = new Set([...eyebrowNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [withTokenSuggestion({
    slide: 0,
    rule: 'unknown-eyebrow',
    severity: 'warning',
    classToken: value,
    line: fmEyebrow[0].trim(),
    message: `'${value}' is not a known eyebrow value — the deck would silently render the bare label`,
    fix: `Set front-matter \`eyebrow:\` to one of: ${[...eyebrowNames].join(', ')}.`,
  }, eyebrowNames)];
}

/**
 * Front-matter `headline:` register validation — the HEADLINE ALIGNMENT register
 * (auto / left / center / right). Warns on an unrecognized value, which silently keeps the
 * component's baked alignment (the `auto` default). Canonical list injected
 * (lib/core/resolve-headline.js `HEADLINE_NAMES`), keeping this core require-free.
 */
function findUnknownHeadline(source, headlineNames) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  const fmHeadline = fmBlock[1].match(/^\s*headline:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  if (!fmHeadline) return [];
  const value = fmHeadline[1].trim();
  const known = new Set([...headlineNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [withTokenSuggestion({
    slide: 0,
    rule: 'unknown-headline',
    severity: 'warning',
    classToken: value,
    line: fmHeadline[0].trim(),
    message: `'${value}' is not a known headline value — the deck would silently keep each component's baked alignment`,
    fix: `Set front-matter \`headline:\` to one of: ${[...headlineNames].join(', ')}.`,
  }, headlineNames)];
}

/**
 * Front-matter `corners:` register validation — square / rounded. Warns when the value
 * isn't recognized, so a typo silently shipping the square default surfaces.
 *
 * `corners: round` is the case this exists for. It is the more natural English word and so
 * the likeliest thing an author writes, it resolves to nothing, and the deck then renders
 * square with no signal anywhere — the register's own kernel maps every unknown value to
 * the baseline by design. Canonical list injected (lib/core/resolve-corners.js
 * `CORNERS_NAMES`), keeping this core require-free.
 */
function findUnknownCorners(source, cornersNames) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  const fmCorners = fmBlock[1].match(/^\s*corners:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  if (!fmCorners) return [];
  const value = fmCorners[1].trim();
  const known = new Set([...cornersNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [{
    slide: 0,
    rule: 'unknown-corners',
    severity: 'warning',
    classToken: value,
    line: fmCorners[0].trim(),
    message: `'${value}' is not a known corners value — the deck would silently render square`,
    fix: `Set front-matter \`corners:\` to one of: ${[...cornersNames].join(', ')}.`,
  }];
}

/**
 * Front-matter `lift:` register validation — the opt-in card-elevation control (on / off).
 * Warns when the value isn't recognized, so a typo (`lift: onn`) silently shipping the flat
 * default surfaces. Canonical list injected (lib/core/resolve-lift.js `LIFT_NAMES`), keeping
 * this core require-free.
 */
function findUnknownLift(source, liftNames) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  const fmLift = fmBlock[1].match(/^\s*lift:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  if (!fmLift) return [];
  const value = fmLift[1].trim();
  const known = new Set([...liftNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [withTokenSuggestion({
    slide: 0,
    rule: 'unknown-lift',
    severity: 'warning',
    classToken: value,
    line: fmLift[0].trim(),
    message: `'${value}' is not a known lift value — the deck would silently render flat`,
    fix: `Set front-matter \`lift:\` to one of: ${[...liftNames].join(', ')}.`,
  }, liftNames)];
}

/**
 * Migration warning: a TOP-LEVEL `backdrop:` front-matter block is RETIRED. Backdrop is
 * a baked finish layer now (strength / clearance ride the finish's generated CSS), and
 * the deck author tunes it through the `finish-override:` map — never a top-level
 * `backdrop:`, which silently no-ops. A `backdrop:` NESTED under `finish-override:` is
 * indented, so `^backdrop:` (column 0) never matches it. One finding per deck.
 */
function findRetiredBackdrop(source) {
  const fmBlock = String(source || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  if (!/^backdrop:\s*$/m.test(fmBlock[1])) return [];
  return [{
    slide: 0, rule: 'retired-backdrop-key', severity: 'warning', classToken: 'backdrop', line: 'backdrop:',
    message: 'top-level `backdrop:` is retired — backdrop is a baked finish layer now, so this block silently no-ops',
    fix: 'Bake the backdrop into the finish in Fabricate, then tune it under `finish-override:` (e.g. `finish-override:` → `backdrop:` → `strength: 0.4`).',
  }];
}

/**
 * Migration warning: the deck-wide `form: minimal` toggle is RETIRED (2026-07-03). It
 * only ever added `no-progress` (the "form, no rail" look), which is now the explicit
 * `no-progress` chrome control — deck-wide via `class: no-progress`, or per-slide. A
 * lingering `form: minimal` silently resolves to `standard` (the rail comes back), so
 * flag it. One finding per deck; `^form:` (column 0) matches the flat deck key only.
 */
function findRetiredFormMinimal(source) {
  const fmBlock = String(source || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  // Case-insensitive to match readFormMode (which lowercases the value), so
  // `form: Minimal` earns the migration warning too.
  if (!/^form:\s*["']?minimal["']?\s*$/im.test(fmBlock[1])) return [];
  return [{
    slide: 0, rule: 'retired-form-minimal', severity: 'warning', classToken: 'form', line: 'form: minimal',
    message: '`form: minimal` is retired — it resolves to `standard` now (the progress rail returns)',
    fix: 'Drop the `form: minimal` key (Form is on by default) and hide just the rail with the `no-progress` chrome control — deck-wide `class: no-progress`, or per-slide `no-progress`.',
  }];
}

/**
 * Two shapes of `overflow-marker` that a deck should not carry, and neither of
 * which does what the author would expect.
 *
 * (a) A FRONT-MATTER key. It shipped as a deck register for one commit and moved to
 *     an export setting: the level is a property of the render target, not an
 *     authoring fact (engineering/decisions/2026-07-30-overflow-marker-register.md).
 *     Nothing reads the key any more, so a lingering one is silently inert — and an
 *     exported bundle briefly carried it, so a recipient or an author following an
 *     older doc can reasonably have one.
 *
 * (b) A planted EXPORT-SETTINGS BLOCK in the body. This is the shape that used to
 *     change behavior, which is why it is worth more than the key: the block is a
 *     producer's record of ONE export, so a hand-copied one in a source deck asserts
 *     a choice nobody made for this deck. Lattice's own render paths now strip it
 *     (lib/engine/index.js), so it is inert here too — but it will survive into a
 *     Marp bundle built from this source, where marp-cli's browser DOES read it.
 *
 * Both are warnings, not errors: neither breaks a render, and the fix is a deletion.
 */
function findStrayOverflowMarker(source) {
  const src = String(source || '');
  const findings = [];
  const fmBlock = src.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (fmBlock && /^overflow-marker:/m.test(fmBlock[1])) {
    findings.push({
      slide: 0, rule: 'stray-overflow-marker', severity: 'warning', classToken: 'overflow-marker',
      line: 'overflow-marker:',
      message: '`overflow-marker:` is not a deck key — it is an export setting, and this line does nothing',
      fix: `Drop the key. Choose the level when you export: \`--overflow-marker=${OVERFLOW_MARKER_LEVELS.join('|')}\` on tools/export-marp.js (or \`LATTICE_OVERFLOW_MARKER\` for every export from this checkout; the Studio has a per-export step and a workspace default).`,
    });
  }
  if (src.includes(`<script type="${EXPORT_SETTINGS_TYPE}">`)) {
    findings.push({
      slide: 0, rule: 'stray-export-settings', severity: 'warning', classToken: 'overflow-marker',
      line: `<script type="${EXPORT_SETTINGS_TYPE}">`,
      message: 'this deck carries an EXPORT-SETTINGS block — a record of some other export, not a setting for this deck',
      fix: 'Delete the block. Lattice strips it when rendering, but it survives into a Marp bundle built from this source, where it silently decides that bundle\'s overflow marker. It is generated by an export; a source deck should never contain one.',
    });
  }
  return findings;
}

/**
 * Front-matter `split:` mode validation. Mirrors findUnknownFinish: reads the
 * value from the leading `---`-fenced block only and warns when it isn't a known
 * mode, so a typo (`split: heading`) surfaces instead of silently falling back
 * to the `rule` baseline. The canonical name list is injected
 * (lib/core/resolve-split.js `SPLIT_NAMES`), keeping this core require-free.
 */
function findUnknownSplit(source, splitNames) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  const fmSplit = fmBlock[1].match(/^\s*split:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  if (!fmSplit) return [];
  const value = fmSplit[1].trim();
  const known = new Set([...splitNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [withTokenSuggestion({
    slide: 0,
    rule: 'unknown-split',
    severity: 'warning',
    classToken: value,
    line: fmSplit[0].trim(),
    message: `'${value}' is not a known split mode — the deck would silently fall back to 'rule' (split on ---)`,
    fix: `Set front-matter \`split:\` to one of: ${[...splitNames].join(', ')}.`,
  }, splitNames)];
}

// Front-matter `debug:` (and per-slide `<!-- _debug: … -->`) facet validation. The
// value is a profile keyword (on/off/all/…) OR a space/comma list of "levers"; an
// unknown token still renders (the overlay falls back to the default profile), so a
// typo like `debug: sixe` warns instead of silently doing the wrong thing. The
// vocabulary mirrors docs/src/playground/debug-overlay.js (FACETS + the on/off set);
// kept literal here so lint-core stays require-free
// (engineering/decisions/2026-07-01-debug-bounding-boxes.md).
// The `debug:` vocabulary (mirrors docs/src/playground/debug-overlay.js): ONE name per
// concept, no aliases — `off`, the reveal modes `on-hover` / `on-always`, and the
// optional `verbose` detail. There is deliberately NO bare `on` — a deck that still
// says `debug: on` (or a typo) warns and falls back to on-hover.
const DEBUG_VALID = new Set(['off', 'on-hover', 'on-always', 'verbose']);

function findBadDebugFacets(source) {
  const out = [];
  const seen = new Map(); // value → the raw directive line, for the message
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (fmBlock) {
    const m = fmBlock[1].match(/^\s*debug:\s*(.*)$/m);
    if (m) seen.set(m[1], m[0].trim());
  }
  for (const c of source.matchAll(/<!--\s*_?debug\s*:\s*([^>]*?)\s*-->/g)) seen.set(c[1], c[0].trim());
  for (const [rawValue, line] of seen) {
    const value = rawValue.trim().replace(/^["']|["']$/g, '');
    if (value === '') continue; // a bare flag → on-hover, always valid
    const bad = value.toLowerCase().split(/[\s,]+/).filter(Boolean).filter((t) => !DEBUG_VALID.has(t));
    for (const token of bad) {
      out.push({
        slide: 0,
        rule: 'unknown-debug-facet',
        severity: 'warning',
        classToken: token,
        line,
        message: `'${token}' is not a known debug value — the overlay falls back to on-hover`,
        fix: 'Use `debug: on-hover` or `debug: on-always` (optionally `+ verbose`), or `off`.',
      });
    }
  }
  return out;
}

// A single-CODE-POINT letter or digit — the read-aloud footgun. The Speech Symbol Commons
// substitutes a lexicon override per code point in EVERY language (the per-glyph loop isn't
// gated on English), so a one-character letter/digit key (`e`, `é`, a Greek/Cyrillic letter,
// `2`, a full-width digit) rewrites every embedded occurrence, not just the standalone token.
// A single GLYPH (`→`, `×`, `©`, `🎯`) is a symbol, not a letter/digit — the intended use — and
// stays silent. `[...tok].length === 1` counts code points so a surrogate-pair emoji reads as one.
function isSingleLetterOrDigitKey(tok) {
  return !!tok && [...tok].length === 1 && /[\p{L}\p{Nd}]/u.test(tok);
}

/**
 * Authoring warning: a single-letter-or-digit `lexicon:` key (`e:`, `é:`, `2:`). See
 * isSingleLetterOrDigitKey for why it garbles narration — a key `e: EEK` turns "revenue"
 * into "r EEK v EEK n u EEK", mis-narrating the whole deck. Warn, don't block — a lone
 * letter may be deliberate (rare). Self-contained: it parses the nested `lexicon:` block
 * itself (mirroring parseTokenMap in lib/core/resolve-captions.mjs — the SHALLOWEST child
 * indent is the entry level, deeper lines are strays), so it needs no injected vocab, and
 * warns on exactly the keys the parser reads. One finding per offending key.
 */
function findSingleLetterLexiconKeys(source) {
  // Tolerate a BOM and trailing spaces after the opening fence, matching the parser this
  // mirrors (resolve-captions.mjs frontMatterBody) — else a `--- ` / BOM deck the engine
  // narrates would dodge the warning.
  const fmBlock = String(source || '').match(/^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (!fmBlock) return [];
  const lines = fmBlock[1].split(/\r?\n/);
  // The root `lexicon:` header — column 0, nothing after the colon (a nested `lexicon:`
  // under another key is indented and is not this block).
  let i = lines.findIndex((l) => /^lexicon:[ \t]*$/.test(l));
  if (i < 0) return [];
  // Collect the block's child lines (deeper than the root), stopping at the first root sibling.
  const block = [];
  for (i += 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue; // blank lines don't end a block
    const indent = line.match(/^(\s*)/)[1].length;
    if (indent === 0) break; // a sibling root key ends the block
    block.push({ indent, text: line.trim() });
  }
  if (!block.length) return [];
  // Mirror parseTokenMap: the entry level is the shallowest child indent; a deeper line is a stray.
  const entryIndent = Math.min(...block.map((l) => l.indent));
  const out = [];
  for (const { indent, text } of block) {
    if (indent !== entryIndent) continue;
    // key: value — a quoted token (may hold spaces) or a bare run up to the first colon.
    const m = text.match(/^(?:"([^"]+)"|'([^']+)'|([^\s:]+))\s*:/u);
    if (!m) continue;
    const tok = m[1] ?? m[2] ?? m[3];
    if (isSingleLetterOrDigitKey(tok)) {
      out.push({
        slide: 0,
        rule: 'lexicon-single-letter-key',
        severity: 'warning',
        classToken: tok,
        line: text,
        message: `lexicon key '${tok}' is a single letter/digit — read-aloud rewrites EVERY embedded '${tok}' in the deck (e.g. 'revenue' → garbled), not just the standalone token`,
        fix: `Use a whole-word key (e.g. \`revenue: …\`) or a symbol; single letters/digits also match inside other words. Keep it only if you truly mean every '${tok}'.`,
      });
    }
  }
  return out;
}

module.exports = {
  MODIFIER_PREFIXES,
  FOCUS_AXES,
  FOCUS_STYLES,
  CARD_STYLE_LAYOUTS,
  LEDGER_OL_LAYOUTS,
  STATEMENT_OL_LAYOUTS,
  SPLIT_SLOT_LAYOUTS,
  NUMBER_SLOT_LAYOUTS,
  findInlineTitleBodyLine,
  findOrderedInlineTitleBodyLine,
  findBoldOrderedStatement,
  findSplitBodylessItem,
  findBigNumberHeroInHeading,
  countPrimaryCollection,
  CODE_LINE_BUDGET,
  codeLineColumns,
  widestCodeLine,
  axisNoun,
  capacityFix,
  findUnknownMapRegions,
  findRetiredAutosplitDirective,
  findUnsupportedPaginateValues,
  findUnknownFinish,
  findUnknownPace,
  PACE_NAMES,
  findUnknownMode,
  findUnknownColorMode,
  findRefusedDeckClass,
  findDeprecatedClassColorMode,
  findUnknownStamp,
  findUnknownToneStyle,
  findUnknownSpectrum,
  findUnknownSpectrumEdge,
  findUnknownSpectrumCard,
  findUnknownSpectrumCardEdge,
  findUnknownSpectrumTrim,
  findUnknownRule,
  findUnknownEyebrow,
  findUnknownHeadline,
  findSingleLetterLexiconKeys,
  nearestRegion,
  withTokenSuggestion,
  replaceToken,
  editDistance,
  isKnownModifier,
  autofixNestedTitle,
  autofixOrderedNestedTitle,
  autofixGanttDelimiter,
  applyFix,
  applyAllFixes,
  lintTextWith,
};
