/**
 * The decks we SHIP, and the inline-code spans inside them — shared by the census
 * tests that hold the inline directive grammar to the corpus it actually reads.
 *
 * WHY A HELPER. Two tests walk the same corpus for different shapes: the eyebrow /
 * subtitle census (`test/unit/css/eyebrow-position-shadow.test.js`) looks for code-only
 * PARAGRAPHS, and the collision census (`test/unit/core/inline-code-corpus-census.test.js`)
 * looks for every inline SPAN. A second copy of "which files are decks" drifts the moment
 * a deck directory is added, and then one census silently stops covering it.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const MarkdownIt = require('markdown-it');
const { frontMatterValue } = require(path.join(__dirname, '..', '..', 'lib/core/front-matter-key.js'));

/**
 * A PLAIN parser — see `inlineSpans`. The engine's has the pill plugin installed, which
 * would consume the very tokens this walks.
 *
 * `html: true` IS LOAD-BEARING and the default is wrong here. With markdown-it's default
 * `html: false`, `<!-- … -->` is not recognized as HTML at all — it parses as an ordinary
 * paragraph, so a backticked span inside a note-to-self comment becomes a live
 * `code_inline` and the census fails on a span that renders nowhere. Measured: a reviewer
 * planted `<!-- Reviewer note: \`{TODO}\` renders nowhere -->` in a shipped deck and the
 * gate went red. An earlier docblock here claimed comments "fall out for free"; they did
 * the opposite.
 */
const md = new MarkdownIt({ html: true });

const ROOT = path.join(__dirname, '..', '..');

/**
 * Every markdown file that is a DECK we ship — the ones a reader sees and the ones we
 * hold to our own bar. Deliberately not every `*.md`: a `*.docs.md` is prose ABOUT a
 * component and is never projected, and `engineering/` is a written record, so a
 * `{LABEL}` in either renders nowhere.
 */
function shippedDecks() {
  const out = execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(
    (f) =>
      f.startsWith('examples/') ||
      f.startsWith('kit/') ||
      f.endsWith('.gallery.md') ||
      f.startsWith('test/integration/baseline-decks/'),
  );
}

/** A line that opens or closes a fenced block — its contents are code, not prose. */
const FENCE = /^\s*(```|~~~)/;

/** `<!-- _header: … -->` / `<!-- _footer: … -->` — a Marp per-slide chrome directive. */
const SLIDE_CHROME = /<!--\s*_(header|footer)\s*:\s*([\s\S]*?)\s*-->/g;

/** Strip one layer of matching quotes, the way a YAML scalar reads. */
function unquote(v) {
  const t = String(v ?? '').trim();
  return /^(['"])[\s\S]*\1$/.test(t) ? t.slice(1, -1) : t;
}

/**
 * Every inline-code span in a deck, with the line it sits on.
 *
 * IT ASKS A PARSER, NOT A REGEX, and the first cut did the opposite — which left the
 * census with two blind spots that render as pills TODAY:
 *
 *   ``{LIVE}``        a double-backtick span. CommonMark's double form is for embedding a
 *                     backtick, not for asking to be left alone, and the grammar's
 *                     double-backtick special case was REMOVED when the escape became a
 *                     backslash (`lib/core/inline-code-directives.js`) — so this dispatches
 *                     exactly like the single form.
 *   `{AB\nCD}`        a span that wraps across a source line. CommonMark joins the lines
 *                     with a space, so this dispatches as the label `AB CD`. Three such
 *                     spans exist in the corpus today — none dispatching — and the regex
 *                     walker saw none of them.
 *
 * Planting both in a shipped deck left the census GREEN. A gate that only catches the
 * shapes its author thought of is the thing this census exists to replace.
 *
 * CHROME IS WALKED TOO, and it is not an extra — it is a rendered surface this grammar
 * reaches. `header:` / `footer:` in front matter and `<!-- _header: -->` / `<!-- _footer: -->`
 * per slide are rendered with `md.renderInline`, so a `{LABEL}` in a running header draws a
 * pill exactly as it would in the body — the defect that made the register gate chrome in
 * the first place. The parser cannot find them (they are a YAML value and an HTML comment),
 * so they are read directly, through the same `frontMatterValue` kernel the engine uses.
 *
 * THE LINE NUMBER IS THE BLOCK'S FIRST LINE, not the span's, because markdown-it carries
 * `map` on block tokens and not on inline children. A span in a wrapped paragraph reports
 * the paragraph's opening line. The census failure message says so rather than leaving an
 * author to wonder why the quoted text is not on the line named.
 *
 * @returns {{file:string, line:number, text:string}[]}
 */
function inlineSpans(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const found = [];
  // STRIP THE FRONT MATTER BEFORE PARSING. markdown-it has no YAML front-matter rule, so a
  // leading `---` block parses as thematic-break / paragraph / thematic-break and every
  // quoted value in it becomes body prose. Two things went wrong from that: a chrome span
  // was reported TWICE (once as a paragraph, once as chrome), and a span in a value that
  // renders nowhere — a `title:`, a `description:` — was reported as if it were on a slide.
  // Blanked rather than removed so every line number below still matches the source file.
  const body = src.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, (m) => m.replace(/[^\n]/g, ''));
  let blockLine = 1;
  for (const token of md.parse(body, {})) {
    if (Array.isArray(token.map)) blockLine = token.map[0] + 1;
    if (token.type !== 'inline' || !Array.isArray(token.children)) continue;
    for (const child of token.children) {
      if (child.type === 'code_inline') found.push({ file, line: blockLine, text: child.content });
    }
  }
  return [...found, ...chromeSpans(file, src)];
}

/** The spans inside a deck's running header and footer — deck-wide and per slide. */
function chromeSpans(file, src) {
  const found = [];
  const lines = src.split('\n');

  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (fm) {
    const fmLine = (key) => lines.findIndex((l) => new RegExp(`^[ \\t]*${key}:`).test(l)) + 1;
    for (const key of ['header', 'footer']) {
      const value = frontMatterValue(fm[1], key);
      if (value) for (const t of spansIn(value)) found.push({ file, line: fmLine(key) || 1, text: t });
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    SLIDE_CHROME.lastIndex = 0;
    let m;
    while ((m = SLIDE_CHROME.exec(lines[i]))) {
      for (const t of spansIn(unquote(m[2]))) found.push({ file, line: i + 1, text: t });
    }
  }
  return found;
}

/** The inline-code spans in one run of chrome text — rendered with `renderInline`. */
function spansIn(text) {
  return md
    .parseInline(String(text), {})
    .flatMap((t) => t.children || [])
    .filter((c) => c.type === 'code_inline')
    .map((c) => c.content);
}

/**
 * Every CODE-ONLY PARAGRAPH in a deck, with the block that precedes and follows it.
 *
 * This is the shape `base.modifiers.css` promotes in two places — the EYEBROW kicker
 * (`section p:has(> code:only-child):has(+ h1)`) and the SUBTITLE (`section h1 + p:has(>
 * code:only-child)`). Both name a `<code>` ELEMENT, which the inline directive grammar
 * replaces with a `<span>`, so a `{LABEL}` in either position silently loses its promotion.
 *
 * IT IS A PARSER WALK FOR THE SAME REASON `inlineSpans` IS. The line-at-a-time version
 * matched `^`…`$` on a trimmed line, which cannot see a paragraph whose single span is
 * written with double backticks or wrapped across two source lines, and needed a
 * hand-rolled rule to step over an HTML comment between the span and its heading — a rule
 * it did not have until a span hidden behind a `markdownlint-disable-next-line` was found
 * being certified without being looked at. Asking markdown-it for "a paragraph whose inline
 * content is exactly one `code_inline`" is the selector's own semantics, and the comment,
 * the fence and the indented block all fall out of the token stream for free.
 *
 * @returns {{file:string, line:number, text:string, before:string, after:string}[]}
 */
function codeOnlyParagraphs(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const body = src.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, (m) => m.replace(/[^\n]/g, ''));
  const tokens = md.parse(body, {});
  const found = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].type !== 'paragraph_open') continue;
    const inline = tokens[i + 1];
    if (!inline || inline.type !== 'inline' || !Array.isArray(inline.children)) continue;
    const kids = inline.children.filter((c) => !(c.type === 'text' && !c.content.trim()));
    if (kids.length !== 1 || kids[0].type !== 'code_inline') continue;
    found.push({
      file,
      line: (tokens[i].map ? tokens[i].map[0] : 0) + 1,
      text: kids[0].content,
      before: tokens[i - 1]?.type || '',
      after: tokens[i + 3]?.type || '',
    });
  }
  return found;
}

module.exports = { ROOT, shippedDecks, inlineSpans, codeOnlyParagraphs, FENCE };
