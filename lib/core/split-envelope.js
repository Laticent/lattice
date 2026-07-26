/**
 * split-envelope.js — the UNIVERSAL split envelope: COVER → BODY(1…n) → CLOSING?
 * (engineering/decisions/2026-07-22-structure-derived-split-patterns.md §0a and
 * §8 rule 9; the Fit Ladder's SPLIT move, 2026-06-22-the-fit-spine.md §3).
 *
 * Before this module a split read TWO ways. A layout with a carousel `split` recipe
 * got an accent COVER then its own native cards (`carousel.js` `cover-paginate`);
 * a plain layout — one that only declares `capacity.axis` — got a BARE partition:
 * the heading repeated with a "(cont.)" span and no lead-in at all. Worse, because
 * `partitionAxis` repeats the collection's surrounding `pre`/`post` VERBATIM on
 * every page, a trailing `.below-note` (and a framing lede paragraph) was stamped
 * on EVERY body page instead of landing once.
 *
 * The owner's ruling (§0a) is that split STRUCTURE is universal, not per-component:
 *
 *   COVER (always, when there is a masthead to carry) → BODY (1…n) → CLOSING (if earned)
 *
 * so this module is the ONE builder both paths go through (HARD RULE #1 — render
 * paths share one source of truth):
 *   · COVER   — the masthead, hoisted: eyebrow · title · subtitle · lede, on the
 *               shared accent field (`lat-split-cover`).
 *   · BODY    — the layout's OWN native pages, cut by `partitionAxis`, each marked
 *               `lat-split-native` so a body page that still overflows paginates
 *               FURTHER rather than growing a second cover.
 *   · CLOSING — the trailing material (a `.below-note`, a key-insight blockquote,
 *               an unwrapped trailing note) on ONE final page that keeps the run's
 *               own layout class + masthead, so it reads as the same deck. Emitted
 *               only when that material exists — never an empty closing slide.
 * Footer, pagination and the progress rail ride every page: the cover and the
 * closing carry the section's chrome, and `applyRails` (auto-split.js) stamps the
 * k-of-N rail across the whole run.
 *
 * Content is CONSERVED by construction (§5's conservation gate; Fit Spine axiom 4).
 * Every emitted page is the source `inner` with SPANS REMOVED — the bodies drop the
 * lede + trailing material, the closing drops the lede + the collection — and the
 * cover carries the masthead text those removals displaced. Nothing is re-authored
 * away, so no leaf text can go missing.
 *
 * Returns null (never a broken sequence) when the section has no title to cover
 * with, no primary collection, or a collection that already fits the per-page cut —
 * the caller then falls back to its own behavior. Pure & fs-free.
 */

const { directChildren, countAxis, partitionAxis } = require('./collections');
// The `.cell-stage` content cell — masthead-lift's body wrap. Reused from the
// below-note kernel rather than cloned (HARD RULE #15): it is the same depth-aware
// string extraction, and the two modules must agree on where a slide's trailing
// note lives. §8 rule 12b: the generic split resolves its collection INSIDE the
// content cell, never "the first <ul> in the section".
const { extractStage } = require('./below-note');

// ── shared section-assembly primitives (also used by carousel.js) ─────────────
const grab = (html, re) => {
  const m = html.match(re);
  return m ? m[1].trim() : null;
};

// Swap the section's layout class to `klass` (the split role's class string),
// keeping the openTag's theme/orientation data. Continuation copies (not first) drop
// the engine `id` so a split never duplicates ids.
function roleOpenTag(openTag, klass, first) {
  const tag = first ? openTag : openTag.replace(/\s+id="[^"]*"/, '');
  return tag.replace(/(\sclass=")[^"]*(")/, `$1${klass}$2`);
}

// Header/footer Form chrome, carried verbatim onto every emitted frame.
function chromeOf(inner) {
  return {
    header: (inner.match(/<header\b[^>]*>[\s\S]*?<\/header>/) || [''])[0],
    footer: (inner.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/) || [''])[0],
  };
}

// The cover's semantic lead-in, from the manifest `split.intro` template (`{n}` → the
// item/page count). Null when the layout declares none (a plain `capacity.axis`
// layout has no recipe at all, so it simply gets no lead-in).
const introOf = (recipe, n) => (recipe?.intro ? recipe.intro.replace(/\{n\}/g, n) : null);

// Mark a repeated heading "(cont.)" so a continuation page reads as part of the
// previous one. Mirrors auto-split.js's emitParts adornment exactly.
const withCont = (frag) =>
  frag.replace(/<\/(h[12])>/, ' <span class="lat-cont">(cont.)</span></$1>');

// Add a marker class to a section openTag, keeping every other attribute.
const addClass = (tag, name) => tag.replace(/(\sclass=")([^"]*)(")/, (_, a, c, b) => `${a}${c} ${name}${b}`);

// ── structural regions ────────────────────────────────────────────────────────
// HTML5 void elements never open a nesting level — needed so the depth-0 scan
// below doesn't miscount on the masthead's `<hr>` or an `<img>` in prose.
const VOID_TAGS = new Set([
  'br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col',
  'embed', 'source', 'track', 'wbr',
]);

// Every DEPTH-0 element of `html`, as { start, end, name, outer }, in order. The
// scan STOPS at the first unmatched close tag — in a region sliced out of a parent
// (the content cell's own children), that close is the parent's, and everything
// after it belongs to an enclosing box. Same depth-aware idiom as below-note.js's
// findStageOpen and the masthead kernel's findTopLevelH2.
function topLevelElements(html) {
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/)?>|<\/([a-zA-Z][a-zA-Z0-9-]*)>/g;
  const out = [];
  let depth = 0;
  let open = null;
  let m;
  while ((m = tagRe.exec(html))) {
    const [full, name, selfClose, closeName] = m;
    if (closeName) {
      if (depth === 0) break; // the enclosing box's close — the region ends here
      depth -= 1;
      if (depth === 0 && open) {
        out.push({ start: open.start, end: m.index + full.length, name: open.name, outer: html.slice(open.start, m.index + full.length) });
        open = null;
      }
      continue;
    }
    if (selfClose || VOID_TAGS.has(name.toLowerCase())) {
      if (depth === 0) out.push({ start: m.index, end: m.index + full.length, name: name.toLowerCase(), outer: full });
      continue;
    }
    if (depth === 0) open = { start: m.index, name: name.toLowerCase() };
    depth += 1;
  }
  return out;
}

// The span of the slide's PRIMARY COLLECTION container, in `inner` coordinates.
// Selects exactly the container `partitionAxis`/`countAxis` will operate on — the
// first `<ul>`/`<ol>` for `item` (mirroring firstList's indexOf choice), the first
// `<table>` for `row` — so the envelope and the partition can never disagree about
// WHICH collection is being cut. Null when the axis has no container here.
function collectionSpan(inner, axis) {
  if (axis === 'item') {
    const ulAt = inner.indexOf('<ul');
    const olAt = inner.indexOf('<ol');
    let at = -1;
    let tag = '';
    if (ulAt >= 0 && (olAt < 0 || ulAt < olAt)) { at = ulAt; tag = 'ul'; }
    else if (olAt >= 0) { at = olAt; tag = 'ol'; }
    if (at < 0) return null;
    const [span] = directChildren(inner.slice(at), tag);
    return span ? { start: at, end: at + span.end } : null;
  }
  if (axis === 'row') {
    const at = inner.search(/<table\b/);
    if (at < 0) return null;
    const [span] = directChildren(inner.slice(at), 'table');
    return span ? { start: at, end: at + span.end } : null;
  }
  return null;
}

// A code-only `<p>` — the shape the eyebrow and the subtitle share (base.docs.md's
// "Subtitle labels"). Never a lede.
const isCodeOnlyP = (outer) => /^<p[^>]*>\s*<code[^>]*>[\s\S]*?<\/code>\s*<\/p>$/.test(outer);

// The LEDE spans — the framing paragraphs between the masthead and the collection,
// inside the content cell. They are masthead material (§0a), so they hoist to the
// cover; left in place `partitionAxis` would repeat them on every body page. A
// code-only `<p>` (eyebrow / subtitle) and a chart's `.chart-subtitle` are masthead
// chrome the band already owns, not a lede.
function ledeSpansIn(inner, cellStart, collStart) {
  const region = inner.slice(cellStart, collStart);
  // A lede FOLLOWS the title. On an unwrapped (bandless) slide the `<h2>` is a
  // depth-0 sibling here, so anything before it is pre-title chrome, not a lede.
  const h2At = region.search(/<h2[^>]*>/);
  return topLevelElements(region)
    .filter((el) => el.name === 'p' && el.start > h2At && !isCodeOnlyP(el.outer) && !/^<p class="chart-subtitle"/.test(el.outer))
    .map((el) => ({ start: cellStart + el.start, end: cellStart + el.end, outer: el.outer }));
}

// A one-time CLOSING element: the `.below-note` hairline note, a key-insight
// `<blockquote>`, or an unwrapped trailing `<p>` (a layout on below-note's EXCLUDED
// list keeps a raw note). Anything else is a component's own structure.
const isClosingEl = (el) =>
  el.name === 'blockquote' || el.name === 'p' || (el.name === 'div' && /^<div class="below-note"/.test(el.outer));

// Slide-level chrome that is not content and must never end the trailing-run scan. On a
// `.cell-stage` slide these live outside the cell, but a STAGE_DEFERRED / non-Form layout
// has no cell — its region runs to the end of the section, so the Marp `<footer>` sits
// after the note and would otherwise terminate the walk before reaching it.
const CHROME_TAGS = new Set(['header', 'footer', 'nav']);

// The CLOSING spans — the material that TRAILS the collection inside the content cell.
// This is the region `partitionAxis` repeats as `post` on every page (the FM-2
// duplication), so it hoists to one closing page.
//
// Scanned as a contiguous run BACKWARD from the end of the cell, not "every closing-ish
// element after the collection": in `…</ul><p>lead-in</p><table>…` that `<p>` introduces
// the table, it is not a closing, and lifting it would move a lead-in onto the last page.
// The first non-closing, non-chrome element walking back therefore ends the run — whatever
// sits before it is the component's own structure, left in place (and still repeating).
function closingSpansIn(inner, collEnd, cellEnd) {
  const region = inner.slice(collEnd, cellEnd);
  const els = topLevelElements(region).filter((el) => !CHROME_TAGS.has(el.name));
  let first = els.length;
  while (first > 0 && isClosingEl(els[first - 1])) first -= 1;
  return els.slice(first).map((el) => ({ start: collEnd + el.start, end: collEnd + el.end, outer: el.outer }));
}

// Remove spans from `html` (right to left, so earlier indices stay valid).
function removeSpans(html, spans) {
  return [...spans]
    .sort((a, b) => b.start - a.start)
    .reduce((h, s) => h.slice(0, s.start) + h.slice(s.end), html);
}

// The slide's structural regions around its primary collection, or null when the
// axis has no collection here. `cell` bounds the CONTENT CELL — `.cell-stage` when
// masthead-lift wrapped the body, else the whole section inner.
function splitRegions(inner, axis) {
  const coll = collectionSpan(inner, axis);
  if (!coll) return null;
  const stage = extractStage(inner);
  const cell = stage ? { start: stage.bodyStart, end: stage.bodyEnd } : { start: 0, end: inner.length };
  // A collection outside the content cell is not this slide's split seam (chrome or
  // a nested component's list) — bail rather than cut the wrong thing (§8 rule 12b).
  if (coll.start < cell.start || coll.end > cell.end) return null;
  return {
    coll,
    cell,
    lede: ledeSpansIn(inner, cell.start, coll.start),
    closing: closingSpansIn(inner, coll.end, cell.end),
  };
}

// ── the cover ─────────────────────────────────────────────────────────────────
// Read the cover's masthead material from the rendered head (everything before the
// collection). Works with the `.cell-masthead` band masthead-lift builds AND a bare
// unbanded head: both put the eyebrow's code-only `<p>` BEFORE the `<h2>` and the
// subtitle's IMMEDIATELY after it. Null when the slide has no title — there is then
// nothing to put on a cover, and the caller keeps its own (bare) treatment.
function readMasthead(head) {
  const h2 = head.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
  if (!h2) return null;
  const before = head.slice(0, h2.index);
  const after = head.slice(h2.index + h2[0].length);
  const codeP = /<p[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/p>/;
  const sub = after.match(new RegExp(`^\\s*${codeP.source}`)) || after.match(/^\s*<p class="chart-subtitle">([\s\S]*?)<\/p>/);
  return {
    eyebrow: grab(before, codeP),
    heading: h2[1].trim(),
    subtitle: sub ? sub[1].trim() : null,
  };
}

// The cover's material, given regions already resolved (so the builder resolves them once).
function coverFrom(inner, regions) {
  const mast = readMasthead(inner.slice(0, regions ? regions.coll.start : inner.length));
  if (!mast) return null;
  const lede = (regions?.lede || [])
    .map((s) => s.outer.replace(/^<p[^>]*>/, '').replace(/<\/p>$/, '').trim())
    .filter(Boolean)
    .join(' ');
  return { ...mast, lede: lede || null };
}

/**
 * The cover's material for a rendered section: eyebrow · title · subtitle · lede
 * (§0a). Exported so carousel.js's `cover-cards` — which re-authors its own body
 * rather than paginating it — builds the SAME cover from the SAME reader.
 * Null when there is no title.
 */
function readCover(inner, axis) {
  return coverFrom(inner, splitRegions(inner, axis));
}

/**
 * The shared accent COVER page. Every split — plain-partition and carousel alike —
 * opens with this one field (§0a), so a split reads identically whatever layout it
 * came from. Carries a namespaced `split-cover-<layout>` marker so a layout MAY add
 * a small signature (e.g. compare-table's --spectrum strip) without activating its
 * `section.<layout>` base CSS. See base.modifiers.css.
 */
function coverSection(openTag, chrome, cover, layoutName) {
  const { header, footer } = chrome;
  const eye = cover.eyebrow ? `<div class="split-feat-eye">${cover.eyebrow}</div>` : '';
  const sub = cover.subtitle ? `<div class="split-feat-sub">${cover.subtitle}</div>` : '';
  const lede = cover.lede ? `<div class="split-feat-lede">${cover.lede}</div>` : '';
  const lead = cover.intro ? `<div class="split-cover-lead">${cover.intro} &rarr;</div>` : '';
  const mark = layoutName ? ` split-cover-${layoutName}` : '';
  const tag = roleOpenTag(openTag, `content lat-split-cover form${mark}`, true);
  return `${tag}${header}${eye}<div class="split-feat-h">${cover.heading}</div>${sub}${lede}${lead}${footer}</section>`;
}

// ── the envelope ──────────────────────────────────────────────────────────────
/**
 * Build the universal envelope for one rendered section, or null when it can't be
 * built (no title · no collection · the collection already fits `per`). Callers pass
 * the axis + per-page cut they resolved (a plain layout from its `capacity`, a
 * carousel recipe from `split.perPage` × the measured ratio) — this module owns the
 * SHAPE, not the pacing policy.
 *
 * `opts`: { axis, per, recipe?, layoutName? }
 */
function splitEnvelope(openTag, inner, chrome, opts) {
  const { axis, per, recipe, layoutName } = opts || {};
  if (axis !== 'item' && axis !== 'row') return null;
  if (!Number.isInteger(per) || per < 1) return null;
  const regions = splitRegions(inner, axis);
  if (!regions) return null;
  const cover = coverFrom(inner, regions);
  if (!cover) return null; // no masthead → nothing to cover with; caller keeps its own path
  // The BODY trunk: the section minus the material that must not repeat per page.
  const trunk = removeSpans(inner, [...regions.lede, ...regions.closing]);
  const count = countAxis(trunk, axis);
  if (count < 2) return null;
  const pages = partitionAxis(trunk, axis, per);
  if (!pages || pages.length < 2) return null; // already fits the cut → leave it whole
  const parts = [coverSection(openTag, chrome, { ...cover, intro: introOf(recipe, count) }, layoutName)];
  // BODY pages — the layout's OWN native finish; partitionAxis already repeated the
  // heading (and a table's <thead>) per page. The cover kept the engine id, so every
  // body page drops it (never duplicate an id).
  const bodyTag = addClass(openTag.replace(/\s+id="[^"]*"/, ''), 'lat-split-native');
  for (const [k, frag] of pages.entries()) parts.push(`${bodyTag}${k === 0 ? frag : withCont(frag)}</section>`);
  // CLOSING — only when the run actually has trailing material. Keeps the layout
  // class and the real masthead + content cell (so `.below-note` / key-insight CSS,
  // which is scoped `section.<layout> .below-note`, still applies) with the
  // collection cut out: the note lands ONCE, in the deck's own vocabulary.
  if (regions.closing.length) {
    const closingTag = addClass(openTag.replace(/\s+id="[^"]*"/, ''), 'lat-split-closing');
    const closingInner = removeSpans(inner, [...regions.lede, regions.coll]);
    parts.push(`${closingTag}${withCont(closingInner)}</section>`);
  }
  return parts;
}

module.exports = {
  splitEnvelope,
  readCover,
  readMasthead,
  coverSection,
  roleOpenTag,
  chromeOf,
  introOf,
  withCont,
  topLevelElements,
  splitRegions,
};
