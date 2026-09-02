/**
 * section-index — the running section number for `divider numbered`, STAMPED AS
 * AN ATTRIBUTE rather than counted in CSS.
 *
 * ── WHY NOT A CSS COUNTER ───────────────────────────────────────────────────
 *
 * It was one, and on the Marp render path it silently produced `01` on every
 * divider in the deck. Two facts compose into that:
 *
 *   · MARPIT SCOPES A THEME BY PREFIXING ITS SELECTORS. `body { counter-reset:
 *     lat-divider }` is rewritten to `div#\:\$p > svg > foreignObject > section
 *     body { … }` — a `<body>` INSIDE a section, which never exists. Measured on
 *     real marp-cli 4.5.0 output: `document.querySelectorAll('section body')`
 *     returns 0. The reset never lands.
 *   · MARPIT PUTS EACH SLIDE IN ITS OWN `<svg><foreignObject>`. The sections are
 *     therefore NOT siblings — measured, five sections with five distinct
 *     parents. With no reset in scope, CSS creates the counter implicitly ON THE
 *     INCREMENTING ELEMENT, and that scope covers the element, its descendants
 *     and its FOLLOWING SIBLINGS. Each section is alone in its own subtree, so
 *     each one starts a fresh counter at 1.
 *
 * Neither is a bug we can fix from a stylesheet, and `inlineSVG: false` does not
 * help (measured: still five distinct parents). This is also why MARPIT'S OWN
 * pagination is `attr(data-marpit-pagination)` and not `counter()` — the same
 * constraint, solved the same way. We follow it.
 *
 * A cross-slide CSS counter cannot work on that path. An attribute can, because
 * whoever assembles or walks the document knows the order.
 *
 * ── ONE KERNEL, TWO ADAPTERS (HARD RULE #1) ─────────────────────────────────
 *
 * `applyToHtml` serves the owned engine path (`lib/engine`, the CLI, the docs
 * Playground); `applyToDom` serves a live document — the runtime, which is the
 * ONLY producer that reaches the Marp path, since there we contribute a
 * stylesheet and marp-core writes the HTML. Both derive the number the same way,
 * from the same predicate, so the two paths cannot disagree about what section
 * 03 is.
 *
 * ── WHAT THIS MEANS WHERE THE RUNTIME DOES NOT RUN ──────────────────────────
 *
 * The numeral simply does not draw. That is deliberate: `content` reads the
 * attribute and nothing else, so a surface we cannot number shows NOTHING rather
 * than a confident `01` on section five. A missing mark is a gap the author can
 * see; a wrong one is misinformation the room cannot check. Whether the
 * marp-vscode preview executes `<script>` is contested and unverified in this
 * repo (engineering/gotchas/vscode.md), so that surface may land on either side
 * of this line — blank, or correctly numbered. marp-cli is not in doubt: its PDF
 * render drives real Chromium and its HTML output runs the script when opened.
 */

const { splitSections } = require('./split-sections');
// `readClassAttr`, never a hand-rolled `class="…"` match: an unanchored pattern also
// matches `data-class`, which carries the RAW `_class:` payload rather than the resolved
// list (#1358). The ownership gate rejects the hand-rolled form, and it was right to.
const { readClassAttr } = require('./section-walk');

// The attribute the stylesheet reads. Named for what it carries, not for the
// component, because `content` is a value and this is that value.
//
// IT GOES ON THE HEADING, NOT THE SECTION, and that is forced rather than chosen:
// `attr()` resolves against the ORIGINATING ELEMENT of the pseudo, and the numeral
// rides `:is(h1, h2)::after`. Stamped on the section it resolves to the empty string
// and the mark silently does not draw — which is exactly what the parity suite caught
// on the first cut of this kernel.
const SECTION_INDEX_ATTR = 'data-lat-section';

// The class pair that opts a slide into the series, matching what the retired
// `counter-increment` targeted EXACTLY — `section.divider.numbered`, both
// classes, `light` included, bookends excluded. If this ever drifts from the
// stylesheet's own selector the two producers start numbering different slides.
function isNumberedDivider(classList) {
  return classList.includes('divider') && classList.includes('numbered');
}

function classTokens(str) {
  return String(str || '').split(/\s+/).filter(Boolean);
}

/**
 * `01`, `02`, … — `decimal-leading-zero`'s own rule, which is what the retired
 * counter style produced: pad to two digits, and past 99 stop padding rather
 * than truncate.
 */
function stampValue(n) {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * HTML-string adapter — the owned engine path.
 *
 * Idempotent: a section that already carries the attribute is rewritten with the
 * value this pass computed, not skipped, so a re-render after auto-split
 * renumbers instead of preserving a stale index.
 */
function applyToHtml(html) {
  if (typeof html !== 'string') return html;
  const pieces = splitSections(html);
  if (!pieces.some((p) => p.type === 'section')) return html;
  let n = 0;
  return pieces.map((p) => {
    if (p.type === 'gap') return p.text;
    if (!isNumberedDivider(classTokens(readClassAttr(p.openTag)))) {
      return p.openTag + p.inner + '</section>';
    }
    n += 1;
    // The FIRST heading in the slide — the one the stylesheet's `:is(h1, h2)::after`
    // selects. A slide with no heading gets no stamp and no numeral, which is the
    // documented behavior: the mark rides the heading, and the series still advances.
    const inner = stampHeading(p.inner, stampValue(n));
    return p.openTag + inner + '</section>';
  }).join('');
}

/**
 * Put the value on the slide's first `<h1>`/`<h2>` open tag, replacing any stamp a
 * previous pass left so a re-render renumbers rather than preserving a stale index.
 */
function stampHeading(inner, value) {
  const open = /<(h[12])\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/i.exec(String(inner || ''));
  if (!open) return inner;
  const attrs = open[2].replace(new RegExp(`\\s${SECTION_INDEX_ATTR}="[^"]*"`, 'gi'), '');
  const rebuilt = `<${open[1]}${attrs} ${SECTION_INDEX_ATTR}="${value}">`;
  return inner.slice(0, open.index) + rebuilt + inner.slice(open.index + open[0].length);
}

/** The same pass over a fully assembled document — see fit-berth's note on why
 * this cannot just call `applyToHtml` (embedded chrome derails the walker). */
function applyToDocHtml(docHtml) {
  if (typeof docHtml !== 'string') return docHtml;
  const firstSlide = docHtml.search(/<section\b[^>]*\bdata-lattice-slide=/);
  if (firstSlide < 0) return docHtml;
  return docHtml.slice(0, firstSlide) + applyToHtml(docHtml.slice(firstSlide));
}

/**
 * Live-DOM adapter — the runtime, and the only producer that reaches Marp.
 *
 * NOT scoped to `[data-lattice-slide]`, unlike most runtime passes: marp-core
 * writes its own `<section id="1">` and never emits that attribute, so scoping
 * to it would make this a no-op on the one path it exists for. The class pair is
 * the qualifier instead, and nested sections are skipped — a literal `<section>`
 * inside a code block parses as real DOM, which is the hazard the
 * `[data-lattice-slide]` scoping elsewhere exists to dodge.
 */
function applyToDom(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return;
  let n = 0;
  for (const s of doc.querySelectorAll('section.divider.numbered')) {
    if (s.parentElement?.closest?.('section')) continue;
    n += 1;
    const h = s.querySelector('h1, h2');
    if (!h) continue;
    const val = stampValue(n);
    // Guarded so an unchanged document is not written to: this runs on every
    // runtime pass, and a needless attribute write is a mutation other observers
    // in this subsystem would see.
    if (h.getAttribute(SECTION_INDEX_ATTR) !== val) h.setAttribute(SECTION_INDEX_ATTR, val);
  }
}

module.exports = { SECTION_INDEX_ATTR, isNumberedDivider, stampValue, stampHeading, applyToHtml, applyToDocHtml, applyToDom };
