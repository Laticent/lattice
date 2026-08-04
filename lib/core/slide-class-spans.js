/**
 * lib/core/slide-class-spans.js
 *
 * WHICH SLIDE does a byte of deck source belong to, and what class did that slide
 * end up with? Derived from the ENGINE'S OWN slide boundaries, not a regex over
 * preceding text.
 *
 * THE BUG THIS EXISTS TO CLOSE (#1329). The PDF path used to answer "what band is
 * this diagram in?" by scanning the whole document up to the fence:
 *
 *   const before = source.slice(0, offset);
 *   const classDirectives = [...before.matchAll(/<!--\s*_class:\s*([^>]*?)\s*-->/g)];
 *   const lastClass = classDirectives.at(-1)?.[1] ?? '';
 *
 * `before` never resets at a slide boundary, and Marp's `_class` is a SINGLE-SLIDE
 * directive — it does not carry forward. So a bare slide following a
 * `<!-- _class: dark -->` slide got a DARK-baked diagram on a light canvas: white
 * node ink on a light chip. The fallback was asymmetric too — once any `_class:`
 * had appeared anywhere earlier, the deck default stopped being consulted for
 * every later slide, whether or not that slide declared anything.
 *
 * BOUNDARIES COME FROM MARKDOWN-IT, NOT A LINE REGEX, and that is load-bearing.
 * The engine splits on the same top-level `hr` tokens markdown-it emits — every
 * thematic-break FORM (`---`, `***`, `___`, `- - -`), not the literal `---` line
 * alone — and it treats a setext underline (`text` / `---`) as an H2 heading, never
 * a break. A parallel line-regex splitter disagrees on each of those, and two
 * disagreements of opposite sign restore an equal COUNT while offsetting the
 * MAPPING, so a diagram's band lands on the wrong slide. The parser is the SHARED
 * one (lib/core/boundary-parser.js), configured from the engine's own options —
 * a locally built markdown-it beside a comment claiming parity is how a `$$…$$`
 * body's lone `=` line came to be read as a setext H1, i.e. as a slide boundary
 * the engine does not have.
 *
 * BOTH CLASS DIRECTIVE FORMS ARE READ — the spot `<!-- _class: X -->` and the
 * GLOBAL `<!-- class: X -->`, which carries forward from its slide to the end of
 * the deck. Reading only the spot form (which is what this did first) means a deck
 * that switches canvas mid-way renders dark sections with light-baked Mermaid ink.
 * The resolution rule is the engine's, not a second interpretation of it: see the
 * two passes at the bottom of `slideClassSpans`.
 *
 * `split: headings` boundaries are included, from the same `headingSplitPoints`
 * the live divider and the Export-to-Marp baker use — so a heading-divided deck
 * resolves per SUB-slide, as the engine does. Unlike `bakeSplits` this does not
 * rewrite the source to get them, because a rewritten source moves every byte
 * offset and the caller needs offsets in the deck it actually has.
 *
 * The two boundary kinds are NOT interchangeable: an `hr` line is CONSUMED (it
 * belongs to neither neighbor), while a heading-split line STARTS the next slide
 * (the heading is that slide's first block). Treating them alike shifts a
 * directive one slide in a heading-divided deck.
 *
 * Pure (markdown-it only, no fs).
 */

const { boundaryParser: md, FRONT_MATTER } = require('./boundary-parser');
const { readDirectiveComment } = require('./comment-directive');
const { headingSplitPoints } = require('./heading-split-core');
const { resolveSplitMode } = require('./resolve-split');

// The vocabulary slice this module's question needs. `class` is not a flag
// directive, so parsing it under a one-key vocabulary is byte-identical to
// parsing it under the engine's full set — see lib/core/comment-directive.js.
const CLASS_ONLY = { known: new Set(['class']), flags: new Set() };

/**
 * Per-slide spans over the FULL source (front matter included), each carrying the
 * class payload in force on that slide — its own `_class:` when it has one, else
 * the running global `class:` directive.
 *
 * @param {string} source  the full deck source, exactly as the caller holds it.
 * @returns {{spans: Array<{start: number, end: number, slideClass: string}>}}
 *   `start`/`end` are full-source byte offsets, `end` exclusive. Contiguous and
 *   gapless from the end of the front matter to the end of the source, so every
 *   offset in the body lands in exactly one span.
 *
 *   `slideClass` is what the DECK BODY declares for that slide — its own `_class:`
 *   or the running global — and NOT the deck-wide front-matter `class:`, which the
 *   engine also folds in. That exclusion is deliberate and explained where it is
 *   made (below), but it makes this a partial answer to "what class does this
 *   section have": a caller asking whether a slide is a `kpi`, or carries `print`,
 *   gets nothing from a deck that says so only in its front matter. The band
 *   question is whole because `resolveDiagramBand` reads the deck half itself.
 */
function slideClassSpans(source) {
  const src = typeof source === 'string' ? source : '';
  const fmMatch = src.match(FRONT_MATTER);
  const bodyStart = fmMatch ? fmMatch[0].length : 0;
  const body = src.slice(bodyStart);

  const lines = body.split('\n');
  // Full-source offset of the first character of each body line.
  const lineOffset = new Array(lines.length);
  let acc = bodyStart;
  for (let i = 0; i < lines.length; i++) {
    lineOffset[i] = acc;
    acc += lines[i].length + 1; // + the '\n' that split removed
  }

  const tokens = md.parse(body, {});
  const boundaries = [];
  for (const t of tokens) {
    if (t.type === 'hr' && t.level === 0 && Array.isArray(t.map)) {
      boundaries.push({ line: t.map[0], consumed: true });
    }
  }
  if (resolveSplitMode(src) === 'headings') {
    for (const i of headingSplitPoints(tokens)) {
      const line = tokens[i]?.map?.[0];
      if (line != null) boundaries.push({ line, consumed: false });
    }
  }
  // A heading that also sits on an `hr` line cannot happen, but a duplicate line
  // from two heading points can — dedupe so a span cannot come out empty-by-accident.
  const seen = new Set();
  const ordered = boundaries
    .sort((a, b) => a.line - b.line || Number(b.consumed) - Number(a.consumed))
    .filter((b) => {
      if (seen.has(b.line)) return false;
      seen.add(b.line);
      return true;
    });

  // Spans are built from their START lines and each runs to the next one, so the set
  // is CONTIGUOUS AND GAPLESS: every body offset lands in exactly one slide. A
  // consumed `hr` line therefore sits at the tail of the slide before it rather than
  // in a hole — which changes no answer (a `_class:` directive is never on a `---`
  // line) and removes a whole class of "this offset belongs to no slide" edge case
  // from every caller.
  //
  // A LEADING `---` MAKES NO SLIDE, and that rule has to be mirrored rather than
  // inferred. `splitOnHr` (lib/engine/slides.js) drops its first group when that
  // group is EMPTY — front matter is already stripped, so an empty first group
  // means the body opened with a thematic break, which is an ordinary Marp idiom.
  // Group zero is empty exactly when the first token IS that `hr` (every non-`hr`
  // token joins the current group, and blank lines produce no tokens at all), and
  // `headingSplitPoints` cannot return index 0 — it requires a preceding heading —
  // so the `hr` case is the whole rule.
  //
  // The leading span is MERGED FORWARD rather than deleted: the set stays
  // contiguous and gapless from the end of the front matter, so no caller grows a
  // "this offset belongs to no slide" branch. Deleting it would leave a hole that
  // `slideClassAt` answers `''` for — the same silent-wrong-band shape this module
  // exists to close.
  const bodyOpensWithRule = tokens[0]?.type === 'hr' && tokens[0]?.level === 0;
  const startLines = bodyOpensWithRule ? [] : [0];
  for (const b of ordered) startLines.push(b.consumed ? b.line + 1 : b.line);
  const uniqueStarts = [...new Set(startLines)].sort((a, b) => a - b).filter((n) => n <= lines.length);
  const offsetOf = (line) => (line < lines.length ? lineOffset[line] : src.length);
  const spans = uniqueStarts.map((line, i) => {
    const start = offsetOf(line);
    const end = i + 1 < uniqueStarts.length ? offsetOf(uniqueStarts[i + 1]) : src.length;
    return { start, end: Math.max(start, end), slideClass: '' };
  });
  if (spans.length) spans[0].start = bodyStart;

  // ── Attribute the class directives to their slides ────────────────────────
  //
  // TWO FORMS, and reading only the first is what made a mid-deck canvas switch
  // bake the wrong band. Marp's rule, which lib/engine/slides.js spells as
  // `{ ...runningGlobal, ...slideLocal }`:
  //
  //   <!-- _class: X -->   SPOT   — this slide only, and it REPLACES the running
  //                                 global for that slide (it does not merge with
  //                                 it: the engine overlays whole directive keys).
  //   <!-- class: X -->    GLOBAL — from this slide onward, until the next global
  //                                 `class:` changes it.
  //
  // So the answer for a slide is its own spot value if it has one, otherwise the
  // global in force AT that slide. Both walks are in document order over the same
  // directive scan, so a global and a spot on the SAME slide resolve exactly as
  // the engine resolves them.
  //
  // The front-matter `class:` is NOT seeded in here even though the engine seeds
  // its running global from it, because the deck-level value reaches the band
  // through the other half of the answer (`deckDarkBand` reads the front matter
  // directly, and it has to: `color-mode:` SUPERSEDES a `class:` color token, so
  // a deck writing `color-mode: dark` + `class: light` is dark. Seeding `light`
  // here as a slide-level pin would outrank that and invert the band). Only the
  // BODY is tokenized, so a front-matter key cannot reach the walk by accident.
  //
  // THE DIRECTIVES COME FROM THE TOKEN STREAM, not from a scan of the raw text,
  // for the same reason the boundaries do. The engine honors a directive comment
  // when it arrives as an `html_block` token; a `<!-- _class: kpi -->` written
  // inside a fenced code block or an inline-code span is a `fence` / `code_inline`
  // token and is PROSE — a deck teaching its own syntax says so constantly. A raw
  // scan cannot tell the difference, and since the last directive on a slide wins,
  // one quoted example silently overrode the slide's real class. `kit/Sample-Deck.md`
  // is the live case: slide 3 is `split-panel` and says so, then mentions
  // `` `<!-- _class: kpi -->` `` in a bullet, and the source-side answer came back
  // `kpi`.
  const directives = [];
  for (const t of tokens) {
    if (t.type !== 'html_block' || !Array.isArray(t.map)) continue;
    const dir = readDirectiveComment(t.content, CLASS_ONLY);
    if (dir) directives.push({ ...dir, index: lineOffset[t.map[0]] ?? bodyStart });
  }
  const spanAt = (index) => spans.find((s) => index >= s.start && index < s.end);
  // Pass 1 — the running global, applied from its own slide to the end of the deck.
  for (const dir of directives) {
    if (dir.spot) continue;
    const from = spans.indexOf(spanAt(dir.index));
    if (from < 0) continue;
    for (let i = from; i < spans.length; i++) spans[i].slideClass = dir.value;
  }
  // Pass 2 — spot directives, which overwrite the global on their own slide only.
  // LAST one wins within a slide, matching the engine's overlay of two on one slide.
  for (const dir of directives) {
    if (!dir.spot) continue;
    const span = spanAt(dir.index);
    if (span) span.slideClass = dir.value;
  }

  return { spans };
}

/**
 * The `_class:` payload of the slide containing `offset` — `''` when that slide
 * declares none, which is the answer that lets the band fall back to the DECK
 * default instead of inheriting a neighbor's (#1329's asymmetric fallback).
 */
function slideClassAt(spans, offset) {
  const span = spans.find((s) => offset >= s.start && offset < s.end);
  return span ? span.slideClass : '';
}

/** The 0-based index of the slide containing `offset`, or -1. */
function slideIndexAt(spans, offset) {
  return spans.findIndex((s) => offset >= s.start && offset < s.end);
}

module.exports = { slideClassSpans, slideClassAt, slideIndexAt };
