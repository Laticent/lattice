/**
 * progress Tile — kernel (single source of truth for all render paths).
 *
 * The section dot-rail in the footer-centre zone (design/forms.md §6): one dot
 * per deck section (derived from `divider` slides), the current section's dot
 * elongated + accented and labelled with the section's divider title. Injected
 * into every `form` slide that falls within a section. No-op when the deck has
 * no dividers (nothing to orient against). Opt a slide out with `no-progress`;
 * `silent` suppresses it with the rest of the chrome.
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

const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Build the `.tile-progress` dot-rail markup for section `idx` of `total`. */
function railHtml(idx, total, label) {
  const dots = Array.from({ length: total }, (_, k) =>
    `<span class="dot${k === idx - 1 ? ' on' : ''}"></span>`).join('');
  const seg = label ? `<span class="seg">${stripTags(label)}</span>` : '';
  return `<nav class="tile-progress" aria-hidden="true">${seg}${dots}</nav>`;
}

/**
 * HTML-string adapter. Derive sections from `divider` slides, inject the
 * footer-centre dot-rail into every `form` slide within a section. No-op without
 * dividers. Idempotent.
 */
function applyToHtml(html) {
  const pieces = splitSections(html);
  const sections = pieces.filter((p) => p.type === 'section');
  const labels = [];
  for (const s of sections) {
    if (s.cls.split(/\s+/).includes('divider')) {
      // Prefer the divider's eyebrow (a short `Section 01 · …` code label) as
      // the rail label; fall back to its heading. (A heading is often a long
      // editorial sentence that would overflow the footer berth.)
      const eb = s.inner.match(/<p[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/p>/);
      const hm = s.inner.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/);
      labels.push(stripTags(eb ? eb[1] : (hm ? hm[1] : '')));
    }
  }
  const total = labels.length;
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
      const rail = railHtml(cur, total, labels[cur - 1]);
      // Dock the rail INTO the footer Cell (flex cell-tree §6) when the frame
      // has one — grouped just left of the page number — else append at section
      // level (un-migrated / sovereign frames keep the positioned rail).
      if (inner.includes('class="cell-footer"')) {
        inner = inner.includes('class="lat-pagination"')
          ? inner.replace('<span class="lat-pagination"', `${rail}<span class="lat-pagination"`)
          : inner.replace(/(<div class="cell-footer">[\s\S]*?)(<\/div>\s*)$/, `$1${rail}$2`);
      } else {
        inner += rail;
      }
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
  const labels = [];
  for (const s of sections) {
    if (s.classList.contains('divider')) {
      // Prefer the divider's eyebrow (short `Section 01 · …` code label) over
      // its heading, which is often a long editorial sentence.
      const eb = s.querySelector('p > code');
      const h = s.querySelector('h1, h2');
      labels.push((eb?.textContent || h?.textContent || '').replace(/\s+/g, ' ').trim());
    }
  }
  const total = labels.length;
  if (total === 0) return;
  let cur = 0;
  for (const s of sections) {
    if (s.classList.contains('divider')) cur += 1;
    if (!s.classList.contains('form') || cur === 0) continue;
    if (s.classList.contains('no-progress') || s.classList.contains('silent')) continue;
    const footerCell = s.querySelector(':scope > .cell-footer');
    const scope = footerCell || s;
    if (scope.querySelector(':scope > .tile-progress')) continue; // idempotent
    const nav = doc.createElement('nav');
    nav.className = 'tile-progress';
    nav.setAttribute('aria-hidden', 'true');
    if (labels[cur - 1]) {
      const seg = doc.createElement('span');
      seg.className = 'seg';
      seg.textContent = labels[cur - 1];
      nav.appendChild(seg);
    }
    for (let k = 0; k < total; k++) {
      const dot = doc.createElement('span');
      dot.className = 'dot' + (k === cur - 1 ? ' on' : '');
      nav.appendChild(dot);
    }
    // Dock the rail INTO the footer Cell (flex cell-tree §6) when the frame has
    // one — grouped just left of the page number — else append at section level
    // (un-migrated / sovereign frames keep the positioned rail).
    const pag = footerCell?.querySelector(':scope > .lat-pagination');
    if (pag) footerCell.insertBefore(nav, pag);
    else scope.appendChild(nav);
  }
}

module.exports = { applyToHtml, applyToDom };
