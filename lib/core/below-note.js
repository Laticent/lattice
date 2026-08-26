/**
 * Stage extraction + the `no-note` opt-out — what is left of the below-note kernel.
 *
 * THIS MODULE USED TO PROMOTE THE TRAILING NOTE. It ran LAST in the transformer
 * registry, wrapping a layout's trailing `<p>` in `.below-note` once every
 * structural transform had settled what the section's final trailing element was.
 * The universal CODA kernel (lib/core/coda.js) makes that decision now — for both
 * trailing beats at once, on the AUTHORED body, before a rebuilder can move or
 * delete the node. Running last was the best a pass could do while it had to cope
 * with whatever the transforms left behind; it could never help the three
 * components that rebuild their section outright, because by then there was
 * nothing to wrap. See engineering/decisions/2026-08-24-universal-coda-cell.md.
 *
 * The promotion machinery is DELETED rather than kept "for reference" — an
 * unreachable code path is a window (HARD RULE #18), and its history is in the
 * decision note and in git. Two things survive because they are still called, and
 * neither is about notes:
 *
 *   · `hasOptOut` / `OPT_OUT_TOKEN` — the author's per-slide `no-note` suppression,
 *     which the coda kernel reads to withhold the note beat.
 *   · `extractStage` / `findStageOpen` — the depth-aware `.cell-stage` body finder,
 *     used by lib/core/split-envelope.js and lib/core/carousel.js. It is a STAGE
 *     utility that happens to have been written here; moving it to a better home is
 *     a refactor of its own, not this change's.
 */

// The author's per-slide opt-out. It exists because #1292 made `content` the default
// layout and #1322 stopped excluding it — both correct — with a consequence nobody had
// a lever for: "a list, then a concluding sentence" is an ordinary prose shape, and
// promotion turns that conclusion into a footnote (muted ink, hairline rule, pushed to
// the stage floor). A blanket exclusion was the other option and was the wrong shape: it
// would withhold the treatment from every `content` slide — including the un-classed
// ones #1292 created, which is most of the corpus — to serve the minority that wants the
// paragraph plain. The default stays promotion; the escape hatch is per slide, or
// deck-wide via `class: no-note`.
//
// TOKEN-EXACT, deliberately. A suppression flag has to be, so a future `no-notebook`
// cannot silently disable notes. (The layout matching this used to sit beside was a
// SUBSTRING test, which is exactly how `compare-code` inherited `code`'s exclusion —
// #1363. Layout claims are declared and token-exact now; see lib/core/coda.js.)
const OPT_OUT_TOKEN = 'no-note';

// Accepts the two shapes a class list travels as in this engine: the attribute STRING the
// HTML/DOM paths carry, and the TOKEN ARRAY `resolve-component.js` and the markdown-it
// plugins pass around. A string-only implementation is wrong in the silent direction on an
// array — `String(['a','no-note'])` is `'a,no-note'`, which splits on whitespace into one
// token and matches nothing. Two shapes, one answer.
function hasOptOut(cls = '') {
  const tokens = Array.isArray(cls) ? cls : String(cls).split(/\s+/);
  return tokens.includes(OPT_OUT_TOKEN);
}

// HTML5 void elements never open a nesting level, whether or not they carry
// a self-closing slash — needed so the top-level scan below doesn't miscount
// depth on a stray <br>/<img> in prose.
const VOID_TAGS = new Set([
  'br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col',
  'embed', 'source', 'track', 'wbr',
]);

// Depth-aware scan for STAGE_OPEN as a genuine TOP-LEVEL element of `inner`
// (a direct sibling of the optional header/masthead-band, never nested) —
// real masthead-lift output only ever emits it there. A literal match at
// depth > 0 is content, not structure: a `<pre>`/code sample or hand-authored
// HTML that merely mentions the string `<div class="cell-stage">` (this
// repo's own docs discuss it) must not be mistaken for the real cell.
//
// KEY ON THE CLASS, NEVER THE TAG — AND DON'T PIN THE ATTRIBUTES EITHER. The stage
// cell's ELEMENT is not fixed: it is a `<div>` normally and a `<figure>` when it holds a
// captioned graphic (masthead.transform.js `buildStageCell`), and the figure carries an
// `aria-label` the div does not. A matcher pinned to `<div class="cell-stage">` finds
// nothing on a captioned chart slide and falls silently back to the flat section-level
// anchor — a wrong answer that renders, which is the worst kind. This repo has hit that
// footgun in five separate places; the rule is: match the class, capture the tag, balance
// the tag you captured, and let the rest of the opening tag vary.
const STAGE_OPEN_RE = /^<([a-zA-Z][a-zA-Z0-9-]*)\s+class="cell-stage"(?:\s[^>]*)?>$/;
function findStageOpen(inner) {
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/)?>|<\/([a-zA-Z][a-zA-Z0-9-]*)>/g;
  let depth = 0;
  let m;
  while ((m = tagRe.exec(inner))) {
    const [full, openName, selfClose, closeName] = m;
    if (closeName) { if (depth > 0) depth--; continue; }
    if (selfClose || VOID_TAGS.has(openName.toLowerCase())) continue;
    if (depth === 0) {
      const stage = full.match(STAGE_OPEN_RE);
      if (stage) return { index: m.index, tag: stage[1].toLowerCase(), openLen: full.length };
    }
    depth++;
  }
  return null;
}

// Every open/close tag, as ONE static pattern. Deliberately not built per-call from the
// tag we found: interpolating parsed input into a `new RegExp` is a regex-injection shape
// even when the capture is provably `[a-zA-Z][a-zA-Z0-9-]*` (CodeQL flags it, and it is
// right to — the safety there rests on a constraint a reader has to go find). Matching
// all tags and comparing the NAME needs no escaping argument, and builds nothing per call.
const ANY_TAG = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/)?>|<\/([a-zA-Z][a-zA-Z0-9-]*)>/g;

// The only elements a trailing `/` genuinely closes, besides VOID_TAGS: the roots of
// foreign content, where XML self-closing is honored by the HTML parser.
const FOREIGN_ROOTS = new Set(['svg', 'math']);

// Depth-aware extraction of the top-level stage cell's body, balancing nested opens
// of the SAME tag the open used — the way applyToHtml's own section walk balances
// `<section>`. Returns null when masthead-lift hasn't wrapped this section's body (no
// Form, or a STAGE_DEFERRED layout that keeps direct-child bodies) — the section's
// flow is then flat and the plain TRAILING_NOTE anchor below already reaches its true
// trailing `<p>`.
// EXPORTED (not private) because the split envelope resolves its collection
// and its trailing material inside the SAME content cell this finds
// (lib/core/split-envelope.js; HARD RULE #15 — one implementation, not a clone).
function extractStage(inner) {
  const open = findStageOpen(inner);
  if (!open) return null;
  const bodyStart = open.index + open.openLen;
  ANY_TAG.lastIndex = bodyStart;
  let depth = 1;
  let m;
  while ((m = ANY_TAG.exec(inner))) {
    const [, openName, selfClose, closeName] = m;
    if (closeName) {
      if (closeName.toLowerCase() !== open.tag) continue;
      if (--depth === 0) return { bodyStart, bodyEnd: m.index };
      continue;
    }
    // `/>` DOES NOT self-close an HTML element — the parser treats `<div/>` as an OPEN
    // tag, and only void elements and the foreign-content roots (`<svg/>`, `<math/>`)
    // actually close themselves. The first version of this rewrite honored `/>` for
    // everything, so `<div class="cell-stage"><div class="x"/></div><p>after</p>` ended
    // the cell one element early and left the real trailing `<p>` outside it. The tag
    // being balanced here is never void, so only the foreign-content case can apply.
    if ((selfClose && FOREIGN_ROOTS.has(openName.toLowerCase())) || openName.toLowerCase() !== open.tag) continue;
    depth++;
  }
  return null; // unbalanced — leave inner untouched rather than guess
}

module.exports = {
  OPT_OUT_TOKEN,
  hasOptOut,
  extractStage,
};
