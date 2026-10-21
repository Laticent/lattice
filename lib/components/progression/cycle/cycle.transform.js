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
 * The SVG draws with `currentColor`; cycle.styles.css sets the color from
 * `--accent`, so the transform carries no palette (HARD RULE #3). The span is a
 * direct child of the `ul` on purpose and not an `li`: every counter in the engine
 * (capacity, density, the split) counts `ul > li` as stages, and a connector must
 * not be one. A split page holds a single stage, so it gets no connector.
 *
 * Idempotent: guarded on the `.cycle-link` marker. Two arms, one markup:
 * `applyToRenderedHtml` (string path) and `applyToDom` (live runtime).
 */

const { mapSections, readClassAttr } = require('../../../core/section-walk');
const { extractFirstList } = require('../../../core/html-lists');

const LINK_SVG =
  '<svg viewBox="7.5 2.5 11 19" aria-hidden="true">'
  + '<path d="M9 4l8 8-8 8" fill="none" stroke="currentColor" stroke-width="2.6" '
  + 'stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LINK_HTML = `<span class="cycle-link" aria-hidden="true">${LINK_SVG}</span>`;

const isCycle = (cls) => /(^|\s)cycle(\s|$)/.test(cls) && !/(^|\s)lat-split-native(\s|$)/.test(cls);

/** Indexes (into `inner`) just after each top-level `</li>` that another `<li` follows. */
function gapOffsets(inner) {
  const offsets = [];
  let depth = 0;
  for (let i = 0; i < inner.length;) {
    if (/^<li[\s>]/.test(inner.slice(i, i + 4))) { depth++; i += 3; continue; }
    if (/^<(ul|ol)[\s>]/.test(inner.slice(i, i + 4))) { depth++; i += 3; continue; }
    if (inner.startsWith('</li>', i)) {
      depth--; i += 5;
      if (depth === 0 && /^\s*<li[\s>]/.test(inner.slice(i, i + 40))) offsets.push(i);
      continue;
    }
    if (inner.startsWith('</ul>', i) || inner.startsWith('</ol>', i)) { depth--; i += 5; continue; }
    i++;
  }
  return offsets;
}

function addLinks(sectionInner) {
  if (sectionInner.includes('cycle-link')) return null; // idempotent
  const list = extractFirstList(sectionInner);
  // `ul` only: the stage CSS is scoped to `ul > li`, so a connector in an `ol` would be
  // an unstyled, default-size SVG. An `ol` cycle is already a documented authoring mistake.
  if (!list || !sectionInner.startsWith('<ul', list.start)) return null;
  const offsets = gapOffsets(list.inner);
  if (!offsets.length) return null;
  let out = '';
  let prev = 0;
  for (const at of offsets) { out += list.inner.slice(prev, at) + LINK_HTML; prev = at; }
  out += list.inner.slice(prev);
  const openEnd = sectionInner.indexOf('>', list.start) + 1;
  return sectionInner.slice(0, openEnd) + out + sectionInner.slice(list.end - '</ul>'.length);
}

function applyToRenderedHtml(html) {
  return mapSections(html, (openTag, cls, inner) => {
    if (!isCycle(readClassAttr(openTag) || cls)) return null;
    return addLinks(inner);
  });
}

function applyToDom(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  for (const sec of root.querySelectorAll('section.cycle:not(.lat-split-native)')) {
    const ul = sec.querySelector(':scope > .cell-stage > ul, :scope > ul');
    if (!ul || ul.querySelector(':scope > .cycle-link')) continue; // idempotent
    const items = ul.querySelectorAll(':scope > li');
    for (let i = 0; i < items.length - 1; i++) {
      const link = sec.ownerDocument.createElement('span');
      link.className = 'cycle-link';
      link.setAttribute('aria-hidden', 'true');
      link.innerHTML = LINK_SVG;
      items[i].after(link);
    }
  }
}

module.exports = { applyToRenderedHtml, applyToDom, LINK_HTML };
