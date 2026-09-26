/**
 * flowchart-html — the flowchart grammar's second reader: the outline, from RENDERED HTML.
 *
 * The render path (the component's transform) reads markdown-it's HTML; `lint:deck`
 * reads the Markdown with `outlineFromMarkdown` in flowchart-grammar.js. Both feed the one
 * grammar there (decision note 2026-09-25-flowchart-authoring.md §10, "One grammar for
 * every reader"). This reader lives in its own module because only the render needs it:
 * the Studio's live lint loads the grammar eagerly, and carrying this there cost bytes on
 * the route budget for code lint never runs.
 */
const { decodeHtml } = require('./flowchart-grammar');

/**
 * Build the outline from a slide's RENDERED HTML — the reader the transform uses, and
 * the second adapter §2 promises. It must parse to exactly what `outlineFromMarkdown`
 * parses to for the same source, so lint and render read one grammar; the unit suite
 * holds the two equal on a shared corpus. ONE KNOWN GAP: a NAMED entity (`&rarr;`)
 * arrives here decoded, while the Markdown reader decodes only the numeric ones and
 * `&amp; &lt; &gt; &quot;`, because the full HTML5 table would ride the Studio's eager
 * lint bundle. Such a name differs between the two readers; the note records it.
 *
 * `html` starts at (or before) the first list and may run on past it; the list, the
 * key paragraph after it and the caption paragraph are read. Returns the outline plus
 * `start` / `end` offsets of the list and `keyEnd`, the offset just past the key
 * paragraph (or the list's end when there is no key), so the caller can splice.
 *
 * Mapping from HTML to the Markdown reader's terms:
 *   - an escape markdown-it consumed arrives as `<span data-esc>X</span>` (the
 *     `escapeMarks` plugin) and goes back to `\X`; every other literal backslash is
 *     doubled, so the grammar's CommonMark unescape restores it;
 *   - a line break inside an item (a lazy continuation) or a second paragraph in a
 *     loose item is the item's `detail`;
 *   - every other inline element (emphasis, links, raw HTML) contributes its text.
 * A single pass over a linear tokenizer: no regex here can backtrack.
 */
function outlineFromHtml(html) {
  const src = String(html);
  const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|[^<]+|</g;
  const toks = [];
  for (let m = TOKEN.exec(src); m; m = TOKEN.exec(src)) {
    if (m[0].startsWith('<!--')) continue;
    if (m[2]) toks.push({ tag: m[2].toLowerCase(), close: m[1] === '/', attrs: m[3] || '', at: m.index, end: m.index + m[0].length });
    else toks.push({ text: m[0], at: m.index, end: m.index + m[0].length });
  }
  const items = [];
  let key = null;
  let caption = null;
  let start = -1;
  let end = -1;
  let keyEnd = -1;
  let k = 0;
  while (k < toks.length && !(toks[k].tag === 'ul' || toks[k].tag === 'ol') ) k++;
  if (k >= toks.length || toks[k].close) return { items, key, caption, start, end, keyEnd };
  start = toks[k].at;

  // Read a run of inline tokens into { segs, rest } until a block boundary.
  const STOP = new Set(['ul', 'ol', 'li', 'blockquote']);
  const readInline = (from, until) => {
    let text = '';
    const segs = [];
    let i = from;
    const flush = () => { if (text) { segs.push({ kind: 'text', value: text }); text = ''; } };
    for (; i < toks.length; i++) {
      const t = toks[i];
      if (t.tag && STOP.has(t.tag)) break;
      if (until?.(t)) break;
      if (t.text !== undefined) { text += t.text.replace(/\\/g, '\\\\'); continue; }
      if (t.tag === 'code' && !t.close) {
        let j = i + 1;
        let v = '';
        while (j < toks.length && !(toks[j].tag === 'code' && toks[j].close)) { if (toks[j].text !== undefined) v += toks[j].text; j++; }
        flush();
        segs.push({ kind: 'code', value: decodeHtml(v).trim() });
        i = j;
        continue;
      }
      if (t.tag === 'span' && !t.close && /\sdata-esc\b/.test(t.attrs)) {
        const nx = toks[i + 1];
        if (nx && nx.text !== undefined && toks[i + 2] && toks[i + 2].tag === 'span' && toks[i + 2].close) {
          text += `\\${decodeHtml(nx.text)}`;
          i += 2;
          continue;
        }
      }
      if (t.tag === 'br' || (t.tag === 'p' && t.close)) text += '\n';
    }
    flush();
    // Decode entities in text AFTER the backslash doubling, so an entity can never
    // manufacture an escape.
    for (const sg of segs) if (sg.kind === 'text') sg.value = decodeHtml(sg.value);
    return { segs, next: i };
  };

  // Split segments at the first newline: the row, then the detail.
  const splitDetail = (segs) => {
    const row = [];
    let detail = '';
    let inDetail = false;
    for (const sg of segs) {
      if (inDetail) { detail += sg.kind === 'code' ? `\`${sg.value}\`` : sg.value; continue; }
      if (sg.kind === 'text' && sg.value.includes('\n')) {
        const at = sg.value.indexOf('\n');
        const head = sg.value.slice(0, at);
        if (head) row.push({ kind: 'text', value: head });
        detail += sg.value.slice(at + 1);
        inDetail = true;
        continue;
      }
      row.push(sg);
    }
    detail = detail.replace(/\s+/g, ' ').trim();
    return { row, detail };
  };

  // Walk the list tree.
  const readList = (at, into) => {
    // toks[at] is an open ul/ol; returns the index just past its close.
    let i = at + 1;
    const tag = toks[at].tag;
    while (i < toks.length) {
      const t = toks[i];
      if (t.tag === tag && t.close) return i + 1;
      if (t.tag === 'li' && !t.close) {
        const item = { segs: [], children: [], quotes: [] };
        into.push(item);
        let j = i + 1;
        while (j < toks.length && toks[j].text !== undefined && !toks[j].text.trim()) j++;
        // A loose item wraps its row in a paragraph; the row is that paragraph.
        const loose = toks[j] && toks[j].tag === 'p' && !toks[j].close;
        const r = loose ? readInline(j + 1, (x) => x.tag === 'p' && x.close) : readInline(j);
        const { row, detail } = splitDetail(r.segs);
        item.segs = row;
        if (detail) item.detail = detail;
        j = loose ? r.next + 1 : r.next;
        while (j < toks.length && !(toks[j].tag === 'li' && toks[j].close)) {
          const u = toks[j];
          if ((u.tag === 'ul' || u.tag === 'ol') && !u.close) { j = readList(j, item.children); continue; }
          if (u.tag === 'blockquote' && !u.close) {
            let q = j + 1;
            let depth = 1;
            let qt = '';
            for (; q < toks.length; q++) {
              const w = toks[q];
              if (w.tag === 'blockquote') depth += w.close ? -1 : 1;
              if (!depth) break;
              if (w.text !== undefined) qt += w.text;
              else if (w.tag === 'p' || w.tag === 'br') qt += ' ';
            }
            item.quotes.push(decodeHtml(qt).replace(/\s+/g, ' ').trim());
            j = q + 1;
            continue;
          }
          if (u.tag === 'p' && !u.close) {
            // A later paragraph in a loose item: more detail.
            const more = readInline(j + 1, (x) => x.tag === 'p' && x.close);
            const txt = more.segs.map((sg) => (sg.kind === 'code' ? `\`${sg.value}\`` : sg.value)).join('').replace(/\s+/g, ' ').trim();
            if (txt) item.detail = item.detail ? `${item.detail} ${txt}` : txt;
            j = more.next + 1;
            continue;
          }
          j++;
        }
        i = j + 1;
        continue;
      }
      i++;
    }
    return i;
  };
  const after = readList(k, items);
  end = after < toks.length ? toks[after].at : src.length;
  keyEnd = end;

  // After the list: the key (a paragraph that is one bracketed code span), then a caption
  // (a paragraph that is one emphasis). Only paragraphs are looked at, in order.
  let i = after;
  for (let n = 0; n < 2 && i < toks.length; n++) {
    while (i < toks.length && toks[i].text !== undefined && !toks[i].text.trim()) i++;
    const t = toks[i];
    if (!t || t.tag !== 'p' || t.close) break;
    let j = i + 1;
    while (j < toks.length && !(toks[j].tag === 'p' && toks[j].close)) j++;
    const inner = toks.slice(i + 1, j);
    const bare = inner.filter((x) => !(x.text !== undefined && !x.text.trim()));
    if (key === null && bare.length === 3 && bare[0].tag === 'code' && !bare[0].close && bare[1].text !== undefined && bare[2].tag === 'code' && bare[2].close) {
      const v = decodeHtml(bare[1].text).trim();
      if (/^\[[\s\S]*\]$/.test(v)) { key = v; keyEnd = j < toks.length ? toks[j].end : src.length; i = j + 1; continue; }
    }
    if (caption === null && bare.length >= 3 && (bare[0].tag === 'em') && !bare[0].close && bare[bare.length - 1].tag === 'em' && bare[bare.length - 1].close) {
      caption = decodeHtml(inner.map((x) => x.text || '').join('')).trim();
    }
    break;
  }
  return { items, key, caption, start, end, keyEnd };
}

module.exports = { outlineFromHtml };
