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
 *   · autoSplitDeck — the STATIC pass, DEFER-ONLY since §8 rule 10: it counts a slide's
 *     collection against `capacity.hard` and NAMES the slides at risk, but emits no partition.
 *     A cut here would be on the AUTHORING-shape axis, and that can disagree with the rendered
 *     one; every real cut (and its cover) comes from the measured pass, which reads the real DOM.
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
// `partitionAxis` is no longer called here: rule 10 retired the pre-render CUT, and the measured
// pass's bare-partition fallback goes through `partitionKeepingNote` (which wraps it).
const { countAxis } = require('./collections');
const { carouselize } = require('./carousel');
// The universal split envelope — COVER → BODY(1…n) → CLOSING? (§0a of
// engineering/decisions/2026-07-22-structure-derived-split-patterns.md; rule 9). BOTH
// passes below route their plain partition through it, so a split reads the same
// whether the layout declares a carousel recipe or only a `capacity.axis`.
const { splitEnvelope, balancedPerPage, partitionKeepingNote, chromeOf, withRole, injectTrailing, deriveAxis } = require('./split-envelope');
// ONE docking rule for both wayfinding marks in the footer band — shared with the progress
// Tile's section rail rather than cloned here (HARD RULE #15).
const { dockInFooterCell } = require('./footer-dock');
// The cross-slide relationship signal (§0b, §8 rule 12a). Applied POST-CONVERGENCE, below,
// for the same reason the k-of-N rail is: a run can be cut across several measured passes.
const { RELATIONSHIPS, relationshipSignals, membersIn } = require('./relationship');

const SPLITTABLE = new Set(['item', 'row']);

// A page this splitter emitted that must never grow a SECOND cover — a native BODY page
// (`lat-split-native`, which may carry the hoisted trailing note) or the run's dedicated
// key-INSIGHT page. It already has its cover; if it still overflows it must paginate
// FURTHER between its own members.
// NOT exhaustive by design: `cover-cards` body pages carry `lat-split-cards` and are
// absent here (as they were before the envelope). They re-enter the carousel branch and
// bail harmlessly — `parseTable` finds no `<table>` on a transposed cards page — so
// adding them would change no output; noted in the P-envelope entry of
// engineering/decisions/2026-07-22-structure-derived-split-patterns.md rather than
// widened here, since the carousel side is P1's scope, not this slice's.
const SPLIT_EMITTED = /\blat-split-(?:native|insight)\b/;

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

// The SPLIT TARGET — the most members this layout puts on one page of a split run.
// Authored `capacity.perPage` when the component declares one (a HEAVY member atomizes:
// cards-grid / cards-stack / actors / policy-recommendation declare 1, because a card
// carrying a title AND a body clause reads as one page's worth, and packing them is what
// produced the uneven run). Otherwise a LIGHT member (bullets, tiles) packs to its
// authoring comfort, `sweet` → `soft` → `hard`. The caller balances the actual cut across
// the pages this implies (`balancedPerPage`), so the target is a ceiling, never a greedy
// chunk size. §0b granularity table; pacing is authored, never guessed from content (§3f).
// The axes this component's manifest CLAIMS it can be built on, most specific first — the
// preference `deriveAxis` uses when the rendered cell offers more than one container (§8 rule 1's
// boundary: the DOM decides which declared shape is present, it does not let a foreign container
// invent a seam the component never claimed).
function declaredAxes(cap) {
  return [cap?.split?.axis, cap?.axis].filter(Boolean);
}

function splitTargetOf(cap) {
  return cap?.perPage ?? cap?.sweet ?? cap?.soft ?? cap?.hard ?? null;
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
  // Role-stamped like every other split path (§8 rule 9): a title-less run has no cover to
  // build, but its pages are still BODY pages of a run, and the invariant gate keys on the
  // role — so leaving these unstamped would put the one path that legitimately has no cover
  // outside the gate's view, which is the hole the class-keyed gate had.
  const firstTag = withRole(openTag, 'body');
  const contTag = withRole(openTag.replace(/\s+id="[^"]*"/, ''), 'body');
  return parts.map((inner, k) => {
    if (k === 0) return `${firstTag}${inner}</section>`;
    // Idempotent: a k>=1 piece from a SECOND measured pass (re-splitting a page an
    // earlier pass already marked "(cont.)") already carries the marker in its heading —
    // inserting a second one would read "Heading (cont.) (cont.)" (found by the third
    // maker-checker pass, on-path per HARD RULE #18: this is the exact branch that can
    // now re-fire a previously-split native body page via `partitionKeepingNote`).
    const cont = inner.includes('class="lat-cont"')
      ? inner
      : inner.replace(/<\/(h[12])>/, ' <span class="lat-cont">(cont.)</span></$1>');
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


/**
 * Rendered page index → the AUTHORED slide it came from (both 1-based).
 *
 * Splitting changes the page count, so anything keyed by slide index silently
 * misbinds afterwards. Speaker notes hit this first and hardest (a deck with one split
 * slide lost EVERY annotation); front-matter `captions:[n]` hit it next, and was
 * "solved" by DROPPING the whole map on any split deck — acceptable while splitting was
 * opt-in, not once it is intrinsic. This is the general answer, so the next index-keyed
 * channel does not have to invent a third one.
 *
 * A run is contiguous by construction — the splitter emits a slide's pages consecutively
 * — and every page of it shares one `data-split-run`, carried forward across re-splits
 * (`runIdOf` seeds it from the slide's stable engine `id`). So walking the final sections
 * in order and advancing the authored counter whenever the run changes (or a page has no
 * run at all) reconstructs the mapping exactly, without needing a second stamp.
 *
 * @param {{openTag: string}[]} sections final, post-split sections in document order
 * @returns {number[]} `map[i]` is the 1-based authored slide for 1-based page `i + 1`
 */
function authoredIndexPerPage(sections) {
  const list = Array.isArray(sections) ? sections : [];
  let authored = 0;
  let prevRun = null;
  return list.map((p) => {
    const run = runIdOf(String(p?.openTag || ''));
    // No run → an untouched slide. A DIFFERENT run → the first page of the next split
    // slide. The same run → another page of the slide we are already on.
    if (!run || run !== prevRun) authored += 1;
    prevRun = run;
    return authored;
  });
}

// FINAL pass (post-convergence) — stamp the k-of-N progress rail run by run. A "run" is a
// maximal sequence of consecutive sections sharing `data-split-run`; each member gets a rail
// lit through its position. Strips any rail a prior call left (idempotent). The rail uses
// currentColor so it reads on the accent cover AND the body pages. Pure string op.
function applyRails(html) {
  const stripped = html.replace(/<div class="lat-split-rail"[\s\S]*?<\/div>/g, '');
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
      // `div`, not `nav` — the rail is aria-hidden decoration, so claiming the
      // navigation role and then hiding it was over-tagging (semantic-html ADR §17.6).
      railOf.set(idx, `<div class="lat-split-rail" aria-hidden="true">${segs}</div>`);
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
  // Dock the k-of-N rail INTO the footer Cell when the frame has one — just left of the page
  // number — exactly as the progress Tile docks the SECTION rail (progress.transform.js;
  // HARD RULE #15, one docking rule). Appended at section level before, where it stayed
  // absolutely positioned at a fixed `right` and was drawn ON TOP of the section rail, which
  // inside a footer Cell goes `position: static` and so has no bounded berth to offset from.
  // Seen on a real portrait render: the k-of-N segments struck through the section label.
  // Frames with no footer Cell (the re-authored split cover/body pages) keep the positioned
  // rail, which clears the section rail's reserved 30cqi berth in CSS. `dockInFooterCell` is
  // the SHARED helper, not a copy of the Tile's replace — one docking rule for both marks.
  return prefix + parts
    .map((p, idx) => {
      if (p.type !== 'section') return p.text;
      const tag = offsetOf.has(idx) ? withOffset(p.openTag, offsetOf.get(idx)) : p.openTag;
      const rail = railOf.get(idx);
      return `${tag}${rail ? dockInFooterCell(p.inner, rail) : p.inner}</section>`;
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
//
// COUNT EVERY SLIDE, exactly as the engine does (lib/engine/slides.js §3): the number is
// the slide's ABSOLUTE 1-based position and the total is the whole deck's slide count. A
// `paginate: false` slide carries no attribute — so it is not numbered — but it still
// ADVANCES the counter, or every page after a hidden slide would read one low and the
// total would undercount (the bug slides.js's own comment records as caught by the parity
// sweep; renumbering only the paginated sections reintroduces it, and now that the visible
// `.lat-pagination` span is re-stamped too, it would be a *visible* wrong number on slides
// the split never touched). The gaps between sections — where a trailing chrome
// <script>/<style> can mention the attribute as prose — pass through byte-identical.
function repaginate(html) {
  const parts = splitSections(html);
  const total = parts.filter((p) => p.type === 'section').length;
  if (total === 0) return html;
  let pg = 0;
  return parts
    .map((p) => {
      if (p.type !== 'section') return p.text;
      pg += 1;
      if (!/\bdata-lattice-pagination="/.test(p.openTag)) return `${p.openTag}${p.inner}</section>`;
      const tag = p.openTag
        .replace(/(\bdata-lattice-pagination=")\d+(")/, `$1${pg}$2`)
        .replace(/(\bdata-lattice-pagination-total=")\d+(")/, `$1${total}$2`);
      const inner = p.inner.replace(/(<span class="lat-pagination">)\d+(<\/span>)/, `$1${pg}$2`);
      return `${tag}${inner}</section>`;
    })
    .join('');
}

/**
 * STATIC pass — DEFER ONLY (§8 rule 10).
 *
 * "The pre-render count pass may only DEFER, never CUT. With axis derivation at render time, the
 * startup pass's sole job is 'might this overflow? → hand it to the measured loop.' It must not
 * emit a final partition on the *authoring*-shape axis (which would land coverless and the
 * measured pass can't retro-wrap it). Any real cut + its cover is produced by the render-time
 * builder that reads the real DOM, so the estimate axis and the split axis can't disagree in
 * shipped bytes."
 *
 * So this pass no longer cuts anything. It counts the collection against `capacity.hard` and
 * returns the slide numbers it considers AT RISK; the measured loop — which runs in the same
 * invocation, after a real render — owns every cut and every cover. `deferred` is advisory: the
 * emulator logs it so an author sees which slides the estimate flagged, and it changes no bytes.
 *
 * What "defer" does NOT mean, and an earlier version of this comment got wrong: it does not mean
 * a slide over `capacity.hard` that FITS is left alone. `deferred` is fed into the FIRST measured
 * pass as a candidate (`lattice-emulator.js`, `DEFERRED_BY_COUNT`), so such a slide is still cut —
 * by the render-time builder, on the derived axis, with a cover. That is the point of deferring
 * rather than dropping the count signal: `lint:deck`'s `capacity-autosplit` advisory tells the
 * author "auto-split will divide this into 2 pages of 4", and that promise has to stay true. What
 * moves is WHERE the cut is made, not WHETHER one happens.
 *
 * (The behavior is worth revisiting on its own — a 10-one-word-item `checklist` over a `hard` of 9
 * fits comfortably and still becomes three pages, two of them mostly white. But that is a change
 * to what `capacity.hard` MEANS, which is the owner's call and not this rule's business.)
 *
 * `splits: 0` always, kept in the return shape so callers that log it need no change.
 */
// (was: split a slide whose render-exact count EXCEEDS `capacity.hard`,
// into COMFORTABLE `sweet`-sized chunks — a slide packed to `hard` still crowds the
// footer; falls back soft → hard). Returns `{ html, splits }`; a non-overflowing
// deck is byte-identical (splits === 0).
// A SPECIMEN slide opts out of pagination, per-slide. `<!-- stress-slide -->` already
// means "this slide EXISTS to show the upper limit" — the gallery builder emits it and
// lint-core reads it to suppress `capacity-crowd` — so paginating it would paginate it
// out of showing the thing it exists to show. This is the ONLY opt-out: the deck-level
// `autosplit:` directive is retired, because a deck is authored once and presented at
// many sizes, so its page count is a function of the content and the box rather than an
// authoring switch (2026-07-29-autosplit-is-not-a-toggle.md). Per-SLIDE is the right
// altitude for "this one is the exhibit"; per-DECK never was.
const SPECIMEN_RE = /<!--\s*stress-slide\s*-->/;

function autoSplitDeck(html, capacityMap) {
  const deferred = [];
  // 1-based ORDINAL position, not `data-lattice-slide`: this pass runs BEFORE the emulator stamps
  // that attribute (it stamps it from this pass's own output), so reading it here yielded 0.
  let ordinal = 0;
  splitSections(html).forEach((p) => {
    if (p.type !== 'section') return;
    ordinal += 1;
    if (SPECIMEN_RE.test(p.inner)) return; // a specimen shows overflow on purpose
    const cap = capacityForClass(p.cls, capacityMap);
    // A layout with a carousel `split` recipe is the measured pass's business either way.
    if (!cap || cap.split || cap.hard == null) return;
    // The pre-render COUNT estimate is the one thing `capacity.axis` is still for (rule 1): it is
    // an authoring-shape claim, and this pass runs before anything has been measured, so it can
    // only ever be an estimate. The real axis comes from the rendered DOM at cut time.
    const axis = deriveAxis(p.inner, declaredAxes(cap));
    if (!SPLITTABLE.has(axis)) return;
    if (countAxis(p.inner, axis) > cap.hard) {
      deferred.push(ordinal);
    }
  });
  return { html, splits: 0, deferred };
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
      if (SPECIMEN_RE.test(p.inner)) return renumber(whole); // a specimen rings, by design
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
      // The axis is READ FROM THE RENDERED DOM (rule 1) — but only where the layout has no
      // carousel RECIPE. A recipe declares its own seam, and derivation must not invent one it
      // deliberately doesn't have: `redline` declares `redline-blocks` and NO axis, because its
      // members are two passages and its own record says "never splits a passage mid-sentence".
      // Derived blindly, its `lat-split-native` pages resolved `item` from the why-list and the
      // splitter cut the reasoning away from the passage it explains (seen on a real render: one
      // extra page, and a clip). So: a recipe's declared axis (or none → the ring) for a recipe
      // layout, the rendered DOM for a plain one — which is where the authoring/render mismatch
      // rule 1 exists to kill actually bites (glossary authors a list, renders a table).
      const axis = cap.split ? (cap.split.axis || null) : deriveAxis(p.inner, declaredAxes(cap));
      if (!SPLITTABLE.has(axis)) return renumber(whole); // read-across / atomic → the ring
      const count = countAxis(p.inner, axis);
      if (count <= 1) return renumber(whole); // a single item taller than the page — can't split
      // The measured cut may only go DENSER than the authored target, never looser: the
      // ratio says how much this slide overflowed, the target says how much the component
      // will hold on one page. Take the tighter, then balance it so the run is even.
      const pieces = Math.max(2, Math.ceil(ratioOf.get(slide) - 0.02));
      const ratioPer = Math.max(1, Math.ceil(count / pieces));
      const target = splitTargetOf(cap);
      const perSlide = balancedPerPage(count, target == null ? ratioPer : Math.min(target, ratioPer));
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
      // `partitionKeepingNote` — not a bare `partitionAxis` — because THIS re-split branch
      // is the one that can hit a page an earlier pass already gave a `.lat-split-note`
      // (an `isSplitBody` re-split of a native body page); a bare `partitionAxis` would
      // repeat that note on every new piece, reopening the exact duplication the envelope
      // exists to kill. A no-op scan (and byte-identical to `partitionAxis`) when no note
      // is there yet — the title-less first-cut fallback this line also serves.
      const parts = partitionKeepingNote(p.inner, axis, perSlide);
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

/**
 * FINAL pass (post-convergence) — stamp the RELATIONSHIP SIGNAL on every body page of every
 * split run whose component declares a `capacity.relationship` (§0b, §8 rule 12a):
 * "→ next: {next step}" · "↻ back to {stage 1}" · "governs ↓ {next tier}" ·
 * "Option N of M · comparing {criteria}".
 *
 * Runs here, beside `applyRails`, and NOT inside `splitEnvelope`, because the signal is a
 * RUN-level fact: page k's adornment names page k+1's FIRST member, so it is only correct
 * once the run's membership is final. Stamped at split time it was both stale and doubled on a
 * real render — a 5-tier authority-chain cut 3/2 on pass 1 and re-cut 2/1 on pass 2 carried
 * "governs ↓ Case law" on two pages, one of them naming a tier that was no longer its
 * neighbor. (Exactly the failure `applyRails`'s own comment predicts for anything run-level.)
 *
 * Idempotent: strips any signal a prior call left, then re-derives. Runs are grouped on
 * `data-split-run` (only a real split member carries it) and the signal lands on `body`-role
 * pages only — never the accent cover, never the key-insight page, which are not members.
 */
function applyRelationshipSignals(html, capacityMap) {
  const stripped = html.replace(/<div class="lat-split-rel">[\s\S]*?<\/div>/g, '');
  if (!capacityMap || !Object.keys(capacityMap).length) return stripped;
  const firstSlide = stripped.search(/<section\b[^>]*\bdata-lattice-slide=/);
  if (firstSlide < 0) return stripped;
  const prefix = stripped.slice(0, firstSlide);
  const parts = splitSections(stripped.slice(firstSlide));
  // Group consecutive sections sharing a run id — the same grouping rule applyRails uses.
  const runs = [];
  let cur = null;
  parts.forEach((p, idx) => {
    if (p.type !== 'section') return;
    const rid = (p.openTag.match(/\sdata-split-run="([^"]*)"/) || [])[1] || null;
    if (rid && cur && cur.rid === rid) cur.members.push(idx);
    else if (rid) { cur = { rid, members: [idx] }; runs.push(cur); }
    else cur = null;
  });
  const signalOf = new Map();
  for (const run of runs) {
    const bodies = run.members.filter((idx) => /\sdata-split-role="body"/.test(parts[idx].openTag));
    if (bodies.length < 2) continue;
    // Resolve the contract from a BODY page, never the run's first member: the accent COVER's
    // class is swapped to `content lat-split-cover form` (roleOpenTag), and `content` carries a
    // capacity contract of its own — so reading the cover found the WRONG component's cap, whose
    // `relationship` is null, and every signal silently vanished. Body pages keep the layout
    // class, which is the whole point of "the body stays native".
    const cap = capacityForClass(parts[bodies[0]].cls, capacityMap);
    const kind = cap?.relationship;
    if (!RELATIONSHIPS.includes(kind)) continue;
    // The axis the run was actually cut on — DERIVED FROM THE PAGE, like the cut itself
    // (§8 rule 1), with the declared axes as the preference the derivation resolves against.
    // Reading `cap.split?.axis || cap.axis` alone was reading the AUTHORING-SHAPE claim while
    // the cut had been made from the rendered DOM, and rule 1 exists precisely because those
    // two can disagree. When they did, `membersIn` looked for a collection that is not on the
    // page: the three narrative kinds went silent and `comparison` printed a count of zero.
    const axis = deriveAxis(parts[bodies[0]].inner, declaredAxes(cap)) || cap.split?.axis || cap.axis;
    const signals = relationshipSignals(kind, bodies.map((idx) => membersIn(parts[idx].inner, axis)));
    if (!signals) continue;
    bodies.forEach((idx, k) => { if (signals[k]) signalOf.set(idx, signals[k]); });
  }
  if (signalOf.size === 0) return stripped;
  return prefix + parts
    .map((p, idx) => {
      if (p.type !== 'section') return p.text;
      const sig = signalOf.get(idx);
      // After the trailing note, so the wayfinding line reads last — `injectTrailing` places it
      // at the end of the content cell, the same seam the note uses.
      return `${p.openTag}${sig ? injectTrailing(p.inner, sig) : p.inner}</section>`;
    })
    .join('');
}

module.exports = {
  authoredIndexPerPage, autoSplitDeck, resplitDoc, capacityForClass, layoutTokenFor, repaginate, applyRails, applyRelationshipSignals };
