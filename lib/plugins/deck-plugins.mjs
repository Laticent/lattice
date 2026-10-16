/**
 * lib/plugins/deck-plugins.mjs — what a DECK'S SOURCE says about plugins, read and written in one
 * place: its front-matter `plugins:` import list, and the slide classes it names. The plugin host
 * reads both to decide which plugins load (host-grammar.mjs `admitPlugins`); the Studio's Plugins
 * tab writes the list back (`writeDeckPlugins`). One reader and one writer for the list, so they
 * can never disagree about which lines are the register (the `class:` lesson,
 * lib/core/front-matter-key.js `topLevelFrontMatterValue`).
 *
 * THE IMPORT LIST (engineering/decisions/2026-09-27-plugin-system.md §9 decisions 6 and 9).
 * `plugins:` NAMES the plugins a deck needs enabled, like an import statement. It only ever ADDS:
 * listing a plugin that is already on (every shipped plugin, today) changes nothing, and there is
 * no `-name` removal syntax and no "exactly these" reading. Every YAML spelling of a list of names
 * reads the same:
 *
 *     plugins: [math, mermaid]        the form the Studio writes (a YAML flow sequence)
 *     plugins: math, mermaid          a comma or space separated scalar ("…" quoted, too)
 *     plugins: [math,                 a flow sequence over several lines
 *       mermaid]
 *     plugins:                        a block sequence (comments and blank lines between items)
 *       - math
 *       - mermaid
 *
 * THE REGISTER IS A SPAN OF LINES, not a line: the `plugins:` key at column 0 plus every line
 * after it that is indented, a `- item`, a comment or blank, up to the next column-0 key (trailing
 * blank lines stay outside). The writer replaces that whole span, so no spelling an author wrote —
 * a multi-line flow list, a block scalar, a commented sequence — leaves orphaned lines that would
 * turn valid YAML invalid for a real-YAML reader such as Export-to-Marp (HARD RULE #25 red team, E0).
 *
 * LINEAR BY CONSTRUCTION. A deck can come from a shared link, and this runs on every render and on
 * every Studio keystroke, so nothing here backtracks: lines are split once, comments are cut with
 * `indexOf`, and comment directives are found with `indexOf('<!--')` / `indexOf('-->')`. The first
 * cut had a quadratic trailing-blank-line strip and inherited a cubic class-directive regex
 * (red team: 40,000 blank lines took 5 s; 4 KB of spaces after `<!-- class:` took 21 s);
 * test/unit/plugins/admit.test.js pins both shapes.
 *
 * THE FENCE IS THE ENGINE'S: lib/engine/directives.js `parseFrontMatter`'s pattern, after the
 * engine's own BOM strip, so the writer never edits text the engine renders as a slide.
 *
 * ESM and library-free, like host-grammar.mjs: the docs site bundles it, and Rollup does no
 * named-export interop on a CommonJS file under lib/.
 */

/** lib/engine/directives.js `parseFrontMatter`'s fence, exactly. */
const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const BOM = '﻿';

/** The deck's front matter, as the engine reads it: its body and where it sits (BOM-relative). */
function frontMatter(source) {
  const src = String(source ?? '');
  const bom = src.startsWith(BOM) ? 1 : 0;
  const m = FENCE.exec(bom ? src.slice(1) : src);
  if (!m) return null;
  const open = m[0].startsWith('---\r\n') ? 5 : 4;
  return { body: m[1], start: bom + open, end: bom + open + m[1].length, whole: bom + m[0].length, bom };
}

/** A plugin NAME's shape — the manifest schema's (lowercase, digits, inner hyphens). */
const NAME = /^[a-z][a-z0-9-]*$/;

/** Text before a YAML comment: a `#` at the start or after a space or tab. No regex, no backtracking. */
function uncomment(text) {
  for (let i = text.indexOf('#'); i !== -1; i = text.indexOf('#', i + 1)) {
    if (i === 0 || text[i - 1] === ' ' || text[i - 1] === '\t') return text.slice(0, i);
  }
  return text;
}

/** One name, cleaned of the quotes and brackets around it. */
function bare(token) {
  let start = 0;
  let end = token.length;
  while (start < end && '"\'['.includes(token[start])) start++;
  while (end > start && '"\']'.includes(token[end - 1])) end--;
  return token.slice(start, end);
}

/** Split a list's text on commas and whitespace into clean names. */
function names(text) {
  return text.split(/[\s,]+/).map(bare).filter((n) => n && n !== '~' && n !== 'null');
}

/** Is this front-matter line a CONTINUATION of the key above it (not a new column-0 key)? */
function continues(line) {
  return line === '' || line[0] === ' ' || line[0] === '\t' || line[0] === '-' || line[0] === '#' || line.trim() === '';
}

/**
 * The `plugins:` register as a span of the front-matter body's lines: `{ first, last, items }`
 * (line indices, inclusive), or null when the deck has no top-level `plugins:` key.
 */
function pluginsSpan(lines) {
  const first = lines.findIndex((l) => l.startsWith('plugins') && /^plugins[ \t]*:/.test(l));
  if (first === -1) return null;
  let last = first;
  for (let i = first + 1; i < lines.length && continues(lines[i]); i++) if (lines[i].trim() !== '') last = i;
  const head = uncomment(lines[first].slice(lines[first].indexOf(':') + 1)).trim();
  const rest = lines.slice(first + 1, last + 1).map((l) => uncomment(l).trim()).filter(Boolean);
  const items = [];
  if (head === '' && rest.length && rest.every((l) => l.startsWith('-'))) {
    for (const l of rest) items.push(...names(l.slice(1)));
  } else {
    // A one-line or multi-line flow list, a scalar, or a block scalar (`>` / `|`): its words.
    const text = [head, ...rest].join(' ');
    items.push(...names(head === '>' || head === '|' || head === '>-' || head === '|-' ? rest.join(' ') : text));
  }
  return { first, last, items };
}

/**
 * The deck's `plugins:` import list, in the author's order, unique — or `[]` when it has none.
 * Every name is returned, a malformed or unknown one included: deciding what a name means is the
 * host's job (`admitPlugins` reports an unknown one), not the reader's.
 * @param {string} source  the deck's Markdown
 * @returns {string[]}
 */
export function deckPluginList(source) {
  const fm = frontMatter(source);
  if (!fm) return [];
  const span = pluginsSpan(fm.body.split(/\r?\n/));
  return span ? [...new Set(span.items)] : [];
}

/** Is `name` shaped like a plugin name? (A listed `$foo` is reported, never looked up.) */
export function isPluginName(name) {
  return NAME.test(name);
}

/**
 * Every class token the deck's class directives name, unique, in order (front matter first):
 * `class:` in the front matter, every `<!-- class: … -->` / `<!-- _class: … -->`, and every pane
 * marker's component (`<!-- _pane: X … -->` / `pane:`), which renders as that pane's class. It
 * reads the SOURCE, before any parse, because the plugins a component requires must be installed
 * before the parse that renders it. A superset, like every probe: a directive quoted inside a code
 * block still counts, and the cost of that is one plugin loaded that a render did not need.
 * Quotes and flow brackets around a token are dropped, as the engine drops them.
 * @param {string} source
 * @returns {string[]}
 */
export function deckClassTokens(source) {
  const src = String(source || '');
  const out = new Set();
  const add = (raw, firstOnly = false) => {
    const tokens = names(String(raw || ''));
    for (const t of firstOnly ? tokens.slice(0, 1) : tokens) out.add(t);
  };
  const fm = frontMatter(src);
  if (fm) {
    for (const line of fm.body.split(/\r?\n/)) {
      const t = line.trimStart();
      if (t.startsWith('class') && /^class[ \t]*:/.test(t)) {
        add(uncomment(t.slice(t.indexOf(':') + 1)));
        break;
      }
    }
  }
  for (let at = src.indexOf('<!--'); at !== -1; at = src.indexOf('<!--', at + 4)) {
    const close = src.indexOf('-->', at + 4);
    if (close === -1) break;
    // A stray `<!--` (quoted in a code span or a fence) would otherwise pair with the NEXT real
    // directive's `-->` and hide its class. HTML pairs a comment's `-->` with the opener nearest
    // before it, so re-anchor there: the backward search stops inside this span, so it stays linear.
    at = src.lastIndexOf('<!--', close - 1);
    const inner = src.slice(at + 4, close).trim();
    const colon = inner.indexOf(':');
    if (colon !== -1) {
      const key = inner.slice(0, colon).trim();
      if (key === 'class' || key === '_class') add(inner.slice(colon + 1));
      else if (key === 'pane' || key === '_pane') add(inner.slice(colon + 1), true);
    }
    at = close - 1;
  }
  return [...out];
}

/**
 * Write the deck's `plugins:` import list. `names` empty removes the register (and the front
 * matter, if that leaves it empty); otherwise the register becomes ONE line, `plugins: [a, b]`, in
 * place of whatever span of lines was there. A deck with no front matter gains one (after its BOM,
 * if it has one). Line endings follow the deck's own.
 * @param {string} source
 * @param {Iterable<string>} list
 * @returns {string}
 */
export function writeDeckPlugins(source, list) {
  const src = String(source ?? '');
  const wanted = [...new Set([...list].filter(Boolean))];
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const line = wanted.length ? `plugins: [${wanted.join(', ')}]` : null;
  const fm = frontMatter(src);
  if (!fm) {
    if (!line) return src;
    const bom = src.startsWith(BOM) ? BOM : '';
    return `${bom}---${eol}${line}${eol}---${eol}${eol}${src.slice(bom.length).replace(/^(?:[ \t]*\r?\n)+/, '')}`;
  }
  const lines = fm.body.split(/\r?\n/);
  const span = pluginsSpan(lines);
  if (!span) {
    if (!line) return src;
    return `${src.slice(0, fm.end)}${eol}${line}${src.slice(fm.end)}`;
  }
  const kept = [...lines.slice(0, span.first), ...(line ? [line] : []), ...lines.slice(span.last + 1)];
  // Nothing but blanks left → drop the whole block, so clearing the list leaves the deck as clean
  // as it was before the first plugin was listed.
  if (!kept.some((l) => l.trim())) return src.slice(0, fm.bom) + src.slice(fm.whole);
  return src.slice(0, fm.start) + kept.join(eol) + src.slice(fm.end);
}
