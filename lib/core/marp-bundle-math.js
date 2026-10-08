/**
 * lib/core/marp-bundle-math.js — an Export-to-Marp bundle carries its math TYPESET, never as TeX
 * (engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md § 15).
 *
 * THE HOLE. marp-core typesets `$…$` and `$$…$$` itself, with MathJax by default, and MathJax's
 * output never meets the bundle's HTML allowlist: the math renderer emits it, not an `html_block`
 * token. Several MathJax commands (`\style`, `\cssId`, `\unicode`, `\href`, …) write an unescaped
 * `"` into an attribute, so a deck could run a handler or load a remote `url()` with no click, in
 * marp-cli and in VS Code's preview alike. A regex over that output lost to a red team twice.
 * Switching marp-core to KaTeX in the config does not hold either: a deck's own `math: mathjax`
 * directive overrides it (measured on marp-core 4.4.0). Only `math: false` holds.
 *
 * THE FIX. The producer typesets the math itself, with the engine's own KaTeX renderers
 * (lib/plugins/math/math.render.js, `trust` off, the same bytes the Lattice engine draws), and
 * writes the result into the deck. Then:
 *
 *   - the config sets `math: false` and the bundle's `.vscode/settings.json` sets
 *     `markdown.marp.mathTypesetting: "off"`, which also disables the deck's `math:` directive, so
 *     no math engine runs on the recipient's side under the bundle's own settings;
 *   - every `$` left in the deck's text is escaped (`\$`), so a tool that does typeset math (VS
 *     Code with the lone `.md` open, outside the bundle's folder) finds no delimiter to start on,
 *     even where its parser and ours disagree about what is math;
 *   - KaTeX's output is not trusted as text. `canonicalKatexHtml` reads it with a strict
 *     whole-string grammar (KaTeX's own tags and attributes, as measured, and a style grammar
 *     with no function but `calc()` and `var()`) and WRITES IT AGAIN from what it read, every
 *     character outside `[A-Za-z0-9 ]` and non-ASCII as an entity. Anything outside the grammar
 *     fails closed: the TeX is written out as plain text and the export says so.
 *
 * The bundle's math now looks like Lattice's own render (KaTeX, with the MathML a screen reader
 * reads) instead of MathJax. KaTeX's CSS and fonts already ride in the bundle's `lattice.css`.
 *
 * Pure and fs-free: both producers (tools/export-marp.js and the Studio) reach it through
 * `withRuntimeScriptsReport` in lib/core/marp-bundle.js.
 */

const MarkdownIt = require('markdown-it');
const { installGrammar } = require('../plugins/host-grammar.mjs');
const { PLUGIN_GRAMMAR } = require('../plugins/grammar.generated.mjs');
const { renderers, fences } = require('../plugins/math/math.render.js');
const { withoutFrontMatterLines } = require('./marp-front-matter');

// ── The grammar KaTeX's output must fit ──────────────────────────────────────────────────────
//
// Every tag and attribute KaTeX 0.16 writes with `trust` off, measured on the shipped decks' math
// and a ~110-command stress corpus (`\cancel`, `\boxed`, `\colorbox`, arrays, `\tag`, mhchem, …),
// plus the MathML elements KaTeX's own `buildMathML` can emit. Not here, on purpose: `mglyph` and
// `maction` (KaTeX writes them only for trusted commands), `annotation-xml` (an HTML integration
// point, the classic mutation-XSS hinge), and every URL-valued attribute. No element on the list is
// a raw-text or RCDATA element, so no text this module writes can turn into markup.
const MATHML_TAGS = [
  'math', 'semantics', 'annotation', 'mrow', 'mi', 'mn', 'mo', 'mtext', 'mspace', 'msup', 'msub',
  'msubsup', 'mfrac', 'msqrt', 'mroot', 'mover', 'munder', 'munderover', 'mtable', 'mtr', 'mtd',
  'mlabeledtr', 'menclose', 'mstyle', 'mpadded', 'mphantom',
];
const MATHML_ATTRS = [
  'mathvariant', 'mathcolor', 'mathbackground', 'mathsize', 'displaystyle', 'scriptlevel', 'stretchy',
  'fence', 'separator', 'lspace', 'rspace', 'minsize', 'maxsize', 'movablelimits', 'accent',
  'accentunder', 'linethickness', 'rowspacing', 'rowlines', 'columnalign', 'columnspacing',
  'columnlines', 'width', 'height', 'depth', 'voffset', 'notation',
];
const KATEX_TAGS = Object.freeze({
  span: ['class', 'style', 'aria-hidden', 'title'],
  svg: ['xmlns', 'width', 'height', 'viewBox', 'preserveAspectRatio', 'style'],
  path: ['d'],
  line: ['x1', 'y1', 'x2', 'y2', 'stroke-width'],
  math: ['xmlns', 'display'],
  annotation: ['encoding'],
  ...Object.fromEntries(MATHML_TAGS.filter((t) => t !== 'math' && t !== 'annotation').map((t) => [t, [...MATHML_ATTRS, 'class', 'style']])),
});

/**
 * The tags and attributes a baked equation carries, for the bundle's HTML allowlist
 * (lib/core/marp-bundle-html.js), lowercased the way marp-core's filter compares them.
 */
const KATEX_ALLOWLIST = Object.freeze(Object.fromEntries(Object.entries(KATEX_TAGS).map(
  ([tag, attrs]) => [tag, Object.freeze(attrs.map((a) => a.toLowerCase()))],
)));

// Inline style: KaTeX positions and sizes glyph boxes, and colors them (`\color`, `\colorbox`).
// Every property is named; a value is lengths, keywords, `#hex`, `calc()` and `var(--token)`, so no
// `url()`, `image-set()`, `expression()` or escape can appear in one.
const STYLE_PROPS = new Set([
  'height', 'width', 'min-width', 'top', 'bottom', 'left', 'vertical-align', 'position',
  'margin', 'margin-left', 'margin-right', 'padding-left', 'color', 'background-color',
  'border', 'border-color', 'border-style', 'border-width', 'border-bottom-width',
  'border-right-width', 'border-top-width', 'border-right-style', 'text-shadow',
]);
const STYLE_VALUE = /^(?:[-\w.#%+ ,]|calc\((?:[-\w.%+* ]|\/)*\)|var\(--[\w-]+\))*$/;

// The value of any other attribute: path data, lengths, keywords, colors, alignment lists.
// `title` (KaTeX's parse-error message) and `encoding` are free text and only ever encoded.
const PLAIN_VALUE = /^[-\w.,%#: ()/\n]*$/;
const FREE_TEXT_ATTRS = new Set(['title', 'encoding']);

const ENTITY = /&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|(amp|lt|gt|quot|apos|nbsp));/iy;
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decode the entities KaTeX writes; `null` on a bare `&` or any entity outside that set. */
function decode(raw) {
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const amp = raw.indexOf('&', i);
    if (amp < 0) return out + raw.slice(i);
    out += raw.slice(i, amp);
    ENTITY.lastIndex = amp;
    const m = ENTITY.exec(raw);
    if (!m) return null;
    if (m[3]) out += NAMED[m[3].toLowerCase()];
    else {
      const cp = m[1] ? Number(m[1]) : Number.parseInt(m[2], 16);
      if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null;
      out += String.fromCodePoint(cp);
    }
    i = ENTITY.lastIndex;
  }
  return out;
}

/**
 * Encode text for a place the HTML parser AND the Markdown parser will both read: every ASCII
 * character other than a letter, a digit or a space becomes a numeric entity, and so does any
 * control or line-break character. Markdown then has nothing to act on (no `*`, `_`, `` ` ``,
 * `$`, `|`, `:`, `\`, `[`, `<`, `&` or newline is left), and HTML has no quote to end an attribute.
 */
function encode(text) {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const plain = (cp >= 0x30 && cp <= 0x39) || (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || cp === 0x20
      || (cp > 0x9f && cp !== 0x2028 && cp !== 0x2029 && cp !== 0xfeff);
    out += plain ? ch : `&#${cp};`;
  }
  return out;
}

/**
 * Encode an attribute value: the five characters HTML needs, the line breaks a Markdown line cannot
 * hold, and `|`, which a table row splits on before any HTML is read. Nothing else, because
 * marp-core's HTML filter re-escapes `&` in a value it does not recognize.
 */
function encodeAttr(value) {
  return value.replace(/[&"'<>|\r\n\u2028\u2029]/g, (c) => `&#${c.codePointAt(0)};`);
}

function styleOk(value) {
  for (const decl of value.split(';')) {
    if (!decl.trim()) continue;
    const colon = decl.indexOf(':');
    if (colon < 0) return false;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    const val = decl.slice(colon + 1).trim();
    if (!STYLE_PROPS.has(prop) || !STYLE_VALUE.test(val)) return false;
  }
  return true;
}

function attrOk(name, value) {
  if (name === 'style') return styleOk(value);
  if (FREE_TEXT_ATTRS.has(name)) return true;
  return PLAIN_VALUE.test(value);
}

const OPEN = /<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z][a-zA-Z0-9:-]*=(?:"[^"<>]*"|'[^'<>]*'))*)\s*(\/?)>/y;
const ATTR = /\s+([a-zA-Z][a-zA-Z0-9:-]*)=(?:"([^"<>]*)"|'([^'<>]*)')/y;
const CLOSE = /<\/([a-zA-Z][a-zA-Z0-9]*)>/y;
const TEXT = /[^<]+/y;

/**
 * KaTeX's output, read with a strict grammar and written again from what was read, or `null` when
 * any part of it falls outside the grammar. The whole string must parse: tags on `KATEX_TAGS` with
 * their own attributes only, each value quoted and free of `<` and `>`, every tag closed in order,
 * and text holding only the entities KaTeX writes. The output is built from the parsed pieces, not
 * copied from the input, so an ambiguity the grammar did not see cannot survive into it.
 * @param {string} html
 * @returns {string | null}
 */
function canonicalKatexHtml(html) {
  const src = String(html);
  const stack = [];
  let out = '';
  let pos = 0;
  while (pos < src.length) {
    if (src[pos] !== '<') {
      TEXT.lastIndex = pos;
      const m = TEXT.exec(src);
      const text = decode(m[0]);
      if (text === null) return null;
      out += encode(text);
      pos = TEXT.lastIndex;
      continue;
    }
    CLOSE.lastIndex = pos;
    const close = CLOSE.exec(src);
    if (close) {
      if (stack.pop() !== close[1]) return null;
      out += `</${close[1]}>`;
      pos = CLOSE.lastIndex;
      continue;
    }
    OPEN.lastIndex = pos;
    const open = OPEN.exec(src);
    if (!open) return null;
    const tag = open[1];
    const allowed = KATEX_TAGS[tag];
    if (!allowed) return null;
    let attrs = '';
    const seen = new Set();
    const list = open[2];
    let ap = 0;
    while (ap < list.length) {
      ATTR.lastIndex = ap;
      const a = ATTR.exec(list);
      if (!a) return null;
      const name = a[1];
      const value = decode(a[2] ?? a[3]);
      if (value === null || !allowed.includes(name) || seen.has(name) || !attrOk(name, value)) return null;
      seen.add(name);
      attrs += ` ${name}="${encodeAttr(value)}"`;
      ap = ATTR.lastIndex;
    }
    pos = OPEN.lastIndex;
    if (open[3]) {
      out += `<${tag}${attrs}></${tag}>`;
    } else {
      out += `<${tag}${attrs}>`;
      stack.push(tag);
    }
  }
  return stack.length ? null : out;
}

// ── Finding the math the way the engine does ──────────────────────────────────────────────────

const MATH = PLUGIN_GRAMMAR.filter((p) => p.name === 'math');
// The math plugin's token types, read from its registry entry rather than named here: the plugin
// owns them (engineering/decisions/2026-09-27-plugin-system.md §7).
const ruleOf = (kind) => Object.entries(MATH[0]?.syntax || {}).find(([, r]) => r.kind === kind)?.[0];
const INLINE = ruleOf('inline');
const BLOCK = ruleOf('block');

/**
 * A markdown-it that parses like the Lattice engine for the purpose that matters here (commonmark,
 * raw HTML on, tables, and the math plugin's own rules at its own anchors), instrumented to record
 * where each `$…$` span and each `$` it declined sit in the inline source it was handed.
 */
function mathParser(mathOn) {
  const md = new MarkdownIt('commonmark', { html: true }).enable(['table', 'strikethrough']);
  if (mathOn) installGrammar(md, { grammar: MATH });
  const record = (state) => {
    const cur = state.env?.__bakeMath;
    return cur && state.src === cur.src ? cur : null;
  };
  if (mathOn) {
    const rule = md.inline.ruler.__rules__.find((r) => r.name === INLINE).fn;
    md.inline.ruler.at(INLINE, (state, silent) => {
      const start = state.pos;
      const ok = rule(state, silent);
      const cur = !silent && ok && record(state);
      if (cur) cur.spans.push({ start, end: state.pos, tex: state.tokens[state.tokens.length - 1].content });
      return ok;
    });
  }
  // Every `$` no math rule took: it reaches the text as a literal dollar, and gets escaped.
  md.inline.ruler.after(mathOn ? INLINE : 'escape', 'bake_math_dollar', (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x24) return false;
    const cur = !silent && record(state);
    if (cur) cur.dollars.push(state.pos);
    return false;
  });
  return md;
}

/** Start offset of each line in `src`, plus `src.length` at the end. */
function lineStarts(src) {
  const starts = [0];
  const re = /\r\n|\r|\n/g;
  for (let m = re.exec(src); m; m = re.exec(src)) starts.push(m.index + m[0].length);
  starts.push(src.length);
  return starts;
}

/** The text of line `i`, without its line break. */
function lineText(src, starts, i) {
  return src.slice(starts[i], starts[i + 1]).replace(/(?:\r\n|\r|\n)$/, '');
}

/**
 * Map each offset of an inline token's `content` back to the source. The content is the token's
 * source lines with their container prefixes (`> `, list indentation) removed and the ends trimmed,
 * so each content line sits inside its source line. `cursor` holds how far each line has been
 * consumed, for the table cells that share a line. `null` when a line cannot be placed (a tab that
 * markdown-it expanded, say): the caller then bakes nothing in that token.
 */
function contentOffsets(content, map, src, starts, cursor) {
  const lines = content.split('\n');
  const at = [];
  for (let k = 0; k < lines.length; k++) {
    const n = map[0] + k;
    if (n >= map[1]) return null;
    const text = lineText(src, starts, n);
    const c = lines[k];
    let idx = -1;
    const from = cursor.get(n) || 0;
    if (k > 0 && text.endsWith(c)) idx = text.length - c.length;
    else if (k > 0 && text.trimEnd().endsWith(c)) idx = text.trimEnd().length - c.length;
    else idx = text.indexOf(c, from);
    if (idx < 0 || idx < from) return null;
    cursor.set(n, idx + c.length);
    at.push(starts[n] + idx);
  }
  return (offset) => {
    let k = 0;
    let rest = offset;
    while (k < lines.length - 1 && rest > lines[k].length) {
      rest -= lines[k].length + 1;
      k += 1;
    }
    return at[k] + rest;
  };
}

/** The blank line that keeps a container open: `> ` stays `>`, a list marker becomes nothing. */
function blankFor(prefix) {
  return prefix.replace(/(?:[-*+]|\d{1,9}[.)])(?=[ \t]|$)/g, (m) => ' '.repeat(m.length)).trimEnd();
}

/** One equation, typeset and canonical; `null` when KaTeX is absent or the grammar refuses it. */
function typeset(html) {
  if (!html.includes('class="katex')) return null;
  return canonicalKatexHtml(html);
}

/** The TeX, shown as text (delimiters included) when it could not be typeset. */
function asText(tex, display) {
  const d = display ? '$$' : '$';
  return encode(`${d}${tex}${d}`);
}

/**
 * Typeset every equation the engine would, write it into the deck, and escape every other `$`.
 * @param {string} markdown  the deck
 * @param {{ math?: boolean }} [opts]  `math: false` — the math plugin is off for this deck, so
 *   nothing is typeset (the engine shows the TeX as written) and every `$` is only escaped
 * @returns {{ markdown: string, baked: number, failed: number }}
 */
function bakeMath(markdown, { math = true } = {}) {
  const src = String(markdown ?? '');
  if (!src.includes('$') && !(math && src.includes('math'))) {
    return { markdown: src, baked: 0, failed: 0 };
  }
  const md = mathParser(math);
  const parseSrc = withoutFrontMatterLines(src);
  const env = {};
  const tokens = md.parse(parseSrc, env);
  const starts = lineStarts(src);
  const edits = [];
  let baked = 0;
  let failed = 0;
  const cursor = new Map();

  // A display equation replaces its source lines with one HTML line and a blank one: the blank
  // line ends the HTML block (markdown-it runs one on to the next blank line), and keeps a
  // blockquote open (`>`) where the equation sat in one.
  const blockEdit = (token, rendered, tex) => {
    const [a, b] = token.map;
    const first = lineText(src, starts, a);
    const at = token.type === 'fence' ? first.search(/[`~]{3}/) : first.indexOf('$$');
    const prefix = first.slice(0, Math.max(0, at));
    const html = typeset(rendered.replace(/^<p>/, '').replace(/<\/p>\n?$/, ''));
    const range = src.slice(starts[a], starts[b]);
    const body = html ?? asText(tex, true);
    edits.push({ from: starts[a], to: starts[b], text: `${prefix}<p>${body}</p>\n${blankFor(prefix)}${/[\r\n]$/.test(range) ? '\n' : ''}` });
    if (html) baked += 1;
    else failed += 1;
  };

  // A table cell's inline token carries no line map; its row does.
  let rowMap = null;
  for (const token of tokens) {
    if (token.type === 'tr_open') rowMap = token.map;
    if (token.type === 'inline' && !token.map && rowMap) token.map = rowMap;
    // `family: 'wide'` — no reflow: Marp sets the deck at the size it was written for.
    if (math && token.type === BLOCK && token.map) {
      blockEdit(token, renderers[BLOCK](token, { options: {}, family: 'wide' }), token.content);
      continue;
    }
    const lang = token.type === 'fence' ? token.info.trim().split(/\s+/)[0] : '';
    const fence = lang && Object.hasOwn(fences, lang) ? fences[lang] : null;
    if (math && fence && token.map) {
      blockEdit(token, fence(token, { options: {}, family: 'wide' }), token.content.replace(/\n$/, ''));
      continue;
    }
    if (token.type !== 'inline' || !token.map || !token.content.includes('$')) continue;
    const cur = { src: token.content, spans: [], dollars: [] };
    env.__bakeMath = cur;
    md.inline.parse(token.content, md, env, []);
    env.__bakeMath = null;
    const toSource = contentOffsets(token.content, token.map, src, starts, cursor);
    // Every span must land on its own bytes (one-line spans exactly), and every dollar on a `$`.
    const placed = toSource && cur.spans.every((s) => {
      const from = toSource(s.start);
      const to = toSource(s.end - 1) + 1;
      const bytes = src.slice(from, to);
      return bytes[0] === '$' && bytes[bytes.length - 1] === '$' && (/[\r\n]/.test(bytes) || bytes === `$${s.tex}$`);
    }) && cur.dollars.every((d) => src[toSource(d)] === '$');
    if (!placed) {
      // Cannot map this token back to its bytes: typeset nothing in it, and escape every `$` on its
      // lines that is not already escaped, so no other tool can read math out of it either.
      failed += cur.spans.length;
      for (let n = token.map[0]; n < token.map[1]; n++) {
        const text = lineText(src, starts, n);
        for (let i = text.indexOf('$'); i >= 0; i = text.indexOf('$', i + 1)) {
          let bs = 0;
          while (i - bs - 1 >= 0 && text[i - bs - 1] === '\\') bs += 1;
          if (bs % 2 === 0) edits.push({ from: starts[n] + i, to: starts[n] + i, text: '\\' });
        }
      }
      continue;
    }
    for (const s of cur.spans) {
      const html = typeset(renderers[INLINE]({ content: s.tex }, { options: {} }));
      edits.push({ from: toSource(s.start), to: toSource(s.end - 1) + 1, text: html ?? asText(s.tex, false) });
      if (html) baked += 1;
      else failed += 1;
    }
    for (const d of cur.dollars) {
      const at = toSource(d);
      edits.push({ from: at, to: at, text: '\\' });
    }
  }
  if (!edits.length) return { markdown: src, baked, failed };
  edits.sort((x, y) => x.from - y.from || x.to - y.to);
  let out = '';
  let pos = 0;
  for (const e of edits) {
    if (e.from < pos) continue; // two edits over one range: the first wins (cannot happen for a parse)
    out += src.slice(pos, e.from) + e.text;
    pos = e.to;
  }
  return { markdown: out + src.slice(pos), baked, failed };
}

module.exports = { bakeMath, canonicalKatexHtml, KATEX_ALLOWLIST, _internal: { encode, styleOk, blankFor } };
