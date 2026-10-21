/**
 * Style needs, the Markdown half: a guess at a deck's tokens from its source, kept apart from `style-needs-scan.mjs` so a host
 * can load it lazily (the Playground loads it only for `&predict=source`, an opt-in experiment, and the eager bundle never carries
 * it). The shape matches `scanDocument`, so `neededModules` accepts either.
 */
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

export { scanMarkdown };
