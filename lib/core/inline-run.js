/**
 * INLINE RUN — keep a list item's label text and the inline objects inside it as ONE flex item.
 *
 * WHY. Several components lay their list items out with `display:flex` or `grid` (the step card's
 * title above its body, the card's marker beside its words). In a flex or grid container every
 * child of the container becomes its own item, and a run of text is wrapped in an anonymous one.
 * So `- Pilot in the EU `{LIVE}` and collect feedback` rendered as three items: "Pilot in the EU",
 * the pill stretched to the full row width, and "and collect feedback" stacked beneath it. A bold
 * span or an inline `code` did the same. Measured on the gallery source with a pill injected
 * mid-text into every list item: 69 flex or grid hosts split, across 16 components
 * (engineering/decisions/2026-10-20-inline-objects-audit.md).
 *
 * WHAT. For a list item at a depth a component declares (`inlineRun` in its manifest), the leading
 * run of inline content (everything before the item's first block child) is wrapped in one
 * `<span class="lat-run">` when it holds BOTH bare text and at least one element. A flex host then
 * sees one item for its label, exactly as it saw one anonymous item when the label was plain text,
 * so no layout rule changes.
 *
 * WHAT IT LEAVES ALONE.
 *   - A run of plain text, or of elements with no text between them: nothing to keep together.
 *   - A TRAILING pill or inline code. Components read it as a slot (`li > .lat-pill`: the checklist's
 *     status tag, `li > code`: the pricing price, the list-tabular value), so it stays a sibling.
 *   - Anything already wrapped (idempotent: the engine path and the runtime can both run).
 *
 * TWO SUBSTRATES, ONE DECISION (pinned by a seeded differential fuzz in test/unit/core/inline-run.test.js). `decideRun` is the whole rule, over a list of node descriptors, and
 * both `wrapHtml` (the engine's string path) and `wrapDom` (the runtime's live DOM) call it, so they
 * cannot disagree (HARD RULE #1). Pure: no fs, no markdown-it; safe for the browser bundle.
 */

const RUN_CLASS = 'lat-run';

/** Block-level tags: the first one ends a list item's leading inline run. */
const BLOCK_TAGS = new Set([
  'ul', 'ol', 'p', 'div', 'table', 'blockquote', 'pre', 'figure', 'hr', 'dl',
  'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
]);
const VOID_TAGS = new Set(['br', 'img', 'hr', 'wbr', 'input']);

/**
 * THE RULE. `nodes` describes the item's leading inline run, in order, as
 * `{ kind: 'text', blank: boolean }` or `{ kind: 'el', slot: boolean }` (`slot` = a pill or `code`).
 * @returns {{from:number, to:number}|null} the inclusive node range to wrap, or null to leave alone.
 */
function decideRun(nodes) {
  let end = nodes.length - 1;
  while (end >= 0 && nodes[end].kind === 'text' && nodes[end].blank) end--;
  // Several trailing slots peel in turn: `$52 / mo` then `Most popular`.
  while (end >= 0 && nodes[end].kind === 'el' && nodes[end].slot) {
    end--;
    while (end >= 0 && nodes[end].kind === 'text' && nodes[end].blank) end--;
  }
  if (end < 0) return null;
  let from = 0;
  while (from <= end && nodes[from].kind === 'text' && nodes[from].blank) from++;
  // An item that starts with a slot is already in the component's own title-and-body form.
  if (from <= end && nodes[from].kind === 'el' && nodes[from].slot) return null;
  let hasText = false;
  let hasEl = false;
  for (let i = from; i <= end; i++) {
    if (nodes[i].kind === 'el') hasEl = true;
    else if (!nodes[i].blank) hasText = true;
  }
  if (!hasText || !hasEl) return null;
  // Already wrapped: the first node is the wrapper, so there is nothing to do.
  if (from <= end && nodes[from].kind === 'el' && nodes[from].run) return null;
  return { from, to: end };
}

// ── The string substrate ────────────────────────────────────────────────────────────────────

const WS = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r';
const LETTER = /[a-zA-Z]/;
/** Elements whose content the HTML tokenizer reads as text: `if (a<b)` in a script is not a tag. */
// `noscript` too: the page this HTML lands in parses with scripting on, where its body is text.
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript']);
/**
 * SVG and MathML change both rules above: inside them `<title>` and `<style>` are ordinary elements,
 * and `<x/>` closes itself. The tree builder decides that, so the tokenizer keeps the small part of
 * its state that matters: the stack of elements open inside foreign content, which of them are HTML
 * integration points (their children parse as HTML again), and the HTML tags that break out of
 * foreign content altogether.
 */
const FOREIGN_ROOTS = new Set(['svg', 'math']);
const HTML_INTEGRATION = new Set(['foreignobject', 'desc', 'title', 'mi', 'mo', 'mn', 'ms', 'mtext']);
const BREAKOUT = new Set([
  'b', 'big', 'blockquote', 'body', 'br', 'center', 'code', 'dd', 'div', 'dl', 'dt', 'em', 'embed', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'head', 'hr', 'i', 'img', 'li', 'listing', 'menu', 'meta', 'nobr', 'ol', 'p', 'pre',
  'ruby', 's', 'small', 'span', 'strong', 'strike', 'sub', 'sup', 'table', 'tt', 'u', 'ul', 'var',
]);

/**
 * Read one tag that starts at `at` (`<a` or `</a`), the way the HTML tokenizer reads it: a quoted
 * attribute value is one piece, so a `>` or `<` inside `title="a>b"` does not end the tag. An unquoted
 * value runs to whitespace or `>`. A plain regex that stops at the first `>` ended `<li title="a><img
 * onerror=…>">` early and turned the attribute's text into markup (followups.d 2853-p1); so does any
 * regex that is not this state machine, which is why this is a loop and not a pattern.
 * @returns {{index:number, end:number, closing:boolean, name:string, attrs:Map<string,string>,
 *   selfClosing:boolean}|null} null when the input ends inside the tag (the DOM drops such a tag).
 */
function readTag(html, at) {
  const n = html.length;
  let i = at + 1;
  const closing = html[i] === '/';
  if (closing) i++;
  const nameStart = i;
  while (i < n && !WS(html[i]) && html[i] !== '/' && html[i] !== '>') i++;
  const name = html.slice(nameStart, i).toLowerCase();
  const attrs = new Map();
  let selfClosing = false;
  for (;;) {
    while (i < n && (WS(html[i]) || html[i] === '/')) {
      if (html[i] === '/' && html[i + 1] === '>') selfClosing = true;
      i++;
    }
    if (i >= n) return null;
    if (html[i] === '>') return { index: at, end: i + 1, closing, name, attrs, selfClosing };
    const nameAt = i++;
    while (i < n && !WS(html[i]) && html[i] !== '/' && html[i] !== '>' && html[i] !== '=') i++;
    const attr = html.slice(nameAt, i).toLowerCase();
    while (i < n && WS(html[i])) i++;
    let value = '';
    if (html[i] === '=') {
      i++;
      while (i < n && WS(html[i])) i++;
      const q = html[i];
      if (q === '"' || q === "'") {
        const close = html.indexOf(q, i + 1);
        if (close < 0) return null;
        value = html.slice(i + 1, close);
        i = close + 1;
      } else {
        const valueAt = i;
        while (i < n && !WS(html[i]) && html[i] !== '>') i++;
        value = html.slice(valueAt, i);
      }
    }
    // A repeated attribute is ignored, as the HTML parser ignores it.
    if (!attrs.has(attr)) attrs.set(attr, value);
  }
}

const DELIM = (c) => c === undefined || WS(c) || c === '/' || c === '>';
const startsTag = (html, i, name) => html.substr(i, name.length).toLowerCase() === name && DELIM(html[i + name.length]);

/**
 * Where a `<script>` body ends: the `</script` that the HTML tokenizer's script states accept. A body
 * that opens `<!--` and then `<script` is "double escaped", and a `</script>` inside it does NOT end
 * the element, so a plain search for the next `</script` would end it too early.
 * @returns {number} the offset of the closing `</script`, or -1 when the body runs to the end
 */
function scriptEnd(html, from) {
  let state = 0; // 0 data, 1 escaped, 2 double escaped
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (c === '-' && state > 0 && html.startsWith('-->', i)) { state = 0; i += 2; continue; }
    if (c !== '<') continue;
    if (state === 0 && html.startsWith('<!--', i)) { state = 1; i += 3; continue; }
    if (html[i + 1] === '/' && startsTag(html, i + 2, 'script')) {
      if (state < 2) return i;
      state = 1;
    } else if (state === 1 && startsTag(html, i + 1, 'script')) state = 2;
  }
  return -1;
}

const COMMENT_END = /--!?>/g;

/**
 * Every tag in `html`, in one left-to-right pass, plus the ranges that are not content: comments,
 * bogus comments (`<!x>`, `<?x>`, `</ x>`), CDATA in SVG or MathML, and a tag the input ends inside.
 * The comment rules are the HTML ones: `<!-->` and `<!--->` are complete and empty, `-->` or `--!>`
 * ends one, and an unterminated `<!--` runs to the end. A `<!--` inside an attribute value is part of
 * the tag, not a comment, and the body of a `<script>` or `<style>` (every RAW_TEXT element, read in
 * HTML) yields no tags. Linear: every search moves forward and none is repeated.
 * @returns {{tags: Array<ReturnType<typeof readTag>>, comments: Array<[number, number]>}}
 */
function tokenize(html) {
  const tags = [];
  const comments = [];
  const n = html.length;
  const foreign = []; // elements open inside <svg> or <math>, innermost last
  let i = html.indexOf('<');
  while (i >= 0) {
    const c = html[i + 1];
    const top = foreign[foreign.length - 1];
    if (html.startsWith('<!--', i)) {
      let end;
      if (html[i + 4] === '>') end = i + 5;
      else if (html.startsWith('->', i + 4)) end = i + 6;
      else {
        COMMENT_END.lastIndex = i + 4;
        const m = COMMENT_END.exec(html);
        end = m ? m.index + m[0].length : n;
      }
      comments.push([i, end]);
      i = html.indexOf('<', end);
    } else if ((c !== undefined && LETTER.test(c)) || (c === '/' && LETTER.test(html[i + 2] || ''))) {
      const tag = readTag(html, i);
      if (!tag) { comments.push([i, n]); break; }
      // Is this tag read in HTML or in foreign content? Foreign unless the stack is empty or its top is
      // an integration point; an HTML breakout tag in foreign content closes all of it.
      let ctx = top;
      if (ctx && !ctx.html && !tag.closing && BREAKOUT.has(tag.name)) { foreign.length = 0; ctx = undefined; }
      const inHtml = !ctx || ctx.html;
      // `/>` closes an element only in foreign content (an `<svg/>` is itself foreign); `<b/>` opens a <b>.
      tag.selfClosing = tag.selfClosing && (!inHtml || FOREIGN_ROOTS.has(tag.name));
      tags.push(tag);
      if (tag.closing) {
        for (let k = foreign.length - 1; k >= 0; k--) {
          if (foreign[k].name === tag.name) { foreign.length = k; break; }
        }
      } else if (!tag.selfClosing && !(inHtml && VOID_TAGS.has(tag.name)) && (ctx || FOREIGN_ROOTS.has(tag.name))) {
        // A child of a foreign element is foreign, and parses as HTML only when it is an integration point.
        const isForeign = FOREIGN_ROOTS.has(tag.name) || !inHtml;
        foreign.push({ name: tag.name, html: isForeign ? !inHtml && !FOREIGN_ROOTS.has(tag.name) && HTML_INTEGRATION.has(tag.name) : true });
      }
      let next = tag.end;
      if (!tag.closing && inHtml) {
        if (tag.name === 'plaintext') break; // everything after it is text, for good
        if (tag.name === 'script') {
          next = scriptEnd(html, tag.end);
          if (next < 0) break;
        } else if (RAW_TEXT.has(tag.name)) {
          const close = new RegExp(`</${tag.name}[\\t\\n\\f\\r />]`, 'ig');
          close.lastIndex = tag.end;
          const m = close.exec(html);
          if (!m) break;
          next = m.index;
        }
      }
      i = html.indexOf('<', next);
    } else if (c === '!' && top && !top.html && html.startsWith('<![CDATA[', i)) {
      const close = html.indexOf(']]>', i + 9);
      const end = close < 0 ? n : close + 3;
      comments.push([i, end]);
      i = html.indexOf('<', end);
    } else if (c === '!' || c === '?' || (c === '/' && i + 2 < n)) {
      // A bogus comment runs to the next `>`, or to the end; `</>` is dropped the same way.
      const gt = html.indexOf('>', i + 2);
      const end = gt < 0 ? n : gt + 1;
      comments.push([i, end]);
      i = html.indexOf('<', end);
    } else {
      i = html.indexOf('<', i + 1);
    }
  }
  return { tags, comments };
}

/** The slots every component has: a trailing inline `code` or pill is metadata, never label. */
const DEFAULT_SLOTS = ['code', '.lat-pill'];
const withDefaults = (slots) => [...DEFAULT_SLOTS, ...(slots || [])];

/**
 * A matcher over `(tagName, attrs)` (attrs: the tag's attribute map) for the manifest's slot list: a bare word is a tag name, a
 * leading dot a class token. Used by the string substrate; the DOM substrate asks the element.
 * @param {string[]|undefined} slots
 */
function slotMatcher(slots) {
  const tags = new Set();
  const classes = [];
  for (const s of withDefaults(slots)) {
    if (s.startsWith('.')) classes.push(s.slice(1));
    else tags.add(s.toLowerCase());
  }
  return (tag, attrs) => tags.has(tag) || classes.some((c) => hasClass(attrs, c));
}

/** Is this tag's attribute map carrying this class token? */
function hasClass(attrs, token) {
  return attrs.get('class')?.split(/[\t\n\f\r ]+/).includes(token) === true;
}

/** The index of the first entry whose `key` is at least `min`, in a list sorted by that key. */
function firstAtOrAfter(list, key, min) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (key(list[mid]) < min) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The leading inline run of the list item whose content starts at `start` in `source`, as top-level
 * node descriptors with their source offsets. Stops at the first top-level block tag or the item's
 * own `</li>`. `tokens` is `tokenize(source)`, read once per call of wrapHtml.
 */
function scanRun(source, { tags, comments }, start, isSlot) {
  const nodes = [];
  let depth = 0;
  let cursor = start;
  let elStart = -1;
  let elTag = '';
  let elAttrs = null;
  let end = source.length;
  let stopped = false;
  // Text between two points, split at every comment: a comment is a node of its own and blank, as it is
  // in the DOM, so a comment at the edge of a run is trimmed off and not wrapped.
  const pushText = (to) => {
    let at = cursor;
    for (let k = firstAtOrAfter(comments, (c) => c[1], at + 1); k < comments.length && comments[k][0] < to; k++) {
      const [cs, ce] = comments[k];
      if (ce <= at) continue;
      if (cs > at) nodes.push({ kind: 'text', blank: !source.slice(at, cs).trim(), start: at, end: cs });
      nodes.push({ kind: 'text', blank: true, start: Math.max(cs, at), end: Math.min(ce, to) });
      at = Math.min(ce, to);
    }
    if (to > at) nodes.push({ kind: 'text', blank: !source.slice(at, to).trim(), start: at, end: to });
  };
  for (let k = firstAtOrAfter(tags, (t) => t.index, start); k < tags.length; k++) {
    const t = tags[k];
    const { closing, name: tag, index: at } = t;
    if (depth === 0) {
      if (closing && (tag === 'li' || tag === 'ul' || tag === 'ol')) { pushText(at); end = at; cursor = at; stopped = true; break; }
      if (!closing && (BLOCK_TAGS.has(tag) || tag === 'li')) { pushText(at); end = at; cursor = at; stopped = true; break; }
      if (!closing) {
        pushText(at);
        if (VOID_TAGS.has(tag) || t.selfClosing) {
          nodes.push({ kind: 'el', slot: false, start: at, end: t.end });
          cursor = t.end;
        } else {
          depth = 1; elStart = at; elTag = tag; elAttrs = t.attrs; cursor = at;
        }
      }
    } else if ((closing && (tag === 'li' || tag === 'ul' || tag === 'ol')) || (!closing && (BLOCK_TAGS.has(tag) || tag === 'li'))) {
      // An inline element that is still open where the item, the list or a block begins is unclosed:
      // drop it from the run (and everything after it) and stop, so the wrapper never crosses `</li>`.
      end = elStart;
      cursor = elStart;
      depth = 0;
      stopped = true;
      break;
    } else if (!closing && tag === elTag) {
      depth++;
    } else if (closing && tag === elTag) {
      depth--;
      if (depth === 0) {
        const slot = isSlot(elTag, elAttrs);
        nodes.push({ kind: 'el', slot, run: hasClass(elAttrs, RUN_CLASS), start: elStart, end: t.end });
        cursor = t.end;
      }
    }
  }
  if (!stopped) {
    if (depth > 0) cursor = elStart;
    else pushText(source.length);
  }
  return { nodes, end };
}

/**
 * Wrap the leading inline run of every list item at one of `depths` (1 = an item of the section's
 * outermost list) in `<span class="lat-run">`. String in, string out.
 * @param {string} html one section's inner HTML (or a whole deck: depth counts from the nearest list)
 * @param {number[]} depths
 * @param {string[]} [slots] tag names (`code`) and class tokens (`.lat-pill`) the component reads as structure
 */
function wrapHtml(html, depths, slots) {
  const isSlot = slotMatcher(slots);
  if (typeof html !== 'string' || !depths || !depths.length || !/<li\b/i.test(html)) return html;
  const items = [];
  let listDepth = 0;
  const tokens = tokenize(html);
  for (const t of tokens.tags) {
    if (t.name === 'ul' || t.name === 'ol') listDepth += t.closing ? -1 : 1;
    else if (t.name === 'li' && !t.closing && depths.includes(listDepth)) items.push(t.end);
  }
  // Every decision is made on the ORIGINAL string, tokenized once: a run stops at the next `<li>`,
  // `</li>`, list or block tag, so no run reaches a span another item's wrap inserts, and the spans,
  // in document order and disjoint, go in with one join. Linear in the input, where tokenizing the
  // whole string again for every item was quadratic.
  const spans = [];
  for (const at of items) {
    const { nodes } = scanRun(html, tokens, at, isSlot);
    const pick = decideRun(nodes);
    if (pick) spans.push([nodes[pick.from].start, nodes[pick.to].end]);
  }
  if (!spans.length) return html;
  const parts = [];
  let from = 0;
  for (const [a, b] of spans) {
    parts.push(html.slice(from, a), `<span class="${RUN_CLASS}">`, html.slice(a, b), '</span>');
    from = b;
  }
  parts.push(html.slice(from));
  return parts.join('');
}

// ── The DOM substrate ───────────────────────────────────────────────────────────────────────

/** How many `ul` / `ol` sit between `li` and `section` (1 = an item of the outermost list). */
function listDepthOf(li, section) {
  let n = 0;
  for (let a = li.parentElement; a && a !== section; a = a.parentElement) {
    if (a.tagName === 'UL' || a.tagName === 'OL') n++;
  }
  return n;
}

/**
 * The live-DOM twin of `wrapHtml`: wraps each qualifying item's leading run in place.
 * @param {Element} section
 * @param {number[]} depths
 * @param {string[]} [slots]
 */
function wrapDom(section, depths, slots) {
  if (!section || typeof section.querySelectorAll !== 'function' || !depths || !depths.length) return;
  const doc = section.ownerDocument;
  const tags = new Set();
  const classes = [];
  for (const sl of withDefaults(slots)) {
    if (sl.startsWith('.')) classes.push(sl.slice(1));
    else tags.add(sl.toLowerCase());
  }
  const slotEl = (n) => tags.has(n.tagName.toLowerCase()) || classes.some((c) => n.classList.contains(c));
  for (const li of section.querySelectorAll('li')) {
    if (!depths.includes(listDepthOf(li, section))) continue;
    const run = [];
    for (const n of li.childNodes) {
      if (n.nodeType === 1 && BLOCK_TAGS.has(n.tagName.toLowerCase())) break;
      if (n.nodeType === 3 || n.nodeType === 1 || n.nodeType === 8) run.push(n);
    }
    // A comment is not content: it reads as blank text, as it does in the masked string.
    const nodes = run.map((n) => (n.nodeType === 3 || n.nodeType === 8
      ? { kind: 'text', blank: n.nodeType === 8 || !n.nodeValue.trim() }
      : {
        kind: 'el',
        slot: slotEl(n),
        run: n.classList.contains(RUN_CLASS),
      }));
    const pick = decideRun(nodes);
    if (!pick) continue;
    const wrap = doc.createElement('span');
    wrap.className = RUN_CLASS;
    li.insertBefore(wrap, run[pick.from]);
    for (let i = pick.from; i <= pick.to; i++) wrap.appendChild(run[i]);
  }
}

module.exports = { RUN_CLASS, DEFAULT_SLOTS, decideRun, tokenize, wrapHtml, wrapDom };
