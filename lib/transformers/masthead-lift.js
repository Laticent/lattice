/**
 * masthead-lift transformer — registry-shaped adapter around the masthead Cell
 * kernel at lib/forms/cell/masthead/masthead.transform.js (HTML-string path)
 * plus the DOM-walk mirror for the runtime bundle. The kernel is co-located with
 * the Cell's manifest + CSS (issue #356), exactly as compare-code bridges
 * its co-located component kernel into the registry here.
 *
 * The render paths consume this via the registry:
 *   - lattice-emulator.js (via lib/engine) — applyAllToHtml → applyToHtml
 *   - lattice-runtime.js — content-transform loop → applyAllToDom → applyToDom
 *
 * Lifts the eyebrow (code-only <p> before the title) + first <h2> + a trailing
 * SUBTITLE (code-only <p> immediately after the title) into a `.cell-masthead`
 * band with a reserved `.masthead-bay`, on sections that opt in with `form`.
 * The remaining flow body is then wrapped into the frame's `.cell-stage` cell
 * for STAGE_MIGRATED layouts (and generic prose) — see wrapsStageBody in the
 * co-located kernel; an un-migrated component keeps its direct-child body.
 * Idempotent — guarded on the `.cell-masthead` / `.cell-stage` markers. The
 * masthead Cell of the Form model (design/forms.md; engineering/decisions/
 * 2026-06-15-form-implementation.md, 2026-06-26-frames-as-flex-cell-trees.md).
 */

const engine = require('../forms/cell/masthead/masthead.transform');

// ── DOM mirror — must match the kernel's element selection exactly ────────
function transformMastheadDom(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  const doc = root.ownerDocument || root;
  // Scoped to TOP-LEVEL sections, same idiom as form-default.js's
  // `section:not(section section)` — a literal `<section class="form">` an
  // author writes inside slide content (lib/core/section-walk.js's own
  // documented scenario) must be left untouched, matching the HTML-string
  // kernel's depth-aware `mapSections` walk (applyToRenderedHtml). Without
  // this guard a hand-authored nested `<section class="form">` was lifted
  // TWICE — once as (incorrectly) a top-level target, and its own children
  // processed independently — a DOM-vs-HTML-string divergence.
  for (const sec of root.querySelectorAll('section.form:not(section section)')) {
    if (sec.querySelector(':scope > .cell-masthead')) continue;
    if (sec.querySelector(':scope > .cell-stage')) continue; // idempotent
    const h2 = sec.querySelector(':scope > h2');
    const wrap = engine.wrapsStageBody(sec.className);
    // Nothing to do for a non-generic, title-less slide (e.g. a bare chart).
    if (!h2 && !wrap) continue;

    let band = null;
    if (h2) {
      // A code-only <p> — the shape both the eyebrow and the subtitle share;
      // which one a given match IS depends on its position relative to h2.
      const isCodeOnlyP = (el) => !!el && el.tagName === 'P' && el.childNodes.length === 1 &&
        el.firstChild && el.firstChild.tagName === 'CODE';
      // eyebrow = a code-only <p> BEFORE the title. Scoped to children that
      // precede h2 in document order — an unscoped scan (matching anywhere in
      // the section) would misidentify a trailing SUBTITLE (below) as a
      // leading eyebrow, reordering it before the heading and mis-styling it
      // as the mono-caps kicker instead of the italic subtitle.
      const children = [...sec.children];
      const h2Index = children.indexOf(h2);
      const eyebrow = children.slice(0, h2Index).find(isCodeOnlyP);
      // subtitle = a code-only <p> IMMEDIATELY after the title (its next
      // element sibling) — base.docs.md's "Subtitle labels" pattern. Must be
      // re-seated next to h2 inside masthead-lede: left in the flow body it
      // would be separated from its `h2 +` CSS sibling selector by the band
      // itself, and (for a STAGE_MIGRATED layout) by the `.cell-stage` wrap.
      // .viz-frame merge: also hoist a chart's plain-text `.chart-subtitle`
      // (chart-family emits it top-level) — MUST mirror the string kernel's
      // extractSubtitleP branch, or a chart with a one-line subtitle would strand
      // it in the stage on the runtime/web path while the engine/PDF path bands it
      // (a HARD RULE #1 engine↔web split).
      const nextEl = h2.nextElementSibling;
      const isChartSubtitle = (el) => !!el && el.tagName === 'P' &&
        el.classList?.contains('chart-subtitle');
      // Mirrors the HTML-string kernel's OWN_TRAILING_LABEL skip (masthead.transform.js) —
      // citation-card/redline/regulatory-update own their trailing code-only paragraph as
      // dedicated citation/scope-label chrome, not a generic subtitle (issue #1199).
      const subtitle = engine.OWN_TRAILING_LABEL.test(sec.className)
        ? null
        : ((isCodeOnlyP(nextEl) || isChartSubtitle(nextEl)) ? nextEl : null);
      band = doc.createElement('div');
      band.className = 'cell-masthead';
      const stage = doc.createElement('div');
      stage.className = 'masthead-lede';
      const bay = doc.createElement('div');
      bay.className = 'masthead-bay';
      // Insert the band where the eyebrow (or, failing that, the h2) sits, so
      // a Marp <header>/logo that precedes it keeps its position.
      const anchor = eyebrow || h2;
      sec.insertBefore(band, anchor);
      if (eyebrow) stage.appendChild(eyebrow); // moves it out of flow
      stage.appendChild(h2);
      if (subtitle) stage.appendChild(subtitle); // moves it out of flow
      // The heading rule as a REAL <hr> — last child of the lede flex column, so it aligns with
      // the cluster via the lede's one align-items (no positioned pseudo, no bay-drift). Must
      // mirror the HTML-string kernel's `<hr class="masthead-rule">` exactly (HARD RULE #1).
      const rule = doc.createElement('hr');
      rule.className = 'masthead-rule';
      stage.appendChild(rule);
      band.appendChild(stage);
      band.appendChild(bay);
    }

    // Generic-prose: wrap the remaining flow body into a bounded `.cell-stage`
    // cell — the frame's third cell — with OR without a masthead band (mirror of
    // the kernel; flex cell-tree §6). A trailing Marp <footer> stays out of the
    // cell (footer band, not the clipped stage) — it joins the page number in a
    // real `.cell-footer` cell below.
    if (wrap) {
      const cell = doc.createElement('div');
      cell.className = 'cell-stage';
      // Start after the band if present, else from the first child.
      let trailingFooter = null;
      let node = band ? band.nextSibling : sec.firstChild;
      while (node) {
        const next = node.nextSibling;
        if (node.tagName === 'FOOTER' && !next) { trailingFooter = node; break; }
        cell.appendChild(node); // moves node out of the section into the cell
        node = next;
      }
      sec.appendChild(cell);
      // The footer Cell — running footer text + the page number as a REAL element
      // (mirror of the kernel's buildFooterCell). The page number is read from the
      // section's data-lattice-pagination attribute (engine-computed); absent ⇒ no
      // number, matching the pseudo's `:not([data-lattice-pagination])` hide.
      const pagination = sec.getAttribute('data-lattice-pagination') || '';
      if (trailingFooter || pagination) {
        const footerCell = doc.createElement('div');
        footerCell.className = 'cell-footer';
        if (trailingFooter) footerCell.appendChild(trailingFooter);
        if (pagination) {
          const pag = doc.createElement('span');
          pag.className = 'lat-pagination';
          pag.textContent = pagination;
          footerCell.appendChild(pag);
        }
        sec.appendChild(footerCell);
      }
    }
  }
}

module.exports = {
  name: 'masthead-lift',
  selector: 'section.form',
  applyToHtml(html) {
    return engine.applyToRenderedHtml(html);
  },
  applyToDom(root) {
    transformMastheadDom(root);
  },
};
