/**
 * highlight-spans — highlight.js's HTML output, read back as OFFSET RANGES.
 *
 * Pure and fs-free. One job: take the `<span class="hljs-…">`-wrapped HTML
 * highlight.js produces and answer where each token sits in the ORIGINAL source
 * string, so a surface that cannot accept HTML — a ProseMirror document, whose
 * `code_block` holds plain text and nothing else — can still paint the exact
 * tokenization the renderer produced.
 *
 * WHY THIS EXISTS RATHER THAN A SECOND HIGHLIGHTER. The Compose editor shows the
 * author a fence; the export renders the same fence. If Compose ran its own
 * tokenizer (CodeMirror's Lezer grammars, say) the two would disagree — most
 * visibly on `mermaid`, where Lattice registers its OWN hljs grammar
 * (lib/integrations/mermaid/mermaid.hljs.js) that no other tokenizer has. Reading
 * the ranges back off the renderer's own output makes the editor's colors the
 * slide's colors by construction, with no map to keep in sync.
 * (engineering/decisions/2026-09-21-compose-fenced-code.md § Axis A.)
 *
 * THE INPUT IS NOT ARBITRARY HTML and this is not an HTML parser. highlight.js's
 * HTMLRenderer emits exactly two things: `<span class="…">` openers (the class
 * value is its own, never author text) and `</span>` closers, with everything
 * else escaped through its `escapeHTML` — `& < > " '` and nothing more. So the
 * scanner below handles exactly that shape, and any input that does not match it
 * yields no spans rather than a wrong answer.
 */

/** The five entities highlight.js's `escapeHTML` produces, and only those. */
const ENTITY = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'" };
const ENTITY_RE = /&(?:amp|lt|gt|quot|#x27);/g;

/** Plain-text length of an escaped run — what it costs in the ORIGINAL string. */
function plainLength(escaped) {
  let n = escaped.length;
  for (const m of escaped.matchAll(ENTITY_RE)) n -= m[0].length - ENTITY[m[0]].length;
  return n;
}

/**
 * Walk highlight.js HTML and report each token's range in the source string.
 *
 * @param {string} html  the `.value` of an `hljs.highlight(...)` result
 * @returns {Array<{ from: number, to: number, cls: string }>}
 *   `from`/`to` are offsets into the ORIGINAL (unescaped) code; `cls` is the
 *   span's whole class attribute, so a compound one (`hljs-title function_`)
 *   arrives intact. Ranges NEST — highlight.js nests spans, and a caller painting
 *   decorations wants the inner one to layer over the outer.
 */
function spansFromHighlightHtml(html) {
  if (typeof html !== 'string' || !html) return [];
  const out = [];
  const stack = [];
  let pos = 0; // offset into the plain source
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      pos += plainLength(html.slice(i));
      break;
    }
    if (lt > i) pos += plainLength(html.slice(i, lt));
    const gt = html.indexOf('>', lt);
    if (gt === -1) break; // truncated input — report what we have rather than guessing
    const tag = html.slice(lt + 1, gt);
    if (tag === '/span') {
      const open = stack.pop();
      // A closer with no opener means the input is not the shape documented above.
      // Drop it silently: a malformed highlight costs a fence its color, never a throw.
      if (open) out.push({ from: open.from, to: pos, cls: open.cls });
    } else {
      // `class="…"` or `class='…'`; anything else is not our input shape.
      const m = /^span\s+class=(["'])([^"']*)\1$/.exec(tag);
      stack.push(m ? { from: pos, cls: m[2] } : { from: pos, cls: '' });
    }
    i = gt + 1;
  }
  // An unclosed opener (truncated input) closes at the end, for the same reason.
  while (stack.length) {
    const open = stack.pop();
    if (open.cls) out.push({ from: open.from, to: pos, cls: open.cls });
  }
  return out.filter((s) => s.cls && s.to > s.from).sort((a, b) => a.from - b.from || b.to - a.to);
}

module.exports = { spansFromHighlightHtml, plainLength };
