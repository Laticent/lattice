/**
 * A code package's STABLE INPUT: the slide's plain facts, read off the section the door hands it
 * (engineering/decisions/2026-09-24-code-package-contract.md §11).
 *
 * A code package gets `slide.html`, the engine's rendered `<section>`, and `slide.facts`, what this
 * module reads out of it. The two serve the two kinds of package:
 *   - one that TWEAKS our slide (a stamp, a restyled table) wants the finished HTML, and takes the
 *     risk that our markup changes: `html` is the tweak surface, and it is not a promise;
 *   - one that DRAWS something new from the author's content (a Gantt chart from dates, a map from
 *     place names) wants plain facts, so it never parses our `<ul><li>`: `facts` is the promise.
 * The promise holds because the DOOR owns the mapping: when our markup changes, this module
 * changes with it and a package reading `facts` sees the same facts. The first test in
 * test/unit/cli/slide-facts.test.js renders one slide of every kind through the real engine and pins
 * the whole result, so an engine change that moves the facts fails there. `FACTS_VERSION` moves only
 * when a field changes meaning or goes away; a new field is added without a bump.
 *
 * WHAT IT CARRIES (strings, numbers, booleans, arrays and plain objects only, so it crosses to the
 * worker by structured clone, and the worker freezes it all the way down):
 *   version     FACTS_VERSION
 *   classes     the slide's `class` directive, split: its `<!-- _class: -->`, or the deck's `class:`
 *               where the slide sets none. Never the classes the engine adds (`content`, `form`),
 *               nor a deck class the engine merges in beside a slide's own: those are markup
 *   directives  every per-slide directive the engine applied, by its camelCase name
 *               (`paginate`, `backgroundColor`, `class`…), the value a string as the author wrote it
 *   title       the text of the slide's first h1 or h2, or ''
 *   blocks      the content in reading order, each one of:
 *                 { type: 'heading', level, text, runs }
 *                 { type: 'paragraph', text, runs }
 *                 { type: 'list', ordered, start, items: [{ text, runs, paragraphs, items }] }
 *                 { type: 'table', caption, head: [text], rows: [[text]] }       (caption '' when none)
 *                 { type: 'code', lang, text }                                   (text exactly as authored)
 *                 { type: 'quote', blocks }
 *                 { type: 'image', src, alt }
 *               A wrapper the engine adds (`div.cell-coda`) is looked through, so where the engine
 *               moves a block does not change the facts, only its order where it moved it. A list
 *               item's `paragraphs` holds each paragraph of a loose item (one, for a tight item);
 *               nested lists nest in `items`.
 *   text        every block's text, one block per line
 *   tokens      the palette token NAMES every theme defines (`--accent`, `--cat-1-mark`…): the
 *               door passes lib/theme/derive.js `requiredTokenList()`. Names only, never values:
 *               a package paints with `var(--token)` (HARD RULE #3)
 *
 * RUNS keep what plain text loses: `runs` is the node's text cut where its marks change, each
 * `{ text, code?, pill?, strong?, em?, del?, mark?, math?, href? }` (a mark is `true` when present;
 * `href` is the link's address). So `` `12` `` is a value (`code`), `{DONE}` a state (`pill`: the
 * braces are the engine's pill grammar), `**Owner:**` a label (`strong`), a link keeps its address.
 * `runs.map((r) => r.text).join('')` is always exactly `text`. Table cells are text only, for now.
 *
 * WHAT TEXT IS: inline markup gone (`**bold**` reads `bold`, a link its words, inline code its
 * code), entities decoded, runs of white space one space. Math reads as its TeX source. A comment (a
 * speaker note) gives nothing, and neither do `<script>`, `<style>`, `<template>`, `<svg>`,
 * `<noscript>`, `<iframe>`, `<object>`, `<textarea>`, `<select>`, `<button>` and `<aside>`, nor the
 * running `<header>` and `<footer>` the engine writes into every section (their text is in
 * `directives`). Text the author hid with CSS (`hidden`, `display: none`) is still text here.
 *
 * Pure string work, no DOM and no Node built-ins, like the rest of the door's kernel: the CLI reads
 * facts in Node (where the engine renders and there is no DOM) and the Studio in the browser, from
 * one source (HARD RULE #1). The parser is a tolerant tag scanner, not a full HTML parser: it reads
 * what the engine writes, and author HTML that closes what it opens. A tag closed out of order pops
 * back to its opener; a close with no opener is ignored. It runs on the HOST on author HTML, so it is
 * linear and bounded: nesting past MAX_DEPTH flattens, and no scan re-reads what it has read (the
 * red team's inputs, 100+ KB each, are pinned under a second in the test). Its text is pinned against
 * jsdom's on every slide of three galleries (gallery.md, data-viz-gallery.md, gallery-jargon.md).
 */

/** Moves only when a field changes meaning or goes away. */
export const FACTS_VERSION = 1;

// The engine's per-slide directives (lib/engine/directives.js APPLIED_DIRECTIVES), each written on
// the section as `data-<kebab>`. The unit test pins this list to that set.
export const FACT_DIRECTIVES = Object.freeze([
  'theme', 'paginate', 'header', 'footer', 'class', 'color',
  'backgroundColor', 'backgroundImage', 'backgroundPosition', 'backgroundRepeat', 'backgroundSize', 'lang',
  'focus', 'focusStyle', 'build', 'debug', 'track',
]);
const DIRECTIVE_BY_ATTR = new Map(FACT_DIRECTIVES.map((k) => [`data-${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`, k]));

/** The deepest element nesting the reader keeps (see parseTree). */
export const MAX_DEPTH = 128;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'param']);
const RAW = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript']);
/** Elements whose content is not the slide's words. */
const SKIP = new Set(['script', 'style', 'template', 'svg', 'noscript', 'iframe', 'object', 'textarea', 'select', 'button', 'aside']);
const HEADING = /^h([1-6])$/;
/** Block-level elements that end a run of inline text. */
const BLOCKISH = new Set(['address', 'article', 'blockquote', 'details', 'dialog', 'dd', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul', 'summary', 'br']);

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™', times: '×', middot: '·', bull: '•', deg: '°', euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§', para: '¶', laquo: '«', raquo: '»', shy: '­', thinsp: ' ', ensp: ' ', emsp: ' ', zwj: '‍', zwnj: '‌' };

/** Decode character references: numeric, and the named ones above. An unknown name stays as written. */
export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (all, ref) => {
    if (ref[0] === '#') {
      const n = ref[1] === 'x' || ref[1] === 'X' ? Number.parseInt(ref.slice(2), 16) : Number.parseInt(ref.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '�';
    }
    return Object.hasOwn(NAMED, ref) ? NAMED[ref] : all;
  });
}

const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** An open tag's name, attributes and whether it closed itself, from the text between `<` and `>`. */
function readTag(body) {
  const m = /^([A-Za-z][^\s/>]*)/.exec(body);
  if (!m) return null;
  // No prototype: an attribute named `__proto__` or `constructor` is only an attribute.
  const attrs = Object.create(null);
  const rest = body.slice(m[0].length);
  for (const a of rest.matchAll(ATTR)) {
    const name = a[1].toLowerCase();
    if (!Object.hasOwn(attrs, name)) attrs[name] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '');
  }
  return { name: m[1].toLowerCase(), attrs, selfClosed: /\/\s*$/.test(rest) };
}

/** Where a tag's `>` is, skipping quoted attribute values (`title="a > b"`). */
function tagEnd(html, from) {
  let q = '';
  for (let i = from; i < html.length; i++) {
    const ch = html[i];
    if (q) {
      if (ch === q) q = '';
    } else if (ch === '"' || ch === "'") q = ch;
    else if (ch === '>') return i;
  }
  return -1;
}

/**
 * The HTML as a tree of `{ name, attrs, children }` and text strings (decoded). Tolerant: see the
 * module note.
 */
export function parseTree(html) {
  const root = { name: '#root', attrs: Object.create(null), children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const s = String(html);
  let i = 0;
  // Adjacent text joins the text before it: one node per stray `<` made 120,000 nodes of a 120 KB slide.
  const text = (t) => {
    if (!t) return;
    const kids = top().children;
    const d = decodeEntities(t);
    if (typeof kids[kids.length - 1] === 'string') kids[kids.length - 1] += d;
    else kids.push(d);
  };
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) {
      text(s.slice(i));
      break;
    }
    text(s.slice(i, lt));
    if (s.startsWith('<!--', lt)) {
      const end = s.indexOf('-->', lt + 4);
      i = end < 0 ? s.length : end + 3;
      continue;
    }
    if (s[lt + 1] === '!' || s[lt + 1] === '?') {
      const end = s.indexOf('>', lt);
      i = end < 0 ? s.length : end + 1;
      continue;
    }
    if (s[lt + 1] === '/') {
      const end = s.indexOf('>', lt);
      if (end < 0) {
        text(s.slice(lt));
        break;
      }
      const name = s.slice(lt + 2, end).trim().split(/\s/)[0].toLowerCase();
      const at = stack.findLastIndex((n) => n.name === name);
      if (at > 0) stack.length = at;
      i = end + 1;
      continue;
    }
    // A `<` that opens no tag (`a < b`, `<"`) is text, decided from the next character alone:
    // scanning ahead for its `>` first, as the first cut did, re-scanned the same stretch from every
    // such `<` (40,000 of them: 6.5 s on the host; the red team).
    if (!/[A-Za-z]/.test(s[lt + 1] ?? '')) {
      text('<');
      i = lt + 1;
      continue;
    }
    const end = tagEnd(s, lt + 1);
    if (end < 0) {
      text(s.slice(lt));
      break;
    }
    const tag = readTag(s.slice(lt + 1, end));
    const node = { name: tag.name, attrs: tag.attrs, children: [] };
    top().children.push(node);
    i = end + 1;
    if (RAW.has(tag.name)) {
      // Found on the ORIGINAL string, case-insensitively, from here on. Lowercasing the whole text
      // first was quadratic (once per raw element) and wrong: a character whose lowercase is longer
      // (`İ` is two) shifted every later offset, and the content after the element was lost (the checker).
      const closer = new RegExp(`</${tag.name}(?=[\\s/>]|$)`, 'gi');
      closer.lastIndex = i;
      const close = closer.exec(s)?.index ?? -1;
      const stop = close < 0 ? s.length : close;
      node.children.push(decodeEntities(s.slice(i, stop)));
      const gt = close < 0 ? -1 : s.indexOf('>', close);
      i = gt < 0 ? s.length : gt + 1;
      continue;
    }
    // Past MAX_DEPTH an element opens no new level: its content joins its parent's, as Chromium
    // flattens past 512. Every walk below recurses, and a few KB of unclosed `<div>` overflowed the
    // host's stack and ended the CLI render (the red team); the cap also bounds the close search.
    if (!VOID.has(tag.name) && !tag.selfClosed && stack.length <= MAX_DEPTH) stack.push(node);
  }
  return root;
}

const classesOf = (node) => String(node.attrs?.class || '').split(/\s+/).filter(Boolean);

/** The TeX a KaTeX render was made from, or null when this is not one. */
function texOf(node) {
  const cls = classesOf(node);
  if (!cls.includes('katex') && !cls.includes('katex-display')) return null;
  let found = null;
  const walk = (n) => {
    if (found !== null || typeof n === 'string') return;
    if (n.name === 'annotation' && /tex/i.test(n.attrs.encoding || '')) found = n.children.filter((c) => typeof c === 'string').join('');
    else n.children.forEach(walk);
  };
  walk(node);
  return found;
}

/** Inline elements that mark their text, and the mark each gives a run. */
const MARKS = { code: 'code', kbd: 'code', samp: 'code', strong: 'strong', b: 'strong', em: 'em', i: 'em', s: 'del', del: 'del', strike: 'del', mark: 'mark' };
/** Every key a run may carry besides `text`, in a fixed order. */
const RUN_KEYS = ['code', 'pill', 'strong', 'em', 'del', 'mark', 'math', 'href'];

/**
 * A node's inline content as RAW runs (white space not yet collapsed), each `{ text, …marks }`,
 * leaving out what is not the slide's words. `marks` is what the enclosing elements gave.
 */
function collectRuns(node, marks, out, skipLists) {
  if (typeof node === 'string') {
    out.push({ ...marks, text: node });
    return;
  }
  if (SKIP.has(node.name) || node.name === 'img') return;
  const tex = texOf(node);
  if (tex !== null) {
    out.push({ ...marks, math: true, text: tex });
    return;
  }
  if (node.name === 'br') {
    out.push({ ...marks, text: ' ' });
    return;
  }
  if (skipLists && (node.name === 'ul' || node.name === 'ol')) return;
  let m = marks;
  if (MARKS[node.name]) m = { ...m, [MARKS[node.name]]: true };
  if (node.name === 'a' && typeof node.attrs.href === 'string') m = { ...m, href: node.attrs.href };
  // A Lattice pill (`{DONE}`, lib/integrations/markdown-it inlinePills): a state, not prose.
  if (classesOf(node).includes('lat-pill')) m = { ...m, pill: true };
  const pad = BLOCKISH.has(node.name);
  if (pad) out.push({ ...marks, text: ' ' });
  for (const c of node.children) collectRuns(c, m, out, skipLists);
  if (pad) out.push({ ...marks, text: ' ' });
}

/**
 * Raw runs made final: white space collapsed ACROSS runs as a browser does, empty runs dropped,
 * neighbors with the same marks merged, the ends trimmed. So `runs.map((r) => r.text).join('')`
 * is exactly the node's `text`.
 */
function finishRuns(raw) {
  const out = [];
  const same = (a, b) => RUN_KEYS.every((k) => a[k] === b[k]);
  for (const r of raw) {
    let t = r.text.replace(/[\s\u00a0]+/g, ' ');
    const prev = out[out.length - 1];
    if ((!prev || prev.text.endsWith(' ')) && t.startsWith(' ')) t = t.slice(1);
    if (!t) continue;
    if (prev && same(prev, r)) prev.text += t;
    else {
      const run = { text: t };
      for (const k of RUN_KEYS) if (r[k] !== undefined) run[k] = r[k];
      out.push(run);
    }
  }
  while (out.length) {
    const last = out[out.length - 1];
    last.text = last.text.replace(/ $/, '');
    if (last.text) break;
    out.pop();
  }
  return out;
}

/** A node's inline content: its runs and their text. */
function inline(node, skipLists = false) {
  const raw = [];
  for (const c of typeof node === 'string' ? [node] : node.children) collectRuns(c, {}, raw, skipLists);
  const runs = finishRuns(raw);
  return { text: runs.map((r) => r.text).join(''), runs };
}

const inlineText = (node, skipLists = false) => inline(node, skipLists).text;

/** A `<pre>`'s code exactly: its text, with the one trailing newline markdown-it adds taken off. */
function codeBlock(pre) {
  const code = pre.children.find((c) => typeof c !== 'string' && c.name === 'code') || pre;
  const lang = [...classesOf(code), ...classesOf(pre)].find((c) => c.startsWith('language-'))?.slice(9) ?? '';
  const raw = (n) => (typeof n === 'string' ? n : n.name === 'br' ? '\n' : n.children.map(raw).join(''));
  return { type: 'code', lang, text: raw(code).replace(/\n$/, '') };
}

function listItems(list) {
  const items = [];
  for (const li of list.children) {
    if (typeof li === 'string' || li.name !== 'li') continue;
    const nested = [];
    const findLists = (n) => {
      if (typeof n === 'string' || SKIP.has(n.name)) return;
      if (n.name === 'ul' || n.name === 'ol') nested.push(...listItems(n));
      else n.children.forEach(findLists);
    };
    li.children.forEach(findLists);
    const { text, runs } = inline(li, true);
    // A LOOSE item (paragraphs, blank-line separated) keeps each paragraph; a tight one has one.
    const shallow = { ...li, children: li.children.filter((c) => typeof c === 'string' || (c.name !== 'ul' && c.name !== 'ol')) };
    const paragraphs = blocksOf(shallow).filter((b) => b.type === 'paragraph').map((b) => b.text);
    items.push({ text, runs, paragraphs, items: nested });
  }
  return items;
}

function tableBlock(table) {
  const rows = [];
  let caption = '';
  const walk = (n, inHead) => {
    if (typeof n === 'string' || SKIP.has(n.name)) return;
    if (n.name === 'caption') caption ||= inlineText(n);
    else if (n.name === 'tr') {
      const cells = n.children.filter((c) => typeof c !== 'string' && (c.name === 'td' || c.name === 'th'));
      rows.push({ head: inHead || (cells.length > 0 && cells.every((c) => c.name === 'th')), cells: cells.map((c) => inlineText(c)) });
    } else {
      for (const c of n.children) walk(c, inHead || n.name === 'thead');
    }
  };
  walk(table, false);
  const head = rows.length && rows[0].head ? rows.shift().cells : [];
  return { type: 'table', caption, head, rows: rows.map((r) => r.cells) };
}

/** The blocks under `node`, in reading order. Inline runs between blocks become paragraphs. */
function blocksOf(node) {
  const out = [];
  let raw = [];
  const flush = () => {
    const runs = finishRuns(raw);
    if (runs.length) out.push({ type: 'paragraph', text: runs.map((r) => r.text).join(''), runs });
    raw = [];
  };
  const images = (n) => {
    if (typeof n === 'string' || SKIP.has(n.name)) return;
    if (n.name === 'img') out.push({ type: 'image', src: n.attrs.src ?? '', alt: n.attrs.alt ?? '' });
    else n.children.forEach(images);
  };
  for (const c of node.children) {
    if (typeof c === 'string') {
      raw.push({ text: c });
      continue;
    }
    if (SKIP.has(c.name)) continue;
    const h = HEADING.exec(c.name);
    if (texOf(c) !== null && classesOf(c).includes('katex-display')) {
      flush();
      collectRuns(c, {}, raw, false);
      flush();
    } else if (texOf(c) !== null) {
      collectRuns(c, {}, raw, false);
    } else if (h) {
      flush();
      out.push({ type: 'heading', level: Number(h[1]), ...inline(c) });
    } else if (c.name === 'p') {
      flush();
      collectRuns(c, {}, raw, false);
      flush();
      images(c);
    } else if (c.name === 'ul' || c.name === 'ol') {
      flush();
      const start = c.name === 'ol' && /^-?\d+$/.test(c.attrs.start ?? '') ? Number(c.attrs.start) : 1;
      out.push({ type: 'list', ordered: c.name === 'ol', start, items: listItems(c) });
    } else if (c.name === 'table') {
      flush();
      out.push(tableBlock(c));
    } else if (c.name === 'pre') {
      flush();
      out.push(codeBlock(c));
    } else if (c.name === 'blockquote') {
      flush();
      out.push({ type: 'quote', blocks: blocksOf(c) });
    } else if (c.name === 'img') {
      flush();
      images(c);
    } else if (BLOCKISH.has(c.name)) {
      // A wrapper (the engine's `div.cell-coda`, an author's `<div>`): looked through.
      flush();
      out.push(...blocksOf(c));
    } else {
      collectRuns(c, {}, raw, false);
      images(c);
    }
  }
  flush();
  return out;
}

function blockText(b) {
  switch (b.type) {
    case 'list': {
      const lines = [];
      const walk = (items) => {
        for (const it of items) {
          lines.push(it.text);
          walk(it.items);
        }
      };
      walk(b.items);
      return lines.filter(Boolean).join('\n');
    }
    case 'table':
      return [[b.caption].filter(Boolean), b.head, ...b.rows].filter((r) => r.length).map((r) => r.join('\t')).join('\n');
    case 'quote':
      return b.blocks.map(blockText).filter(Boolean).join('\n');
    case 'image':
      return b.alt;
    default:
      return b.text;
  }
}

/**
 * The slide's plain facts, from the one `<section>` a door hands a package.
 * @param {string} sectionHtml  the section as the door hands it (`slide.html`)
 * @param {{ tokens?: string[] }} [opts]  the palette token names (without `--`) every theme defines
 */
export function slideFacts(sectionHtml, { tokens = [] } = {}) {
  const tree = parseTree(sectionHtml);
  const section = tree.children.find((c) => typeof c !== 'string' && c.name === 'section') || tree;
  const attrs = section.attrs || {};
  const directives = {};
  for (const [attr, key] of DIRECTIVE_BY_ATTR) if (Object.hasOwn(attrs, attr)) directives[key] = attrs[attr];
  // The running header and footer the engine writes into every section are the deck's chrome, not
  // this slide's content: their text is in `directives.header` / `directives.footer` (the checker).
  const content = { ...section, children: section.children.filter((c) => typeof c === 'string' || (c.name !== 'header' && c.name !== 'footer')) };
  const blocks = blocksOf(content);
  const heading = blocks.find((b) => b.type === 'heading' && b.level <= 2);
  return {
    version: FACTS_VERSION,
    classes: String(directives.class ?? '').split(/\s+/).filter(Boolean),
    directives,
    title: heading ? heading.text : '',
    blocks,
    text: blocks.map(blockText).filter(Boolean).join('\n'),
    tokens: tokens.map((t) => `--${String(t).replace(/^--/, '')}`),
  };
}
