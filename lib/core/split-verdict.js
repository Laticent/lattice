/**
 * split-verdict — the ONE source of truth for "should this slide be split, and
 * by how much?", shared by every measurement site (HARD RULE #1).
 *
 * `lib/core/auto-split.js`'s `resplitDoc` is measurement-FED: it takes
 * `{ slide, ratio, canSplit, splitRatio }` per overflowing slide and does the
 * cutting. The measurement itself is two steps, and only the first was ever
 * shared. `lib/core/overflow-probe.js` answers "does this slide overflow its
 * frame" and returns an EXTENT. Turning that extent into a VERDICT — is this
 * overflow one a split can fix, and how many ways should the collection be cut —
 * is this file, and until 2026-09-01 it lived inside `lattice-emulator.js`'s
 * `measureOverflow` `page.evaluate` where nothing else could reach it.
 *
 * That mattered because the runtime is supposed to become a second measurer
 * (`engineering/decisions/2026-06-25-runtime-autosplit-eventual-consistency.md`
 * §0: "the live DOM is just another measurer"). It could not, without
 * re-deriving 150 lines of rules that each exist because of a specific measured
 * defect: the `canSplit` veto for a slide whose non-collection content already
 * fills the box, the collection-relative `splitRatio` that makes the loop
 * converge instead of re-cutting a slide a tall block keeps over the box, the
 * envelope-hoist headroom correction, the structural- and paginator-carousel
 * branches, and the inline-flow carve-out that lets a horizontally-overflowing
 * `list-steps` split when a wide `<table>` must not. Re-deriving them is exactly
 * the HARD RULE #1 violation the runtime work exists to avoid.
 *
 * SELF-CONTAINED BY CONSTRUCTION, like `probeSectionOverflow` itself: every
 * dependency arrives as an argument and nothing is referenced from module scope,
 * because this function is `.toString()`-injected into `page.evaluate` and into
 * the emulator's inline watcher. `SPLIT_VERDICT_SRC` is that injection form.
 *
 * Returns `null` when the slide fits and its figures are legible — the caller
 * emits nothing for it.
 *
 * See engineering/decisions/2026-06-25-runtime-autosplit-eventual-consistency.md
 * Amendment 1 § Cost A.
 */

/**
 * @param {Element} s — the slide `<section>`, laid out and measurable.
 * @param {{probeSectionOverflow: Function, probeFigureLegibility: Function}} deps
 *        — the two probes, injected rather than imported so this function stays
 *        self-contained for `.toString()`.
 * @param {{clipSel: string, ignoreSel: string, tol: number, floorRatio: number,
 *          structuralCarousel: string[], paginatorCarousel: string[]}} opts
 * @returns {null | {ratio: number, canSplit: boolean, splitRatio: number,
 *                   illegible: object|null, unmeasured: number}}
 */
function buildSplitVerdict(s, deps, opts) {
  const probeSectionOverflow = deps.probeSectionOverflow;
  const probeFigureLegibility = deps.probeFigureLegibility;
  const clipSel = opts.clipSel;
  const ignoreSel = opts.ignoreSel;
  const tol = opts.tol;
  const floorRatio = opts.floorRatio;
  const structuralCarousel = opts.structuralCarousel;
  const paginatorCarousel = opts.paginatorCarousel;

  const probe = probeSectionOverflow(s, clipSel, tol, ignoreSel);
  const vOver = probe.vOver;
  const over = probe.over;
  // §8 rule 8 — the LEGIBILITY FLOOR. A viewBox figure is container-responsive: it never
  // overflows its box, it shrinks its own text, so `probe.over` is structurally blind to it
  // and a dense figure ships silently at 6px type. Reported on its own axis, and NEVER
  // splittable — a figure has no seam to divide, so the honest answer is the ring.
  const leg = probeFigureLegibility(s, floorRatio);
  const illegible = leg?.under ? leg : null;
  // Figures whose labels the probe cannot size at all (mermaid's `<foreignObject>` HTML
  // labels). Carried on its own field so the report can say "not measured" rather than
  // let silence read as "legible" (HARD RULE #23).
  const unmeasured = leg && !leg.count && leg.unmeasured ? leg.unmeasured : 0;
  if (illegible && !over) {
    // Illegible while its box FITS: nothing to split (a figure has no seam), so record and stop.
    return { ratio: 1, canSplit: false, splitRatio: 1, illegible, unmeasured };
  }
  if (!over) return null;
  // …and a slide that is BOTH illegible and clipping must be reported on BOTH axes. Returning
  // early above swallowed such a slide's CLIPPED warning and its split — flagged as a latent
  // ordering hazard by the HARD RULE #25 inversion pass, which could not construct the
  // co-occurrence (once the box overflows the figure stops being squeezed) but was right that
  // nothing prevented it. `illegible` now rides along on the record instead of replacing it.
  const C = probe.clientH;
  const ratio = C > 0 ? probe.scrollH / C : 2;
  // A STRUCTURAL carousel (cover-code/cover-sides) re-authors a side-by-side layout to
  // one panel per page, so ANY overflow is actionable — compare-code overflows
  // HORIZONTALLY (two code blocks too wide for a portrait box; one-block-per-page fixes
  // it). Mark it splittable and let resplitDoc's carousel branch own it (the ratio is
  // irrelevant to a structural re-author).
  if (structuralCarousel.some((c) => s.classList.contains(c))) {
    return { ratio, canSplit: true, splitRatio: ratio, illegible, unmeasured };
  }
  // A VERTICAL PAGINATOR (cover-paginate) divides a row/item collection; it can only fix
  // VERTICAL overflow. A too-wide table overflows HORIZONTALLY — row-splitting it is
  // futile and balloons the deck — so gate canSplit on vOver and leave a width-overflow
  // for the ring (this is the guard that lets a wide compare-table / obligation-matrix
  // carry a split recipe without ever ballooning).
  if (paginatorCarousel.some((c) => s.classList.contains(c))) {
    return { ratio, canSplit: vOver, splitRatio: ratio, illegible, unmeasured };
  }
  // The auto-splitter only divides a list (ul/ol) or table — so a split can only
  // make the slide fit if THAT collection is the height driver. Measure the tallest
  // such collection and the headroom the surrounding content leaves: if the
  // non-collection content alone already fills the box (a tall <p>/figure/code with
  // an incidental list), splitting just copies that block onto every piece and never
  // fits — leave it for the ring. `canSplit` gates the measured pass; `splitRatio`
  // sizes it from the collection's own height, not the whole slide's.
  // The collection's REAL extent, not its laid-out box. `offsetHeight` was the measure, and
  // in a bounded flex stage it reports the SQUEEZED height: a checklist's `ul` inside
  // `section.checklist > .cell-stage { display: flex; flex-direction: column }` shrank to
  // offsetHeight 0 (rect 0, scrollHeight 312) and the veto therefore concluded the
  // collection contributed NOTHING to the overflow — the exact opposite of the truth — and
  // refused to split a slide whose list was the entire driver. It clipped, silently.
  // `scrollHeight` is the content extent a clipping or squeezed box hides, which is what
  // "how tall does this collection want to be" means; the rect is the floor for the ordinary
  // un-squeezed case. Same cell-aware reasoning as `probeSectionOverflow` itself.
  const extentOf = (el) => Math.max(el.scrollHeight, Math.round(el.getBoundingClientRect().height));
  let collH = 0;
  let collEl = null;
  s.querySelectorAll('ul, ol, table').forEach((el) => {
    const h = extentOf(el);
    if (h > collH) { collH = h; collEl = el; }
  });
  // …AND the headroom must be measured against the slide the split will actually EMIT, not
  // the one on screen. The envelope HOISTS the framing lede to the cover and the trailing
  // note/key-insight off every page but the last, so counting them as immovable
  // non-collection content under-reports the room a body page will have. Measured in the
  // emulator on a portrait `checklist` of 8 items with a long lede and a long below-note: the
  // collection read 0 (`offsetHeight` and its rect both 0 against a scrollHeight of 312 — the
  // squeeze above), so the headroom came out at −114 against a 269px floor and the slide was
  // VETOED. It clipped, silently, while the identical slide with the lede and note deleted
  // split cleanly — so the author's fix would have been to cut the lede, which is exactly the
  // content the envelope was built to relocate.
  //
  // Mirrors split-envelope.js's own `ledeSpansIn` / `trailingSpansIn` (HARD RULE #1 — same
  // two regions, read here from the DOM instead of the HTML string): the LEDE is the
  // cell's direct-child <p>s before the collection, minus the code-only eyebrow/subtitle
  // and a chart subtitle; the TRAILING run is the contiguous <p> / .below-note /
  // <blockquote> after it. Deliberately narrow — over-counting would let an unsplittable
  // slide into the loop and balloon the deck.
  let hoistH = 0;
  if (collEl) {
    const cell = s.querySelector(':scope > .cell-stage') || s;
    if (cell.contains(collEl)) {
      const kids = [...cell.children];
      const at = kids.findIndex((el) => el === collEl || el.contains(collEl));
      if (at > 0) {
        for (const el of kids.slice(0, at)) {
          if (el.tagName !== 'P') continue;
          if (el.classList.contains('chart-subtitle')) continue;
          if (el.children.length === 1 && el.firstElementChild.tagName === 'CODE') continue;
          hoistH += extentOf(el);
        }
      }
      for (let k = kids.length - 1; k > at; k--) {
        const el = kids[k];
        if (el.tagName === 'HEADER' || el.tagName === 'FOOTER' || el.tagName === 'NAV') continue;
        const trailing = el.tagName === 'P' || el.tagName === 'BLOCKQUOTE'
          || (el.tagName === 'DIV' && el.classList.contains('below-note'));
        if (!trailing) break;
        hoistH += extentOf(el);
      }
    }
  }
  const headroom = C - (probe.scrollH - collH - hoistH); // room a BODY page will have
  // ── The HORIZONTAL half, which this gate did not have (#1234 group C).
  //
  // `canSplit` keyed on `vOver` alone, so a collection that overflows ONLY sideways
  // was never handed to the measured loop. `list-steps` at `size: square` is the
  // reproduction: its `<ol>` is `display:flex; flex-direction:row`, and six steps want
  // **1291px in a 972px track** (eight want 1852) with `scrollH === clientH` — zero
  // vertical spill. Step 06 rendered entirely off the frame and step 05 sliced
  // mid-word, on a component that declares `capacity.perPage: 1` and would have been
  // completely fixed by pagination. Worse, the slide was over `capacity.hard` and the
  // static pass DID defer it — but a deferred candidate is dropped when the slide is
  // already in the measured list, and it was, with `canSplit: false`. So it fell
  // between the two passes and shipped clipped, while `lint:deck`'s
  // `capacity-autosplit` advisory told the author it would be divided. That is §8
  // rule 10's lie-to-the-author defect, through a different door.
  //
  // The `vOver` gate was RIGHT about its own case and too broad. Its stated reason (at
  // the paginator branch above) is that "a too-wide table overflows HORIZONTALLY —
  // row-splitting it is futile and balloons the deck". True of a `<table>`: its width
  // comes from its COLUMNS and its rows stack vertically, so cutting rows narrows
  // nothing. False of a collection whose MEMBERS run along the inline axis — there,
  // fewer members per page IS a narrower row, and pagination fixes the overflow
  // directly. So the test is not "which direction did it overflow" but "does splitting
  // this collection reduce its width", which is a property of its layout.
  const hOver = collEl ? collEl.scrollWidth - collEl.clientWidth > tol : false;
  const inlineFlow = (() => {
    if (!collEl || collEl.tagName === 'TABLE') return false; // the counter-case, excluded by construction
    const cs = getComputedStyle(collEl);
    if (cs.display.includes('flex')) return cs.flexDirection.startsWith('row');
    // A multi-COLUMN grid lays members out inline too; a single-column one does not.
    if (cs.display.includes('grid')) return cs.gridTemplateColumns.split(/\s+/).filter(Boolean).length > 1;
    return false;
  })();
  const vSplit = vOver && headroom > C * 0.2;
  const hSplit = hOver && inlineFlow;
  const canSplit = collH > 0 && (vSplit || hSplit);
  // Size the cut from whichever axis is actually binding. For the horizontal case that
  // is how many times too wide the collection is — and the authored `perPage` still
  // wins where it is tighter (`resplitDoc` takes the tighter of the two), so a
  // `perPage: 1` component still atomizes rather than merely halving.
  const splitRatio = vSplit
    ? Math.max(2, collH / headroom)
    : (hSplit ? Math.max(2, collEl.scrollWidth / Math.max(1, collEl.clientWidth)) : ratio);
  return { ratio, canSplit, splitRatio, illegible, unmeasured };
}

module.exports = {
  buildSplitVerdict,
  // Function source for verbatim injection into browser-string contexts (the
  // emulator's page.evaluate, and the runtime when it becomes a measurer) —
  // keeps the LOGIC single-sourced. Same idiom as overflow-probe.js's PROBE_SRC.
  SPLIT_VERDICT_SRC: buildSplitVerdict.toString(),
};
