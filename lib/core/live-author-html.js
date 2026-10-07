/**
 * live-author-html — how much of a deck's own executable HTML a plain `.html` export keeps live.
 *
 * THE DECISION THIS REPORTS ON. The CLI's plain `.html` (and the `.html` sidecar written beside
 * every PDF, PPTX and PNG) is the page the export renders from, and it keeps the deck's raw HTML
 * as written: markdown-it runs with `html: true` (lib/engine/index.js), so an author's `<script>`
 * and `on*` handlers run in whoever opens the file. That is by design — design/skill.md §Raw HTML
 * documents author script as a feature that paints into the PDF — and the artifact meant for a
 * recipient is `--player`, which sanitizes the slide DOM under a strict CSP
 * (engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md § 10).
 *
 * What was wrong was the SILENCE: the CLI never said the file it wrote runs code. This module
 * counts it so the CLI can say so, once, in the warning `formatLiveAuthorHtmlWarning` builds. It
 * DOES NOT strip anything; the exported bytes are unchanged.
 *
 * WHAT IT COUNTS. Every executable `<script>` that does not carry the engine's marker
 * (`data-lattice-script`, author-deferral-probe.js), every `on…=` attribute on an element, and
 * every `srcdoc` frame or `javascript:` URL (`href`, `src`, `action`, `formaction`, `data`).
 * A `<script type="application/json">` (or any non-JavaScript type) holds data and is skipped.
 * Script and style element BODIES are blanked before the attribute scan (their opening tags stay,
 * so a `<script onload=…>` still counts), so engine JavaScript or
 * CSS that mentions `onerror=` in a string is not counted. It is text matching, not a parse: an
 * attribute VALUE that itself contains ` onclick=` would count once too many. That errs toward
 * warning, which is the safe side for a warning.
 */
const MarkdownIt = require('markdown-it');
const { ENGINE_SCRIPT_ATTR } = require('./author-deferral-probe');

const TYPE_ATTR = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
// The types a browser runs (HTML § "JavaScript MIME type essence match", plus `module`).
const JS_TYPE = /^(?:module|(?:application|text)\/(?:x-)?(?:java|ecma)script|text\/jscript|text\/livescript|text\/javascript1\.[0-5])$/i;

/** Does this `<script>`'s attribute text describe a script the browser would run? */
function runs(attrs) {
  const m = attrs.match(TYPE_ATTR);
  if (!m) return true;
  const type = (m[1] ?? m[2] ?? m[3] ?? '').trim();
  return type === '' || JS_TYPE.test(type);
}

/**
 * @param {string} html  the exported document (or any HTML fragment)
 * @returns {{ scripts: number, handlers: number, urls: number }}
 */
function countLiveAuthorHtml(html) {
  const s = String(html || '');
  return tally(liveSpans(s, s, { comments: true }).spans);
}

/**
 * The CLI's warning lines, or `[]` when the file runs nothing of the deck's.
 * @param {{ scripts: number, handlers: number, urls?: number }} counts
 * @param {string} file  the path as the CLI prints it
 * @param {{ sidecar?: boolean }} [opts]  true when the `.html` is the sidecar beside another output
 */
function formatLiveAuthorHtmlWarning(counts, file, opts = {}) {
  const { scripts = 0, handlers = 0, urls = 0 } = counts || {};
  if (!scripts && !handlers && !urls) return [];
  const parts = [];
  if (scripts) parts.push(`${scripts} <script>${scripts === 1 ? '' : 's'}`);
  if (handlers) parts.push(`${handlers} on… handler${handlers === 1 ? '' : 's'}`);
  if (urls) parts.push(`${urls} javascript: URL${urls === 1 ? '' : 's'} or srcdoc frame${urls === 1 ? '' : 's'}`);
  const what = opts.sidecar ? `${file} (the HTML sidecar)` : file;
  return [
    `  ⚠ ${what} keeps the deck's own HTML live: ${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')}. Whoever opens the file runs ${scripts + handlers + urls === 1 ? 'it' : 'them'}.`,
    '      To hand the deck to someone, export with --player: it sanitizes the slides and runs under a strict CSP.',
  ];
}

// ── The strip: the Export-to-Marp bundle's deck ─────────────────────────────────────────────
//
// THE DECISION (engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md § 11). The
// Export-to-Marp bundle's `marp.config.cjs` sets `html: true`, because the runtime arrives as
// `<script>` tags at the end of the deck. That same flag passes the deck's OWN script through, so
// the recipient's `npm run pdf` ran it in marp-cli's headless Chrome, beacon and all. The Studio
// preview sanitizes, so a script an AI edit or an import put in the source never ran in front of
// its author, and it rode into every bundle. `withoutLiveAuthorHtml` drops what `countLiveAuthorHtml`
// counts — a deck `<script>`, an `on…=` handler, a `srcdoc` frame, a `javascript:` URL — from the
// deck's MARKDOWN, before `withRuntimeScripts` appends the runtime tags, so Lattice's own tags stay.
//
// WHAT IT LEAVES ALONE. Fenced and indented code, which markdown-it renders as escaped text, and
// inline code spans, which it renders the same way. Every other `<div>`, `<img>` or `<style>` the
// deck writes passes through: they are the raw HTML a Lattice deck is allowed to carry.
//
// HOW IT KNOWS IT WORKED. Finding inline code spans in raw markdown is a parse, and a hand-rolled
// one can disagree with markdown-it (a backtick inside a link destination, say), which would hide a
// live tag inside a "code span". So the strip RENDERS its own output with markdown-it and counts
// what is still live. Anything left means the code-span pass was fooled, and the strip runs again
// with inline spans read as live text; if even that leaves something, it runs over fences too. The
// fallbacks over-strip (a code sample loses an `onclick=`), which is the safe direction here.

const URL_ATTRS = /^(?:href|xlink:href|src|action|formaction|data|values|to|from)$/i;
const FRAME_TAGS = /^(?:iframe|frame|object|embed)$/i;
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;
// CommonMark's inline HTML tag and autolink, as markdown-it reads them (markdown-it/lib/common/html_re).
const HTML_INLINE = (() => {
  const name = '[a-zA-Z_:][a-zA-Z0-9:._-]*';
  const value = '(?:[^"\'=<>`\\x00-\\x20]+|\'[^\']*\'|"[^"]*")';
  const open = `<[A-Za-z][A-Za-z0-9\\-]*(?:\\s+${name}(?:\\s*=\\s*${value})?)*\\s*\\/?>`;
  return new RegExp(`^(?:${open}|<\\/[A-Za-z][A-Za-z0-9\\-]*\\s*>|<!---?>|<!--(?:[^-]|-[^-]|--[^>])*-->|<[?][\\s\\S]*?[?]>|<![A-Za-z][^>]*>|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>)`);
})();
// biome-ignore lint/suspicious/noControlCharactersInRegex: CommonMark's autolink excludes them, so must we.
const AUTOLINK = /^<[a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^<>\x00-\x20]*>/;
const ESCAPABLE = /[!-/:-@[-`{-~]/;

/** An attribute value as the browser reads it: entities decoded, quotes off, control and space gone. */
function attrValue(raw) {
  let v = String(raw || '').replace(/^(["'])([\s\S]*)\1$/, '$2');
  // Past U+10FFFF the browser reads U+FFFD; `fromCodePoint` would throw and fail the export.
  const cp = (n) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '\ufffd');
  v = v.replace(/&#x([0-9a-f]+);?/gi, (_, h) => cp(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => cp(Number(d)))
    .replace(/&colon;/gi, ':').replace(/&tab;|&newline;/gi, '');
  // The URL parser drops leading C0 controls and spaces, and every tab and newline inside.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the URL parser strips them, so must we.
  return v.replace(/[\x00-\x20]/g, '').toLowerCase();
}

/** Is this attribute one that runs code? Returns the count kind, or null. */
function liveAttr(tag, name, raw) {
  const n = name.toLowerCase();
  if (raw == null) return null;
  if (/^on[a-z]+$/.test(n)) return 'handlers';
  if (n === 'srcdoc') return 'urls';
  if (!URL_ATTRS.test(n)) return null;
  const v = attrValue(raw);
  // Every scheme that can carry script: `javascript:`, `vbscript:` (legacy, still refused here),
  // and a `data:` document. A `data:` IMAGE runs nothing in an `<img>` or a link, so it stays; in a
  // frame an SVG image is a document that can run its own script, so only a raster image stays.
  if (v.startsWith('javascript:') || v.startsWith('vbscript:')) return 'urls';
  if (v.startsWith('data:')) {
    const image = FRAME_TAGS.test(tag) ? /^data:image\/(?!svg)/.test(v) : /^data:image\//.test(v);
    if (!image) return 'urls';
  }
  return null;
}

// Elements whose body the browser reads as text, not markup, up to their own closing tag — in HTML.
// Inside SVG or MathML they are NOT raw text: in `<svg><style><img src=x onerror=…>` the `<img>`
// breaks out of the SVG as a live HTML element (measured in Chromium; found by rendering every
// red-team input through real marp-core). So the scan skips their bodies only outside foreign
// content, and reads them as markup inside it. A script's body is skipped everywhere: the strip
// removes the whole element, and a handler inside it goes with it.
const RAW_ELEMENTS = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript']);
const lowerAscii = (str) => str.replace(/[A-Z]/g, (c) => c.toLowerCase()); // keeps every index

/**
 * The tags in `mask`, read in ONE forward pass the way the browser's tokenizer reads them: a tag
 * ends at the first `>` outside a quoted value, a raw-text element's body is skipped to its own
 * closing tag (found in `text`), and a tag still open at the end of the input ends the scan. One
 * pass is the point: the regexes this replaced rescanned to the end of the input from every `<`,
 * which a deck of `<a b<a b…` turned into minutes of export (the checker measured 8.6 s at
 * 128 KB). `comments` skips `<!-- … -->` (a rendered page); the deck's markdown leaves it off,
 * because Marp renders a `<!-- footer: … -->` directive as markdown.
 * @returns {Generator<{ from: number, to: number, name: string, attrs: string, attrsAt: number, closeTo: number | null }>}
 */
function* scanTags(text, mask, { comments = false } = {}) {
  const lower = lowerAscii(mask);
  const lowerText = text === mask ? lower : lowerAscii(text);
  const n = mask.length;
  let i = 0;
  let foreign = 0; // open <svg> / <math> elements: inside them no element but a script is raw text
  while (i < n) {
    const lt = mask.indexOf('<', i);
    if (lt < 0) return;
    if (lower.startsWith('</svg', lt) || lower.startsWith('</math', lt)) foreign = Math.max(0, foreign - 1);
    if (comments && lower.startsWith('<!--', lt)) {
      const end = lower.indexOf('-->', lt + 4);
      if (end < 0) return;
      i = end + 3;
      continue;
    }
    const c0 = lower.charCodeAt(lt + 1);
    if (!(c0 >= 97 && c0 <= 122)) {
      i = lt + 1;
      continue;
    }
    let j = lt + 1;
    if (comments) {
      // A rendered page: the browser's tag-name rule (anything up to whitespace, `/` or `>`).
      while (j < n && !/[\s/>]/.test(mask[j])) j++;
    } else {
      // The deck's markdown: markdown-it's rule, so `<scr<script>` is the text `<scr` and then a
      // real `<script>` tag, as markdown-it renders it, and not one tag named `scr<script`.
      while (j < n && /[a-z0-9-]/.test(lower[j])) j++;
      if (j < n && !/[\s/>]/.test(mask[j])) {
        i = lt + 1;
        continue;
      }
    }
    const name = lower.slice(lt + 1, j);
    let k = j;
    let quote = '';
    let afterEq = false;
    for (; k < n; k++) {
      const c = mask[k];
      if (quote) {
        if (c === quote) quote = '';
        continue;
      }
      if (c === '>') break;
      if (c === '=') afterEq = true;
      else if (afterEq && (c === '"' || c === "'")) {
        quote = c;
        afterEq = false;
      } else if (!/\s/.test(c)) afterEq = false;
    }
    if (k >= n) return; // a tag still open at the end: the browser drops it and the rest with it
    const tag = { from: lt, to: k + 1, name, attrs: mask.slice(j, k), attrsAt: j, closeTo: null };
    i = k + 1;
    if ((name === 'svg' || name === 'math') && mask[k - 1] !== '/') foreign++;
    if (RAW_ELEMENTS.has(name) && (foreign === 0 || name === 'script')) {
      const close = lowerText.indexOf(`</${name}`, i);
      if (close >= 0) {
        const gt = text.indexOf('>', close);
        tag.closeTo = gt < 0 ? n : gt + 1;
        i = tag.closeTo;
      } else if (comments) {
        // A rendered page: the rest of the document is this element's text.
        yield tag;
        return;
      }
    }
    yield tag;
  }
}

/**
 * Every live span in `text`, found by reading `mask` (same length; characters that are not live
 * are blanked). A running script is one span from its opening tag to its closing one; every other
 * live attribute is its own span.
 * @returns {{ spans: { from: number, to: number, kind: 'scripts'|'handlers'|'urls' }[], scripts: number[][] }}
 */
function liveSpans(text, mask, { redirects = false, comments = false } = {}) {
  const spans = [];
  const scripts = [];
  const engineMark = new RegExp(`(?:^|\\s)${ENGINE_SCRIPT_ATTR}(?:[\\s=]|$)`, 'i');
  for (const t of scanTags(text, mask, { comments })) {
    if (t.name === 'script' && !engineMark.test(t.attrs) && runs(t.attrs)) {
      // Unclosed: drop the opening tag alone, so what follows shows as text rather than running.
      const to = t.closeTo ?? t.to;
      scripts.push([t.from, to]);
      spans.push({ from: t.from, to, kind: 'scripts' });
    }
    // The strip also drops a `<base href>` (it would re-point the bundle's relative runtime
    // `<script src>` tags at another host) and a `<meta http-equiv=refresh>` (it navigates the
    // render away). Counted as URLs. The warning's count leaves them out: they run nothing.
    if (redirects && (t.name === 'base' || (t.name === 'meta' && /\bhttp-equiv\s*=\s*["']?\s*refresh/i.test(t.attrs)))) {
      spans.push({ from: t.from, to: t.to, kind: 'urls' });
    }
    for (const a of t.attrs.matchAll(ATTR)) {
      const kind = liveAttr(t.name, a[1], a[2]);
      if (!kind) continue;
      const from = t.attrsAt + a.index;
      spans.push({ from, to: from + a[0].length, kind });
    }
  }
  return { spans, scripts };
}

/** Count every span; strip the ones a removed script does not already contain. */
function tally(spans) {
  const counts = { scripts: 0, handlers: 0, urls: 0 };
  for (const s of spans) counts[s.kind]++;
  return counts;
}

function blankRange(chars, from, to) {
  for (let i = from; i < to; i++) if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
}

/**
 * The deck with its code blanked, for the scan. `inline` says whether inline code spans are
 * blanked too (the first pass) or read as live text (the fallback); `fences: false` reads fenced
 * and indented code as live as well (the last resort).
 */
function maskMarkdown(src, { inline = true, fences = true } = {}) {
  const chars = src.split('');
  const lineStart = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineStart.push(i + 1);
  const at = (line) => (line < lineStart.length ? lineStart[line] : src.length);
  const htmlLines = new Set();
  const tokens = new MarkdownIt({ html: true }).parse(src, {});
  for (const t of tokens) {
    if (!t.map) continue;
    if (fences && (t.type === 'fence' || t.type === 'code_block')) blankRange(chars, at(t.map[0]), at(t.map[1]));
    if (t.type === 'html_block') for (let l = t.map[0]; l < t.map[1]; l++) htmlLines.add(l);
  }
  if (!inline) return chars.join('');
  // Inline code spans, outside raw HTML blocks (where a backtick is just a character the browser
  // sees inside live HTML). Left to right, the way markdown-it's inline rules take turns: an
  // escape, an autolink or an inline HTML tag that starts first wins over a backtick inside it.
  let line = 0;
  for (let i = 0; i < src.length;) {
    while (line + 1 < lineStart.length && lineStart[line + 1] <= i) line++;
    const c = chars[i];
    if (htmlLines.has(line) || c === ' ') { i++; continue; }
    if (c === '\\' && ESCAPABLE.test(src[i + 1] || '')) { i += 2; continue; }
    if (c === '<') {
      const rest = src.slice(i, i + 4096);
      const m = AUTOLINK.exec(rest) || HTML_INLINE.exec(rest);
      if (m) { i += m[0].length; continue; }
    }
    if (c === '`') {
      let n = 1;
      while (src[i + n] === '`') n++;
      // The closing run: the same length exactly, before a blank line ends the paragraph.
      const re = new RegExp(`(?<!\`)\`{${n}}(?!\`)|\\n[ \\t]*\\n`, 'g');
      re.lastIndex = i + n;
      const close = re.exec(src);
      if (close && close[0][0] === '`') {
        blankRange(chars, i, close.index + n);
        i = close.index + n;
      } else {
        i += n;
      }
      continue;
    }
    i++;
  }
  return chars.join('');
}

/** What markdown-it would hand the browser for this deck, counted the way the warning counts. */
function liveAfterRender(markdown) {
  const html = new MarkdownIt({ html: true }).render(markdown);
  return liveSpans(html, html, { redirects: true, comments: true }).spans.length;
}

function applyStrip(src, mask) {
  const { spans, scripts } = liveSpans(src, mask, { redirects: true });
  const inScript = (s) => s.kind !== 'scripts' && scripts.some(([a, b]) => s.from >= a && s.to <= b);
  const kept = spans.filter((s) => !inScript(s));
  const outer = kept.filter((s) => !kept.some((o) => o !== s && o.from <= s.from && o.to >= s.to && (o.to - o.from) > (s.to - s.from)));
  // Overlapping spans (a `<script>` inside a `srcdoc` value) merge into one cut, so the outer
  // span goes whole rather than leaving the inner one's surroundings behind.
  const merged = [];
  for (const s of [...kept].sort((a, b) => a.from - b.from)) {
    const prev = merged[merged.length - 1];
    if (prev && s.from < prev.to) prev.to = Math.max(prev.to, s.to);
    else merged.push({ from: s.from, to: s.to });
  }
  let out = '';
  let at = 0;
  for (const m of merged) { out += src.slice(at, m.from); at = m.to; }
  out += src.slice(at);
  return { markdown: out, removed: tally(outer) };
}

/**
 * The deck's markdown without its own executable HTML (see the block comment above).
 * @param {string} markdown
 * @returns {{ markdown: string, removed: { scripts: number, handlers: number, urls: number } }}
 */
function withoutLiveAuthorHtml(markdown) {
  const src = String(markdown ?? '');
  // Cheap exit: nothing tag-shaped that could run, nothing to parse.
  if (!/<script|<base|http-equiv|on[a-z]+\s*=|srcdoc|javascript|data:|&#/i.test(src)) {
    return { markdown: src, removed: { scripts: 0, handlers: 0, urls: 0 } };
  }
  // TO A FIXED POINT, one pass kind at a time. Cutting a span joins the text on either side of it,
  // and the join can be live HTML of its own: `<scr<script>x</script>ipt>` leaves `<script>` (the
  // checker's case). So each pass kind repeats on its own output until a round changes nothing or
  // nothing is live, and only then does the strip fall back to the next, coarser kind: inline code
  // read as live, then fences read as live. A join is undone by one more ordinary round, so it
  // never costs a code sample.
  const removed = { scripts: 0, handlers: 0, urls: 0 };
  let out = src;
  const masks = [(t) => maskMarkdown(t), (t) => maskMarkdown(t, { inline: false }), (t) => t];
  for (let kind = 0; kind < masks.length; kind++) {
    // The first round of the first kind runs whatever the render check says: plain markdown-it reads
    // a Marp directive comment (`<!-- footer: <img onerror=…> -->`) as a comment, while Marp renders
    // it as markdown.
    for (let round = 0; round < 8 && ((kind === 0 && round === 0) || liveAfterRender(out)); round++) {
      const r = applyStrip(out, masks[kind](out));
      for (const k of Object.keys(removed)) removed[k] += r.removed[k];
      if (r.markdown === out) break;
      out = r.markdown;
    }
    if (!liveAfterRender(out)) break;
  }
  // THE LAST RESORT, for a deck built to defeat the scan: every `<` becomes `&lt;`, so the deck's
  // HTML shows as text and nothing of it runs. Only a deck that still renders live HTML after
  // every pass above gets here; no shipped deck does.
  if (liveAfterRender(out)) return { markdown: out.replace(/</g, '&lt;'), removed, escaped: true };
  return { markdown: out, removed };
}

module.exports = { countLiveAuthorHtml, formatLiveAuthorHtmlWarning, withoutLiveAuthorHtml, _internal: { HTML_INLINE } };
