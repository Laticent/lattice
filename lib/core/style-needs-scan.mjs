/**
 * Style needs, the scan half — which style modules a document needs, given an index.
 *
 * `tools/style-needs.js` BUILDS the index from module CSS (it needs css-tree, so it stays in Node).
 * This file READS it: `scanDocument` collects the tokens a document carries and `neededModules`
 * answers which modules could change how it looks. Both are pure, fs-free and parser-free, so one
 * copy serves the audit (`tools/style-needs-audit.mjs`, which serializes the functions into a page
 * with `.toString()`, so each must stay self-contained) and the docs Playground's style loader
 * (`docs/src/lib/style-loader.ts`). The contract, the soundness argument and the false-negative
 * budget (zero) are in the header of `tools/style-needs.js`.
 */

/**
 * The tokens a document carries. `root` is any node whose descendants are scanned (a slide
 * container, a docs page). The element itself and its ancestors up to the document are included
 * because a selector may name a wrapper (`.lattice > section`, `body`). `s` is the document's own
 * inline style text, for the named-definition edge.
 *
 * @param {Element} root
 * @returns {{c:Set<string>, a:Set<string>, t:Set<string>, i:Set<string>, s:string}}
 */
function scanDocument(root) {
  const c = new Set();
  const a = new Set();
  const t = new Set();
  const i = new Set();
  const inline = [];
  const visit = (el) => {
    for (const k of el.classList || []) c.add(k.toLowerCase());
    for (const n of el.getAttributeNames ? el.getAttributeNames() : []) a.add(n.toLowerCase());
    if (el.localName) t.add(el.localName.toLowerCase());
    if (el.id) i.add(el.id.toLowerCase());
    const style = el.getAttribute?.('style');
    if (style) inline.push(style);
  };
  for (let n = root; n; n = n.parentElement) visit(n);
  for (const el of root.querySelectorAll('*')) visit(el);
  return { c, a, t, i, s: inline.join('\n').toLowerCase() };
}

/**
 * @param {ReturnType<typeof buildIndex>} index
 * @param {{c:Set<string>, a:Set<string>, t:Set<string>, i:Set<string>, s?:string}} tokens  from scanDocument
 * @param {{querySelector:(s:string)=>unknown}} [doc]  verify against this document (see header)
 * @param {{c?:string[], a?:string[], t?:string[], i?:string[], text?:string}} [runtime]  tokens script
 *   may add after the scan, plus any extra document text that can mention a defined name. They count as
 *   present and are never verified.
 * @returns {boolean[]} one flag per index entry: could this module change the document?
 */
function neededModules(index, tokens, doc, runtime) {
  const lower = (xs) => new Set((xs || []).map((x) => x.toLowerCase()));
  const rt = { c: lower(runtime?.c), a: lower(runtime?.a), t: lower(runtime?.t), i: lower(runtime?.i) };
  const has = (kind, x) => tokens[kind].has(x) || rt[kind].has(x);
  const met = (alt) => alt[0].every((x) => has('c', x)) && alt[1].every((x) => has('a', x)) && alt[2].every((x) => has('t', x)) && alt[3].every((x) => has('i', x));
  const isRuntime = (alt) => alt[0].some((x) => rt.c.has(x)) || alt[1].some((x) => rt.a.has(x)) || alt[2].some((x) => rt.t.has(x)) || alt[3].some((x) => rt.i.has(x));
  // With selectors indexed and a document to ask, a met alternative must also really match.
  const verified = (m, k) => {
    if (!doc || !m.sel?.[k] || isRuntime(m.alts[k])) return true;
    return m.sel[k].some((text) => {
      try {
        return doc.querySelector(text) !== null;
      } catch {
        return true; // a selector this engine cannot parse: keep the module
      }
    });
  };
  const need = index.map((m) => m.always || m.alts.some((alt, k) => met(alt) && verified(m, k)));
  // The document's own text can mention a defined name (an inline `animation: spin`).
  const docText = `${tokens.s || ''}\n${(runtime?.text || '').toLowerCase()}`;
  index.forEach((m, j) => {
    if (!need[j] && m.defines?.some((name) => docText.includes(name))) need[j] = true;
  });
  // Close over `requires`: a needed module pulls in the modules that define names it mentions.
  const queue = need.flatMap((f, i) => (f ? [i] : []));
  while (queue.length) {
    for (const j of index[queue.pop()].requires) {
      if (!need[j]) {
        need[j] = true;
        queue.push(j);
      }
    }
  }
  return need;
}

/**
 * A GUESS at the tokens the engine's HTML will carry, read from the Markdown source alone, so a host can ask for the
 * style modules before the first render instead of after it. Line-based, never one regex over the whole text (a
 * pathological source must not cost seconds). It reads what an author writes: `class:` directives, front matter, raw
 * HTML classes, and the element each Markdown construct becomes. It cannot know what the engine's transforms add, so
 * the result is a HINT: a module it misses is found by the scan of the real HTML afterward (a second render), and a
 * module it over-asks for costs bytes only. Pure and self-contained.
 *
 * @param {string} md
 * @returns {{c:Set<string>, a:Set<string>, t:Set<string>, i:Set<string>, s:string}}
 */
function scanMarkdown(md) {
  const c = new Set();
  const a = new Set();
  const t = new Set(['article', 'section', 'div', 'p', 'span', 'h1', 'h2', 'strong', 'em']);
  const i = new Set();
  const words = (text) => {
    let rest = String(text);
    for (const end of ['-->', '--!>']) {
      const k = rest.indexOf(end);
      if (k >= 0) rest = rest.slice(0, k);
    }
    for (const w of rest.split(/[\s,]+/)) {
      const k = w.replace(/^["']+|["']+$/g, '').toLowerCase();
      if (k && /^[a-z0-9_-]+$/.test(k)) c.add(k);
    }
  };
  const lines = String(md ?? '').split('\n');
  let inFence = false;
  let front = lines[0] && lines[0].trim() === '---';
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    if (line.length > 4000) continue;
    const trim = line.trim();
    if (front) {
      if (n > 0 && trim === '---') front = false;
      else if (n > 0) {
        const m = /^([A-Za-z_-]+)\s*:\s*(.*)$/.exec(trim);
        if (m) {
          const key = m[1].toLowerCase();
          const val = m[2].replace(/^["']|["']$/g, '').toLowerCase();
          if (key === 'class') words(val);
          else if (key === 'finish' && val && val !== 'none') (c.add('finish'), c.add(`finish-${val}`));
          else if ((key === 'mode' || key === 'color-mode') && val === 'dark') c.add('dark');
        }
      }
      continue;
    }
    if (trim.startsWith('```') || trim.startsWith('~~~')) {
      inFence = !inFence;
      if (inFence) {
        const lang = trim.slice(3).trim().split(/\s+/)[0].toLowerCase();
        t.add('pre');
        t.add('code');
        if (lang) c.add(`language-${lang}`);
        if (lang === 'mermaid') (c.add('mermaid'), t.add('svg'));
      }
      continue;
    }
    if (inFence) continue;
    const dir = /<!--\s*_?class\s*:\s*(.*)$/i.exec(line);
    if (dir) words(dir[1]);
    if (line.includes('<') && line.includes('class=')) {
      const m = /class\s*=\s*("([^"]*)"|'([^']*)')/gi;
      for (let r = m.exec(line); r; r = m.exec(line)) words(r[2] ?? r[3] ?? '');
    }
    if (/^#{1,6}\s/.test(trim)) t.add(`h${trim.indexOf(' ')}`);
    else if (/^([-*+]|\d+[.)])\s/.test(trim)) (t.add('ul'), t.add('ol'), t.add('li'));
    else if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(trim)) for (const x of ['table', 'thead', 'tbody', 'tr', 'th', 'td']) t.add(x);
    else if (trim.startsWith('>')) (t.add('blockquote'), t.add('p'));
    if (trim.includes('![')) (t.add('img'), t.add('figure'));
    if (trim.includes('](')) t.add('a');
    if (trim.includes('`')) t.add('code');
    if (trim.includes('$')) (c.add('katex'), t.add('math'));
  }
  return { c, a, t, i, s: String(md ?? '').toLowerCase() };
}

export { neededModules, scanDocument, scanMarkdown };
