/**
 * prose-code.js — mark a paragraph that is PROSE with inline code in it, so the selectors
 * that mean "a paragraph that is only a code span" stop matching it (#2308).
 *
 * THE DEFECT. Ninety-odd rules in the bundle recognize an eyebrow, a subtitle, a meta line or
 * a kicker by `p:has(> code:only-child)` (and `li:…:has(> code:only-child)`). `:only-child`
 * counts ELEMENT siblings only — text nodes are invisible to selectors — so it also matches an
 * ordinary sentence that happens to hold exactly one code span:
 *
 *     <p>The <code>background:</code> shorthand clears every longhand.</p>
 *
 * After a heading that sentence was re-typeset as a muted italic subtitle and its code chip
 * lost its pill. On a frame that paints its own panel the subtitle's canvas ink landed on the
 * panel: 1.65:1 on an indaco `topic` slide in the `--player` light toggle.
 *
 * CSS CANNOT SAY "the only CONTENT is a code span", so the fact is decided here and handed
 * to CSS as an attribute. The mark is NEGATIVE — it names the paragraph that is NOT code-only
 * — and every one of those rules gains `:not(:where([data-prose]))`, which adds no
 * specificity. That direction is deliberate: `dist/marp-kit/lattice.css` ships the same rules
 * to renderers that never run this kernel (a Marp for VS Code preview with scripts off), and
 * there the rule falls back to exactly today's behavior rather than dropping every real
 * eyebrow and subtitle on the floor. A positive mark would have fixed the engine and broken
 * the kit.
 *
 * THE PREDICATE is one line, shared by both adapters (HARD RULE #1): an element is prose
 * when it has a `code` child AND a text child carrying anything but whitespace. It is scoped
 * to exactly the population the selectors can mis-match — one code element and nothing
 * else of element kind — plus the harmless rest (two code spans and prose are marked too, and
 * no rule matches them either way).
 *
 * WHERE THE MARK LANDS. A paragraph gets it on its `<p>`. A TIGHT list item has no `<p>` —
 * markdown-it hides the paragraph and the inline content becomes the `<li>`'s own children —
 * so the mark goes on the `<li>`, which is the element the `li:…:has(> code:only-child)`
 * rules test. Pure & fs-free.
 */

const PROSE_ATTR = 'data-prose';

/** `parts`: the element's children as `{ code: boolean, text: string }`. */
function isProse(parts) {
  let code = false;
  let prose = false;
  for (const p of parts) {
    if (p.code) code = true;
    else if (/\S/.test(p.text || '')) prose = true;
  }
  return code && prose;
}

/**
 * markdown-it adapter — stamps the attribute on the token that renders the element: the
 * `paragraph_open`, or for a hidden (tight-list) paragraph the enclosing `list_item_open`.
 * Idempotent.
 */
function markTokens(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'inline' || !Array.isArray(t.children)) continue;
    const open = tokens[i - 1];
    if (!open || open.type !== 'paragraph_open') continue;
    // The same population the DOM adapter reads: text, soft breaks (a newline of text) and
    // code spans. Any other child renders an element, so `code:only-child` cannot match and
    // the paragraph is left exactly as it was.
    //
    // An HTML COMMENT is not an element either — the DOM has it as a comment node, which
    // `:only-child` ignores and the DOM adapter skips — so it reads as nothing here too. Treating
    // it as "another element" left `The \`x\` <!-- c --> y` unmarked on the engine and marked by
    // the runtime (the HARD RULE #25 checker's finding).
    const isComment = (c) => c.type === 'html_inline' && /^<!--[\s\S]*-->$/.test(c.content.trim());
    if (t.children.some((c) => !['text', 'softbreak', 'code_inline'].includes(c.type) && !isComment(c))) continue;
    const parts = t.children.map((c) => (c.type === 'code_inline'
      ? { code: true }
      : { code: false, text: c.type === 'text' ? c.content : '' }));
    if (!isProse(parts)) continue;
    let host = open;
    if (open.hidden) {
      host = null;
      for (let j = i - 2; j >= 0; j--) {
        if (tokens[j].type === 'list_item_open') { host = tokens[j]; break; }
        if (tokens[j].type !== 'paragraph_open') break;
      }
    }
    if (host && host.attrGet(PROSE_ATTR) === null) host.attrSet(PROSE_ATTR, '');
  }
}

/**
 * DOM adapter — the runtime mirror, for a document our markdown-it never touched (the Marp
 * kit). Reads each `<p>` and `<li>` whose element children are code spans, and nothing else.
 * Idempotent.
 */
function applyToDom(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  for (const el of root.querySelectorAll('section p, section li')) {
    if (el.hasAttribute(PROSE_ATTR)) continue;
    const parts = [];
    let other = false;
    for (const n of el.childNodes) {
      if (n.nodeType === 3) parts.push({ code: false, text: n.nodeValue });
      else if (n.nodeType === 1 && n.tagName === 'CODE') parts.push({ code: true });
      // A nested list is not the item's own content — the engine reads the item's inline
      // token alone, so it is skipped here rather than read as a foreign element (the
      // fidelity probe found the two paths disagreeing on exactly this item).
      else if (n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL')) continue;
      else if (n.nodeType === 1) { other = true; break; }
    }
    // Any other element child means `code:only-child` cannot match, so there is nothing to
    // correct and the element is left exactly as it was.
    if (!other && isProse(parts)) el.setAttribute(PROSE_ATTR, '');
  }
}

module.exports = { PROSE_ATTR, isProse, markTokens, applyToDom };
