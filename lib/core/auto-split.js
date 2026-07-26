/**
 * auto-split.js — the Fit Ladder's SPLIT move, applied at build time
 * (engineering/decisions/2026-06-22-the-fit-spine.md §3).
 *
 * A slide whose content exceeds its box overflows (it clips). Past the readable
 * per-orientation type floor the engine has no smaller size to reach for, so the
 * honest fix is MORE slides, not smaller type. This module re-emits an overflowing
 * slide as several, using the pure `partitionAxis` kernel (lib/core/collections.js).
 *
 * Every split rides the UNIVERSAL ENVELOPE — COVER → BODY(1…n) → CLOSING? — built by
 * lib/core/split-envelope.js (the owner's §0a ruling in
 * engineering/decisions/2026-07-22-structure-derived-split-patterns.md; rule 9). Both
 * passes below route their partition through it, so a plain `capacity.axis` layout gets
 * the same accent lead-in and the same one-time trailing note as a layout with a
 * carousel `split` recipe. `emitParts` (the bare "(cont.)" partition) survives only as
 * the fallback for a TITLE-LESS slide, which has no masthead to build a cover from.
 *
 * Two entry points, one kernel:
 *   · autoSplitDeck — the STATIC pass: split a slide whose collection count exceeds
 *     the layout's `capacity.hard`. A cheap pre-render first cut (count-based).
 *   · resplitDoc — the MEASURED pass: given the slides a real render found to
 *     OVERFLOW (and by how much — the scrollHeight/clientHeight ratio), divide each
 *     by that ratio so it fits. This is what catches DENSITY overflow — a slide with
 *     few but long items that no count threshold sees — which is the dominant cause
 *     in a tall/portrait box. The export driver runs it in a measure→split→re-measure
 *     loop until the deck fits (lattice-emulator.js).
 *
 * Build-time only. Splitting changes slide COUNT, which the engine owns at export,
 * never live — the spine rejects runtime re-pagination (§3). Knows where NOT to
 * split: axes that can't divide without destroying meaning (col/cell read-across,
 * line atomicity) return null from partitionAxis → the slide is LEFT for the ring.
 * Member-level keepTogether is honoured by construction — partitionAxis splits
 * BETWEEN collection members, never within one. Pure + fs-free (capacities and the
 * overflow measurement are passed in), so it is unit-testable in isolation.
 */

const { splitSections } = require('./split-sections');
const { countAxis, partitionAxis } = require('./collections');
const { carouselize } = require('./carousel');
// The universal split envelope — COVER → BODY(1…n) → CLOSING? (§0a of
// engineering/decisions/2026-07-22-structure-derived-split-patterns.md; rule 9). BOTH
// passes below route their plain partition through it, so a split reads the same
// whether the layout declares a carousel recipe or only a `capacity.axis`.
const { splitEnvelope, chromeOf } = require('./split-envelope');

const SPLITTABLE = new Set(['item', 'row']);

// A page this splitter already emitted — a native BODY page (`lat-split-native`) or
// the run's CLOSING page. It has its cover; a page that still overflows must
// paginate FURTHER between its own members, never grow a second cover.
const SPLIT_EMITTED = /\blat-split-(?:native|closing)\b/;

// The first class token carrying a capacity contract is the component the slide is
// built on (modifiers like `compact` carry none). Returns the cap (with its axis);
// each caller checks what it needs (autoSplitDeck wants `hard`, resplitDoc wants a
// splittable axis). Mirrors lint-core's capacity-rule token scan.
function capacityForClass(cls, capacityMap) {
  for (const t of String(cls || '').trim().split(/\s+/)) {
    const cap = capacityMap[t];
    if (cap?.axis || cap?.split) return cap;
  }
  return null;
}

// The layout TOKEN behind that capacity contract (same scan as capacityForClass), so
// the cover can carry its `split-cover-<layout>` tell. '' when the slide is generic.
function layoutTokenFor(cls, capacityMap) {
  return String(cls || '').trim().split(/\s+/).find((t) => {
    const c = capacityMap[t];
    return c?.axis || c?.split;
  }) || '';
}

// Re-emit a section's split `parts` as sibling sections. The continuation copies
// (2nd+) drop the engine's `id="…"` so the split never duplicates ids (the first
// keeps it; `data-lattice-slide` is the real per-slide key), and mark the repeated
// heading "(cont.)" so a split slide reads as part of the previous one. Every other
// attribute is slide-TYPE level (class, theme, paginate…) and correctly repeats.
function emitParts(openTag, parts) {
  const contTag = openTag.replace(/\s+id="[^"]*"/, '');
  return parts.map((inner, k) => {
    if (k === 0) return `${openTag}${inner}</section>`;
    const cont = inner.replace(/<\/(h[12])>/, ' <span class="lat-cont">(cont.)</span></$1>');
    return `${contTag}${cont}</section>`;
  });
}

// The progress rail can't be stamped per split-call: a slide may be split across SEVERAL
// measured passes, so only the final, converged deck knows a run's true k-of-N. Instead,
// each split set is TAGGED with a stable run id at split time, and `applyRails` stamps the
// rails once at the end (lattice-emulator.js), grouping by that id.

// A split set's run id — the original slide's engine `id` (unique + stable across the
// renumber). Continuations carry it forward on their copied openTag, so every page derived
// from one slide shares one run. Falls back to data-lattice-slide if a slide has no id.
function runIdOf(openTag) {
  const m =
    openTag.match(/\sdata-split-run="([^"]*)"/) ||
    openTag.match(/\sid="([^"]*)"/) ||
    openTag.match(/\sdata-lattice-slide="([^"]*)"/);
  return m ? m[1] : null;
}

// Tag each section of a split set with `data-split-run` (skip if already tagged, so a
// later re-split preserves the original run rather than starting a new one). Joined HTML.
function stampRun(sections, runId) {
  if (!runId) return sections.join('');
  return sections
    .map((s) => {
      const firstTag = s.slice(0, s.indexOf('>'));
      if (/\sdata-split-run="/.test(firstTag)) return s;
      return s.replace(/^<section\b/, `<section data-split-run="${runId}"`);
    })
    .join('');
}

// FINAL pass (post-convergence) — stamp the k-of-N progress rail run by run. A "run" is a
// maximal sequence of consecutive sections sharing `data-split-run`; each member gets a rail
// lit through its position. Strips any rail a prior call left (idempotent). The rail uses
// currentColor so it reads on the accent cover AND the body pages. Pure string op.
function applyRails(html) {
  const stripped = html.replace(/<nav class="lat-split-rail"[\s\S]*?<\/nav>/g, '');
  // Only the real slide region — the assembled doc's <head> carries inlined CSS whose
  // comments/selectors mention "<section …>" as text, which would derail the section
  // walker. Slide siblings start at the first data-lattice-slide (mirrors resplitDoc).
  const firstSlide = stripped.search(/<section\b[^>]*\bdata-lattice-slide=/);
  if (firstSlide < 0) return stripped;
  const prefix = stripped.slice(0, firstSlide);
  const parts = splitSections(stripped.slice(firstSlide));
  const runs = [];
  let cur = null;
  parts.forEach((p, idx) => {
    if (p.type !== 'section') return; // whitespace gaps between members don't break a run
    // Group on `data-split-run` ALONE — only a real split member carries it. (Don't fall
    // back to id/data-lattice-slide here: that is for MINTING a run id at split time, not
    // grouping; a plain slide carries an id and must never be pulled into a neighbour's run.)
    const rid = (p.openTag.match(/\sdata-split-run="([^"]*)"/) || [])[1] || null;
    if (rid && cur && cur.rid === rid) cur.members.push(idx);
    else if (rid) { cur = { rid, members: [idx] }; runs.push(cur); }
    else cur = null;
  });
  const railOf = new Map();
  // A cover-paginate body page can carry a CONTINUING CSS counter (q-and-a's "01" index).
  // Each body page's list resets the counter, so without help page 2 restarts at "01".
  // Set --lat-split-offset to the count of items emitted on PRIOR body pages of the run, so
  // the layout's `counter-reset: qa var(--lat-split-offset, 0)` continues the numbering.
  // Computed here (post-convergence) so it's correct no matter how many passes split the run.
  const offsetOf = new Map();
  for (const run of runs) {
    const total = run.members.length;
    if (total < 2) continue;
    let itemAcc = 0;
    run.members.forEach((idx, k) => {
      const segs = Array.from({ length: total }, (_, j) => `<span class="seg${j <= k ? ' on' : ''}"></span>`).join('');
      railOf.set(idx, `<nav class="lat-split-rail" aria-hidden="true">${segs}</nav>`);
      const p = parts[idx];
      if (/\blat-split-native\b/.test(p.openTag)) {
        if (itemAcc > 0) offsetOf.set(idx, itemAcc);
        itemAcc += countAxis(p.inner, 'item');
      }
    });
  }
  if (railOf.size === 0) return stripped;
  const withOffset = (tag, n) =>
    /\sstyle="/.test(tag)
      ? tag.replace(/(\sstyle=")([^"]*)"/, (_, a, s) => `${a}${s}--lat-split-offset:${n};"`)
      : tag.replace(/^<section\b/, `<section style="--lat-split-offset:${n};"`);
  return prefix + parts
    .map((p, idx) => {
      if (p.type !== 'section') return p.text;
      const tag = offsetOf.has(idx) ? withOffset(p.openTag, offsetOf.get(idx)) : p.openTag;
      return `${tag}${p.inner}${railOf.get(idx) || ''}</section>`;
    })
    .join('');
}

// Re-stamp the deck's page numbers after a split inserted pages. Each number is baked
// TWICE at engine time — the `data-lattice-pagination` attribute (which
// `section.form::after` renders when a slide has no footer CELL, e.g. the split cover)
// and the REAL `<span class="lat-pagination">` masthead-lift puts inside `.cell-footer`
// — so a split, which copies the openTag AND the inner verbatim, repeated the original
// slide's number on every page of the run. (The visible number came from the span,
// which nothing renumbered: every body page of a split showed the FIRST page's number.)
// Walk the sections in document order and re-stamp both from ONE counter, then refresh
// the totals. Only a section that CARRIES the attribute advances the counter (a
// `paginate: false` slide has none, and must not be numbered); the gaps between
// sections — where a trailing chrome <script>/<style> can mention the attribute as
// prose — pass through byte-identical.
function repaginate(html) {
  const parts = splitSections(html);
  const total = parts.filter((p) => p.type === 'section' && /\bdata-lattice-pagination="/.test(p.openTag)).length;
  if (total === 0) return html;
  let pg = 0;
  return parts
    .map((p) => {
      if (p.type !== 'section') return p.text;
      if (!/\bdata-lattice-pagination="/.test(p.openTag)) return `${p.openTag}${p.inner}</section>`;
      pg += 1;
      const tag = p.openTag
        .replace(/(\bdata-lattice-pagination=")\d+(")/, `$1${pg}$2`)
        .replace(/(\bdata-lattice-pagination-total=")\d+(")/, `$1${total}$2`);
      const inner = p.inner.replace(/(<span class="lat-pagination">)\d+(<\/span>)/, `$1${pg}$2`);
      return `${tag}${inner}</section>`;
    })
    .join('');
}

// STATIC pass — split a slide whose render-exact count EXCEEDS `capacity.hard`,
// into COMFORTABLE `sweet`-sized chunks (a slide packed to `hard` still crowds the
// footer; falls back soft → hard). Returns `{ html, splits }`; a non-overflowing
// deck is byte-identical (splits === 0).
function autoSplitDeck(html, capacityMap) {
  let splits = 0;
  const out = splitSections(html).map((p) => {
    if (p.type !== 'section') return p.text;
    const whole = `${p.openTag}${p.inner}</section>`;
    const cap = capacityForClass(p.cls, capacityMap);
    // A layout that declares a carousel `split` recipe is owned by the MEASURED pass
    // (resplitDoc → carouselize), which re-authors its body as well as covering it. The
    // static count pass must not pre-split it between members here.
    if (!cap || cap.split || cap.hard == null || !SPLITTABLE.has(cap.axis)) return whole;
    if (countAxis(p.inner, cap.axis) <= cap.hard) return whole;
    const perSlide = cap.sweet ?? cap.soft ?? cap.hard;
    // The universal envelope (§0a): cover → native body pages → optional closing.
    const envelope = splitEnvelope(p.openTag, p.inner, chromeOf(p.inner), {
      axis: cap.axis,
      per: perSlide,
      layoutName: layoutTokenFor(p.cls, capacityMap),
    });
    if (envelope) {
      splits += 1;
      return stampRun(envelope, runIdOf(p.openTag));
    }
    // No masthead to cover with (a title-less slide) — an accent cover would be an
    // empty field, so the honest fallback is the bare partition: the heading (if any)
    // repeats with "(cont.)", exactly as before the envelope landed.
    const parts = partitionAxis(p.inner, cap.axis, perSlide);
    if (!parts || parts.length <= 1) return whole; // not splittable → leave for the ring
    splits += 1;
    return stampRun(emitParts(p.openTag, parts), runIdOf(p.openTag));
  });
  const joined = out.join('');
  // Splitting inserted pages, so the engine-baked page numbers are stale.
  return { html: splits ? repaginate(joined) : joined, splits };
}

// MEASURED pass — given `overflow` (the slides a real render found to clip, each
// `{ slide, ratio }` where slide is the `data-lattice-slide` index and ratio is
// scrollHeight/clientHeight), divide each overflowing SPLITTABLE slide into
// `ceil(ratio)` pieces so it fits — regardless of item COUNT (this is what catches
// density overflow). Then renumber `data-lattice-slide` across the whole deck, since
// the splits shifted the indices. Returns `{ html, changed }`; changed === 0 means
// nothing here could be split (the remaining overflow is read-across / atomic / a
// single item taller than the page — for the ring, not the splitter). Operates on
// the fully-assembled export doc, so the caller can re-render and re-measure it.
function resplitDoc(docHtml, overflow, capacityMap) {
  const ratioOf = new Map(overflow.map((o) => [o.slide, o.ratio || 2]));
  let changed = 0;
  // The fully-assembled doc carries embedded <script>/<style> chrome whose comments
  // mention "<section …>" as prose — substrings that derail the depth-aware section
  // walker (it never balances a close and bails). The real slides are flat siblings
  // starting at the first data-lattice-slide; slice the head prefix off so the walker
  // only ever sees genuine slide elements. (A bare slide string → firstSlide 0 → no-op.)
  const firstSlide = docHtml.search(/<section\b[^>]*\bdata-lattice-slide=/);
  if (firstSlide < 0) return { html: docHtml, changed: 0 };
  const prefix = docHtml.slice(0, firstSlide);
  // The splits shift the running order, so renumber data-lattice-slide as we emit —
  // but ONLY within the section fragments, never the gaps (a trailing chrome
  // <script>/<style> can carry a literal `<section data-lattice-slide="N">` as prose;
  // renumbering it would corrupt the chrome). Gaps pass through byte-identical.
  let n = 0;
  const renumber = (frag) => frag.replace(/(<section\b[^>]*\bdata-lattice-slide=")\d+(")/g, (_, a, b) => `${a}${(n += 1)}${b}`);
  const body = splitSections(docHtml.slice(firstSlide))
    .map((p) => {
      if (p.type !== 'section') return p.text;
      const whole = `${p.openTag}${p.inner}</section>`;
      const sm = p.openTag.match(/data-lattice-slide="(\d+)"/);
      const slide = sm ? Number(sm[1]) : 0;
      if (!ratioOf.has(slide)) return renumber(whole);
      const cap = capacityForClass(p.cls, capacityMap);
      if (!cap) return renumber(whole);
      // A page this splitter already emitted — a native BODY page or the run's CLOSING —
      // carries its cover; if it still overflows it must paginate FURTHER between its own
      // members, not grow a second cover. So skip both cover-emitting branches for it.
      const isSplitBody = SPLIT_EMITTED.test(p.cls);
      // The layout token (the class with the capacity/split contract — same scan as
      // capacityForClass) so the cover can carry a `split-cover-<layout>` tell.
      const layoutName = layoutTokenFor(p.cls, capacityMap);
      // Read-across (or cover-paginate's first cut) with a carousel `split` recipe:
      // re-author the slide as a sequence (a cover + content) instead of leaving it for the
      // ring. carouselize returns null if the section doesn't parse → fall through.
      if (cap.split && !isSplitBody) {
        const carousel = carouselize(p.openTag, p.inner, cap.split, ratioOf.get(slide), layoutName);
        if (carousel && carousel.length > 1) {
          changed += 1;
          return renumber(stampRun(carousel, runIdOf(p.openTag)));
        }
        return renumber(whole);
      }
      // A cover-paginate body re-split paginates on the recipe's axis (its native render
      // form may differ from any authoring-time capacity axis — e.g. glossary authors as a
      // list but renders as a table); a plain-pagination slide uses its capacity axis.
      const axis = isSplitBody && cap.split?.axis ? cap.split.axis : cap.axis;
      if (!SPLITTABLE.has(axis)) return renumber(whole); // read-across / atomic → the ring
      const count = countAxis(p.inner, axis);
      if (count <= 1) return renumber(whole); // a single item taller than the page — can't split
      const pieces = Math.max(2, Math.ceil(ratioOf.get(slide) - 0.02));
      const perSlide = Math.max(1, Math.ceil(count / pieces));
      if (perSlide >= count) return renumber(whole);
      // A FIRST cut of a plain-pagination slide gets the universal envelope (§0a) — the
      // same cover → body → closing shape cover-paginate gets. A re-split of a page we
      // already emitted stays a bare partition of its own members.
      if (!isSplitBody) {
        const envelope = splitEnvelope(p.openTag, p.inner, chromeOf(p.inner), { axis, per: perSlide, layoutName });
        if (envelope) {
          changed += 1;
          return renumber(stampRun(envelope, runIdOf(p.openTag)));
        }
      }
      const parts = partitionAxis(p.inner, axis, perSlide);
      if (!parts || parts.length <= 1) return renumber(whole);
      changed += 1;
      return renumber(stampRun(emitParts(p.openTag, parts), runIdOf(p.openTag)));
    })
    .join('');
  // Splitting/carouselizing inserts pages, so the engine-baked page numbers are stale.
  // Scoped to the slide region: the head prefix carries inlined CSS whose comments can
  // mention the attribute as prose.
  return { html: prefix + (changed ? repaginate(body) : body), changed };
}

module.exports = { autoSplitDeck, resplitDoc, capacityForClass, layoutTokenFor, repaginate, applyRails };
