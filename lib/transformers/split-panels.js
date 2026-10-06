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

// The lede: the first paragraph child, and on split-panel only one ABOVE the first h3-h6 child
// (`proof`'s `### signal` label) — a paragraph after the label belongs to the right zone. The
// kernel's `headingBoundary` (lib/core/split-panels.js) draws the same line; this path had no
// boundary and put that paragraph in the left panel (followups.d/2478-p5, now closed).
function findFirstNonCodeP(sec, codeP, { headingBoundary = true } = {}) {
  for (const el of sec.children) {
    if (headingBoundary && /^H[3-6]$/.test(el.tagName)) return undefined;
    if (el.tagName === 'P' && el !== codeP) return el;
  }
  return undefined;
}

// A top-level node the panels carry: every element, and text that is not whitespace. Text
// reaches the top level only from raw HTML (a table's fostered text, `<h2>H</h2>stray`); the
// kernel's rebuild carries it into the panel, so this path must too.
const isCarried = n => n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim() !== '');

// The RUNNING footer — the kernel's `extractFooter` rule, mirrored: the section's LAST element
// child, and only when it is a <footer>. An author can write a raw `<footer>` into the slide
// body (a source line, say); that one is content, stays in the flow, and lands in the panel
// like any other block. Taking "any direct-child footer" hoisted the author's and left two
// running footers overprinting each other (red team, HARD RULE #25).
//
// "Last" skips ENGINE chrome only: at runtime the page number and the marker rails can already
// follow the footer (`.lat-pagination`, `[data-lattice-berth]`), and neither exists yet when the
// string kernel runs, so skipping them is what keeps the two paths on one answer.
function runningFooter(sec) {
  let el = sec.lastElementChild;
  while (el && (el.classList.contains('lat-pagination') || el.hasAttribute('data-lattice-berth'))) el = el.previousElementSibling;
  return el && el.tagName === 'FOOTER' ? el : null;
}

// Header and running footer are chrome and stay direct children of the section (see the
// kernel's extractFooter for why the footer must not nest inside `.panel-right`).
function moveRemainingChildrenInto(sec, target, footer) {
  [...sec.childNodes].filter(n => isCarried(n) && n.tagName !== 'HEADER' && n !== footer).forEach((n) => { target.appendChild(n); });
}

// Re-append the running footer after the panels, matching the kernel's DOM order.
function footerLast(sec, footer) {
  if (footer) sec.appendChild(footer);
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

// DOM mirror of the kernel's proof sequencing (lib/core/split-panels.js
// sequenceProofPanels): capstone implies proof, and each proof slide takes its
// categorical tint from its ORDER in the deck rather than an authored `cat-N`.
// Runs over the whole root first, before any panel is rebuilt, so the count
// follows document order regardless of which sections need restructuring.
function sequenceProofPanels(root) {
  const CAT_SLOTS = 8;
  let n = 0;
  for (const sec of root.querySelectorAll('section.split-panel')) {
    const isCapstone = sec.classList.contains('capstone');
    if (!isCapstone && !sec.classList.contains('proof')) continue;
    if (isCapstone) sec.classList.add('proof');
    n += 1; // count overrides too, so one pinned hue doesn't shift the rest
    const pinned = [...sec.classList].some(c => /^cat-[1-8]$/.test(c));
    if (!pinned) sec.classList.add(`cat-${((n - 1) % CAT_SLOTS) + 1}`);
  }
}

function transformSplitPanel(root) {
  const { doc, sections } = makeDocHelpers(root);
  sequenceProofPanels(root);
  for (const sec of sections('section.split-panel')) {
    if (sec.querySelector('.panel-left')) continue;
    const variant = PANEL_VARIANTS.find(v => sec.classList.contains(v)) || '';
    const footer = runningFooter(sec);
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

    moveRemainingChildrenInto(sec, right, footer);
    sec.appendChild(left);
    sec.appendChild(right);
    footerLast(sec, footer);
  }
}

function transformSplitCompare(root) {
  const { doc, sections } = makeDocHelpers(root);
  for (const sec of sections('section.split-compare')) {
    if (sec.querySelector('.compare-left')) continue;
    const footer = runningFooter(sec);
    const codeP  = findCodeOnlyP(sec);
    const h2     = sec.querySelector('h2');
    // No heading boundary on split-compare, as on the kernel's applyCompare.
    const introP = findFirstNonCodeP(sec, codeP, { headingBoundary: false });
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
    // Unclaimed author blocks follow the options, before the verdict (the kernel's applyCompare
    // has the why). Engine chrome is not an author block: the running footer, the page number
    // and a berth stay where they are.
    [...sec.childNodes]
      .filter(el => isCarried(el) && (el.nodeType === 3 || (el.tagName !== 'HEADER' && el !== footer && el !== bq && !el.classList.contains('lat-pagination') && !el.hasAttribute('data-lattice-berth'))))
      .forEach((el) => { right.appendChild(el); });
    if (bq) {
      const verdict = doc.createElement('div');
      verdict.className = 'verdict';
      verdict.appendChild(bq);
      right.appendChild(verdict);
    }
    sec.appendChild(left);
    sec.appendChild(right);
    footerLast(sec, footer);
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
