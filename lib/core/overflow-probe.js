/**
 * overflow-probe — the ONE source of truth for "does this slide overflow its
 * frame?", shared by every measurement site (HARD RULE #1).
 *
 * The naive test is `section.scrollHeight > section.clientHeight`. That was
 * correct while every component body flowed as direct children of `<section>`:
 * an over-stuffed body grew the section's scrollHeight, and the watcher saw it.
 *
 * The flex cell-tree (2026-06-26-frames-as-flex-cell-trees.md) changes that. A
 * bounded content Cell (`overflow: clip; min-height: 0`) CONTAINS its overflow —
 * so the cell can be 110px over its box while the SECTION reports zero overflow.
 * Left unfixed, the clip would silently swallow overflow: the red ring would
 * stop firing, the export "Overflows" warning would go quiet, and — worst —
 * runtime autosplit (lib/core/auto-split.js), which divides slides BY their
 * measured scrollHeight/clientHeight ratio, would never trigger and the content
 * would be lost off-cell with no signal. (Verified empirically on an
 * over-stuffed split-panel: section over 110px→0px once `.panel-right` clipped.)
 *
 * So overflow must be probed CELL-AWARE: a section overflows if its own box
 * overflows OR any bounded content Cell clips content internally. We surface a
 * clipped cell's internal overflow as section-equivalent (clientH + delta) so
 * the existing ratio math in measureOverflow keeps working unchanged — autosplit
 * sizes the split from the real content height, not the clipped box.
 *
 * CLIP_CELL_SELECTOR lists the bounded CONTENT cells (doc §4c: content cells
 * clip AND report; decorative cells — watermark, atmosphere, the split feature
 * bleed — clip but are NOT probed, so an intentional decorative bleed never
 * trips the ring). `.cell-stage` is the standard frame's body cell (the generic-
 * prose + migrated-component body); `.panel-left`/`.panel-right`/`.compare-right`
 * are the split frames' panel bodies.
 *
 * IT IS NO LONGER THE WHOLE SET, and that is the 2026-08-03 change (#1299/#1300).
 * An allowlist is SILENT BY DEFAULT: a box that clips author content and nobody
 * remembered to add is invisible to the ring, the export warning and autosplit at
 * once. One missing `.panel-left` cost a slide its eyebrow and two-thirds of its
 * heading, at `over: false`, with no channel saying so. Both probes now DISCOVER
 * the clipping boxes they measure and name only the exceptions
 * (IGNORED_CLIP_SELECTOR); the curated list survives because the two probes trust
 * those cells with measures they do not extend to a box they merely found. Which
 * measure goes where, and why, is documented at each site below.
 */

// Bounded CONTENT cells that clip their overflow and MUST be probed for it.
// Keep this in sync as frames adopt the flex cell-tree clip contract.
//
// `.panel-left` was missing from this list until 2026-08-03 and its absence was
// LOAD-BEARING: split-panel's left panel is `justify-content: flex-end;
// overflow: hidden`, so an over-stuffed panel threw its eyebrow and heading off
// the BLOCK-START edge, where `scrollHeight - clientHeight` reads zero. The cell
// was never probed, the section's own fold saw two panels that fit, and the slide
// shipped with 24 text rects cut — the worst by 882px — at `over: false`, with no
// ring, no pill and no console line (#1299). It is a bounded CONTENT cell by the
// cell-tree doc's own §5 table ("panel-left body"); the omission was an oversight,
// not a policy. That one missing selector is also why the ALLOWLIST shape below
// gained a discovery pass: a set maintained by hand is silent by default, and the
// thing it goes silent about is a whole slide's worth of heading.
const CLIP_CELL_SELECTOR = '.cell-stage, .panel-left, .panel-right, .compare-right';

// Clip boxes that are NOT evidence of lost content, for BOTH probes.
//
// Three kinds, and each earned its entry on a measured false positive across the
// shipped corpus rather than on principle:
//
//   · DECORATIVE (doc §4c) — the split feature bleed and the ghost watermark /
//     letterform clip a deliberate overflow. Counting them re-opens exactly the
//     false ring §4c exists to prevent. Named as ELEMENTS (`div.watermark`,
//     `.tile-watermark`, `.split-feat-wm`), never as the bare class — see the note
//     above the constant for the hole that cost.
//   · INVISIBLE MIRRORS — KaTeX renders a `.katex-mathml` accessibility twin
//     inside a 1x1px `overflow:hidden` box. Its inner text sits under a `static`
//     parent, so a 955px Range rect qualifies as a cut bearer, and every one is a
//     phantom (#1300 item 4). Named EXACTLY, plus the image scrim.
//
//     NOT generalized to `[aria-hidden="true"]`, which the first cut did on the
//     theory that it was "the standards-level statement of the same fact". It is
//     not, and it broke both ways. Outward: `lib/engine/index.js` sets `html: true`,
//     so a deck author who wraps a slide in `<div aria-hidden="true">` — a
//     plausible, well-intentioned a11y move — turns off the ring, the pill, the
//     console line AND autosplit for that subtree, with no lint rule against it.
//     Inward: this engine puts `aria-hidden` on elements carrying VISIBLE AUTHOR
//     TEXT (`journey.transform.js:207` emits
//     `<span class="journey-actor-dot" aria-hidden="true">${label}</span>`), so
//     those labels could never be reported as cut. `aria-hidden` means "hidden from
//     assistive technology", which is not the same claim as "not content a sighted
//     reader can lose" — and this probe asks the second question. (HARD RULE #25
//     red team.)
//   · THE MARKER'S OWN CHROME — the overflow tab and the Fix-Me overlay must never
//     be the evidence that content was cut, or the marker justifies itself: draw a
//     tab, measure the tab, keep the tab.
//
// SVG-namespace boxes are excluded STRUCTURALLY rather than by name (see
// `inSvg` inside the probes): the UA stylesheet puts `overflow: hidden` on
// `<svg>`, `<marker>`, `<symbol>` and `<pattern>`, which made `<marker>` alone
// the single largest source of phantom clip boxes in the corpus — 225 of them,
// every one spilling and none cutting anything. A viewBox figure is
// container-responsive and never spills its box by construction; its failure mode
// is shrinking its own labels, which `probeFigureLegibility` owns.
//
// EVERY ENTRY IS NARROW ON PURPOSE, because both probes exclude by `closest()` and
// `closest()` takes the whole SUBTREE with it. A bare `.watermark` looked right and
// was a hole big enough to drive this entire change through: `watermark` is also a
// UNIVERSAL SECTION VARIANT (`section.content.confidential.watermark`,
// `section.split-panel.watermark`), so `el.closest('.watermark')` matched the SECTION
// from anywhere inside it — measured on the corpus, 6 slides and all 141 elements in
// them silently excluded from BOTH probes. That is exactly the blindness this file
// exists to remove, re-introduced by the list meant to make it precise. The
// decorative watermark is a `div`, so name the element, never the variant.
//
// THE RUNNING-FOOTER BAND IS NOT IN THIS LIST — and has no DETECTION exemption
// anywhere. It was named here for one commit, because reporting the footer's already-
// priced ellipsis made the new channel shout about a dated decision on most of its first
// hits, and `2026-07-27-footer-band-allocation.md` prices exactly one thing: the
// HORIZONTAL `text-overflow: ellipsis` tail of the footer's own TEXT. Naming the band
// here swallowed far more than that (the band's own `height: 1.6em; overflow: hidden`
// vertical clip, and any image `footer:` passes as raw HTML), and the same doc asks to be
// TOLD about even the tail it prices — its option (d), "so the author is told". So the
// probe reports every footer cut. What the READER is shown is a separate question,
// answered by `chromeOnly` in `probeContentClipped` — detection is general, treatment is
// not. (HARD RULE #25, rounds 2 and 3.)
//
// TWO LISTS, BECAUSE THERE ARE TWO QUESTIONS, and conflating them was an
// AUTHOR-REACHABLE KILL SWITCH for the entire register. One list matched with
// `closest()` served both, so a single class anywhere in a slide — `_class: content
// image-scrim`, or a hand-typed `<div class="tile-watermark">`, both legal because
// `lib/engine/index.js` sets `html: true` — turned off discovery in BOTH probes, and
// with `over` forced false, autosplit with them. Measured on a real export: the same
// ellipsed `<strong>` reported `content-cut: true` on a plain slide and `false` on the
// same slide carrying `image-scrim`, with `lint:deck` raising a WARNING at most.
//
// THE SET IS THE SAME; THE MATCHING IS NOT, and the matching was the whole defect.
//
//   · AS A CLIP BOX — matched with `matches()` on the box itself. "This box's clip is
//     decorative, so it is not evidence" is a property of ONE BOX. It needs no subtree
//     reach, and without the reach a class cannot silence anything but the element
//     carrying it. Every entry is element-qualified (`div.`, `span.`) because that is
//     what the engine emits, and the SECTION is never tested against the list at all —
//     the outermost boundary of a slide is not negotiable.
//   · AS A BEARER — matched with `closest()`, deliberately, because THAT claim really is
//     about a subtree: text inside a decorative watermark is not lost content, KaTeX's
//     `.katex-mathml` mirror is an invisible twin (23 boxes, a 955px phantom rect each),
//     and the marker's own chrome must never be the evidence that content was cut.
//
// A first cut split the ENTRIES between the two lists rather than the SEMANTICS, and
// dropping `.katex-mathml` from the box side put the mirror's 1x1px `overflow: hidden`
// box back into discovery: 13 math gallery slides went from clean to `over: true` on the
// corpus sweep, which is the phantom the exclusion was written for. Same set, two
// questions, two matchers.
//
// What the `closest()` half still allows, stated rather than hidden: an author who types
// `<div class="image-scrim">` around content can keep the CONTENT probe from counting it.
// That is a real residue, and it is bounded — the geometry probe, the ring, the console
// line and autosplit are all `matches()`-side now, so the catastrophic version (one class
// switching off the whole register for a slide) is gone.
//
// NOT generalized to `[aria-hidden="true"]`, which an earlier cut tried on the theory
// that it was "the standards-level statement of the same fact". It is not, and it broke
// both ways — an author's a11y wrapper silenced the register, and this engine puts
// `aria-hidden` on elements carrying VISIBLE AUTHOR TEXT (`journey.transform.js` emits
// `<span class="journey-actor-dot" aria-hidden="true">${label}</span>`).
const MARKER_CHROME_SELECTOR = '.overflow-tab, .illegible-tab, .lattice-fixme-tab, .lattice-fixme-box, .lattice-fixme-overlay';
const IGNORED_CLIP_SELECTOR = `div.watermark, div.tile-watermark, div.split-feat-wm, div.split-feat-bleed, div.image-scrim, span.katex-mathml, ${MARKER_CHROME_SELECTOR}`;
// The same set. The NAME is what differs, because the matcher differs — see above.
const IGNORED_BEARER_SELECTOR = IGNORED_CLIP_SELECTOR;

// §8 rule 8's legibility floor, as a FRACTION OF SLIDE HEIGHT — the smallest a viewBox figure's own
// text may render before the slide gets the honest ring instead of a silent shrink.
//
// A fraction, not an absolute px, because a deck is displayed scaled-to-fit: what a viewer perceives
// is the glyph's size RELATIVE to the slide, and that is also the only measure a figure's own design
// controls (its text is N user units in an M-unit viewBox, so it scales with whatever box it gets).
// An absolute px constant looked preset-invariant and is not: the SAME `state-chart` gallery figure
// measures 5.2px at `square`, 6.7px at `portrait`, 7.9px at `hd` and 23.7px at `4K` — one design,
// a 4.5× spread, and one preset where an 8px floor silently passed it. As a fraction of slide height
// `hd` and `4K` agree exactly (1.10% both), which is what an invariant floor has to do. (Found by
// the HARD RULE #25 inversion pass, which measured the spread across every preset.)
//
// 1% is a LEGIBILITY judgment, not a number fitted to the catalog: at 1% of slide height a glyph is
// ~2mm on a laptop-sized slide and ~2cm projected — the point below which a label stops being read
// and starts being decoration.
//
// MEASURED against every shipped chart + diagram gallery through the emulator (the surface this gate
// actually runs on, so the numbers are the ones a deck really gets). EIGHT slides fall below it:
//
//   diagram p15 0.70 · state-chart p6 0.74 · diagram p26 0.78 · state-chart p5 0.81
//   diagram p8 0.86 · diagram p17 0.86 · radar p7 0.95 (the `small-multiples` variant) · diagram p27 0.98
//
// They fire ON PURPOSE — they are the rule's own subject: a figure whose labels render at 0.70% of
// the slide is exactly the "ships silently at 6px type" this rule was written about.
//
// DISCLOSED, because the margin is thin: the catalog straddles this floor rather than clearing it.
// The nearest above are `state-chart` p9 and `diagram` p12 at 1.09, then p2/p7/p29 at 1.11 and
// `quadrant`'s densest at 1.13 — one re-tune away from ringing. Everything else clears with room.
// The floor was not moved to buy that margin; a floor chosen to keep the catalog quiet is not a floor.
//
// NOT EVERY FIGURE IS MEASURABLE, and that is reported rather than assumed. Mermaid runs with
// `htmlLabels`, so a flowchart's labels are `<foreignObject>` HTML, not SVG `<text>`: `diagram`
// p16/p22/p24 carry 39 / 6 / 25 such labels and zero `<text>`. Those return `count: 0,
// unmeasured > 0` and the export prints a separate "NOT MEASURED" line. The numbers above are
// therefore a measurement of the fraction of the catalog this probe can see — which is most of it,
// but not all, and the difference is stated instead of hidden.
//
// (Measure it the same way if you re-calibrate: render through `node lattice-emulator.js` AND read
// the result at the deck's own slide canvas — the emulator sets `page.setViewport({width: slideW,
// height: slideH})`. A figure's box, and so its scaled text, depends on the viewport, so loading the
// exported HTML at some other size reports different numbers for the same slide. Getting this wrong
// is how the first version of this comment shipped values that did not reproduce.)
const FIGURE_TEXT_FLOOR_RATIO = 0.01;

/**
 * Does `s` (a slide <section>) overflow its frame, counting the internal
 * overflow of any bounded content cell that clips? Pure + browser-evaluable
 * (no closures, no module refs) so it can be `.toString()`-injected into the
 * emulator's inline watcher and page.evaluate contexts verbatim.
 *
 * SCALE-AWARE, because two of its three measures disagree about units under a
 * CSS transform. `getBoundingClientRect()` returns the VISUAL box — a section
 * at `scale(0.54)` reports 0.54× its layout size — while `scrollHeight` /
 * `clientHeight` / `offsetHeight` are transform-blind LAYOUT px. The probe mixes
 * both (rect geometry for spill, scroll dims for a child's hidden content), so
 * on a scaled section the two arrive in different units and the sum is neither.
 * The docs-site filmstrip (docs/src/playground/deck-preview.js) scales every
 * `<section>` to fit the preview pane, so this is the common case, not a corner:
 * the SAME over-stuffed matrix-grid measured 30px over at scale 1 and 17px over
 * at scale 0.543 — and with TOL at 12 that is the difference between a ring and
 * silence. (The Studio's single-slide preview scales the IFRAME ELEMENT instead,
 * so its sections are unscaled and it never saw this; the two surfaces
 * disagreeing about the same slide is what surfaced it.)
 *
 * So everything is normalized to LAYOUT px: `k` is the section's cumulative
 * visual scale (rect height ÷ offsetHeight — cumulative, so an ancestor's
 * transform counts too), rect-derived spill is divided by it, and a layout-px
 * quantity folded onto a rect is multiplied by it first. k falls back to 1 when
 * there is no rect or no offsetHeight (the pure-dims unit fakes), which is the
 * unscaled case, so nothing downstream changes for an untransformed slide.
 *
 * @returns {{over:boolean, vOver:boolean, scrollH:number, clientH:number, overCells:Array<{index:number,dy:number,dx:number}>}}
 *   vOver = vertical overflow only (autosplit can only fix vertical);
 *   scrollH/clientH = the EFFECTIVE vertical extent (cell overflow folded in),
 *   for the caller's ratio math. overCells lists, by INDEX into
 *   `clipSelector`'s NodeList (never an element reference — this function is
 *   also injected into the emulator's page.evaluate context, and DOM refs
 *   can't cross that boundary), every clip cell whose own spill exceeded TOL.
 *   A clip cell that overflows genuinely clipped its own content — unlike a
 *   grow-to-fit grid card, it never pushed a neighbour — so this is a safe
 *   per-element "cause" signal where naive section-level geometry isn't (see
 *   engineering/decisions/2026-07-10-overflow-cause-highlighting.md).
 */
function probeSectionOverflow(s, clipSelector, TOL, ignoreSelector) {
  // Measure `box`'s content spill past its own rect from its FLOWED children's
  // layout rects: skips position:absolute/fixed children (decorative placement,
  // not content — a moved logo, a docked footer) and 0x0 rects
  // (display:contents / empty). With `foldChildOverflow`, each child also
  // contributes its own internal overflow (scrollHeight − clientHeight, folded
  // onto its content bottom/right) — a height-constrained body whose descendant
  // content spills would otherwise read as fitting (its BOX fits; its content
  // doesn't). Returns null when there were no measurable flowed children, so
  // callers can keep the legacy raw-dims path for the pure-dims unit fakes.
  // NESTED (not module-level) on purpose: this whole function is
  // .toString()-injected into page.evaluate / the emulator's inline watcher,
  // so everything it needs must travel inside its own source.
  // Does `el` clip its OWN overflow? A clip box hiding content is doing its job (a
  // container-responsive figure wrapper, a scroll region), so its hidden pixels are not
  // evidence the SLIDE overflows. Only a visible-overflow child that reports hidden pixels
  // has been squeezed by its parent's layout — that content is painting over its siblings.
  // NESTED for the same reason as `flowedSpill`: this whole function is .toString()-injected.
  function clipsOwnOverflow(el) {
    if (typeof getComputedStyle !== 'function') return false;
    const st = getComputedStyle(el);
    const oy = st.overflowY;
    const ox = st.overflowX;
    return (oy && oy !== 'visible') || (ox && ox !== 'visible');
  }
  // Is `el` an SVG-namespace box? The UA stylesheet clips <svg>/<marker>/<symbol>/
  // <pattern>, so discovery reads them as bounded content cells — 225 phantom boxes
  // across the corpus, `<marker>` alone. A viewBox figure never spills its box;
  // probeFigureLegibility owns its real failure mode. NESTED, like everything else
  // here, because this function is .toString()-injected whole.
  function inSvg(el) {
    return el.namespaceURI === 'http://www.w3.org/2000/svg';
  }
  function flowedSpill(box, foldChildOverflow, k) {
    if (typeof box.getBoundingClientRect !== 'function' || !box.children || !box.children.length) return null;
    const br = box.getBoundingClientRect();
    let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity, seen = 0;
    for (let i = 0; i < box.children.length; i++) {
      const ch = box.children[i];
      if (typeof getComputedStyle === 'function') {
        const pos = getComputedStyle(ch).position;
        if (pos === 'absolute' || pos === 'fixed') continue; // placement, not content
      }
      const r = ch.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      seen++;
      let cBottom = r.bottom, cRight = r.right;
      if (foldChildOverflow) {
        // Guarded for the pure-dims fakes whose children carry no scroll/client numbers.
        // Scaled INTO rect space by `k` before the fold: these are layout px and `r` is
        // visual px, so adding them raw over-reports by 1/k on a scaled section.
        const ivh = typeof ch.scrollHeight === 'number' && typeof ch.clientHeight === 'number' ? ch.scrollHeight - ch.clientHeight : 0;
        const ivw = typeof ch.scrollWidth === 'number' && typeof ch.clientWidth === 'number' ? ch.scrollWidth - ch.clientWidth : 0;
        if (ivh > 0) cBottom = r.bottom + ivh * k;
        if (ivw > 0) cRight = r.right + ivw * k;
      }
      if (r.top < top) top = r.top;
      if (cBottom > bottom) bottom = cBottom;
      if (r.left < left) left = r.left;
      if (cRight > right) right = cRight;
    }
    if (!seen) return null;
    // spill past EITHER edge (a centered overflow spills both top and bottom),
    // divided back out of visual space so the caller gets LAYOUT px like the
    // scroll/client dims it will be compared against.
    return {
      overV: ((br.top - top > 0 ? br.top - top : 0) + (bottom - br.bottom > 0 ? bottom - br.bottom : 0)) / k,
      overH: ((br.left - left > 0 ? br.left - left : 0) + (right - br.right > 0 ? right - br.right : 0)) / k,
    };
  }

  // The section's cumulative VISUAL scale (see the header note). offsetHeight is
  // the untransformed layout height, so rect ÷ offset is the whole transform
  // chain's effect, ancestors included. 1 whenever it can't be measured or is
  // within rounding of unscaled — offsetHeight is integer-rounded, so a hair
  // either side of 1 is noise, not a transform.
  let K = 1;
  if (typeof s.getBoundingClientRect === 'function' && typeof s.offsetHeight === 'number' && s.offsetHeight > 0) {
    const kr = s.getBoundingClientRect().height / s.offsetHeight;
    if (kr > 0 && kr < 100 && Math.abs(kr - 1) > 0.005) K = kr;
  }

  let scrollH = s.scrollHeight;
  const clientH = s.clientHeight;
  let scrollW = s.scrollWidth;
  const clientW = s.clientWidth;

  // The section's OWN content overflow, measured from its FLOWED children — NOT
  // the raw scroll dims. Raw scrollHeight/scrollWidth count DECORATIVE,
  // out-of-flow chrome intentionally placed against (or bleeding past) the slide
  // edge — a finish MARK/EDGE pseudo or a moved deck-logo — and counting those
  // as content overflow false-trips the ring / export warning / autosplit.
  // foldChildOverflow=true restores the detection raw scroll extent gave for a
  // height-constrained body whose content spills inside a fitting box (the
  // STAGE_DEFERRED chart/gantt/timeline bodies with no clip cell). Falls back
  // to raw dims when there are no measurable children (the unit fakes).
  const secSpill = flowedSpill(s, true, K);
  if (secSpill) {
    scrollH = clientH + (secSpill.overV > 0 ? secSpill.overV : 0);
    scrollW = clientW + (secSpill.overH > 0 ? secSpill.overH : 0);
  }

  // Bounded content cells clip their overflow (overflow:clip; min-height:0), so
  // the SECTION can report zero while a cell is 110px over. Probe each cell and
  // surface its internal overflow as section-equivalent (clientH + delta) so the
  // caller's ratio math keeps working. `scrollHeight - clientHeight` alone
  // UNDER-reports a CENTERED (or bottom-anchored) cell — content clipped off the
  // TOP sits at a negative offset scrollHeight never counts — so also measure
  // the true spill from the children's layout rects and take the larger:
  // flex-start stays correct, center / flex-end get caught.
  const cells = s.querySelectorAll(clipSelector);
  const overCells = [];
  let maxSqueezed = 0;
  let clipSuspect = false;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    let dy = c.scrollHeight - c.clientHeight;
    let dx = c.scrollWidth - c.clientWidth;
    const cellSpill = flowedSpill(c, false, K);
    if (cellSpill) {
      if (cellSpill.overV > dy) dy = cellSpill.overV;
      if (cellSpill.overH > dx) dx = cellSpill.overH;
    }
    // …and the amount a SQUEEZED child is hiding. Neither measure above can see it: the cell's own
    // `scrollHeight - clientHeight` is zero because the flex layout SHRANK the child to make it fit,
    // and the rect walk finds no geometric spill for the same reason — a squeezed middle child's
    // folded bottom still sits above a later sibling's. So there is no overflow anywhere in the
    // geometry, and the content is simply drawn on top of itself.
    //
    // This is the common flex case, not a corner: `section.checklist > .cell-stage` distributes its
    // rows, so a `<ul>` wanting 538px in a 434px slot reports rect 434 / scrollHeight 538 while the
    // cell reports zero. Seen on a real render — a checklist with a lede, eight items, a note and a
    // key insight drew its rows over each other with NO warning and no split, because every level of
    // the measurement said it fit. The hidden amount IS the overflow, so sum it across the cell's
    // children (the same `scrollHeight - clientHeight` subtraction `flowedSpill`'s fold already
    // uses, applied where it is not masked).
    //
    // ONLY children whose own overflow is VISIBLE. A child that CLIPS is a designed clip box
    // doing its job, and its `scrollHeight - clientHeight` is not evidence the slide overflows:
    // `.chart-body` wraps a container-responsive figure at `overflow: hidden` and steadily
    // reports ~43 hidden px on a page that plainly fits. Counted, that produced a false
    // "⚠ OVERFLOW … CLIPPED" on two shipped decks (examples/portrait-gantt-statechart pages 4-5,
    // the gallery's cycle page) where the PDF is pixel-identical to `main` — and worse, the false
    // measurement fed `resplitDoc`, so a fitting slide was cut into a cover plus two half-empty
    // body pages whose overflow never cleared, because the phantom travels with the content.
    // The genuine case measures the other way round: a flex-crushed child sits at
    // `clientHeight: 0` with `overflow-y: visible`, its content painting over its siblings with
    // nothing anywhere to clip it. Visible-overflow children are exactly the ones nothing else
    // can see. (HARD RULE #25 red team, on real renders.)
    //
    // And measured GEOMETRICALLY, against the right LIMIT — which is what the content actually
    // collides with. Two earlier attempts got the limit wrong in opposite directions:
    //
    //   · a bare SUM of hidden pixels over-reported. The gallery's `cycle` page has a `<ul>`
    //     hiding 43px inside a cell with a third of its height free: the content lands in blank
    //     space and nothing is lost, yet it printed "⚠ OVERFLOW … CLIPPED" and fed `resplitDoc`,
    //     which cut a fitting slide into half-empty pages.
    //   · "does it clear the CELL's bottom edge" under-reported, and that is worse. A crushed
    //     child in the MIDDLE of a cell paints over its FOLLOWING SIBLINGS long before it reaches
    //     the cell's edge. On examples/split-relationship.md the checklist's `<ul>` was squeezed
    //     to 125px with 375px of content, and its rows drew straight over the closing paragraph
    //     and the key insight — a page shipped with text on top of text and no warning at all.
    //
    // So the limit is the NEXT flowed sibling's top, or the cell's content bottom for the last
    // child. That is the line the content cannot cross without covering something. MAX, not sum:
    // each child is measured against its own limit, so adding them double-counts.
    let squeezed = 0;
    const cRect = typeof c.getBoundingClientRect === 'function' ? c.getBoundingClientRect() : null;
    const kids = cRect && c.children ? c.children : [];
    const flowedRect = (el) => {
      if (!el || typeof el.getBoundingClientRect !== 'function') return null;
      if (typeof getComputedStyle === 'function') {
        const pos = getComputedStyle(el).position;
        if (pos === 'absolute' || pos === 'fixed') return null; // placement, not content
      }
      const r = el.getBoundingClientRect();
      return r.width === 0 && r.height === 0 ? null : r;
    };
    for (let k = 0; k < kids.length; k++) {
      const ch = kids[k];
      if (typeof ch.scrollHeight !== 'number' || typeof ch.clientHeight !== 'number') continue;
      if (clipsOwnOverflow(ch)) continue;
      const hidden = ch.scrollHeight - ch.clientHeight;
      if (hidden <= 0) continue;
      const r = flowedRect(ch);
      if (!r) continue;
      let limit = cRect.bottom;
      for (let n = k + 1; n < kids.length; n++) {
        const nr = flowedRect(kids[n]);
        if (nr) { limit = nr.top; break; }
      }
      // `hidden` is layout px and r/limit are visual px — fold in rect space, then
      // divide back to layout px (the unit `dy` and TOL are in).
      const past = ((r.bottom + hidden * K) - limit) / K;
      if (past > squeezed) squeezed = past;
    }
    if (squeezed > maxSqueezed) maxSqueezed = squeezed;
    if (squeezed > dy) dy = squeezed;
    if (dy > 0) scrollH = Math.max(scrollH, clientH + dy);
    if (dx > 0) scrollW = Math.max(scrollW, clientW + dx);
    // Only past TOL: a cell within the same noise budget that gates `over`
    // itself isn't a provable cause, just jitter.
    if (dy > TOL || dx > TOL) overCells.push({ index: i, dy, dx });
    if (dy > TOL || dx > TOL) clipSuspect = true;
  }

  // EVERY OTHER CLIPPING BOX, discovered rather than listed.
  //
  // `clipSelector` is an allowlist, and an allowlist is SILENT BY DEFAULT: a box
  // that clips author content and nobody remembered to add is invisible to all
  // three registers at once. #1299 is what that costs — one missing `.panel-left`
  // and a slide ships with its eyebrow and two-thirds of its heading gone, at
  // `over: false`. Enumerating the five boxes #1300 lists would just move the next
  // omission one component along, so the default is inverted here: probe what
  // actually clips, and name only the exceptions (IGNORED_CLIP_SELECTOR).
  //
  // GEOMETRIC MEASURE ONLY — `flowedSpill`, never `scrollHeight - clientHeight`.
  // This is the whole reason a discovered box can be trusted at all. Scroll dims
  // LIE about a container-responsive box: `.chart-body` wraps a figure that scales
  // to its box and steadily reported ~43 hidden px on pages that plainly fit,
  // which is what produced the false "⚠ OVERFLOW … CLIPPED" documented in the
  // squeezed-child note above — and worse, fed `resplitDoc`, cutting a fitting
  // slide into half-empty pages. A child rect that sits ABOVE the box's top or
  // BELOW its bottom is not open to that interpretation: the content is measurably
  // outside the box that clips it. So `over` (which drives autosplit and the author
  // ring) grows only by rect geometry, and the discovered set adds no new class of
  // false positive to it.
  //
  // COST. Discovery roughly doubles this probe on the 117-slide gallery — the largest
  // deck in the repo, and the docs filmstrip renders all of it at once. Stated as a
  // RATIO on purpose: absolute milliseconds here are not reproducible between machines
  // or even between runs on a loaded one (measuring the identical code across one
  // session gave a 3x spread), which is the same trap
  // engineering/decisions/2026-08-03-performance-guard.md documents for `bench`. An
  // earlier version of this comment carried absolute figures that no longer described
  // the code beside them.
  //
  // The childless skip below is HALF of what it costs (4706 elements down to 1761 on
  // that deck) and loses no coverage for `over` — but note it sits AFTER the
  // `clipSuspect` test, not before, because a childless clip box is exactly where
  // `text-overflow: ellipsis` and `-webkit-line-clamp` live.
  const seen = [];
  for (let i = 0; i < cells.length; i++) seen.push(cells[i]);
  const all = typeof s.querySelectorAll === 'function' ? s.querySelectorAll('*') : [];
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (inSvg(el)) continue;
    if (seen.indexOf(el) >= 0) continue;
    // `matches()`, NOT `closest()`. "This box's clip is decorative" is a fact about the
    // box; reaching into its subtree made one class on any wrapper switch discovery off
    // for the whole slide, and with `over` forced false, autosplit with it.
    if (ignoreSelector && typeof el.matches === 'function' && el.matches(ignoreSelector)) continue;
    if (!clipsOwnOverflow(el)) continue;

    // `clipSuspect` FIRST, and on EVERY clipping box — including the childless ones.
    //
    // The childless skip below is a `flowedSpill` optimization and nothing more, but
    // putting it at the top of the loop quietly made it a `clipSuspect` filter too, and
    // that gutted the whole point: `text-overflow: ellipsis` and `-webkit-line-clamp`
    // are the two cases this change set names by hand, and BOTH normally sit on a box
    // whose only content is a text node. A `<strong>` at `white-space: nowrap;
    // text-overflow: ellipsis` has no element children, so it was skipped before it
    // could raise suspicion, `probeContentClipped` was never invoked, and the slide
    // stayed silent — while calling the content probe directly on it returns
    // `cut: true`. Reproduced on a shipped deck: premise.gallery.md p3 ellipses 65px
    // (34%) off "Advanced beginner" with no channel saying so.
    //
    // Scroll dims are the right measure HERE and the wrong one for `over` — they see a
    // formatter-truncated line that no rect crosses, and their over-reporting on a
    // container-responsive box is exactly what `clipSuspect` is allowed to be wrong
    // about, because the content probe adjudicates afterwards.
    const raw = typeof el.scrollHeight === 'number' && typeof el.clientHeight === 'number'
      ? Math.max(el.scrollHeight - el.clientHeight, el.scrollWidth - el.clientWidth) : 0;
    if (raw > TOL) clipSuspect = true;

    // …and only now the geometric contribution to `over`, which genuinely does need
    // element children: `flowedSpill` measures child rects, so a box with none has
    // nothing to contribute. Skipping them is half the discovery cost (4706 elements
    // down to 1761 on the gallery) and costs no coverage.
    if (!el.children?.length) continue;
    const spill = flowedSpill(el, false, K);
    if (!spill) continue;
    if (spill.overV > TOL || spill.overH > TOL) clipSuspect = true;
    if (spill.overV > 0) scrollH = Math.max(scrollH, clientH + spill.overV);
    if (spill.overH > 0) scrollW = Math.max(scrollW, clientW + spill.overH);
  }

  const vOver = scrollH > clientH + TOL;
  const over = vOver || scrollW > clientW + TOL;
  // `squeezed` is OVERPRINT, and it is reported separately because it is the one kind
  // of loss that crosses no box edge. A flex-shrunk overflow:visible child paints its
  // content straight over its following sibling -- text on top of text -- so a probe
  // that asks "did a rect cross a clip boundary" answers NO while content is being
  // destroyed. The reader register needs to tell that case apart from padding spill,
  // and cannot do it from `over` alone.
  //
  // `clipSuspect` is the CHEAP, DELIBERATELY OVER-EAGER question "is any clipping
  // box hiding anything, by any measure at all?" — including the scroll dims `over`
  // refuses to trust. On its own it is never shown to anyone: it exists so a caller
  // can decide whether running `probeContentClipped` (a full text-node walk, an order
  // of magnitude dearer than this probe) is worth it. That inversion is what lets the two probes cover each
  // other: the loose measure picks the candidates, the truthful one adjudicates, and
  // `.chart-body`'s phantom 43px now buys a content walk that answers "nothing cut"
  // instead of a false ring. Without it, `tell = over && …` gates the content probe
  // behind the geometry probe, so a geometry blind spot is load-bearing for every
  // register at once — the design question #1299 raised and #1300 carried.
  return { over, vOver, scrollH, clientH, overCells, squeezed: maxSqueezed, clipSuspect };
}


/**
 * Rule 8 — the viewBox graphic's rendered-text LEGIBILITY FLOOR
 * (engineering/decisions/2026-07-22-structure-derived-split-patterns.md §8 rule 8).
 *
 * A viewBox figure is CONTAINER-RESPONSIVE: it scales to whatever box it is given, and its box
 * never overflows — so `probeSectionOverflow` above, which measures box spill and nothing else,
 * is blind to it by construction. That is the FM-1 failure the rule names: a dense figure scales
 * its internal text down without limit, the probe sees nothing, and the slide ships silently at
 * 6px type. "Container-responsive is not floor-free."
 *
 * The floor is a fraction of SLIDE HEIGHT — not the deck's type scale, and not an absolute px.
 * Not the type scale, because `--fs-meta` moves with the preset, so the SAME figure at the SAME
 * rendered size would pass in landscape (14px) and fail in portrait (27px). And not absolute px
 * either: that was this module's first answer and it was wrong for the mirror-image reason — a
 * deck is displayed scaled-to-fit, so one design measures 5.2px at `square` and 23.7px at `4K`
 * while looking identical to a viewer. The invariant a floor has to hold is the RELATIVE one; see
 * FIGURE_TEXT_FLOOR_RATIO above for the spread that settled it.
 *
 * The EFFECTIVE size is the glyph size on the page, not in the figure's coordinate space:
 * `font-size` inside a viewBox is in USER units, so it is multiplied by the viewBox→box scale.
 * (The text element's client rect is deliberately NOT the measure: for SVG text Chromium returns
 * the tight INK box, ≈ cap height, so text at exactly the floor would measure ~0.7× it.)
 *
 * Detection only — the honest ring, never a silent shrink and never a split (a figure has no seam
 * to divide). Pure + browser-evaluable and `.toString()`-injected verbatim, exactly like
 * `probeSectionOverflow`, so the live-preview watcher and the export measure share ONE rule.
 *
 * @param {Element} s a slide <section>
 * @param {number} floorRatio the floor as a fraction of slide height (FIGURE_TEXT_FLOOR_RATIO)
 * @returns {{under:boolean, minPx:number, floorPx:number, pct:number, count:number, unmeasured:number}|null}
 *   null only when the section holds no viewBox figure whose text could be measured OR missed —
 *   nothing to judge. `unmeasured` counts figures carrying `<foreignObject>` labels, which the
 *   probe cannot size; a section with ONLY those comes back `count: 0, under: false, unmeasured>0`
 *   so the caller can say "not measured" rather than imply "legible".
 *   `floorPx` is the ratio resolved against THIS slide's height, so the report can name both.
 */
function probeFigureLegibility(s, floorRatio) {
  const figs = s.querySelectorAll ? s.querySelectorAll('svg[viewBox]') : [];
  if (!figs.length || !(floorRatio > 0)) return null;
  if (typeof getComputedStyle !== 'function') return null;
  const slideH = s.clientHeight || 0;
  if (!slideH) return null;
  const floorPx = slideH * floorRatio;
  // Same unit mix probeSectionOverflow normalizes (see its header): the floor is a
  // fraction of `clientHeight` (LAYOUT px) while a figure's box comes from
  // getBoundingClientRect (VISUAL px). On the filmstrip's scaled sections that
  // shrank every measured glyph by the pane's scale factor and reported a figure
  // as illegible purely for being previewed in a narrow pane.
  let K = 1;
  if (typeof s.getBoundingClientRect === 'function' && typeof s.offsetHeight === 'number' && s.offsetHeight > 0) {
    const kr = s.getBoundingClientRect().height / s.offsetHeight;
    if (kr > 0 && kr < 100 && Math.abs(kr - 1) > 0.005) K = kr;
  }
  let minPx = Infinity;
  let count = 0;
  let unmeasured = 0;
  for (let f = 0; f < figs.length; f++) {
    const fig = figs[f];
    const box = fig.getBoundingClientRect();
    const vb = fig.viewBox?.baseVal || null;
    // Uniform scale: with the default `preserveAspectRatio` the figure fits the SMALLER ratio,
    // so take the min — the honest (smaller) rendered size when the box aspect differs.
    let scale = 1;
    if (vb && vb.width > 0 && vb.height > 0 && box.width > 0 && box.height > 0) {
      scale = Math.min(box.width / K / vb.width, box.height / K / vb.height);
    }
    // Labels the probe CANNOT read. Mermaid runs with `htmlLabels: true`, so a flowchart emits
    // its labels as `<foreignObject>` HTML rather than SVG `<text>` — and HTML inside a viewBox
    // is not scaled by the viewBox transform the way `<text>` is. Three shipped `diagram` gallery
    // pages carry 39 / 6 / 25 such labels and ZERO `<text>`, so they returned null: "nothing to
    // judge", which reads downstream as "legible". A flowchart is the most common diagram there
    // is, and its labels shrinking to 4px is precisely what this rule exists to catch. Counted
    // and REPORTED rather than measured — "I could not measure this" is an honest answer;
    // silence is not (HARD RULE #23). Found by the trio's inversion pass.
    if (fig.querySelectorAll('foreignObject').length) unmeasured++;
    const texts = fig.querySelectorAll('text');
    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      if (!t.textContent?.trim()) continue;
      const fs = parseFloat(getComputedStyle(t).fontSize);
      if (!(fs > 0)) continue;
      const px = fs * scale;
      count++;
      if (px < minPx) minPx = px;
    }
  }
  // No readable text at all. When some of it was UNREADABLE rather than absent, say so instead
  // of returning null — the caller reports it on the same axis, and the difference matters: a
  // `journey` figure genuinely has no labels, while a mermaid flowchart has 39 the probe cannot
  // see. `under` is false either way: this is "unmeasured", never "passed".
  if (!count) return unmeasured ? { under: false, count: 0, unmeasured, floorPx: Math.round(floorPx * 10) / 10 } : null;
  // Report minPx rounded DOWN, so a flagged figure never prints as EQUAL to the floor it missed
  // ("8px vs an 8px floor" reads like a bug in the check).
  return {
    under: minPx < floorPx,
    minPx: Math.floor(minPx * 10) / 10,
    floorPx: Math.round(floorPx * 10) / 10,
    pct: Math.floor((minPx / slideH) * 10000) / 100,
    count,
    unmeasured,
  };
}

/**
 * Does the clip actually CUT anything a person could have read or seen?
 *
 * `probeSectionOverflow` answers a GEOMETRIC question — did a box's content extent
 * exceed the box. That is the right question for the AUTHOR register: the author can
 * open devtools, and an over-subscribed box is a real defect whether or not today's
 * copy happens to fit inside the spill.
 *
 * It is the wrong question for the READER register, and shipping it there made the
 * export tell recipients something they could not verify. Measured on the corpus this
 * gate covers: `exemplars/nonprofit/grant-report.md` p3 overflows its `.cell-stage` by
 * 282 layout px and p12 by 416, and in BOTH cases every text-bearing leaf renders
 * inside the frame — the spill is background and padding. 18 of the 18 bare-`kpi`
 * slides in test/integration/overflow-baseline.json are that shape (all 20 `kpi
 * compact` slides fit, a perfect split), so a "Content clipped" tag on them asserts a
 * loss the artifact cannot show. A warning that cries wolf teaches its reader to
 * silence it, which is the one outcome the register exists to prevent.
 *
 * So `reader` asks the reader's question instead: is any CONTENT-BEARING box cut by a
 * clipping ancestor? Content-bearing means non-empty text, or a replaced element
 * (image / figure / media) — an oversized chart cut in half is a real loss with no text
 * involved, so this must not be text-only.
 *
 * Deliberately NOT a re-implementation of the geometry probe: this runs only on
 * sections the geometry probe flagged or marked suspect, and answers the narrower
 * question. Keeping them separate is what lets `author` stay exactly as loud as it was.
 *
 * IT TAKES NO BOX ALLOWLIST, and that is the #1300 fix. It used to inspect the section
 * plus `CLIP_CELL_SELECTOR` — the same hand-kept list the geometry probe used — so a
 * clipped `footer`, a line-clamped kanban card or an ellipsed premise slot cut content
 * that nothing looked at. It can afford what the geometry probe cannot: its measure is
 * a REAL CONTENT RECT against a REAL BOX, which a decorative or container-responsive
 * box has no way to fake. So it walks every clipping box it finds and takes the
 * exceptions by name (`ignoreSelector`), rather than taking the inclusions by name.
 * Live instance, reproduced twice independently: `premise.gallery.md` p3 ellipses 65px
 * — 34% — off the label "Advanced beginner" inside a `<strong>` at `white-space:
 * nowrap; text-overflow: ellipsis`, with ZERO geometric spill anywhere. No measure the
 * geometry probe owns can see it; this one returns cut:true. (An earlier version of
 * this comment cited a docked `footer` cutting 43px. That was seen in a corpus-wide
 * survey but the checker could not re-find it in seven rendered decks, so the claim is
 * replaced with the one that reproduces on demand — HARD RULE #23.)
 *
 * ONE tree walk, and NO box list. The obvious shape — collect every clipping box, then
 * test every bearer against every box — is quadratic in the wrong things (`boxes x
 * items`, with a `contains()` ancestor walk inside the pair loop), and discovery had
 * just multiplied the boxes by ~4. That shape shipped first and made this probe ~5.7x
 * dearer; the HARD RULE #25 checker caught it by re-measuring a number the comment
 * asserted. A bearer's clipping boxes ARE its ancestors, so bearers are collected once
 * and each walks its own ancestor chain, with the clip verdict and box rect memoized
 * per element. Same pairs, same early exit, no containment test.
 *
 * NESTED helpers and zero module-level references, for the same reason as
 * `probeSectionOverflow`: this whole function is `.toString()`-injected into
 * `page.evaluate` and the emulator's inline watcher, so everything it needs must
 * travel inside its own source.
 *
 * @param {Element} s        the section the geometry probe flagged or marked suspect
 * @param {string} ignoreSelector  IGNORED_CLIP_SELECTOR — clip BOXES whose clip is
 *   decorative, matched with `matches()` on the box (never `closest()`; see the constant)
 * @param {number} TOL       same layout-px tolerance the geometry probe used
 * @param {string} [bearerSelector] IGNORED_BEARER_SELECTOR — content that is never
 *   evidence of loss (invisible a11y mirrors, our own chrome), matched with `closest()`
 * @returns {{cut:boolean, first:string|null, chromeOnly:boolean}}  `first` is a short
 *   label for the first cut node, for the console line — never a DOM ref (it must cross
 *   the page.evaluate boundary). `chromeOnly` is true when EVERY cut found sits inside
 *   the running-footer band: still a cut, still reported to the author, but not
 *   something a reader is shown (see the climb below).
 */
function probeContentClipped(s, ignoreSelector, TOL, bearerSelector) {
  if (!s || typeof s.querySelectorAll !== 'function') return { cut: false, first: null, chromeOnly: false };
  const doc = s.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const REPLACED = 'img,svg,canvas,video,iframe,picture,object';

  // Layout px -> the rect space we compare in. probeSectionOverflow documents this at
  // length: getBoundingClientRect returns VISUAL px (a section at scale(0.54) reports
  // 0.54x its layout size) while TOL is a layout-px constant. Comparing them raw made
  // the tolerance 1/k too large on a scaled section -- ~22 layout px at the docs-site
  // filmstrip's 0.543 scale, nearly two lines of body copy. Same normalization, same
  // reason, same fallback of 1 when there is no rect or no offsetHeight.
  let k = 1;
  if (typeof s.getBoundingClientRect === 'function' && s.offsetHeight) {
    const sr = s.getBoundingClientRect();
    if (sr && sr.height > 0) k = sr.height / s.offsetHeight;
  }
  if (!(k > 0)) k = 1;
  const tol = (typeof TOL === 'number' ? TOL : 0) * k;

  function clips(el) {
    if (typeof getComputedStyle !== 'function') return false;
    const st = getComputedStyle(el);
    const oy = st.overflowY, ox = st.overflowX;
    return (!!oy && oy !== 'visible') || (!!ox && ox !== 'visible');
  }
  // Is this element's content excluded from the question? Placement rather than flow,
  // invisible, or the marker's own chrome -- which must never be the evidence that
  // content was cut, or the marker justifies itself: draw a tab, measure the tab, keep it.
  //
  // The `closest()` clause now carries `ignoreSelector`, which is what closes #1300's
  // fourth item. This used to inspect ONLY `el`'s own computed style, so an INVISIBLE
  // ANCESTOR did not disqualify its visible-looking descendants: KaTeX's `.katex-mathml`
  // accessibility mirror is `position:absolute` inside a 1x1px clip box, but its inner
  // text sits under a `static` parent, so a 955px Range rect read as a genuine bearer.
  // 23 such boxes across the corpus, every one a phantom -- and they only stayed
  // harmless because the old `tell = over && ...` gate kept this probe off the slides
  // where they live. Loosening that gate without this fix would have put a "Content
  // clipped" pill on every math slide in the repo. Walking `closest()` rather than the
  // element alone is the cheap ancestor walk the card asked for.
  function skipped(el) {
    if (!el || typeof getComputedStyle !== 'function') return false;
    const st = getComputedStyle(el);
    if (st.position === 'absolute' || st.position === 'fixed') return true;
    if (st.display === 'none' || st.visibility === 'hidden') return true;
    if (typeof el.closest === 'function' && bearerSelector && el.closest(bearerSelector)) return true;
    return false;
  }
  // Is this bearer placed OUT OF FLOW by an ancestor? `skipped()` above reads only the
  // bearer's own `position`, which leaves the commonest shape uncovered: a docked
  // `<footer>` is `position: absolute` and the `<code>` inside it is `static`, so the
  // code counted as an in-flow bearer while its parent had already escaped the panel
  // that "clips" it. Measured on split-panel's own gallery: pages 11-18 each reported
  // `cut: true` for a `<code>` sitting 461px left of `.panel-right`, with nothing cut.
  // Eight phantoms in one shipped gallery, masked only because `clipSuspect` happened
  // to be false on those slides — one threshold change from eight false pills.
  //
  // The rule is CSS's own, and the first cut of it was HALF RIGHT — which made it worse
  // than not having it. An out-of-flow box escapes the ancestors BETWEEN it and its
  // containing block; it does NOT escape anything above that, because the containing
  // block is itself in flow up there. The first version set an `escaped` flag and never
  // cleared it, so every `static` clip box for the whole remaining climb was skipped —
  // and in this engine `.cell-stage`, the primary content cell, is exactly that
  // (`position: static; overflow: clip`). Measured: 98px of text invisible to a reader
  // with the probe reporting nothing cut, a REGRESSION against the code this was
  // meant to improve. The escape now ENDS at the containing block. (HARD RULE #25 —
  // found independently by the checker and the red team, each with its own repro.)
  // `''` when in flow, else the kind of escape. FAIL-CLOSED (no escape) when there is
  // no getComputedStyle: for this probe a phantom is cheaper than a miss, and the two
  // helpers used to fail open in OPPOSITE directions, which is a coin toss dressed as
  // a policy.
  function escapeKind(el) {
    if (!el || typeof getComputedStyle !== 'function') return '';
    const p = getComputedStyle(el).position;
    return p === 'absolute' || p === 'fixed' ? p : '';
  }
  // Does `el` establish a containing block for out-of-flow descendants? `position` is
  // the famous half; `transform` / `filter` / `perspective` / `contain` / `will-change`
  // do it too while staying `static`, and this engine uses all of them. An earlier cut
  // tested `position !== 'static'` alone, so a transformed clipping ancestor was skipped.
  function establishesCb(el, forFixed) {
    if (!el || typeof getComputedStyle !== 'function') return true;
    const st = getComputedStyle(el);
    const none = (v) => !v || v === 'none';
    if (!none(st.transform) || !none(st.filter) || !none(st.perspective)) return true;
    if (st.contain && /paint|layout|strict|content/.test(st.contain)) return true;
    if (st.willChange && /transform|filter|perspective/.test(st.willChange)) return true;
    // A FIXED box is positioned against the viewport, so `position` alone never
    // contains it — only the properties above do.
    return forFixed ? false : st.position !== 'static';
  }

  // TEXT NODES, not element leaves.
  //
  // The first version of this walked elements and counted one only when it had no
  // element children. That is wrong in this engine and wrong in a way that goes
  // QUIET: lib/engine/index.js sets marp-core's breaks:true, so every soft-wrapped
  // paragraph and list item carries <br> children. The text-owning element therefore
  // has children and was skipped; its <br> leaves hold no text and were skipped too;
  // a cell full of ordinary wrapped prose reported ZERO bearers and answered
  // "nothing was cut" while the render sliced it mid-glyph. It also made the answer
  // depend on whether the AUTHOR pressed Enter inside a paragraph, which is a parser
  // artifact, not a fact about the artifact. Caught on examples/overflow-fix-me.md p3
  // by the HARD RULE #25 inversion pass, in a PDF this branch had already committed.
  //
  // Text lives in text nodes, so walk those and measure them with Range client rects
  // (per-LINE boxes, which is what a clip actually cuts). Replaced elements are
  // collected separately -- an oversized chart sliced in half loses plenty with no
  // text in it.
  //
  // PSEUDO-ELEMENT content is collected too, and it has to be inferred rather than
  // measured: there is no rect API for `::before`/`::after`, and a TreeWalker over a
  // box whose only content is `#x::after { content: attr(data-x) }` returns zero nodes
  // and zero rects (measured, Chromium 131). Real AUTHOR content rides on these in this
  // engine -- matrix-grid's axis labels are `content: attr(data-row-axis)` at
  // `white-space: nowrap` in a narrow gutter, and the `--insight-label` /
  // `--stamp-label` / `--stance-label` / `--step-prefix` families are the same shape --
  // so "no text node, therefore nothing to lose" is false for exactly the labels most
  // likely to be squeezed. An element whose generated content resolves to real text and
  // which owns no text of its own IS that content, so it stands in as the bearer, and
  // its own hidden extent (`scrollWidth - clientWidth`, which DOES count in-flow
  // generated content) extends the rect to where the glyphs actually reach. Inference,
  // and labeled as such: it can only ever be as good as the box the pseudo lives in.
  function pseudoText(el) {
    if (typeof getComputedStyle !== 'function') return '';
    let out = '';
    for (let p = 0; p < 2; p++) {
      let c;
      try { c = getComputedStyle(el, p ? '::after' : '::before').content; } catch { c = null; }
      if (!c || c === 'none' || c === 'normal') continue;
      // Quoted strings and attr() resolve to a quoted literal; counters/images do not
      // and are chrome rather than author copy.
      // NON-greedy, and only up to an ALT-TEXT separator. Chromium serializes
      // `content: "x" / "alt"` as `"x" / "alt"`, which a greedy `^"(.*)"$` swallows
      // whole and reports as the label `x" / "alt`. No declaration in the repo uses
      // the alt form today, so this is latent label-garbling rather than a live bug —
      // fixed because a label is what the console line shows a human. (Red team.)
      const m = /^"([\s\S]*?)"(?:\s*\/[\s\S]*)?$/.exec(c.trim());
      if (m?.[1].trim()) out += (out ? ' ' : '') + m[1].trim();
    }
    return out;
  }

  function bearers(box) {
    const out = [];
    if (doc && typeof doc.createTreeWalker === 'function' && typeof doc.createRange === 'function') {
      const walker = doc.createTreeWalker(box, 4 /* NodeFilter.SHOW_TEXT */);
      let n = walker.nextNode();
      while (n) {
        const v = n.nodeValue;
        if (v?.trim() && !skipped(n.parentElement)) {
          const range = doc.createRange();
          range.selectNodeContents(n);
          const rects = range.getClientRects();
          for (let i = 0; i < rects.length; i++) {
            if (rects[i].height > 0 || rects[i].width > 0) out.push({ n: n.parentElement, r: rects[i], t: v.trim(), kind: 'text' });
          }
        }
        n = walker.nextNode();
      }
    }
    if (typeof box.querySelectorAll === 'function') {
      const reps = box.querySelectorAll(REPLACED);
      for (let i = 0; i < reps.length; i++) {
        const el = reps[i];
        // Only the OUTERMOST replaced element: an inner <svg> node rides on its root,
        // and counting both would report the same cut twice.
        const par = el.parentElement;
        if (par?.closest?.(REPLACED)) continue;
        if (skipped(el)) continue;
        if (typeof el.getBoundingClientRect !== 'function') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        out.push({ n: el, r, t: (el.tagName || 'element').toLowerCase(), kind: 'replaced' });
      }
      const maybe = box.querySelectorAll('*');
      for (let i = 0; i < maybe.length; i++) {
        const el = maybe[i];
        if (el.textContent?.trim()) continue;      // owns real text -> already a bearer above
        if (skipped(el)) continue;
        if (typeof el.getBoundingClientRect !== 'function') continue;
        const t = pseudoText(el);
        if (!t) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const dx = typeof el.scrollWidth === 'number' && typeof el.clientWidth === 'number' ? el.scrollWidth - el.clientWidth : 0;
        const dy = typeof el.scrollHeight === 'number' && typeof el.clientHeight === 'number' ? el.scrollHeight - el.clientHeight : 0;
        out.push({
          n: el,
          r: { top: r.top, bottom: r.bottom + (dy > 0 ? dy * k : 0), left: r.left, right: r.right + (dx > 0 ? dx * k : 0) },
          t,
          kind: 'pseudo',
        });
      }
    }
    return out;
  }

  // Every clipping box in play: the section itself, plus every clipping ANCESTOR of a
  // bearer. Not an allowlist -- see the header. The exceptions are named instead
  // (`ignoreSelector`), so a decorative bleed still cannot manufacture a cut, and
  // SVG-namespace boxes are excluded structurally because the UA stylesheet clips them.
  // BEARER-MAJOR, walking each bearer's own ANCESTOR CHAIN, with the clip verdict and
  // the box rect memoized per element.
  //
  // The obvious shape -- collect every clipping box, then test every bearer against
  // every box -- is what shipped first, and it is quadratic in the wrong things:
  // `boxes x items`, with a `contains()` (itself an ancestor walk) inside the pair
  // loop. Discovery multiplied the boxes by ~4, so measured on the 117-slide gallery it
  // took the content probe from 0.26 to 1.47ms a section, a 5.7x regression the
  // comment beside it still described as "a quarter of the tree traversal". Caught by
  // the HARD RULE #25 checker, which re-measured a number this file asserted.
  //
  // A bearer's clipping boxes ARE its ancestors, so walking up from the bearer visits
  // exactly the same (bearer, clipping-ancestor) pairs with no containment test at all,
  // and the memo means each element's computed style and rect are read once per section
  // no matter how many bearers sit under it. Same answer, same early exit.
  const clipMemo = new Map();
  function clipBox(el) {
    let v = clipMemo.get(el);
    if (v !== undefined) return v;
    v = null;
    // `matches()` on the box, and NEVER on the section: see IGNORED_CLIP_SELECTOR. The
    // section is the outermost boundary of the slide, so a decorative class landing on
    // it must not remove it from the walk.
    if (el.namespaceURI !== 'http://www.w3.org/2000/svg'
      && !(el !== s && ignoreSelector && typeof el.matches === 'function' && el.matches(ignoreSelector))
      && clips(el) && typeof el.getBoundingClientRect === 'function') {
      v = el.getBoundingClientRect();
    }
    clipMemo.set(el, v);
    return v;
  }

  // The running-footer BAND, as a structural shape rather than a bare class — an author
  // can type `<div class="cell-footer">`, but not that whole nesting under a `section.form`
  // the engine owns. Used ONLY to label a cut, never to suppress one.
  const FOOTER_BAND = 'section.form > .cell-footer > footer';
  const items = bearers(s);
  let chromeFirst = null;   // first cut found inside the footer band, if any
  for (let i = 0; i < items.length; i++) {
    const r = items[i].r;
    let anc = items[i].n;
    const inChrome = typeof items[i].n.closest === 'function'
      && !!items[i].n.closest(FOOTER_BAND);
    let escaped = '';   // '' | 'absolute' | 'fixed' — see escapeKind/establishesCb
    while (anc) {
      const br = clipBox(anc);
      const atSection = anc === s;
      // While escaped, only a containing-block establisher clips — and reaching one
      // ENDS the escape, so everything above it clips normally again.
      //
      // The second test is `if`, not `else if`, and that is a fix. An establisher can
      // ITSELF be out of flow (an absolute box inside an absolute box), and with `else if`
      // its own escape was never started — so every static clipping ancestor above it was
      // applied to a bearer they do not clip. Verified in Chromium: a nested-absolute
      // shape reported `cut: true` on text that is fully visible, while the one-level
      // shape the code was written for stayed correct, which is what hid it.
      // (HARD RULE #25 red team, round 3.)
      const contains = !escaped || establishesCb(anc, escaped === 'fixed');
      if (escaped && contains) escaped = '';
      if (!escaped) escaped = atSection ? '' : escapeKind(anc);
      const skipThis = !br || !contains;
      anc = atSection ? null : anc.parentElement;
      if (skipThis) continue;
      // All four edges. The first version omitted left, which the sibling flowedSpill
      // checks -- an unexplained asymmetry rather than a decision.
      const vCut = r.bottom > br.bottom + tol || r.top < br.top - tol;
      const hCut = r.right > br.right + tol || r.left < br.left - tol;
      // THE RUNNING FOOTER IS DETECTED LIKE ANYTHING ELSE, AND LABELLED. This one line
      // is the whole of a decision that took three trio rounds to get right, so it is
      // worth stating precisely: DETECTION is general, TREATMENT is not.
      //
      // Detection first. `2026-07-27-footer-band-allocation.md` prices the footer's
      // ellipsis, so an exemption looked defensible — it was 11 of this channel's first
      // 13 corpus hits. But that doc does not ask for silence. It says the loss "is not
      // enforced or warned about", and names the remedy: option (d), "route
      // over-subscription into the existing alarm SO THE AUTHOR IS TOLD … the only
      // option that closes the CLASS rather than an instance." This probe is option (d);
      // exempting the footer would ship the mechanism that closes the class with the
      // class carved out of it. So every footer cut is a cut, and the author hears about
      // all of them (stderr, the `author` tab, `overflow:check`'s ratchet).
      //
      // Treatment second, and this is what the exemption was really reaching for. Read
      // past the sentence that prices the loss and option (d) is costed at "~5 lines in
      // the watcher" for an AUTHOR channel — on 2026-07-27 the ring was stripped before
      // printing, and the reader register did not exist until three days later. Shipping
      // a reader-facing pill for footer cuts is not what that option asked for, and it
      // is actively worse than the loss: the reader pill sits bottom-center, which IS
      // the footer band, so a deck with one ordinary `footer:` in front matter got an
      // opaque capsule painted across the confidentiality line on EVERY page — the same
      // band whose 105px of ink overlap that decision doc exists to have removed, and
      // unactionable besides, because a reader cannot edit a footer or scroll a PDF.
      // Both HARD RULE #25 lenses found it independently, on rasterized artifacts.
      //
      // So a cut inside the band is recorded and the climb ENDS for this bearer, rather
      // than returning. `break`, not `continue`: layout is UNCLIPPED, so a rect the
      // footer already cut still overflows every box above it, and continuing just
      // re-reports the same glyphs as a section-level cut (measured on
      // examples/portrait-journey.md p3: the footer clips at x=992, the text lays out to
      // x=1115, the section edge is 1080). If no NON-chrome cut turns up on any other
      // bearer, the section's answer is `chromeOnly: true` — cut, reported, not shown.
      if ((vCut || hCut) && inChrome) {
        if (!chromeFirst) chromeFirst = items[i].t.replace(/\s+/g, ' ').slice(0, 40);
        break;
      }
      if (vCut || hCut) {
        // Concatenation rather than a template literal is a STYLE choice here, not a
        // safety one. An earlier version of this comment claimed a backtick anywhere in
        // this function would terminate the template literal it is injected into and
        // break the watcher. That is false: interpolation is a RUNTIME string operation,
        // and the literal's boundaries were fixed at parse time by lattice-emulator.js's
        // own source. Proof it was never the hazard — PROBE_SRC (52 backticks) and
        // LEGIBILITY_SRC (20) are injected into the SAME literal and have always worked.
        // The real break behind that story was a backtick typed into the emulator's own
        // source INSIDE its template literal, which is a parse-time error in that file
        // and nothing to do with this one. Corrected rather than left standing: a
        // load-bearing-looking invariant with no artifact behind it is HARD RULE #23's
        // subject, and this one had already shaped code on a false premise.
        const t = items[i].t.replace(/\s+/g, ' ').slice(0, 40);
        return { cut: true, first: t, chromeOnly: false };
      }
    }
  }
  if (chromeFirst) return { cut: true, first: chromeFirst, chromeOnly: true };
  return { cut: false, first: null, chromeOnly: false };
}

module.exports = {
  CLIP_CELL_SELECTOR,
  IGNORED_CLIP_SELECTOR,
  IGNORED_BEARER_SELECTOR,
  probeSectionOverflow,
  probeContentClipped,
  CONTENT_CLIPPED_SRC: probeContentClipped.toString(),
  // Function source for verbatim injection into browser-string contexts
  // (the emulator inline watcher + page.evaluate) — keeps the LOGIC single-sourced.
  PROBE_SRC: probeSectionOverflow.toString(),
  probeFigureLegibility,
  LEGIBILITY_SRC: probeFigureLegibility.toString(),
  FIGURE_TEXT_FLOOR_RATIO,
};
