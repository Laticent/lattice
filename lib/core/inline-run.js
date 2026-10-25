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

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
/**
 * What the tokenizer must not read as markup, found in one left-to-right pass so a `<!--` inside a
 * tag's attribute value is not mistaken for a comment: a tag (kept), a `<script>` or `<style>` element
 * (its CONTENT is blanked: `if (a<b)` is not a tag), and an HTML comment, which follows the HTML
 * rules: `<!-->` and `<!--->` are complete and empty, and an unterminated `<!--` runs to the end.
 */
const MASK_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<[a-zA-Z/][^>]*>|<!--(?:>|->|[\s\S]*?(?:-->|$))/gi;

/**
 * The string with every comment and every script or style body overwritten by spaces, so none of it is
 * read as markup. Same length, so an offset found in the masked copy is valid in the original.
 * `comments` lists the comment ranges, because a comment is not content in the DOM substrate (it is a
 * node of its own, blank) and the string substrate keeps it a node of its own too.
 * @returns {{masked: string, comments: Array<[number, number]>}}
 */
function maskNonMarkup(html) {
  const comments = [];
  const masked = html.replace(MASK_RE, (m, rawTag, offset) => {
    if (m.startsWith('<!--')) {
      comments.push([offset, offset + m.length]);
      return ' '.repeat(m.length);
    }
    if (rawTag) {
      const open = m.indexOf('>') + 1;
      const close = m.lastIndexOf('<');
      return m.slice(0, open) + ' '.repeat(close - open) + m.slice(close);
    }
    return m;
  });
  return { masked, comments };
}

/** The slots every component has: a trailing inline `code` or pill is metadata, never label. */
const DEFAULT_SLOTS = ['code', '.lat-pill'];
const withDefaults = (slots) => [...DEFAULT_SLOTS, ...(slots || [])];

/**
 * A matcher over `(tagName, attrs)` for the manifest's slot list: a bare word is a tag name, a
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

/** Is `attrs` (the inside of an open tag) carrying this class token? */
function hasClass(attrs, token) {
  const m = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(` ${attrs}`);
  return !!m && (m[1] ?? m[2]).split(/\s+/).includes(token);
}

/**
 * The leading inline run of the list item whose content starts at `start` in `html`, as top-level
 * node descriptors with their source offsets. Stops at the first top-level block tag or the item's
 * own `</li>`.
 */
function scanRun(source, start, isSlot) {
  const { masked: html, comments } = maskNonMarkup(source);
  const nodes = [];
  TAG_RE.lastIndex = start;
  let depth = 0;
  let cursor = start;
  let elStart = -1;
  let elTag = '';
  let elAttrs = '';
  let end = html.length;
  let m = TAG_RE.exec(html);
  // Text between two points, split at every comment: a comment is a node of its own and blank, as it is
  // in the DOM, so a comment at the edge of a run is trimmed off and not wrapped.
  const pushText = (to) => {
    let at = cursor;
    for (const [cs, ce] of comments) {
      if (ce <= at || cs >= to) continue;
      if (cs > at) nodes.push({ kind: 'text', blank: !source.slice(at, cs).trim(), start: at, end: cs });
      nodes.push({ kind: 'text', blank: true, start: Math.max(cs, at), end: Math.min(ce, to) });
      at = Math.min(ce, to);
    }
    if (to > at) nodes.push({ kind: 'text', blank: !source.slice(at, to).trim(), start: at, end: to });
  };
  while (m) {
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const at = m.index;
    if (depth === 0) {
      if (closing && (tag === 'li' || tag === 'ul' || tag === 'ol')) { pushText(at); end = at; cursor = at; break; }
      if (!closing && (BLOCK_TAGS.has(tag) || tag === 'li')) { pushText(at); end = at; cursor = at; break; }
      if (!closing) {
        pushText(at);
        if (VOID_TAGS.has(tag) || /\/\s*$/.test(m[3])) {
          nodes.push({ kind: 'el', slot: false, start: at, end: at + m[0].length });
          cursor = at + m[0].length;
        } else {
          depth = 1; elStart = at; elTag = tag; elAttrs = m[3]; cursor = at;
        }
      }
    } else if ((closing && (tag === 'li' || tag === 'ul' || tag === 'ol')) || (!closing && (BLOCK_TAGS.has(tag) || tag === 'li'))) {
      // An inline element that is still open where the item, the list or a block begins is unclosed:
      // drop it from the run (and everything after it) and stop, so the wrapper never crosses `</li>`.
      end = elStart;
      cursor = elStart;
      depth = 0;
      break;
    } else if (!closing && tag === elTag) {
      depth++;
    } else if (closing && tag === elTag) {
      depth--;
      if (depth === 0) {
        const slot = isSlot(elTag, elAttrs);
        nodes.push({ kind: 'el', slot, run: hasClass(elAttrs, RUN_CLASS), start: elStart, end: at + m[0].length });
        cursor = at + m[0].length;
      }
    }
    m = TAG_RE.exec(html);
  }
  if (!m) {
    if (depth > 0) cursor = elStart;
    else pushText(html.length);
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
  const { masked } = maskNonMarkup(html);
  TAG_RE.lastIndex = 0;
  let m = TAG_RE.exec(masked);
  while (m) {
    const tag = m[2].toLowerCase();
    if (tag === 'ul' || tag === 'ol') listDepth += m[1] === '/' ? -1 : 1;
    else if (tag === 'li' && m[1] !== '/' && depths.includes(listDepth)) {
      items.push(m.index + m[0].length);
    }
    m = TAG_RE.exec(masked);
  }
  let out = html;
  // Back to front, so an earlier offset is never moved by a later edit.
  for (let i = items.length - 1; i >= 0; i--) {
    const { nodes } = scanRun(out, items[i], isSlot);
    const pick = decideRun(nodes);
    if (!pick) continue;
    const a = nodes[pick.from].start;
    const b = nodes[pick.to].end;
    out = `${out.slice(0, a)}<span class="${RUN_CLASS}">${out.slice(a, b)}</span>${out.slice(b)}`;
  }
  return out;
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

module.exports = { RUN_CLASS, DEFAULT_SLOTS, decideRun, wrapHtml, wrapDom };
