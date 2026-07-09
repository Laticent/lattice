/**
 * Universal below-note — wrap a layout's trailing `<p>` (the editorial
 * hairline note that follows a structural block) in `.below-note` so it
 * renders with the full-width hairline treatment.
 *
 * Structural primitive: a layout opts IN simply by not being on the
 * exclusion list. It is coupled to no single component, so it lives in
 * lib/core (per engineering/architecture.md § "Where transforms live").
 *
 * The render paths consume one kernel (the "three paths must agree"
 * contract — see CLAUDE.md):
 *
 *   - lattice-emulator.js (via lib/engine) — registry
 *     `applyAllToHtml` → `applyToHtml(fullHtml)`, which iterates top-level
 *     sections (depth-aware so nested split-panels stay intact), reads each
 *     section's class for the exclusion check, and wraps the trailing `<p>`
 *     that precedes the marp `<footer>` chrome.
 *   - lattice-runtime.js — registry `applyAllToDom` → `applyToDom(root)`.
 *
 * Before this kernel, the wrap was bespoke to `parseSlide`, so marp-cli and
 * the runtime never produced it — the emulator had silently diverged from
 * marp on these slides (the cross-renderer gate only checks page counts).
 * See engineering/decisions/2026-06-11-emulator-on-engine-p2.md.
 *
 * Sibling adapter: lib/transformers/below-note.js (registry wiring).
 */

// Layouts that claim their trailing `<p>` for something else (caption,
// attribution, main content, italic legend) or carry no body `<p>` — they
// must not gain the hairline. Mirrors the emulator's original list exactly.
// `math` is chrome-exempt (FORM_TOGGLE_SKIP) and drives its own concluding-
// equation-paragraph styling (math.styles.css `section.math > p` family);
// it has no local `.below-note` treatment, so a math slide's trailing note
// must stay a plain <p>, not gain an unstyled, detached wrapper.
const EXCLUDED = [
  'title', 'closing', 'quote', 'big-number', 'divider', 'image',
  'split-panel', 'split-compare', 'content', 'diagram', 'stats', 'code',
  'roadmap', 'progress', 'timeline-list', 'piechart', 'gantt', 'kanban',
  'image-razor', 'image-brief', 'image-chamber', 'math',
];

function isExcluded(cls = '') {
  return EXCLUDED.some(x => cls.includes(x));
}

// Trailing `<p>` immediately after a structural close, anchored to the end of
// the section content. An optional trailing marp `<footer>` is matched but
// left in place — it is present in the full-section HTML path and absent in
// the emulator's pre-chrome body, so one regex serves both. The whitespace
// around the footer is NOT captured, so the no-footer (emulator) case is
// byte-identical to the original inline `…</p>\s*$` wrap.
const TRAILING_NOTE =
  /((?:<\/div>|<\/ul>|<\/ol>|<\/table>|<\/pre>|<\/blockquote>)\s*)<p>([\s\S]*?)<\/p>\s*(<footer\b[^>]*>[\s\S]*?<\/footer>)?\s*$/;

// Same shape, scoped to a `.cell-stage` cell's own content: masthead-lift
// (lib/forms/cell/masthead/masthead.transform.js) already extracted any
// trailing Marp <footer> into a sibling `.cell-footer` before building the
// stage, so the stage's own tail never carries one.
const STAGE_TRAILING_NOTE =
  /((?:<\/div>|<\/ul>|<\/ol>|<\/table>|<\/pre>|<\/blockquote>)\s*)<p>([\s\S]*?)<\/p>\s*$/;

// Depth-aware extraction of a top-level `<div class="cell-stage">…</div>`
// cell, balancing nested `<div>` opens the same way applyToHtml's own
// section walk balances `<section>` tags. Returns null when masthead-lift
// hasn't wrapped this section's body (no Form, or a STAGE_DEFERRED layout
// that keeps direct-child bodies) — the section's flow is then flat and the
// plain TRAILING_NOTE anchor below already reaches its true trailing `<p>`.
const STAGE_OPEN = '<div class="cell-stage">';
function extractStage(inner) {
  const start = inner.indexOf(STAGE_OPEN);
  if (start === -1) return null;
  const bodyStart = start + STAGE_OPEN.length;
  const divRe = /<div\b[^>]*>|<\/div>/g;
  divRe.lastIndex = bodyStart;
  let depth = 1;
  let m;
  while ((m = divRe.exec(inner))) {
    if (m[0] === '</div>') { if (--depth === 0) return { bodyStart, bodyEnd: m.index }; }
    else depth++;
  }
  return null; // unbalanced — leave inner untouched rather than guess
}

// Pure per-section wrap. No idempotence guard — the emulator applies it once,
// to a fresh body; the HTML/DOM adapters add their own re-run guards.
function wrapTrailingNote(inner) {
  if (typeof inner !== 'string' || inner.indexOf('<p>') === -1) return inner;
  const stage = extractStage(inner);
  if (stage) {
    const body = inner.slice(stage.bodyStart, stage.bodyEnd);
    const wrapped = body.replace(STAGE_TRAILING_NOTE, '$1<div class="below-note"><p>$2</p></div>');
    return wrapped === body ? inner : inner.slice(0, stage.bodyStart) + wrapped + inner.slice(stage.bodyEnd);
  }
  return inner.replace(TRAILING_NOTE, '$1<div class="below-note"><p>$2</p></div>$3');
}

// Emulator entry point: skip excluded layouts, else wrap. `cls` is the
// section's class string. Kept here so the exclusion list has one home.
function wrapSectionBody(inner, cls) {
  return isExcluded(cls) ? inner : wrapTrailingNote(inner);
}

// Depth-aware top-level `<section>` walk over the full Marpit HTML string.
// Nested sections (split-panels) are carried inside their excluded outer
// section and never processed independently.
function applyToHtml(html) {
  if (typeof html !== 'string' || html.indexOf('<section') === -1) return html;
  const openRe = /<section\b[^>]*>/g;
  const tagRe = /<section\b[^>]*>|<\/section>/g;
  let out = '';
  let i = 0;
  while (i < html.length) {
    openRe.lastIndex = i;
    const open = openRe.exec(html);
    if (!open) { out += html.slice(i); break; }
    out += html.slice(i, open.index);
    const bodyStart = openRe.lastIndex;
    // Find the matching </section>, counting nested opens.
    let depth = 1;
    let close = -1;
    tagRe.lastIndex = bodyStart;
    let t;
    while ((t = tagRe.exec(html))) {
      if (t[0].charAt(1) === '/') {
        if (--depth === 0) { close = t.index; break; }
      } else {
        depth++;
      }
    }
    if (close === -1) { out += html.slice(open.index); break; }
    const inner = html.slice(bodyStart, close);
    const clsMatch = open[0].match(/class="([^"]*)"/);
    const cls = clsMatch ? clsMatch[1] : '';
    const wrapped = isExcluded(cls) || inner.indexOf('class="below-note"') !== -1
      ? inner
      : wrapTrailingNote(inner);
    out += open[0] + wrapped + '</section>';
    i = close + '</section>'.length;
  }
  return out;
}

const STRUCTURAL = new Set(['DIV', 'UL', 'OL', 'TABLE', 'PRE', 'BLOCKQUOTE']);

// Live-DOM walk (marp-vscode preview). Finds each non-excluded TOP-LEVEL
// section's trailing content `<p>` — the last element child of the section,
// or of its `.cell-stage` cell when masthead-lift has already wrapped the
// body — and wraps it when it follows a structural sibling. Scoped to
// `section:not(section section)` so a literal nested `<section>` an author
// writes in slide content (split-panels use `<div>` panes, never a nested
// `<section>`, but hand-authored HTML can) is left to its own outer section's
// pass, matching applyToHtml's depth-aware top-level walk.
function applyToDom(root) {
  const doc = root && root.ownerDocument ? root.ownerDocument : root;
  const scope = root && typeof root.querySelectorAll === 'function' ? root : doc;
  if (!scope || typeof scope.querySelectorAll !== 'function') return;
  for (const section of scope.querySelectorAll('section:not(section section)')) {
    if (isExcluded(section.className || '')) continue;
    const stage = section.querySelector(':scope > .cell-stage');
    const host = stage || section;
    if (host.querySelector(':scope > .below-note')) continue; // idempotent
    let last = host.lastElementChild;
    if (!stage) while (last && last.tagName === 'FOOTER') last = last.previousElementSibling;
    if (!last || last.tagName !== 'P') continue;
    const prev = last.previousElementSibling;
    if (!prev || !STRUCTURAL.has(prev.tagName)) continue;
    const wrap = doc.createElement('div');
    wrap.className = 'below-note';
    last.parentNode.insertBefore(wrap, last);
    wrap.appendChild(last);
  }
}

module.exports = {
  EXCLUDED,
  isExcluded,
  wrapTrailingNote,
  wrapSectionBody,
  applyToHtml,
  applyToDom,
};
