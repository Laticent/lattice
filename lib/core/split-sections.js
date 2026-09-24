/**
 * Depth-aware <section> splitter — the shared HTML-string section walker.
 *
 * Splits rendered Marpit/engine HTML into ordered pieces — `gap` (text between
 * sections) and `section` ({ openTag, inner, cls }) — with a depth-aware
 * </section> scan that survives nested sections. Reassemble with
 * `openTag + inner + '</section>'`.
 *
 * Pure + fs-free, so both the Node render kernels (lib/integrations/markdown-it/plugins.js
 * progress rail) and the browser-bundled Form Tile kernels (lib/forms/tile/*)
 * can share ONE implementation instead of hand-copying the walker. Mirrors the
 * inline walks in lib/forms/cell/masthead/masthead.transform.js / below-note.js (those operate
 * section-by-section; this one returns the full ordered piece list).
 *
 * ── WHY THIS WALKS `scanTags` AND NOT `indexOf('<section')` ─────────────────
 *
 * The walker used to scan for the literal string `<section`, which is not a
 * question a browser ever asks: it finds the characters wherever they sit,
 * including inside an HTML comment, inside `<style>`/`<script>` RAWTEXT, and
 * inside a quoted attribute value. A deck that merely MENTIONS a section tag —
 * one comment quoting `<section class="title">` — opened a phantom section whose
 * close never balanced, so the walk consumed both real slides as "nested", found
 * no matching `</section>`, and returned the whole remainder as ONE inert gap.
 * Every caller then no-opped: `applyFormToHtml` stamped no `data-form`, no
 * `data-frame` and no `form` class on any slide (measured: 0 of 2), the progress
 * Tile laid no rail, and the watermark never landed.
 *
 * The DOM twin never had the bug, because it walks a real parse where a comment
 * is a comment node — so the same deck got two different answers depending on
 * which path rendered it. That divergence is the thing the Form work set out to
 * remove (`engineering/decisions/2026-09-20-form-is-not-configurable.md`
 * § Known gaps), and a comment-skipping patch bolted onto the string scan would
 * have closed one shape of it while leaving RAWTEXT and attribute values open.
 *
 * `scanTags` (lib/core/top-level-h2.js) is the repo's tokenizer for exactly this
 * and its docblock says so: inert spans are YIELDED rather than swallowed
 * "because the depth walk must not count them". Reusing it (HARD RULE #1, #15)
 * moves the walk MUCH closer to what a browser sees, and closes three further
 * shapes the old scan got wrong:
 *
 *   · `<sectionfoo>` no longer counts as a `<section>` — `indexOf('<section')`
 *     matched any tag with that prefix; the tokenizer reads the whole name.
 *   · A `>` inside a quoted attribute no longer ends the open tag early, so
 *     `<section title="a>b" class="x">` reports `cls` as `x` rather than ''.
 *   · A single-quoted `class='…'` is read. The engine only emits double quotes,
 *     so nothing in the corpus reaches it — but `applyFormToHtml` then wrote a
 *     SECOND class attribute onto such a tag, which is a duplicate-attribute
 *     defect rather than a cosmetic one.
 *
 * NOTE ON `<section/>`: the trailing slash is ignored for non-void HTML
 * elements, so a browser reads `<section/>` as an ordinary open tag. The walk
 * does the same (it does not honor `selfClose` here), which is also what the
 * previous `indexOf` scan did — the shape is preserved deliberately, not by
 * omission.
 *
 * ── WHERE IT STILL DIFFERS FROM A REAL PARSE, ON PURPOSE ────────────────────
 *
 * "Closer to a browser" is not "is a browser", and the gaps are deliberate:
 *
 *   · A NEVER-CLOSED `<section>` yields no section (a parser auto-closes it at
 *     EOF and reports one). The old walk did the same; every caller here
 *     rewrites pieces back into a document, and inventing a whole close tag for
 *     a malformed OPEN one would move an author's bytes.
 *     That argument is about the open tag, and it does NOT extend to a malformed
 *     CLOSE tag, which the walker now accepts: `</section` with no `>`,
 *     `</section >`, `</SECTION>` and `</section foo>` all close a section, and
 *     since every caller reassembles with the literal `'</section>'` those bytes
 *     ARE rewritten. Measured: 22,391 round-trip differences over 200,000
 *     close-tag-shaped documents, and 0 over the 186 rendered `examples/*.md` —
 *     the engine emits one spelling. Accepted deliberately and pinned by test;
 *     do not read the open-tag sentence above as covering it.
 *   · An UNCLOSED `<style>`/`<script>` does not swallow the rest of the
 *     document, though a browser's RAWTEXT rule says it should. Matching the
 *     browser here is catastrophic rather than correct — one sentence of prose
 *     mentioning a `<style>` tag left `splitSections` stamping 0 of 3 slides.
 *     See the note at the RAWTEXT branch in `scanTags`.
 *   · An UNTERMINATED `<!--` is text here, not a comment to EOF. The first cut
 *     of the walk followed the browser and dropped every later slide from the
 *     export on one `<div><!-- oops</div>`; the reasoning is the unclosed
 *     `<style>` bullet above, and it lives in `scanTags`.
 *   · `<template>` content is a separate fragment to a parser, so a `<section>`
 *     inside one is invisible to the DOM and visible here. Pre-existing; the
 *     sibling `walkTopLevel` in that same module handles it and this walk does
 *     not.
 */

const { scanTags } = require('./top-level-h2');

/**
 * The `class` attribute of an open tag, found by WALKING THE ATTRIBUTES rather
 * than by matching a regex over the whole tag.
 *
 * A regex cannot tell an attribute from text that looks like one. `\sclass="…"`
 * matched the leftmost occurrence, so a tag whose OTHER attribute's value merely
 * contained the characters ` class='x'` was read — and rewritten — in the wrong
 * place:
 *
 *   <section data-tip="write class='x' here" class="lattice">
 *
 * read as `x`, and the rewrite tore the `data-tip` value open into bogus
 * attributes while the real class never got `form` appended, so the slide lost
 * its chrome. Walking attribute positions is the only thing that answers
 * "is this the class ATTRIBUTE" rather than "does this text appear somewhere".
 *
 * Returns `{ value, start, end }` — the value, and the span of the whole
 * attribute (name through closing quote) so a caller can splice a replacement
 * in. `null` when the tag carries no class.
 *
 * Splicing is also why there is no `String.replace` here: a replacement STRING
 * gives `$&` and friends their special meaning, so a class value containing `$&`
 * injected the matched text back into itself.
 */
// HTML's five whitespace characters. A comparison, not `/[ \t\n\r\f]/.test`:
// this runs per character of every section open tag on every walk.
const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

function findClassAttr(openTag) {
  const t = String(openTag);
  let i = t.indexOf('<') + 1;
  if (t[i] === '/') i += 1;
  while (i < t.length && !isSpace(t[i]) && t[i] !== '>' && t[i] !== '/') i += 1;  // tag name

  while (i < t.length) {
    while (i < t.length && (isSpace(t[i]) || t[i] === '/')) i += 1;
    if (i >= t.length || t[i] === '>') return null;
    const start = i;
    while (i < t.length && !isSpace(t[i]) && t[i] !== '=' && t[i] !== '>' && t[i] !== '/') i += 1;
    const name = t.slice(start, i).toLowerCase();
    while (i < t.length && isSpace(t[i])) i += 1;
    if (t[i] !== '=') {                                   // a valueless attribute
      if (name === 'class') return { value: '', start, end: i };
      continue;
    }
    i += 1;
    while (i < t.length && isSpace(t[i])) i += 1;
    let valStart = i;
    let valEnd;
    const q = t[i];
    if (q === '"' || q === "'") {
      valStart = i + 1;
      valEnd = t.indexOf(q, valStart);
      if (valEnd < 0) valEnd = t.length;
      i = Math.min(valEnd + 1, t.length);
    } else {
      while (i < t.length && !isSpace(t[i]) && t[i] !== '>') i += 1;
      valEnd = i;
    }
    if (name === 'class') return { value: t.slice(valStart, valEnd), start, end: i };
  }
  return null;
}

/** Splice a new `class="…"` into `openTag`, or add one when it carries none. */
function withClass(openTag, next) {
  const a = findClassAttr(openTag);
  if (a) return `${openTag.slice(0, a.start)}class="${next}"${openTag.slice(a.end)}`;
  const lt = openTag.indexOf('<');
  let i = lt + 1;
  while (i < openTag.length && !isSpace(openTag[i]) && openTag[i] !== '>' && openTag[i] !== '/') i += 1;
  return `${openTag.slice(0, i)} class="${next}"${openTag.slice(i)}`;
}

// ── THE FAST PATH, AND WHY IT GIVES THE TOKENIZER'S ANSWER ───────────────────
//
// `scanTags` reads EVERY tag, and this walk runs over the whole document on
// every `mapSections` call, about a dozen per deck render. Measured on the
// gallery deck (339 KB, ~10k tags): a render went from ~72 ms to ~100 ms when the
// walk moved onto the tokenizer. Only the SECTION tags matter here, though, and a
// literal scan for them gives the tokenizer's answer on any stretch that contains
// none of the things that make a `<section` literal something other than a tag:
//
//   · an inert span — `<!` (comment, doctype, CDATA), `<?`, or a RAWTEXT element
//     (`<script`, `<style>`, `<textarea>`);
//   · a quoted attribute value holding `<` or `>` — the quote rule is
//     `scanTags`'s own: a quote opens a value only directly after `=`;
//   · a `<` INSIDE a tag, before its `>` — an attribute name or an unquoted value.
//     With no quoted `>` in the stretch, a tag's first `>` is its real end, so
//     this pattern sees every such `<`.
//
// So the walk jumps literal section tag to literal section tag while `DIRTY`
// finds none of those between them, and hands any stretch it does find one in to
// `scanTags`, resuming the jump at the next real section tag whose following
// stretch is clean. A false "dirty" only costs speed; the argument above is what
// rules out a false "clean". `test/unit/core/split-sections-fast-path.test.js`
// pins the whole walk to the tokenizer-only walk over a seeded fuzz corpus.
const SECTION_LITERAL = /<(\/?)section(?![a-zA-Z0-9-])/gi;
// Each class stops at the first character that decides it (`[^"<>]*[<>]`, not
// `[^"]*[<>]`), so no alternative backtracks across a long value or tag.
const DIRTY = /<!|<\?|<(?:script|style|textarea)(?![a-zA-Z0-9-])|=\s*(?:"[^"<>]*[<>]|'[^'<>]*[<>])|<\/?[a-zA-Z][^<>]*</gi;

// `isClean(from, to)` for one document. `DIRTY` has no lookbehind, so whether a
// match STARTS at a position does not depend on where the search began: the
// leftmost match at or after `from` is also the leftmost at or after any `from'`
// between `from` and it. One search therefore answers every later query up to
// the match it found, and the walk stays linear instead of rescanning the tail
// of the document once per section.
function cleanChecker(src) {
  let searchedFrom = Infinity;
  let at = -1;                          // leftmost match at or after searchedFrom; Infinity = none
  return (from, to) => {
    if (!(from >= searchedFrom && from <= at)) {
      DIRTY.lastIndex = from;
      const m = DIRTY.exec(src);
      searchedFrom = from;
      at = m ? m.index : Infinity;
    }
    return at >= to;
  };
}

// The next literal section tag at or after `from`, with the end of the stretch
// that must be clean for it to be read literally (through its own `>`).
function nextLiteral(src, from) {
  SECTION_LITERAL.lastIndex = from;
  const m = SECTION_LITERAL.exec(src);
  if (!m) return { m: null, until: src.length };
  const gt = src.indexOf('>', m.index);
  return { m, gt, until: gt < 0 ? src.length : gt + 1 };
}

function walkFast(src, onSection) {
  const n = src.length;
  const isClean = cleanChecker(src);
  let pos = 0;
  while (pos < n) {
    const { m, gt, until } = nextLiteral(src, pos);
    if (isClean(pos, until)) {
      if (!m) return;
      if (gt < 0) {                     // unterminated tag: nothing follows it
        onSection({ isClose: m[1] === '/', start: m.index, end: n });
        return;
      }
      onSection({ isClose: m[1] === '/', start: m.index, end: gt + 1 });
      pos = gt + 1;
      continue;
    }
    // Dirty: the tokenizer decides, from `pos` (always a point outside any tag),
    // until a real section tag is followed by a clean stretch again.
    let resumed = false;
    for (const t of scanTags(src, pos)) {
      if (t.kind !== 'tag' || t.name !== 'section') continue;
      onSection(t);
      if (isClean(t.end, nextLiteral(src, t.end).until)) { pos = t.end; resumed = true; break; }
    }
    if (!resumed) return;
  }
}

function splitSections(html, { tokenizerOnly = false } = {}) {
  // NO `String(html ?? '')`, matching the old walk, which read `html.length`
  // directly. Coercing would turn a caller's mistake into a silent empty answer
  // — a wrong render instead of a crash, the trade `lib/engine/index.js` refuses
  // at its own door. A caller that wants leniency coerces at ITS call site, as
  // `applyDeckLogoToHtml` does.
  //
  // THIS IS NOT A TYPE CHECK, and an earlier revision of this note claimed more
  // than it does. Only `undefined`, `null` and a Buffer throw here; `42`, `{}`
  // and `true` all return `[]`, and an array yields one gap whose `.text` is the
  // array — which `applyFormToHtml`'s `.join('')` will stringify into a wrong
  // render. No caller passes one (all 30 call sites were enumerated), so this
  // buys a loud failure for the shapes it catches and nothing for the rest.
  const src = html;
  const pieces = [];
  let i = 0;        // start of the not-yet-emitted run of text
  let open = -1;    // offset of the current TOP-LEVEL `<section`
  let tagEnd = -1;  // one past that open tag's `>`
  let depth = 0;

  // One section tag, `{ isClose, start, end }` — the depth bookkeeping.
  const onSection = (t) => {
    if (!t.isClose) {
      if (depth === 0) { open = t.start; tagEnd = t.end; }
      depth += 1;                       // see NOTE ON `<section/>` above
      return;
    }

    // A stray `</section>` with nothing open is text as far as this walk is
    // concerned — a counter that went negative here would report the NEXT
    // close tag as a top-level one and split the document in the wrong place.
    if (depth === 0) return;
    depth -= 1;
    if (depth > 0) return;

    if (open > i) pieces.push({ type: 'gap', text: src.slice(i, open) });
    const openTag = src.slice(open, tagEnd);
    const cm = findClassAttr(openTag);
    // `start`/`end` are the section's offsets in `html` and `close` is its close
    // tag VERBATIM. Most callers reassemble with a literal '</section>' and need
    // none of them; `mapSections` (lib/core/section-walk.js) promises to pass an
    // untouched section through byte-identical, and a malformed close tag the
    // walker accepts (see above) would otherwise be rewritten.
    pieces.push({
      type: 'section',
      openTag,
      inner: src.slice(tagEnd, t.start),
      cls: cm ? cm.value : '',
      close: src.slice(t.start, t.end),
      start: open,
      end: t.end,
    });
    i = t.end;
    open = -1;
  };

  // A non-string walks the tokenizer alone, which is what fixes the shapes the
  // note above describes (a Buffer throws, an array becomes one gap).
  // `tokenizerOnly` is the REFERENCE walk the fast path is tested against; no
  // render path passes it.
  if (typeof src !== 'string' || tokenizerOnly) {
    for (const t of scanTags(src)) if (t.kind === 'tag' && t.name === 'section') onSection(t);
  } else {
    walkFast(src, onSection);
  }

  // Whatever is left is a gap — including an unterminated or never-closed
  // `<section`, which the old walk also surrendered to the trailing gap.
  if (i < src.length) pieces.push({ type: 'gap', text: src.slice(i) });
  return pieces;
}

module.exports = { splitSections, findClassAttr, withClass };
