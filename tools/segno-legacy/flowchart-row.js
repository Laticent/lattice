/**
 * flowchart-row.js — the flowchart row reader (`readArrow` + `splitRow`) as it was before Segno
 * phase 3 replaced it with a generated grammar (lib/core/flowchart-row-grammar.js).
 *
 * Frozen verbatim from lib/core/flowchart-grammar.js at a4fb527 (the constants and `isSpace` it
 * reads are copied beside it). Read by tools/parser-bakeoff/ (the flow arm's incumbent, and the
 * script that froze test/unit/tools/fixtures/flow-rows.frozen.json). Do not fix bugs here.
 */
const LABEL_MAX = 60;
// An escaped `\&` survives the fan-out split as this placeholder, then turns back into `&`.
const ESC_AMP = '\u0001';
// CommonMark's escapable set: a backslash before any of these is an escape.
const ASCII_PUNCT = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~');

const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
/**
 * Read one arrow starting at `s[p]`, or null. The caller guarantees `p` is at the start
 * of a word (start of the string or after whitespace); an arrow must also END at a word
 * boundary. Forms: [<] shaft [label shaft] [> | shaft], shaft `-` (normal) or `=` (heavy).
 * Mermaid's doubled shaft (`-->`, `==>`, `<--`, `<-->`, `---`) reads as the house form.
 *
 * Returns { end, heavy, label, dir, mermaid } with dir 'out' | 'in' | 'both' | 'none'.
 */
function readArrow(s, p) {
  let i = p;
  const left = s[i] === '<';
  if (left) i++;
  const c = s[i];
  if (c !== '-' && c !== '=') return null;
  i++;
  const boundary = (k) => k >= s.length || isSpace(s[k]);
  let mermaid = false;
  // Mermaid doubled / tripled shaft: `-->`, `---`, `<-->`, `==>`.
  if (s[i] === c) {
    let k = i;
    while (s[k] === c && k - i < 2) k++;
    if (s[k] === '>' && boundary(k + 1)) return { end: k + 1, heavy: c === '=', label: '', dir: left ? 'both' : 'out', mermaid: true };
    if (boundary(k)) {
      // `--` / `==` is the house none-arrow; `---` is Mermaid's.
      mermaid = k - i >= 2;
      if (left) return { end: k, heavy: c === '=', label: '', dir: 'in', mermaid: true };
      return { end: k, heavy: c === '=', label: '', dir: 'none', mermaid };
    }
    return null;
  }
  // Unlabeled: `->` `=>` `<-` `<=` `<->` `<=>`.
  if (s[i] === '>') return boundary(i + 1) ? { end: i + 1, heavy: c === '=', label: '', dir: left ? 'both' : 'out', mermaid: false } : null;
  if (boundary(i)) return left ? { end: i, heavy: c === '=', label: '', dir: 'in', mermaid: false } : null;
  // Labeled: the label runs to the next closing shaft that ends the word (`-label->`,
  // `-label-`). It may hold spaces; it may not hold `<`, `>` or a newline, and it is capped.
  if (isSpace(s[i])) return null;
  for (let j = i + 1; j < s.length && j - i <= LABEL_MAX + 1; j++) {
    const ch = s[j];
    if (ch === '<' || ch === '>' || ch === '\n') return null;
    if (ch !== c) continue;
    if (isSpace(s[j - 1])) continue; // the label ends on a non-space
    const label = s.slice(i, j);
    if (s[j + 1] === '>' && boundary(j + 2)) return { end: j + 2, heavy: c === '=', label, dir: left ? 'both' : 'out', mermaid: false };
    if (boundary(j + 1)) return { end: j + 1, heavy: c === '=', label, dir: left ? 'in' : 'none', mermaid: false };
  }
  return null;
}

/**
 * Split one row's segments into PARTS separated by arrows. Text is scanned for arrows at
 * word starts; a backslash in front of an arrow keeps it as text (the backslash is
 * dropped). Code spans stay attached to the part they sit in.
 *
 * Returns { parts: [{ text, spans: [string] }], arrows: [arrow] } with
 * parts.length === arrows.length + 1.
 */
function splitRow(segs) {
  const parts = [{ text: '', spans: [] }];
  const arrows = [];
  let atWordStart = true;
  // Text after a span means the span sat INSIDE the name (`Run \`npm test\` -> Deploy`):
  // it is part of the name, not a modifier (§2.4: the span that styles is the trailing one).
  const pushText = (ch) => {
    const part = parts[parts.length - 1];
    if (part.spans.length && !isSpace(ch)) { part.text += `${part.spans.join(' ')} `; part.spans = []; }
    part.text += ch;
  };
  for (const seg of segs) {
    if (seg.kind === 'code') {
      parts[parts.length - 1].spans.push(seg.value);
      atWordStart = true;
      continue;
    }
    // An ESCAPED span (`\{LIVE}`) is name text exactly as written: no arrow, fan-out or escape
    // inside it is read, so `\{go -> stop}` cannot split the row. Both readers emit it.
    if (seg.kind === 'literal') {
      for (const ch of String(seg.value)) pushText(ch === '&' ? ESC_AMP : ch);
      atWordStart = false;
      continue;
    }
    const s = String(seg.value);
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '\\' && ASCII_PUNCT.has(s[i + 1])) {
        // A grammar escape (`\->`, `\&`) keeps the character out of an arrow or a
        // fan-out; any other escaped punctuation just loses its backslash, as
        // CommonMark does, so this reader and the rendered HTML agree on every name.
        pushText(s[i + 1] === '&' ? ESC_AMP : s[i + 1]);
        i += 2;
        atWordStart = false;
        continue;
      }
      if (atWordStart && (ch === '-' || ch === '=' || ch === '<')) {
        const a = readArrow(s, i);
        if (a) {
          arrows.push(a);
          parts.push({ text: '', spans: [] });
          i = a.end;
          atWordStart = true;
          continue;
        }
      }
      pushText(ch);
      atWordStart = isSpace(ch);
      i++;
    }
  }
  return { parts, arrows };
}

module.exports = { readArrow, splitRow, ESC_AMP };
