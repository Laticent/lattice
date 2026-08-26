/**
 * Registry adapter for the compare-code transform. Kernel:
 * lib/components/code/compare-code/compare-code.transform.js.
 *
 *   - lattice-emulator.js (via lib/engine) → applyAllToHtml → applyToHtml
 *   - lattice-runtime.js → applyAllToDom → applyToDom
 *
 * Idempotent: guarded on the `.code-cols` marker.
 */

const engine = require('../components/code/compare-code/compare-code.transform');
const { isFrameCell } = require('../core/coda');

// True for a `<p>` whose only child is a `<code>` (a column label / eyebrow).
function isCodeParagraph(el) {
  return (
    el.tagName === 'P' &&
    el.children.length === 1 &&
    el.firstElementChild &&
    el.firstElementChild.tagName === 'CODE'
  );
}

function transformCompareCodeDom(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  const doc = root.ownerDocument || root;
  for (const sec of root.querySelectorAll('section.compare-code')) {
    if (sec.querySelector(':scope > .code-cols')) continue; // idempotent
    const h2 = sec.querySelector(':scope > h2');
    if (!h2) continue;

    // Column elements = everything after the h2 except a trailing <footer>; a new
    // column starts at each code-paragraph (the eyebrow code-p sits before the h2).
    const cols = [];
    let cur = null;
    let seenH2 = false;
    for (const el of [...sec.children]) {
      if (el === h2) { seenH2 = true; continue; }
      // A frame cell (the universal `.cell-coda`) is not column material — step
      // over it exactly like the footer, so it stays a full-width sibling of
      // `.code-cols` instead of being swept into the last column (lib/core/coda.js).
      if (!seenH2 || el.tagName === 'FOOTER' || isFrameCell(el)) continue;
      if (isCodeParagraph(el)) { cur = []; cols.push(cur); }
      if (cur) cur.push(el);
    }
    if (cols.length === 0) continue;

    const codeCols = doc.createElement('div');
    codeCols.className = 'code-cols';
    for (const colEls of cols) {
      const col = doc.createElement('div');
      col.className = 'code-col';
      for (const el of colEls) col.appendChild(el); // moves the node out of the section
      codeCols.appendChild(col);
    }
    h2.after(codeCols);
  }
}

module.exports = {
  name: 'compare-code',
  selector: 'section.compare-code',
  applyToHtml(html) {
    return engine.applyToRenderedHtml(html);
  },
  applyToDom(root) {
    transformCompareCodeDom(root);
  },
};
