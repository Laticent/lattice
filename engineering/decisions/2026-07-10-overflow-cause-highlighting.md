---
status: shipped
summary: Overflow detection today only flags the SLIDE ("Overflows" red ring + tag) with no cause. This ships a yellow "Fix Me" highlight on the specific element responsible for Case A (clip-cell geometry — certain, not a guess), drilled down to the specific stretched-row item within the cell via a content-slack signal, backed by a density.domSelector manifest field + render-verified coverage for all 26 axis-bearing components — AND Case B (§12), a hedged "Likely fix" fallback for slides with no clip-cell at all (e.g. timeline-list; kanban is Case-A-only — its card text is CSS-truncated so density can never be the true cause, §13), keyed off each component's density.soft/hard word budget measured live off the rendered DOM (a same-day fast-follow, §13, fixed a text-gluing undercount and the kanban gap after a post-merge adversarial review).
---

# Overflow cause highlighting — a yellow "Fix Me" tag on the element responsible

**Date:** 2026-07-10
**Status:** shipped — Case A (§1-10, PR #890) and Case B (§12, PR #892) are
both live; §13 is a same-day fast-follow (two confirmed bugs found by a
post-merge adversarial review, both fixed).
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

## 12. Case B — the density-budget fallback (2026-07-10/11, follow-up PR)

**Was it still needed, or did the Form/flex-cell-tree migration make it
moot?** With `.cell-stage` now wrapping almost every component's body
(§10's `STAGE_MIGRATED` bucket), it was worth re-checking whether ANY
density-axis component could still overflow with zero clip-cell registering
spill — Case B's whole trigger condition. It's not moot: `masthead.transform.js`
keeps a second bucket, `STAGE_DEFERRED` — "band + direct-child body,"
deliberately NOT wrapped in `.cell-stage` — and two of its members
(`kanban`, `timeline-list`) carry a `density` block. A `form: off`/`no-form`
escape hatch reaches the same no-clip-cell shape for any of the 26.

**But `kanban` turned out NOT to be the repro it looked like.** Every text
field on a kanban card is CSS-truncated —
`.kanban-title-text` (`-webkit-line-clamp: 2`), `.kanban-card-meta`, and
`.kanban-card-body` (`white-space: nowrap; text-overflow: ellipsis`) all cap
at a fixed number of lines. A long title or body doesn't grow the card; it
gets visually clipped at render time, so the card's box height — and the
board's — can never grow from prose length alone. `timeline-list` has no
such defense (`timeline-list.styles.css` has zero `line-clamp`/`ellipsis`
rules), so it became the real repro and the one used for verification below.
This is worth recording as a general note: a `density.axis`-bearing
component with defensive CSS truncation is not automatically exempt from
needing the check, but it may already be safe from THIS particular failure
mode — worth a quick CSS read before assuming a component is a live Case B
repro, not just a structural (STAGE_DEFERRED) one.

**Implementation deviated from §6 item 4's original plan.** The plan on
paper was to bundle `prose-budgets.js` and run `elementWordCounts` against
"the live slide markdown/DOM" client-side. In practice the runtime never has
the deck's markdown source at hand in a live preview — only the rendered
document — and there is no clean way to get it there: correlating a
per-slide markdown substring back to its rendered `<section>` by position
breaks the instant `headingSplit`/`focusSteps`
(`lib/integrations/markdown-it/plugins.js`) are in play, since both can
expand ONE authored slide into SEVERAL rendered ones, desyncing any naive
index correspondence between source-slide-N and section-N. Rather than carry
that fragility, Case B counts words directly off each item's live
`textContent` (`domWordCount`, `lib/core/drill-down.js`) — the same
"measure the rendered DOM, not a symbolic model of it" philosophy `contentSlack`
(§10) already uses for Case A. This can run a couple of words high on a
component whose chrome (a kanban-style size badge, a status pill) isn't
backtick-quoted prose in the DOM the way it is in source — an acceptable
bias since it's roughly uniform across every item in the same collection, so
it never changes WHICH item is worst, only the shown count's precision. This
does mean Case B's number can drift slightly from what
`lib/authoring/review-core.js`'s Node-side linter would report for the same
slide; both are already labeled as guidance, not fact, so this is a
difference in precision, not in kind.

**Architecture:**
- `tools/build-axis-dom-catalog.js` → `lib/runtime/axis-dom-catalog.generated.js`
  now also carries `soft`/`hard` per component (from the same
  `density` manifest block), so the runtime never needs the full manifest
  catalog just to know a budget.
- `lib/core/drill-down.js` gained `domWordCount(el)` and
  `findDensityOutlier(items, budget)` — the single worst item past
  `budget.hard`, mirroring `review-core.js`'s own
  `worst = Math.max(...counts)` (HARD RULE #15), unit-tested with plain fake
  `{textContent}` objects.
- `lib/runtime/index.js` — `drillDownDensityOutlier(section)`: resolves the
  section's own axis collection (same override/default logic as Case A's
  `drillDownCulprits`, just rooted at the whole section instead of one
  cell, since Case B by definition has no cell to root at) and runs
  `findDensityOutlier`. Wired into `check()`'s `else` branch — Case B never
  fires on a section where Case A's `overCells` already found something,
  and vice versa; the two are mutually exclusive per slide.
- The Fix-Me overlay's target list is now `[{el, label, hint?}]` instead of
  bare elements, so Case A (`label: 'Fix Me'`, no hint) and Case B
  (`label: 'Likely fix'`, `hint` carrying "Likely cause — Nw, over budget"
  as a native tooltip) read differently at a glance without a second colour
  — §8's "different label per case," implemented as a short, chip-sized
  hedge word plus the fuller hedge on hover rather than the doc's originally
  longer suggested strings, which don't fit the existing tab's small
  corner-chip footprint.

**Verified** (real-browser, headless Chromium, not emulation): a
`timeline-list` slide with one milestone padded well past its 24-word `hard`
budget draws a single yellow box around exactly that milestone (not its
three normal-length siblings), labeled "Likely fix" with a tooltip reporting
the live word count; a budget-compliant `timeline-list` slide (no overflow)
draws nothing; `cards-grid` and `split-compare` (both Case A) re-verified
unchanged after the `{el, label, hint}` refactor of the shared overlay
target shape; adding an OPTIONAL `.chart-status` status pill to the other,
compliant milestones changes neither the flagged item nor its reported word
count (the maker-checker fix above).

**Off-path finding, logged not fixed (HARD RULE #18).** Building the demo
deck's `timeline-list` slide surfaced a pre-existing, unrelated quirk in
`lattice-emulator.js`'s own export-time overflow WARNING (`measureOverflow`,
the console message naming which pages exceed the frame): opening the same
exported HTML independently in a fresh browser correctly shows the
`timeline-list` slide as `.overflow`, but the emulator's own internal
Puppeteer pass that generates the printed warning list omits it — the
export's actual PDF bytes are unaffected (the slide still clips cleanly, as
its own visual review confirmed), only the console warning under-counts by
one page for this specific component shape. Neither `lattice-emulator.js`
nor its overflow-warning path is touched by this PR (Case B is preview-only,
`lib/runtime/index.js` only) — worth a dedicated investigation, not pulled
into this diff. Tracked as
[#894](https://github.com/SlideWright/lattice/issues/894) (a Munger-inversion
finding during §13's adversarial review: a decision-doc mention alone doesn't
guarantee follow-up the way a tracked issue does).

## 13. Post-merge adversarial trio — two confirmed bugs, fixed same-day (2026-07-11)

Merging §12 (PR #892) without first running the full HARD RULE #25 verification
ladder was a process miss, caught when directly asked whether it had been red
teamed. Case B touches the shared runtime kernel AND introduces a genuinely
novel heuristic (DOM-based word counting, a deliberate deviation from this
doc's own §6 plan) — that combination should have gotten the full adversarial
trio (red team + Munger inversion + independent checker) before merge, not
the single maker-checker pass it actually got. Run post-merge instead, the
trio found two real, live, CONFIRMED bugs (plus several lower-severity/
residual findings), fixed in a same-day fast-follow PR:

**Bug 1 — `domWordCount` silently undercounted via adjacent-element text
gluing (independent checker).** `chart-family.js` builds markup by plain
string concatenation with NO whitespace between adjacent sibling tags —
`<div class="timeline-title">Migrate to Argo</div><span
class="chart-status">at-risk</span><div class="timeline-body">Some notes
here</div>`. Reading `.textContent` on that tree and splitting the RESULT on
whitespace glues "Argo" + "at-risk" + "Some" into one token
("Argoat-riskSome"), silently dropping real prose words before the pill's
own count is even subtracted — a false NEGATIVE exactly where Case B exists
to fire. The shipped unit test couldn't catch it: its hand-rolled fake
inserted a space (`` `${bodyText} ${statusText}` ``) that real chart-family
markup never emits, so it validated a shape the runtime doesn't actually
produce. **Fix:** `domWordCount` now walks the DOM tree and tokenizes each
TEXT NODE independently (using its own local whitespace), concatenating the
resulting token ARRAYS rather than joining raw strings across element
boundaries first — `.chart-status` is excluded by skipping its subtree
during the walk, not by counting-then-subtracting. New tests use real
`jsdom` elements built with the exact no-whitespace concatenation shape,
including a same-day regression test for the fake-vs-real gap itself.

**Bug 2 — Case B could fire on `kanban` despite its text being unable to
cause the overflow (red team).** Every kanban card text field is CSS-
truncated (`.kanban-title-text{-webkit-line-clamp:2}`,
`.kanban-card-body{text-overflow:ellipsis}`,
`lib/components/chart/kanban/kanban.styles.css`), so a card's word count is
decoupled from its rendered height entirely — a genuinely overflowing
kanban board is a CARD-COUNT problem (`capacity`, not `density`), which
neither Case addresses. Case A was already correctly unaffected (kanban's
`axis`/`domSelector` still resolve its item collection for the item-level
drill-down); the bug was narrower: Case B's word-budget check had no reason
NOT to also run on kanban, and would tag some card's already-INVISIBLE text
"Likely fix," misdirecting the author from the real cause. **Fix:**
`tools/build-axis-dom-catalog.js` gained a `NO_CASE_B` set (currently just
`kanban`) that nulls `soft`/`hard` for a listed component while leaving
`axis`/`domSelector` untouched — Case A's drill-down is unaffected, Case B's
`findDensityOutlier` returns `null` immediately (no `hard` to compare
against) and draws nothing. Locked in by a catalog unit test asserting the
exclusion.

**Lower-severity / accepted-as-documented findings** (not blocking, not
fixed this round):
- Case B's `domSelector` query roots at the whole `<section>` (Case A roots
  at the specific clip-cell it found — Case B has none to root at). A
  component with a broad/generic `domSelector` (e.g. glossary's
  `table tbody > tr`) reachable via `form: off` could in principle sweep in
  an unrelated hand-authored table elsewhere on the slide. Judged a rare,
  edge-case authoring pattern rather than a common-path bug; for the
  ordinary `form: off` case there IS no wrapper to root at more tightly
  (masthead-lift never runs), so section-scoping is the only option, not a
  shortcut taken for convenience.
- The `.chart-status`-only chrome exclusion is narrower than
  `prose-budgets.js`'s generic backtick-based exclusion for the Node-side
  linter — a FUTURE component inventing a new badge/pill class outside
  `.chart-status` could reintroduce a smaller version of Bug 1's skew (not
  the gluing bug, which is now fixed generically; just the "should this
  count as chrome" judgment call). Flagged for whoever adds the next
  chart-family-style badge, not fixed preemptively against a hypothetical.
- Real-browser verification (both the original PR and this fast-follow)
  covers 3-4 of the 26 `density.axis`-bearing components. Case B fails
  closed (returns `null`, draws nothing) on an unverified shape rather than
  guessing, which bounds the risk to false negatives (a real cause goes
  unflagged) rather than false positives (a wrong element gets blamed) —
  accepted as a reasonable risk profile for an already-hedged "best guess"
  signal, not something requiring exhaustive per-component verification
  before every future manifest change.

## 14. Issue #894 fixed — a font-loading race, not an undercount (2026-07-11)

§12's "off-path finding" logged a `lattice-emulator.js` overflow-WARNING
undercount as issue #894, reasoning the exported `.html` sidecar's own
`.overflow` class was ground truth and the console warning was short by one
page. Direct investigation with a controlled Puppeteer harness (mirroring
`measureOverflow()`'s exact setup) found the opposite: **the console warning
was already correct.** The exported `.html` sidecar's EMBEDDED
overflow-watcher script — the one baked into every exported `.html` file so
opening it in a plain browser still shows the ring — measured on
`DOMContentLoaded` with no font-forcing step at all. Marp's template
lazy-loads a `@font-face` only when the browser first tries to paint text
using it, so `document.fonts.ready` can resolve "loaded" before a specific
slide's own text has actually triggered its font's fetch; measuring against
the wider/taller fallback-font layout pushed a borderline `timeline-list`
slide (7px over a 720px frame — well under what any real defect in this
codebase has ever measured, per the TOL comment's own "smallest real bug
observed was a 211px overshoot") across the 12px tolerance. Confirmed with a
direct repro: forcing `document.fonts.load()` on every declared font +
`document.fonts.ready`, then re-running the SAME embedded script's `check()`
via its own `resize` listener, flipped the false `.overflow` class off with
no other change. `measureOverflow()` was never affected — it already
force-loads fonts first, which is exactly why it disagreed with the
under-protected embedded copy.

**Fix:** both the exported `.html`'s embedded watcher AND the
live-preview runtime (`lib/runtime/index.js`'s `startOverflowWatcher`, which
had the identical gap on its very first paint) now force every declared
font to load and await `document.fonts.ready` before their first
measurement — the same recipe `measureOverflow()` already used, now shared
by every overflow-detection entry point. The live runtime keeps its
IMMEDIATE first check too (for a responsive ring on the common case) and
adds a font-settled recheck alongside it — its `schedulePostMutation`-driven
rechecks would eventually self-correct a false positive anyway on any
further edit, but a slide nobody touches again after initial paint could
otherwise keep a false ring forever. The exported sidecar's embedded script,
by contrast, has no such continuous recheck loop (only `window resize`), so
it waits for the font-settle promise before its ONE-AND-ONLY check.

**Verified**, per this repo's export-bytes sign-off requirement (the
embedded script's own bytes changed): rendered `examples/overflow-fix-me.md`
before and after in both light (`indaco`) and dark (`indaco-dark`) —
identical content, the false ring on slide 5 (`timeline-list`) present
before, absent after, sent for human inspection and confirmed. The PDF
pixels themselves were unaffected before and after (the ring/tab are always
stripped from the PDF regardless; `measureOverflow()`'s own warning was
correct throughout).

A methodology note for future investigators: don't cross-compare Puppeteer's
measurement against Playwright's (or vice versa) even against the identical
Chrome binary via `executablePath` — the two automation libraries can settle
lazy font loading on different schedules by the time a fixed-delay check
runs, which reads as a rendering discrepancy but isn't one. Compare the SAME
tool's own measurement before vs. after an explicit font-settle wait.
