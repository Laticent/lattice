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
const { deckClassRefusalsFromFrontMatter, deckClassTokensFromFrontMatter } = require('../core/deck-class-register');
const { fitClassFromFrontMatter, fitLevel, isGuardsToken } = require('../core/resolve-guards');
// Per-element word counts, the same reader the density suggestions use, so the
// scale-capacity rule measures an element the way the calibration rig built it.
const { elementWordCounts } = require('./prose-budgets');
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
// The three RENDER-TARGET front-matter keys and their on/off vocabulary, read from the
// kernel that the EXPORT also reads (lib/core/render-target-keys.js). Pure and fs-free
// (HARD RULE #7); shared rather than re-typed so a warning and a render cannot disagree
// about which values count as "on".
const {
  RENDER_TARGET_KEYS,
  RENDER_TARGET_KEY_NAMES,
  ON_WORDS,
  OFF_WORDS,
  renderTargetKeyState,
  indentedKeyLines,
} = require('../core/render-target-keys');
const { frontMatterValue } = require('../core/front-matter-key');
const { topLevelFrontMatterValue, frontMatterScalar, frontMatterName } = require('../core/front-matter-key');

// THE class-directive reader — shared with the editor's autocomplete, and it reads
// BOTH forms (the spot `<!-- _class: … -->` and the running global `<!-- class: … -->`)
// off whole-line comments only. The regex this replaces saw the spot form alone, so
// on a deck using the global form every slide from the directive onward was linted
// against a class it does not have — and, the real directive being invisible, whatever
// `_class:` the PROSE happened to quote took its place. See
// lib/core/class-directive-scan.mjs.
const { slideClassDirectives } = require('../core/class-directive-scan.mjs');
// The ENGINE's own directive reader (lib/engine/slides.js calls this one), so the
// linter cannot disagree with it about what counts as `_track`. Already in this
// module's graph through the scanner above, so it adds no bytes to the docs route.
const { readDirectiveComment } = require('../core/comment-directive.mjs');
const TRACK_VOCAB = { known: new Set(['track']), flags: new Set() };
const { findShapeGlyphs, stripFencedCode, shapeGlyphAdvice } = require('../core/shape-glyphs.js');
// The pill decoder itself (HARD RULE #1), so the crowded-shape rule reads a span exactly
// the way the engine will render it: escapes, reserved markers and modifier order included.
const { resolve: resolveInlinePill } = require('../core/inline-pills.js');
// The engine-configured BLOCK parser (the one slide-boundaries already bundles), so the
// crowded-pill rule judges indented code and raw HTML blocks exactly as the engine does.
const { boundaryParser, normalizeSource } = require('../core/boundary-parser');
// The SOVEREIGN Frames, DERIVED — never a hand-written list. `lib/components/
// manifest.schema.json` carries a standing warning not to re-derive this set by hand
// because the prose copy has already drifted twice; a rule that COACHES an author
// toward a sovereign component is the last place that should happen, since an omitted
// Frame is an answer the author is told does not exist. The generated stage catalog is
// a plain object built from the same `exemptFromChrome:true` manifests the engine reads
// (tools/build-stage-catalog.js) and is fs-free, so it keeps HARD RULE #7 intact.
const STAGE_CATALOG = require('../forms/cell/masthead/stage-catalog.generated.js');
const SOVEREIGN_COMPONENTS = Object.keys(STAGE_CATALOG)
  .filter((k) => STAGE_CATALOG[k] === 'sovereign').sort();
/** `\`a\`, \`b\` or \`c\`` — the sovereign components, for a `fix:` string. */
function sovereignList() {
  const t = SOVEREIGN_COMPONENTS.map((n) => `\`${n}\``);
  return t.length > 1 ? `${t.slice(0, -1).join(', ')} or ${t[t.length - 1]}` : (t[0] || '');
}

// WHICH optional editorial blocks a layout actually renders (#1651). Pure and
// fs-free like this module (HARD RULE #7). Read from its owner so a lint warning
// and a render can never disagree about whether a blockquote becomes a callout.
const { supportsBlock, readsInsightLabel } = require('../core/authoring-blocks');
const { parseInlineSet, labelSetFor, labelSetNames, axisSetFor } = require('../core/label-set');
// The axis grammar: one tokenizer, and the one reading of what a member's parts
// mean, both shared with the quadrant transform so this rule and the render
// agree about which parts were honored.
const { parseBracketList } = require('../core/bracket-list');
const { readAxisMember, readTimeAxisMember } = require('../core/axis-member');
// The fence walk + the shell script/session distinction, from the kernel the engine
// and the preview loader also read (pure and fs-free, HARD RULE #7). Shared rather
// than re-typed here so the linter and the highlighter cannot disagree about which
// tag a fence carries.
const { scanFences, SESSION_TAGS, looksLikeShellScript } = require('../core/fence-languages');

// The `_track` grammar, from the kernel both render arms read (pure, fs-free —
// HARD RULE #7). Shared rather than re-typed so the linter and the engine cannot
// disagree about what the author wrote.
const { parseTrackSpec, MIN_TRACK_LABELS } = require('../core/track-spec');

// Focus & highlighting directives (engineering/decisions/2026-06-16-focus-
// highlighting.md). Linted for grammar — a known axis and a well-formed ordinal
// target — so a typo (`rows 4`, `line abc`, `_focusStyle: glow`) is caught
// before render rather than silently no-op'ing.
const FOCUS_DIRECTIVE = /<!--\s*_focus:\s*([^>]+?)\s*-->/;
const FOCUS_STYLE_DIRECTIVE = /<!--\s*_focusStyle:\s*([^>]+?)\s*-->/;
const FOCUS_STEPS_DIRECTIVE = /<!--\s*_focusSteps:\s*([^>]+?)\s*-->/;
const FOCUS_AXES = new Set(['item', 'row', 'col', 'cell', 'line', 'mark', 'series']);
const FOCUS_STYLES = new Set(['spotlight', 'ring', 'list-fill', 'blur', 'pop']);

// The `topic` anchor's sibling-track override. `_track` names the scale outright
// when the DERIVED one (every topic slide's own `<h2>`) is not what the author
// wants. Both failures below are SILENT on a rendered slide — a band that never
// draws, or one with no column lit — so they are caught here instead.
//
// The grammar is read through the kernel both render arms use (HARD RULE #7): a
// linter that re-implemented the split would eventually disagree with the engine
// about what the author wrote, which is the whole failure this directive replaced.
/**
 * The `_track` the ENGINE will apply — the last one on the slide, or null.
 *
 * DELIBERATELY NARROWER THAN THE ENGINE, and that is the whole design. Ten review
 * rounds each replaced a hand-written model of some markdown rule
 * with a slightly better hand-written model, and each one was falsified by the
 * next fuzz against `render()` — a 4ⁿ regex, a quadratic back-scan, a missing
 * marker separator, a raw-text end condition that fired on `</pre` with no `>`,
 * three block types never modelled at all, a fence regex that forbade a backtick
 * in a TILDE fence's info string. Writing a fifth of CommonMark §4.6 from memory
 * is the defect, not any one of its bugs.
 *
 * So this rule no longer tries to AGREE with the engine. It aims to be a SUBSET of
 * it: what it warns about, the engine applies; plenty the engine applies, it says
 * nothing about. For an advisory rule that is the right asymmetry — HARD RULE
 * #29's posture is warn and coach, and a warning about a directive the renderer
 * never read is worse than silence, because it sends the author to fix something
 * that is not broken.
 *
 * THAT IS AN AIM, NOT A PROOF, and the difference has been expensive. Two rounds
 * running, the subset property was ASSERTED of a condition that did not have it,
 * and the fuzz found the counterexample both times. What is enforced is the
 * generated fuzz in the test file — nothing here proves the property, and the next
 * counterexample is one axis the generator cannot yet express.
 *
 * SEVEN CONDITIONS, and only two are sticky poison — `FENCE_LINE` and
 * `MARKUP_LINE` set a flag that declines every later line. `COMMENT_LINE` declines
 * one line; the multi-line collector declines until its `-->`; the table lookahead
 * declines one line; the indent test declines one block; and the voiding turns any
 * of those declines into "no answer" rather than "the previous answer".
 *
 * THE VOIDING IS WHAT KEEPS THE SET QUIET. The rule returns the LAST directive it
 * accepts within a channel, so declining a later one PROMOTED an earlier one, and
 * where the earlier was degenerate and the later was not, silence became a false
 * warning. Being over-broad is free only once a decline cannot change WHICH
 * directive answers.
 *
 * What voids has been got wrong in three consecutive rounds, so it is worth
 * stating exactly. It is NOT "only a line that would itself have been applied" —
 * that was true for one commit and is not true now. An indent-opened block voids
 * whether or not it carries a directive, because markdown-it opens no `html_block`
 * at a list-continuation indent and the rule cannot tell from the line alone what
 * the engine did with the text inside it. A `<!--` under poison voids unread for
 * the same reason. And "would have been applied" means IS A DIRECTIVE, not has a
 * non-empty value: `<!-- _track: -->` is read, supersedes its channel and leaves
 * the slide with no authored track, so it CLEARS rather than being ignored.
 *
 * AND IT IS STILL AN AIM, NOT A PROOF. Three separate rounds asserted
 * "over-broad only declines more" of a condition that did not have the property —
 * the fence test, the markup test, and the voiding itself. What is enforced is the
 * generated fuzz below; nothing here proves anything. Thirteen rounds of checkers
 * each found the next counterexample on an axis the generator could not express,
 * and the thirteenth was the first to find none.
 *
 * THE COST IS SILENCE, and it is worth naming rather than only counting the false
 * warnings that are gone. Against the committed cross, the last two commits took
 * false warnings from 3,264 to 0 — and true warnings from 5,988 to 2,532. Every
 * one of those is in the multi-directive half, where a declined directive makes
 * the answer unknowable; the one-directive half is unchanged at 657 across all
 * three heads. That trade is deliberate: for an advisory rule a wrong warning
 * costs more than a missing one. It is not free.
 *
 *   · the comment opens its own line, at most three spaces in — no blockquote and
 *     no list marker, so the rule never has to model container indentation;
 *   · a multi-line comment is collected until a line carries `-->` and then read
 *     whole, because that is what the engine does with the block — UNLESS it
 *     opened at an indent or under poison, where the engine opened no block at
 *     all and the collector would be inventing one;
 *   · a FENCE marker above it, at any indent and behind any container marker,
 *     declines the rest — deliberately over-broad, after a narrow version warned
 *     about a `~~~ see `docs`` code sample;
 *   · ANY other markup line above it, likewise behind any container marker,
 *     declines the rest — it may have opened a block this rule does not model, and
 *     it never tries to work out whether that block closed. A `^<` test over the
 *     trimmed line missed `- <figure>` and that was a false-positive family.
 * The fifth is the only LOOKAHEAD, and the only one that is not poison-shaped: a
 * table delimiter row on the NEXT line makes this line a table HEADER, because
 * markdown-it runs `table` before `html_block` and a `_track` value is
 * pipe-separated by construction. One line down is the whole of it.
 *
 * One pass, one line at a time, no backward scan. The version this replaces ran
 * `lastIndexOf`/`indexOf` per comment SPAN, which was still O(n²) on a slide
 * carrying many comments on one line: 2.8 s at 500 KB, on the Studio's
 * main-thread CodeMirror lint source (`docs/src/components/studio/Editor.tsx`),
 * over deck text HARD RULE #22 classes as untrusted.
 *
 * THE KEY RULE IS NOT RE-IMPLEMENTED HERE. `readDirectiveComment` is the reader
 * `lib/engine/slides.js` itself calls, so case (`_TRACK:` is NOT a directive) and
 * the spot/global distinction come from the engine rather than from a regex in
 * this file. Two false warnings came from getting exactly those wrong by hand.
 * It is already in this module's graph through `class-directive-scan.mjs`, so
 * sharing it costs nothing on the docs route.
 */
const COMMENT_LINE = /^ {0,3}<!--/;
// CONTAINER-PREFIXED TOO, and leaving that out was a false-positive family of its
// own: `- <figure>` opens an `html_block` that swallows the indented comment under
// it, but a `^<` test over the TRIMMED line cannot see an opener behind a list
// marker. Same over-broad shape as the fence test below — a leading run of
// container-ish characters, then anything tag-like. Over-broad only declines more.
const MARKUP_LINE = /^[ \t>*+\-0-9.)]*<[!?/a-zA-Z]/;
// A `_track` value is pipe-separated BY CONSTRUCTION, so a delimiter row under it
// turns the directive line into a TABLE HEADER — markdown-it runs `table` before
// `html_block`, and the engine reads no directive at all. This is the one place
// the pass looks DOWN, and one line is exactly right: markdown-it requires the
// delimiter at `startLine + 1`, so a blank line between kills the table.
//
// A SCANNER, NOT A REGEX, and the regex it replaces was the worst kind. Written as
//
//     /^[ \t>]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/
//
// the leading `[ \t>]*` and the following `[ \t]*` were separated only by an
// optional `\|?`, so a run of N spaces could be split N ways and a FAILING match
// tried all of them. Measured through `lintTextWith`: 3.2 s at 59 KB, 33 s at
// 195 KB, against 33 ms on the commit before it — on the Studio's main-thread lint
// source, over untrusted deck text, which is the same hazard the docblock above
// congratulates itself for removing. It did not even need a `_track`: the guard
// runs on any comment line carrying a `|`.
//
// This is the FOURTH backtracking or quadratic defect on this one rule. Scanners
// cannot backtrack; the rule is now that this file does not get another regex with
// two adjacent variable-width whitespace classes.
function isTableDelimiter(line) {
  const s = String(line);
  const space = (c) => c === ' ' || c === '\t';
  let i = 0;
  // NO `>` HERE. A blockquoted `> | --- | --- |` under a directive is a
  // blockquote, not a table — the engine applies the directive — so accepting it
  // as a delimiter row silenced a real warning. The over-breadth that is free is
  // the poison conditions', not this one: this scanner's over-breadth makes the
  // rule QUIETER by declining a live directive, which is the direction that hides
  // the defect the rule exists to report.
  while (i < s.length && space(s[i])) i += 1;
  if (s[i] === '|') i += 1;
  let cells = 0;
  while (i < s.length) {
    while (i < s.length && space(s[i])) i += 1;
    if (s[i] === ':') i += 1;
    let dashes = 0;
    while (i < s.length && s[i] === '-') { dashes += 1; i += 1; }
    if (dashes === 0) return false;
    if (s[i] === ':') i += 1;
    cells += 1;
    while (i < s.length && space(s[i])) i += 1;
    if (s[i] !== '|') break;
    i += 1;
    // A CLOSING pipe may be followed by blanks and nothing else. Re-entering the
    // loop there demanded another cell and rejected the row — markdown-it splits
    // the line on `|` and skips an empty LAST cell, so `| --- | --- | ` is a real
    // delimiter row. Rejecting it warned about a directive inside a table: 532
    // false positives over 11,610 generated rows.
    let j = i;
    while (j < s.length && space(s[j])) j += 1;
    if (j >= s.length) break;   // `i = j` here was dead: the tail scan walks the same blanks
  }
  while (i < s.length && space(s[i])) i += 1;
  return cells > 0 && i >= s.length;
}
// A FENCE LINE POISONS, it is never tracked. The version this replaces tried to
// pair openers with closers — same character, at least as long, nothing after —
// and got it wrong twice in one regex: it forbade a backtick in the info string
// (right for a ``` fence, wrong for a ~~~ one) and it was container-blind, so a
// fence opened after `- ` or behind a tab was invisible. A missed fence makes the
// rule LOUDER, which is the one direction a subset rule may never fail in, and it
// warned about `~~~ see `docs`` code samples. Treating any fence marker the way a
// markup line is treated cannot fail that way: it only ever declines more.
// DELIBERATELY OVER-BROAD: any run of container-ish characters, then a fence
// marker. Over-broad only ever declines more, which is the safe direction; too
// narrow is what warned about a code sample.
const FENCE_LINE = /^[ \t>*+\-0-9.)]*(?:`{3,}|~{3,})/;

// TWO CHANNELS, because the engine has two. `lib/engine/slides.js` merges
// `{ ...runningGlobal, ...slideLocal }`, so a SPOT `_track` on this slide beats a
// bare deck-wide `track:` WHATEVER THE LINE ORDER — "last one wins" is true only
// within a channel. Modelling one channel got two things wrong: an empty bare
// `track:` cleared a spot answer it cannot reach (a real warning lost), and the
// deck-wide finding fired on a slide whose own spot directive already overrode it
// (a warning whose text was false in both halves).
//
// A DIRECTIVE WITH AN EMPTY VALUE CLEARS ITS OWN CHANNEL, it does not fail to be one.
// `<!-- _track: -->` parses to a real directive whose value is `''`; the engine
// applies it, it SUPERSEDES every `_track` above it, and the slide then draws no
// authored track at all — so any warning about an earlier directive is false.
// Testing `?.value` instead of "is this a directive" promoted the earlier one,
// which is the exact failure the voiding below exists to prevent, arriving through
// a different door.
const keep = (line, dir) => (dir.value ? { line, spot: dir.spot, value: dir.value } : null);

function liveTrackDirective(slide) {
  let spot = null;
  let spotSeen = false;   // a spot directive appeared, even if it cleared
  let global = null;
  let open = null;      // lines of an unterminated comment block, or null
  let markup = false;   // unmodelled markup seen above — decline the rest
  let blind = false;    // a comment line was SKIPPED, so last-wins is unknowable
  let indented = false; // the open block started at an indent — a phantom, not a block
  // THE RAW SLIDE, not `withoutCodeBlocks`. That helper deletes CLOSED fences —
  // which collapses line numbers — and rewrites an inline span to a space, which
  // turns an UNCLOSED ``` into a single backtick. Neither view can answer the only
  // question asked here, which is whether a fence marker appeared at all.
  const lines = String(slide).split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const t = line.trim();
    if (open !== null) {
      open.push(line);
      if (!t.includes('-->')) continue;
      // THE ENGINE READS THE WHOLE BLOCK, and so does `readDirectiveComment` —
      // a directive split over two lines is a directive. Blinding on multi-line
      // comments instead would silence the rule on every slide carrying a
      // speaker note, which is most of them.
      const multi = readDirectiveComment(open.join('\n'), TRACK_VOCAB);
      // A PHANTOM BLOCK IS NOT A BLOCK. `indented` records that this block opened
      // at an indent — a list continuation, where markdown-it has no `html_block`
      // at all — and `markup` records that a fence or a tag opened above it. In
      // either case the engine never read a comment here, so whatever the block
      // carries is neither this rule's answer nor safely ignorable: it voids.
      if (multi) {
        if (markup || indented) blind = true;
        else if (multi.spot) { spot = keep(t, multi); spotSeen = true; }
        else global = keep(t, multi);
      }
      else if (indented) blind = true;
      // No `indented = false` here: a block that opened indented sets `blind` down
      // either branch above, and `blind` is never cleared, so no later read of the
      // flag can change an answer. A mutant that deleted the reset was equivalent.
      open = null;
      continue;
    }
    if (t === '') continue;
    if (FENCE_LINE.test(line)) { markup = true; continue; }
    // ANY line that could be a live directive but is not READ makes last-wins
    // unknowable, so it voids the slide's answer rather than falling back to an
    // earlier one. A container-prefixed `> <!-- _track: … -->` is exactly that:
    // the engine applies it, this rule declines to read it, and without this the
    // EARLIER directive became the answer — turning silence into a false warning
    // whenever the earlier one was the degenerate of the two.
    if (line.includes('<!--') && !COMMENT_LINE.test(line)) { blind = true; continue; }
    if (COMMENT_LINE.test(line)) {
      // `<!--->` really does close: its `-->` overlaps the opener, and
      // markdown-it's type-2 terminator is `-->` anywhere on the line.
      // A MULTI-LINE comment is read by the engine and not by this rule, so it
      // could carry a `_track` that supersedes everything above it. Round ten
      // measured a 91-of-91 miss rate here while the docblock claimed the set was
      // quiet-only; this is the line that makes the claim true.
      if (!t.includes('-->')) {
        if (markup) { blind = true; continue; }
        open = [line];
        indented = line !== line.trimStart();
        continue;
      }
      // ONLY A REAL DIRECTIVE VOIDS. Blinding on every skipped comment silenced a
      // `<div>` plus a speaker note below a degenerate `_track` — the exact
      // failure this rule exists to report.
      //
      // NO NUMBER HERE, deliberately. Three have stood in this comment and none
      // survived: two came from scratch crosses nothing in the tree runs, and the
      // third measured a generator whose axes have since moved. Mutating this line
      // to blind on every comment does not even move the pinned one-directive
      // counts — it is killed by named tests instead, which is the evidence that
      // re-derives. A number a reader cannot reproduce is worse than none.
      if (markup) { if (readDirectiveComment(line, TRACK_VOCAB)) blind = true; continue; }
      // A delimiter row BELOW makes this line a table header, not an html_block.
      if (t.includes('|') && isTableDelimiter(lines[i + 1] ?? '')) { blind = true; continue; }
      // The whole LINE, not the comment span: an `html_block` runs to the end of
      // its line, so `<!-- _track: A --> tail` reaches the reader as the whole
      // line and is rejected — which is also why no separate trailing-text test
      // is needed here, and an earlier one was dead code that no mutant could kill.
      const dir = readDirectiveComment(line, TRACK_VOCAB);
      if (dir) { if (dir.spot) { spot = keep(t, dir); spotSeen = true; } else global = keep(t, dir); }
      continue;
    }
    if (MARKUP_LINE.test(line)) markup = true;
  }
  // The engine's own precedence, and the subtlety is `spotSeen`. The merge is
  // `{ ...runningGlobal, ...slideLocal }`, so an EMPTY spot directive does not
  // merely clear its own channel — it writes `''` into the slide's map, which the
  // engine then skips, MASKING the deck-wide value too. "No spot directive" and
  // "a spot directive that cleared" are different answers.
  return blind ? null : (spotSeen ? spot : global);
}

// A top-level markdown bullet — the RETIRED override shape. On a `topic` slide an
// authored `<ul>` used to BE the track; it is ordinary content now, so a deck
// written against the old contract renders its list plus a derived track below it.
// Warn and coach rather than refuse (HARD RULE #29's posture): the fix is one line.
const TOP_LEVEL_BULLET = /^[-*+][ \t]+\S.*$/m;

// What the RENDERER will draw as BODY: no fenced code, and no HTML comment. A
// bullet list inside `<!-- … -->` is a speaker note — markdown-it never emits it
// as a list, so warning that "it renders as content" was false twice over, and
// the fix told the author to delete prose the reader never sees. `maskInert`
// blanks comments (and RAWTEXT) while preserving offsets, so the reported line
// still reads true.
//
// NOT for reading a DIRECTIVE: a directive IS a comment, so this view blanks it.
// That is the mistake this pair of helpers exists to keep apart — masking the
// comments out of rule 12's input silently switched the whole rule off.
//
// LOCAL, not `maskInert` from lib/core/top-level-h2.js, and the reason is bytes
// on a route rather than taste: this module is bundled into the docs Studio's
// EAGER path, so importing that kernel shipped its whole HTML tokenizer there —
// measured +13,467 bytes raw / +1,571 gz on `studio`, enough to blow the route
// budget. The jobs are not the same one anyway. `maskInert` blanks inert spans in
// RENDERED HTML (comments, `<script>`, `<style>` RAWTEXT); this blanks comments in
// MARKDOWN SOURCE, which is the shape every other text-view helper in this file
// already takes (`stripFencedCode`, `withoutCodeBlocks`, `withoutCodeCommentMarkers`).
// Newlines survive so a reported line still reads true, and an UNTERMINATED `<!--`
// is deliberately left alone — `findUnterminatedComment` is the rule that owns it.
// An UNTERMINATED `<!--` runs to the end, because that is what a browser does with
// it: measured, a `topic` slide whose note opens a comment and never closes it
// renders NO `<ul>` at all, and the rule still told the author to "delete the
// list" — two findings on one slide contradicting each other, since
// `findUnterminatedComment` had already named the real problem.
const withoutHtmlComments = (text) =>
  String(text).replace(/<!--[\s\S]*?-->|<!--[\s\S]*$/g, (m) => m.replace(/[^\n]/g, ' '));

const renderedBody = (slide) => withoutHtmlComments(stripFencedCode(slide));



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
    if (!FOCUS_AXES.has(axis)) return `'${axis}' is not a focus axis (item, row, col, cell, line, mark, series)`;
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

// RETIRED tokens that own a DEDICATED rule, so the generic `unknown-class` must stay
// quiet about them. Not "deprecated" (the set above means "still renders, still valid"):
// these render as nothing and the author does have to edit. The point is that
// `retired-form-token` already says so, in the author's terms and with the real fix —
// while `unknown-class` told the same author to "check the spelling", which is advice
// toward a token that is spelled perfectly and is never coming back. Two warnings on one
// token, one of them misleading, is worse than one. (`no-form` never doubled: it matches
// the `no-` modifier prefix and was already recognized.)
const RETIRED_WITH_OWN_RULE = Object.freeze(new Set(['form', 'no-form']));

// RENAMED components — old token -> new token. NOT an alias: these no longer
// render, and the deck is genuinely broken until the author edits it. The map
// exists so the `unknown-class` warning can NAME the replacement, because the
// fuzzy suggester cannot: it scores edit distance, and `compare-table` -> `table`
// is 8 apart, so a deliberate rename is exactly the case it is worst at. This
// repo renames by hard break with a migration table (see the `bg-*` and
// split-panel precedents), which makes this warning the one line a user acts on.
// Retire an entry once the old name has been gone long enough to stop appearing.
// Each entry names what the author loses by leaving the old token in place.
const RENAMED_CLASSES = Object.freeze(new Map([
  ['compare-table', {
    to: 'table',
    loses: 'The table keeps the house treatment, but loses the first-column row-label emphasis (the one change you SEE), plus its row capacity, autosplit, portrait card reshape and focus axes.',
  }],
  // Absorbed into `list` on 2026-09-25 — `takeaway numbered` stacks a nested gloss
  // under a bold lead, the same row list-criteria drew, at a fixed counter size.
  ['list-criteria', {
    to: 'list takeaway numbered',
    loses: 'The list keeps plain numbers, but loses its zero-padded accent counters, its ruled rows and the bold lead over each nested gloss line.',
  }],
]));

/**
 * The kind of a slide's FIRST top-level list — 'ol' for `1.`/`1)`, 'ul' for `-`/`*`/`+`,
 * null when the slide has none. Fenced code is skipped. Used by `list-modifier-inert`.
 */
function topLevelListKind(slide) {
  // A fence closes only on a run of the SAME character at least as long as the one that
  // opened it (CommonMark), so a ```` fence may quote a ``` line without ending.
  let fence = null;
  for (const line of String(slide || '').split(/\r?\n/)) {
    const f = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (f) {
      if (!fence) { fence = f[1]; continue; }
      if (f[1][0] === fence[0] && f[1].length >= fence.length && !line.slice(f.index + f[0].length).trim()) { fence = null; continue; }
    }
    if (fence) continue;
    // Up to three spaces of indent is still a top-level list; four is a code block.
    if (/^ {0,3}\d+[.)]\s/.test(line)) return 'ol';
    if (/^ {0,3}[-*+]\s/.test(line)) return 'ul';
  }
  return null;
}

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
  // team-profile: the top-level bullet is the person's NAME and everything about
  // them nests under it, so an inline `- **Ada Okafor.** Executive Sponsor` leaves
  // the transform with a name it cannot separate from the role.
  'team-profile',
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
  'agenda', 'authority-chain', 'kpi', 'list-steps',
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
// layout a portrait form (`table` → card-per-row, compare-code → cover-code, redline →
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
 * Detect the ORDERED-list flavor of the inline title+body footgun
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
 * advance width of `--font-mono`. NOTE THE TWO TYPE SIZES: `code` reads at
 * `--fs-body-compact` since it took its own type step, `compare-code` still at
 * `--fs-meta`, so they no longer share a row's arithmetic.
 *
 *   box      layout      @size       pre content   font-size    advance    fits
 *   wide     compare-code hd           516.000px   14.976px    8.9812px      57
 *   wide     code         hd          1104.000px   17.920px   10.7438px     102
 *   square   code         square       905.175px   25.920px   15.5439px      58
 *   tall     code         portrait     893.025px   39.960px   23.9720px      37
 *   tall     code         reel         883.305px   39.960px   23.9720px      36  ← the budget
 *   strip    code         mobile       879.255px   39.960px   23.9720px      36
 *
 * The advance is 0.5997 of the font size — JetBrains Mono's fixed pitch — so any
 * of these recomputes as `floor(contentPx / (fontSizePx * 0.6))`. `--font-mono`,
 * `--fs-meta` and `--fs-body-compact` are base tokens (lib/base/base.tokens.css),
 * NOT theme-owned, so one table covers every theme.
 *
 * WITHIN A FAMILY, THE TIGHTEST @size SETS THE NUMBER — and that is load-bearing
 * now in a way it was not before. The padding tokens are container-relative, so
 * the content box moves a few px across the @sizes that share a family. At
 * `--fs-meta` the `tall` pair measured 893.025px and 883.305px and BOTH floored
 * to 49, so one number was free. At `--fs-body-compact` the columns are ~33%
 * wider at portrait and the same 9.7px gap now straddles a boundary: portrait
 * fits 37, reel fits 36. The table carries **36**, because a budget that is
 * generous by one column is exactly the silent truncation this rule exists to
 * catch — a 37-column line on a `size: reel` deck would pass and ship clipped.
 * Any future re-measurement must re-check every @size in a family, not one.
 *
 * WHY compare-code IS `wide`-ONLY. At square/tall/strip its panes stack to ONE
 * column and switch to `pre-wrap` (compare-code.styles.css "Family reflow"), so
 * a long line wraps instead of clipping. `code` never wraps in any box, which is
 * why it carries all four. Landscape compare-code also cannot escape into the
 * wrapping carousel split: `splitDoc` is gated on `AUTOSPLIT_APPLIES`
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
  // RE-MEASURED after `code` took its own type step to `--fs-body-compact`, which
  // widens a column by ~20% at wide/square and ~33% at portrait/reel (the two
  // roles are 1.17→1.40cqi in the landscape boxes but 2.78→3.70cqi in the tall
  // ones), so the budgets fall by those same two ratios rather than one. Measured
  // the same way as the originals — a 100-character fence through the real
  // pipeline, pane width over character advance, fonts loaded. `tall` is 36, the
  // tighter of its two @sizes; see the table above. `compare-code` is untouched
  // because it kept `--fs-meta`.
  code: Object.freeze({ wide: 102, square: 58, tall: 36, strip: 36 }),
});

/**
 * Modifiers that resize the STAGE, and so move the code pane out from under the
 * budgets above. MEASURED at `wide` on a `code` slide, at its `--fs-body-compact`
 * size: bare 1104px (102 columns), `claim-hero` and `claim-bleed` 1172px (109),
 * `compact` 1116px (103). The width rule stays silent on a slide carrying any of
 * them rather than judging it against a number that is not its pane's.
 */
const STAGE_RESIZING_MODIFIERS = new Set(['claim-hero', 'claim-bleed', 'compact']);

/**
 * THE PROJECTION FONT SCALE — what a component holds when `scale-l` / `scale-xl` /
 * `scale-2xl` (typography.md §7) raises every readable size and leaves the box alone.
 *
 * The engine no longer clips such a slide: STEP (lib/core/scale-fit.js) takes it back
 * down the same ladder until it fits, never below the designed size. So a slide past
 * these numbers is not lost — it renders SMALLER than the rest of the deck, which is
 * the thing the author asked not to happen. That is what the `capacity-scale` rule
 * below tells them, before they render. The design record is
 * engineering/decisions/2026-09-25-font-scale-fit.md.
 *
 * WHY A MEASURED TABLE AND NOT A FORMULA. Prose needs about s² of its designed height
 * (taller glyphs, fewer per line), a one-line item about s, and a card grid something
 * in between, so no single divisor holds. Both obvious ones were checked against the
 * rig and both are unsafe: `floor(ceiling / s)` over-promises on 7 of 26 components
 * (agenda at xl: 4, measured 3) and `floor(ceiling / s²)` still over-promises on
 * glossary and team-profile, whose layouts change shape at a scale.
 *
 * SHAPE. `component → { <words per element>: [designed, l, xl, 2xl] }` — the ELEMENT
 * COUNT at which the component last fits at `wide`, measured at two element lengths: 6 words
 * (a label) and the component's own `density.soft` (the length authors are told to
 * write). The rule reads the smallest length at or above the slide's longest element,
 * so four one-line cards are judged as labels and not as paragraphs — judging them at
 * `density.soft` warned on `examples/font-scale.md`'s 2xl grid, which renders whole.
 * Past `density.soft` it reads the soft column, which can only under-warn; the
 * emulator's SCALE line still names every page the engine stepped.
 *
 * `wide` ONLY. At square / tall / strip a slide past one member is split onto pages
 * of one (lib/core/auto-split.js), so a count budget says nothing there.
 *
 * RE-DERIVE with the rig, not by hand — the numbers are the first overflowing count
 * minus one, the same basis as `capacity` (2026-07-28-capacity-basis.md):
 *
 *   node tools/calibrate-capacity.js --all --family wide --scale xl --words 6
 *   node tools/calibrate-capacity.js --all --family wide --scale xl --words soft
 *
 * (and `--scale l`, `--scale 2xl`, and no `--scale` for the designed-size column). The
 * designed-size column is there so the rule can tell a slide that will render SMALLER
 * from one that clips even at 1x — several declared `hard` values sit above what the rig
 * measures at the designed size (authority-chain, kpi, pricing, q-and-a,
 * regulatory-update, team-profile), and promising those slides a fit would be false.
 * A component absent from this table has no count axis the rig can author, so the rule
 * says nothing about it.
 */
// A `venue:` stamps a `venue-*` class that asks for the same rung (lib/core/resolve-venue.js,
// pinned by test/unit/parsing/resolve-venue.test.js). Declared first in base.modifiers.css, so
// a `scale-*` beside it wins in CSS — and `fontScaleKey` taking the LARGEST key agrees
// except when an author scales a venue slide DOWN by hand, which the budget then overstates.
const FONT_SCALE_KEYS = Object.freeze({
  'scale-l': 'l', 'scale-xl': 'xl', 'scale-2xl': '2xl',
  'venue-huddle': 'l', 'venue-conference': 'xl', 'venue-hall': '2xl',
});
/** The `venue-*` class a front-matter `venue:` stamps, or null (laptop / absent / unknown). */
function venueClassFromFrontMatter(fmText) {
  const m = String(fmText || '').match(/^\s*venue:\s*["']?([A-Za-z0-9_-]+)["']?\s*(?:#.*)?$/m);
  const t = m ? `venue-${m[1].toLowerCase()}` : null;
  return t && FONT_SCALE_KEYS[t] ? t : null;
}
const FONT_SCALE_VALUE = Object.freeze({ l: 1.15, xl: 1.3, '2xl': 1.5 });
const FONT_SCALE_ORDER = Object.freeze(['1', 'l', 'xl', '2xl']);
// [designed size, scale-l, scale-xl, scale-2xl]. Omitted because no value sits below `hard`,
// so the rule could never fire: checklist, matrix-2x2, split-compare, stats.
const SCALE_CAPACITY = Object.freeze({
  'actors': Object.freeze({ 6: [8, 7, 6, 5], 12: [8, 7, 6, 3] }),
  'agenda': Object.freeze({ 6: [6, 5, 5, 4], 10: [6, 5, 3, 2] }),
  'authority-chain': Object.freeze({ 6: [4, 3, 3, 3], 14: [4, 3, 3, 2] }),
  'cards-grid': Object.freeze({ 6: [6, 6, 6, 4], 15: [5, 4, 3, 2] }),
  'cards-stack': Object.freeze({ 6: [4, 4, 3, 3], 16: [4, 4, 2, 2] }),
  'inventory': Object.freeze({ 6: [5, 5, 4, 3], 14: [5, 5, 4, 2] }),
  'kpi': Object.freeze({ 6: [3, 3, 3, 2], 8: [3, 3, 3, 2] }),
  'list': Object.freeze({ 6: [6, 5, 5, 4], 14: [3, 3, 3, 2] }),
  'list-steps': Object.freeze({ 6: [9, 8, 7, 7], 14: [5, 4, 4, 3] }),
  'premise': Object.freeze({ 6: [9, 9, 8, 6], 14: [9, 8, 8, 6] }),
  'pricing': Object.freeze({ 6: [3, 3, 3, 3], 12: [3, 3, 3, 3] }),
  'q-and-a': Object.freeze({ 6: [4, 3, 3, 3], 12: [4, 3, 3, 3] }),
  'regulatory-update': Object.freeze({ 6: [4, 4, 4, 3], 14: [4, 4, 4, 2] }),
  'statute-stack': Object.freeze({ 6: [5, 4, 4, 3], 16: [5, 4, 4, 3] }),
  'team-profile': Object.freeze({ 6: [8, 8, 6, 3], 12: [6, 3, 3, 3] }),
  'verdict-grid': Object.freeze({ 6: [6, 6, 6, 6], 12: [6, 5, 4, 4] }),
});

/**
 * How many lines a `code` pane holds at each scale, `wide`, under a one-line heading —
 * the same calibration shape as the table above. At the designed size that is 15; the
 * code docs' "fourteen" carries an eyebrow above the heading, which costs one line.
 *
 * THE CODE ANSWER. Code keeps scaling and the line cap scales with it, rather than code
 * holding its designed size. `code` is set in `--fs-body-compact`, the second-smallest
 * role on the slide; exempting it would leave the densest, least forgiving text in the
 * room as the one thing the projection scale does not reach. A block past its cap does
 * not clip: the engine steps the slide down until the lines fit, and this budget is how
 * `lint:deck` says so first. Width scales the same way — a mono column is `0.6em`, so the
 * pane holds `floor(CODE_LINE_BUDGET / s)` columns (conservative by at most one).
 *
 *   node tools/calibrate-capacity.js code --family wide --scale xl --max 16 [--eyebrow]
 */
// [designed size, scale-l, scale-xl, scale-2xl], as FONT_SCALE_ORDER. An eyebrow above
// the heading costs the pane one to two lines, so it is measured rather than subtracted.
const CODE_LINES_AT_SCALE = Object.freeze({
  bare: Object.freeze([15, 13, 11, 10]),
  eyebrow: Object.freeze([13, 11, 10, 8]),
});

/** Does the slide carry an eyebrow — a paragraph that is one inline code span, above the
 * first heading? The same test as chart-narration.js `eyebrowBeforeHeading`, inlined
 * because that module is 5k lines the browser lint bundle has no other use for. */
function hasEyebrow(slide) {
  const at = String(slide || '').search(/^#{1,6}\s/m);
  const head = at >= 0 ? String(slide).slice(0, at) : String(slide || '');
  return /^`[^`]+`\s*$/m.test(head);
}

/** The deck's projection scale on a slide — the LARGEST scale token present, because
 * base.modifiers.css declares them in ascending order and the later rule wins. */
function fontScaleKey(tokens) {
  let best = null;
  for (const t of tokens) {
    const k = FONT_SCALE_KEYS[t];
    if (k && (!best || FONT_SCALE_VALUE[k] > FONT_SCALE_VALUE[best])) best = k;
  }
  return best;
}

/** The measured element-count ceiling for `comp` at scale `key`, for elements of up to
 * `words` words; null when the table does not cover it. */
function scaleCapacityFor(comp, key, words) {
  const row = SCALE_CAPACITY[comp];
  if (!row) return null;
  const lengths = Object.keys(row).map(Number).sort((a, b) => a - b);
  const len = lengths.find((l) => l >= words) ?? lengths[lengths.length - 1];
  const v = row[len]?.[FONT_SCALE_ORDER.indexOf(key)];
  return v == null ? null : { ceiling: v, designed: row[len][0], words: len };
}

/** The longest fenced code block on a slide, in lines. Mirrors `widestCodeLine`'s
 * fence grammar (same opener, same closer, an unclosed fence runs to the end). */
function tallestCodeBlock(slide) {
  if (!slide) return 0;
  let best = 0;
  let fence = null;
  let n = 0;
  for (const raw of String(slide).split('\n')) {
    const line = raw.replace(/\r$/, '');
    const open = line.match(/^([ \t]*)(`{3,}|~{3,})(.*)$/);
    if (!fence) {
      if (open && !(open[2][0] === '`' && open[3].includes('`'))) { fence = open[2][0]; n = 0; }
      continue;
    }
    if (open && open[2][0] === fence && open[2].length >= 3 && !open[3].trim()) {
      fence = null;
      best = Math.max(best, n);
      continue;
    }
    n++;
  }
  return fence ? Math.max(best, n) : best;
}

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
  // `backdrop-*` is a CLOSED vocabulary (the `backdrop:` register's steps and masks, which
  // reach `vocab.modifiers` through MODIFIER_GROUPS, plus the `backdrop-none` alias). The
  // prefix below stays for the reserved-class list, but here it would wave through a typo
  // like `backdrop-50`, which renders at full strength with no signal.
  if (token.startsWith('backdrop-')) return token === 'backdrop-none';
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
 * Rewrite a RETIRED quadrant axis eyebrow as the bracketed axis list.
 *
 *   `Effort 0–10 → Reach 0–100 · targets 5, 50`
 *   → `[{Effort, 0..10, 5}, {Reach, 0..100, 50}]`
 *
 * The retired grammar packed names, domains and a detached `targets` blob into one
 * string split on an arrow glyph (engineering/decisions/2026-09-22-chart-axis-grammar.md).
 * Each threshold now sits inside the axis it constrains. The ASCII `->` spelling
 * is accepted here although the old transform never honored it — markdown-it
 * escaped it before the split — because what the author MEANT is not in doubt.
 *
 * Returns the span's new text, or null when `text` is not the retired shape or a
 * side cannot be expressed (a domain with no name: the name is the list's first
 * part, so a lone `0..10` would be read AS the name).
 *
 * Length-capped before any regex runs: this reads untrusted markdown in the
 * browser linter (HARD RULE #22), and a retired eyebrow is a few dozen characters.
 */
function retiredQuadrantAxis(text) {
  const src = String(text ?? '').trim();
  if (!src || src.length > 240 || src.startsWith('[')) return null;
  const arrow = /\s*(?:→|->|-&gt;)\s*/;
  // `\.\d+` too: the old `pullRange` read `[\d.]+`, so `.5–1` was a domain.
  const rangeTail = /(-?(?:\d+(?:\.\d+)?|\.\d+))[ \t]*(?:[–—-]|to)[ \t]*(-?(?:\d+(?:\.\d+)?|\.\d+))$/;
  let core = src;
  let targets = null;
  const t = core.match(/(?:[·,;][ \t]*)?targets?[ \t]*[:·]?[ \t]*([-+]?\d+(?:\.\d+)?)[ \t]*,[ \t]*([-+]?\d+(?:\.\d+)?)$/i);
  if (t) { targets = [t[1], t[2]]; core = core.slice(0, t.index).trim(); }
  const sides = core.split(arrow);
  if (sides.length > 2) return null;
  // Not retired unless it carries the arrow or a domain — an ordinary eyebrow
  // (`Impact vs effort`) is left to be an eyebrow.
  if (sides.length < 2 && !rangeTail.test(core)) return null;
  const members = [];
  for (let i = 0; i < 2; i++) {
    const side = (sides[i] || '').trim();
    let m = side.match(rangeTail);
    // A reversed or empty range was never a domain: the old parser kept it as
    // part of the NAME (`Effort 10–0`), so the rewrite keeps it there too.
    if (m && !(Number(m[2]) > Number(m[1]))) m = null;
    const name = (m ? side.slice(0, m.index) : side).trim();
    const parts = [];
    if (m) parts.push(`${m[1]}..${m[2]}`);
    if (targets) parts.push(targets[i]);
    if (!name) {
      if (parts.length) return null;
      if (i === 1) break;
      return null;
    }
    // Quote only when a character would otherwise be structure, and with the
    // quote the name does NOT contain, so the author's own quotes survive.
    // A name holding both kinds cannot be quoted faithfully: no rewrite.
    let q = name;
    if (/[,{}[\]]/.test(name) || /^["']/.test(name)) {
      if (!name.includes('"')) q = `"${name}"`;
      else if (!name.includes("'")) q = `'${name}'`;
      else return null;
    }
    members.push(parts.length ? `{${[q, ...parts].join(', ')}}` : q);
  }
  return `[${members.join(', ')}]`;
}

/** The whole-line autofix behind `quadrant-retired-axis`: rewrite the one code span. */
function autofixQuadrantAxis(line) {
  const m = String(line ?? '').match(/^([ \t]*)`([^`\n]+)`([ \t]*)$/);
  if (!m) return null;
  const next = retiredQuadrantAxis(m[2]);
  return next ? `${m[1]}\`${next}\`${m[3]}` : null;
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
    case 'quadrant-retired-axis':
      return autofixQuadrantAxis(line);
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
  // A SLIDE-SCOPED rewrite: every line in the finding's chunk that matches, in one pass.
  // For a fix whose first application changes what the rule sees (rule 16: the first
  // `[!]` makes the slide read as six-marker, so a line-at-a-time loop would stop after
  // one line and leave the slide half-migrated).
  if (finding.rewriteSlide) {
    // Rewrites exactly the lines the finding judged (chunk-relative indexes), at the
    // column the rule matched in the RENDERED view — so a `[ ]` inside a comment on the
    // same line, or a fenced example, is never the one replaced.
    const { chunk: want, lines: which, line: pattern, to } = finding.rewriteSlide;
    const match = new RegExp(pattern);
    const chunkLines = [];
    let chunkNo = 0;
    lines.forEach((_line, i) => {
      if (seps.has(i)) { chunkNo++; return; }
      if (chunkNo === want) chunkLines.push(i);
    });
    if (!chunkLines.length) return null;
    const view = renderedBody(chunkLines.map((i) => lines[i]).join('\n')).split('\n');
    let changed = false;
    for (const k of which) {
      const m = match.exec(view[k] || '');
      if (!m) continue;
      const at = m.index + m[0].length - 3;
      const i = chunkLines[k];
      if (lines[i].slice(at, at + 3) !== '[ ]') continue;
      lines[i] = lines[i].slice(0, at) + to + lines[i].slice(at + 3);
      changed = true;
    }
    return changed ? lines.join('\n') : null;
  }
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
        message: `'${name}' is not a ${which === 'world' ? 'country' : 'state'} the ${which} basemap recognizes` +
          (suggestion ? ` — did you mean '${suggestion}'?` : ''),
        fix: suggestion
          ? `Use '${suggestion}' (full name, code, or a known alias all resolve).`
          : `Check the name against the ${which} basemap — full name, code, or a known alias.`,
      });
    }
  });
  return findings;
}


// Slides whose `<td>` cells decode a bracket marker into a drawn shape. TWO
// lists, because the two decoders do NOT share a vocabulary and telling an
// author otherwise hands them a broken slide.
//
//   STATUS cells — obligation-matrix and the universal `state-cells` opt-in.
//   The six markers, one meaning each: [x] yes · [-] partly · [!] no ·
//   [?] unknown · [ ] open · [/] does not apply. lib/core/state-marks.js.
//
//   POSITIONAL cells — matrix-grid. THREE markers only, and they are not
//   statuses: lib/core/matrix-grid-cells.js parses /^\[([x\- ])\]/ into
//   cell-filled / cell-outlined ("reachable") / cell-empty ("not applicable").
//   `[/]` does not parse there — it renders as the literal text "[/]" — and
//   "partial" / "not met" are readings the component does not have. An earlier
//   draft put matrix-grid in the status list, so the linter's own advice would
//   have told an author to write a marker that shows up as square brackets.
const STATE_CELL_TOKENS = Object.freeze(new Set(['obligation-matrix', 'state-cells']));
const POSITIONAL_CELL_TOKENS = Object.freeze(new Set(['matrix-grid']));

const TABLE_ROW = /^\s*\|/;

/**
 * Rule 15 — typed shape glyphs. WARNING, never an error, and that is the policy
 * rather than a soft touch: an author may write whatever they like, and the
 * linter's job is to say what the character will look like on somebody else's
 * machine and name the thing that draws it properly. HARD RULE #29 gates OUR
 * decks; everyone else gets this.
 *
 * ONE finding per slide per (context, glyph set) — not per glyph, and not even
 * per line. A comparison table with four rows of `✓ ✗` is ONE decision to make,
 * and repeating the same four-line fix beside each row is the noise that teaches
 * people to pass `--quiet`. Rows carrying a DIFFERENT set of glyphs still get
 * their own finding, because the advice differs; the set is sorted so `✓ ✗` and
 * `✗ ✓` collapse together.
 *
 * The advice is context-aware where context genuinely changes the answer — a ✓
 * in a table cell wants `[x]` plus the `state-cells` modifier — and falls back to
 * the table's own per-glyph coaching otherwise. The table is the single source (HARD RULE #1);
 * this function adds only what it can see and the table cannot: the slide.
 */
function findTypedShapeGlyphs(source) {
  const findings = [];
  const slides = splitTopLevel(source);
  const directives = slideClassDirectives(source);
  const fm = fmChunks(source);
  slides.forEach((slide, idx) => {
    const tokens = new Set((directives[idx]?.payload || '').split(/\s+/).filter(Boolean));
    const classToken = [...tokens][0] || null;
    const decodesCells = [...tokens].some((t) => STATE_CELL_TOKENS.has(t));
    const decodesPositional = [...tokens].some((t) => POSITIONAL_CELL_TOKENS.has(t));
    const groups = new Map();
    // Fenced blocks are quoted material — terminal output, source, a
    // counter-example — and the deck is right to reproduce them verbatim.
    stripFencedCode(slide).split('\n').forEach((line) => {
      const hits = findShapeGlyphs(line);
      if (!hits.length) return;
      const roles = new Set(hits.map((h) => h.entry?.role));
      const context = TABLE_ROW.test(line) && roles.has('status') ? 'cell' : 'prose';
      const glyphs = [...new Set(hits.map((h) => h.glyph))].sort();
      const key = `${context}|${glyphs.join('')}`;
      const group = groups.get(key);
      if (group) { group.lines++; return; }
      groups.set(key, { context, glyphs, line, lines: 1 });
    });

    for (const { context, glyphs, line, lines } of groups.values()) {
      const also = lines > 1 ? ` (and ${lines - 1} more ${lines === 2 ? 'line' : 'lines'} on this slide)` : '';
      let message;
      let fix;
      if (context === 'cell') {
        message = `${glyphs.join(' ')} in a table cell${also} — typed, not drawn, so each machine ` +
          'sets it in whatever font it can find for it, next to type set in yours';
        fix = decodesPositional
          ? 'Write the cell marker instead: `[x]` filled · `[-]` reachable · `[ ]` not applicable. ' +
            'This slide already decodes them — note it takes those THREE and not `[/]`, and they ' +
            'mark position, not status.'
          : decodesCells
            ? 'Write the state marker instead: `[x]` yes · `[-]` partly · `[!]` no · `[?]` unknown · ' +
              '`[ ]` open · `[/]` does not apply. This slide already decodes them in cells.'
            : 'Write the state marker instead — `[x]` yes · `[-]` partly · `[!]` no · `[?]` unknown · ' +
              '`[ ]` open · `[/]` does not apply — and add `state-cells` to the slide\'s class so the cells decode them ' +
              `(e.g. \`<!-- _class: ${classToken || 'table'} state-cells -->\`). The engine then ` +
              'paints the color-blind-safe status disc, which reads the same in grayscale.';
      } else {
        // The table's own coaching: the risk is stated once, then the answer
        // for each shape on the line.
        const advice = glyphs.map((g) => shapeGlyphAdvice(g, 'author')).filter(Boolean);
        message = `${glyphs.join(' ')} is typed, not drawn${also} — the deck's type family almost ` +
          'certainly has no glyph for it, so another machine substitutes a different font, a ' +
          'color emoji, or a hollow box';
        fix = advice.map((a) => a.slice(a.indexOf('. ') + 2)).join(' ');
      }
      findings.push({
        // Math.max(1, …), as the neighboring rules do: front matter is chunk 0,
        // so a glyph in a deck-wide `header:` — which DOES reach every rendered
        // slide — otherwise reported as "slide 0".
        slide: Math.max(1, idx - fm + 1),
        rule: 'typed-shape-glyph',
        severity: 'warning',
        classToken,
        line: line.trim(),
        message,
        fix,
      });
    }
  });
  return findings;
}


/**
 * A `:circle` or `:diamond` pill holding more than the shape can. WARNING, never an
 * error (HARD RULE #29's deck posture: we coach, we do not refuse the deck).
 *
 * THE BUDGET IS ONE CHARACTER, OR A NUMBER UP TO TWO DIGITS, and it is set by what
 * renders, not by a character count. Measured on the capsule-height shapes (Outfit, body
 * size), label width against the box a shape draws around it:
 *   - `3` `!` `%` `W` `12` `99` (0.3–1.2em): the circle stays round (aspect 1.00–1.09)
 *     and the diamond stays at about 2:1 or flatter;
 *   - `OK` `AB` `1/2` (1.4–1.6em): the circle is already an oval (1.2–1.3);
 *   - `WM` `100` `NEW` (1.8–2.4em): the circle is a capsule (1.4–1.8) and the diamond a
 *     sliver (2.4–2.8:1).
 * Two DIGITS fit where two LETTERS do not because digits are narrow and even; a width
 * estimate would need the deck's font metrics, which this browser-free core cannot know,
 * so the rule is the one an author can hold in their head.
 *
 * `span` is the exact inline-code span and `col` its column, so the editor underlines the
 * pill itself (the right copy, when the same pill appears twice on a line) rather than
 * the whole line. A deck or slide that switches the grammar off draws no pills, so it
 * gets no finding.
 */
const CROWDABLE_PILL_SHAPES = new Set(['circle', 'diamond']);
const INLINE_CODE_LITERAL_CLASS = 'inline-code-literal';
// GRAPHEME CLUSTERS, not code points: `é` typed as e + a combining accent, a
// skin-toned or flag emoji, and a ZWJ family are each ONE glyph on the slide and
// several code points in the string. `Intl.Segmenter` ships in Node and every browser
// the Playground supports; the code-point count is only a fallback.
const GRAPHEMES = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;
function graphemeCount(text) {
  return GRAPHEMES ? [...GRAPHEMES.segment(text)].length : [...text].length;
}
function pillFitsShape(label) {
  // `\p{Nd}`, so a two-digit number in any script counts as a number, not two letters.
  return graphemeCount(label) <= 1 || /^\p{Nd}{1,2}$/u.test(label);
}

/**
 * The inline code spans on one line, found the way CommonMark finds them: a run of N
 * backticks opens a span that only a run of EXACTLY N closes, a backslash-escaped
 * backtick opens nothing, and content that starts AND ends with a space (and is not
 * all spaces) loses one space from each end. That is the content the pill decoder
 * sees, so it is the content this rule has to judge. The engine decodes pills in
 * double-backtick spans too (`lib/integrations/markdown-it/plugins.js`), so every run
 * length counts. `start` is the column of the opening run in the line, which lets the
 * editor underline the right copy when the same span appears twice.
 * @returns {{text: string, raw: string, start: number}[]}
 */
function inlineCodeSpans(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch !== '`') { i++; continue; }
    let n = 0;
    while (line[i + n] === '`') n++;
    // Find the next run of exactly n backticks.
    let j = i + n;
    let close = -1;
    while (j < line.length) {
      if (line[j] !== '`') { j++; continue; }
      let m = 0;
      while (line[j + m] === '`') m++;
      if (m === n) { close = j; break; }
      j += m;
    }
    if (close < 0) { i += n; continue; } // an unmatched run is literal backticks
    let text = line.slice(i + n, close);
    if (text.length > 1 && text[0] === ' ' && text[text.length - 1] === ' ' && text.trim()) {
      text = text.slice(1, -1);
    }
    out.push({ text, raw: line.slice(i, close + n), start: i });
    i = close + n;
  }
  return out;
}

/** Blank every HTML comment EXCEPT a header/footer directive, which renders. Lengths and
 * newlines are kept, so the columns and line numbers stay the document's. */
function blankHiddenComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, (c) =>
    /^<!--\s*_?(?:header|footer)\s*:/.test(c) ? c : c.replace(/[^\n]/g, ' '));
}

/**
 * The line indices of `text` that render NO inline markdown, so no pill: code blocks
 * (indented and fenced), raw HTML blocks and `$$` display math, read from the engine-configured block
 * parser rather than re-modeled. A header/footer directive comment is an html_block
 * too, and it DOES render, so it stays in.
 */
function linesWithoutInlineMarkdown(text) {
  const tokens = [];
  boundaryParser.block.parse(text, boundaryParser, {}, tokens);
  const out = new Set();
  for (const t of tokens) {
    if (!t.map || !['code_block', 'fence', 'html_block', 'math_block'].includes(t.type)) continue;
    if (t.type === 'html_block' && /^\s*<!--\s*_?(?:header|footer)\s*:/.test(t.content)) continue;
    for (let n = t.map[0]; n < t.map[1]; n++) out.add(n);
  }
  return out;
}

function findCrowdedShapePills(source) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const fmText = fmBlock ? fmBlock[1] : '';
  const inlineCode = fmBlock ? frontMatterValue(fmText, 'inline-code') : null;
  const deckClass = fmBlock ? String(frontMatterValue(fmText, 'class') || '') : '';
  // The engine gates pills on the RESOLVED section class, so this reads the same three
  // signals it does: the `inline-code: literal` register, a deck-wide `class:` carrying
  // the literal token, and a per-slide or running class directive carrying it.
  const deckLiteral = (inlineCode && inlineCode.trim().toLowerCase() === 'literal') ||
    deckClass.split(/\s+/).includes(INLINE_CODE_LITERAL_CLASS);
  if (deckLiteral) return [];
  const findings = [];
  const slides = splitTopLevel(source);
  const directives = slideClassDirectives(source);
  const fm = fmChunks(source);
  slides.forEach((slide, idx) => {
    const inFrontMatter = idx < fm;
    const tokens = (directives[idx]?.payload || '').split(/\s+/).filter(Boolean);
    if (tokens.includes(INLINE_CODE_LITERAL_CLASS)) return;
    const classToken = tokens[0] || null;
    // Front matter renders pills only in its `header:` / `footer:` values. Those findings
    // are slide 0, which the editor maps to the front matter, so the underline lands on
    // the directive line instead of the first line of slide 1.
    const raw = normalizeSource(slide);
    const text = inFrontMatter ? raw : blankHiddenComments(raw);
    const candidates = [];
    text.split('\n').forEach((line, lineIdx) => {
      if (inFrontMatter && !/^\s*(?:header|footer)\s*:/.test(line)) return;
      for (const span of inlineCodeSpans(line)) {
        const pill = resolveInlinePill(span.text);
        if (!pill || !CROWDABLE_PILL_SHAPES.has(pill.shape) || pillFitsShape(pill.value)) continue;
        candidates.push({ line, lineIdx, span, pill });
      }
    });
    if (!candidates.length) return;
    // Parse the slide's blocks only when it has a candidate, so a deck with no crowded
    // pill pays nothing for this on every keystroke in the editor.
    const inert = inFrontMatter ? new Set() : linesWithoutInlineMarkdown(raw);
    for (const { line, lineIdx, span, pill } of candidates) {
      if (inert.has(lineIdx)) continue;
      const becomes = pill.shape === 'circle' ? 'an oval or a capsule' : 'a long, flat sliver';
      findings.push({
        slide: inFrontMatter ? 0 : Math.max(1, idx - fm + 1),
        rule: 'pill-shape-crowded',
        severity: 'warning',
        classToken,
        line: line.trim(),
        span: span.raw,
        col: span.start,
        message: `\`{${pill.value}}\` is too long for a ${pill.shape} — it holds one character or a ` +
          `number up to two digits, and this label stretches it into ${becomes}`,
        fix: `Use \`:tag\` or \`:chip\` for a word (\`{${pill.value}}:tag\`), or shorten the label ` +
          'to one character or two digits.',
      });
    }
  });
  return findings;
}

/**
 * A label set whose keys do not bind to the component's declared members.
 *
 * WE WARN, WE COACH (HARD RULE #29's deck posture). The author has written a key
 * that will silently do nothing — `resolveLabelSet` drops an unbound entry rather
 * than rendering a row that binds to no member — and they cannot see that from the
 * slide, because the key simply comes out one row short. This is the only channel
 * that can tell them BEFORE they render: `unboundKeys` reports the same fact into
 * the chart's `<desc>`, which a screen reader hears and the author never does.
 *
 * The vocabulary comes from the SAME generated catalog the transform renders from
 * (`labelSetFor`), so this rule cannot drift from what the component actually
 * accepts — the property that kept `coda.claims` honest.
 *
 * Three findings, and the third is why `unkeyed` exists as a manifest field:
 *   - the component declares no set at all → the whole span does nothing here;
 *   - the key is not in the vocabulary → name the keys that are;
 *   - the key is DELIBERATELY unkeyed → quote the manifest's own reason, because
 *     "unknown key" would be a lie: the grammar takes `[x]` in a matrix-grid cell,
 *     it just has no general name to put in a key.
 */
/** The components that declare a key, read from the generated catalog so this
 *  advice cannot drift from what actually renders one. */
function labelSetComponents() {
  const names = labelSetNames();
  if (!names.length) return 'no component does';
  if (names.length === 1) return `that is ${names[0]}`;
  return `those are ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// The authored state markers — what a key names when a component declares no key.
const STATE_MARKER_KEYS = new Set(['[x]', '[ ]', '[-]', '[/]']);

function findLabelSetIssues(source, vocab) {
  const findings = [];
  const slides = splitTopLevel(source);
  const directives = slideClassDirectives(source);
  const fm = fmChunks(source);
  slides.forEach((slide, idx) => {
    const tokens = (directives[idx]?.payload || '').split(/\s+/).filter(Boolean);
    const component = tokens.find((t) => vocab?.names?.has(t)) || null;
    if (!component) return;
    const declared = labelSetFor(component);
    // Only a LONE inline-code span is a label-set position (the same known
    // position `liftLabelSet` reads). A backticked set inside a sentence is
    // prose about the grammar — this very rule's own documentation, for one.
    // WHERE THE COMPONENT'S BODY STARTS, in SOURCE terms. A label set below it
    // is a key; the same span above it is read as the AXIS, because position is
    // what tells the two apart. `axisSet.body` says which opener bounds this
    // component — a grid's table row, an SVG chart's bullet — so the rule never
    // carries its own list of component names.
    const axis = axisSetFor(component);
    // WHAT COUNTS AS THE BODY, in SOURCE terms, matched to what markdown-it
    // will EMIT — the render decides from the rendered tag and this rule has to
    // agree with it or it under-warns. A table need not lead with a pipe (GFM
    // accepts `Col A | Col B` over a `--- | ---` rule), and a list may be
    // ORDERED, which is in `scatter`'s own bodyTags. Missing either left the
    // rule silent on decks the render eats.
    //
    // An INDENTED code block (four spaces) is not a list however much its first
    // line looks like one; treating it as the body put the boundary too early
    // and judged every later span "below".
    //
    // Three more shapes the render disagreed with, each found by a checker:
    // a list line inside an `<!-- -->` note is not the body (comments are
    // blanked below); a BLOCKQUOTED table or list IS, because markdown-it emits
    // its `<table`/`<ul` and the render's boundary is the first such tag
    // (`> ` markers are stripped). A tab is an indented code block too. (A
    // thematic break needs no case: Marp splits slides on every one of them.)
    const bodyOpens = (raw, i, all) => {
      const unquote = (x) => (x || '').replace(/^(?:[ \t]{0,3}>[ \t]?)+/, '');
      const l = unquote(raw);
      if (/^(?: {4,}|\t)\S/.test(l)) return false;
      if (axis.body === 'table') {
        if (l.trimStart().startsWith('|')) return true;
        // A pipeless header is a table only when the NEXT line is its rule.
        const next = unquote(all[i + 1]);
        return l.includes('|') && /^[\s:|-]*-[\s:|-]*$/.test(next) && next.includes('-');
      }
      return /^\s*([-*+]|\d+[.)])\s/.test(l);
    };
    const slideLines = blankCommentSpans(stripFencedCode(slide)).split('\n');
    const bodyAt = axis ? slideLines.findIndex((l, i, all) => bodyOpens(l, i, all)) : -1;

    slideLines.forEach((line, lineIdx) => {
      const m = line.trim().match(/^`([^`]+)`$/);
      if (!m) return;
      const set = parseInlineSet(m[1]);
      if (!set) return;
      // A KEY ABOVE THE BODY IS EATEN AS AN AXIS, silently and degenerately:
      // `[{[-], within reach}]` above a grid renders `data-col-axis="[-] ▶"`
      // and no key at all. We coach rather than refuse (HARD RULE #29's
      // posture), because the deck still renders — just not as intended.
      if (axis && bodyAt >= 0 && lineIdx < bodyAt) {
        // ABOVE THE BODY A BRACKETED LIST IS AN AXIS BY DEFINITION — that is the
        // position rule. `parseInlineSet` accepts `[{Effort, 0..10}, {Reach,
        // 0..100}]` as a set (`{key: Effort, label: 0..10}`), so without this the
        // documented axis form drew two warnings on every slide that used it,
        // one of them telling the author to DELETE a correct axis. It is a
        // misplaced KEY only when it names a member of this component's key
        // vocabulary (`[x]`, `[-]`); anything else is the axis, and silent.
        // A component with no key (scatter, quadrant, gantt) has no vocabulary
        // to ask, so the state MARKERS stand in: `[x]`, `[-]` are never an axis
        // name, and `[{[x], Enacted}]` above a scatter is a key in the wrong
        // place on the wrong component — which is what the fix below says.
        const vocabKeys = declared
          ? new Set([...declared.members, ...(declared.unkeyed || [])].map((x) => String(x.key).trim()))
          : STATE_MARKER_KEYS;
        if (!set.some((e) => vocabKeys.has(String(e.key).trim()))) return;
        findings.push({
          slide: Math.max(1, idx - fm + 1),
          rule: 'label-set-above-body',
          severity: 'warning',
          classToken: component,
          line: line.trim(),
          // Over the component's axis count the render does NOT read it as the
          // axis (`axisAcceptor`) — it stays on the slide as text — so saying
          // it "will name axes" would be false there.
          message: parseBracketList(m[1]).length > axis.members.length
            ? `this label set sits ABOVE the ${axis.body}, and has more members than \`${component}\` has axes, so it is neither the axis nor the key — it prints on the slide as text`
            : `this label set sits ABOVE the ${axis.body}, where \`${component}\` reads the AXIS — it will be used to name axes, not to rename the key`,
          // `keyBelow: false` means the component draws NO key, so "move it
          // below" is not just useless there — it puts a bracketed paragraph
          // exactly where that component's CODA lives. Telling a scatter author
          // to do that while the very next finding tells them to delete the
          // span is two instructions that contradict each other.
          fix: axis.keyBelow === false
            ? `\`${component}\` draws no key at all, so this set renames nothing wherever it sits — delete it. Above the ${axis.body} it is read as the axis (${axis.members.join(', ')}).`
            : `Move the span below the ${axis.body}. Position is what separates the two: a bracketed list above names the axes (${axis.members.join(', ')}), one below renames the key.`,
        });
        return;
      }
      if (!declared) {
        findings.push({
          slide: Math.max(1, idx - fm + 1),
          rule: 'label-set-unbound',
          severity: 'warning',
          classToken: component,
          line: line.trim(),
          message: `\`${component}\` draws no key, so this label set names nothing and is dropped`,
          // The component list comes from the CATALOG, never a string here. A
          // hand-maintained list is the drift the manifest field was bought to
          // prevent, and writing one into this very function's advice would
          // reintroduce it one layer down.
          fix: `Remove the span, or move it to a slide whose component has a key — today ${labelSetComponents()}.`,
        });
        return;
      }
      // A key written twice last-wins silently, so the author sees a key one row
      // SHORTER than what they typed — the same invisibility this rule exists to
      // end for an unbound key.
      const seen = new Set();
      for (const entry of set) {
        const k = String(entry.key).trim();
        if (seen.has(k)) {
          findings.push({
            slide: Math.max(1, idx - fm + 1),
            rule: 'label-set-unbound',
            severity: 'warning',
            classToken: component,
            line: line.trim(),
            message: `\`${k}\` is named twice in this label set, so only the last "${entry.label}" is used`,
            fix: 'Delete the earlier entry — a key addresses one member, and the key renders one row per member.',
          });
        }
        seen.add(k);
      }
      const keyed = new Set(declared.members.map((x) => String(x.key).trim()));
      const unkeyed = new Map((declared.unkeyed || []).map((u) => [String(u.key).trim(), u.why]));
      for (const entry of set) {
        const key = String(entry.key).trim();
        if (keyed.has(key)) continue;
        const known = [...keyed].map((k) => `\`${k}\``).join(' · ');
        findings.push({
          slide: Math.max(1, idx - fm + 1),
          rule: 'label-set-unbound',
          severity: 'warning',
          classToken: component,
          line: line.trim(),
          message: unkeyed.has(key)
            ? `\`${key}\` is not keyed on a \`${component}\` — ${unkeyed.get(key)}`
            : `\`${key}\` is not one of \`${component}\`'s key members, so "${entry.label}" is dropped`,
          fix: `Name one of ${known}. Naming a subset is fine — the rest keep their default words.`,
        });
      }
    });
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
  // The deck-wide `class:` tokens. The engine APPENDS these to every section, a slide's own
  // `_class:` included (lib/core/deck-class-register.js), so a front-matter `class: scale-xl`
  // scales every slide — the projection-scale rules below read it alongside the slide's own.
  const deckVenueToken = fmClaimBlock ? venueClassFromFrontMatter(fmClaimBlock[1]) : null;
  const deckClassTokens = [
    ...(fmClaimBlock ? deckClassTokensFromFrontMatter(fmClaimBlock[1]) : []),
    ...(deckVenueToken ? [deckVenueToken] : []),
  ];
  // The deck's `fit:` level token (`fit-report` / `fit-trim`, or none for the default heal),
  // read through the same entry point the engine uses. A slide's own `fit-*` / `guards-*`
  // token replaces it, as deckClassPropagate evicts it (lib/core/resolve-guards.js).
  const deckFitToken = fmClaimBlock ? fitClassFromFrontMatter(fmClaimBlock[1]) : '';
  const slideFitLevel = (tokens) => fitLevel(tokens.some((t) => isGuardsToken(t)) ? tokens : [deckFitToken]);
  // A deck that names its VENUE has said where it will be seen, so a slide over its budget
  // there is a `warning`: it will pull every slide that asked for that scale down a rung
  // (scale-fit.js rule 7). A bare `scale-*` keeps the `info` of 2026-09-25. Under
  // `fit: report` nothing steps, so a past-budget slide clips: a warning either way.
  // The tokens a slide's SCALE is read from: its own, plus the deck's — minus the deck's venue
  // when the slide names its own, which the renderer evicts (plugins.js `slideHasOwnVenue`).
  const scaleTokensFor = (tokens) => (tokens.some((t) => t.startsWith('venue-'))
    ? [...tokens, ...deckClassTokens.filter((t) => !t.startsWith('venue-'))]
    : [...tokens, ...deckClassTokens]);
  const venueSeverity = (tokens) => (tokens.some((t) => t.startsWith('venue-') && FONT_SCALE_KEYS[t]) ? 'warning' : 'info');
  const hallHint = (tokens) => (tokens.includes('venue-hall')
    ? ' At `venue: hall` even 1.5x leaves body text short of comfortable from the back row, so carry fewer words: a statement, big-number or divider slide reads there.'
    : '');

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
      if (RETIRED_WITH_OWN_RULE.has(t)) continue; // `retired-form-token` owns these
      // The candidate pool is the SAME vocabulary the check above rejected against —
      // components and modifiers together — so the suggestion can never name a token
      // this rule would immediately flag again.
      const renamed = RENAMED_CLASSES.get(t);
      if (renamed) {
        // A rename has a known answer, so it does not go through the fuzzy
        // suggester — naming the replacement outright beats a guess.
        findings.push({
          slide: idx - fm + 1,
          rule: 'unknown-class',
          severity: 'warning',
          classToken: t,
          line: m[0],
          message: `'${t}' was renamed to '${renamed.to}'`,
          fix: `Replace '${t}' with '${renamed.to}' in this slide's class. There is no alias — the old name renders as a plain \`content\` slide. ${renamed.loses}`,
        });
        continue;
      }
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
        // PROJECTION SCALE. Past the measured ceiling at the slide's scale — but not past
        // `hard`, which `capacity-overflow` / `capacity-autosplit` below already own — the
        // engine steps the slide down the font scale until it fits (lib/core/scale-fit.js).
        //
        // `info`, and a BUDGET rather than a forecast, for the reasons `capacity-autosplit`
        // is: the engine acts on the slide by itself and loses nothing, and the number is
        // measured on the capacity basis (bare component, one-line heading, elements at a
        // fixed length — 2026-07-28-capacity-basis.md), so it knows the slide is past what
        // the component holds at that scale and does not know whether these glyphs fit.
        // Scored against the engine over 70 galleries and the repro deck at scale-xl, a
        // "this renders smaller" claim was wrong on about half the slides it named —
        // `compact` and the list variants hold more than the bare component — so the
        // message says only the first thing. The export's SCALE line is the measurement.
        const scaleKey = family === 'wide' ? fontScaleKey(scaleTokensFor(tokens)) : null;
        const words = scaleKey ? Math.max(0, ...elementWordCounts(slide, cap.axis)) : 0;
        const scaled = scaleKey ? scaleCapacityFor(t, scaleKey, words) : null;
        if (scaled && n > scaled.ceiling && !(cap.hard != null && n > cap.hard) && !isStressSlide) {
          const noun = axisNoun(cap.axis, scaled.ceiling);
          findings.push({
            slide: idx - fm + 1,
            rule: 'capacity-scale',
            // A report deck has no step to fall back on, so a slide past its budget is a
            // clip the author has to act on — the same reason capacity-overflow is a warning.
            severity: slideFitLevel(tokens) === 'report' ? 'warning' : venueSeverity(scaleTokensFor(tokens)),
            classToken: t,
            line: m[0],
            // Past the DESIGNED-size budget too, the step has nowhere to go: if the slide does
            // not fit at 1x, STEP puts the requested scale back (scale-fit.js rule 2) and it
            // clips. Promising a step there would be false, so that case says so instead.
            message: n > scaled.designed
              ? `'${t}' holds about ${scaled.designed} ${axisNoun(cap.axis, scaled.designed)} of up to ${scaled.words} words even at the designed size (${scaled.ceiling} at scale-${scaleKey}); this slide has ${n} — if it does not fit at 1x, stepping the font scale down cannot save it and it is clipped`
              : slideFitLevel(tokens) === 'report'
                ? `at ${FONT_SCALE_VALUE[scaleKey]}x '${t}' holds about ${scaled.ceiling} ${noun} of up to ${scaled.words} words; this slide has ${n}, and \`fit: report\` stops the engine from stepping it down — if it does not fit at ${FONT_SCALE_VALUE[scaleKey]}x, it is clipped`
                : `at ${FONT_SCALE_VALUE[scaleKey]}x '${t}' holds about ${scaled.ceiling} ${noun} of up to ${scaled.words} words (${scaled.designed} at the designed size); this slide has ${n} — if it does not fit at ${FONT_SCALE_VALUE[scaleKey]}x, every slide that asked for ${FONT_SCALE_VALUE[scaleKey]}x renders at the largest smaller scale they all fit, so they stay one size, and the export's SCALE line names this page as one to trim`,
            fix: `To keep the full scale on every slide that asked for it, keep ${scaled.ceiling} ${noun} or fewer, or split the slide. ${capacityFix(cap)}${hallHint(scaleTokensFor(tokens))}`,
          });
          // No `break`: the designed-size crowd rule below still applies to the same slide.
        }
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
          // `fit: report` switches the split off too, so past `hard` the slide is on its own
          // exactly as it is at `wide`: the overflow warning, not the split advisory.
          if (family === 'wide' || slideFitLevel(tokens) === 'report') {
            findings.push({
              slide: idx - fm + 1,
              rule: 'capacity-overflow',
              severity: 'warning',
              classToken: t,
              line: m[0],
              message: `'${t}' holds about ${comfort} ${axisNoun(cap.axis, comfort)} comfortably (max ~${cap.hard}); this slide has ${n}, and ${family === 'wide' ? 'a landscape @size does not paginate' : '`fit: report` stops the engine from dividing it'} — so if it does not fit, it is clipped` + (cap.note ? ` (${cap.note})` : ''),
              // Naming the non-split is the part an author cannot infer: every other @size
              // paginates, and the silence at landscape would otherwise read as a bug. What this
              // must NOT promise is the ring — the emulator strips the overflow marker before
              // printing ("a red box in front of a board is worse than the silent clip",
              // lattice-emulator.js), so the only signal outside this warning is a build-time
              // stderr line. An earlier draft of this string promised "clipped and ringed"; the
              // ring never reaches the artifact.
              fix: family === 'wide'
                ? `${capacityFix(cap)} Nothing will divide it for you at a landscape @size, and the export tags the clipped slide "Content clipped" rather than dividing it — check the rendered page, or present at a portrait/square @size, where it paginates.`
                : `${capacityFix(cap)} Nothing will divide it for you under \`fit: report\` — set \`fit: heal\` (the default) to let the engine split it.`,
            });
            continue;
          }
          {
            // The split is EXACT and knowable, so this advisory states it rather than bounding
            // it: one structural element per page, plus a cover, plus a closing page when the
            // slide has trailing material (2026-09-01). Mirrors lib/core/auto-split.js
            // `splitTargetOf`, which is the constant 1.
            //
            // It used to be a FLOOR — `cap.perPage ?? sweet ?? soft ?? hard`, spread evenly,
            // and then only "or more" because the measured trigger could cut smaller pages
            // than the manifest asked for. Both halves of that are gone: nothing reads those
            // budgets to size a cut, and no measurement moves the answer. An author can now be
            // told exactly what their slide becomes.
            const pages = n;
            const hasHeadline = /^##\s/m.test(slide);
            // A trailing key insight (`> `) or an italic annotation earns the run's closing
            // page. Probed the same way the engine resolves it — trailing material AFTER the
            // collection — so the count the author is told matches the deck they get.
            const closes = /^>\s/m.test(slide) || /^_[^_]+_\s*$/m.test(slide);
            const shape = [hasHeadline ? 'a cover' : null, `${pages} pages of 1`, closes ? 'a closing page' : null]
              .filter(Boolean).join(' + ');
            // NOT `cap.hard`. Trimming to the capacity band no longer keeps a slide whole — the
            // trigger is structure, so TWO members split just as three hundred do, and telling an
            // author to trim to `hard` sends them to do work that changes nothing. The honest
            // advice is the actual threshold, which is one.
            const noun1 = axisNoun(cap.axis, 1);
            const trim = `To keep it on ONE slide it has to hold a single ${noun1} — the trigger is `
              + `structure, so two split the same as twenty, and trimming to ${cap.hard} still splits.`;
            findings.push({
              slide: idx - fm + 1,
              rule: 'capacity-autosplit',
              severity: 'info',
              classToken: t,
              line: m[0],
              message: `'${t}' holds about ${comfort} ${axisNoun(cap.axis, comfort)} comfortably; this slide has ${n}, so at ${family} auto-split makes it ${shape} — one ${axisNoun(cap.axis, 1)} per page`,
              fix: hasHeadline
                ? `Intended? Nothing to do — the run leads with a cover and every page is paced the same. ${trim}`
                : `Intended? Every page is paced the same, but this slide has no \`## \` headline, so the run gets no cover page to open on — add one. ${trim}`,
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
    // budget in the table, so a line it passes at 102 columns is cut to a third
    // when the same source is presented at `tall`. Advisory is the honest
    // register for a measurement that narrow.
    // A modifier that resizes the stage moves the pane with it, and the budget
    // table is keyed by (layout, family) only — so on these slides it is simply
    // the wrong number. MEASURED at `wide`: bare `code` gives a 1104px pane (102
    // columns), `claim-hero` and `claim-bleed` give 1172px (109), and `compact`
    // gives 1116px (103). Judging a `claim-hero` slide against 102 tells an author
    // that seven columns are "clipped off the rendered slide" when they are on it
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
          // block fits nearly twice what a half-pane does (102 vs 57), so a
          // pair where only ONE side is wide is often better authored as two
          // slides than trimmed.
          ? `Trim the line to ${budget} columns or fewer — wrapping the arguments across lines keeps it valid in most languages. If the snippet genuinely needs the width, give it a full-width \`code\` slide instead, which fits about ${CODE_LINE_BUDGET.code[family]}.`
          // The budget checked is the deck's OWN @size. A `code` block never
          // wraps in any box, so the same source presented at a narrower @size
          // clips far sooner — say so, rather than letting "fits about 102" read
          // as a guarantee it is not.
          : `Trim the line to ${budget} columns or fewer, or break the statement across lines.`
            + (family === 'wide' ? ` Note this is the landscape budget: \`code\` never wraps, so at a portrait or square @size the same block fits only about ${CODE_LINE_BUDGET.code.tall}–${CODE_LINE_BUDGET.code.square} columns.` : ''),
      });
    }

    // Rule — a `code` block past what its pane holds at the deck's PROJECTION SCALE.
    // Code keeps scaling (CODE_LINES_AT_SCALE says why), so at scale-xl the pane holds
    // fewer lines and fewer columns than at the designed size. Past either, the engine
    // steps the slide down until the block fits (lib/core/scale-fit.js) — nothing is cut,
    // but the slide renders smaller than the deck. The pane is measured under a one-line
    // heading; a heading that wraps costs a line more, which this does not see. Only the part of the range the
    // designed-size rules do not already own: a line past the designed-size budget is
    // `code-line-clipped` above, and it clips at every scale.
    const codeScale = family === 'wide' && tokens.includes('code') && !stageResized
      && !/<!--\s*stress-slide\s*-->/.test(slide)
      ? fontScaleKey(scaleTokensFor(tokens)) : null;
    if (codeScale) {
      const lines = tallestCodeBlock(slide);
      const lineRow = CODE_LINES_AT_SCALE[hasEyebrow(slide) ? 'eyebrow' : 'bare'];
      const lineCap = lineRow[FONT_SCALE_ORDER.indexOf(codeScale)];
      // Past the DESIGNED-size pane the block does not fit at 1x either, so STEP puts the
      // scale back and the slide clips (scale-fit.js rule 2). That is a real cut, so it is
      // a `warning`, and it must not say "nothing is clipped".
      const clipsAtOne = tallestCodeBlock(slide) > lineRow[0];
      const codeReport = slideFitLevel(tokens) === 'report';
      const colCap = Math.floor(CODE_LINE_BUDGET.code.wide / FONT_SCALE_VALUE[codeScale]);
      const wide = widestCodeLine(slide);
      const cols = wide && wide.columns <= CODE_LINE_BUDGET.code.wide ? wide.columns : 0;
      const over = [
        lines > lineCap ? `${lines} lines (the pane holds about ${lineCap})` : null,
        cols > colCap ? `a ${cols}-column line (the pane holds about ${colCap})` : null,
      ].filter(Boolean);
      if (over.length) {
        findings.push({
          slide: idx - fm + 1,
          rule: 'capacity-scale',
          // `info`, like the count rule above: nothing is cut, the engine steps the slide.
          // Unlike it, this one is exact — a line is a line, and the pane was measured with
          // and without an eyebrow — so it states the outcome rather than a budget. The one
          // exception is a block too tall for the pane at ANY scale, which clips.
          severity: clipsAtOne || codeReport ? 'warning' : venueSeverity(scaleTokensFor(tokens)),
          classToken: 'code',
          line: m[0],
          message: clipsAtOne
            ? `this code block has ${over.join(' and ')} at scale-${codeScale}, and more lines than the pane holds even at the designed size (about ${lineRow[0]}), so stepping the font scale down cannot fit it — the slide is clipped`
            : codeReport
              ? `at ${FONT_SCALE_VALUE[codeScale]}x this code block has ${over.join(' and ')}, and \`fit: report\` stops the engine from stepping the slide down — it is clipped`
              : `at ${FONT_SCALE_VALUE[codeScale]}x this code block has ${over.join(' and ')}, so every slide that asked for ${FONT_SCALE_VALUE[codeScale]}x renders at a smaller font scale to fit it, keeping them one size — nothing is clipped`,
          fix: `Cut the block to ${lineCap} lines of ${colCap} columns or fewer — trim scaffolding with \`// ...\` — or split it across two slides.`,
        });
      }
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
      // `insight-*` governs the `--insight-label` SEAM, not the block — and one
      // layout paints that seam on a surface of its own while still claiming the
      // blockquote (split-compare's verdict tag, declared `readsInsightLabel`).
      // Asking only whether the layout renders the key-insight BLOCK reported a
      // modifier inert on the very deck that documents it renaming a real surface.
      if (tokens.some((t) => /^insight-/.test(t))
        && !supportsBlock(componentToken, 'key-insight')
        && !readsInsightLabel(componentToken)) {
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

    // Rule — a `list` counter modifier that its register never reads.
    //
    // `list` carries three registers and two modifier sets, and they do not cross over:
    // `numbered` belongs to `takeaway`; `lettered`/`roman`/`bullet` belong to `principles`;
    // and `principles` numbers an ORDERED list only. Every mismatch rendered something
    // plausible and silent — `principles` over `-` bullets drew the default pills, and
    // `takeaway` over `1.` hid the numbers the author typed. The manifest's
    // `commonMistakes` documented the first two; nothing surfaced them on the slide.
    if (tokens.includes('list')) {
      const kind = topLevelListKind(slide);
      const inertList = [];
      if (tokens.includes('numbered') && !tokens.includes('takeaway')) {
        inertList.push({ token: 'numbered', why: '`numbered` only adds a counter to `takeaway` rows', fix: 'Use `list takeaway numbered`, or drop `numbered` (a plain `list` already numbers a `1.` list).' });
      }
      for (const t of ['lettered', 'roman', 'bullet']) {
        if (tokens.includes(t) && !tokens.includes('principles')) {
          inertList.push({ token: t, why: `\`${t}\` only switches the \`principles\` counter`, fix: `Use \`list principles ${t}\`, or drop \`${t}\`.` });
        }
      }
      if (tokens.includes('principles') && kind === 'ul') {
        inertList.push({ token: 'principles', why: '`principles` numbers an ordered list, so `-` bullets render as the default pills', fix: 'Write the principles as `1.` items (use `principles bullet` for dots instead of numbers).' });
      }
      if (tokens.includes('takeaway') && !tokens.includes('numbered') && kind === 'ol') {
        inertList.push({ token: 'takeaway', why: '`takeaway` hides the numbers of a `1.` list unless `numbered` is set', fix: 'Add `numbered` to show the counters, or write `-` bullets if order does not matter.' });
      }
      for (const { token, why, fix } of inertList) {
        findings.push({
          slide: idx - fm + 1,
          rule: 'list-modifier-inert',
          severity: 'warning',
          classToken: token,
          line: m[0],
          message: `${why}.`,
          fix,
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
          fix: '_focus: <axis> <ordinal> — e.g. row 4, item 3, col 5, cell 4,5, line 3-4, mark 2, series 1.',
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

    // Rule 12 — the `topic` anchor's `_track` override. Read off the text the
    // RENDERER sees, so a slide that DOCUMENTS the syntax in a fenced block is not
    // warned about its own example (the sibling rule below already did this).
    const td = liveTrackDirective(slide);
    if (td && !td.spot) {
      // The BARE form is Marpit's DECK-WIDE directive: it applies here and to every
      // slide after it, so one missing underscore silently overrides the rest of the
      // deck. Measured: `<!-- track: Alpha | [Beta] -->` on a divider stamps
      // `data-track` on that slide AND both following `topic` slides, which then
      // draw `Alpha | Beta` instead of their own derived scale.
      findings.push({
        slide: idx - fm + 1,
        rule: 'track-directive',
        severity: 'warning',
        line: td.line,
        message: 'a bare `track:` is the DECK-WIDE form — it overrides this slide and every one after it',
        fix: 'Write `_track:` with the underscore to scope it to this slide. There is no deck-wide use for a track: every section has its own topics.',
      });
    } else if (td) {
      const { labels, current } = parseTrackSpec(td.value);
      if (!tokens.includes('topic')) {
        findings.push({
          slide: idx - fm + 1,
          rule: 'track-directive',
          severity: 'warning',
          line: td.line,
          message: '_track does nothing on a slide that is not `topic`',
          fix: 'The sibling track is the `topic` anchor\'s own band. Drop the directive, or make the slide `<!-- _class: topic -->`.',
        });
      } else if (tokens.includes('fact')) {
        // `fact` is one flat canvas with no scale — its CSS drops the track. So a
        // `_track` there renders NOTHING, and it still opts the slide out of
        // derivation, which costs that topic its name in every SIBLING's track.
        // Measured: a three-topic section whose `fact` slide carries `_track`
        // leaves its two siblings showing a two-topic scale.
        findings.push({
          slide: idx - fm + 1,
          rule: 'track-directive',
          severity: 'warning',
          line: td.line,
          message: '_track draws nothing on `topic fact` — and it still withholds this topic\'s name from its siblings\' tracks',
          fix: '`fact` is one flat canvas: it has no track to override. Drop the directive — the slide then keeps contributing its heading to the section\'s other tracks — or drop `fact` if you want the scale.',
        });
      } else if (labels.length < MIN_TRACK_LABELS) {
        findings.push({
          slide: idx - fm + 1,
          rule: 'track-directive',
          severity: 'warning',
          message: `_track names ${labels.length === 1 ? 'one label' : 'no labels'} — a scale of one is not a scale, so NO track is drawn`,
          line: td.line,
          fix: '_track: Cost to win | Lifetime value | [Payback] — two labels or more, pipe-separated. Remove the directive to derive the track from the section\'s own headings.',
        });
      } else if (current === -1) {
        findings.push({
          slide: idx - fm + 1,
          rule: 'track-directive',
          severity: 'warning',
          message: '_track marks no current topic, so the track draws with no column lit',
          line: td.line,
          fix: 'Put the topic this slide IS in square brackets — `… | [Payback] | …`.',
        });
      }
    }

    // Rule 13 — the retired authored-`<ul>` override on a `topic` slide.
    if (tokens.includes('topic') && TOP_LEVEL_BULLET.test(renderedBody(slide))) {
      findings.push({
        slide: idx - fm + 1,
        rule: 'track-list',
        severity: 'warning',
        line: (renderedBody(slide).match(TOP_LEVEL_BULLET) || [''])[0].trim(),
        message: 'a list on a `topic` slide is no longer the track — it renders as content, and the slide still derives its own track',
        fix: 'Move the labels into the directive: `<!-- _track: Cost to win | Lifetime value | [Payback] -->`, with the current topic in brackets. Delete the list — or delete the directive too and let the track derive from the section\'s headings.',
      });
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
  findings.push(...findLabelSetIssues(source, vocab));
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
  if (vocab.inlineCodeNames) findings.push(...findUnknownInlineCode(source, vocab.inlineCodeNames));
  if (vocab.headlineNames) findings.push(...findUnknownHeadline(source, vocab.headlineNames));
  if (vocab.liftNames) findings.push(...findUnknownLift(source, vocab.liftNames));
  if (vocab.venueNames) findings.push(...findUnknownVenue(source, vocab.venueNames));
  // The `preset:` register — one word for the accent + surface family. An unknown name
  // resolves to no preset, so every register silently falls back to its default.
  if (vocab.presetNames) findings.push(...findUnknownPreset(source, vocab.presetNames));
  if (vocab.cardsNames) findings.push(...findUnknownCards(source, vocab.cardsNames));
  if (vocab.cornersNames) findings.push(...findUnknownCorners(source, vocab.cornersNames));
  if (vocab.guardsNames) findings.push(...findUnknownGuards(source, vocab.guardsNames));
  if (vocab.fitNames) findings.push(...findFitRegister(source, vocab.fitNames));
  // The deck-wide `pace:` register (presentation rhythm). An unknown value falls through to
  // the viewer's own preset, so the author's directorial choice silently does nothing — the
  // one register whose typo is invisible on the AUTHOR's machine and only wrong on someone
  // else's. Gated on injected vocab.
  if (vocab.paceNames) findings.push(...findUnknownPace(source, vocab.paceNames));
  if (vocab.deliveryNames) findings.push(...findUnknownDelivery(source, vocab.deliveryNames));
  // The three RENDER-TARGET keys (`fluid:` / `player:` / `present:`) carrying a value in
  // neither the on nor the off vocabulary. The quietest failure in front matter: the value
  // reads as off, the ordinary artifact is written, and the deck looks right on every
  // surface the author can check. Self-contained (vocabulary from the kernel, no vocab).
  findings.push(...findBadRenderTargetValues(source));
  // The same three keys written INDENTED. The export reads a nested `fluid:` as the deck's
  // own register — the union reader's one false-ON — so an on-value under some other key
  // opts the deck in while YAML shows the author a nested value. Self-contained (no vocab).
  findings.push(...findNestedRenderTargetKeys(source));

  // A leftover top-level `backdrop:` block is retired (backdrop is a baked finish layer
  // now) — flag it with the migration to `finish-override:`. Needs no vocab.
  findings.push(...findRetiredBackdrop(source));
  if (vocab.backdropNames) findings.push(...findUnknownBackdrop(source, vocab.backdropNames));

  // A single-letter/digit `lexicon:` key mis-narrates the whole deck (it rewrites every
  // embedded occurrence, not just the standalone token). Warn. Self-contained (no vocab).
  findings.push(...findSingleLetterLexiconKeys(source));

  // A leftover `form:` key or `form` / `no-form` slide token is retired — Form is
  // the composition model and is not configurable. Coach the deletion. Needs no vocab.
  findings.push(...findRetiredFormKey(source));
  findings.push(...findRetiredFormTokens(source));
  findings.push(...findStrayOverflowMarker(source));

  // A deck-authored inline `<script>` that defers its work loses that work at export —
  // the render warns at capture, this warns while the deck is being written. Universal,
  // self-contained (no injected vocab). #1792.
  findings.push(...findAuthorScriptDefers(source));

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
  findings.push(...findQuadrantAxisIssues(source));

  // Rule 12b — a shell SCRIPT tagged with a shell SESSION grammar. Universal: it
  // depends on the fence tag and body, not on the slide's component.
  findings.push(...findShellFenceTags(source));

  // Rule 13 — `autosplit:` is RETIRED. Flag it rather than ignore it: silence would read
  // as "this still works", and a deck carrying `autosplit: off` would look opted-out while
  // the engine paginated it anyway. Universal rule, deck-level (front-matter only).
  findings.push(...findRetiredAutosplitDirective(source));

  // Rule 14 — `paginate: skip` / `hold` are Marp values Lattice downgrades to `false` in
  // silence. Same reasoning as rule 13: the deck renders, so nothing tells the author the
  // renumbering they asked for is not happening.
  findings.push(...findUnsupportedPaginateValues(source));

  // Rule 15 — typed shape glyphs (HARD RULE #29). Universal, self-contained, and
  // a WARNING by design: we coach the author, we do not refuse their deck.
  findings.push(...findTypedShapeGlyphs(source));

  // `:circle` / `:diamond` pills past their budget — one character, or a number up to two
  // digits. A WARNING, because past it the shape visibly stops being the shape.
  findings.push(...findCrowdedShapePills(source));

  // Rule 16 — `[ ]` on the two layouts where its meaning MOVED with the six-marker
  // grammar. INFO, never a warning: `[ ]` is a legitimate answer (open / not assessed /
  // undetermined), so this names the change rather than calling the deck wrong.
  findings.push(...findMovedEmptyBoxes(source));

  return findings;
}

/**
 * Rule 16 — an empty box on a layout whose reading of it CHANGED.
 *
 * The six-marker grammar (lib/core/state-marks.js) gave every marker one meaning in
 * every layout. Three layouts used to read `[ ]` their own way, and a deck written
 * before the change still says what it meant then:
 *
 *   verdict-grid       `[ ]` was "not met" (red ✕). It is now the open ring, "not
 *                      assessed". "Not met" is `[!]`.
 *   pricing            `[ ]` drew the same red ✕ (it borrowed verdict-grid's decoder).
 *                      It is now the open ring, "coming". A missing feature is `[!]`;
 *                      one the tier leaves out on purpose is `[/]`.
 *   obligation-matrix  `[ ]` was keyed "exempt". It is now "undetermined". Exempt is `[/]`.
 *
 * WHICH SLIDES. Only a slide that carries NO `[!]` and NO `[?]`: a deck written before
 * the change cannot contain either, and a slide that uses one was written for the six
 * markers, so its `[ ]` means what it says. A label set naming `[ ]` in inline code
 * (`` `[{[ ], Controlled}]` ``) is the author answering the question, so it is silent too.
 *
 * THE FIX. verdict-grid and pricing get a MACHINE fix (`lint:deck --fix`): every one of
 * the 43 verdict-grid `[ ]` in the shipped decks meant "not met", and a pricing `[ ]` drew
 * the identical cross, so `[!]` reproduces exactly what the slide rendered before.
 * obligation-matrix gets advice only — reading the shipped decks, 17 of 37 empty boxes
 * meant something other than exempt, so no rewrite is safe.
 *
 * `shapeChange: true` — the render moved — so the RENDER path repeats these on stderr
 * (lattice-emulator.js), the Form-retirement precedent: a deck that changed shape with
 * a successful exit code and no other sign is the failure this exists to stop.
 * engineering/decisions/2026-09-24-six-state-marks.md §7, §10.
 */
// A criterion (verdict-grid) or feature row (pricing) is a NESTED list item.
const NESTED_EMPTY_BOX = /^\s+(?:[-*+]|\d+[.)])\s+\[ \]/;
// A table cell LED by the empty box — trailing text allowed, closing pipe optional.
const CELL_EMPTY_BOX = /(?:^|\|)\s*\[ \](?=\s|\||$)/;
const MOVED_EMPTY_BOX = Object.freeze({
  'verdict-grid': {
    now: 'the open ring, "not assessed"',
    was: 'the red cross, "not met"',
    fix: 'If a criterion was not met, write `[!]`, which draws the red cross — `lint:deck ' +
      '--fix` rewrites every `[ ]` on this slide. Keep `[ ]` only for a criterion nobody has ' +
      'assessed yet.',
    short: 'Write `[!]` where a criterion was not met.',
    line: NESTED_EMPTY_BOX,
    autofix: true,
  },
  pricing: {
    now: 'the open ring, "coming"',
    was: 'the red cross, "missing"',
    fix: 'If the tier lacks the feature, write `[!]` (the red cross it drew before — `lint:deck ' +
      '--fix` rewrites every `[ ]` on this slide) or `[/]` for "not on this plan", muted. ' +
      'Keep `[ ]` only for a feature that is coming.',
    short: 'Write `[!]` where the tier lacks the feature, or `[/]` for "not on this plan".',
    line: NESTED_EMPTY_BOX,
    autofix: true,
  },
  'obligation-matrix': {
    now: '"undetermined" in the key',
    was: '"exempt"',
    fix: 'If the regime is exempt, write `[/]`, which the key names "Exempt". Keep `[ ]` for ' +
      'an obligation nobody has determined yet, or name it with a label set: ' +
      '`[{[ ], Controlled}]`.',
    short: 'Write `[/]` where the regime is exempt, or `[!]` where the duty is not required.',
    line: CELL_EMPTY_BOX,
    table: true,
  },
});
// SLIDES, NOT CHUNKS. `split: headings` is the DEFAULT (lib/core/resolve-split.js: an
// absent or unknown `split:` resolves to it), so a `---` chunk can hold several rendered
// slides: the engine opens a new one before every h1/h2 after the first, pulling the
// boundary back over that heading's lead-in (directive comments, an eyebrow). This
// module does not parse markdown (it ships eagerly to the Studio, where a parser would
// cost the route budget), so it mirrors that rule on lines: `headingSubSlides` below.
// An earlier cut withheld the rewrite whenever `split: headings` was SPELLED OUT, which
// missed the default, and `--fix` rewrote a neighboring checklist's `[ ]` as `[!]`.
const SPLIT_RULE = /^[ \t]*split:[ \t]*["']?rule["']?[ \t]*(?:#.*)?$/im;
function splitsOnHeadings(source) {
  const fm = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  return !(fm && SPLIT_RULE.test(fm[1]));
}
const H1_H2 = /^ {0,3}#{1,2}(?:[ \t]|$)/;
const EYEBROW_LINE = /^[ \t]*`[^`\n]+`[ \t]*$/;
// `[^>]*` cannot cross the closing `>`, so the match is linear on any line.
const LOCAL_CLASS = /<!--\s*_class:([^>]*)-->/;

/**
 * The rendered slides inside one `---` chunk under `split: headings`, as line ranges
 * `[start, end)` in the chunk's own lines. Line-level mirror of
 * lib/core/heading-split-core.js `headingSplitPoints`: a boundary before every h1/h2
 * but the first, pulled back over blank lines, comment-only lines and a one-code-span
 * eyebrow. Fenced code and comments never count as headings (`renderedBody` blanks them).
 */
function headingSubSlides(chunk) {
  const raw = chunk.split('\n');
  const body = renderedBody(chunk).split('\n');
  const uncommented = withoutHtmlComments(chunk).split('\n');
  const fenced = stripFencedCode(chunk).split('\n');
  const heads = [];
  body.forEach((l, i) => { if (H1_H2.test(l)) heads.push(i); });
  const starts = [0];
  for (let h = 1; h < heads.length; h++) {
    let at = heads[h];
    while (at - 1 > heads[h - 1]) {
      const prev = at - 1;
      const blank = !raw[prev].trim();
      const commentOnly = !uncommented[prev].trim() && fenced[prev].trim() !== '';
      const eyebrow = EYEBROW_LINE.test(body[prev]);
      if (blank || commentOnly || eyebrow) at = prev; else break;
    }
    starts.push(at);
  }
  return starts.map((s, i) => [s, i + 1 < starts.length ? starts[i + 1] : raw.length]);
}

// A slide written for the six markers — it uses one of the two that did not exist before.
const SIX_MARKER_SLIDE = /\[[!?]\]/;
// A label set, in inline code, that names the empty box.
const NAMES_EMPTY_BOX = /`[^`\n]*\{\s*\[ \]\s*,[^`\n]*`/;

function findMovedEmptyBoxes(source) {
  const findings = [];
  const slides = splitTopLevel(source);
  const directives = slideClassDirectives(source);
  const fm = fmChunks(source);
  const headings = splitsOnHeadings(source);
  let rendered = 0;
  slides.forEach((chunk, idx) => {
    if (idx < fm) return;
    const subs = headings ? headingSubSlides(chunk) : [[0, chunk.split('\n').length]];
    const raw = chunk.split('\n');
    const fenced = stripFencedCode(chunk).split('\n');
    const body = renderedBody(chunk).split('\n');
    subs.forEach(([start, end], sub) => {
      const slideNo = rendered + sub + 1;
      // The class. In a chunk the engine splits, the chunk-level winner may be a
      // NEIGHBOR's local directive, so each slide reads its own local `_class`, and a
      // slide without one is left alone rather than judged under the wrong class.
      let payload = null;
      if (subs.length === 1) {
        // The chunk IS the slide: the directive scanner already resolves which of its
        // directives governs it, exactly as the engine does. Never second-guess it.
        payload = directives[idx]?.payload || '';
      } else {
        for (let i = start; i < end && payload == null; i++) {
          const m = fenced[i].trim() ? LOCAL_CLASS.exec(raw[i]) : null;
          if (m) payload = m[1].trim();
        }
      }
      const tokens = String(payload || '').split(/\s+/).filter(Boolean);
      // The engine decodes by class ANYWHERE in the list (`heat obligation-matrix`,
      // `dark verdict-grid`), so the rule does too.
      const classToken = tokens.find((t) => Object.hasOwn(MOVED_EMPTY_BOX, t)) || null;
      if (!classToken) return;
      const rule = MOVED_EMPTY_BOX[classToken];
      // `renderedBody`: fences and HTML comments blanked in place (an UNTERMINATED
      // `<!--` to the end, as a browser hides it), so quoted or hidden text is never
      // read as a criterion, and line positions still match the source.
      const slideBody = body.slice(start, end).join('\n');
      if (SIX_MARKER_SLIDE.test(slideBody) || NAMES_EMPTY_BOX.test(slideBody)) return;
      const hits = [];
      for (let i = start; i < end; i++) {
        if ((rule.table ? body[i].includes('|') : true) && rule.line.test(body[i])) hits.push(i);
      }
      if (!hits.length) return;
      const also = hits.length > 1 ? ` (${hits.length} on this slide)` : '';
      findings.push({
        slide: slideNo,
        rule: 'moved-empty-box',
        severity: 'info',
        shapeChange: true,
        classToken,
        line: raw[hits[0]].trim(),
        message: `\`[ ]\` on ${classToken} now draws ${rule.now}${also}. It used to draw ` +
          `${rule.was}.`,
        fix: rule.fix,
        short: rule.short,
        // The rewrite names its chunk and its exact lines, so it can only ever touch the
        // lines this finding judged — never a neighbor that shares the chunk.
        ...(rule.autofix
          ? { autofixable: true, rewriteSlide: { chunk: idx, lines: hits, line: rule.line.source, from: '[ ]', to: '[!]' } }
          : {}),
      });
    });
    rendered += subs.length;
  });
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
 * Blank every `<!-- … -->` span markdown-it treats as a comment, keeping newlines
 * so line indices still match the source.
 *
 * Only what markdown-it treats as one: an HTML-block comment opens at a line start
 * (up to three spaces of indent) and may run unclosed to the end; an inline one
 * needs its `-->` inside the same paragraph (no blank line between). Anywhere else
 * — `<!--` quoted in a code span, or prose that mentions it — it is text, and
 * blanking from it hid the rest of the slide from the rules.
 *
 * ONE FORWARD PASS, and that is a measured requirement rather than a style. This
 * reads untrusted markdown on the browser's main thread (HARD RULE #22), and an
 * earlier cut re-searched for `-->`, re-walked to the line start and re-counted the
 * line's backticks at every skipped `<!--`: 280 KB of `a <!--` lines took 12 s. Here
 * the line start and backtick parity advance with the scan, and the next `-->` and
 * the next blank line are each found once and reused until the scan passes them,
 * so every character is visited a bounded number of times.
 */
function blankCommentSpans(text) {
  const src = String(text ?? '');
  const n = src.length;
  // `\r` too. Slides reach this LF-normalized (`splitTopLevel`), so a CRLF blank
  // line (`\n\r\n`) only matters to a direct caller; it costs nothing to cover.
  const blankRe = /\n[ \t\r]*\n/g;
  let out = '';
  let at = 0;
  let lineStart = 0;
  let ticks = 0;
  let close = -2; // next `-->` at or after the scan; -2 unknown, -1 none left
  let blank = -2; // next blank line at or after the scan; same encoding
  let i = 0;
  while (i < n) {
    const c = src.charCodeAt(i);
    if (c === 10) { lineStart = i + 1; ticks = 0; i++; continue; }
    if (c === 96) { ticks++; i++; continue; }
    if (c !== 60 || !src.startsWith('<!--', i)) { i++; continue; }
    if (close !== -1 && close < i + 4) close = src.indexOf('-->', i + 4);
    if (blank !== -1 && blank < i) {
      blankRe.lastIndex = i;
      const m = blankRe.exec(src);
      blank = m ? m.index : -1;
    }
    const indent = i - lineStart;
    let atLineStart = indent <= 3;
    for (let k = lineStart; atLineStart && k < i; k++) if (src.charCodeAt(k) !== 32) atLineStart = false;
    const closesInParagraph = close >= 0 && (blank < 0 || close < blank);
    if (ticks % 2 === 1 || (!atLineStart && !closesInParagraph)) { i += 4; continue; }
    const end = atLineStart ? (close < 0 ? n : close + 3) : close + 3;
    out += src.slice(at, i) + src.slice(i, end).replace(/[^\n]/g, ' ');
    // Search back only across the span just blanked. An unbounded lastIndexOf
    // re-walked the whole line before it, so `<!-- x -->` repeated on one line
    // was quadratic again (40k pairs: 2.7 s).
    for (let k = end - 1; k >= i; k--) if (src.charCodeAt(k) === 10) { lineStart = k + 1; break; }
    ticks = 0;
    at = end;
    i = end;
  }
  return out + src.slice(at);
}

/**
 * Quadrant axis validation. The axis is ONE bracketed list above the chart's list
 * (engineering/decisions/2026-09-22-chart-axis-grammar.md); two things read wrong
 * without a word from the render, so this names them:
 *
 *  - `quadrant-retired-axis` (error) — the retired `Effort 0–10 → Reach 0–100 ·
 *    targets 5, 50` eyebrow. The render now treats it as an ordinary eyebrow, so
 *    the axes lose their names AND their authored domain: the points MOVE, to a
 *    scale derived from the data. That is why this is an error, like gantt's
 *    retired delimiter, and not coaching. Autofixable to the bracketed form.
 *  - `quadrant-axis-part` (warning) — a member part that is neither a domain
 *    (`0..10`, max above min) nor a threshold (a number). The render ignores it
 *    and derives the number; saying so beats a silent fallback.
 *
 * Only a code-only line ABOVE the first list line is an axis position — the same
 * slot the render reads. `radar quadrant` is radar's own grammar and is skipped.
 */
function findQuadrantAxisIssues(source) {
  const findings = [];
  const slides = splitTopLevel(source);
  const directives = slideClassDirectives(source);
  const fm = fmChunks(source);
  slides.forEach((slide, idx) => {
    const tokens = (directives[idx]?.payload || '').split(/\s+/).filter(Boolean);
    if (!tokens.includes('quadrant') || tokens.includes('radar')) return;
    const slideNo = Math.max(1, idx - fm + 1);
    // Comments blanked (line count kept): an axis line inside `<!-- -->` is not
    // on the slide, so it is neither read by the render nor fixed here.
    const lines = blankCommentSpans(stripFencedCode(slide)).split('\n');
    let seenAxis = false;
    for (const line of lines) {
      if (/^ {0,3}([-*+]|\d+[.)])\s/.test(line)) break;
      const m = line.match(/^[ \t]*`([^`\n]+)`[ \t]*$/);
      if (!m) continue;
      const text = m[1].trim();
      if (text.startsWith('[')) {
        const members = parseBracketList(text, { maxParts: 3 });
        if (!members || seenAxis) continue;
        if (members.length > 2) {
          // The render refuses it (`axisAcceptor`) rather than read two members
          // and drop the rest, so it prints on the slide as text. Say so.
          findings.push({
            slide: slideNo, rule: 'quadrant-axis-part', severity: 'warning',
            classToken: 'quadrant', line: line.trim(),
            message: `this list has ${members.length} members but a quadrant has two axes, so it is not read as the axis — it prints on the slide as text`,
            fix: 'Keep two members, x then y: `[{Effort, 0..10}, {Reach, 0..100}]`.',
          });
          continue;
        }
        seenAxis = true;
        const bad = members.slice(0, 2).flatMap((mm) => readAxisMember(mm).ignored);
        if (bad.length) {
          findings.push({
            slide: slideNo, rule: 'quadrant-axis-part', severity: 'warning',
            classToken: 'quadrant', line: line.trim(),
            message: `quadrant axis part${bad.length > 1 ? 's' : ''} ${bad.map((b) => `\`${b}\``).join(', ')} ${bad.length > 1 ? 'are' : 'is'} neither a domain nor a threshold, so the chart ignores ${bad.length > 1 ? 'them' : 'it'} and derives the number from the data`,
            fix: 'Each member is `{name, min..max, threshold}` — the domain uses `..` and needs max above min; the threshold is one number. Both are optional.',
          });
        }
        continue;
      }
      const hasArrow = /(?:→|->)/.test(text);
      const retired = retiredQuadrantAxis(text);
      if (!hasArrow && !retired) continue;
      findings.push({
        slide: slideNo, rule: 'quadrant-retired-axis', severity: 'error',
        classToken: 'quadrant', line: line.trim(),
        autofixable: !!retired,
        message: `\`${text}\` is the retired quadrant axis eyebrow — it now renders as a plain eyebrow, so the axes lose their names and the authored domain, and the points move to a data-derived scale`,
        fix: retired
          ? `Write it as \`${retired}\` — one bracketed list above the chart, x then y, each member \`{name, min..max, threshold}\`.`
          : 'Write one bracketed list above the chart, x then y: `[{Effort, 0..10}, {Reach, 0..100}]`. Every axis needs a name before its domain.',
      });
    }
  });
  return findings;
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
        let tok = cm2[1].trim();
        // The bracketed axis (`[{Timeline, 2026 Q1..2026 Q4, Q3}]`) carries the
        // same window, read through the same member reading the render uses.
        if (tok.startsWith('[')) tok = readTimeAxisMember(parseBracketList(tok, { maxParts: 3 })?.[0]).window;
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
 * A fenced block tagged with a shell SESSION grammar whose body is plainly a
 * SCRIPT — the one authoring mistake that makes syntax highlighting look broken
 * while every render path is behaving correctly.
 *
 * In highlight.js, `bash` (aliases `sh`, `zsh`) parses shell scripts, while
 * `shell` (aliases `console`, `shellsession`) is a terminal-session grammar whose
 * whole job is marking the `$` prompt in pasted output. Tag a script ```shell and
 * you get exactly what you asked for and almost no color. Measured on one
 * eleven-line POSIX script, identical text, on every render path: 15 highlight
 * spans as ```sh, 2 as ```shell.
 *
 * INFO, not a warning. The tag is legal, the render is correct, and an author who
 * meant to show a transcript wants it left alone — the detector already stays
 * silent on any body carrying a prompt-prefixed line. This is a suggestion that a
 * one-word edit will light the block up, not a defect report.
 */
function findShellFenceTags(source) {
  const findings = [];
  const slides = splitTopLevel(source);
  const fm = fmChunks(source);
  slides.forEach((slide, idx) => {
    for (const fence of scanFences(slide)) {
      if (SESSION_TAGS.indexOf(fence.lang) === -1) continue;
      if (!looksLikeShellScript(fence.body)) continue;
      findings.push({
        slide: idx - fm + 1,
        rule: 'shell-fence-is-script',
        severity: 'info',
        classToken: fence.lang,
        line: '```' + fence.lang,
        message: `this \`\`\`${fence.lang} block holds a script, and \`${fence.lang}\` is highlight.js's terminal-SESSION grammar — it marks the \`$\` prompt and leaves the rest plain, so the block renders almost uncolored`,
        fix: 'Tag it ```bash (or ```sh / ```zsh, both aliases of the same grammar) to get shell-script highlighting. Leave it as-is only if the block really is a captured terminal session.',
      });
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

// The `delivery:` register's names — a sync-gated copy of `DELIVERY_NAMES` in
// `lib/core/resolve-delivery.mjs`, for the ESM/CommonJS reason the PACE_NAMES copy above gives.
// `test/unit/core/delivery-names.test.js` pins the two lists and the two parses.
const DELIVERY_NAMES = ['restrained', 'expressive', 'somber'];

/**
 * Front-matter `delivery:` register validation — how much a narrated deck gestures
 * (restrained / expressive / somber). Parses the value exactly as `deliveryLine` in
 * lib/core/resolve-delivery.mjs does, so the rule reports on the deck that will play.
 */
function findUnknownDelivery(source, deliveryNames) {
  const fmBlock = source.match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (!fmBlock) return [];
  const fm = fmBlock[1].match(/^[ \t]*delivery:[ \t]*(.*)$/m);
  if (!fm) return [];
  const value = frontMatterScalar(fm[1]);
  if (!value) return [];
  const known = new Set([...deliveryNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [withTokenSuggestion({
    slide: 0,
    rule: 'unknown-delivery',
    severity: 'warning',
    classToken: value,
    line: fm[0].trim(),
    message: `'${value}' is not a known delivery preset — the deck would play as restrained, the default`,
    fix: `Set front-matter \`delivery:\` to one of: ${[...deliveryNames].join(', ')}.`,
  }, deliveryNames)];
}

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
  // register did (see resolve-pace.mjs); that behavior is now the repo-wide rule
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
 * The front-matter body the two render-target rules read, or `null` when the deck has none.
 *
 * `\uFEFF?` and `\r?\n` on both sides, matching findUnknownPace: a BOM'd or CRLF deck has
 * front matter like any other, and a reader that silently sees none reports nothing for a
 * deck that carries a key. One copy for the pair, so the two rules cannot come to disagree
 * about which decks even have front matter.
 */
function renderTargetFrontMatter(source) {
  const m = String(source || '').match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  return m ? m[1] : null;
}

/**
 * The three RENDER-TARGET front-matter keys — `fluid:` / `player:` / `present:` — carry a
 * value in NEITHER the on vocabulary nor the off one.
 *
 * These keys fail more quietly than any register. A register with a bad value still
 * renders a deck, just the wrong-looking one, and the author sees it on their own screen.
 * A render target decides which ARTIFACT gets written: `fluid: ture` reads as off, the
 * export writes a fixed-deck `.html` without a word of complaint, and the deck looks
 * perfect in every previewer the author has. The mistake is only visible to whoever opens
 * the file on a phone — which is the audience the key existed to serve.
 *
 * Only an UNRECOGNIZED value is a finding. `fluid: false` is an author saying no on
 * purpose and must stay silent, which is the whole reason lib/core/render-target-keys.js
 * carries an OFF vocabulary the export itself never needed: to the export, "not on" is one
 * state, and to an author it is two very different decks.
 *
 * An EMPTY value (`fluid:` with nothing after it) is skipped for findUnknownPace's stated
 * reason — it is an unfinished key or a YAML block the author meant to nest, and reporting
 * "'' is not a known value" reads as noise.
 *
 * Deck-level, so `slide: 0`. Self-contained: the vocabulary comes from the kernel, so no
 * injected vocab and the rule runs for every caller including the browser.
 */
function findBadRenderTargetValues(source) {
  const fm = renderTargetFrontMatter(source);
  if (fm === null) return [];
  const findings = [];
  for (const key of RENDER_TARGET_KEY_NAMES) {
    const { state, value } = renderTargetKeyState(fm, key);
    if (state !== 'unrecognized') continue;
    // The raw line, for the report — matched the same way the KERNEL matches it in the one
    // dimension that has drifted: CASE. Not full parity, and the gap is named rather than
    // asserted away — the kernel escapes its interpolated key and this does not. Identical
    // behavior for the three frozen literal keys, and the kernel's own `escapeKey` docblock
    // calls an unescaped key "the kind of asymmetry that survives a refactor", so a comment
    // claiming parity here is what would stop the next reader noticing.
    // The case drift was user-visible: the kernel started reading
    // the key case-insensitively while this stayed case-sensitive, so a deck writing
    // `FLUID: ture` got `fluid: ture` quoted back — a line not present in the source. The
    // editor uses this string as a NEEDLE to place the squiggle
    // (docs/src/playground/editor-diagnostics.js), so a fabricated line does not just read
    // oddly, it moves the underline to the top of the deck.
    const line = fm.match(new RegExp(`^[ \\t]*${key}:[ \\t]*.*$`, 'im'));
    // DELIBERATELY NOT `withTokenSuggestion`, and this is the one decision in the rule
    // worth stating. That helper attaches `autofixable: true` + a `replace`, which the
    // editor's per-finding quick-fix and its "Fix all" (Alt-Shift-F) apply without asking.
    // Fed the two vocabularies as one list it picks the nearest token regardless of
    // POLARITY, and the nearest token to a mistyped OFF word is usually an ON word:
    // measured, `player: n` → `player: on` and `fluid: of` → `fluid: on`. That silently
    // enables a render target on a deck whose author explicitly opted out, changing which
    // artifact ships — the exact failure this rule exists to prevent, caused by the rule.
    //
    // A typo's polarity is genuinely ambiguous (`of` is one edit from both `off` and
    // `on`), so there is no correct guess to make, only a cheap one. The fix TEXT names
    // all six values and the author picks; nothing here rewrites their deck for them.
    findings.push({
      slide: 0,
      rule: 'bad-render-target-value',
      severity: 'warning',
      classToken: value,
      // No synthesized fallback: every path that reaches here matched a line, and inventing
      // `${key}: ${value}` is what made the drift above invisible for a commit.
      line: line ? line[0].trim() : `${key}:`,
      message: `'${value}' is not an on/off value for \`${key}:\` — the export reads it as OFF and writes the ordinary artifact without complaint, so the deck looks right everywhere the author can see it`,
      fix: `Set \`${key}:\` to one of ${ON_WORDS.join(' / ')} (on) or ${OFF_WORDS.join(' / ')} (off), or remove the line. ${RENDER_TARGET_KEYS[key]}`,
    });
  }
  return findings;
}

/**
 * A render-target key written INDENTED — the one shape the reader believes and YAML reads
 * as something else.
 *
 * The export reads it as the deck's own register. `lib/core/render-target-keys.js` opens
 * both of its matchers on a leading whitespace run, so an indented line is read like a
 * top-level one — and because the reader takes an ON word from ANY line for the key, an
 * indented `fluid: true` opts the deck in even when a top-level `fluid: false` says no. The
 * kernel records this as the union's one false-ON and names the remedy: a warning here, not
 * a narrower reader. Narrowing the read to column 0 would re-break six measured parity rows
 * and silently turn off decks in the field.
 *
 * WHAT THE WARNING CLAIMS, and what it deliberately does not. It claims the EXPORT reads
 * the line as the register — `indentedKeyLines` reports only lines a reader arm actually
 * reads, so that half is always true. It does NOT claim YAML disagrees, because sometimes
 * YAML does not: a front matter whose every key is indented by the same amount is a legal
 * document with those keys at the top level, and an earlier draft of this message told such
 * an author that YAML reads their key "as a value under the key above it" when there is no
 * key above it. The message states the export's reading flatly and the disagreement
 * conditionally.
 *
 * THE FREE-FORM MAP IS THE CASE THAT MATTERS, and it is a warning rather than a
 * false positive. `lexicon:` and `acronyms:` take arbitrary word keys, and `present` is the
 * textbook English heteronym (PRES-ent / pre-SENT) — the first word an author would teach a
 * deck to pronounce. `lexicon:` + an indented `present: on` really does flag the exported
 * PDF to open full-screen, so staying silent there would hide a live surprise. What the
 * author needs is an escape that keeps the lexicon entry, and there is one: QUOTING the key
 * (`"present": pre ZENT`) is the same mapping to YAML and stops both reader arms dead, since
 * each wants `present:` immediately after the whitespace run. The fix text names it.
 *
 * It fires on an off-value too. A nested `fluid: false` does not turn a deck on today, but
 * it is the same line, read the same way, one edit from doing so — and "the export reads
 * this as the deck's `fluid:`" is true of it either way.
 *
 * Deck-level (`slide: 0`), like its sibling, and no autofix: de-indenting the line, quoting
 * the key and deleting it are all plausible, and which one the author meant is not knowable
 * from the source. The line is quoted VERBATIM and WITH its indentation, because the editor
 * places its underline by searching for that string
 * (docs/src/playground/editor-diagnostics.js) and the indentation is what tells a nested
 * `fluid: true` apart from a top-level one that trims to the same characters — without it
 * the squiggle lands on the innocent line. Verified on the real Studio in
 * docs/e2e/editor-lint.spec.ts.
 */
function findNestedRenderTargetKeys(source) {
  const fm = renderTargetFrontMatter(source);
  if (fm === null) return [];
  const findings = [];
  for (const key of RENDER_TARGET_KEY_NAMES) {
    for (const raw of indentedKeyLines(fm, key)) {
      findings.push({
        slide: 0,
        rule: 'nested-render-target-key',
        severity: 'warning',
        // The KEY, not a value — this finding has no token to rewrite, and `tools/lint-deck.js`
        // prints this field in brackets on every finding it reports. Never feed it to
        // `withTokenSuggestion`, which reads `classToken` as the token to REPLACE: offering to
        // rewrite the key is the one repair that cannot be right here.
        classToken: key,
        line: raw,
        message: `\`${key}:\` is indented, and the export reads it as the deck's own \`${key}:\` — an on-value here opts the deck in even when a top-level \`${key}:\` says no. Wherever YAML reads this line as part of the block above it — a nested key, or an entry in a free-form map like \`lexicon:\` — the two disagree about what the line is, and the export wins`,
        fix: `Move \`${key}:\` to the left margin if you meant the deck setting. If the line belongs to the block above it, quote the key (\`"${key}":\`) — YAML reads that the same way and the export stops reading it as the register. ${RENDER_TARGET_KEYS[key]}`,
      });
    }
  }
  return findings;
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
 * Front-matter `inline-code:` register validation — whether the inline directive grammar
 * runs (`rich` / `literal`). Warns on an unrecognized value.
 *
 * The failure this catches is SILENT AND BACKWARDS. `inlineCodeClass` maps anything that
 * is not exactly `literal` to no token, so `inline-code: off` — the value an author is
 * most likely to reach for, and the one this register was called `pills: off` in its first
 * draft — leaves the grammar RUNNING. The author reads their front matter, sees the
 * switch they set, and gets pills anyway. Canonical list injected
 * (lib/core/resolve-inline-code.js `INLINE_CODE_NAMES`), keeping this core require-free.
 */
function findUnknownInlineCode(source, inlineCodeNames) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  // THE CANONICAL READER, not a fourth regex. The `$`-anchored pattern this replaces
  // could not see a value carrying a trailing YAML comment — so
  // `inline-code: off  # turn the pills off` linted CLEAN while the deck kept drawing
  // pills, disarming the one rule whose whole purpose is catching that silent, backwards
  // failure. `deckClassPropagate`'s own docblock already records this exact defect shape
  // for `finish:`; the rule inherited the pattern from `findUnknownEyebrow` and inherited
  // the hole with it.
  //
  // Reads the RAW SCALAR rather than `frontMatterName`, deliberately. `frontMatterName`
  // returns null for anything that is not a bare name, which the engine then treats as
  // UNSET — so `inline-code: littéral` renders pills, and a lint keyed on the same reader
  // would see null and say nothing. The author needs to hear about exactly that.
  const raw = frontMatterValue(fmBlock[1], 'inline-code');
  if (raw === null || raw.trim() === '') return [];
  const value = raw.trim();
  const fm = fmBlock[1].match(/^[ \t]*inline-code:.*$/m) || [`inline-code: ${value}`];
  const known = new Set([...inlineCodeNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [withTokenSuggestion({
    slide: 0,
    rule: 'unknown-inline-code',
    severity: 'warning',
    classToken: value,
    line: fm[0].trim(),
    message: `'${value}' is not a known inline-code value — the deck would keep rendering pills and marks`,
    fix: `Set front-matter \`inline-code:\` to one of: ${[...inlineCodeNames].join(', ')}.`,
  }, inlineCodeNames)];
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
/**
 * The `fit:` register (engineering/decisions/2026-09-25-fit-policy.md): an unknown value,
 * and the old `guards:` spelling. An unknown `fit:` resolves to the default `heal`, which
 * fails SAFE for TRIM and silently for `report` — the author who typed `fit: reprot` to
 * switch the engine off gets it on — so it is a warning. The old spelling still works,
 * so naming the new one is `info`.
 */
function findFitRegister(source, fitNames) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  const out = [];
  const lineOf = (key) => (fmBlock[1].split(/\r?\n/).find((l) => new RegExp(`^\\s*${key}\\s*:`).test(l)) || '').trim();
  const fit = frontMatterName(fmBlock[1], 'fit');
  const known = new Set([...fitNames].map((n) => String(n).toLowerCase()));
  if (fit && !known.has(fit.toLowerCase())) {
    out.push({
      slide: 0,
      rule: 'unknown-fit',
      severity: 'warning',
      classToken: fit,
      line: lineOf('fit') || `fit: ${fit}`,
      message: `'${fit}' is not a known fit value — the deck would silently render at the default, heal`,
      fix: `Set front-matter \`fit:\` to one of: ${[...fitNames].join(', ')}.`,
    });
  }
  const guards = frontMatterName(fmBlock[1], 'guards');
  if (guards) {
    const to = guards.toLowerCase() === 'strict' ? 'trim' : guards.toLowerCase() === 'loose' ? 'heal' : null;
    out.push({
      slide: 0,
      rule: 'guards-renamed',
      severity: 'info',
      classToken: guards,
      line: lineOf('guards') || `guards: ${guards}`,
      message: fit
        ? `\`guards:\` is the old spelling of \`fit:\`, and this deck sets both — \`fit: ${fit}\` wins`
        : `\`guards:\` is now \`fit:\` — one setting for everything the engine may do to make a slide fit (report / heal / trim)`,
      // With `fit:` present too, the only safe fix is deleting the old line: "write fit: trim"
      // would CHANGE the level of a deck whose `fit: report` already wins.
      fix: fit
        ? 'Delete the `guards:` line — `fit:` already decides.'
        : to ? `Write \`fit: ${to}\` instead${to === 'heal' ? ' — or drop the line; heal is the default' : ''}.` : `Write \`fit:\` with one of: ${[...fitNames].join(', ')}.`,
    });
  }
  return out;
}

function findUnknownGuards(source, guardsNames) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  // THE SHARED SCALAR RULE, not a private regex. The `$`-anchored pattern that used
  // to be here did not match `guards: strct  # for the board pack` — so an annotated
  // typo resolved to the baseline in `resolve-guards.js` (which reads it with
  // `frontMatterName` and DOES accept the comment) while the lint that exists to
  // catch exactly that stayed silent. `resolve-guards.js`'s own docblock warns about
  // this failure mode by name; the lint had it.
  const value = frontMatterName(fmBlock[1], 'guards');
  if (!value) return [];
  // Quote the line as WRITTEN. Synthesizing `guards: ${value}` reported a string that
  // appears nowhere in the file, so anything locating the finding by text match missed.
  const rawLine = (fmBlock[1].split(/\r?\n/).find((l) => /^\s*guards\s*:/.test(l)) || '').trim();
  const known = new Set([...guardsNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [{
    slide: 0,
    rule: 'unknown-guards',
    severity: 'warning',
    classToken: value,
    line: rawLine || `guards: ${value}`,
    // The asymmetry is the point: a typo here fails SAFE (no trimming) rather than
    // dangerous (trimming an author never asked for), so this is a warning about a
    // guard that quietly did nothing — not about text that quietly went missing.
    message: `'${value}' is not a known guards value — the deck would silently render loose, with no trimming at all`,
    fix: `\`guards:\` is the old spelling of \`fit:\` — write \`fit:\` with one of: report, heal, trim.`,
  }];
}

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
 * Front-matter `venue:` register validation — where the deck will be seen (laptop / huddle /
 * conference / hall). Warns when the value isn't recognized, so a typo (`venue: auditorium`)
 * silently shipping the designed size surfaces. Canonical list injected
 * (lib/core/resolve-venue.js `VENUE_NAMES`), keeping this core require-free.
 */
function findUnknownVenue(source, venueNames) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  // Any value, not only a bare name: `venue: big hall` renders the designed size too.
  const fmVenue = fmBlock[1].match(/^\s*venue:[ \t]*["']?([^"'#\n]*?)["']?[ \t]*(?:#.*)?$/m);
  if (!fmVenue?.[1].trim()) return [];
  const value = fmVenue[1].trim();
  const known = new Set([...venueNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [withTokenSuggestion({
    slide: 0,
    rule: 'unknown-venue',
    severity: 'warning',
    classToken: value,
    line: fmVenue[0].trim(),
    message: `'${value}' is not a known venue — the deck would silently render at the laptop (designed) size`,
    fix: `Set front-matter \`venue:\` to one of: ${[...venueNames].join(', ')} (4–6 people is huddle, 10–30 is conference, 50 or more is hall).`,
  }, venueNames)];
}

/**
 * Front-matter `preset:` register validation — the named accent + surface look (classic /
 * editorial / brand / minimal). Warns on an unrecognized name, which resolves to NO preset, so
 * every register it would have set silently renders its default. Canonical list injected
 * (lib/core/resolve-preset.js `PRESET_NAMES`), keeping this core require-free.
 */
function findUnknownPreset(source, presetNames) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  // Through the shared reader, not a `$`-anchored pattern of its own: that shape missed
  // `preset: editorail  # typo` — the exact case this rule exists for — and is quadratic
  // on a long run of blank lines. Top-level, like the engine's read of `preset:`.
  const value = topLevelFrontMatterValue(fmBlock[1], 'preset');
  if (!value) return [];
  const line = (fmBlock[1].match(/^preset:.*$/m) || [`preset: ${value}`])[0];
  const known = new Set([...presetNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [withTokenSuggestion({
    slide: 0,
    rule: 'unknown-preset',
    severity: 'warning',
    classToken: value,
    line: line.trim(),
    message: `'${value}' is not a known preset — every accent and surface setting would silently render its default`,
    fix: `Set front-matter \`preset:\` to one of: ${[...presetNames].join(', ')}.`,
  }, presetNames)];
}

/**
 * Front-matter `cards:` register validation — where a card row puts the height it does not
 * need (center / stretch / top / spread). Warns when the value isn't recognized, so a typo
 * (`cards: centre`, `cards: flex-start`) silently shipping the centered default surfaces.
 * Canonical list injected (lib/core/resolve-cards.js `CARDS_NAMES`), keeping this core
 * require-free.
 */
function findUnknownCards(source, cardsNames) {
  const fmBlock = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  const fmCards = fmBlock[1].match(/^\s*cards:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  if (!fmCards) return [];
  const value = fmCards[1].trim();
  const known = new Set([...cardsNames].map((n) => String(n).toLowerCase()));
  if (known.has(value.toLowerCase())) return [];
  return [withTokenSuggestion({
    slide: 0,
    rule: 'unknown-cards',
    severity: 'warning',
    classToken: value,
    line: fmCards[0].trim(),
    message: `'${value}' is not a known cards value — the deck would silently fall back to whatever each component declares`,
    fix: `Set front-matter \`cards:\` to one of: ${[...cardsNames].join(', ')}.`,
  }, cardsNames)];
}

/**
 * Migration warning: the top-level `backdrop:` MAP form (a bare `backdrop:` header with
 * indented children) is RETIRED and silently no-ops. The SCALAR form (`backdrop: 40 clear`)
 * is the live register (lib/core/resolve-backdrop.js), so only an EMPTY value matches here.
 * A `backdrop:` NESTED under `finish-override:` is indented, so `^backdrop:` (column 0)
 * never matches it. One finding per deck.
 */
function findRetiredBackdrop(source) {
  const fmBlock = String(source || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  if (!/^backdrop:\s*$/m.test(fmBlock[1])) return [];
  return [{
    slide: 0, rule: 'retired-backdrop-key', severity: 'warning', classToken: 'backdrop', line: 'backdrop:',
    message: 'the `backdrop:` map form is retired — its indented keys silently no-op',
    fix: 'Write the register on one line instead: `backdrop: 40 clear` (strength 20/40/60/80/full, then clear, open or spot-<tl|t|tr|l|c|r|bl|b|br>).',
  }];
}

/**
 * Front-matter `backdrop:` register validation — the restraint over any finish. Warns on a
 * word that is neither a strength step nor a mask, and on a second word for an axis already
 * set (only the first reaches the slide). Canonical list injected (lib/core/resolve-backdrop.js
 * `BACKDROP_NAMES`), keeping this core require-free.
 */
function findUnknownBackdrop(source, backdropNames) {
  const fmBlock = String(source || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  const m = fmBlock[1].match(/^backdrop:[ \t]*(\S.*)$/m);
  if (!m) return [];
  // The engine's scalar rule (lib/core/front-matter-key.js `frontMatterScalar`): a quoted
  // value is the quoted span, `#` inside it included; unquoted, a space-led `#` is a comment.
  const raw = m[1].trim();
  const quoted = /^(["'])(.*?)\1/.exec(raw);
  const value = (quoted ? quoted[2] : raw.replace(/[ \t]#.*$/, '')).trim();
  const known = new Set([...backdropNames].map((n) => String(n).toLowerCase()));
  const isStrength = (w) => /^(\d+|full)$/.test(w);
  const out = [];
  const seen = { strength: false, mask: false };
  for (const raw of value.toLowerCase().split(/[\s,]+/).filter(Boolean)) {
    const word = raw.endsWith('%') ? raw.slice(0, -1) : raw;
    if (!known.has(word)) {
      out.push(withTokenSuggestion({
        slide: 0, rule: 'unknown-backdrop', severity: 'warning', classToken: word, line: m[0].trim(),
        message: `'${raw}' is not a known backdrop value — it is ignored, so the finish renders without it`,
        fix: `Use a strength (${[...backdropNames].filter(isStrength).join(', ')}) and/or a mask (${[...backdropNames].filter((n) => !isStrength(n)).join(', ')}).`,
      }, backdropNames));
      continue;
    }
    const axis = isStrength(word) ? 'strength' : 'mask';
    if (seen[axis]) {
      out.push({
        slide: 0, rule: 'unknown-backdrop', severity: 'warning', classToken: word, line: m[0].trim(),
        message: `\`backdrop:\` names a second ${axis} ('${raw}') — only the first one applies`,
        fix: `Keep one ${axis} value.`,
      });
    }
    seen[axis] = true;
  }
  return out;
}

/**
 * ── SHAPE-CHANGING FINDINGS (`shapeChange: true`) ───────────────────────────
 *
 * Most retired keys are INERT: deleting them changes nothing about the render,
 * so the linter is the right and only place to mention them. Three of the
 * retired Form shapes are different — they SUPPRESSED chrome, so a deck that
 * still carries one renders differently than it used to the moment it is built
 * against a current engine: the masthead band, the meta bay and the progress
 * rail all come back.
 *
 *   · `form: off`                     (deck key)
 *   · `class: no-form` in front matter (deck-wide, propagated to every slide)
 *   · `no-form` in a slide directive   (that slide)
 *
 * They carry `shapeChange: true` so the RENDER path can repeat just those on
 * stderr, exactly as it already does for a refused deck-wide `class:`
 * (lattice-emulator.js): the person whose deck changed shape is rendering it,
 * not linting it. A flag rather than a message match, because a message is
 * prose and gets rewritten. The inert findings keep `shapeChange: false` and
 * stay linter-only — a warning on a deck that renders identically is the noise
 * that teaches people to ignore warnings.
 */

/**
 * Migration warning: the deck-wide `form:` key is RETIRED (2026-09-20). Form is the
 * composition model, not a setting — there is no way to disable it or pick a mode,
 * so ANY `form:` value is now inert. `form: off` is the one that changes behavior
 * for an existing deck (the chrome it suppressed comes back); `form: standard` and
 * the long-retired `form: minimal` were already no-ops against the default.
 *
 * Warn, never block (HARD RULE #29's posture — we coach, we do not refuse an
 * author's deck). The fix is a deletion, and for `off` it names what will change.
 * One finding per deck; `^form:` (column 0) matches the flat deck key only, so a
 * `form:` nested under another block is not flagged.
 */
function findRetiredFormKey(source) {
  const fmBlock = String(source || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fmBlock) return [];
  const m = fmBlock[1].match(/^form:[ \t]*(.*)$/m);
  if (!m) return [];
  // STRIP A TRAILING YAML COMMENT FIRST. `form: off  # legacy deck` read as the literal
  // value `off  # legacy deck`, which is not `off`, so the rule fell to its generic
  // "this key does nothing" arm — on the one deck where the key HAD been doing
  // something, and told that author nothing would change while their deck gained the
  // masthead band, the bay and the rail. Naming that consequence is the rule's whole
  // job. Only an UNQUOTED `#` opens a comment in YAML, so a quoted value is taken whole.
  const raw = m[1].trim();
  const value = (/^["']/.test(raw) ? raw : raw.replace(/\s+#.*$/, ''))
    .trim().replace(/^["']|["']$/g, '').toLowerCase();
  const wasOff = /^(off|false|no)$/.test(value);
  return [{
    slide: 0, rule: 'retired-form-key', severity: 'warning', classToken: 'form',
    // `off` is the one value that CHANGES an existing deck's render, so it is the one
    // the CLI repeats on stderr. See SHAPE-CHANGING FINDINGS below.
    shapeChange: wasOff,
    line: `form: ${m[1].trim()}`,
    message: wasOff
      ? '`form: off` is retired — Form is the composition model and cannot be disabled, so this deck now renders WITH the masthead band, bay and progress rail'
      : '`form:` is retired — Form is always on, so this key does nothing',
    fix: wasOff
      ? 'Delete the `form:` line. To quiet the deck, reach for the specific chrome controls instead — `class: no-progress` drops the rail, `no-header` / `no-footer` / `no-paginate` drop those.'
      : 'Delete the `form:` line — it is inert.',
  }];
}

/**
 * Migration warning: the per-slide `form` / `no-form` tokens are RETIRED
 * (2026-09-20) along with the deck key. `no-form` no longer opts a slide out and
 * `form` no longer opts one in — every slide composes as Form, and a slide that
 * carries no chrome does so because its FRAME is sovereign (title, divider,
 * closing, image, premise, scene, split-panel, split-compare, compare-code, topic), which
 * is a property of the component, not something a token selects.
 *
 * One finding per occurrence, so an author sees every slide to edit. Both the spot
 * (`<!-- _class: … -->`) and the running global (`<!-- class: … -->`) forms are
 * scanned, via the shared directive reader the other class rules use.
 */
function findRetiredFormTokens(source) {
  const findings = [];
  const src = String(source || '');

  // DECK-LEVEL `class:` / `_class:` in FRONT MATTER. This was a real deck-wide opt-out
  // on main — `deckClassPropagate` copies the token onto every section, and
  // `formToggleClass` then skipped each one — so a deck carrying it changes shape on
  // upgrade exactly as `form: off` does. Neither rule saw it: the key rule matches only
  // `^form:`, and the slide scan below reads only `<!-- _class: … -->` comments. A
  // migration warning that misses a live migration shape is the one that matters.
  const fmBlock = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (fmBlock) {
    const dk = fmBlock[1].match(/^_?class:[ \t]*(.*)$/m);
    const deckTokens = dk ? dk[1].trim().replace(/^["']|["']$/g, '').split(/\s+/) : [];
    for (const tok of ['no-form', 'form']) {
      if (!deckTokens.includes(tok)) continue;
      findings.push({
        slide: 0, rule: 'retired-form-token', severity: 'warning', classToken: tok,
        shapeChange: tok === 'no-form',
        line: `class: ${dk[1].trim()}`,
        message: tok === 'no-form'
          ? `\`no-form\` is retired — this deck-wide class opted EVERY slide out of Form, so the whole deck now renders WITH the masthead band, bay and progress rail`
          : '`form` is retired as a token — every slide composes as Form, so this deck-wide class does nothing',
        fix: tok === 'no-form'
          ? `Delete \`no-form\` from the deck \`class:\`. To quiet the deck, reach for the specific chrome controls instead — \`no-progress\` drops the rail, \`no-header\` / \`no-footer\` / \`no-paginate\` drop those. For an individual slide that should carry no chrome, give it a sovereign component — ${sovereignList()}.`
          : 'Delete `form` from the deck `class:` — it is inert.',
      });
      break;
    }
  }

  // PER-SLIDE directives. Scanned over the whole slide TEXT, not line by line: Marpit
  // accepts the directive across lines (`<!--\n_class: content no-form\n-->`), the engine
  // honors it, and a line-wise scan saw none of them. The slide split also fixes what the
  // first cut got wrong — it reported `slide: 0` on every finding, which is not cosmetic:
  // the editor's `findingsToDiagnostics` confines its anchor search to that slide's chunk,
  // so slide 0 is the FRONT MATTER and every warning fell back to a squiggle on the deck's
  // opening `---`, four legacy slides giving four identical marks on line 1.
  //
  // SPLIT WITH THE SHARED KERNEL, not a local regex (HARD RULE #15). The second cut of
  // this rule hand-rolled `src.split(/^---$/m)` while `splitTopLevel` sat imported at the
  // top of this file and in use by all six sibling slide-scoped rules — and that regex is
  // the exact bug `slide-split.js` was written to fix. It reads a `---` inside a fenced
  // YAML sample as a slide break (desyncing every number after it, on precisely the deck
  // most likely to carry one) and it misses `***`, `___`, `- - -`, `----`, a trailing
  // space, an indented rule, a setext underline and U+2028 — all of which the engine
  // honors as breaks. Measured on a `***`-separated deck: the token on slide 3 was
  // reported as slide 1, which is the front matter, i.e. back to the very failure the
  // paragraph above says was fixed. See 2026-08-05-slide-boundary-reconciliation.md.
  const slides = splitTopLevel(src);
  const fm = fmChunks(src);
  slides.forEach((slide, idx) => {
    // A token inside a ``` fence is QUOTED material — a deck documenting this very
    // migration quotes `<!-- _class: content no-form -->` to show what to delete, and
    // warning on the example is the rule failing at the deck most likely to carry it.
    const body = stripFencedCode(slide);
    for (const m of body.matchAll(/<!--\s*_?class:\s*([\s\S]*?)\s*-->/g)) {
      for (const tok of ['no-form', 'form']) {
        if (!new RegExp(`(^|\\s)${tok}($|\\s)`).test(m[1])) continue;
        findings.push({
          slide: Math.max(1, idx - fm + 1),
          rule: 'retired-form-token',
          severity: 'warning',
          classToken: tok,
          shapeChange: tok === 'no-form',
          line: m[0].replace(/\s*\n\s*/g, ' ').trim(),
          message: tok === 'no-form'
            ? '`no-form` is retired — a slide cannot opt out of Form, so this slide now renders WITH the masthead band and rail'
            : '`form` is retired as a token — every slide composes as Form, so it does nothing',
          fix: tok === 'no-form'
            ? `Delete \`no-form\`. If this slide should carry no chrome, give it a sovereign component instead — ${sovereignList()}.`
            : 'Delete `form` — it is inert.',
        });
        break; // `no-form` contains no `form` token match, but one finding per slide is enough
      }
    }
  });
  return findings;
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
 * Rule `author-script-defers` — an inline `<script>` in the deck that DEFERS its work.
 *
 * The export captures the page at the load event plus an explicit media settle
 * (`settleDeferredMedia`); it does not wait on author timers, and that is a decision on
 * the record rather than an oversight — there is no finite wait that is correct, since
 * the next deck can always pick a longer one. #1792 /
 * `engineering/decisions/2026-08-16-render-format-cost-assessment.md` §2a-ter.
 *
 * So a slide that paints itself from a `setTimeout` ships EMPTY into the PDF. The render
 * now says so at capture (`lib/core/author-deferral-probe.js`), but the render is late:
 * the author has already built the deck. This is the same fact stated at authoring time,
 * and it is the ONLY net under several shapes the runtime probe cannot see — a
 * `<script type="module">` (where `document.currentScript` is null, so the probe has
 * nobody to attribute the work to), and every API the probe deliberately does not wrap:
 * `Worker`, `MutationObserver`, `IntersectionObserver`, `WebSocket`, `EventSource`,
 * `requestIdleCallback`, `queueMicrotask`, `element.animate` and dynamic `import()`.
 *
 * `requestAnimationFrame` is NOT in the list, and its absence is the finding rather than
 * an oversight: a rAF scheduled at parse time runs at the next paint, long before the
 * capture, and its output is measurably IN the PDF. Naming it would tell authors to
 * rewrite code that works.
 *
 * SCOPE, and every edge is deliberate:
 *   - INLINE scripts only. All three shipped decks that carry raw `<script>` carry
 *     `<script src>` scaffolding for the live preview (mermaid, lattice-runtime) with no
 *     deferral of their own; flagging `src` would fire on every one of them and teach
 *     authors to ignore this rule. The body is not readable from here anyway.
 *   - Only when the body NAMES a deferral API. A script that mutates the DOM
 *     synchronously lands in the export and is not a defect.
 *   - The inert-data skip reads the OPENING TAG, not the whole element. Testing the whole
 *     match let a script whose BODY happened to contain the text `application/json`
 *     disable the rule for itself — found by an independent checker.
 * Code fences AND html comments are blanked first, so neither this rule's own
 * documentation nor a deck's speaker notes can trip it.
 *
 * THE OPENING TAG IS MATCHED; THE BODY IS SEARCHED FOR. This used to be one
 * `<script …>([\s\S]*?)</script>` span, and a span has to SPELL its end tag — which means
 * picking one spelling out of the several the HTML parser accepts (`</script>`,
 * `</script >`, `</script\n>`, `</script/>`). Every pick is wrong for the rest, which is
 * the shape CodeQL's bad-tag-filter query flags, and fairly: widening the span to accept
 * a space does not answer it, because the next spelling is still unhandled. Matching only
 * the opening tag and then locating the end the way the parser does (`scriptElementEnd`)
 * removes the span rather than re-spelling it.
 *
 * Nothing else in the tree finds a script BODY this way, so there is no precedent to
 * follow here — `lib/export/player-core.mjs` scans for a `src=` on an opening tag and
 * never looks for an end at all. (An earlier draft of this comment, and the commit that
 * introduced it, both claimed it as the house idiom. It is not.)
 */
const AUTHOR_SCRIPT_OPEN_RE = /<script\b(?![^>]{0,1024}\bsrc=)([^>]{0,1024})>/gi;

// HTML whitespace, WHICH IS NOT `\s`. The tokenizer's script-data-end-tag-name state
// accepts TAB, LF, FF, SPACE (and CR, which input preprocessing has already folded to LF),
// plus `/` and `>`; anything else sends it back to script data, meaning the run is NOT an
// end tag. JavaScript's `\s` additionally matches NBSP, vertical tab, U+2028/29, the BOM
// and the Unicode space separators — so `[\s/>]` ends a body on five spellings a browser
// keeps INSIDE it. That is not a widening, it is the original false-negative class coming
// back: `var t = "</script\u00a0>";` truncates the body before the real code, and an NBSP
// is exactly what survives a copy-paste out of a document or a model reply.
const SCRIPT_END_RE = /<\/script(?=[\t\n\f\r />])/gi;

// The end tag that closes a `<script>`, as {body, after}: where the body stops, and where
// the scan may resume. There is deliberately no EOF case — per spec a trailing `</script`
// with nothing after it does NOT close the element — so an unclosed script returns null.
//
// `after` walks the end tag to its own `>` rather than stopping at the `<`, because an end
// tag may legally carry attributes (the parser drops them) and an attribute value may
// contain `<script>`. Resuming at the `<` re-read `</script x="<script>">` as a second,
// phantom element and flagged the prose after it. The walk is quote-aware for the same
// reason: a `>` inside a quoted value does not end the tag.
function scriptElementEnd(text, from) {
  SCRIPT_END_RE.lastIndex = from;
  const end = SCRIPT_END_RE.exec(text);
  if (!end) return null;
  let i = end.index + '</script'.length;
  let quote = '';
  for (; i < text.length; i += 1) {
    const c = text[i];
    if (quote) { if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '>') { i += 1; break; }
  }
  return { body: end.index, after: Math.min(i, text.length) };
}
const INERT_SCRIPT_TYPE_RE = /\btype\s*=\s*["'][^"']*json/i;
const DEFERRAL_API_RE =
  /\b(setTimeout|setInterval|requestIdleCallback|queueMicrotask|XMLHttpRequest|Worker|MutationObserver|IntersectionObserver|WebSocket|EventSource)\b|\bfetch\s*\(|\bimport\s*\(|\.animate\s*\(|\.then\s*\(|\bawait\s/;

function findAuthorScriptDefers(source) {
  const text = String(source || '');
  const findings = [];
  const fm = fmChunks(text);
  splitTopLevel(text).forEach((chunk, idx) => {
    // An HTML comment is where a deck keeps speaker notes and where a doc keeps an
    // example, and neither renders a live script.
    const body = withoutCodeBlocks(chunk).replace(/<!--[\s\S]*?-->/g, ' ');
    AUTHOR_SCRIPT_OPEN_RE.lastIndex = 0;
    for (let m = AUTHOR_SCRIPT_OPEN_RE.exec(body); m; m = AUTHOR_SCRIPT_OPEN_RE.exec(body)) {
      const bodyStart = m.index + m[0].length;
      const end = scriptElementEnd(body, bodyStart);
      // UNCLOSED: stop, and say nothing about it. A browser does swallow the rest of the
      // document into the body, so reading on would be faithful to the parser -- and the
      // text being read is MARKDOWN, where `DEFERRAL_API_RE` matches bare English words.
      // A missing `</script>` before a line like "Worker productivity rose 12%" produced a
      // finding telling the author their `Worker` call would not survive the export, for a
      // call that does not exist. This file already knows which way that trade goes: it
      // does not flag `<script src>` either, because a rule that fires on legitimate
      // content is a rule authors learn to ignore.
      if (!end) break;
      const bodyEnd = end.body;
      // Resume AFTER this element, so neither a `<script>` quoted inside its body nor one
      // sitting in the end tag's own attributes can be read as a second element. (The span
      // form got this for free; the search form has to say it.)
      AUTHOR_SCRIPT_OPEN_RE.lastIndex = end.after;
      // The export-settings block is inert data (`type="application/lattice+json"`), never
      // executed — `findStrayOverflowMarker` already has its own, better-worded finding.
      if (INERT_SCRIPT_TYPE_RE.test(m[1])) continue;
      const api = body.slice(bodyStart, bodyEnd).match(DEFERRAL_API_RE);
      if (!api) continue;
      const call = (api[1] || api[0]).replace(/[\s(.]+$/, '').replace(/^\./, '');
      findings.push({
        slide: Math.max(1, idx - fm + 1),
        rule: 'author-script-defers',
        severity: 'warning',
        classToken: 'script',
        line: `<script> … ${call} …`,
        message:
          `this inline \`<script>\` defers work with \`${call}\` — the export captures at the load event and does not wait for it, so whatever that work would write will be MISSING from the PDF/PPTX/PNG`,
        fix:
          'Do the work synchronously at parse time (drop the timer), or author the content in markdown so the engine renders it. A plain `.html` export is the one deliverable that keeps the script live; every captured format freezes the DOM as it stands. See design/skill.md § Raw HTML in a deck.',
      });
    }
  });
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
  CODE_LINES_AT_SCALE,
  SCALE_CAPACITY,
  FONT_SCALE_VALUE,
  fontScaleKey,
  FONT_SCALE_KEYS,
  venueClassFromFrontMatter,
  scaleCapacityFor,
  tallestCodeBlock,
  hasEyebrow,
  codeLineColumns,
  widestCodeLine,
  axisNoun,
  capacityFix,
  findUnknownMapRegions,
  findTypedShapeGlyphs,
  findCrowdedShapePills,
  pillFitsShape,
  inlineCodeSpans,
  findRetiredAutosplitDirective,
  findRetiredFormKey,
  findRetiredFormTokens,
  findUnsupportedPaginateValues,
  findUnknownFinish,
  findUnknownPace,
  PACE_NAMES,
  DELIVERY_NAMES,
  findUnknownDelivery,
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
  findAuthorScriptDefers,
  nearestRegion,
  withTokenSuggestion,
  replaceToken,
  editDistance,
  isKnownModifier,
  autofixNestedTitle,
  autofixOrderedNestedTitle,
  autofixGanttDelimiter,
  autofixQuadrantAxis,
  retiredQuadrantAxis,
  findQuadrantAxisIssues,
  applyFix,
  applyAllFixes,
  findMovedEmptyBoxes,
  headingSubSlides,
  splitsOnHeadings,
  lintTextWith,
};
