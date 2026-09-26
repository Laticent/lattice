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
 * engineering/decisions/2026-07-22-structure-derived-split-patterns.md; rule 9), so a plain
 * `capacity.axis` layout gets the same accent lead-in and the same one-time trailing note as
 * a layout with a carousel `split` recipe. `emitParts` (the bare "(cont.)" partition) survives
 * only as the fallback for a TITLE-LESS slide, which has no masthead to build a cover from.
 *
 * ONE entry point, because there is ONE trigger:
 *   · splitDoc — the STRUCTURAL pass: a slide whose primary collection holds more than one
 *     member becomes one page per member, decided from the markup. Nothing is rendered and no
 *     ratio is consulted, so the same deck cuts the same way on every machine and `lint:deck`
 *     can state the exact page count an author will get. It runs ONCE per render, through the
 *     shared preprocessor lib/core/structural-split.js — in the CLI export (lattice-emulator.js)
 *     and in the Playground's live preview (lib/playground/index.js `splitForPreview`).
 *
 * TWO earlier entry points are gone, and this docblock described both of them long after they
 * were deleted — the exact defect the change that removed them was written about.
 *   · `autoSplitDeck`, a pre-render count pass, went on 2026-07-29.
 *   · `resplitDoc`, the MEASURED pass, went on 2026-09-01. It took the slides a real render
 *     found to overflow, divided each by its scrollHeight/clientHeight ratio, and ran in a
 *     measure→split→re-measure loop until the deck converged. The trigger is now the count that
 *     2026-07-29 removed, for the reason that note did not weigh: a page count that is a
 *     property of the RENDERER cannot be known by the linter, the authoring surface or the
 *     author, and a run's own membership was not settled until the loop converged.
 *     See engineering/decisions/2026-09-01-autosplit-splits-on-structure.md.
 * Fit is still measured, once, AFTER the split — for the overflow ring only, never to decide
 * a cut. Other files still name `resplitDoc` in comments — mostly as dated history, which is fine; a
 * PRESENT-TENSE mention is not. Do not restate a count here: an earlier version said six, the
 * real number was larger, and a number in a comment nobody re-derives is the defect this whole
 * change is about.
 *
 * Pure string in, string out, so it runs wherever the rendered document exists. It used to be
 * build-time only, because the spine rejected runtime re-pagination (§3) — a rejection aimed at
 * the MEASURED split, which needed a live render and a convergence loop. The structural split
 * needs neither, so a preview runs the same pass before it writes its frame
 * (engineering/decisions/2026-06-25-runtime-autosplit-eventual-consistency.md, Amendment 2).
 * Knows where NOT to
 * split: axes that can't divide without destroying meaning (col/cell read-across,
 * line atomicity) return null from partitionAxis → the slide is LEFT for the ring.
 * Member-level keepTogether is honored by construction — partitionAxis splits
 * BETWEEN collection members, never within one. Pure + fs-free (capacities and the
 * overflow measurement are passed in), so it is unit-testable in isolation.
 */

const { splitSections } = require('./split-sections');
// The finish wrapper, re-applied to the pages a split re-authors (see the end of `splitDoc`).
const { applyBackdropToHtml } = require('./backdrop');
const { topLevelFrontMatterValue } = require('./front-matter-key');
const { readDirectiveComment } = require('./comment-directive');
// `partitionAxis` is no longer called here: rule 10 retired the pre-render CUT, and the measured
// pass's bare-partition fallback goes through `partitionKeepingNote` (which wraps it).
const { countAxis } = require('./collections');
const { carouselize } = require('./carousel');
// The universal split envelope — COVER → BODY(1…n) → CLOSING? (§0a of
// engineering/decisions/2026-07-22-structure-derived-split-patterns.md; rule 9). BOTH
// passes below route their plain partition through it, so a split reads the same
// whether the layout declares a carousel recipe or only a `capacity.axis`.
const { splitEnvelope, partitionKeepingNote, chromeOf, withRole, injectTrailing, deriveAxis } = require('./split-envelope');
// ONE docking rule for both wayfinding marks in the footer band — shared with the progress
// Tile's section rail rather than cloned here (HARD RULE #15).
const { dockInFooterCell, matchingDivClose } = require('./footer-dock');
// The cross-slide relationship signal (§0b, §8 rule 12a). Applied POST-CONVERGENCE, below,
// for the same reason the k-of-N rail is: a run can be cut across several measured passes.
const { RELATIONSHIPS, relationshipSignals, membersIn, signalMarkup } = require('./relationship');

// The last body page's pointer at the run's CLOSING page. The DECISION is made here rather than
// in relationship.js because it is a fact about the ENVELOPE (a closing page follows), not about
// the component's member relationship — the four kinds all describe how members relate to each
// OTHER, and the closing page is not a member.
//
// The MARKUP is not made here. It used to be — this line hand-built the same `<div
// class="lat-split-rel">` that relationship.js's `marker` builds, so one chrome element had two
// producers (HARD RULE #1). They agreed for as long as the element was a bare div and diverged
// the moment it was not: when the signal became a pill its label needed wrapping in a span (only
// an element can take `text-overflow: ellipsis`), `marker` grew one, and this copy did not — so
// a closing pointer rendered as an unwrapped pill that could not ellipsise, on exactly the pages
// nobody re-reads. It calls the one builder now, and a divergence is impossible rather than
// unlikely.
const closingSignal = (label) => signalMarkup(label, 'next');

const SPLITTABLE = new Set(['item', 'row']);

// The carousel strategies whose `null` means "I could not find my shape" — the five cover
// readers that parse a specific DOM and re-author it. Only these may fall through to a derived
// axis when they decline.
//
// NO OTHER STRATEGY'S `null` EARNS THE FALLTHROUGH. Two earlier versions of this comment tried
// to sort the nine into tidy categories and BOTH got it wrong, which is itself the useful
// finding: `null` is not one thing per strategy. Every one of the nine has SEVERAL null paths —
// a missing title, a collection below two, a shape none of its arms recognize, a scope it
// refuses by name — and a rule keyed on "what does this strategy's null mean" has to be true of
// all of them at once. So the membership test is not a taxonomy of nulls. It is this:
//
//   A strategy is admitted only if EVERY path by which it returns null means "I could not read
//   this shape" — never "this slide must not be divided".
//
// The five cover readers pass that test. The nine below each fail it on at least one path, and
// naming the path is the only honest way to say so:
//
//   `journey-stages`     the landscape grid form — "stays whole and rings"
//   `roadmap-horizons`   the TABLE form, for the same reason
//   `kanban-lanes`       a single-lane board
//   `redline-blocks`     a slide holding one passage (and separately a missing `<h2>` — it is
//                        BOTH kinds, which is exactly why the per-strategy taxonomy failed)
//   `math-structures`    `stats` and `canvas`, refused by NAME (`MATH_SCAFFOLDS`); its other
//                        null, "there is no seam", IS a parse failure, so this strategy too is
//                        mixed and is excluded on the scaffold path alone
//   `cover-cards`        no masthead to open a run with — and, separately, fewer than two cards
//   `compare-options`    no `<h2>` — and three more conditions besides
//   `cover-paginate`     no collection
//   `code-cards`         no fenced block
//
// For the read-across four, falling through would cut a table's rows or an option set into
// unframed pages, which is the #1193 shape those treatments exist to forbid. Ringing there is
// also exactly what the merge base did, so nothing regresses by keeping it.
//
// A new strategy is NOT admitted here by default: it joins by showing that EVERY one of its
// null paths is a parse failure.
const SHAPE_READER_STRATEGIES = new Set([
  'feature-cover', 'cover-sides', 'cover-rows', 'cover-decision', 'cover-code',
]);

// One structural element per page — the whole of the split pacing policy (owner ruling,
// 2026-09-01). Named rather than a bare literal because three call sites depend on it and a
// stray `1` at any of them reads like an off-by-one guard rather than the rule it is.
const ONE_PER_PAGE = 1;

// The longest run the rail still draws as PILLS. Past this it prints "k/N" instead.
//
// TWELVE, and the number is now a READABILITY call rather than a width one. It was 4 across two
// commits, set when the band still carried the deck's running footer: four marks shared one
// width budget, the pills were its inflexible member, and a six-pill rail pushed a deck's
// `footer:` string into an ellipsis on 21 pages. Stripping the deck chrome from split pages
// (`stripDeckChrome`) removed three of those four marks, so the pills now share the band with
// nothing but the page number and the constraint that set the 4 is gone.
//
// What is left is the honest question: how many pills can the eye take in without counting?
// Twelve is about the limit for a row read as a shape — past that a reader counts, which is
// what the numeral does better anyway. A run longer than twelve is also long enough that "where
// am I" is a quantity, not a position.
const RAIL_DOT_MAX = 12;

// What the carousel strategies get where they used to get a MEASURED overflow ratio. They
// size their own cut as `min(manifest perPage, ceil(count / ceil(ratio)))`; an infinite ratio
// drives the second term to 1, so the manifest's `perPage` — now 1 across the catalog — is
// what decides, and a recipe layout atomizes exactly like a plain one.
const ATOMIZE = Infinity;

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
// built on (modifiers like `compact` carry none). Returns the cap (with its axis) —
// `splitDoc` wants a splittable axis. Mirrors lint-core's
// capacity-rule token scan.
function capacityForClass(cls, capacityMap) {
  for (const t of String(cls || '').trim().split(/\s+/)) {
    const cap = capacityMap[t];
    if (cap?.axis || cap?.split) return cap;
  }
  return null;
}

// The SPLIT TARGET — how many members ride ONE page of a split run. It is ONE. Always.
//
// A split page carries a SINGLE STRUCTURAL ELEMENT (owner ruling, 2026-09-01). There is no
// per-component pacing left to read: the old policy took `capacity.perPage` when a component
// declared one and otherwise PACKED a "light" member (a bullet, a tile) to its authoring
// comfort — `sweet` → `soft` → `hard` — which is how a split run came to hold four bullets on
// one page and one on the next. Those three numbers are an AUTHORING budget with exactly one
// consumer, `lint:deck`; they were never a statement about how a run should be cut, and
// reading them here is what made "never pack" false for most of the catalog.
//
// Kept as a function rather than inlined so the single-element rule has ONE definition the
// call sites and the tests can both point at.
// The axes this component's manifest CLAIMS it can be built on, most specific first — the
// preference `deriveAxis` uses when the rendered cell offers more than one container (§8 rule 1's
// boundary: the DOM decides which declared shape is present, it does not let a foreign container
// invent a seam the component never claimed).
function declaredAxes(cap) {
  return [cap?.split?.axis, cap?.axis].filter(Boolean);
}

function splitTargetOf() {
  return ONE_PER_PAGE;
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
  // Only the real slide region. The assembled doc's <head> carries inlined CSS whose
  // comments/selectors mention "<section …>" as text; that used to DERAIL the section
  // walker, and since 2026-09-21 it does not (splitSections walks a tokenizer, so
  // RAWTEXT and comments are text). The slice stays because the head prefix is not
  // ours to rewrite. Slide siblings start at the first data-lattice-slide (mirrors splitDoc).
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
    // grouping; a plain slide carries an id and must never be pulled into a neighbor's run.)
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
      // The rail has TWO forms, because one structural element per page makes runs long.
      //
      // Up to RAIL_DOT_MAX pages it is PILLS — a shape the eye reads at a glance, filled
      // through the current page. Past that it is the count itself, because a pill rail does
      // not degrade gracefully: it grows linearly, and past about a dozen nobody counts pills
      // to find they are on the ninth. See RAIL_DOT_MAX for where the line sits and why.
      const rail = total <= RAIL_DOT_MAX
        ? Array.from({ length: total }, (_, j) => `<span class="seg${j <= k ? ' on' : ''}"></span>`).join('')
        : `<span class="seg-count">${k + 1}/${total}</span>`;
      // `div`, not `nav` — the rail is aria-hidden decoration, so claiming the
      // navigation role and then hiding it was over-tagging (semantic-html ADR §17.6).
      railOf.set(idx, `<div class="lat-split-rail" aria-hidden="true">${rail}</div>`);
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

// HIERARCHICAL numbering — a split run numbers ITSELF, and nothing else in the deck moves.
//
// A slide that splits into three keeps its own number and the pages after it take a decimal:
//
//     2 · 2.2 · 2.3        …and the next authored slide is still 3.
//
// Think of a library index rather than a page count. The number is an ADDRESS — where this
// page sits in the deck the author wrote — not an ordinal in the deck the export produced. An
// author who numbered their slides 1..12 still has twelve slides after the split; six of them
// are simply subdivided. The bare first page IS ".1"; writing it as `2` rather than `2.1` is
// what makes an unsplit deck and a split one read the same at the top of every run.
//
// Three things fall out of that, and they are the reason for it (owner ruling, 2026-09-01):
//
//   · DETERMINISTIC — a page's number depends only on its own run, so the same slide has the
//     same address whatever happens elsewhere in the deck.
//   · STABLE — inserting pages in the middle of a deck used to renumber every slide after it.
//     Now nothing downstream changes: those sections come out of the splitter BYTE-IDENTICAL.
//   · CHEAP — because they are byte-identical, nothing downstream needs re-rendering. The old
//     pass rewrote `data-lattice-slide` on every section in the deck, so one split at slide 2
//     dirtied slides 3..N for no reason but the counter.
//
// This replaces a sequential re-stamp that counted every emitted page and rewrote the whole
// deck's numbers and totals. That was correct arithmetic answering the wrong question: it
// reported the artifact's page count, which is a fact about the renderer, when what a reader
// needs is where they are in the argument.
//
// BOTH keys are addressed the same way — the internal `data-lattice-slide` and the two places
// the visible number is baked (the `data-lattice-pagination` attribute, which
// `section.form::after` renders when a slide has no footer CELL, and the real
// `<span class="lat-pagination">` masthead-lift puts inside `.cell-footer`). Keeping them in
// step matters: the split copies the openTag AND the inner verbatim, so without this every
// page of a run showed the run's first number twice over.
//
// The TOTAL is never rewritten. It is the authored deck's slide count, which the split does
// not change — that is the whole point. "3 of 12" stays true on a page numbered 2.3.
function repaginate(html) {
  const parts = splitSections(html);
  // Which position each section holds WITHIN its own split run (1-based). A section with no
  // `data-split-run` is not in a run and is never touched.
  const kOf = new Map();
  let cur = null;
  parts.forEach((p, idx) => {
    if (p.type !== 'section') return;
    const rid = (p.openTag.match(/\sdata-split-run="([^"]*)"/) || [])[1] || null;
    if (rid && cur && cur.rid === rid) cur.n += 1;
    else if (rid) cur = { rid, n: 1 };
    else { cur = null; return; }
    kOf.set(idx, cur.n);
  });
  if (kOf.size === 0) return html;
  return parts
    .map((p, idx) => {
      const k = kOf.get(idx);
      // Not in a run, or the run's FIRST page — which keeps the authored slide's own number.
      // Returning the original text (not a re-assembled `openTag + inner`) keeps it byte-identical.
      if (!k || k === 1) return p.type === 'section' ? `${p.openTag}${p.inner}</section>` : p.text;
      const suffix = (_, a, n, b) => `${a}${n}.${k}${b}`;
      const tag = p.openTag
        .replace(/(\bdata-lattice-slide=")(\d+)(")/, suffix)
        .replace(/(\bdata-lattice-pagination=")(\d+)(")/, suffix);
      const inner = p.inner.replace(/(<span class="lat-pagination">)(\d+)(<\/span>)/, suffix);
      return `${tag}${inner}</section>`;
    })
    .join('');
}

// A SPECIMEN slide opts out of pagination, per-slide. `<!-- stress-slide -->` already
// means "this slide EXISTS to show the upper limit" — the gallery builder emits it and
// lint-core reads it to suppress `capacity-crowd` — so paginating it would paginate it
// out of showing the thing it exists to show. This is the ONLY opt-out: the deck-level
// `autosplit:` directive is retired, because a deck is authored once and presented at
// many sizes, so its page count is a function of the content and the box rather than an
// authoring switch (2026-07-29-autosplit-is-not-a-toggle.md). Per-SLIDE is the right
// altitude for "this one is the exhibit"; per-DECK never was.
//
// MATCHES THE SPEAKER-NOTE FORM, NOT THE COMMENT, and that is the whole fix. `<!-- stress-slide -->`
// is not a Marp directive, so Marp consumes it as a SPEAKER NOTE before it ever reaches the DOM:
// the section carries `<aside class="lattice-notes" hidden data-slide="1">stress-slide</aside>` and
// no comment at all. The old pattern tested `p.inner` for the comment and could therefore never
// match — measured, a 4-item `checklist` marked as a specimen still split into a cover plus four
// pages. So the only opt-out an author has has never worked, on any deck, since it was written.
//
// It went unnoticed while the trigger was MEASURED: a specimen that fit was not split anyway, and
// one that overflowed was the exhibit being marked. Under the structural trigger it fires on every
// multi-member slide at a non-`wide` size, which is what turned a dormant bug into a live one — 53
// files under `lib/components` mark a capacity-ceiling specimen this way, and every one of them
// exists precisely to show N members on ONE slide. HARD RULE #18's "tipped into failure" arm: the
// latent fragility is pre-existing, the failure is this change's, so it is fixed here.
//
// Both forms are accepted. The comment form is what an author types and what every doc teaches,
// and it survives in a path that does not route through Marp's note extraction; the note form is
// what actually arrives today. Anchoring the note form to the `lattice-notes` aside keeps it from
// matching a slide that merely discusses the marker in its prose.
const SPECIMEN_RE = /<!--\s*stress-slide\s*-->|<aside\b[^>]*\blattice-notes\b[^>]*>[\s\S]*?\bstress-slide\b[\s\S]*?<\/aside>/;

// STRUCTURAL pass — the ONLY pass, and it runs ONCE.
//
// Every enrolled slide whose primary collection holds more than one member is re-emitted as
// COVER → BODY(one element each) → CLOSING. No render is measured and no ratio is consulted:
// the seam is a fact about the slide's STRUCTURE, which is knowable from the markup, and the
// page count follows from how many members the author wrote.
//
// This REPLACES the measured trigger (owner ruling, 2026-09-01). From 2026-07-29 until now the
// only trigger was fit: a slide split if — and only if — a real Chromium render found it
// clipping, and by however much it clipped. Two things were wrong with that. It made the split
// UNPREDICTABLE, because "does it fit" is a fact about glyphs, fonts and a box, so the same
// deck cut differently on a different machine and the same section produced a 3/2 run on one
// pass and 2/1 on the next. And it made the split INVISIBLE to everything that is not a
// browser — the linter, the authoring surface and the agent kit could not say what a deck
// would become. Structure is knowable without rendering anything, so all three now agree.
//
// Fit has NOT stopped being measured — it has stopped being a TRIGGER. The overflow probe
// still runs, and a page that still does not fit after this pass rings (the overflow marker),
// which is the honest terminal: past one element per page there is no smaller cut to make.
//
// Returns `{ html, changed }`; changed === 0 means nothing here had a splittable seam
// (read-across, atomic, or a single-member collection — for the ring, not the splitter).
// Operates on the fully-assembled export doc. Pure + fs-free.
function splitDoc(docHtml, capacityMap) {
  let changed = 0;
  // The fully-assembled doc carries embedded <script>/<style> chrome whose comments
  // mention "<section …>" as prose. Those substrings used to derail the depth-aware
  // section walker (it never balanced a close and bailed); as of 2026-09-21 the walker
  // reads them as text, so this scoping is now about not rewriting the head prefix
  // rather than about surviving it. The real slides are flat siblings
  // starting at the first data-lattice-slide; slice the head prefix off so the walker
  // only ever sees genuine slide elements. (A bare slide string → firstSlide 0 → no-op.)
  const firstSlide = docHtml.search(/<section\b[^>]*\bdata-lattice-slide=/);
  if (firstSlide < 0) return { html: docHtml, changed: 0 };
  const prefix = docHtml.slice(0, firstSlide);
  // NOTHING is renumbered here. A split run addresses itself (`repaginate`, below: 2 · 2.2 ·
  // 2.3), so a slide the splitter did not touch comes out BYTE-IDENTICAL — which is what makes
  // one split at slide 2 cost nothing at slides 3..N.
  //
  // This used to be a deck-wide sequential re-stamp of `data-lattice-slide`, applied to every
  // section including the ones that passed straight through. `whole` on an untouched
  // slide is the shape that gave it away: the pass had to rewrite a slide precisely because it
  // had NOT changed it.
  const body = splitSections(docHtml.slice(firstSlide))
    .map((p) => {
      if (p.type !== 'section') return p.text;
      const whole = `${p.openTag}${p.inner}</section>`;
      if (SPECIMEN_RE.test(p.inner)) return whole; // a specimen rings, by design
      // `fit: report` (deck-wide, or a slide's own `_class: fit-report`): the engine changes
      // nothing and only flags, so the slide rings instead of dividing. The deck token is
      // already on the section — deckClassPropagate stamps it before this runs.
      // See lib/core/resolve-guards.js and engineering/decisions/2026-09-25-fit-policy.md.
      if (/(?:^|\s)fit-report(?:\s|$)/.test(p.cls)) return whole;
      const cap = capacityForClass(p.cls, capacityMap);
      if (!cap) return whole;
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
      //
      // A DECLINED RECIPE MAY FALL THROUGH TO THE DERIVED AXIS — BUT ONLY FROM A READER WHOSE
      // `null` MEANS "NOT MY SHAPE". That fallthrough is what this branch is for: `return whole`
      // here is what left a VARIANT unsplit whenever its rendered DOM was not the shape its
      // component's one strategy reads, and the census found that on every re-authoring
      // strategy. `compare-prose axis` renders numeral-led facet cards instead of two panes, so
      // `readSubjects` found no sides; `split-panel pullquote` leads with the quote and carries
      // no `<h2>`, so `readFeature` found no feature. Both hold a plain top-level list of
      // independent members, both clip at portrait, and neither split. A shape reader declining
      // means "this is not my shape", which is not the claim "this slide has no seam".
      //
      // FOR THE NINE STRATEGIES NOT ON THE ALLOWLIST, AT LEAST ONE `null` PATH IS A VETO rather
      // than a parse failure, and falling through on it re-derives an axis the component
      // deliberately does not have. The paths are enumerated ONCE, at
      // `SHAPE_READER_STRATEGIES` — not restated here. An earlier revision of this comment did
      // restate them, said FOUR where the table said FIVE, and the two copies sat 440 lines
      // apart disagreeing about the rule they both describe. One list, one place.
      //
      // Measured, when the fallthrough was unconditional: a `journey` slide at `size: square`
      // (family `square`, so splitting applies) became a cover plus SEVEN body pages, each
      // repeating the whole board and differing only by one item of the MOOD LEGEND — the list
      // `deriveAxis` reaches once the stage seam is refused. Nine of `journey`'s ten gallery
      // slides did it, and eight of `roadmap`'s. And `redline annotated`, one passage plus a
      // three-item why-list, was cut into three pages that carry the reasoning without the
      // amendment it explains. Both were found by the HARD RULE #25 checker, on `square` — a
      // family the portrait-only census could not see.
      //
      // So the fallthrough is an ALLOWLIST of shape readers, not a default.
      let recipeDeclined = false;
      if (cap.split && !isSplitBody) {
        const carousel = carouselize(p.openTag, p.inner, cap.split, ATOMIZE, layoutName);
        if (carousel && carousel.length > 1) {
          changed += 1;
          return stampRun(carousel, runIdOf(p.openTag));
        }
        if (!SHAPE_READER_STRATEGIES.has(cap.split.strategy)) return whole;
        recipeDeclined = true;
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
      //
      // `recipeDeclined` is what separates the two cases this line used to conflate. A RE-SPLIT
      // of a page the recipe already emitted (`isSplitBody`) still takes the recipe's declared
      // axis or none — that is the case the paragraph above is about, and deriving there cut
      // redline's reasoning away from the passage it explains. A SHAPE READER that declined the
      // slide outright never produced those members, so there is nothing to protect: the
      // rendered DOM is the only account of the seam left, and asking it is the same question a
      // plain layout is asked.
      //
      // AN EARLIER VERSION OF THIS COMMENT CLAIMED THE `count <= 1` GUARD BELOW KEPT `redline`'s
      // `annotated` SHAPE RINGING. It does not, and the claim was false when it shipped: that
      // slide holds one passage AND a three-item why-list, so the count is three and the guard
      // never fires. What rings it is the allowlist above — `redline-blocks` is a veto, not a
      // shape reader. The guard does what its own line says and no more: it stops a
      // single-member collection from paginating.
      const axis = cap.split && !recipeDeclined ? (cap.split.axis || null) : deriveAxis(p.inner, declaredAxes(cap));
      if (!SPLITTABLE.has(axis)) return whole; // read-across / atomic → the ring
      const count = countAxis(p.inner, axis);
      if (count <= 1) return whole; // a single item taller than the page — can't split
      // ONE structural element per page. There is no arithmetic left to do here — no ratio to
      // divide by and no authored pacing to reconcile with it — so `balancedPerPage` (which
      // existed to even out a ratio-derived cut) has nothing to balance and is not called.
      const perSlide = splitTargetOf();
      if (perSlide >= count) return whole;
      // A FIRST cut of a plain-pagination slide gets the universal envelope (§0a) — the
      // same cover → body → closing shape cover-paginate gets. A re-split of a page we
      // already emitted stays a bare partition of its own members.
      if (!isSplitBody) {
        const envelope = splitEnvelope(p.openTag, p.inner, chromeOf(p.inner), { axis, per: perSlide, layoutName });
        if (envelope) {
          changed += 1;
          return stampRun(envelope, runIdOf(p.openTag));
        }
      }
      // `partitionKeepingNote` — not a bare `partitionAxis` — because THIS re-split branch
      // is the one that can hit a page an earlier pass already gave a `.lat-split-note`
      // (an `isSplitBody` re-split of a native body page); a bare `partitionAxis` would
      // repeat that note on every new piece, reopening the exact duplication the envelope
      // exists to kill. A no-op scan (and byte-identical to `partitionAxis`) when no note
      // is there yet — the title-less first-cut fallback this line also serves.
      const parts = partitionKeepingNote(p.inner, axis, perSlide);
      if (!parts || parts.length <= 1) return whole;
      changed += 1;
      return stampRun(emitParts(p.openTag, parts), runIdOf(p.openTag));
    })
    .join('');
  // Splitting/carouselizing inserts pages, so the engine-baked page numbers are stale.
  // Scoped to the slide region: the head prefix carries inlined CSS whose comments can
  // mention the attribute as prose.
  //
  // …and a re-authored page gets its finish WRAPPER back. A cover or carousel page is built from
  // the masthead and the members rather than the source section's children, so it carries the
  // `finish` class (roleOpenTag keeps the surface registers) and no `.backdrop` — and the finish
  // compositor draws on that wrapper, so the class alone paints nothing (#2305). The injector
  // is idempotent, so a body page that kept its source wrapper is left alone.
  return { html: prefix + (changed ? applyBackdropToHtml(repaginate(body)) : body), changed };
}

/**
 * FINAL pass (post-convergence) — stamp the RELATIONSHIP SIGNAL on every body page of every
 * split run whose component declares a `capacity.relationship` (§0b, §8 rule 12a):
 * "{next step} →" · "back to {stage 1} ↻" · "governs {next tier} ↓" ·
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
  // `[^>]*` for the `data-mark` attribute the drawn shapes carry — without it the strip half of
  // strip-then-re-derive silently stopped matching, and a second call APPENDED a second signal
  // instead of replacing the first.
  const stripped = html.replace(/<div class="lat-split-rel"[^>]*>[\s\S]*?<\/div>/g, '');
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
    // The CAROUSEL IS UNIVERSAL (owner ruling, 2026-09-01). Every split run points the reader
    // at what is coming; `capacity.relationship` only chooses the PHRASING.
    //
    // It used to choose whether the reader got a pointer at all: the signal was emitted only
    // for a component declaring one of the four kinds, which was four components out of
    // sixty-one. On every other run — including the ordinary bulleted `content` slide, the most
    // common slide in any deck — a page ended with no indication that the next one continued it,
    // and once a run is one element per page that is most of the deck reading as a set of
    // unrelated slides. §0b already said atomizing WITHOUT the adornment is what makes
    // atomization unreadable; it just never applied that to the components with no declaration.
    //
    // `sequence` — "→ next: {the next page's first member}" — is the default because it is the
    // relationship a split run HAS: the pages were one slide, so page k+1 is literally what
    // follows page k. A component that means something more specific (a cycle that returns, a
    // hierarchy that governs downward, a comparison counting N of M) declares it and overrides.
    const kind = RELATIONSHIPS.includes(cap?.relationship) ? cap.relationship : 'sequence';
    // The axis the run was actually cut on — DERIVED FROM THE PAGE, like the cut itself
    // (§8 rule 1), with the declared axes as the preference the derivation resolves against.
    // Reading `cap.split?.axis || cap.axis` alone was reading the AUTHORING-SHAPE claim while
    // the cut had been made from the rendered DOM, and rule 1 exists precisely because those
    // two can disagree. When they did, `membersIn` looked for a collection that is not on the
    // page: the three narrative kinds went silent and `comparison` printed a count of zero.
    const axis = deriveAxis(parts[bodies[0]].inner, declaredAxes(cap)) || cap.split?.axis || cap.axis;
    // A NATIVE-SLICE PAGE NAMES ITS OWN MEMBER, and that beats the heuristic.
    //
    // `membersIn` resolves a page's members as the first `<ul>`/`<ol>` on it and that list's
    // `<li>` children. The proxy holds where the page's body IS the collection, and breaks on a
    // page carrying ONE sliced element that has lists of its own. Measured on
    // `examples/portrait-roadmap.md`: the first list on a phase page is `ul.horizon-rows` inside
    // the card, so every pointer named a workstream row rather than the phase — "next: Signal
    // Intake Scoring v2" where the page it points at is titled "Q2". `kanban` builds its cards
    // from `<div>`s, so nothing was found and its runs carried no pointer at all.
    //
    // `nativeSliceSplit` stamps `data-split-label` with the member's own title, because it is the
    // only thing that knows which element it cut. Taking it as a one-member page is exactly what
    // the page is: `labelOf` strips tags, so the plain string names itself. A page without the
    // attribute — every re-authoring strategy, and the plain envelope — falls through to the
    // heuristic unchanged.
    const membersOf = (idx) => {
      const stamped = (parts[idx].openTag.match(/\sdata-split-label="([^"]*)"/) || [])[1];
      // NOT `decodeEntities(stamped)`. `withMemberLabelAt` escapes the label INTO this attribute;
      // decoding it here handed `labelOf` a raw `<`, and `stripTags` removes only a `<…>` PAIR —
      // a lone `<` survives by documented design. `marker()` then wrote it into the DOM raw, and
      // the browser tokenizer ate the markup behind it: an authored
      // `> **&lt;img src=x onerror=…//** …` shipped a LIVE `<img>` with a firing handler in the
      // exported deck (verified `window.PWN === 1` in real Chromium). The trailing `//` swallows
      // the residual `</span`.
      //
      // The stamped value is already the author's text, entity-escaped. Passed through as-is it
      // renders as the characters they typed, which is what they meant, and the round-trip that
      // made it markup is gone. (HARD RULE #25 red team. Pre-existing on `origin/main` — same
      // line, same sink — and on-path here because this branch edits `withMemberLabel` and adds
      // a caller, so it is fixed rather than filed.)
      //
      // A PRESENT-BUT-EMPTY STAMP IS AN ANSWER, not a missing one. `withMemberLabel` found the
      // member's title element and the label rules DECLINED it — an equation, a shape glyph, a
      // character the deck's face cannot set, a sentence too long to be a name. Falling through to
      // `membersIn` there would re-enable the very heuristic the stamp exists to override, and on
      // these strategies it is known to be wrong (a `kanban` card names the first row inside it).
      // `undefined` — no attribute at all — means "this strategy stamps nothing" and still falls
      // through unchanged.
      //
      // A DECLINED MEMBER IS STILL A MEMBER. It is only UNNAMEABLE, and the difference is the
      // whole finding: this returned `[]` for one commit, and `relationshipSignals` COUNTS
      // members. So a run with one over-budget title printed `Option 1 of 2` as `Option 1 of 2`
      // minus the declined one — `Option 1 of 1`, a wrong number on a rendered slide, which is
      // the exact class the `total === 0` guard exists to prevent — and a run where EVERY title
      // declined hit that guard and emitted no chip element at all, silencing the wayfinding §0b
      // says an atomized run cannot be read without. `['']` instead: `labelOf('')` is `''`, so
      // every kind degrades to its own un-labeled form and the count stays true.
      // (HARD RULE #25 checker, on this fold — measured on `examples/split-decision.md` and
      // `examples/portrait-roadmap.md` with lengthened titles.)
      if (stamped !== undefined) return [stamped];
      return membersIn(parts[idx].inner, axis);
    };
    // A COVERLESS `split-panel` BODY PAGE GETS NO FORWARD POINTER — for now, and deliberately.
    //
    // The pointer is a flex ITEM of whatever box the page's layout puts it in. Every control
    // layout docks it in a footer Cell; a coverless native page has none, so it lands as a direct
    // child of the SECTION — and `split-panel`'s section IS the panel flex row. In flow at a row
    // size it therefore becomes a THIRD COLUMN: measured at `square`, `.panel-right` is squeezed
    // from 450.9px to 252.7px, the pointer runs off the slide, and the section is flagged
    // `overflow`. Styling it out of the row means placing it absolutely, reserving the band it
    // lands in, and inking the k-of-N rail for whichever field holds the corner — a self-contained
    // piece of work with its own measured residual (an over-stuffed member can still paint under
    // the pill, silently). That belongs in its own change rather than riding this one.
    //
    // So this run is enrolled in splitting — which is the point of this change — and simply does
    // not carry the mark until the chrome that makes it legible lands with it. The k-of-N rail is
    // unaffected: `applyRails` places it separately and it does not join the panel row.
    const coverlessSplitPanel = bodies.every((idx) => /\bsplit-panel\b/.test(parts[idx].cls || '')
      && /\blat-split-native\b/.test(parts[idx].openTag));
    if (coverlessSplitPanel) continue;
    const signals = relationshipSignals(kind, bodies.map(membersOf));
    if (!signals) continue;
    bodies.forEach((idx, k) => { if (signals[k]) signalOf.set(idx, signals[k]); });
    // The LAST body page's own forward pointer. `sequence` and `cycle` deliberately say nothing
    // there (there is no next member), but the reader is not at the end of the run — a CLOSING
    // page follows, and walking onto it with no warning is the same discontinuity the signal
    // exists to close. So name what the closing carries, derived from the page itself rather
    // than assumed: its key insight, or its note.
    const closingIdx = run.members.find((idx) => /\sdata-split-role="closing"/.test(parts[idx].openTag));
    if (closingIdx !== undefined) {
      const closing = parts[closingIdx].inner;
      const label = /<blockquote/.test(closing) ? 'the key insight' : 'the note';
      signalOf.set(bodies[bodies.length - 1], closingSignal(label));
    }
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


/**
 * Strip the DECK's chrome from every page a split emitted, leaving only the split's own
 * wayfinding (owner ruling, 2026-09-01).
 *
 * A split page carries the PAGE NUMBER and the k-of-N split rail. It does not carry the deck's
 * running `header:`, its running `footer:` string, or the section rail — those are the frame a
 * reader meets on an authored slide, and a split run is not a sequence of authored slides. It
 * is one slide unfolded, so the run's own chrome is what orients the reader inside it; repeating
 * the deck frame fourteen times says only that the deck is still the deck.
 *
 * This reverses §0a's "Footer, pagination, and the progress rail ride every slide" — a rule
 * written when a split was two or three pages, where the frame reads as continuity rather than
 * repetition. At one structural element per page it is repetition, and it costs the thing the
 * band is for: the footer text, the section rail, the k-of-N rail and the page number were four
 * marks sharing one width budget, which is why a long run pushed the deck's own footer into an
 * ellipsis on 21 pages of a demo deck. Removing three of the four is the fix that rule could not
 * reach; the dot-vs-count threshold it forced (`RAIL_DOT_MAX`) is now a readability call rather
 * than a width one.
 *
 * Applied as ONE pass over the emitted document rather than inside each builder (HARD RULE #1):
 * ten carousel strategies plus the plain envelope assemble their own pages, and three of them
 * splice the deck's chrome back in from `chromeOf` by construction. Keying on `data-split-role`
 * means it reaches every page any of them produced, and CANNOT touch a slide the split did not
 * emit — an authored slide keeps its frame, which is the whole distinction being drawn.
 *
 * THE DECK'S CHROME IS IDENTIFIED BY ITS TEXT, NOT BY ITS TAG, and that is not fussiness. An
 * author may write a literal `<footer>` or `<header>` in their markdown, and the engine HOISTS
 * it into the very same `.cell-footer` as the deck's own — measured, a slide carrying
 * `<footer>AUTHOR</footer>` under `footer: "DECK"` renders `<footer>AUTHOR</footer><footer>DECK
 * </footer>` as siblings in one Cell. So the two are indistinguishable by tag, by depth and by
 * position, and a tag-keyed strip deleted the author's content from every page of a run while
 * leaving it untouched on an unsplit slide. Found by the HARD RULE #25 red team.
 *
 * THE DECK'S STRINGS COME FROM THE DECK, not from the section. `data-header` / `data-footer` on a
 * section were the obvious source and are the WRONG one: Marp writes a per-slide `_footer:`
 * override into the very same attribute, so the two are indistinguishable there — and reading it
 * deleted the author's own per-slide caption from every page of a run. Measured on
 * `examples/portrait-journey.md`, whose deck front matter declares NO footer at all: all three
 * journey slides carry only a `_footer:` of their own, and all three lost it. `roadmap-horizons`
 * had shipped the same loss on `examples/portrait-roadmap.md` since it was enrolled. The strip
 * therefore takes `deck.header` / `deck.footer` — the values parsed from the deck's front matter
 * by the caller — and a section attribute is consulted for nothing.
 *
 * The comparison is on normalized VISIBLE TEXT, because a directive may hold markdown
 * (`footer: "**Q3** review"` renders `<strong>`): entities decoded, whitespace collapsed, never
 * on markup. A deck that declares no directive has no deck chrome anywhere, so nothing is
 * stripped — which is also the behavior when a caller passes nothing, and that default is
 * deliberate: forgetting the argument costs the de-duplication, never the author's words.
 */
// Visible text of a fragment: tags dropped, entities decoded, whitespace collapsed. The one
// comparison basis that survives a directive holding markdown (`footer: "**Q3** review"`).
const decodeEntities = (t) => String(t)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-fA-F]+);/g, (_, d) => String.fromCodePoint(parseInt(d, 16)))
  .replace(/&amp;/g, '&');
const visibleText = (html) => decodeEntities(String(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// Remove only the <tag> elements whose visible text IS the deck's own directive string. An
// author's element of the same tag, hoisted into the same Cell by the engine, is left alone.
function stripDeckOwn(inner, tag, deckText) {
  if (!deckText) return inner;                       // no directive → no deck chrome here
  const want = visibleText(deckText);
  if (!want) return inner;
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'g');
  return inner.replace(re, (el) => (visibleText(el) === want ? '' : el));
}

/**
 * The DECK's own header/footer strings — the two `stripDeckChrome` removes from a split run.
 *
 * Two declaration sites, and both are the deck's:
 *   · front matter, TOP-LEVEL only. `frontMatterValue` anchors `^[ \t]*key:`, which also
 *     matches an indented line inside a block scalar — so a deck carrying
 *     `style: |` / `  header:hover { opacity: 1 }` read its "deck header" as
 *     `hover { opacity: 1 }` and stripped nothing. `topLevelFrontMatterValue` exists in
 *     `front-matter-key.js` for exactly this hazard; `class:` and `color-mode:` already use it.
 *   · a RUNNING-GLOBAL comment directive, `<!-- header: … -->`. Marp carries it forward from
 *     where it appears, so it is deck chrome as much as the front-matter form is. The
 *     underscore is the whole discriminator: `<!-- _header: … -->` is a per-slide override and
 *     must NOT be treated as the deck's, which is the conflation that made reading the
 *     section's `data-header` wrong in the first place. `readDirectiveComment` reports it as
 *     `spot`, so this asks the shared grammar rather than re-spelling it.
 *
 * The LAST running-global wins, matching "spot replaces global, global carries forward"; front
 * matter is the fallback when no running-global appears. A deck declaring neither yields null
 * and nothing is stripped, which is correct — it has no repeated band.
 */
function deckChromeFrom(markdown) {
  const src = String(markdown || '');
  const fmMatch = src.match(/^---\r?\n[\s\S]*?\r?\n---/);
  const fm = fmMatch ? fmMatch[0] : '';
  const known = new Set(['header', 'footer']);
  const out = { header: topLevelFrontMatterValue(fm, 'header'), footer: topLevelFrontMatterValue(fm, 'footer') };
  // The WHOLE comment, delimiters included —  rejects anything that does
  // not start  and end  as its O(1) guard against an unterminated comment.
  for (const m of src.slice(fm.length).matchAll(/<!--[\s\S]*?-->/g)) {
    const d = readDirectiveComment(m[0], { known });
    if (d && !d.spot) out[d.key] = d.value;   // running-global; a `_`-prefixed spot is not the deck's
  }
  return out;
}

/**
 * A SPLIT RUN SAYS ITS FOOTER ONCE, on the page that opens the run.
 *
 * `stripDeckOwn` above removes the DECK's repeated band — the `footer:` every slide in the deck
 * carries. It deliberately leaves a per-slide `_footer:` alone, because that caption is the
 * author's own and deleting it from an unsplit slide would be silent content loss (the defect
 * `deckChromeFrom` exists to avoid). But a split RUN is one slide unfolded, so the slide's own
 * caption belongs to the run, not to each of its pages: repeating it fourteen times is the same
 * repetition the 2026-09-01 chrome ruling removed from the deck frame, applied one level down.
 *
 * IT IS ALSO WHAT CLIPS. The caption lands in the shared Form footer band, whose budget is one
 * line, and a caption longer than that overflows it — measured on `split-panel cat-1` at
 * portrait: the authored slide FITS unsplit, and all three of its split pages clip; the same
 * three pages clip on none with a short caption, at byte-identical geometry
 * (`.cell-footer` 1281.7 -> 1329.8 either way, so it is the text, not the layout). 28 pages of
 * the shipped `split-panel` gallery clipped this way. The band's one-line budget is a
 * PRE-EXISTING limit — a plain unsplit `content` slide with the same caption clips too — so this
 * does not pretend to fix the band; it stops the split from walking components into it N times
 * over.
 *
 * Keyed on the run's FIRST page rather than on `data-split-role="cover"`, which is the same page
 * wherever a cover exists and is still right where one does not (the native-slice strategies
 * emitted `body` pages only until they gained a cover, and a future strategy may do so again).
 * Nothing else in the run's chrome moves: the page number and the k-of-N rail ride every page.
 */
function stripRunFooter(inner, openTag, opener) {
  const run = (openTag.match(/\sdata-split-run="([^"]*)"/) || [])[1];
  if (run === undefined) return inner;
  const id = (openTag.match(/\sdata-lattice-slide="([^"]*)"/) || [])[1];
  if (opener.get(run) === id) return inner;
  return inner.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/g, '');
}

function stripDeckChrome(html, deck = {}) {
  const firstSlide = html.search(/<section\b[^>]*\bdata-lattice-slide=/);
  if (firstSlide < 0) return html;
  const prefix = html.slice(0, firstSlide);
  // Which page OPENS each run. A run's own footer is said once, on that page (see
  // `stripRunFooter` below); every later page of the same run drops it.
  const opener = new Map();
  for (const p of splitSections(html.slice(firstSlide))) {
    if (p.type !== 'section') continue;
    const run = (p.openTag.match(/\sdata-split-run="([^"]*)"/) || [])[1];
    if (run === undefined || opener.has(run)) continue;
    opener.set(run, (p.openTag.match(/\sdata-lattice-slide="([^"]*)"/) || [])[1]);
  }
  return prefix + splitSections(html.slice(firstSlide))
    .map((p) => {
      if (p.type !== 'section' || !/\sdata-split-role="/.test(p.openTag)) return p.type === 'section' ? `${p.openTag}${p.inner}</section>` : p.text;
      let inner = stripDeckOwn(p.inner, 'header', deck.header);
      inner = stripDeckOwn(inner, 'footer', deck.footer);
      inner = stripRunFooter(inner, p.openTag, opener);
      // The section rail is a NESTABLE <div>, so it needs the depth-aware close the footer dock
      // already owns — a non-greedy `[\s\S]*?</div>` stops at the first close and would shear
      // the rail in half the day a dot becomes a div (the trap split-envelope's `extractRail`
      // documents). Loop: a page can only carry one, but a malformed one must not spin.
      for (;;) {
        const at = inner.indexOf('<div class="tile-progress"');
        if (at < 0) break;
        const close = matchingDivClose(inner, at);
        if (close < 0) break;
        inner = inner.slice(0, at) + inner.slice(close + '</div>'.length);
      }
      // An emptied `.cell-footer` still paints its band and its top rule, so a page that kept
      // nothing but the page number would show a hairline under an empty row. Drop the Cell
      // when the strip left it holding nothing.
      inner = inner.replace(/<div class="cell-footer">\s*<\/div>/g, '');
      return `${p.openTag}${inner}</section>`;
    })
    .join('');
}

module.exports = {
  authoredIndexPerPage, splitDoc, capacityForClass, layoutTokenFor, repaginate, applyRails, applyRelationshipSignals, stripDeckChrome, deckChromeFrom };
