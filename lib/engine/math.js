/**
 * lattice-engine — KaTeX math, as a markdown-it plugin.
 *
 * Mirrors marp-core's `math: 'katex'` contract at the surface decks use:
 * inline `$…$` and display `$$…$$`, rendered synchronously to HTML+CSS via
 * katex.renderToString (the same call lattice-emulator.js makes at parse time —
 * synchronous render is required under the headless-Chromium PDF path, where
 * MathJax's async reflow has raced in the past).
 *
 * Scope: the `$`/`$$` delimiters Lattice decks actually use. Marp also accepts
 * `\(...\)` / `\[...\]`; add those here if a deck needs them — AND to
 * lib/engine/math-detect.mjs's independent (deliberately unshared) delimiter
 * guards, which the docs site's lazy-KaTeX-load pre-scan
 * (docs/src/lib/render-engine.ts) depends on to know a deck needs math BEFORE
 * this file's katex.renderToString ever runs. A syntax added only here
 * degrades silently in the browser (math.js's own fallback below swallows
 * it) with no test failure — math-detect.test.js's parity fixtures are the
 * only thing that would catch the drift, and only for cases they cover. See
 * engineering/decisions/2026-07-10-landing-perf-katex-defer.md §4b for why
 * these two files don't share one implementation. Render failures degrade to
 * the raw source text rather than throwing, so a malformed formula never
 * aborts a whole deck render.
 */



let katex = null;
try {
  katex = require('katex');
} catch (_e) {
  /* katex unavailable — math degrades to plain text */
}

function renderTex(src, displayMode, output = 'htmlAndMathml') {
  if (!katex) return escapeHtml(src);
  try {
    return katex.renderToString(src, { displayMode, throwOnError: false, output });
  } catch (_e) {
    return escapeHtml(src);
  }
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// `opts.output` — KaTeX render mode. Default 'htmlAndMathml' (matches
// marp-core's historical default). The emulator's fixed-page
// PDF path passes 'html': the MathML annotation is hidden but its unclipped
// layout still inflates `scrollWidth`, tripping the slide overflow watcher into a
// stale warning ring — and a PDF has no screen-reader to consume the MathML.
function installMath(md, opts = {}) {
  const output = opts.output || 'htmlAndMathml';
  // ── Inline: $…$ (not $$, and not an escaped \$) ───────────────────────────
  // Delimiter guards mirror marp-core / markdown-it-katex so currency prose
  // ("$400M, up 28% YoY, ahead by $18M") stays literal instead of being parsed
  // as one math span: an OPENING `$` must not be followed by whitespace, and a
  // CLOSING `$` must not be preceded by whitespace nor followed by a digit. The
  // 2026-06 parity sweep caught a kpi slide mangled into "up2818M" without this.
  md.inline.ruler.after('escape', 'math_inline', (state, silent) => {
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
  });

  // ── Display: a paragraph that is exactly $$…$$ ────────────────────────────
  md.block.ruler.before('fence', 'math_block', (state, startLine, endLine, silent) => {
    const begin = state.bMarks[startLine] + state.tShift[startLine];
    const firstLine = state.src.slice(begin, state.eMarks[startLine]);
    if (!firstLine.startsWith('$$')) return false;
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
    if (!closed) return false;
    if (silent) return true;
    const token = state.push('math_block', 'div', 0);
    token.block = true;
    token.content = content.trim();
    token.markup = '$$';
    token.map = [startLine, line + 1];
    state.line = line + 1;
    return true;
  });

  md.renderer.rules.math_inline = (tokens, idx) => renderTex(tokens[idx].content, false, output);
  md.renderer.rules.math_block = (tokens, idx) => `<p>${renderTex(tokens[idx].content, true, output)}</p>\n`;
}

module.exports = { installMath, renderTex };
