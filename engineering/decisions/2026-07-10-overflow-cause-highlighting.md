---
status: in-progress
summary: Overflow detection today only flags the SLIDE ("Overflows" red ring + tag) with no cause. This ships a yellow "Fix Me" highlight on the specific element responsible for Case A (clip-cell geometry — certain, not a guess), now drilled down to the specific stretched-row item within the cell (not just the whole cell) via a content-slack signal, backed by a new density.domSelector manifest field + render-verified coverage for all 26 axis-bearing components. Case B (a prose-density word-budget fallback for slides with no clip-cell at all) remains a deferred follow-up.
---

# Overflow cause highlighting — a yellow "Fix Me" tag on the element responsible

**Date:** 2026-07-10
**Status:** in-progress — Case A shipped, including the item-level
drill-down (§10). Case B (density-budget fallback for the no-clip-cell case)
remains a follow-up PR.
**Related:** `lib/core/overflow-probe.js`, `lib/runtime/index.js` (`startOverflowWatcher`),
`lib/authoring/prose-budgets.js`, `lib/authoring/review-core.js`,
`engineering/decisions/2026-06-26-frames-as-flex-cell-trees.md` (clip-cell contract),
`engineering/decisions/2026-06-30-prose-density-budget.md` (word budgets),
`engineering/decisions/2026-07-01-debug-bounding-boxes.md` (the zero-flow overlay technique this reuses).

---

## 1. The problem

`startOverflowWatcher` (`lib/runtime/index.js:1390-1435`) tags an overflowing
`<section>` with a red inset ring + an "Overflows" corner tab
(`lib/base/base.modifiers.css:1003-1039`). It tells you a slide is broken; it
never tells you *what* to fix. The ask: highlight the specific offending
element with a yellow overlay + a "Fix Me" corner tag, the same visual grammar
as the existing tab.

## 2. Why naive per-box geometry doesn't work — it was already tried

`lib/runtime/index.js:1397-1403` documents a prior attempt, dropped:

> "Per-box 'which cell' pinpointing was prototyped and dropped: in a
> grow-to-fit grid (`1fr` = `minmax(auto,1fr)`) an oversized card doesn't clip
> its own box — it grows and pushes its NEIGHBOURS past the frame, so a
> geometric per-box test flags the pushed-aside cards, not the oversized
> culprit."

So "which box's `getBoundingClientRect` sticks out furthest" is not a safe
signal in general — it depends entirely on how the layout in question absorbs
overflow. There are two structurally different cases, and they need two
different signals.

## 3. The two cases, tiered by confidence

**Case A — a bounded clip-cell is actually clipping (HIGH confidence,
geometric fact).** `lib/core/overflow-probe.js:123-135` already probes every
`.cell-stage` / `.panel-right` / `.compare-right` — the flex cell-tree's
bounded content cells (`overflow: clip; min-height: 0`,
`2026-06-26-frames-as-flex-cell-trees.md`) — for `scrollHeight > clientHeight`
and geometric spill. Unlike a grow-to-fit card, a clip-cell that overflows
**is** the culprit by construction: it doesn't push a neighbor, it clips its
own content. The probe already computes `dy`/`dx` per cell today and then
**discards** the breakdown, folding only the max into the section's effective
`scrollH`/`scrollW` (line 133-134). That per-cell detail just needs to be
returned instead of thrown away.

**Case B — no clip-cell is over, the overflow is grow-to-fit push (LOWER
confidence, editorial signal).** This is exactly the case the geometric
attempt failed on. Here we fall back to the prose-density budget
(`lib/authoring/prose-budgets.js`, `2026-06-30-prose-density-budget.md`):
`elementWordCounts(slide, axis)` counts words per element along a component's
`density.axis` independent of layout geometry — a card's word count doesn't
change because a neighbor got pushed. The element with the highest count past
its manifest `density.hard` budget is our best content-grounded guess for the
cause. It is **not** a geometric certainty (the density doc's own §2 "honesty
note" already had to correct an earlier draft that overclaimed a `hard` budget
meant physical overflow — it doesn't; `hard` sits well under the real
geometric ceiling on purpose). The UI copy must reflect that: Case A can say
something factual ("Clips its container"); Case B has to read as a guess
("Likely cause — Nx words, over budget"), not a claim of certainty, per HARD
RULE #23.

**If neither signal fires** on an overflow-positive slide (rare — e.g. an
oversized image, a long code block, a wide table with no per-row budget), show
**no** Fix Me tag. Guessing wrong is worse than saying nothing; the slide-level
"Overflows" tag still fires on its own.

## 4. Rendering technique — reuse the debug-overlay's zero-flow layer, don't inject a DOM child

The existing "Overflows" tab is a real child appended to the `<section>`
(`s.appendChild(tab)`) — safe there because the section is already the root
everything treats as special. It is **not** safe to reuse for an arbitrary
internal element: injecting a rogue child into a flex/grid container can shift
`nth-child` selectors, gap math, and flex sizing, and directly risks HARD RULE
#20 (no margin / no layout-shift in measured layouts — the Fit Spine depends
on clean geometry).

`2026-07-01-debug-bounding-boxes.md` already solved this exact problem for a
different feature: a **JS overlay mirror layer** — one `position:absolute;
inset:0; pointer-events:none` container appended as a *sibling* of the slide
content, entirely outside the measured tree, with each label chip positioned
via `getBoundingClientRect()`. Zero layout box, cannot reflow, cannot corrupt
FIT. The Fix Me tag should use the same technique: a yellow outline + corner
chip drawn in this mirror layer over the culprit element, re-drawn on the same
`ResizeObserver`/mutation cadence the overflow watcher already runs on.

Color must stay distinguishable from both the existing red overflow ring and
the debug-overlay's layout-mode hues (grid/flex/flow) — reuse the AA/CVD-safe
palette approach from `2026-06-16-colour-blindness-accessibility.md` rather
than picking a new yellow ad hoc.

## 5. Where this runs — one shared kernel, not a docs-site-only feature

`startOverflowWatcher` lives in `lib/runtime/index.js`, the shared runtime
script injected into **every** preview surface via `lattice-runtime` —
confirmed both in the VS Code marp preview and in the docs site's
`deck-preview.js` (which every one of the five preview builders uses per
`SANCTIONED_PREVIEW_BUILDERS`). So extending the overflow watcher itself
reaches all six surfaces (VS Code + 5 docs-site builders) for free — this
should **not** be built as a separate docs-site-only agent alongside
`docs/src/playground/debug-overlay.js`, even though it reuses that feature's
rendering *technique*. One kernel, HARD RULE #1.

## 6. Concrete gaps to close

1. **`probeSectionOverflow` needs to report per-cell detail.** Extend its
   return shape with an optional, backward-compatible field — e.g.
   `overCells: [{ index, dy, dx }]` for cells where `dy > 0 || dx > 0` — index
   into the `cells` NodeList rather than a raw element reference, because
   `PROBE_SRC` is also `.toString()`-injected into the emulator's
   `page.evaluate` context (`lattice-emulator.js`), where DOM references can't
   cross the serialization boundary. The live runtime watcher (same-document,
   no boundary) can resolve `cells[index]` straight back to the element.
2. **`elementWordCounts` needs to keep per-element identity.**
   `review-core.js:200-201` today collapses the whole array to
   `worst = Math.max(...counts)` and discards which index was worst. It needs
   to surface the winning index (or a text/line snippet) so a consumer can
   locate the actual DOM node, not just know "some element on this slide is
   over."
3. **An axis → DOM selector mapping per component.** `density.axis` (`item` /
   `row`) needs to resolve to "the Nth `<li>`/`<tr>` under this component's
   axis container" in the rendered DOM. Check whether `capacity.axis` /
   `focusAxes` metadata already carries a usable selector (the density doc
   notes `density.axis` is deliberately *not* tied to `focusAxes`, so this may
   need its own small lookup) before inventing one — HARD RULE #15.
4. **Density needs to run somewhere with live DOM access.** Today it's
   Node-side only (`review-core.js`, called from `lint-deck.js` / the Drawing
   Board panel) against markdown source text, never in a browser preview.
   `prose-budgets.js` is already documented as "pure, browser-safe, fs-free,"
   so the plan is to bundle it into the runtime script and run it client-side
   against the live slide markdown/DOM — not to invent a second counting path.
5. **The new overlay agent** in `lib/runtime/index.js`, gated on: slide is
   overflow-positive AND (Case A cell found OR Case B density-hard element
   found), using the zero-flow mirror-layer technique (§4), never touching
   export bytes (same preview-only pattern the existing tab already follows —
   stripped before PDF/PPTX/HTML the same way `.overflow`/`.overflow-tab` are
   today).

## 7. Non-goals

- Not a geometric certainty for Case B — it's an editorial best guess, labeled
  as such.
- Not touching export bytes — preview-only, same as the existing ring/tab.
- Not a new measurement engine — reuses `overflow-probe.js` and
  `prose-budgets.js` verbatim; no second word-counter, no second overflow
  oracle (HARD RULE #1, #15).
- Not solving the "no clip-cell, no density budget" residual case (§3) — it
  degrades to silence, not a guess.

## 8. Owner decisions (2026-07-10)

- **Confidence copy — different label per case.** Case A ("Clips its
  container") and Case B ("Likely cause — Nx words, over budget") read
  differently; never a single uniform "Fix Me" string that would overclaim
  Case B's certainty.
- **V1 scope — Case A only.** Ship the clip-cell highlight alone first: pure
  geometry, extends `overflow-probe.js`, no density-bundling or axis→DOM
  mapping work required. Case B (the density-budget fallback, §3/§6 items
  2-4) is its own follow-up PR once shipped, per HARD RULE #17 (one feature,
  one PR — the two cases are separable slices).

## 9. Maker-checker correction (2026-07-10)

An independent checker (MAKER-CHECKER, per CLAUDE.md — this change touches the
shared runtime kernel) found one confirmed bug in the first implementation:
the Fix-Me overlay draws `position:fixed` boxes from a one-time
`getBoundingClientRect()` snapshot and only redraws on DOM mutation or
resize — there was no `scroll` listener, so on every real preview surface
(the docs-site filmstrip, the VS Code marp preview — both scroll the
document itself) scrolling to the flagged slide left the yellow box pinned
at its stale screen position while the real cell moved underneath. The
code's own comment justifying `position:fixed` over the debug overlay's
`position:absolute` + document-coordinate technique ("same-document means no
scroll-tracking problem to solve") was simply wrong: same-document removes
the *cross-iframe* touch-delivery complexity that overlay's OTHER technique
had to solve, not the general need to track scroll — `position:fixed` is
pinned to the viewport regardless of same- or cross-document. **Fix:**
`drawFixMeTags` now binds a `scroll` listener (mirroring
`docs/src/playground/debug-overlay.js`'s own) that re-runs itself against
the last known targets — cheap, since it only re-reads their rects rather
than re-probing the whole document. Both the code comment and this doc are
corrected in place.

## 10. Item-level drill-down (2026-07-10, shipped same PR)

After the first slice shipped, testing against `cards-grid` showed Case A's
granularity was coarser than it needed to be: a genuinely over-stuffed card
sharing a flex row with a normal card gets its WHOLE `.cell-stage` clip-cell
highlighted (all 4 cards), because the normal card is *stretched* to match
the tall one's row height (`align-items:stretch`, the flex default) — box
size alone can't tell "this card demanded the height" from "this card was
just dragged along."

**The signal that resolves it, confirmed empirically:** each item's own
*content slack* — box height minus how far its own content actually
reaches (measured via children's `getBoundingClientRect()`, mirroring
`overflow-probe.js`'s `flowedSpill`, not `scrollHeight` — which under the
default `overflow:visible` doesn't reliably report true content extent). On
a genuine repro (cards-grid, one deliberately over-stuffed card row-mate
with a normal card): both report an identical stretched box height, but
17px slack (the culprit — content nearly fills the box) vs 291px slack (the
bystander — mostly empty). The same held on `split-compare`'s two option
cards (779px identical stretched height; a bespoke `.option` div shape, not
a list — see below).

**The axis→DOM gap this surfaced.** Finding "the collection inside this
clip-cell" needs to know, per component, where its axis elements actually
render — and the existing `slots.*.selector` manifest field describes the
PRE-transform authoring shape, not necessarily the post-transform rendered
DOM. A live check against all 26 `density.axis`-bearing manifests
(`test/unit/runtime/axis-dom-catalog.test.js`) found 22 components render
exactly as authored (`ul > li` / `table > tr`, the manifest's slots selector
already matches); 4 do not, because their own transform retags the axis
elements:

| Component | rendered selector | why |
|---|---|---|
| `split-compare` | `.options > .option` | `split-panels.js` transform |
| `kanban` | `.kanban-cards > .kanban-card` | chart-family kernel |
| `timeline-list` | `.timeline-spine > .timeline-item` | chart-family kernel |
| `glossary` | `table tbody > tr` | markdown-it token rewrite (word-counted as `item`, rendered as a table row — the density doc's own §2 already anticipated this axis/DOM split for glossary specifically) |

**The fix, owner-directed** ("fix the axis definitions properly... do a
bang-up job... then solve the main problem," 2026-07-10): a new optional
`density.domSelector` manifest field, populated only for the 4 exceptions
above, plus a coverage test that RENDERS every axis-bearing component's
manifest `sample` and asserts the resolved selector (override or universal
default) finds live elements — not just declares one and hopes. That test
immediately caught a 5th, pre-existing bug: `split-panel` (and any sovereign
Frame whose clip-cell is `.panel-right`/`.compare-right`, not `.cell-stage`)
had NO working default at all — `lib/transformers/focus.js`'s DOM-path
`_focus: item N` resolver only ever checked `.cell-stage`, so it silently
no-op'd on a `split-panel` slide. Fixed by deriving the fallback selector
from `CLIP_CELL_SELECTOR` (`lib/core/overflow-probe.js`) itself instead of a
hand-maintained single-class list — the same class of bug (a hardcoded cell
list falling one class short) can't recur silently now that both the
overflow probe and the axis finder read one shared constant.

**Architecture:**
- `lib/components/manifest.schema.json` — `density.domSelector` (optional).
- `lib/core/collections.js` — `domItemElements`/`domRowElements`, extracted
  from `focus.js`'s inline DOM-path logic (HARD RULE #15) and generalized to
  accept either a `<section>` or an arbitrary descendant clip-cell as root,
  with the `CLIP_CELL_SELECTOR`-derived fallback fix above.
- `tools/build-axis-dom-catalog.js` → `lib/runtime/axis-dom-catalog.generated.js`
  — component name → `{axis, domSelector}`, scanned from every manifest,
  wired into `npm run build` BEFORE the runtime bundle step (which
  `require()`s it directly — esbuild inlines it, no fs at bundle time).
- `lib/runtime/index.js` — `drillDownCulprits(cell, section)`: resolve the
  cell's axis collection (override or universal default), group items by
  rendered height (same group = stretched together), and within a group
  flag the item(s) whose slack is BOTH below half the group's median slack
  AND at least 20px under it (§8's "also require a relative outlier" —
  a uniformly tight-but-correct row flags nothing rather than guessing).
  Falls back to highlighting the whole cell when no collection is found, no
  group has 2+ members, or no item clears both thresholds.

**Verified** (real-browser, headless Chromium, not emulation): cards-grid
(generic path) isolates the one over-stuffed card, not its stretched
neighbor; split-compare (the override path) isolates "preferred option",
not "alternative option"; a uniformly-dense 4-card grid (no genuine outlier)
correctly falls back to the whole-cell box instead of guessing; a clean,
non-overflowing deck draws nothing.

## 11. Row-outlier correction (2026-07-10, same day)

Building out a 5-component demo (`verdict-grid`, `stats`, `decision`, in
addition to the two above) surfaced a real bug in §10's algorithm on
`verdict-grid`'s default 2×2 layout: row 1 (a genuinely over-stuffed card)
overflowed on its own content, and that excess pushed row 2 — two
perfectly ordinary, short cards — past the clip boundary. Row 2 never
overflows on its own merits; it's purely a downstream consequence of row 1.
But `findCulprits` searched EVERY height-group in the collection
unconditionally, and row 2's two cards happened to have slightly different
slack (one had a marginally longer one-line rationale than the other) —
enough to cross the outlier threshold and get one of them (an entirely
innocent card) tagged "Fix Me." This is the *exact* misattribution the
whole feature exists to prevent, recurring one level up: "which row is
worst" needs the same non-guessing discipline as "which item in a row is
worst."

**Fix:** before searching a height-group for an item-level outlier, first
check whether the GROUP ITSELF is a height outlier among its sibling
groups — using the same asymmetric ratio-plus-absolute-gap test as the
item-level check, but directionally inverted (a row is suspect for being
unusually TALL, not unusually short). A row within normal range for its
collection is never searched, no matter how much internal variance it has
among its own members — variance alone isn't a defect, only genuine
excess is.

`lib/core/drill-down.js` gained `outliersWithinGroup` (the existing
per-group logic, now a named, independently-testable step) and the new
group-outlier gate in `findCulprits`.

**Maker-checker correction, same day.** The first cut of the row baseline
used a LOWER-anchored median (`sortedH[floor((n-1)/2)]`) — correct for the
tested 2-group and 4-group-minority-anomaly cases, but an independent
checker found a hand-worked counterexample where it breaks: once anomalous
(overflowing) rows become a MAJORITY of 3+ groups (e.g. heights
150/250/500), the median index can land directly ON a moderately-anomalous
row, which then compares against ITSELF as baseline and is silently
cleared — the same self-reference trap the gate exists to prevent, one
level removed. **Fix:** use the group MINIMUM instead of a median. An
overflow-causing anomaly can only make a row TALLER, never shorter, so the
shortest row in the collection is always a safe, non-self-referential
baseline — correct regardless of how many other rows are anomalous. Two
new tests lock this in (3 groups and 4 groups, majority anomalous, each
confirming every genuinely-oversized row is still individually found, not
just the most extreme one).

Eleven new/revised unit tests in total cover the row-outlier gate,
including the exact verdict-grid repro (a comfortably-sized row must never
be searched just because it sits below an overflowing one), a
two-independently-oversized-rows case (2 normal + 2 tall), and the
majority-anomaly cases above. Re-verified in the real browser across all 5
demo components after both fixes, plus a clean re-check that cards-grid and
split-compare (both single-group cases, unaffected by the new gate in
principle) still resolve identically to before.
