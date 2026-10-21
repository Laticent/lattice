/**
 * cycle transform — puts a real connector element between the stages.
 *
 * The connector used to be a `li::after` chevron placed by a negative offset into
 * the gap between two cards. That gap is `--sp-lg` (container-relative), while the
 * chevron was `1em` of `--fs-h3`, which a `venue-*` class scales (hall is 1.5×). So
 * at the hall venue the mark outgrew the gap and painted over the next card. A
 * pseudo-element has no box the layout can reserve space for, so the fix is an
 * element: `span.cycle-link` is a flex item of the stage row, sized from the same
 * `em`, and the cards give way to it instead of being drawn over.
 *
 *   <ul>
 *     <li>…stage 1…</li>
 *     <span class="cycle-link" aria-hidden="true"><svg …/></span>
 *     <li>…stage 2…</li>
 *   </ul>
 *
 * The SVG is a bare path: cycle.styles.css strokes it with `currentColor` and sets
 * that color from `--accent`, so the transform carries no palette (HARD RULE #3).
 * Both the stroke and the markup are kept tiny on purpose — this ships in the engine
 * bundle, whose route budget had about half a kilobyte of room. The span is a
 * direct child of the `ul` on purpose and not an `li`: every counter in the engine
 * (capacity, density, the split) counts `ul > li` as stages, and a connector must
 * not be one. A split page holds a single stage, so it gets no connector.
 *
 * Idempotent: guarded on the `.cycle-link` marker. Two arms, one markup, and the
 * module is its own registry adapter (lib/transformers/cycle.js re-exports it).
 */

const { mapSections } = require('../../../core/section-walk');
const { extractFirstList } = require('../../../core/html-lists');

const LINK = '<span class="cycle-link" aria-hidden="true"><svg viewBox="7.5 2.5 11 19"><path d="M9 4l8 8-8 8"/></svg></span>';
const STAGE = 'section.cycle:not(.lat-split-native)';

/** `LINK` after every top-level `</li>` another `<li` follows; `d` is the nested-list depth. */
const link = (inner) => {
  let d = 0;
  return inner.replace(/<(\/?)(?:ul|ol)\b|<\/li>(?=\s*<li\b)/g, (m, c) => {
    if (c != null) d += c ? -1 : 1;
    return c == null && !d ? m + LINK : m;
  });
};

module.exports = {
  name: 'cycle',
  selector: 'section.cycle',
  applyToHtml: (html) => mapSections(html, (_, cls, inner) => {
    // `ul` only: the stage CSS is scoped to `ul > li`, so an `ol` would get unstyled SVGs.
    const l = /(^| )cycle( |$)/.test(cls) && !/(^| )lat-split-native( |$)/.test(cls) && !inner.includes('class="cycle-link"') && extractFirstList(inner);
    return l && inner.startsWith('<ul', l.start) ? inner.slice(0, l.start) + inner.slice(l.start, l.end).replace(l.inner, link(l.inner)) + inner.slice(l.end) : null;
  }),
  applyToDom(root) {
    // The FIRST list, as the string arm takes it, so the two arms link the same one.
    for (const sec of root.querySelectorAll(STAGE)) {
      const ul = sec.querySelector('ul, ol');
      if (ul?.localName !== 'ul' || ul.querySelector(':scope > .cycle-link')) continue;
      for (const li of [...ul.children].filter((c) => c.localName === 'li').slice(0, -1)) li.insertAdjacentHTML('afterend', LINK);
    }
  },
};
