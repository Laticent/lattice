/**
 * split-envelope.js — the UNIVERSAL split envelope: COVER → BODY(1…n) → INSIGHT?
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
 *   COVER (always, when there is a masthead to carry) → BODY (1…n) → INSIGHT (if earned)
 *
 * so this module is the ONE builder both paths go through (HARD RULE #1 — render
 * paths share one source of truth):
 *   · COVER   — the masthead, hoisted: eyebrow · title · subtitle · lede, on the
 *               shared accent field (`lat-split-cover`).
 *   · BODY    — the layout's OWN native pages, cut by `partitionAxis`, each marked
 *               `lat-split-native` so a body page that still overflows paginates
 *               FURTHER rather than growing a second cover.
 *   · INSIGHT — a trailing key-insight `<blockquote>` (if any) gets its OWN final
 *               page, vertically centered and set a size up — it's the run's
 *               takeaway, never shared with anything else.
 * The trailing NOTE (a `.below-note`, or an unwrapped trailing `<p>` on a layout
 * below-note excludes) is a SEPARATE kind of trailing material, and reads owner
 * review corrected: it is not a takeaway that earns its own beat, it is a footnote
 * of the content immediately above it — so it stays attached to that content, riding
 * the LAST body page (one step smaller than its normal size, since it now shares a
 * page with real content) rather than a page of its own. Its wrap/exclude decision
 * (lib/core/below-note.js) is untouched; only WHERE it lands and its size change.
 * Footer, pagination and the progress rail ride every page: the cover and the
 * insight page carry the section's chrome, and `applyRails` (auto-split.js) stamps
 * the k-of-N rail across the whole run.
 *
 * Content is CONSERVED by construction (§5's conservation gate; Fit Spine axiom 4).
 * Every emitted page is the source `inner` with SPANS REMOVED — the bodies drop the
 * lede + note + insight, the insight page drops the lede + collection + note — and
 * the cover carries the masthead text those removals displaced; the note is spliced
 * back into the last body page. Nothing is re-authored away, so no leaf can go missing.
 *
 * Returns null (never a broken sequence) when the section has no title to cover
 * with, no primary collection, or a collection that already fits the per-page cut —
 * the caller then falls back to its own behavior. Pure & fs-free.
 */

const { directChildren, countAxis, partitionAxis, firstList } = require('./collections');
// The `.cell-stage` content cell — masthead-lift's body wrap. Reused from the
// below-note kernel rather than cloned (HARD RULE #15): it is the same depth-aware
// string extraction, and the two modules must agree on where a slide's trailing
// note lives. §8 rule 12b: the generic split resolves its collection INSIDE the
// content cell, never "the first <ul> in the section".
const { extractStage } = require('./below-note');
// The canvas (color-mode) axis tokens — `dark` / `light` / `print` / …. Its own doc calls
// itself "the ONE source of truth shared by the deck-class propagation kernels … so the two
// kernels don't drift apart"; the cover builder below is a THIRD kernel that has to respect
// the same axis when it swaps a section's layout class (HARD RULE #15 — reuse, don't re-list).
const { COLOR_MODE_TOKENS } = require('./color-mode');

// ── shared section-assembly primitives (also used by carousel.js) ─────────────
const grab = (html, re) => {
  const m = html.match(re);
  return m ? m[1].trim() : null;
};

// Swap the section's layout class to `klass` (the split role's class string),
// keeping the openTag's theme/orientation data. Continuation copies (not first) drop
// the engine `id` so a split never duplicates ids.
/**
 * Stamp the kernel-owned SPLIT ROLE on a section open tag (§8 rule 9).
 *
 * The rule requires "a gate asserts every split run begins with exactly one cover and
 * carries <=1 closing" — but the gate keyed on the CLASS `lat-split-cover`, which only the
 * plain path and `cover-paginate`/`cover-cards` emit. The per-layout strategies emit their
 * own (`split-panel-cover`, `list-tabular-cover`, `decision-cover`, `compare-code-cover`),
 * so the gate found zero covers and every assertion SKIPPED for 6 of the 9 strategies —
 * a gate that cannot see two thirds of its subject. The role is a kernel fact, independent
 * of whatever class a strategy chooses, so the invariant can be asserted once for all of
 * them; it is also the hook the conservation gate (rule 6) and the relationship signal
 * (rule 12a) both key on. Idempotent, so a re-split cannot double-stamp.
 */
const SPLIT_ROLES = Object.freeze(['cover', 'body', 'insight']);
function withRole(tag, role) {
  if (!SPLIT_ROLES.includes(role)) throw new Error(`withRole: unknown split role '${role}'`);
  return /\sdata-split-role="/.test(tag)
    ? tag.replace(/\sdata-split-role="[^"]*"/, ` data-split-role="${role}"`)
    : tag.replace(/^<section\b/, `<section data-split-role="${role}"`);
}

function roleOpenTag(openTag, klass, first, role = 'body') {
  const tag = withRole(first ? openTag : openTag.replace(/\s+id="[^"]*"/, ''), role);
  // The role's class string REPLACES the layout class (a cover is a `content` field, not a
  // `checklist`), but the CANVAS axis is orthogonal to layout and must survive the swap:
  // replacing the whole attribute dropped `dark`/`light`/`print`, so a dark deck opened every
  // split run with a LIGHT accent page and a `class: print` deck — the one mode whose whole
  // point is no color — got a full-bleed saturated cover between two ink-on-white slides.
  // Found by the adversarial trio on a real render (two lenses independently). Body pages were
  // never affected: they use `addClass`, which is additive. Scoped deliberately to the canvas
  // axis rather than "keep every class": a layout-scoped modifier (`cards-grid.three`,
  // `compact`) must NOT ride onto a `content`-classed cover, and there is no registry of
  // universal-vs-layout modifiers to key on — a broader carry-over is a separate change.
  return tag.replace(/(\sclass=")([^"]*)(")/, (_, pre, existing, post) => {
    const canvas = existing.trim().split(/\s+/).filter((t) => COLOR_MODE_TOKENS.includes(t));
    return `${pre}${[klass, ...canvas].join(' ')}${post}`;
  });
}

// Form chrome, carried verbatim onto every emitted frame: header · footer · the deck's
// SECTION RAIL.
//
// The rail (`nav.tile-progress`, lib/forms/tile/progress) is injected during render — one
// dot per deck section, the current one lit and labelled from its divider — so by split time
// every Form slide carries it. It was NOT in this chrome set, and the omission split a run's
// own chrome two ways: a plain-path BODY page keeps the rail (it is part of the partitioned
// trunk) while that run's COVER loses it, and the five re-authoring cover strategies lost it
// on every page. So a split run rendered with the deck's section orientation flickering off
// and back on, mid-run, while every un-split neighbor kept it. Found by the rule-6
// conservation gate, which reported the rail's label text ("Signal Definition · Workshop 04")
// as dropped by `cover-sides`. Carried here, in the one chrome reader, so no strategy can
// forget (HARD RULE #1). It coexists with `applyRails`'s k-of-N `lat-split-rail` exactly as
// it already does on plain-path body pages — different zone, different marker.
function chromeOf(inner) {
  return {
    header: (inner.match(/<header\b[^>]*>[\s\S]*?<\/header>/) || [''])[0],
    footer: (inner.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/) || [''])[0],
    rail: (inner.match(/<nav class="tile-progress"[^>]*>[\s\S]*?<\/nav>/) || [''])[0],
  };
}

/**
 * The cover/insight page's FOOTER CELL — `<div class="cell-footer">` holding the running footer
 * text, the deck's section rail and the page-number element, the same shape masthead-lift builds
 * on an ordinary slide.
 *
 * A re-authored page used to emit those marks as BARE section children, which left the band with
 * no shared width budget: each mark is absolutely positioned from its own edge, so on a portrait
 * cover the four of them (footer text · k-of-N rail · section rail · page number) overlapped —
 * the k-of-N rail struck through the footer text and the section label truncated to
 * "SECTION 01 · CONNEC…" while every un-split neighbor showed it whole. Inside the Cell the row
 * is a real flex line (`section.form > .cell-footer`), so the marks share the width and the
 * footer text ellipsises instead of colliding. `applyRails` docks the k-of-N rail into the same
 * Cell for the same reason.
 *
 * The page-number SPAN is emitted only when the slide is paginated (the openTag carries
 * `data-lattice-pagination`); `repaginate` re-stamps its value, and its presence is also what
 * retires the `::after` pagination pseudo (`section.form:has(> .cell-footer)::after`), so the
 * number is rendered exactly once. A `paginate: false` slide gets the Cell without it rather
 * than a literal "0".
 */
function footerCell(openTag, chrome) {
  const { footer = '', rail = '' } = chrome || {};
  const pag = /\sdata-lattice-pagination="/.test(openTag) ? '<span class="lat-pagination">0</span>' : '';
  if (!footer && !rail && !pag) return '';
  return `<div class="cell-footer">${footer}${rail}${pag}</div>`;
}

/**
 * Drop the section's own chrome from a fragment, so a strategy that re-emits a SLICE of the
 * source (`redline-blocks`'s heading block, `kanban-lanes`'s wrapper prefix and closes) can
 * prepend `chrome.header` / append `chrome.footer` without doubling it. Those slices start at
 * index 0 of `inner` — which begins `<header>…</header>` on any Form slide with a deck
 * `header:` — so `${header}${slice}` emitted TWO `<header>` elements into one section on
 * every real render, invisible in the unit fixtures because their hand-written inners carry
 * no chrome at all.
 *
 * Removes the EXACT strings `chromeOf` read, rather than re-parsing: a slice can begin or end
 * mid-nesting (kanban's `suffix` opens with the board's unmatched closes), where the
 * depth-aware walk correctly refuses to classify anything, and a lazy tag regex could reach
 * into a component's own nested `<nav>`. Byte-identical removal can only ever hit the chrome
 * it was handed.
 */
function stripChrome(html, chrome) {
  return [chrome?.header, chrome?.footer, chrome?.rail]
    .filter(Boolean)
    .reduce((h, piece) => h.split(piece).join(''), html);
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

/**
 * The split axis READ FROM THE RENDERED DOM (§8 rule 1).
 *
 * "Axis is read from the RENDERED DOM at split time, never inferred from authored content. The
 * rendered structure (list / table / svg / pre) is the authority; `capacity.axis` is retained only
 * as the pre-render count estimate."
 *
 * The manifest axis is an AUTHORING-shape claim, and the two can legitimately disagree: `glossary`
 * authors as a list and renders as a table, so its `capacity.axis` says `item` while the thing on
 * the page is rows. Every such case needed a second declaration (`split.axis`) to correct the
 * first, which is precisely the drift the standing oracle (rule 5) exists to catch — and a
 * mismatch nobody declared shipped as a split on the wrong seam.
 *
 * Resolved INSIDE THE CONTENT CELL (rule 12b — `.cell-stage` when masthead-lift wrapped the body,
 * else the whole section), so slide chrome, the masthead band and a nested component's list are
 * out of scope by construction. Returns:
 *   · 'row'    — a `<table>`: the members are rows
 *   · 'item'   — a `<ul>`/`<ol>`: the members are list items
 *   · 'line'   — a `<pre>`: code, whose only seam is a line (`partitionAxis` refuses it today, so
 *                this reads as "not splittable yet" rather than a promise)
 *   · 'figure' — a viewBox `<svg>`: container-responsive, NO seam; the honest ring, and the
 *                legibility floor (rule 8) is what judges it instead
 *   · null     — no recognizable collection in the cell
 *
 * Order matters where a cell holds more than one: whichever container comes FIRST in the cell is
 * the slide's primary collection, matching `collectionSpan`'s own first-match choice — the two must
 * agree about WHICH thing is being cut.
 *
 * This does NOT decide whether to split. Enrollment stays the manifest's opt-in (rule 3: "a
 * rendered collection does not imply a split seam") — a component with no `capacity`/`split`
 * contract rings no matter what its DOM contains.
 */
const AXIS_OF_TAG = Object.freeze({ table: 'row', ul: 'item', ol: 'item', pre: 'line', svg: 'figure' });
function deriveAxis(inner, declared) {
  const html = String(inner || '');
  const stage = extractStage(html);
  const cell = stage ? html.slice(stage.bodyStart, stage.bodyEnd) : html;
  // EVERY recognizable container in the cell, in order (not only at depth 0: a chart family wraps
  // its figure in `.chart-body`, and `list-tabular` nests its rows one level in).
  const re = /<(table|ul|ol|pre|svg)\b([^>]*)>/gi;
  const found = [];
  let m;
  while ((m = re.exec(cell))) {
    const tag = m[1].toLowerCase();
    // An `<svg>` is only a FIGURE axis when it carries a viewBox — that is what makes it
    // container-responsive. A bare inline `<svg>` glyph (an icon in a list item) is not a
    // collection at all.
    if (tag === 'svg' && !/\bviewBox=/i.test(m[2])) continue;
    const axis = AXIS_OF_TAG[tag];
    if (axis && !found.includes(axis)) found.push(axis);
  }
  if (!found.length) return null;
  const prefer = (Array.isArray(declared) ? declared : [declared]).filter(Boolean);
  // A declared NON-SPLITTABLE axis is a VETO, not a hint. `col` / `cell` mean read-across:
  // `partitionAxis` returns null for them on purpose ("splitting destroys read-across"), and the
  // slide is meant to escalate to the ring instead. Derivation must not route around that — a
  // read-across table renders as a `<table>` like any other, so `AXIS_OF_TAG` would hand back
  // `row` and cut between rows the layout is built to be read across. Rule 1 replaces a MISSING
  // or MIS-SHAPED axis; it does not overrule a component that declared "there is no seam here".
  if (prefer.some((a) => a === 'col' || a === 'cell')) return null;
  // PREFER an axis the component DECLARED, when the rendered DOM offers it.
  //
  // Reading "the first container in the cell" was wrong, and wrong in the worst direction: an
  // author-supplied container ABOVE the component's own collection silently became the seam. An
  // `inventory` slide (declares `item`) with a markdown table above its record bullets derived
  // `row`, so the splitter cut between TABLE ROWS and repeated all six records on all three pages
  // — every one of them clipped, and three records appeared on no page of the PDF. A `checklist`
  // with a small inline `<svg viewBox>` caption above its list derived `figure`, which is not
  // splittable, so a 14-item checklist refused to split and clipped 8 items away. Both were
  // regressions against `main`, both found by the HARD RULE #25 red team on real exports.
  //
  // This is not a retreat from rule 1 — the DOM is still the authority for WHICH declared shape is
  // on the page (that is the `glossary` case the rule exists for: authored as a list, rendered as a
  // table, so `row` wins over its authoring axis). It only stops a FOREIGN container from inventing
  // a seam the component never claimed. When none of the declared axes is present, the DOM decides
  // alone — but by SEAM, not by position: a real collection outranks a `figure`, which is a
  // container-responsive shape with no seam at all. Otherwise a component that declares nothing and
  // carries a decorative viewBox glyph above its list would derive `figure` and refuse to split.
  for (const axis of prefer) if (found.includes(axis)) return axis;
  const seam = found.find((a) => a !== 'figure');
  return seam || found[0];
}

// The span of the slide's PRIMARY COLLECTION container, in `inner` coordinates.
// Selects exactly the container `partitionAxis`/`countAxis` will operate on — for `item` it
// DELEGATES to `firstList` rather than re-deriving the choice, so the envelope and the
// partition cannot disagree about WHICH collection is being cut. (They did: this carried its
// own `indexOf('<ul')` copy of the rule, and when `firstList` learned to pick the primary
// collection instead of the first one, a duplicated copy here would have silently reopened the
// bug it fixes.) The first `<table>` for `row`. Null when the axis has no container here.
function collectionSpan(inner, axis) {
  if (axis === 'item') {
    const list = firstList(inner);
    if (!list) return null;
    // `pre` ends just past the chosen list's own `>`, and `post` starts just past its close —
    // so the container's span is everything between, plus the open and close tags themselves.
    const start = inner.lastIndexOf(`<${list.tag}`, list.pre.length - 1);
    const end = inner.length - list.post.length;
    return start >= 0 ? { start, end } : null;
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

// The two kinds of one-time trailing material, kept apart because they get different
// treatment: a key-insight `<blockquote>` always earns its OWN page (it's the run's
// takeaway); a `.below-note` — or an unwrapped trailing `<p>` on a layout below-note's
// EXCLUDED list keeps raw — is a footnote of the content above it, so it stays attached
// to the last body page instead. Anything else is a component's own structure.
const isKeyInsightEl = (el) => el.name === 'blockquote';
const isTrailingNoteEl = (el) => el.name === 'p' || (el.name === 'div' && /^<div class="below-note"/.test(el.outer));

// Slide-level chrome that is not content and must never end the trailing-run scan. On a
// `.cell-stage` slide these live outside the cell, but a STAGE_DEFERRED / non-Form layout
// has no cell — its region runs to the end of the section, so the Marp `<footer>` sits
// after the note and would otherwise terminate the walk before reaching it.
const CHROME_TAGS = new Set(['header', 'footer', 'nav']);

// The TRAILING spans — the material that trails the collection inside the content cell,
// split into the two kinds above. This is the region `partitionAxis` repeats as `post` on
// every page (the FM-2 duplication), so it must never stay put.
//
// Scanned as a contiguous run BACKWARD from the end of the cell, not "every trailing-ish
// element after the collection": in `…</ul><p>lead-in</p><table>…` that `<p>` introduces
// the table, it is not a note, and lifting it would move a lead-in onto the last page.
// The first non-trailing, non-chrome element walking back therefore ends the run —
// whatever sits before it is the component's own structure, left in place (and still
// repeating). Order within each group is preserved, so an unlikely
// `<p>…</p><blockquote>…</blockquote>` still sends the note to the body and the insight
// to its own page, not garbled together.
function trailingSpansIn(inner, collEnd, cellEnd) {
  const region = inner.slice(collEnd, cellEnd);
  const els = topLevelElements(region).filter((el) => !CHROME_TAGS.has(el.name));
  let first = els.length;
  while (first > 0 && (isKeyInsightEl(els[first - 1]) || isTrailingNoteEl(els[first - 1]))) first -= 1;
  const trailing = els.slice(first).map((el) => ({ start: collEnd + el.start, end: collEnd + el.end, outer: el.outer, name: el.name }));
  return {
    insight: trailing.filter((el) => isKeyInsightEl(el)),
    note: trailing.filter((el) => !isKeyInsightEl(el)),
  };
}

/**
 * BODY pacing — how many members ride one page, BALANCED rather than greedy.
 *
 * `partitionAxis` chunks `i += perSlide`, so feeding it a target directly leaves the
 * last page a runt: 14 checklist items at a target of 6 emit 6/6/2. That is the
 * "jarring uneven slides" the owner's §0b ruling rejects — and it is worse than it
 * sounds, because a collection's members STRETCH to fill the stage
 * (`checklist.styles.css` distributes rows; `cards-grid` uses `align-content:stretch`),
 * so a 2-item page doesn't just hold fewer rows, it holds visibly enormous ones.
 *
 * So: take the target as a CEILING, spread the members evenly over the pages it
 * implies. 14 at 6 → 3 pages → 5/5/4. 6 at 3 → 2 pages → 3/3. A target of 1 (a HEAVY
 * member, `capacity.perPage:1`) → one per page, unchanged. Never returns more than the
 * target, so a page can't grow past what the component declared it can hold.
 */
function balancedPerPage(count, target) {
  const cap = Number.isInteger(target) && target > 0 ? target : count;
  if (!Number.isInteger(count) || count < 1) return cap;
  const pages = Math.max(1, Math.ceil(count / cap));
  return Math.max(1, Math.ceil(count / pages));
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
  const trailing = trailingSpansIn(inner, coll.end, cell.end);
  return {
    coll,
    cell,
    lede: ledeSpansIn(inner, cell.start, coll.start),
    insight: trailing.insight,
    note: trailing.note,
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
  const { header } = chrome;
  const eye = cover.eyebrow ? `<div class="split-feat-eye">${cover.eyebrow}</div>` : '';
  const sub = cover.subtitle ? `<div class="split-feat-sub">${cover.subtitle}</div>` : '';
  const lede = cover.lede ? `<div class="split-feat-lede">${cover.lede}</div>` : '';
  const lead = cover.intro ? `<div class="split-cover-lead">${cover.intro} &rarr;</div>` : '';
  const mark = layoutName ? ` split-cover-${layoutName}` : '';
  const tag = roleOpenTag(openTag, `content lat-split-cover form${mark}`, true, 'cover');
  return `${tag}${header}${eye}<div class="split-feat-h">${cover.heading}</div>${sub}${lede}${lead}${footerCell(openTag, chrome)}</section>`;
}

// Splice the hoisted trailing NOTE back into a body page's inner HTML, exactly where it
// originally sat: right after the collection, before the content cell closes. `pageInner`
// is one of `partitionAxis`'s assembled pages — it reconstructs the same masthead/stage/
// footer shape as the original `inner` (just with a different member subset), so
// `extractStage` finds the SAME cell here it would on the source slide. Falls back to
// right before a trailing `<footer>`, then the very end, for a STAGE_DEFERRED / non-Form
// layout with no `.cell-stage` — mirrors below-note.js's own STAGE_TRAILING_NOTE /
// TRAILING_NOTE fallback (HARD RULE #15 — one placement rule, not a second one authored
// here from scratch).
function injectTrailing(pageInner, noteHtml) {
  if (!noteHtml) return pageInner;
  const stage = extractStage(pageInner);
  if (stage) return pageInner.slice(0, stage.bodyEnd) + noteHtml + pageInner.slice(stage.bodyEnd);
  // No stage (a STAGE_DEFERRED / non-Form layout) — insert before the page's TRAILING CHROME
  // RUN: the maximal run of `<header>`/`<footer>`/`<nav>` elements at the end. Keyed on the
  // chrome run rather than "right before the last `<footer>` if only whitespace follows it",
  // which was the earlier rule and was wrong on a real render: a rendered Form slide ends
  // `…</footer><nav class="tile-progress">…</nav>`, so something DID follow the footer, the
  // check failed, and the note was appended after the section's own chrome. Found while
  // building the rule-6 conservation gate. Structural (`topLevelElements`, the same
  // depth-aware walk the trailing scan uses) rather than a lazy `[\s\S]*?` regex, which
  // backtracks to the EARLIEST `<footer` that can still reach end-of-string and would
  // misplace the note inside a page whose CONTENT mentions a literal `<footer>` (found by
  // the second maker-checker pass — that property is preserved here).
  const els = topLevelElements(pageInner);
  let at = els.length;
  while (at > 0 && CHROME_TAGS.has(els[at - 1].name)) at -= 1;
  if (at < els.length) return pageInner.slice(0, els[at].start) + noteHtml + pageInner.slice(els[at].start);
  return pageInner + noteHtml;
}

/**
 * `injectTrailing`, applied to a WHOLE emitted `<section>…</section>` string rather than a
 * page's inner HTML. The carousel strategies hand back finished sections, so the generic
 * trailing-note hoist in `carouselize` needs to reach inside one; unwrapping here keeps the
 * placement rule itself in one place (HARD RULE #15). Returns the section unchanged when
 * there is nothing to inject or the string is not a section.
 */
function injectTrailingInSection(section, noteHtml) {
  if (!noteHtml) return section;
  const open = section.indexOf('>');
  const closeAt = section.lastIndexOf('</section>');
  if (open < 0 || closeAt <= open) return section;
  const openTag = section.slice(0, open + 1);
  const inner = section.slice(open + 1, closeAt);
  return `${openTag}${injectTrailing(inner, noteHtml)}${section.slice(closeAt)}`;
}

// Mark the hoisted note with the `lat-split-note` class the CSS sizes down — on its OWN
// top-level element(s), never inside a NEW wrapper div. A wrapper breaks the direct-child
// relationship a component's own CSS may key on (`section.stats > .cell-stage > p {
// text-align: center }` no longer matches `.cell-stage > .wrapper > p` — found by the
// second maker-checker pass, which also confirmed `.cell-stage > p.lat-split-note` still
// matches it unchanged). The overwhelmingly common case is ONE trailing element (a
// `.below-note` div or a raw `<p>`) — add the class to its own tag. The rare case of
// SEVERAL trailing elements (a stray `<p>` before a `.below-note`, say) has no single tag
// to mark, so those fall back to one wrapper — `existingNoteIn` below recognizes either
// shape by class alone, not by tag.
function markNote(spans) {
  if (spans.length === 0) return '';
  if (spans.length > 1) return `<div class="lat-split-note">${spans.map((s) => s.outer).join('')}</div>`;
  const [el] = spans;
  return el.outer.replace(/^<([a-zA-Z][\w-]*)((?:\s[^>]*)?)>/, (_, tag, attrs) => {
    const withClass = /\sclass="/.test(attrs)
      ? attrs.replace(/(\sclass=")([^"]*)(")/, `$1$2 lat-split-note$3`)
      : `${attrs} class="lat-split-note"`;
    return `<${tag}${withClass}>`;
  });
}

// A note this module already marked on an EARLIER pass — the measured loop can find a
// body page that already carries one still overflowing, and re-split it FURTHER
// (auto-split.js's `isSplitBody` re-split path). Depth-aware, scoped to the content cell,
// looking for the `lat-split-note` class alone (on WHICHEVER element carries it — a marked
// `.below-note`, a marked raw `<p>`, or the rare multi-element wrapper), not a specific
// tag: placement was already decided on the first cut, this only has to find it again.
// Null when the page carries no note yet (the common case).
function existingNoteIn(inner) {
  const stage = extractStage(inner);
  const cell = stage ? { start: stage.bodyStart, end: stage.bodyEnd } : { start: 0, end: inner.length };
  const found = topLevelElements(inner.slice(cell.start, cell.end))
    .find((el) => /\sclass="[^"]*\blat-split-note\b[^"]*"/.test(el.outer));
  return found ? { start: cell.start + found.start, end: cell.start + found.end, outer: found.outer } : null;
}

/**
 * `partitionAxis`, but safe to call on a page that may already carry an injected NOTE.
 * `partitionAxis` repeats a collection's trailing `post` on every emitted piece — exactly
 * the FM-2 duplication this envelope exists to kill — and a note baked into a PREVIOUS
 * pass's page is part of that `post` now, indistinguishable from any other trailing markup
 * unless something strips it first. So: pull the note out (if one is there), cut, then
 * re-inject it onto the LAST resulting piece only — the same discipline `splitEnvelope`
 * applies on the very first cut, so a SECOND cut can't reopen the bug. A no-op scan (and
 * identical to a bare `partitionAxis`) when there is no note yet.
 */
function partitionKeepingNote(inner, axis, perSlide) {
  const note = existingNoteIn(inner);
  if (!note) return partitionAxis(inner, axis, perSlide);
  const parts = partitionAxis(removeSpans(inner, [note]), axis, perSlide);
  // partitionAxis's "already fits, no split" return is the STRIPPED html (a length-1 array
  // holding its input, collections.js's own tri-state contract) — returning it here as-is
  // would silently drop the note. Re-inject it onto the original, untouched `inner` instead,
  // so this stays a true no-op (byte-identical to `partitionAxis(inner, ...)` sans the
  // strip/reinject round-trip) rather than a note-losing one.
  if (!parts || parts.length < 2) return [inner];
  const last = parts.length - 1;
  return parts.map((frag, k) => (k === last ? injectTrailing(frag, note.outer) : frag));
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
  // The BODY trunk: the section minus everything that must not repeat per page — the
  // lede (hoisted to the cover), the note (spliced back into the LAST body page below),
  // and the key insight (hoisted to its own page below).
  const trunk = removeSpans(inner, [...regions.lede, ...regions.insight, ...regions.note]);
  const count = countAxis(trunk, axis);
  if (count < 2) return null;
  const pages = partitionAxis(trunk, axis, per);
  if (!pages || pages.length < 2) return null; // already fits the cut → leave it whole
  const parts = [coverSection(openTag, chrome, { ...cover, intro: introOf(recipe, count) }, layoutName)];
  // BODY pages — the layout's OWN native finish; partitionAxis already repeated the
  // heading (and a table's <thead>) per page. The cover kept the engine id, so every
  // body page drops it (never duplicate an id).
  const bodyTag = withRole(addClass(openTag.replace(/\s+id="[^"]*"/, ''), 'lat-split-native'), 'body');
  // The NOTE rides the LAST body page ONLY — it is a footnote of the content immediately
  // above it, not a takeaway that earns its own beat (unlike key insight, below), so it
  // stays attached to the run's own last page rather than getting a page of its own.
  // Marked with `lat-split-note` (base.modifiers.css) so it renders one size down — it now
  // shares a page with real content, so it must not compete with it — while its wrap/
  // exclude decision (below-note.js's EXCLUDED list) is completely untouched.
  const noteHtml = markNote(regions.note);
  // NB the RELATIONSHIP SIGNAL (§0b, §8 rule 12a) is deliberately NOT stamped here. It is a
  // RUN-level fact — page k's adornment names page k+1's first member — and a run can be cut
  // across SEVERAL measured passes, so only the converged deck knows its true membership.
  // Stamped here it went both STALE and DOUBLED on a real render: a 5-tier authority-chain cut
  // 3/2 on pass 1 and re-cut 2/1 on pass 2 emitted "governs ↓ Case law" on TWO pages, one of
  // them pointing past its actual neighbor. So it is applied post-convergence by
  // `applyRelationshipSignals` (auto-split.js), exactly as `applyRails` stamps the k-of-N rail
  // and for exactly the same reason.
  for (const [k, frag] of pages.entries()) {
    const body = k === 0 ? frag : withCont(frag);
    const withNote = k === pages.length - 1 ? injectTrailing(body, noteHtml) : body;
    parts.push(`${bodyTag}${withNote}</section>`);
  }
  // INSIGHT — a trailing key-insight blockquote always earns its OWN page, never shared
  // with the note or the body (owner review, 2026-07-26): it's the run's takeaway, not a
  // caption. No "(cont.)": it carries no continuation of the list, so marking it a
  // continuation would undersell it.
  if (regions.insight.length) parts.push(insightPage(openTag, inner, regions));
  return parts;
}

// Build the shared INSIGHT page from the ORIGINAL section — a trailing key-insight
// blockquote's own final page. Factored out of `splitEnvelope` so a strategy that does
// NOT go through it (e.g. `carousel.js`'s `cover-cards`, which re-authors its own body
// from a transposed table rather than partitioning a collection) can still attach the
// SAME insight page rather than silently dropping the blockquote (HARD RULE #15 — one
// insight-page builder, not a second one for every strategy that finds trailing insight
// material). Keeps the layout class + masthead (so the KEY INSIGHT panel CSS, scoped
// `section.<layout> > blockquote`, still applies unchanged) with the collection AND the
// note cut out — nothing else on this page.
/**
 * The trailing material of a section, WITHOUT needing a resolved collection (§8 rule 6).
 *
 * `splitRegions` requires a primary collection because the plain path splits BETWEEN its
 * members. The carousel strategies don't: `cover-code` has no list at all, and the others
 * re-author their body from parsed parts. But they still have trailing material, and every
 * one of them DROPPED a trailing key-insight blockquote outright — measured on all five
 * coverWindow/cover-code strategies with a sentinel. So the trailing scan is factored to
 * work from the content cell alone: same backward walk, same two kinds, no collection.
 */
function trailingMaterialOf(inner) {
  const stage = extractStage(inner);
  const cell = stage ? { start: stage.bodyStart, end: stage.bodyEnd } : { start: 0, end: inner.length };
  return trailingSpansIn(inner, cell.start, cell.end);
}

/**
 * `trailingMaterialOf`, extended one level into the layout's own CONTENT SLOT (§8 rule 12b's
 * "`.cell-stage` / the declared content slot").
 *
 * `split-panel` puts its body — and its `<footer>` — inside `.panel-right`, so a trailing
 * `.below-note` or `<blockquote>` renders THERE, not as a section-level sibling. The top-level
 * scan therefore saw nothing, and `feature-cover` (which re-authors from `readFeature`) dropped
 * it silently. Found by the rule-6 conservation gate.
 *
 * Whatever the descent finds is returned as a NOTE, never an insight — and that is a fact
 * about the CSS, not a shortcut. The KEY INSIGHT treatment is scoped `section > blockquote`
 * and `section > .cell-stage > blockquote` (base.modifiers.css), so a blockquote at this
 * depth was never a key insight even UNSPLIT; promoting it to its own insight page would
 * invent a beat the un-split slide never had. Riding the last body page as a footnote is what
 * it already looked like.
 *
 * Only an explicit `<blockquote>` or `div.below-note` is admitted here — never below-note.js's
 * bare trailing `<p>`, whose rule also does not reach this depth. Without that narrowing the
 * descent would mistake a component's own last paragraph (a card's body, a panel's closing
 * line) for slide-level trailing material and hoist it off its page.
 */
function trailingSlotMaterialOf(inner) {
  const top = trailingMaterialOf(inner);
  if (top.insight.length || top.note.length) return top;
  const els = topLevelElements(inner).filter((el) => !CHROME_TAGS.has(el.name));
  const slot = els.at(-1);
  if (!slot || slot.name !== 'div') return top;
  const open = slot.outer.indexOf('>') + 1;
  const closeAt = slot.outer.lastIndexOf('</');
  if (open <= 0 || closeAt <= open) return top;
  const region = slot.outer.slice(open, closeAt);
  const found = trailingSpansIn(region, 0, region.length);
  const note = [...found.note, ...found.insight]
    .filter((el) => el.name === 'blockquote' || /^<div class="below-note"/.test(el.outer))
    .map((el) => ({ ...el, start: slot.start + open + el.start, end: slot.start + open + el.end }))
    .sort((a, b) => a.start - b.start);
  return { insight: [], note };
}

/**
 * An INSIGHT page for a carousel strategy: the source section with everything in its content
 * cell removed EXCEPT the trailing key-insight. Unlike `insightPage` this needs no `regions`,
 * so it serves the strategies that never resolve a collection. Returns null when there is no
 * insight to carry.
 */
function insightPageFrom(openTag, inner) {
  const { insight } = trailingMaterialOf(inner);
  if (!insight.length) return null;
  const stage = extractStage(inner);
  const cell = stage ? { start: stage.bodyStart, end: stage.bodyEnd } : { start: 0, end: inner.length };
  const keep = new Set(insight.map((s) => `${s.start}:${s.end}`));
  const drop = topLevelElements(inner.slice(cell.start, cell.end))
    .map((el) => ({ start: cell.start + el.start, end: cell.start + el.end, name: el.name }))
    .filter((el) => !CHROME_TAGS.has(el.name) && !keep.has(`${el.start}:${el.end}`));
  const tag = withRole(addClass(openTag.replace(/\s+id="[^"]*"/, ''), 'lat-split-insight'), 'insight');
  return `${tag}${removeSpans(inner, drop)}</section>`;
}

function insightPage(openTag, inner, regions) {
  const insightTag = withRole(addClass(openTag.replace(/\s+id="[^"]*"/, ''), 'lat-split-insight'), 'insight');
  const insightInner = removeSpans(inner, [...regions.lede, regions.coll, ...regions.note]);
  return `${insightTag}${insightInner}</section>`;
}

module.exports = {
  splitEnvelope,
  balancedPerPage,
  partitionKeepingNote,
  readCover,
  readMasthead,
  coverSection,
  roleOpenTag,
  withRole,
  SPLIT_ROLES,
  deriveAxis,
  chromeOf,
  footerCell,
  stripChrome,
  introOf,
  withCont,
  topLevelElements,
  splitRegions,
  insightPage,
  insightPageFrom,
  trailingMaterialOf,
  trailingSlotMaterialOf,
  markNote,
  injectTrailing,
  injectTrailingInSection,
  removeSpans,
};
