/**
 * The longest label a Mermaid fence may hand Mermaid's label renderer, and the check both render
 * paths run before they draw (HARD RULE #1: the CLI bake and the browser pass share this one copy).
 *
 * WHY. Mermaid renders labels through `marked` (16.4.2 under mermaid 11.14), and marked's lexer is
 * super-linear on some short repeated shapes: `[a](` repeated 2,000 times (8 KB) took 22.5 s, a
 * 44 KB label 88.7 s, and `*a ` repeated 8,000 times took 8 s on marked 18 too. Deck text reaches
 * it: a markdown string (``A["`…`"]``) goes to `marked.lexer` in every diagram type, and mindmap,
 * kanban and architecture send even plain labels there. In the live preview nothing stops a render
 * once it starts (the settle cap only stops WAITING), so one pasted fence could freeze the Studio.
 * The measurements are in engineering/mermaid.md § A label longer than 500 characters is refused.
 *
 * WHAT IS A LABEL. Measured across lines, because Mermaid's lexers let a label cross them:
 *   - every `"…"` span, in every diagram type (a markdown string is one of these);
 *   - in the diagram types whose plain labels are markdown (MARKDOWN_TYPES): every bracket label,
 *     from an opener `[` `(` `{` to the next `)` `]` `}` `(` or quote (mindmap's and kanban's
 *     unquoted-text rule, `[^)\](}]+`), and every line (a bare node is one line).
 * A line in any other diagram type is not a label (an xychart's data row, an init directive), so
 * it is never measured.
 *
 * THE CAP. 500 characters. The longest label in any Mermaid fence the repository ships is 83
 * characters (a quoted span; bracket labels top out at 42). At the cap the worst known shape costs
 * marked a few milliseconds, so Mermaid's own `maxTextSize` (50,000 per fence) bounds a fence at
 * under a second of label rendering. A refused fence degrades the way an unparseable one does: the
 * source shows as code (CLI) or the diagram error box (browser), with a message naming the cap.
 *
 * Linear: one pass over the source, no regular expression.
 */
const MAX_LABEL_TEXT = 500;

/** The diagram types whose PLAIN labels go to marked (mermaid's `createText` defaults to markdown). */
const MARKDOWN_TYPES = new Set(['mindmap', 'kanban', 'architecture', 'architecture-beta']);

/** The diagram's type keyword: the first line that is not blank, a `%%` comment or front matter. */
function diagramType(s) {
  let inFront = false;
  for (const raw of s.split('\n')) {
    const line = raw.trim();
    if (line === '---') { inFront = !inFront; continue; }
    if (inFront || !line || line.startsWith('%%')) continue;
    let end = 0;
    while (end < line.length && !' \t:;{('.includes(line[end])) end++;
    return line.slice(0, end).toLowerCase();
  }
  return '';
}

/**
 * The first label in `definition` longer than `max`, or null.
 * @returns {{ kind: 'quoted label' | 'bracket label' | 'line', length: number, max: number } | null}
 */
function overlongLabelText(definition, max = MAX_LABEL_TEXT) {
  const s = String(definition ?? '');
  const hit = (kind, length) => ({ kind, length, max });
  // Quoted spans, across lines. An unclosed quote runs to the end, as Mermaid's lexer reads it.
  for (let from = s.indexOf('"'); from !== -1;) {
    const end = s.indexOf('"', from + 1);
    const stop = end === -1 ? s.length : end;
    if (stop - from - 1 > max) return hit('quoted label', stop - from - 1);
    if (end === -1) break;
    from = s.indexOf('"', end + 1);
  }
  if (!MARKDOWN_TYPES.has(diagramType(s))) return null;
  let lineStart = 0;
  let open = -1; // index after the last bracket opener, while its label runs
  for (let i = 0; i <= s.length; i++) {
    const c = i < s.length ? s[i] : '\n';
    if (c === '\n' && i - lineStart > max) return hit('line', i - lineStart);
    if (c === '\n') lineStart = i + 1;
    if (open !== -1 && (c === ')' || c === ']' || c === '}' || c === '(' || c === '"' || i === s.length)) {
      if (i - open > max) return hit('bracket label', i - open);
      open = -1;
    }
    if ((c === '[' || c === '(' || c === '{') && open === -1) open = i + 1;
  }
  return null;
}

/** The warning both paths print for a refused fence. */
function overlongMessage(h) {
  return `a ${h.kind} in this diagram is ${h.length} characters; Mermaid labels are capped at ${h.max}, because longer ones can stall its markdown renderer. Shorten or split the label.`;
}

module.exports = { MAX_LABEL_TEXT, overlongLabelText, overlongMessage };
