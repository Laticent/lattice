/**
 * lib/plugins/math/math.syntax.mjs — the math plugin's GRAMMAR.
 *
 * Both markdown-it rules (`$…$` inline, `$$…$$` display) and `detect(source)`, the pre-scan
 * that tells a browser surface whether a deck needs KaTeX before any render runs. Pure and
 * dependency-free on purpose: KaTeX lives in `math.render.js`, and three consumers want the
 * grammar WITHOUT it —
 *
 *   1. the BOUNDARY parser (lib/core/boundary-parser.mjs) needs the display rule so a `$$` body
 *      is opaque. LaTeX is full of lines that look like Markdown structure; the real case, in
 *      `lib/components/math/math/math.gallery.md`:
 *
 *        $$
 *        \begin{pmatrix} 2 & 1 \\ 4 & 3 \end{pmatrix}
 *        =
 *        \begin{pmatrix} 1 & 0 \\ 2 & 1 \end{pmatrix}
 *        $$
 *
 *      The lone `=` is a SETEXT H1 underline to a parser that cannot see the math block. In a
 *      `split: headings` deck that heading is a slide boundary, so the source-side splitter cut
 *      one rendered slide into two and every byte after it was attributed to a slide that does
 *      not exist.
 *   2. the docs site's lazy-KaTeX pre-scan (docs/src/lib/render-engine.ts), which must not pull
 *      KaTeX's ~76 KB gzip into its bundle just to ask the question;
 *   3. the engine, through the plugin host (lib/plugins/host.js), which installs these rules
 *      and attaches `math.render.js`'s renderers to the tokens they emit.
 *
 * The host installs the rules, never this file: `math.manifest.json` declares each rule's
 * token type, trigger character and host anchor, and the build checks this module exports a
 * rule under each of those names (tools/build-plugin-registry.js). ESM because the boundary parser is bundled by
 * the docs site's Rollup, which does no named-export interop on a CommonJS file under lib/.
 *
 * `detect` is deliberately NOT derived from the rules: it scans the raw source in one pass,
 * without markdown-it, and errs toward matching (a false positive costs one needless load; a
 * false negative ships unrendered math). The plugin harness holds it to the rules — every
 * fixture the parser turns into math, `detect` must also flag — see
 * engineering/decisions/2026-07-10-landing-perf-katex-defer.md §4b for why they are two code
 * paths at all.
 */

/**
 * markdown-it block rule: a run of lines opening with `$$` and closing on a line
 * ending `$$`. Registered as `math_block`; emits a `math_block` token whose
 * `content` is the TeX source with the delimiters stripped.
 */
export function mathBlockRule(state, startLine, endLine, silent) {
  const begin = state.bMarks[startLine] + state.tShift[startLine];
  const firstLine = state.src.slice(begin, state.eMarks[startLine]);
  if (!firstLine.startsWith('$$')) return false;
  // NO CLOSER AHEAD? THEN THERE IS NONE FOR ANY LATER OPENER EITHER.
  //
  // Without this the rule is O(n²) on a document of unclosed `$$` openers: every one of
  // them scans forward to end of input, finds nothing, and declines — and the next one
  // rescans the same tail. Measured on `'$$a\n\n'.repeat(n)`: markdown-it without this rule
  // parses 100KB in 13ms; with it, 12,277ms, and `engine.render` on the same input took
  // 11,600ms. That is a multi-second freeze from deck text, and in the Studio the deck can
  // come from an untrusted shared link (HARD RULE #22's threat model).
  //
  // The short-circuit is sound because the scan below only ever looks FORWARD: if no line
  // after `startLine` ends with `$$`, no line after any later start does either. The record
  // lives on the per-parse `state`, so it cannot leak between documents.
  if (state.__mathNoCloserFrom !== undefined && startLine >= state.__mathNoCloserFrom) return false;
  let line = startLine;
  let content = firstLine.slice(2);
  let closed = content.trim().endsWith('$$');
  if (closed) content = content.trim().slice(0, -2);
  while (!closed && line < endLine) {
    line += 1;
    const text = state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
    if (text.trim().endsWith('$$')) {
      content += `\n${text.trim().slice(0, -2)}`;
      closed = true;
    } else {
      content += `\n${text}`;
    }
  }
  if (!closed) {
    // Remember the failure so the next opener does not rescan this same tail.
    state.__mathNoCloserFrom = startLine;
    return false;
  }
  if (silent) return true;
  const token = state.push('math_block', 'div', 0);
  token.block = true;
  token.content = content.trim();
  token.markup = '$$';
  token.map = [startLine, line + 1];
  state.line = line + 1;
  return true;
}

/**
 * markdown-it inline rule: `$…$`, not `$$` and not an escaped `\$`. Registered as
 * `math_inline`; emits a `math_inline` token whose `content` is the TeX source.
 *
 * The delimiter guards mirror marp-core / markdown-it-katex so currency prose ("$400M, up 28%
 * YoY, ahead by $18M") stays literal instead of parsing as one math span: an OPENING `$` must
 * not be followed by whitespace, and a CLOSING `$` must not be preceded by whitespace nor
 * followed by a digit. The 2026-06 parity sweep caught a kpi slide mangled into "up2818M"
 * without them.
 */
export function mathInlineRule(state, silent) {
  const src = state.src;
  if (src[state.pos] !== '$') return false;
  const openNext = src.charCodeAt(state.pos + 1);
  if (openNext === 0x24) return false; // `$$` → let block/display handle
  // can_open: not followed by whitespace / end-of-input.
  if (Number.isNaN(openNext) || openNext === 0x20 || openNext === 0x09) return false;
  const start = state.pos + 1;
  let end = start;
  // Find a `$` that can validly CLOSE: unescaped, not preceded by whitespace,
  // not followed by a digit. Skip `$`s that fail the guard and keep scanning.
  while (end < state.posMax) {
    if (src[end] === '$' && src[end - 1] !== '\\') {
      const prev = src.charCodeAt(end - 1);
      const after = end + 1 < state.posMax ? src.charCodeAt(end + 1) : -1;
      const prevWs = prev === 0x20 || prev === 0x09;
      const afterDigit = after >= 0x30 && after <= 0x39;
      if (!prevWs && !afterDigit) break;
    }
    end += 1;
  }
  if (end >= state.posMax || end === start) return false;
  if (src[end] !== '$') return false; // ran off the end without a valid close
  if (!silent) {
    const token = state.push('math_inline', 'span', 0);
    token.content = state.src.slice(start, end);
    token.markup = '$';
  }
  state.pos = end + 1;
  return true;
}

/**
 * Display: does `src` contain a line starting with `$$`, once you strip the
 * kind of leading container markup markdown-it strips before matching (list-
 * item indentation, blockquote `>` markers)? The real block rule
 * (`state.bMarks[startLine] + state.tShift[startLine]`) checks against the
 * line's content AFTER markdown-it removes that container prefix — so `$$`
 * indented inside a list item or blockquote is real, renderable display math
 * that a literal `^\$\$` anchor would miss (a false negative, found by
 * adversarial review: it rendered correctly via the CLI/PDF path, since
 * Node/CLI's KaTeX is always eager, but silently degraded to escaped text in
 * the browser docs site, since nothing triggered the lazy KaTeX load). This
 * doesn't need to replicate markdown-it's full container-parsing — permitting
 * leading spaces/tabs/`>` is enough to catch list/blockquote nesting without
 * losing the "errs toward matching" property.
 */
export function hasDisplayMath(src) {
  return /^[ \t>]*\$\$/m.test(src);
}

/**
 * Inline: is there a valid `$…$` span anywhere in `src`? An opening `$` must
 * not be followed by whitespace/end-of-string; a closing `$` must not be
 * preceded by whitespace nor followed by a digit — the same guards that keep
 * currency prose ("$400M, up 28% YoY, ahead by $18M") from parsing as math.
 */
export function hasInlineMath(src) {
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '$') continue;
    if (src[i + 1] === '$') {
      // `$$` → the FIRST `$` isn't an inline opener (hasDisplayMath handles
      // block math), but markdown-it's real inline rule, on failing to open
      // here, falls through to plain text and retries at the NEXT position —
      // so the SECOND `$` can still open a valid inline span (`$$b$` renders
      // `$b$` as math; a false negative found by adversarial review). Only
      // skip THIS position; let the loop's own `i++` reach the second `$`.
      continue;
    }
    const openNext = src.charCodeAt(i + 1);
    if (Number.isNaN(openNext) || openNext === 0x20 || openNext === 0x09) continue;
    let end = i + 1;
    while (end < src.length) {
      if (src[end] === '$' && src[end - 1] !== '\\') {
        const prev = src.charCodeAt(end - 1);
        const after = end + 1 < src.length ? src.charCodeAt(end + 1) : -1;
        const prevWs = prev === 0x20 || prev === 0x09;
        const afterDigit = after >= 0x30 && after <= 0x39;
        if (!prevWs && !afterDigit) return true;
      }
      end += 1;
    }
  }
  return false;
}

/**
 * A ```math (or ~~~math) fence — the display form the plugin's fence table renders. A fence opens
 * a line after at most three spaces of indent, and its name is the info string's first word.
 */
const MATH_FENCE = /^ {0,3}(?:`{3,}|~{3,})[ \t]*math(?:[ \t]|$)/m;

export function hasFenceMath(src) {
  return MATH_FENCE.test(src);
}

export function sourceHasMath(src) {
  return Boolean(src) && (hasDisplayMath(src) || hasInlineMath(src) || hasFenceMath(src));
}

/** The plugin's `detect`: does `src` use this plugin's syntax at all? */
export const detect = sourceHasMath;

/**
 * The rules, each exported under the TOKEN TYPE it emits — the keys `math.manifest.json`
 * declares. Named exports rather than one `rules` object so a bundler can keep only what a
 * consumer imports: the boundary parser (and the lint bundle that carries its own copy) ships in
 * the Studio's startup JavaScript and needs the block rule alone.
 */
export { mathBlockRule as math_block, mathInlineRule as math_inline };
