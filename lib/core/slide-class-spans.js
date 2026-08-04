/**
 * lib/core/slide-class-spans.js
 *
 * WHICH SLIDE does a byte of deck source belong to, and what `_class:` did that
 * slide declare? Derived from the ENGINE'S OWN slide boundaries, not a regex over
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
 * MAPPING, so a diagram's band lands on the wrong slide. Same reasoning, and the
 * same parser configuration, as lib/core/section-source-split.js.
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

const MarkdownIt = require('markdown-it');
const { headingSplitPoints } = require('./heading-split-core');
const { resolveSplitMode } = require('./resolve-split');

// commonmark + html:true mirrors the lib/engine parser AND bake-splits.js, so the
// tokens here are the boundaries the renderer actually splits on.
const md = new MarkdownIt('commonmark', { html: true });

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
// Marp's per-slide class directive. Same shape the emulator's old inline scan used,
// so nothing about WHICH directives count has changed — only which slide each one
// is attributed to.
const CLASS_DIRECTIVE = /<!--\s*_class:\s*([^>]*?)\s*-->/g;

/**
 * Per-slide spans over the FULL source (front matter included), each carrying that
 * slide's own `_class:` payload.
 *
 * @param {string} source  the full deck source, exactly as the caller holds it.
 * @returns {{spans: Array<{start: number, end: number, slideClass: string}>}}
 *   `start`/`end` are full-source byte offsets, `end` exclusive. Contiguous and
 *   gapless from the end of the front matter to the end of the source, so every
 *   offset in the body lands in exactly one span.
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
  const startLines = [0];
  for (const b of ordered) startLines.push(b.consumed ? b.line + 1 : b.line);
  const uniqueStarts = [...new Set(startLines)].sort((a, b) => a - b).filter((n) => n <= lines.length);
  const offsetOf = (line) => (line < lines.length ? lineOffset[line] : src.length);
  const spans = uniqueStarts.map((line, i) => {
    const start = offsetOf(line);
    const end = i + 1 < uniqueStarts.length ? offsetOf(uniqueStarts[i + 1]) : src.length;
    return { start, end: Math.max(start, end), slideClass: '' };
  });

  // Attribute each `_class:` directive to the span it sits in. LAST one wins within
  // a slide, matching what the engine's directive handling does with two on one slide.
  CLASS_DIRECTIVE.lastIndex = 0;
  for (let m = CLASS_DIRECTIVE.exec(src); m; m = CLASS_DIRECTIVE.exec(src)) {
    if (m.index < bodyStart) continue; // inside front matter — not a slide directive
    const span = spans.find((s) => m.index >= s.start && m.index < s.end);
    if (span) span.slideClass = m[1];
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
