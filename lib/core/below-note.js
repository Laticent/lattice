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

// HTML5 void elements never open a nesting level, whether or not they carry
// a self-closing slash — needed so the top-level scan below doesn't miscount
// depth on a stray <br>/<img> in prose.
const VOID_TAGS = new Set([
  'br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col',
  'embed', 'source', 'track', 'wbr',
]);

// Depth-aware scan for STAGE_OPEN as a genuine TOP-LEVEL element of `inner`
// (a direct sibling of the optional header/masthead-band, never nested) —
// real masthead-lift output only ever emits it there. A literal match at
// depth > 0 is content, not structure: a `<pre>`/code sample or hand-authored
// HTML that merely mentions the string `<div class="cell-stage">` (this
// repo's own docs discuss it) must not be mistaken for the real cell.
//
// KEY ON THE CLASS, NEVER THE TAG — AND DON'T PIN THE ATTRIBUTES EITHER. The stage
// cell's ELEMENT is not fixed: it is a `<div>` normally and a `<figure>` when it holds a
// captioned graphic (masthead.transform.js `buildStageCell`), and the figure carries an
// `aria-label` the div does not. A matcher pinned to `<div class="cell-stage">` finds
// nothing on a captioned chart slide and falls silently back to the flat section-level
// anchor — a wrong answer that renders, which is the worst kind. This repo has hit that
// footgun in five separate places; the rule is: match the class, capture the tag, balance
// the tag you captured, and let the rest of the opening tag vary.
const STAGE_OPEN_RE = /^<([a-zA-Z][a-zA-Z0-9-]*)\s+class="cell-stage"(?:\s[^>]*)?>$/;
function findStageOpen(inner) {
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/)?>|<\/([a-zA-Z][a-zA-Z0-9-]*)>/g;
  let depth = 0;
  let m;
  while ((m = tagRe.exec(inner))) {
    const [full, openName, selfClose, closeName] = m;
    if (closeName) { if (depth > 0) depth--; continue; }
    if (selfClose || VOID_TAGS.has(openName.toLowerCase())) continue;
    if (depth === 0) {
      const stage = full.match(STAGE_OPEN_RE);
      if (stage) return { index: m.index, tag: stage[1].toLowerCase(), openLen: full.length };
    }
    depth++;
  }
  return null;
}

// Every open/close tag, as ONE static pattern. Deliberately not built per-call from the
// tag we found: interpolating parsed input into a `new RegExp` is a regex-injection shape
// even when the capture is provably `[a-zA-Z][a-zA-Z0-9-]*` (CodeQL flags it, and it is
// right to — the safety there rests on a constraint a reader has to go find). Matching
// all tags and comparing the NAME needs no escaping argument, and builds nothing per call.
const ANY_TAG = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/)?>|<\/([a-zA-Z][a-zA-Z0-9-]*)>/g;

// The only elements a trailing `/` genuinely closes, besides VOID_TAGS: the roots of
// foreign content, where XML self-closing is honored by the HTML parser.
const FOREIGN_ROOTS = new Set(['svg', 'math']);

// Depth-aware extraction of the top-level stage cell's body, balancing nested opens
// of the SAME tag the open used — the way applyToHtml's own section walk balances
// `<section>`. Returns null when masthead-lift hasn't wrapped this section's body (no
// Form, or a STAGE_DEFERRED layout that keeps direct-child bodies) — the section's
// flow is then flat and the plain TRAILING_NOTE anchor below already reaches its true
// trailing `<p>`.
// EXPORTED (not private) because the split envelope resolves its collection
// and its trailing material inside the SAME content cell this finds
// (lib/core/split-envelope.js; HARD RULE #15 — one implementation, not a clone).
function extractStage(inner) {
  const open = findStageOpen(inner);
  if (!open) return null;
  const bodyStart = open.index + open.openLen;
  ANY_TAG.lastIndex = bodyStart;
  let depth = 1;
  let m;
  while ((m = ANY_TAG.exec(inner))) {
    const [, openName, selfClose, closeName] = m;
    if (closeName) {
      if (closeName.toLowerCase() !== open.tag) continue;
      if (--depth === 0) return { bodyStart, bodyEnd: m.index };
      continue;
    }
    // `/>` DOES NOT self-close an HTML element — the parser treats `<div/>` as an OPEN
    // tag, and only void elements and the foreign-content roots (`<svg/>`, `<math/>`)
    // actually close themselves. The first version of this rewrite honored `/>` for
    // everything, so `<div class="cell-stage"><div class="x"/></div><p>after</p>` ended
    // the cell one element early and left the real trailing `<p>` outside it. The tag
    // being balanced here is never void, so only the foreign-content case can apply.
    if ((selfClose && FOREIGN_ROOTS.has(openName.toLowerCase())) || openName.toLowerCase() !== open.tag) continue;
    depth++;
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
  const doc = root?.ownerDocument ? root.ownerDocument : root;
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
  extractStage,
  wrapTrailingNote,
  wrapSectionBody,
  applyToHtml,
  applyToDom,
};
