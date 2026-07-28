/**
 * progress Tile — kernel (single source of truth for all render paths).
 *
 * The section dot-rail in the footer-centre zone (design/forms.md §6): one dot
 * per deck section (derived from `divider` slides, and BUCKETED past MAX_DOTS),
 * with the current section's dot elongated + accented. Injected into every `form`
 * slide that falls within a section. No-op when the deck has no dividers (nothing
 * to orient against). Opt a slide out with `no-progress`; `silent` suppresses it
 * with the rest of the chrome.
 *
 * The rail carries NO section label — see `railHtml` for why, and
 * engineering/decisions/2026-07-27-footer-band-allocation.md for the band-wide policy
 * it is one rank of.
 *
 * SELF-CONTAINED FORM TILE (issue #356): the Tile owns its logic, CSS
 * (progress.css) and manifest in one folder, and exposes both adapters from this
 * single file (mirrors lib/components/<b>/<c>/<c>.transform.js):
 *
 *   · applyToHtml(html) — the HTML-string render path (the owned engine,
 *                         lib/engine). Depth-aware section walk via the shared
 *                         lib/core/split-sections.
 *   · applyToDom(doc)   — the live-DOM render path (runtime/preview).
 *
 * The footer zones are now independently-positioned Cells (the rail parks beside
 * the page number — lib/forms/cell/progress-centre), so no `has-progress` class is
 * needed: the legacy footer "yield" it drove is retired. Both adapters are
 * idempotent (guarded on the `.tile-progress` marker).
 */

const { splitSections } = require('../../../core/split-sections');
const { dockInFooterCell } = require('../../../core/footer-dock');

/**
 * THE RAIL'S BUDGET. One dot per section stops working on a long deck: a 24-section
 * deck drew 24 dots on every page, and the band is shared with the author's footer
 * text, which is what gets squeezed. So the rail is capped and sections are BUCKETED
 * past the cap — ten dots covering N sections, the bucket you are in elongated.
 *
 * Ten is a width budget expressed as a count: the dots are sized in container units, so
 * ten of them occupy a fixed FRACTION of the band rather than a fixed number of pixels,
 * and the rail's share is the same at every canvas size. That is what makes a constant
 * the responsive answer here — nothing has to be measured at render time.
 *
 * The fraction is NOT the same in every ORIENTATION, though, and getting that wrong is
 * this change's most expensive mistake. The gaps carry `--canvas-scale` (1.95 in portrait)
 * while the dot widths do not, so a ten-dot rail is 21.48 `--_sec-1cqi` units at `hd` and
 * 32.17 in portrait — MEASURED on a real render, not computed from token names, because
 * computing it produced three different wrong answers. If you change MAX_DOTS, re-measure
 * in portrait and raise `--footer-center-w` (stage.css) to match; `footer-band.test.js`
 * asserts that relationship rather than either number.
 */
const MAX_DOTS = 10;

/**
 * Which dot is lit, and how many there are, for section `idx` (1-based) of `total`.
 * At or under the cap this is the identity — dot k is section k, unchanged. Over it,
 * section `idx` maps into the bucket that covers it, monotonically, with the last
 * section always landing on the last dot.
 */
function dotPlan(idx, total) {
  const shown = Math.min(total, MAX_DOTS);
  return { shown, on: Math.min(shown - 1, Math.floor((idx - 1) * shown / total)) };
}

/**
 * Build the `.tile-progress` dot-rail markup for section `idx` of `total`.
 *
 * NO SECTION LABEL. The rail used to carry the divider's eyebrow beside the dots, and
 * that one `white-space: nowrap` string is what made the band unresolvable: it could
 * not yield, so it collided with the author's footer text or bid the footer's width
 * away. The band's priority order is now pagination > dots > the author's words > the
 * section name, and the section name loses outright — the divider slide named the
 * section a page or two back, and the dots still say where you are.
 * See engineering/decisions/2026-07-27-footer-band-allocation.md.
 */
function railHtml(idx, total) {
  const { shown, on } = dotPlan(idx, total);
  const dots = Array.from({ length: shown }, (_, k) =>
    `<span class="dot${k === on ? ' on' : ''}"></span>`).join('');
  // A `div`, NOT a `nav`. The rail is a decorative echo of the pagination — it is
  // `aria-hidden`, so tagging it `nav` claimed the navigation role and then removed
  // it from the accessibility tree in the same breath. That is the over-tagging the
  // promotion rubric forbids (semantic-html ADR §3, §17.6): an element earns a
  // native tag by carrying its role, and this one deliberately carries none.
  return `<div class="tile-progress" aria-hidden="true">${dots}</div>`;
}

/**
 * HTML-string adapter. Derive sections from `divider` slides, inject the
 * footer-centre dot-rail into every `form` slide within a section. No-op without
 * dividers. Idempotent.
 */
function applyToHtml(html) {
  const pieces = splitSections(html);
  const total = pieces.filter((p) => p.type === 'section'
    && p.cls.split(/\s+/).includes('divider')).length;
  if (total === 0) return html;

  let cur = 0;
  return pieces.map((p) => {
    if (p.type === 'gap') return p.text;
    const tokens = p.cls.split(/\s+/);
    if (tokens.includes('divider')) cur += 1;
    let inner = p.inner;
    const openTag = p.openTag;
    if (tokens.includes('form') && cur > 0 &&
        !tokens.includes('no-progress') && !tokens.includes('silent') &&
        !inner.includes('class="tile-progress"')) {
      const rail = railHtml(cur, total);
      // Dock the rail INTO the footer Cell (flex cell-tree §6) when the frame
      // has one — grouped just left of the page number — else append at section
      // level (un-migrated / sovereign frames keep the positioned rail). Shared
      // with the split k-of-N rail (lib/core/footer-dock.js) — one docking rule
      // for both marks in the band, HARD RULE #15.
      inner = dockInFooterCell(inner, rail);
    }
    return openTag + inner + '</section>';
  }).join('');
}

/**
 * Live-DOM adapter. Same logic against a `document`: derive sections from
 * `divider` slides and inject the footer-centre dot-rail into each `form` slide
 * within a section. No-op without dividers; respects `no-progress` / `silent`.
 * Idempotent.
 */
function applyToDom(doc) {
  if (!doc) return;
  const sections = [...doc.querySelectorAll('section[data-lattice-slide]')];
  const total = sections.filter((s) => s.classList.contains('divider')).length;
  if (total === 0) return;
  let cur = 0;
  for (const s of sections) {
    if (s.classList.contains('divider')) cur += 1;
    if (!s.classList.contains('form') || cur === 0) continue;
    if (s.classList.contains('no-progress') || s.classList.contains('silent')) continue;
    const footerCell = s.querySelector(':scope > .cell-footer');
    const scope = footerCell || s;
    if (scope.querySelector(':scope > .tile-progress')) continue; // idempotent
    // `div`, matching railHtml above — see the note there on why this is not a `nav`.
    const rail = doc.createElement('div');
    rail.className = 'tile-progress';
    rail.setAttribute('aria-hidden', 'true');
    const { shown, on } = dotPlan(cur, total);
    for (let k = 0; k < shown; k++) {
      const dot = doc.createElement('span');
      dot.className = 'dot' + (k === on ? ' on' : '');
      rail.appendChild(dot);
    }
    // Dock the rail INTO the footer Cell (flex cell-tree §6) when the frame has
    // one — grouped just left of the page number — else append at section level
    // (un-migrated / sovereign frames keep the positioned rail).
    const pag = footerCell?.querySelector(':scope > .lat-pagination');
    if (pag) footerCell.insertBefore(rail, pag);
    else scope.appendChild(rail);
  }
}

// `dotPlan` + `MAX_DOTS` are exported for the unit suite: the bucketing is arithmetic on
// a boundary (does the last section always land on the last dot?), which is far cheaper to
// pin directly than to infer from rendered markup.
module.exports = { applyToHtml, applyToDom, dotPlan, MAX_DOTS };
