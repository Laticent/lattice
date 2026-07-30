/**
 * split-panels transformer — registry-shaped adapter around the engine
 * kernel at lib/core/split-panels.js (HTML-string path) plus the
 * DOM-walk mirror lifted from the legacy lattice-runtime.js inline
 * block.
 *
 * The render paths consume this module via the registry:
 *   - lattice-emulator.js (via lib/engine) —
 *                            registry.applyAllToHtml
 *   - lib/runtime/index.js → lattice-runtime.js bundle — content-transform
 *                            loop calls registry.applyAllToDom(document)
 *
 * Two layouts: split-panel (featured left panel + supporting right zone, with
 * the metric/quote/steps/watermark variants) and split-compare (frame +
 * options + verdict). The HTML-string kernel and the applyToDom mirror below
 * stay in lock-step.
 */

const engine = require('../core/split-panels');

// ── DOM helpers ────────────────────────────────────────────────────────
// Each transform takes a scope root (Document or Element) and a doc
// (the owning Document, needed for createElement). Splitting them out
// lets unit tests pass a jsdom Element directly without touching globals.

function makeDocHelpers(root) {
  const doc = root.ownerDocument || root;
  return { doc, sections: (sel) => root.querySelectorAll(sel) };
}

function findCodeOnlyP(sec) {
  return [...sec.children].find(
    el => el.tagName === 'P' && el.childNodes.length === 1 && el.firstChild && el.firstChild.tagName === 'CODE'
  );
}

function findFirstNonCodeP(sec, codeP) {
  return [...sec.children].find(el => el.tagName === 'P' && el !== codeP);
}

function moveRemainingChildrenInto(sec, target) {
  const header = sec.querySelector('header');
  [...sec.children].filter(el => el !== header).forEach((el) => { target.appendChild(el); });
}

function makeSpan(doc, className, text) {
  const span = doc.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

// ── Per-layout DOM transforms ──────────────────────────────────────────
// Idempotent — each guards on the layout's marker class so a second
// pass (e.g. when the engine hook already ran) is a no-op.

// split-panel — one DOM transform, three left-assembly modes (the variant
// supplies the finish). Mirrors applyPanel in lib/core/split-panels.js.
const PANEL_VARIANTS = engine.PANEL_VARIANTS;

// DOM walk for the kernel's proof sequencing: capstone implies proof, and each
// proof slide takes its categorical tint from its ORDER in the deck rather than an
// authored `cat-N`. Runs over the whole root first, before any panel is rebuilt, so
// the count follows document order regardless of which sections need restructuring.
//
// The RULE is not restated here. This used to be a hand-kept SECOND copy of it, and
// it was not — as `test/unit/core/split-panel-proof-sequence.test.js` claimed —
// covered by a DOM parity case: it had no coverage at all, and deleting this loop
// broke nothing. It now calls the kernel's own `proofTokensFor`, so only the
// traversal differs (HARD RULE #1), and the parity case exists:
// test/unit/transformers/split-panels-dom.test.js § "proof sequencing".
function sequenceProofPanels(root) {
  let count = 0;
  const seq = { next: () => ++count };
  for (const sec of root.querySelectorAll('section.split-panel')) {
    // `sec.className` is the same space-separated string the kernel parses, and the
    // counter advances for pinned slides too, so one authored hue doesn't shift the
    // rest — both behaviors now come from the kernel rather than being re-encoded.
    for (const token of engine.proofTokensFor(sec.className, seq)) sec.classList.add(token);
  }
}

function transformSplitPanel(root) {
  const { doc, sections } = makeDocHelpers(root);
  sequenceProofPanels(root);
  for (const sec of sections('section.split-panel')) {
    if (sec.querySelector('.panel-left')) continue;
    const variant = PANEL_VARIANTS.find(v => sec.classList.contains(v)) || '';
    const left  = doc.createElement('div');
    left.className = 'panel-left';
    const right = doc.createElement('div');
    right.className = 'panel-right';

    if (variant === 'pullquote') {
      const bq    = sec.querySelector(':scope > blockquote');
      const codeP = findCodeOnlyP(sec);
      if (bq) left.appendChild(bq);
      if (codeP) {
        const cite = doc.createElement('cite');
        cite.textContent = codeP.textContent;
        left.appendChild(cite);
        codeP.remove();
      }
    } else if (variant === 'watermark') {
      const h2    = sec.querySelector('h2');
      const h5    = sec.querySelector('h5');
      const codeP = findCodeOnlyP(sec);
      const h2Text = h2 ? (h2.textContent || '').trim() : '';
      const watermark = doc.createElement('div');
      watermark.className = 'watermark';
      watermark.textContent = h2Text ? h2Text[0] : 'S';
      left.appendChild(watermark);
      if (codeP) left.appendChild(codeP);
      if (h5)    left.appendChild(h5);
      if (h2)    left.appendChild(h2);
    } else {
      // default / metric / steps
      const codeP  = findCodeOnlyP(sec);
      const h2     = sec.querySelector('h2');
      const introP = findFirstNonCodeP(sec, codeP);
      if (codeP) {
        left.appendChild(makeSpan(doc, 'panel-eyebrow', codeP.textContent));
        codeP.remove();
      }
      if (h2)     left.appendChild(h2);
      if (introP) left.appendChild(introP);
    }

    moveRemainingChildrenInto(sec, right);
    sec.appendChild(left);
    sec.appendChild(right);
  }
}

function transformSplitCompare(root) {
  const { doc, sections } = makeDocHelpers(root);
  for (const sec of sections('section.split-compare')) {
    if (sec.querySelector('.compare-left')) continue;
    const codeP  = findCodeOnlyP(sec);
    const h2     = sec.querySelector('h2');
    const introP = findFirstNonCodeP(sec, codeP);
    const bq     = sec.querySelector(':scope > blockquote');
    const left   = doc.createElement('div');
    left.className = 'compare-left';
    if (codeP) {
      left.appendChild(makeSpan(doc, 'frame-label', codeP.textContent));
      codeP.remove();
    }
    if (h2)     left.appendChild(h2);
    if (introP) left.appendChild(introP);
    // slotLabelLift has already run, so li > strong is in place.
    const optionList = sec.querySelector(':scope > ul, :scope > ol');
    const right = doc.createElement('div');
    right.className = 'compare-right';
    const opts  = doc.createElement('div');
    opts.className = 'options';
    if (optionList) {
      [...optionList.children].filter(el => el.tagName === 'LI').forEach((li, i) => {
        const div = doc.createElement('div');
        div.className = i === 1 ? 'option preferred' : 'option';
        [...li.childNodes].forEach((n) => { div.appendChild(n); });
        opts.appendChild(div);
      });
      optionList.remove();
    }
    right.appendChild(opts);
    if (bq) {
      const verdict = doc.createElement('div');
      verdict.className = 'verdict';
      verdict.appendChild(bq);
      right.appendChild(verdict);
    }
    sec.appendChild(left);
    sec.appendChild(right);
  }
}

module.exports = {
  name: 'split-panels',
  layouts: engine.SPLIT_LAYOUTS,
  selector: engine.SPLIT_LAYOUTS.map(l => `section.${l}`).join(', '),
  applyToHtml(html) {
    return engine.applyToRenderedHtml(html);
  },
  // Per-renderer DOM walk. root is a Document or Element scope.
  // Order matters: split-compare reads <li> children, which expect
  // slotLabelLift's li > strong shape to already be present — but that
  // dependency is enforced by the registry's transformer ordering, not
  // here. Each transform is self-guarding.
  applyToDom(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    transformSplitPanel(root);
    transformSplitCompare(root);
  },
};
