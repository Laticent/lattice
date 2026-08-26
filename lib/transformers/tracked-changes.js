/**
 * Tracked changes — make `<ins>` and `<del>` say where they start and stop.
 *
 * WHAT AUTHORS WRITE. Both tags are hand-authored: `redline.docs.md` documents
 * `<del>old wording</del> <ins>new wording</ins>` as the component's contract,
 * and Markdown has no insertion syntax, so raw HTML is the only way to write
 * one. They can appear on any slide, which is why this transform is not scoped
 * to a component.
 *
 * WHAT THE GAP IS, and what it is NOT. Where these are styled
 * (`redline.styles.css`) the distinction is carried by line-through vs underline
 * PLUS hue PLUS a tinted band — never by color alone — so WCAG 1.4.1 holds for a
 * reader who cannot perceive the hues, and it holds unstyled too, on the
 * browser's own defaults. The gap is not visual. It is that a listener hears the
 * old wording and the new wording run together as one sentence, with nothing
 * marking which is which, and so reads a clause that says the opposite of what
 * it means. Measured in Chromium's accessibility tree, `<ins>`/`<del>` DO expose
 * roles `insertion`/`deletion` — the semantics are there; what is missing is
 * text a reader announces without the role support being switched on.
 *
 * WHY A SIBLING SPAN, WHICH LOOKS LIKE THE CLUMSIER CHOICE. The obvious answer
 * is a CSS `::before`/`::after` pair on the elements themselves — no transform,
 * no DOM, and the pattern the accessibility literature recommends. It was built
 * that way first and it ships a VISIBLE DEFECT on any padded inline wash.
 * Chromium opens the inline box at the pseudo-element, so an `<ins>` whose text
 * wraps to the next line gets an EMPTY first fragment at the end of the previous
 * one — and an empty fragment still paints the element's background across its
 * horizontal padding. The result is a stray 2.7px colored sliver hanging off the
 * end of the line, and the continuation line loses the left inset that sliver
 * stole. Measured on the redline gallery: 28,135 changed pixels, and the sliver
 * is plainly visible at 4x. Every way of hiding the pseudo produces it
 * identically — absolute, fixed, zero-size, float, `content: '' / 'alt text'` —
 * because the cause is the fragment, not the hiding. `box-decoration-break:
 * clone` cuts it to 651px but is itself an 87,857px redesign of the wash.
 *
 * A SIBLING sits outside the element, carries no padding and no background, and
 * therefore has nothing to paint: measured at 0 changed pixels across the same
 * gallery, with the reading order coming out
 * `"A business that " → "deletion start" → "collects" → "deletion end" →
 *  "insertion start" → "collects, sells, or shares" → "insertion end"`.
 * That is the whole reason this is a transform and not four lines of CSS.
 *
 * UNVERIFIED: no screen reader is reachable from the build sandbox, so every
 * claim here is about Chromium's accessibility tree — what a reader consumes —
 * and not about any particular reader's spoken output (HARD RULE #23).
 *
 * `<s>` IS INCLUDED, BUT ONLY INSIDE redline. `<s>` means "no longer accurate",
 * which is not the same claim as "deleted", so labeling it a deletion is wrong
 * in general. redline is the one component that redefines it: its docs document
 * `~~text~~` as a tracked deletion and its CSS already styles `del` and `s`
 * identically. The label follows that promise exactly as far as it is made.
 *
 * Two render forms, one kernel:
 *   - applyToHtml (the engine render path + lattice-emulator.js via lib/engine)
 *   - applyToDom  (lattice-runtime.js — live DOM, marp-vscode preview)
 * Keep the string and DOM forms in sync.
 *
 * Idempotent: an element already carrying an edge span on the relevant side is
 * skipped, so the repeated passes a live preview triggers are a no-op.
 */

const { mapSections } = require('../core/section-walk');

/** The visually-hidden marker class; styled in lib/base/base.elements.css. */
const EDGE_CLASS = 'lat-change-edge';

/**
 * The words a listener hears. Deliberately plain, and deliberately a PAIR — a
 * tracked change can run for a whole clause, so the end boundary carries as
 * much as the start. The brackets are for anything that reads the text rather
 * than speaks it; screen readers skip them.
 */
const WORD = { INS: 'insertion', DEL: 'deletion', S: 'deletion' };
const startLabel = (word) => ` [${word} start] `;
const endLabel = (word) => ` [${word} end] `;

/** `<ins>` / `<del>`, attributes tolerated. `<s>` is added only inside redline. */
const GLOBAL_TAGS = 'ins|del';
const REDLINE_TAGS = 'ins|del|s';

const edgeRe = (tags) => new RegExp(`<(${tags})\\b([^>]*)>([\\s\\S]*?)</\\1>`, 'gi');

/** The edge span as an HTML STRING — the engine path, which has no document. */
const edgeHtml = (text) => `<span class="${EDGE_CLASS}">${text}</span>`;

/**
 * Wrap every tracked change in `html` with its two edge spans.
 *
 * The guard is `EDGE_CLASS` appearing immediately either side of the element,
 * not a flag on the element itself: the spans are what a second pass would
 * duplicate, so they are what it checks for.
 */
function wrapEdges(html, tags) {
  return html.replace(edgeRe(tags), (whole, tag, _attrs, _inner, offset, source) => {
    const word = WORD[tag.toUpperCase()];
    if (!word) return whole;
    const before = source.slice(Math.max(0, offset - EDGE_CLASS.length - 40), offset);
    const after = source.slice(offset + whole.length, offset + whole.length + EDGE_CLASS.length + 40);
    const wrapped = before.includes(EDGE_CLASS) && after.includes(EDGE_CLASS);
    if (wrapped) return whole; // idempotent
    return edgeHtml(startLabel(word)) + whole + edgeHtml(endLabel(word));
  });
}

function applyToHtml(html) {
  if (typeof html !== 'string' || !/<(?:ins|del|s)\b/i.test(html)) return html;
  // `<s>` is scoped to redline, so the walk is per section rather than
  // whole-document: a redline section gets the wider tag set, everything else
  // gets ins/del only.
  return mapSections(html, (_openTag, cls, inner) =>
    wrapEdges(inner, /\bredline\b/.test(cls || '') ? REDLINE_TAGS : GLOBAL_TAGS));
}

/** The same edge as a real NODE, for the live-DOM path. */
function edgeNode(doc, text) {
  const span = doc.createElement('span');
  span.className = EDGE_CLASS;
  span.textContent = text; // text, never markup — nothing here is author content
  return span;
}

const hasEdge = (node) => node?.nodeType === 1 && node.classList?.contains(EDGE_CLASS);

function applyToDom(root) {
  const doc = root?.ownerDocument ? root.ownerDocument : root;
  const scope = root?.querySelectorAll ? root : doc;
  if (!scope?.querySelectorAll) return;
  const targets = [
    ...scope.querySelectorAll('ins, del'),
    ...scope.querySelectorAll('section.redline s'),
  ];
  for (const el of targets) {
    const word = WORD[el.tagName.toUpperCase()];
    if (!word) continue;
    if (hasEdge(el.previousSibling) && hasEdge(el.nextSibling)) continue; // idempotent
    el.parentNode?.insertBefore(edgeNode(doc, startLabel(word)), el);
    el.parentNode?.insertBefore(edgeNode(doc, endLabel(word)), el.nextSibling);
  }
}

module.exports = {
  name: 'tracked-changes',
  selector: 'ins, del, section.redline s',
  applyToHtml,
  applyToDom,
  EDGE_CLASS,
  wrapEdges, // exported for unit tests
};
