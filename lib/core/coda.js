/**
 * The universal CODA — one cell for a slide's trailing editorial beats.
 *
 * A slide may end with two blocks that belong to no component:
 *
 *   key insight — a trailing `> …` blockquote, rendered as the accent panel
 *                 whose eyebrow the `insight-*` modifiers rename.
 *   below-note  — a trailing paragraph after a structural block, rendered as a
 *                 muted, hairline-ruled footnote.
 *
 * Both are OPT-OUT: a layout takes them unless it CLAIMS that trailing element
 * for its own anatomy (`coda.claims` in the component manifest). This kernel
 * lifts whichever ones are present into a single
 *
 *   <div class="cell-coda" data-dock="column|row|grid"> … </div>
 *
 * appended at the tail of the section body, and everything downstream — CSS,
 * the split envelope, the published `authoring.blocks` contract — addresses
 * THAT one cell instead of guessing at a DOM position.
 *
 * ── WHY A CELL, AND WHY THIS EARLY ────────────────────────────────────────────
 *
 * The beats used to be attached by SELECTOR SHAPE: `section > blockquote` and
 * `section > .cell-stage > blockquote`, guarded by a hand-written `:not()` chain
 * (base.modifiers.css) that a unit test parsed back out of the CSS. That binds a
 * universal block to two exact DOM paths, so any component whose transform
 * introduces a wrapper silently loses it. Measured across all 61 layouts before
 * this kernel existed:
 *
 *   · SWALLOWED, unstyled — compare-code (into `.code-cols > .code-col`), image
 *     (`.image-text`), scene (`.scene-text`), split-panel (`.panel-right`): the
 *     author's `> …` rendered as bare body text inside a column, with no panel,
 *     no eyebrow, and not even full width.
 *   · DROPPED entirely — contact, wifi, video, whose transforms rebuild the whole
 *     section from the authored list and never re-emit the node.
 *   · MISPLACED — premise, whose section is a flex ROW, so the panel became a
 *     third column beside the body.
 *
 * All eight advertised support in `authoring.blocks`, the deck lint accepted the
 * markup, and Compose offered the register. The author applied it and got silence
 * — the exact failure #1651 was written to close, still open because #1651 fixed
 * the CONTRACT and left the ATTACHMENT alone.
 *
 * Running FIRST in the registry (lib/transformers/registry.js) is what fixes it,
 * and it is not an optimization: for the three components that DROP the node,
 * there is nothing left to re-parent by the time a last-running pass could look.
 * Harvesting before any structural transform means the beats are already inside a
 * cell when the rebuilders run. They keep clear of it two different ways, and the
 * distinction matters when you add a rebuilder: five of the six PEEL the cell off
 * their body and re-append it (`peelCoda`, the same shape they already use for a
 * trailing `<footer>`), and exactly one — `lib/transformers/compare-code.js`, whose
 * DOM arm walks `[...sec.children]` — steps over it with `isFrameCell`.
 *
 * ── WHY IT DOCKS BY STRUCTURE, NOT BY COMPONENT ───────────────────────────────
 *
 * A section's outer structure is the only thing that decides how a full-width
 * band beneath the body has to be placed, and only three shapes occur across the
 * catalog: **55 column, 4 row, 2 grid**, measured in Chromium on every layout. So the
 * CSS has one arm per shape and names no component, and a layout declares its
 * shape once (`coda.dock`) instead of every universal block growing a per-layout
 * rule. A new component that is a flex column — the default — declares nothing.
 *
 * See engineering/decisions/2026-08-24-universal-coda-cell.md.
 */

const { mapSections } = require('./section-walk');
const { hasOptOut } = require('./below-note');

const CATALOG = require('../forms/cell/coda/coda-catalog.generated.js');

/** The cell's class. Addressed by base.modifiers.css § KEY INSIGHT and by
 *  lib/forms/cell/coda/coda.css; every consumer keys on this one name. */
const CODA_CLASS = 'cell-coda';

/**
 * Does this open tag carry the cell's class as a whole TOKEN?
 *
 * Not `includes('class="cell-coda"')`, which is what both call sites started as
 * and which is wrong the moment anything adds a second class. The split envelope
 * does exactly that: `markNote` stamps `lat-split-note` onto the span's own open
 * tag, so a carried note's cell reads `class="cell-coda lat-split-note"` and an
 * exact-string idempotence guard stops recognizing its own output.
 */
const CLASS_ATTR_RE = /\sclass="([^"]*)"/g;
function hasCodaClass(tag) {
  if (typeof tag !== 'string') return false;
  CLASS_ATTR_RE.lastIndex = 0;
  let m;
  // WHITESPACE-DELIMITED, never `\b`. `-` IS a word boundary to a regex engine, so
  // `\bcell-coda\b` also matches `cell-coda-inner` and `not-cell-coda` — the exact
  // footgun split-envelope.js documents for `tile-progress` and `lat-split-rail`.
  // A sloppy class match is weaker than the exact-string test it replaced, not stronger.
  while ((m = CLASS_ATTR_RE.exec(tag))) {
    if (m[1].split(/\s+/).includes(CODA_CLASS)) return true;
  }
  return false;
}

/** The two beats, in the order they appear inside the cell — the key insight
 *  summarizes the body, the note annotates it, so the note goes last. */
const BEATS = Object.freeze(['key-insight', 'below-note']);

/** The element each beat is authored as, and the claim that withholds it. */
const BEAT_ELEMENT = Object.freeze({ 'key-insight': 'blockquote', 'below-note': 'p' });
const BEAT_CLAIM = Object.freeze({ 'key-insight': 'blockquote', 'below-note': 'trailing-paragraph' });

/** A below-note is only promoted when it FOLLOWS a structural block — "a list,
 *  then a concluding sentence" is a footnote; "a paragraph, then another
 *  paragraph" is prose. Same set the below-note kernel has always used, so the
 *  promotion decision is unchanged by the move into the cell. */
const STRUCTURAL = new Set(['DIV', 'UL', 'OL', 'TABLE', 'PRE', 'BLOCKQUOTE']);

/** HTML5 void elements never open a nesting level. */
const VOID_TAGS = new Set([
  'br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col',
  'embed', 'source', 'track', 'wbr',
]);

/** The frame's own cells. A structural transform that rebuilds a section from
 *  `[...sec.children]` must step over these rather than sweeping them into its
 *  own subtree — they are the frame's, not the component's (HARD RULE #1). */
function isFrameCell(el) {
  if (!el?.classList) return false;
  for (const c of el.classList) if (c === 'cell-coda' || c.startsWith('cell-')) return true;
  return false;
}

/**
 * The coda declaration for a section's class list. An UNKNOWN layout takes both
 * beats in a column — the opt-out default, so a third-party or brand-new
 * component works without touching this file or the catalog.
 *
 * The generated per-layout SKELETONS (`layout-*`) are the one pattern rather than
 * a name: they carry their own blockquote treatment, so they claim it.
 */
function codaFor(cls) {
  const tokens = Array.isArray(cls) ? cls : String(cls || '').trim().split(/\s+/);
  for (const t of tokens) {
    if (t.startsWith('layout-')) return { dock: 'column', claims: ['blockquote', 'trailing-paragraph'] };
  }
  for (const t of tokens) {
    const row = CATALOG[t];
    if (row) return row;
  }
  return { dock: 'column', claims: [] };
}

/**
 * Does `cls` paint the `--insight-label` seam on a surface of its own, despite
 * claiming the blockquote? Exactly one layout does (split-compare's verdict tag),
 * and it matters only to the deck lint: the `insight-*` modifiers govern the LABEL,
 * not the block, so on that layout they rename a real surface and are not inert.
 */
function readsInsightLabel(cls) {
  return Boolean(codaFor(cls).readsInsightLabel);
}

/** Does `cls` render `beat`? The predicate behind the published
 *  `authoring.blocks` contract, the deck lint, and the Compose gutter. */
function rendersBeat(cls, beat) {
  if (!BEATS.includes(beat)) return false;
  if (beat === 'below-note' && hasOptOut(cls)) return false;
  return !codaFor(cls).claims.includes(BEAT_CLAIM[beat]);
}

// ── HTML-string arm ──────────────────────────────────────────────────────────

/**
 * The direct-child element spans of a body string, in document order. The body
 * this kernel sees is the AUTHORED render — flat, pre-transform — so a shallow
 * depth-counting scan is enough; it never has to balance a rebuilt card the way
 * the below-note kernel's `extractStage` does.
 */
function topLevelElements(body) {
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/)?>|<\/([a-zA-Z][a-zA-Z0-9-]*)>/g;
  const out = [];
  let depth = 0;
  let open = null;
  let m;
  while ((m = tagRe.exec(body))) {
    const [full, openName, selfClose, closeName] = m;
    if (closeName) {
      if (depth > 0) depth--;
      if (depth === 0 && open && closeName.toLowerCase() === open.tag) {
        out.push({ tag: open.tag, start: open.start, end: m.index + full.length });
        open = null;
      }
      continue;
    }
    const name = openName.toLowerCase();
    if (selfClose || VOID_TAGS.has(name)) {
      if (depth === 0) out.push({ tag: name, start: m.index, end: m.index + full.length });
      continue;
    }
    if (depth === 0) open = { tag: name, start: m.index };
    depth++;
  }
  return out;
}

/**
 * Rewrite one section body, lifting whatever trailing beats it renders into the
 * cell. Returns the body unchanged when there is nothing to lift.
 */
function harvestBody(inner, cls) {
  if (typeof inner !== 'string' || !inner) return inner;
  if (hasCodaClass(inner)) return inner; // idempotent

  const els = topLevelElements(inner);
  if (els.length === 0) return inner;

  // A Marp running <footer> is chrome, not a beat — the cell goes BEFORE it so
  // the footer band stays the section's last child.
  let last = els.length - 1;
  while (last >= 0 && els[last].tag === 'footer') last--;
  if (last < 0) return inner;

  // Peel the tail: an optional trailing <p> (the note), then an optional
  // <blockquote> before it (the insight). Order is fixed — the insight
  // summarizes the body, so it can never come after the note.
  //
  // A CLAIMED element does not END the scan, it is STEPPED OVER. A chart claims
  // its final `<p>` for the caption, so `> insight` followed by `Caption.` would
  // otherwise leave the insight unharvested — the contract published a panel and
  // the render produced none, which is the whole failure class this kernel closes.
  // The claimed element stays exactly where it is; only the cell's INSERTION POINT
  // moves to the end of the body, so the band is still the last thing on the slide.
  //
  // "Stays where it is" is not the same as "its own transform still finds it", and an
  // earlier draft of this comment claimed the second. It is false for the commonest
  // claim in the catalog: `liftChartCaption` anchors on `/<p…>…<\/p>\s*$/`, so a cell
  // inserted after the caption puts it past the end anchor and the caption renders as
  // body copy at full width. That is PRE-EXISTING — a bare trailing blockquote broke
  // the same anchor before this kernel existed — but a chart can now host a Key
  // Insight, so this change makes the combination reachable where it was not.
  // FIXED in this same change: `liftChartCaption` now calls `peelCoda` beside the
  // `<footer>` peel it already performs (chart-family.js), pinned across four layouts
  // in test/unit/transformers/coda.test.js. This comment said "Tracked" for long enough
  // that a checker read it as a live defect.
  const taken = [];
  let i = last;
  for (const beat of [...BEATS].reverse()) {
    if (i < 0) break;
    const el = els[i];
    if (el.tag !== BEAT_ELEMENT[beat]) continue;
    if (!rendersBeat(cls, beat)) { i--; continue; }        // claimed → step over
    if (beat === 'below-note') {
      // Promoted only after a STRUCTURAL block: "a list, then a concluding
      // sentence" is a footnote; "a paragraph, then another" is prose.
      const prev = i > 0 ? els[i - 1] : null;
      if (!prev || !STRUCTURAL.has(prev.tag.toUpperCase())) continue;
    }
    taken.unshift({ beat, el });
    i--;
  }
  if (taken.length === 0) return inner;

  const { dock } = codaFor(cls);
  const body = taken
    .map(({ beat, el }) => {
      const html = inner.slice(el.start, el.end);
      // The note keeps its own `.below-note` wrapper: that class is the hairline
      // treatment's whole contract and is referenced by component CSS, so the
      // move into the cell must not rename it.
      return beat === 'below-note' ? `<div class="below-note">${html}</div>` : html;
    })
    .join('');

  // Cut the taken elements out wherever they sat (back to front, so the earlier
  // offsets stay valid) and re-insert the cell at the END of the body — after any
  // claimed element it stepped over, before the Marp <footer> chrome.
  let out = inner;
  for (let k = taken.length - 1; k >= 0; k--) {
    out = out.slice(0, taken[k].el.start) + out.slice(taken[k].el.end);
  }
  // Insert AFTER the last non-footer element — or, when the beats WERE the whole
  // body, before the first footer. `j < 0` used to fall through to `out.length`,
  // which put the cell after the footer and contradicted this function's own
  // contract: on a `no-footer` slide the running footer then never reached
  // `.cell-footer`, so the rule that hides it could not match and the footer
  // printed on a slide the author had explicitly silenced. The DOM arm was right
  // all along (`kids[last].after(cell)`), so this was also an arm divergence.
  const at = (() => {
    const tail = topLevelElements(out);
    let j = tail.length - 1;
    while (j >= 0 && tail[j].tag === 'footer') j--;
    if (j >= 0) return tail[j].end;
    const firstFooter = tail.find((el) => el.tag === 'footer');
    return firstFooter ? firstFooter.start : out.length;
  })();
  return out.slice(0, at) + `<div class="${CODA_CLASS}" data-dock="${dock}">${body}</div>` + out.slice(at);
}

/**
 * Split a section body into `{ rest, coda }` — the SAME peel every structural
 * rebuilder already performs for a trailing Marp `<footer>`, and for the same
 * reason: the cell is the FRAME's, not the component's, so a transform that
 * re-slices the body must put it back rather than sweep it into a column, a
 * panel or a rebuilt card (HARD RULE #1).
 *
 * One implementation, called by every rebuilder (HARD RULE #15). Cloning the
 * peel is how the eight components in this kernel's header drifted apart in the
 * first place: each one hand-rolled its own idea of what the tail contained, and
 * a `<blockquote>` was in none of them.
 *
 * Returns `coda: ''` when there is nothing to peel, so a caller can concatenate
 * unconditionally.
 */
function peelCoda(inner) {
  if (typeof inner !== 'string' || !hasCodaClass(inner)) {
    return { rest: inner, coda: '' };
  }
  for (const el of topLevelElements(inner)) {
    if (el.tag !== 'div') continue;
    const open = inner.slice(el.start, inner.indexOf('>', el.start) + 1);
    if (!hasCodaClass(open)) continue;
    return { rest: inner.slice(0, el.start) + inner.slice(el.end), coda: inner.slice(el.start, el.end) };
  }
  return { rest: inner, coda: '' };
}

/** Depth-aware top-level `<section>` walk over the full Marpit HTML string. */
function applyToHtml(html) {
  if (typeof html !== 'string' || html.indexOf('<section') === -1) return html;
  // `mapSections` already hands back `readClassAttr(openTag)` as `cls` — the
  // RESOLVED class list, not the raw `data-class` payload, which is the read #1358
  // fixed. An earlier draft re-derived it here and justified the re-read with that
  // issue; the two values are byte-identical, so the justification described a
  // hazard this call site never had.
  return mapSections(html, (_openTag, cls, inner) => harvestBody(inner, cls));
}

// ── live-DOM arm ─────────────────────────────────────────────────────────────

/**
 * The same harvest against a live DOM (the marp-vscode preview and the browser
 * runtime). Scoped to top-level sections so a hand-authored nested `<section>`
 * is left to its own outer pass, matching the string walk above.
 */
function applyToDom(root) {
  const doc = root?.ownerDocument ? root.ownerDocument : root;
  const scope = root && typeof root.querySelectorAll === 'function' ? root : doc;
  if (!scope || typeof scope.querySelectorAll !== 'function') return;

  for (const section of scope.querySelectorAll('section:not(section section)')) {
    if (section.querySelector(`:scope > .${CODA_CLASS}`)) continue; // idempotent
    const cls = section.className || '';

    const kids = [...section.children];
    let last = kids.length - 1;
    while (last >= 0 && kids[last].tagName === 'FOOTER') last--;
    if (last < 0) continue;

    // Same tail scan as the string arm, including the STEP-OVER of a claimed
    // element — see harvestBody for why that is not a "stop".
    const taken = [];
    let i = last;
    for (const beat of [...BEATS].reverse()) {
      if (i < 0) break;
      const el = kids[i];
      if (el.tagName !== BEAT_ELEMENT[beat].toUpperCase()) continue;
      if (!rendersBeat(cls, beat)) { i--; continue; }
      if (beat === 'below-note') {
        const prev = i > 0 ? kids[i - 1] : null;
        if (!prev || !STRUCTURAL.has(prev.tagName)) continue;
      }
      taken.unshift({ beat, el });
      i--;
    }
    if (taken.length === 0) continue;

    const cell = doc.createElement('div');
    cell.className = CODA_CLASS;
    cell.dataset.dock = codaFor(cls).dock;
    // Insert at the END of the body — after any claimed element stepped over,
    // before the Marp <footer> chrome (`kids[last]` is the last non-footer child).
    kids[last].after(cell);
    for (const { beat, el } of taken) {
      if (beat === 'below-note') {
        const wrap = doc.createElement('div');
        wrap.className = 'below-note';
        cell.appendChild(wrap);
        wrap.appendChild(el);
      } else {
        cell.appendChild(el);
      }
    }
  }
}

module.exports = {
  CODA_CLASS,
  hasCodaClass,
  BEATS,
  BEAT_ELEMENT,
  BEAT_CLAIM,
  STRUCTURAL,
  isFrameCell,
  codaFor,
  rendersBeat,
  readsInsightLabel,
  topLevelElements,
  harvestBody,
  peelCoda,
  applyToHtml,
  applyToDom,
};
