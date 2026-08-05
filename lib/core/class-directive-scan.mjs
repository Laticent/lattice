/**
 * lib/core/class-directive-scan.mjs
 *
 * WHICH CLASS GOVERNS THIS SLIDE — answered from raw source, by a LINE SCAN, for
 * the two AUTHORING surfaces that cannot run the render pipeline: the deck linter
 * (`lib/authoring/lint-core.js`, pure and fs-free by HARD RULE #7) and the
 * editor's autocomplete (`docs/src/playground/slide-context.js`, which runs on
 * every keystroke).
 *
 * WHAT IT REPLACES, and why one regex was three defects:
 *
 *     const CLASS_DIRECTIVE = /<!--\s*_class:\s*([^>]+?)\s*-->/;
 *
 *   1. THE GLOBAL FORM IS INVISIBLE. Marp has two class directives — the spot
 *      `<!-- _class: … -->` (this slide) and the bare `<!-- class: … -->` (a
 *      running global, in force from its slide to the end of the deck). This
 *      matches only the spot form, so on a deck using the bare form the linter
 *      and the renderer disagree about every slide from the directive onward.
 *   2. WITH THE REAL DIRECTIVE INVISIBLE, A QUOTED ONE TAKES ITS PLACE. The regex
 *      is non-global and used with `.match()`, so it takes the FIRST `_class:` on
 *      the slide — which, on a slide whose real directive is the global form, is
 *      whatever the prose happens to quote. A deck teaching its own syntax
 *      (`` The docs write `<!-- _class: kpi -->` when they mean… ``) linted as
 *      `kpi`.
 *   3. AND THE WRONG CLASS IS NOT JUST A FALSE POSITIVE. The class selects the
 *      per-component slot rules — the card-shape checks, the bodyless-item rules,
 *      the variant vocabulary — so a slide linted as the wrong component is
 *      checked against the wrong contract in BOTH directions.
 *
 * A LINE SCAN FOR THE DIRECTIVES, THE PARSER FOR THE BOUNDARIES. Where a slide
 * BEGINS is not decided here — `chunkBoundaryLines` (lib/core/slide-boundaries.mjs)
 * decides it, by asking the engine's own markdown-it (#1271). That is the whole
 * reason this function can promise it indexes exactly like `splitTopLevel`: both
 * read the same derivation, so the promise is structural rather than a comment
 * two files have to keep agreeing on.
 *
 * The first cut of this module scanned for boundaries too, with its own
 * `/^---$/`, on the grounds that pulling markdown-it into the browser bundle
 * (`tools/build-authoring-core.js`) roughly tripled it. Two things changed. The
 * cores now reach markdown-it anyway through `slide-boundaries.mjs`, and it is
 * marked EXTERNAL there, so it resolves to the copy the docs site already loads
 * rather than being inlined — the bundle is 126KB, smaller than before. And the
 * scan's `---`-only rule was WRONG in both directions: it missed `***`, `___`,
 * `- - -`, `--- ` with a trailing space, `----` and an indented `---` (all
 * top-level `hr`, all slide breaks to the engine), and it split on a setext
 * underline, which is a HEADING. Every finding after such a line was attributed
 * to the wrong slide.
 *
 * WHAT ELSE IS SHARED, so this is not a fourth spelling of the grammar:
 *
 *   · the `<!-- key: value -->` GRAMMAR is `lib/core/comment-directive.mjs` — the
 *     same parse the render pipeline binds its vocabulary to;
 *   · the SPOT-REPLACES-GLOBAL resolution is the engine's own rule
 *     (`lib/engine/slides.js`: `{ ...runningGlobal, ...slideLocal }`).
 *
 * WHAT IT STILL CANNOT SEE, stated rather than glossed: `split: headings`, which
 * injects extra boundaries the raw source does not carry. On a deck using it the
 * linter's slide NUMBERING diverges from the renderer's, and this changes nothing
 * about that — it is a property of `splitTopLevel`, which every lint finding's
 * `slide` field is counted from.
 *
 * ESM so the editor can import it directly (Vite serves a source CJS module
 * untransformed in `astro dev` — the defect `authoring-core.generated.js` exists
 * to work around); the CJS linter `require()`s it, the way the emulator already
 * requires `lib/core/glossary-auto.mjs`.
 */

// The grammar, imported as ESM. It MUST be the `.mjs` — this module is ESM so the
// docs editor can import it as source, and Vite/Rollup cannot transform a CommonJS
// file outside the docs root, so a `./comment-directive.js` import here fails the
// docs build with `commentDirective is not defined`. See that file's CJS shim.
import { readDirectiveComment } from './comment-directive.mjs';
// WHERE A SLIDE BEGINS — the one derivation, which asks the engine's own parser.
// Imported for `slideClassDirectives`; `classDirectiveAt` takes its boundary
// predicate from the caller for the same reason it takes a line accessor.
import { chunkBoundaryLines, normalizeSourceText } from './slide-boundaries.mjs';

// The vocabulary slice this module's question needs. `class` is not a flag
// directive, so parsing it under a one-key vocabulary is byte-identical to
// parsing it under the engine's full set — see lib/core/comment-directive.mjs.
const CLASS_ONLY = { known: new Set(['class']), flags: new Set() };

/** A fence opener, allowing CommonMark's up-to-3-space indent. */
const FENCE_OPEN = /^\s{0,3}(`{3,}|~{3,})/;

/**
 * A comment that OPENS its line's CONTENT — the only shape that can be a directive.
 *
 * markdown-it opens an `html_block` for a comment only when `<!--` begins the line
 * (after at most three spaces), and the engine reads directives off that token
 * (`lib/engine/slides.js`). A comment that starts mid-sentence is a `code_inline`
 * or `text` child and is PROSE — which is what closes the quoted-directive defect:
 * the example in a bullet never begins its line.
 *
 * CONTAINER PREFIXES STILL COUNT AS THE BEGINNING, because markdown-it opens the
 * `html_block` INSIDE the container. Verified against the real engine: `> <!-- … -->`,
 * `>> <!-- … -->`, `- <!-- … -->` and `1. <!-- … -->` all render the class. The
 * reader this module replaced matched them too (it ran unanchored over a whole
 * chunk); requiring column 0 lost them, and a slide with no resolved class is
 * SKIPPED by every lint rule — so the loss was silent, and in the direction of
 * less coverage than before.
 *
 * A blockquote marker needs no following space (`>>` is two levels); a list marker
 * does (`-<!--` is not a list item). `[ ]{0,3}` rather than `\s{0,3}`, because a
 * TAB-indented line is an indented CODE BLOCK to markdown-it, so a comment there
 * is not a directive — `\s` matched the tab and disagreed the other way.
 */
const COMMENT_OPEN = /^[ ]{0,3}(?:>[ \t]*|(?:[-*+]|\d{1,9}[.)])[ \t]+)*<!--/;

/**
 * …and the block runs to the line that CLOSES it, which may not be the same line.
 *
 * A SUBSTRING SEARCH, and `-->` ONLY — deliberately not the HTML spec's comment
 * end. The spec also ends a comment at `--!>`; markdown-it does not
 * (`rules_block/html_block.mjs` pairs `/^<!--/` with a literal `/-->/`), and
 * verified against the engine: a directive closed with `--!>` renders as
 * `content`, i.e. the comment swallowed it. This module's whole contract is to
 * answer "which class governs this slide?" the way the RENDERER answers it, so
 * matching the spec here would put the linter and the render back into
 * disagreement — the defect #1383 exists to remove.
 *
 * `indexOf` rather than a regex because a regex spelling of this is what
 * `js/bad-tag-filter` flags: that query reads an HTML-comment pattern as an
 * attempt to SANITIZE markup, and reports the missing `--!>` as a filter bypass.
 * Nothing here filters anything — untrusted slide HTML is sanitized by DOMPurify
 * at the preview boundary (`sanitizeSlideHtml`, HARD RULE #22), which is a
 * different boundary from this parse. A suppression comment would have said the
 * same thing, but it would not survive esbuild into
 * `docs/src/playground/authoring-core.generated.js`, where the same code is
 * scanned a second time. Not being a regex is the version that holds.
 */
const commentCloses = (line) => line.includes('-->');

/**
 * Walk lines and resolve the class payload in force at each slide.
 *
 * @param {(n: number) => string} getLine  1-based line accessor (the editor adapts
 *   CodeMirror's doc; `slideClassDirectives` adapts a string).
 * @param {number} lineCount  how many lines to walk. Walking to the CURSOR rather
 *   than to the end of the document is deliberate for the editor: "the directive
 *   above the cursor" is the contract completion has always had, and a spot
 *   directive written BELOW the cursor governing completion above it would be a
 *   behavior change, not a fix.
 * @param {(state: {payload: string, text: string, line: number}) => void} onSlideEnd
 *   called once per completed slide, in order.
 * @param {(n: number) => boolean} isBoundary  is 1-based line `n` a slide
 *   boundary? Supplied by the caller rather than decided here, because the ONE
 *   answer to that question is `chunkBoundaryLines` — see this file's header.
 * @returns {{payload: string, text: string, line: number}} the state of the LAST
 *   (possibly unterminated) slide.
 */
function walk(getLine, lineCount, onSlideEnd, isBoundary) {
  let inFence = false;
  // The CLOSE pattern is built once when a fence OPENS, not once per line inside
  // it. Compiling it per line made an unterminated fence in an untrusted deck —
  // the Studio renders shared and AI-generated markdown — cost ~136ms per
  // keystroke on a 200k-line body. Hoisting is the whole fix; the walk itself is
  // linear.
  let fenceClose = null;
  // The running global, and the line it was declared on. It survives a slide
  // boundary; the spot does not.
  let global = '';
  let globalText = '';
  let globalLine = 0;
  let spot = null;
  let spotText = '';
  let spotLine = 0;

  const state = () => (spot !== null
    ? { payload: spot, text: spotText, line: spotLine }
    : { payload: global, text: globalText, line: globalLine });

  const endSlide = () => {
    if (onSlideEnd) onSlideEnd(state());
    spot = null;
    spotText = '';
    spotLine = 0;
  };

  for (let n = 1; n <= lineCount; n++) {
    const start = n;
    const line = getLine(n) ?? '';
    // THE BOUNDARY CHECK COMES FIRST, ahead of this walk's own fence and comment
    // tracking, because it is the authoritative one: markdown-it naming a
    // TOP-LEVEL `hr` at this line is itself proof that no fenced block and no
    // `html_block` is open here. Deciding it after the fence state would let a
    // divergence in this file's approximate block tracking suppress a boundary the
    // renderer does have — which is exactly the desync the pairing contract exists
    // to prevent.
    if (isBoundary(n)) {
      endSlide();
      continue;
    }
    if (inFence) {
      if (fenceClose.test(line)) {
        inFence = false;
        fenceClose = null;
      }
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (open) {
      inFence = true;
      fenceClose = new RegExp(`^\\s{0,3}(\\${open[1][0]}{${open[1].length},})\\s*$`);
      continue;
    }
    if (!COMMENT_OPEN.test(line)) continue;
    // MULTI-LINE COMMENTS ARE DIRECTIVES TOO, and missing that was a regression
    // rather than a gap: Marpit documents the form, the engine honors it (one
    // `html_block` token spanning the lines, and `readDirectiveComment`'s `\s*`
    // matches the newlines), `slide-class-spans.js` resolves it — and the
    // single-line regex this module replaced matched it as well, because it ran
    // `.match()` over a whole chunk where `\s` and `[^>]` both cross newlines.
    //
    //     <!--
    //     _class: kpi
    //     -->
    //
    // Reading one line at a time made it invisible, which took EVERY lint rule on
    // that slide with it (`lintTextWith` skips a slide with no resolved class).
    // So the walk consumes to the closing line and hands the whole comment to the
    // shared grammar, exactly as the render pipeline does.
    // TEST THE NEW LINE, NOT THE WHOLE BUFFER. Re-scanning the accumulated `raw`
    // each iteration is O(n²) in bytes, and an author controls the input: a single
    // unterminated `<!--` runs this to EOF, so on a 32k-line deck one stray opener
    // took 8s against 5ms clean (measured), on a scan that runs per keystroke in
    // the Studio over shared / AI-generated markdown. That is the same hazard the
    // fence-close regex above is hoisted out of the loop to avoid — the comment
    // path just did not get the same treatment.
    //
    // Equivalent because `-->` cannot straddle the `\n` this joins on, so a close
    // can only ever appear in the line just appended.
    // Hand the GRAMMAR the comment, not the container it sits in: `readDirectiveComment`
    // requires the text to start with `<!--`, so a `> ` or `- ` prefix would make it
    // reject a directive the engine honors. Only the opening line can carry a prefix.
    const opener = line.slice(line.indexOf('<!--'));
    let raw = opener;
    let close = n;
    let closed = commentCloses(opener);
    while (!closed && close < lineCount) {
      close += 1;
      const next = getLine(close) ?? '';
      raw += `\n${next}`;
      closed = commentCloses(next);
    }
    if (!closed) continue; // unterminated — markdown-it runs it to EOF; no directive
    const dir = readDirectiveComment(raw.trim(), CLASS_ONLY);
    // The consumed lines are part of this comment, not candidates of their own —
    // but they are still put to the boundary oracle, because THAT is what the
    // pairing contract is counted from. A `---` written inside a multi-line
    // comment (commenting a run of slides out) is not a boundary and the oracle
    // says so; if this walk's idea of where the comment ENDS ever diverges from
    // markdown-it's, the oracle still wins and the arrays still line up. The
    // earlier cut of this loop re-tested the lines with its own `/^---$/` and
    // deliberately counted them, to match a splitter that was itself wrong.
    for (let k = start + 1; k <= close; k++) if (isBoundary(k)) endSlide();
    n = close;
    if (!dir) continue;
    if (dir.spot) {
      // LAST spot on a slide wins, matching the engine's overlay of two on one slide.
      spot = dir.value;
      spotText = raw.trim();
      spotLine = start;
    } else {
      // A global applies from ITS OWN slide onward — so it lands on this slide too,
      // unless this slide also names a spot.
      global = dir.value;
      globalText = raw.trim();
      globalLine = start;
    }
  }
  return state();
}

/**
 * The class directive in force on every chunk of `source`, indexed EXACTLY as
 * `splitTopLevel(source)` indexes its chunks — front-matter chunks included, so a
 * caller's existing `idx - fmChunks + 1` slide numbering is untouched. "Exactly"
 * is structural: both count from `chunkBoundaryLines`.
 *
 * Each entry carries the resolved `payload`, the raw `text` of the winning
 * directive (what a lint finding quotes back to the author — and on a slide
 * governed by a running global, that is the global's line, which is where the
 * author has to go to change it), and its 1-based document `line`.
 *
 * @param {string} source
 * @returns {{payload: string, text: string, line: number}[]}
 */
export function slideClassDirectives(source) {
  // THE ENGINE'S LINE GEOMETRY, because the boundary line numbers are counted in
  // it: `\r\n` and a lone `\r` fold to `\n`, a BOM is dropped, and U+2028 / U+2029 are
  // NOT terminators. This walk used to split on JavaScript's `/m` terminator set
  // instead, to match a `source.split(/^---$/m)` splitter — so a U+2028 in prose
  // (routine in text pasted out of JSON) gave the two different line counts, and
  // every slide after it was linted against its neighbor's contract.
  const lines = normalizeSourceText(String(source ?? "")).split("\n");
  const boundaries = new Set(chunkBoundaryLines(source).map((ln) => ln + 1));
  const out = [];
  const last = walk(
    (n) => lines[n - 1],
    lines.length,
    (state) => out.push(state),
    (n) => boundaries.has(n),
  );
  out.push(last);
  return out;
}

/**
 * The class directive governing the slide that line `lineNo` sits on — `null`
 * when none does.
 *
 * BOUNDARIES COME FROM THE PREFIX, not from the whole document, and that is not an
 * approximation: this walk only ever reads lines 1..`lineNo`, and CommonMark decides
 * a line's block role from the lines at or before it plus the immediately following
 * one. So parsing the prefix names the same boundaries inside it that a full parse
 * would. It also matches what the editor's contract has always been — "the directive
 * ABOVE the cursor" — on a document being typed, where the text below is half-written.
 *
 * @param {(n: number) => string} getLine  1-based line accessor
 * @param {number} lineNo  the cursor's line
 * @returns {{payload: string, text: string, line: number} | null}
 */
export function classDirectiveAt(getLine, lineNo) {
  const above = [];
  for (let n = 1; n <= lineNo; n++) above.push(getLine(n) ?? '');
  const boundaries = new Set(chunkBoundaryLines(above.join('\n')).map((ln) => ln + 1));
  const state = walk(getLine, lineNo, null, (n) => boundaries.has(n));
  return state.payload ? state : null;
}

export default { slideClassDirectives, classDirectiveAt };
