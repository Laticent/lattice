/**
 * progress Tile — kernel (single source of truth for all render paths).
 *
 * The section dot-rail in the footer-center zone (design/forms.md §6): one dot
 * per deck section (derived from `divider` slides, and BUCKETED past MAX_DOTS),
 * with the current section's dot elongated + inked. Injected into every `form`
 * slide that falls within a section and into each `divider` (lit on the section it
 * opens). No-op below MIN_SECTIONS (a scale of one says nothing). Opt a slide out with `no-progress`; `silent` suppresses it
 * with the rest of the chrome. `with-progress` opts a slide back IN, over both — the
 * owner's rule (2026-11-03): a deck-wide `class: no-progress` reaches every slide,
 * and a slide overrides it with an explicit token. It has to win when both are on
 * the slide, because the deck class is on every slide (`railShown`).
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
 *                         docs/src/lib/markup/sections.ts.
 *   · applyToDom(doc)   — the live-DOM render path (runtime/preview).
 *
 * The footer zones are now independently-positioned Cells (the rail parks beside
 * the page number — lib/forms/cell/progress-center), so no `has-progress` class is
 * needed: the legacy footer "yield" it drove is retired. Both adapters are
 * idempotent (guarded on the `.tile-progress` marker).
 */

const { switchOn } = require('../../../core/switches');
const { splitSections } = require('@laticent/markup');
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
 * THE RAIL'S FLOOR. A scale needs two positions to say anything: with one section the rail is a
 * single lit pill on every page, which reads as a stray dash, not as "you are here". The topic
 * track has refused a scale of one since it shipped (`MIN_TRACK_LABELS`, lib/core/track-spec.js);
 * the section rail now holds the same floor, so a one-section deck draws no rail at all.
 */
const MIN_SECTIONS = 2;

/**
 * Which slides carry the rail. A `form` slide inside a section, and — since the rail's semantics
 * pass — the `divider` that OPENS a section, lit on the section it names. The divider is where a
 * reader learns what the dots mean: the section is named in display type right beside its own lit
 * dot, so the dots on the following pages are no longer an unlabeled code. A `topic` slide does
 * not carry it: it already draws its own track one level down, and two unlabeled scales on one
 * slide is the confusion this rail is trying to remove.
 */
const carriesRail = (has) => has('form') || has('divider');

/**
 * `progress-rail: edge` (lib/core/resolve-progress-rail.js) stands the rail upright on the slide's
 * right edge, so it is placed at SECTION level rather than docked in the footer Cell: the Cell is
 * itself positioned, and a rail inside it could only ever be placed relative to the footer band.
 * Every other placement docks, and CSS does the rest.
 */
const EDGE_TOKEN = 'progress-rail-edge';

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
/**
 * Does this slide carry the rail? `with-progress` first (a slide's explicit word beats the
 * deck-wide `no-progress` it also carries), then `no-progress` / `silent`.
 * @param {{ contains(t: string): boolean }} tokens  a classList, or anything shaped like one
 */
function railShown(tokens) {
  return switchOn('progress', tokens);
}

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
 * footer-center dot-rail into every `form` slide within a section. No-op without
 * dividers. Idempotent.
 */
function applyToHtml(html, ctx) {
  const pieces = splitSections(html);
  // SUPPLIED SECTION POSITION. `cur`/`total` are deck-positional metadata — which
  // divider-delimited section this slide sits in, and how many the deck has — so a caller
  // that already knows them can hand them over instead of forcing a whole-deck parse. That
  // is the same trade the page number makes (lib/engine/slides.js): deriving them is why a
  // preview showing ONE slide of a deck with dividers had to re-render the entire deck on
  // every keystroke. Absent it, nothing changes — the walk below counts as it always did.
  const supplied = ctx?.deckSection;
  const suppliedTotal = supplied && Number.isInteger(supplied.total) && supplied.total > 0 ? supplied.total : 0;
  const suppliedIndex = supplied && Number.isInteger(supplied.index) && supplied.index > 0 ? supplied.index : 0;
  const total = suppliedTotal || pieces.filter((p) => p.type === 'section'
    && p.cls.split(/\s+/).includes('divider')).length;
  if (total < MIN_SECTIONS) return html;

  // With a supplied index the document holds only the shown slide, so there is no run to
  // walk: the caller already resolved which section it falls in. Seeding `cur` and skipping
  // the increment is what makes a one-section document render the SAME rail it would have
  // received inside the full deck.
  let cur = suppliedIndex;
  return pieces.map((p) => {
    if (p.type === 'gap') return p.text;
    const tokens = p.cls.split(/\s+/);
    if (tokens.includes('divider') && !suppliedIndex) cur += 1;
    let inner = p.inner;
    const openTag = p.openTag;
    if (carriesRail((t) => tokens.includes(t)) && cur > 0 &&
        railShown({ contains: (t) => tokens.includes(t) }) &&
        !inner.includes('class="tile-progress"')) {
      const rail = railHtml(cur, total);
      if (tokens.includes(EDGE_TOKEN)) return openTag + inner + rail + '</section>';
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
 * `divider` slides and inject the footer-center dot-rail into each `form` slide
 * within a section. No-op without dividers; respects `no-progress` / `silent`.
 * Idempotent.
 */
function applyToDom(doc) {
  if (!doc) return;
  const sections = [...doc.querySelectorAll('section[data-lattice-slide]')];
  const total = sections.filter((s) => s.classList.contains('divider')).length;
  if (total < MIN_SECTIONS) return;
  let cur = 0;
  for (const s of sections) {
    if (s.classList.contains('divider')) cur += 1;
    if (!carriesRail((t) => s.classList.contains(t)) || cur === 0) continue;
    const footerCell = s.querySelector(':scope > .cell-footer');
    const edge = s.classList.contains(EDGE_TOKEN);
    const scope = (!edge && footerCell) || s;
    // A rail in the OTHER berth (the slide's placement changed after the first pass) is moved, not
    // kept: the reconcile below otherwise leaves a docked rail on a slide that now says `edge`.
    const stray = (edge ? footerCell : s)?.querySelector(':scope > .tile-progress');
    if (stray && stray.parentNode !== scope) stray.remove();
    const existing = scope.querySelector(':scope > .tile-progress');
    // RECONCILE, not only inject: a deck-wide `no-progress` can land AFTER the first pass (the
    // runtime resolves a re-rendered deck's settings again, and the VS Code preview reads the saved
    // file asynchronously), and a rail injected before it must not outlive the class that removes it.
    if (!railShown(s.classList)) { if (existing) existing.remove(); continue; }
    if (existing) continue; // idempotent
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
    const pag = edge ? null : footerCell?.querySelector(':scope > .lat-pagination');
    if (pag) footerCell.insertBefore(rail, pag);
    else scope.appendChild(rail);
  }
}

// `dotPlan` + `MAX_DOTS` are exported for the unit suite: the bucketing is arithmetic on
// a boundary (does the last section always land on the last dot?), which is far cheaper to
// pin directly than to infer from rendered markup.
module.exports = { applyToHtml, applyToDom, dotPlan, railShown, MAX_DOTS, MIN_SECTIONS };
