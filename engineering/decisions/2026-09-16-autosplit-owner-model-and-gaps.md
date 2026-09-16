---
status: in-progress
summary: The owner's model for auto-split, stated in their own terms, set against what the tree actually does today. Fourteen principles; six are built, two conflict with what is already recorded, the rest are partly there. Carries the measured gaps behind each — 38 of 70 components enrol, 24 belong to three exemption rules, 11 enrol through a bespoke recipe with no declared axis — and the five traps that cost a session three wrong targets.
builds-on: 2026-09-05-auto-split-catalog-audit/README.md, 2026-09-01-autosplit-splits-on-structure.md, 2026-07-22-structure-derived-split-patterns.md
---

# Auto-split — the owner's model, and where the tree is not it yet

**Date:** 2026-09-16 · **Status:** Open · **Decision owner:** Sharmarke

This note exists because a session spent most of its hours re-deriving things the
repo already knew, and the owner's actual design intent was scattered across a
chat transcript that dies with the session. The intent is the durable half. The
measurements are the perishable half, and they are dated here so a later reading
knows what to re-run.

**Read `2026-09-05-auto-split-catalog-audit/` first.** It is the census — 122
decks, 245 authored slides, 1,436 pages, every component and every declared
variant at portrait and square, pixel-compared against an unsplit `hd` control,
with the owner's rulings on it. Nothing in this note replaces it, and **no session
should commission another census.**

---

## 1. The model, in the owner's terms

Stated across one working session, collected here as the design intent rather
than as instructions to a particular agent.

| # | Principle | Where the tree stands |
|---|---|---|
| 1 | Auto-split is for **portrait, mobile, square, story** — never hd/4K | **built** — the gate is the `data-family` classifier; `wide` (aspect > 1.05) never splits |
| 2 | **Every component and every variant** has auto-split support | **conflicts** — see §2 |
| 3 | Auto-split **always has a cover** | **28 of 31** enrolled components; `journey`, `kanban`, `roadmap` open on a body page |
| 4 | Auto-split **splits on structure** | **built** — `2026-09-01-autosplit-splits-on-structure.md` |
| 5 | A **unique structure** inside a component gets a split preprocessor | **partly** — 14 strategies exist, and the bespoke ones are the ones that fail |
| 6 | The **footer appears on the cover only** | **built** — `stripRunFooter` keeps the caption on the run's opener |
| 7 | A split page gets the **Frame, Cell and Tile** constructs | **partly** — nine sovereign Frames suppress the footer Cell; four of them split |
| 8 | The footer band carries **rail + pagination**; the cover also carries the footer text | **PR #2233** |
| 9 | `split-panel` is a component like any other. It splits like everything else — **except its dark panel becomes the cover**, and the rest becomes the split slides that follow | **partly** — see §3 |
| 10 | **Only a few slides should be exempt**, and we need to identify them | **proposed** — three rules, §4 |
| 11 | Where a mechanism is in question, **take best practice**; do not put the mechanism to the owner as a choice | — |
| 12 | **"We warn, we coach."** An author may do as they like; where something better exists we warn, suggest the fix, and offer more modifiers — we do not refuse the deck | already HARD RULE #29's posture |
| 13 | **Form is on. It is the standard**, and the ability to turn it off is planned for removal | — |
| 14 | Things may overflow. **We let them, we warn, and we make a best-effort guard.** The answer for wide layouts — Frame, Cell and Tile, the overflow ring, the content-clipped tag, the fix-me pill, the ellipsis guard — is the answer here too. Do not reinvent it | the reasoning behind #7 and behind `2026-09-14-a-reserved-band-is-not-an-overflow-allowance.md` |

Two of these sit against something already recorded, and neither is a
contradiction the owner has to resolve blind:

**Principle 2 vs the exclusions.** `NEVER_SPLIT` covers `anchor`, `graphic`,
`asset` and `atomic` — which is where the SVG charts live, and keeping those
whole is the owner's own instruction from the same session. The 09-05 audit also
left six components explicitly open (`kpi`, `stats`, `verdict-grid`,
`compare-prose`, `decision`, `compare-code`) on the argument that the comparison
*is* the read. The owner has since resolved one of that exact shape — `pricing`,
2026-09-06: *"pricing is no different than compare components. we accept the
splitting."* Principle 2 reads as **every non-atomic component enrols**, which
the owner confirmed.

**Principle 3 vs ruling 1.** The four `cover-*` strategies are the only things
that build covers, and ruling 1 (09-05) says to stop re-authoring because those
four account for **30 of the 45 lost variant looks**. Both hold only if the cover
becomes a page the **component itself renders** — the same component with a
member subset — rather than a page a strategy rebuilds from parsed parts.

---

## 2. Enrolment, measured 2026-09-16

A component enrols when it has `capacity.axis` **or** a `split` recipe
(`lattice-emulator.js` `SPLIT_CAP`). Of 70 components:

| | count | |
|---|---:|---|
| enrolled | **38** | 16 by axis alone, 11 by recipe alone, 11 by both |
| not enrolled | **32** | 24 belong to the exemption rules below; 8 should enrol |

**The 11 that enrol by a bespoke recipe with no declared axis** are ruling 1's
targets — a strategy standing in for an axis nobody declared:
`split-panel` · `list-tabular` · `compare-prose` · `decision` · `glossary` ·
`code` · `compare-code` · `journey` · `math` · `obligation-matrix` · `redline`.
The first four are the audit's 30-of-45.

The catalog holds **273 looks** — 70 defaults and 203 declared variants.

---

## 3. `split-panel`, and why it was never "a component like any other"

It declares `density.axis: "item"` and **no `capacity`**. `density` budgets
*words per element*; the splitter never reads it. So nothing said what repeats on
a `split-panel`, and `feature-cover` was the only thing that could split it —
which is exactly the re-authoring that discards the component's own classes and
renders every `cat-N` slide the same blue.

PR #2234 declares the contract, measured per family with
`tools/calibrate-capacity.js` at the component's own density basis (16 words an
item):

| family | @size | ceiling | overflows at |
|---|---|---:|---:|
| wide | 16:9 | 5 | 6 |
| square | square | 3 | 4 |
| **tall** | portrait | **2** | 3 |
| strip | mobile | 5 | 6 |

`tall` binds at 2 — which is why a three-item `split-panel` splits at portrait
and not at 16:9.

**A stale claim fell out of it.** The stress specimen's own prose read *"a fourth
would push past the footer."* Rendered at 16:9, five full-budget items fit with
no overflow and no clip. A claim made in prose is invisible to every gate, and
this one sat until the `band` conformance rule forced the specimen to match the
declared ceiling. Worth remembering as a class of defect, not just an instance.

**Declaring the axis is not enough on its own.** In `splitDoc` a `split` recipe
wins over a derived axis, so `split-panel` still takes `feature-cover` today.
Retiring that recipe is the next change, and #2234 is its prerequisite.

---

## 4. The exemption proposal — 24 components, three rules

Replacing 32 per-component placements with three properties of the *form*:

- **A · Bookend** (3) — `title`, `closing`, `divider`. One statement, and the
  statement is the slide.
- **B · viewBox graphic** (17) — the 14 chart kernels plus `map`, `diagram`,
  `gantt`. A viewBox **scales**; it does not paginate. This is the owner's "keep
  SVG diagrams together", and it is one rule rather than seventeen decisions.
- **C · Indivisible statement** (4) — `big-number`, `quote`, `citation-card`,
  `logo-wall`. Nothing to cut; a single logo on its own page asserts an
  endorsement the author never wrote.

All 24 are already non-enrolled, so adopting this changes no behavior.

**Eight leave exempt:** `image`, `video`, `scene` (claim → artifact, settled
09-05) · `contact`, `wifi` (credentials → code, agreed in direction) ·
`matrix-grid` (`row`) · **`timeline-list`, `progress` — which reverses the
2026-09-02 decline and is NOT yet approved.**

**Exempt is not free.** The audit measured, on components that never split:
`state-chart` cuts its terminal state through its own box at portrait and sets
transition labels at 6.7px against a 13.5px floor; `gantt` elides three of five
task labels with 28–63% of the page empty; `logo-wall` and `matrix-grid` clip
**with no engine warning of any kind**. Those take ruling 2's answer — shed
chrome first, then ring — not a split.

---

## 5. What is settled, and must not be re-opened

- **One member per page.** `auto-split.js` `splitTargetOf()` returns ONE, always
  (owner ruling 2026-09-01). It is policy, not over-fragmentation.
- **Ruling 1** — refine the shared envelope; route splitting through the
  pagination path so the component's own CSS renders every page.
- **Ruling 2** — chrome may be dropped to reclaim space; stage content may not,
  ever.
- **Ruling 3** — a split page never centers the slide header.

## 6. Open, and the owner's to call

1. `timeline-list` / `progress` — enrolling them reverses 2026-09-02.
2. The six the audit left open (`kpi`, `stats`, `verdict-grid`, `compare-prose`,
   `decision`, `compare-code`), against the `pricing` precedent.
3. Whether the size gate itself is right. `roadmap.square` is the uncomfortable
   case the audit names: four variants that decline to split render better than
   the one that splits, on the same content.

## 7. Traps, each one measured the hard way

- **The engine reads `capacity.axis`, never `density.axis`.** The two fields
  disagree across the catalog, and reading the wrong one produces a confident,
  wrong enrolment census.
- **A `split` recipe beats a derived axis** in `splitDoc`.
- **Auto-split is gated off `wide`.** Prototyping at 1280×720 measures nothing
  about auto-split.
- **A structural signature taken from raw markdown block types is too literal.**
  `ol` vs `ul` and `quote` vs `h2` are not different structures for splitting;
  keying on them fragments one rule into four and inflates the whole catalog
  count. The component's declared axis is the right key.
- `tools/build-galleries.js` takes `--only <name>`. A positional argument
  rebuilds the entire catalog's PDFs.
- **Renders fill the sandbox disk fast.** At 100% Chrome wedges and tests fail as
  watchdog timeouts rather than as real failures. Clear `.scratch/` before
  believing a red suite.

## 8. Standing findings, outside any PR

- **52 declared capacity values across the catalog exceed their measured
  ceiling** (`node tools/calibrate-capacity.js --all`, 2026-09-16).
- **Four clips no instrument can see** — `logo-wall.square`,
  `matrix-grid.square`, `state-chart.square`, `obligation-matrix` at both sizes.
  The probe catches a box that exceeds its frame or clips internally, not content
  that simply sits past the page edge. A gate cannot hold a line the probe cannot
  measure.
- **The studio route budget had 167 bytes of headroom on `main`** — 0.08%, where
  the ledger specifies ~3%. The next small change to anything the Studio inlines
  will hit the same wall, and it will not be the change that spent the room.
