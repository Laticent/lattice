---
status: shipped
summary: >
  317 open cards, and the axis that decides what to work next is not on any of them. The board's
  four label axes answer "which column" — `area:` is a swimlane, `priority:` is one word with no
  stated rule — so the queue reads as 80 engine cards rather than as 16 gates red on `main` right
  now, 9 security holes, 20 places the engine ships a wrong artifact silently, and 17 jank cards (18 in the view).
  This note assigns every one of the 317 to exactly one WORK CLASS, orders the classes by what
  each one costs while it stays open, and gives jank its own cross-cutting view because it is the
  one class whose members sit under five different `area:` labels and whose instrument is younger
  than the defects it finds. It also reports three defects in the QUEUE itself: one real duplicate
  pair (#2105 / #2205, the same assertion and the same root cause), a subset pair (#2070 inside
  #1514), and 50 cards carrying a `model:*` label for a dimension HARD RULE #27 retired on
  2026-07-28. The taxonomy is shared state other sessions read, so every write was put to the
  owner first under CLAUDE.md's second filter, row 1: all four were approved and applied (21
  priority raises, 50 `model:*` strips, #2105 closed into #2205, #1514 and #2070 cross-linked,
  and #2240 filed for the census sweep). One approved action could not be completed here — the
  three `model:*` label DEFINITIONS survive at zero cards, because no tool in this environment
  can delete a GitHub label.
last-updated: 2026-09-20
companion:
  - ../jank.md
  - ../jank-census.md
  - ../workflow.md
---

# Triaging 317 open cards — the class axis the board does not carry

**The answer first.** The queue is not badly labeled; it is labeled for the wrong
question. Every card carries `area:` · `type:` · `priority:` · `status:`, and
`BACKLOG.md` mirrors all four faithfully. What none of them says is **what this
card costs while it stays open** — and that is the only question a triage pass is
for. `area:engine` holds 80 cards spanning a security hole, a stale golden, a
typography refactor and a feature epic; `priority:medium` holds 157, which is
half the board and therefore says nothing.

So this note adds one more cut, for reading rather than for labeling: **14 work
classes, every open card in exactly one.** Eight are defect classes ordered by
cost-of-delay; six are feature tracks, which is the honest shape of the tail.

**The ordering claim, in one line each.** A gate red on `main` taxes every branch
that runs it, so it is first. A security hole is unbounded and cannot be
un-shipped once a recipient has the file. A silently wrong artifact is worse than
a crash because nobody learns. Everything after that competes on merit.

---

## 1 · How the numbers were derived

`gh` is not installed in the cloud sandbox, so the queue was read through the
GitHub MCP `list_issues` in four pages of 100 (`number,title,body,labels,
created_at,comments`, `CREATED_AT ASC`), merged and de-duplicated by number:
**317 open, matching `BACKLOG.md`'s own header and `totalCount`.**

Two things about that snapshot are worth stating, because a count nobody can
re-derive is a claim rather than a measurement:

- **It is a snapshot, dated.** The queue moves. A note in
  `engineering/decisions/` is a dated archive, which is the only shape a 317-row
  table can honestly take — `BACKLOG.md` is the living mirror, and this is not a
  second one. Re-derive any label fact with `npm run sync:backlog`, and the
  Definition-of-Ready half with `npm run audit:queue`.
- **The class assignment is a JUDGMENT, not a query.** No label or field encodes
  it. It was assigned by reading each card's title and body; a completeness
  checker proved every open number lands in exactly one class and that no class
  cites a closed or non-existent issue (317 assigned, 0 unassigned, 0 stale
  references). The checker was a one-off in `.scratch/` and is deliberately not
  committed — it verifies arithmetic over a hand-written list, and the list is
  the artifact.

### What the existing labels say

| axis | distribution |
|---|---|
| `area:` | engine 80 · website 72 · infra 63 · **none 28** · theming 26 · docs 18 · chart 14 · diagram 4 · evidence 3 · legal 2 · code 2 · inventory 1 · + 4 strays |
| `type:` | fix 147 · feat 44 · **none 28** · refactor 26 · spike 23 · infra 19 · docs 17 · + 13 non-taxonomy |
| `priority:` | medium 157 · low 84 · high 45 · **none 29** · critical 1 · + 1 stray |
| `status:` | backlog 307 · ready 7 · **none 3** |

**307 of 317 sit in Backlog and 7 are pickable.** That is the intake-bar finding
(`workflow.md` § The intake bar) seen from the other side, and #2213 already owns
the sweep.

---

## 2 · The class axis, ordered

The order is the recommendation. Counts are members, not effort.

| # | class | cards | why it sits here |
|---|---|---:|---|
| **A** | **Red on `main`** | 16 | Every branch that runs the gate inherits the failure. #18's broken window, already shipped. |
| **B** | **Security + privacy** | 9 | Unbounded blast radius; an exported file cannot be recalled. |
| **C** | **Silent wrong output** | 20 | The artifact is wrong and nothing tells anyone — the failure mode with no feedback loop. |
| **D** | **Accessibility + contrast** | 24 | A reader who cannot read the slide is a reader we lost; several are measured sub-AA today. |
| **E** | **Jank — layout stability** | 17 | § 3. Cuts across five `area:` labels; the instrument is newer than the defects. The § 3 *view* adds #1405 from class C, for 18. |
| **F** | **Blind instruments** | 22 | A gate that reports green without looking manufactures false confidence, which is how A, C and D got here. |
| **G** | **Verification debt (#23)** | 15 | 91 claims marked UNVERIFIED and honestly so; 58 clear on one phone. |
| **H** | **Flaky tests** | 10 | Each one trains someone to re-run instead of read — the road to `--no-verify` (#14). |
| **I** | track: export + player | 20 | The artifact a recipient opens. |
| **J** | track: Studio + website UX | 51 | The largest track, and the one with the most end-user reports in it. |
| **K** | track: engine + forms contract | 37 | The long-lived architecture work. |
| **L** | track: charts + diagrams + theming | 23 | Component and palette capability. |
| **M** | docs honesty | 24 | Claims the engine no longer supports. |
| **N** | process + queue hygiene | 29 | Includes #2213, which owns the backlog sweep itself. |

### Where the label priority disagrees with the class

The most useful output of the pass, because each row is a card whose label would
route it to the bottom of a queue its class puts near the top. **30 cards in
classes A–C carry `priority:medium`, `low`, or nothing:**

- **A (red on `main`), 9 of 16 under-labeled** — #2017, #2133, #2145, #2180,
  #2183 carry *no* priority at all; #1848, #1860, #2173 are `medium`; #2211 is
  `low`. Every one of them is a gate or an artifact that is wrong on `main`
  today.
- **B (security), 4 of 9 at `medium`** — #1952, #1958 (34 open CodeQL findings),
  #1993 (the mXSS re-serialization path), #2024.
- **C (silent wrong output), 17 of 20 at `medium` or below** — and **four carry
  no priority at all**: #2004, #2050, #2052 (an unterminated RAWTEXT element
  merges two slides) and #2098. The other 13 sit at `medium` or `low`, #501 and
  #1316 and #1683 among them.

**Recommendation:** raise A to `high` (`critical` for the four `[*-nightly]`
alarms), B to `high`, and give the four unlabeled C cards `priority:high` — 21
cards whose label actually changes. That is a label change, so § 5 puts it to the
owner rather than doing it.

---

## 3 · The jank view

**Why jank needs its own view and the other classes do not.** Jank's members sit
under `area:engine`, `area:infra`, `area:chart`, `area:evidence`, `area:diagram`
and no area at all, so no board filter collects them. And the class has a
property none of the others do: **its instrument is younger than its defects.**
`tools/check-jank.js` and `tools/jank-census.js` landed in September 2026;
`#581` (a kpi crowding defect) was filed in June. Most jank in this repo was
found by eye, before there was a way to measure it.

`engineering/jank.md` is canonical for the method. This is the queue-level cut of
it, in that doc's own four failure modes plus a fifth for the rig.

**This section is a LENS, not a partition.** § 6 gives every card exactly one
class; a view has no reason to obey that, and forcing it to would hide the cards
that are two things at once. So the 17 cards whose *primary* class is E all
appear below, plus **#1405**, whose primary class is C (silent wrong output)
because its axis labels are clipped away without a word — it is a collision too,
and a jank plan that omitted it would be wrong. **18 cards in the view.**

### 3.0 · The gap that is not a ticket

**The census has 77 leads and no verdicts.** `engineering/jank-census.md`
(generated 2026-09-14, 430s, 295 classes) reports **129 classes drawing a
placeable positioned mark and 77 with a mark that moves past the 2px sub-pixel
floor.** Nothing has re-swept one of those 77 with `--anchor` to turn a lead into
a verdict, and `--anchors` cannot fail a run by construction — so the number of
jank *verdicts* taken across the catalog is zero.

Two more lines from that file belong in any plan:

- **The `0px` rows are where collisions hide.** `jank.md` says to rank from both
  ends: a mark that holds perfectly still while content grows *into* it reads as
  the cleanest row on the page. There are **47** `0px` rows, including all 8
  `split-panel cat-*` variants and 13 `stamp-*` marks.
- **3 classes were never measured at all** — `big-number`, `quote`, `quote bare`
  (that is #2155), and `form` is listed *out of reach*. Those four are not clean;
  nothing was rendered.

**This was the largest jank item on the board and it had no card.** It is now
[#2240](https://github.com/Laticent/lattice/issues/2240), deliberately bounded to
a first slice — the top 10 movers and 10 `0px` rows, each swept with `--anchor`
for a real verdict — and **blocked on #2153 and #2154**, because sweeping 20
classes through an instrument that cries wolf produces 20 results nobody trusts.
The remaining 57 movers and 37 `0px` rows wait on that slice's yield rate.

### 3.1 · The rig — the tool cannot see it (4 cards)

| # | prio | what the instrument gets wrong |
|---|---|---|
| [#2153](https://github.com/Laticent/lattice/issues/2153) | medium | A **rotated** anchor is measured as its axis-aligned bounding box. `stamp-ribbon`'s 768×25px bar at `rotate(38deg)` becomes a 620×493px phantom — 16× its painted area — reporting a confident COLLISION over ~145px of real clearance. |
| [#2154](https://github.com/Laticent/lattice/issues/2154) | low | No notion of a **deliberately full-bleed** anchor. `stamp-mark` and `stamp-veil` are `inset: 0` by design and always report COLLISION — at step 1, which is the tell. |
| [#2155](https://github.com/Laticent/lattice/issues/2155) | low | `big-number` and `quote` cannot be swept on **any** axis. Each refusal points at the other one; follow either and you are back where you started. |
| [#2168](https://github.com/Laticent/lattice/issues/2168) | medium | The page number was never measured. `--front-matter` closed it and the first measurement **holds** (drift 0.0px, clearance 348.6 → 169.4px) — what remains is that the shipped mark is an in-flow flex child, so its exposure is crowding in the footer row, not collision with slide copy. |

Two of these four (#2153, #2154) are **false positives**, and `jank.md` names
that as the corrosive failure mode: *"Crying wolf is the more corrosive failure
mode: the next person to see it stops trusting the tool."* They are cheap and
they gate everything in § 3.0.

### 3.2 · DRIFT — a fixed thing moves as content grows (6 cards)

| # | prio | measured |
|---|---|---|
| [#2054](https://github.com/Laticent/lattice/issues/2054) | **none** | A split run's last body page shifts content **down** — the forward pointer's berth is not reserved, so the final page gets it back as content room. 0–88px across 8 runs of `read-across-carousel.md`. In a portrait feed it reads as the content jumping as you scroll. |
| [#1549](https://github.com/Laticent/lattice/issues/1549) | medium | `math compare` and `math matrix decompose` centre the whole section, dropping the masthead **166px / 179px** below the top berth. A comment on the card already picked the fix (structural reclassification) and priced it; a second comment corrects the card's own premise — `math matrix` is unaffected, its rule is inert. |
| [#1919](https://github.com/Laticent/lattice/issues/1919) | medium | Two quadrant charts on adjacent slides render at different sizes, because a lede taxes the stage. Same data, same variant. |
| [#2224](https://github.com/Laticent/lattice/issues/2224) | low | The page number's **ink** sits 3.98px higher on a root frame than a sovereign one — consistently, and for two individually correct reasons. Not a one-line fix: the obvious patch makes it worse. |
| [#1429](https://github.com/Laticent/lattice/issues/1429) | low | Both marker registers move to the bottom edge and the corner arithmetic retires. The design decision is already taken; this is unimplemented, not undecided. |
| [#2182](https://github.com/Laticent/lattice/issues/2182) | **none** | The Studio's slide panel puts its first control **83px** lower than the deck panel's. UI, not deck — same failure shape, different surface. |

### 3.3 · COLLISION — an overlap that no overflow probe can see (3 cards)

| # | prio | measured |
|---|---|---|
| [#1375](https://github.com/Laticent/lattice/issues/1375) | low | A wrapped `Text:` row overlaps its neighbours in a Mermaid requirement diagram — `ID: 2` and the `Text:` line are drawn at the same y, visible on the committed `diagram` gallery. Upstream: Mermaid allocates one line of space to a row that takes two. |
| [#1405](https://github.com/Laticent/lattice/issues/1405) | medium | `matrix-grid`'s `::after` axis labels are never inspected for clipping — the bearer pass skips any host that owns text. It was acceptance case 4 of #1300, fixed nowhere and filed nowhere until now. |
| [#2192](https://github.com/Laticent/lattice/issues/2192) | **none** | The Library search field's Clear ✕ lands 62px outside an `overflow-hidden` ancestor. `elementsFromPoint` returns the header, not the button — painted-clipped and unreachable by pointer. |

`jank.md`'s generalization of this class is the *an OVERLAP IS NOT AN OVERFLOW*
entry in `engineering/gotchas/css.md`: one box absolutely positioned, the other
flex-centered, neither overflowing anything.

### 3.4 · CROWDING — it fits, and eats all the breathing room (4 cards)

| # | prio | measured |
|---|---|---|
| [#581](https://github.com/Laticent/lattice/issues/581) | medium | `kpi`'s default layout overflows 4 rows under a two-line headline. A comment on the card adds a confirmed second instance — `statute-stack bands` clips its third jurisdiction pill in the bucket gallery, same masthead-lift squeeze. |
| [#1318](https://github.com/Laticent/lattice/issues/1318) | medium | `kpi`'s declared `adapt.capacity.tall` (`sweet 3 / soft 4 / hard 5`) was never validated against an unsplit portrait render. #1307 set the `wide` numbers from a 54-case matrix and left `tall` alone on purpose. |
| [#2172](https://github.com/Laticent/lattice/issues/2172) | medium | A component cannot declare a density limit without also consenting to be split — `splitFactsFor` computes `enrolled: Boolean(axis \|\| split)`. **This blocks #1605**, and the split oracle correctly refused the manifest block written for it. |
| [#1892](https://github.com/Laticent/lattice/issues/1892) | high | `title`, `closing` and `divider` are chrome-free centered clusters, so a coda band lands **inside** the cluster rather than at the foot of the slide — measured 176px / 128px / 165px out of place. A layout has no way to decline the band at all; opt-out is per trailing element, not per layout. |

### 3.5 · RE-SOLVE — the content never changed, the paint did (1 card)

`check:jank` does **not** measure this mode, by construction: the sweep varies
content and compares slides, while this varies nothing and compares one slide
against itself a moment later. It is fixed at the cause
(`lib/core/preview-font-gate.mjs`) rather than swept.

| # | prio | measured |
|---|---|---|
| [#2190](https://github.com/Laticent/lattice/issues/2190) | **none** | A cold first paste paints raw Mermaid fence source for **13–27 painted frames**. The withhold rule is present, `code.matches()` against its own selector returns true, and computed visibility stays `visible` anyway. Why it loses is **not** pinned — two probes disagreed on whether the declaration is even enumerable, and that disagreement is the next thing to chase. |

**The font-swap arm is closed and worth not re-opening:** the worst text run moved
330.3px at 197ms and 517ms on a real Playground before the gate landed. Any **new**
preview surface owes that gate, and `docs/e2e/preview-font-swap.spec.ts` is the
guard.

### 3.6 · Reading the jank class

**Do the rig first (#2153, #2154).** They are the two false positives, they are
small, and every verdict in § 3.0 is measured through them. Fixing a false
positive before sweeping 77 leads is the difference between a triaged list and 77
findings nobody trusts.

**#2172 before #1605.** The density-limit switch is a hard blocker: #1605's
manifest block was written and correctly rejected.

**#2054 deserves a priority label today.** It is the only jank card describing a
defect a *reader scrolling a shipped deck* sees, and it carries no priority at
all.

**Six of the 17 carry no priority** — #2054, #2182, #2192, #2190, plus #2228 and
#2203 adjacent to the class. All six were filed in the last ten days and are in
the 29-card `needs:triage` set.

---

## 4 · Three defects in the queue itself

**One real duplicate — #2105 and #2205.** Same test file, same root cause, both
measured. `ratio = large / Math.max(small, 0.05)`: the honest linear timings sit
below the timer's noise floor, so `small` is always clamped and the ratio
degenerates to a 0.45ms wall-clock threshold wearing a ratio's clothes. They name
different arms (`:1789` trailing whitespace, `:2261` long whitespace run) of the
same assertion. #2105 carries the "floor always engages" proof over 8 runs;
#2205 carries the fix (**median of 5**, worst observed ratio 86.8 → 2.8 over 900
samples) and the note that an absolute floor is insufficient because an 8.18ms
scheduler hiccup clears it. **Keep #2205, fold #2105's evidence into it, close
#2105 as a duplicate.**

**One subset — #2070 inside #1514.** #1514 reports two intermittent
`studio-instant-shell.spec.ts` specs on `main`, one of them *"a rect from another
orientation › is not replayed in portrait"* failing as `shell 0 vs app 16`.
#2070 is that exact spec and that exact message, re-measured at **~75% of runs**
— a majority, not a flake. Not a duplicate: #2070 is the sharper measurement of
one half. **Link them and move #1514's second spec out, or close #1514 in favour
of #2070 plus a card for the other spec.**

**Fifty cards carry a retired dimension.** `model:opus` ×26, `model:sonnet` ×18,
`model:haiku` ×6. HARD RULE #27 retired model tiering on 2026-07-28 and the
record is `engineering/decisions/2026-07-28-model-tiering-retirement.md`. The 24
`model:sonnet` / `model:haiku` cards now contradict a HARD RULE on their face —
a card telling a future session to run this on Haiku is exactly the
"well-formed, confident, wrong" failure that retirement was about. None of the
three labels is in `.github/labels.json`.

**And 17 more label strays**, which #2213's P3 already owns and priced: `type:test`
×7, `type:bug` ×2, `type:feature` ×2, `type:chore` ×1, `type:perf` ×1,
`type:enhancement` ×0-but-creatable, plus `area:components`, `area:theme`,
`priority:p3`, `bug` ×2, `documentation`, `security`. `hasDimension` in
`.github/scripts/triage.js` tests only the `type:` prefix and never consults the
taxonomy, so a non-taxonomy `type:` satisfies the gate.

### One more shape worth naming: the standing alarm

Six cards hold **131 of the queue's 394 comments** — a third of all discussion on
2% of the cards: #1530 (41), #1845 (28), #2035 (19), #2060 (16), #2085 (14),
#2120 (13). Each is a nightly watch re-firing into the same card. They are class
A, they are all `priority:high`, and none has closed. Whether a standing alarm
that has re-fired 40 times is still a *card* — or has become a dashboard wearing
a card's clothes — is a real question this note does not answer.

---

## 5 · What the owner decided, and what was applied

Every item here changes shared state that parallel sessions read, or a number the
owner set, so each was put as a question first (CLAUDE.md's second filter, row 1).
All four were approved on 2026-09-20 and applied. **The writes are recorded here
because a label change leaves no diff** — this section is the only audit trail.

1. **The priority raises — applied, 21 cards.** `priority:critical` on the four
   `[*-nightly]` alarms (#1845, #2060, #2085, #2120); `priority:high` on the rest
   of class A (#1848, #1860, #2017, #2133, #2145, #2173, #2180, #2183, #2211), on
   the four under-labeled security cards (#1952, #1958, #1993, #2024), and on the
   four class-C cards that carried no priority (#2004, #2050, #2052, #2098).
   Verified after the fact by re-reading all four pages of the queue: every raise
   landed and no card lost an `area:`, `type:` or `status:` label.
   One side effect worth knowing: the triage gate re-ran on each edit, and #2211
   picked up `needs:definition` — correctly, it has no swimlane heading. That is
   the gate working, not damage.
2. **The `model:*` labels — stripped from all 50 cards.** `model:opus` ×26,
   `model:sonnet` ×18, `model:haiku` ×6, all gone; zero `model:*` labels remain
   anywhere in the queue. **The three label DEFINITIONS still exist and could not
   be deleted from this session** — the GitHub MCP server exposes no label-delete
   operation and `gh` is not installed in the cloud sandbox. They now carry zero
   cards, so nothing reads them, but they stay creatable until someone runs
   `gh label delete model:opus model:sonnet model:haiku` or deletes them in the
   repo's Labels UI. **That is the one approved action this note did not
   complete.**
3. **#2105 closed as a duplicate of #2205**, after its evidence was folded into
   #2205 as a comment — the 8-run `floor engaged: true` measurement, the CI
   failure on #2075, and the reading of that run's `0.0ms -> 3.0ms` as the clamp
   printing itself. One thing the merge surfaced that neither card said alone:
   **two arms trip, not one** (`:1789` and `:2261`), so the median-of-5 fix has to
   land at the shared helper or `:1789` keeps the defect after #2205 closes.
4. **#1514 and #2070 cross-linked, both left open.** #2070 is #1514's second spec
   re-measured at ~75% of runs at `workers=1`, which refutes #1514's own
   parallel-load framing for that spec. #1514's *first* spec
   (`rotation into cinema`) is covered by no other card, so both comments say
   explicitly that closing either one must not silently drop the other.
5. **#2240 filed** for the census sweep — see § 3.0.

### Still open, and not asked

**The standing-alarm shape.** Six cards hold 131 of the queue's 394 comments and
none has closed: #1530, #1845, #2035, #2060, #2085, #2120. Whether a watch that
has re-fired 40 times into the same card is still a *card* — or has become a
dashboard wearing a card's clothes — is a design question, not a triage one, and
this note does not answer it. The four `[*-nightly]` ones are now
`priority:critical`, which at least stops them reading as ordinary queue.

## 6 · The full classification — 317 cards, one class each

A dated snapshot, 2026-09-20. The class is this note's judgment.

**`priority` and `area` are the labels as they stood when the queue was READ,
before § 5's writes.** That is deliberate: the table is the evidence the raises
were argued from, so showing the post-write state would erase the argument. Two
rows are stale by construction as a result — the 21 cards § 5 raised still show
their old priority here, and **#2105 appears as open** though it is now closed as
a duplicate of #2205. #2240, filed by this note, is not in the table at all.
`—` means the axis is absent.

### A · red on main — 16

| # | label priority | area | title |
|---|---|---|---|
| [#1507](https://github.com/Laticent/lattice/issues/1507) | high | infra | Studio E2E: the first restored run reports 16 failures — inventory, card mapping, and the 10 with no card |
| [#1530](https://github.com/Laticent/lattice/issues/1530) | high | website | [preview-e2e] playground gallery preview fails to render |
| [#1845](https://github.com/Laticent/lattice/issues/1845) | high | engine | [integration-nightly] render-regression tier failing on main |
| [#2035](https://github.com/Laticent/lattice/issues/2035) | high | infra | [studio-e2e] Studio E2E suite failing on main |
| [#2060](https://github.com/Laticent/lattice/issues/2060) | high | engine | [overflow-nightly] corpus overflow ratchet above baseline on main |
| [#2085](https://github.com/Laticent/lattice/issues/2085) | high | website | [perf-nightly] docs perf regression detected |
| [#2120](https://github.com/Laticent/lattice/issues/2120) | high | engine | [perf-nightly-engine] engine / preview / export perf regression |
| [#1848](https://github.com/Laticent/lattice/issues/1848) | medium | infra | infra(gate): checkUsEnglish counts examples/**/*.html — rendering any example deck fails the build on gitignored bytes |
| [#1860](https://github.com/Laticent/lattice/issues/1860) | medium | infra | fix(test): `equiv:check` has been red on main since the corpus grew — stale baseline, and no parity harness runs anywhere |
| [#2173](https://github.com/Laticent/lattice/issues/2173) | medium | engine | test: two committed goldens are stale on main, and nothing watches a golden nobody edits |
| [#2211](https://github.com/Laticent/lattice/issues/2211) | low | infra | engineering/decisions/README.md is one row out of sort order vs its own generator |
| [#2017](https://github.com/Laticent/lattice/issues/2017) | — | — | 24 committed component-gallery PDFs on `main` no longer match a fresh `build:galleries` |
| [#2133](https://github.com/Laticent/lattice/issues/2133) | — | — | The overflow-corpus baseline is stale: 8 decks clip on main that it records as clean |
| [#2145](https://github.com/Laticent/lattice/issues/2145) | — | — | examples/portrait-prose-deboost.pdf is stale on main — 28 committed pages, 31 rendered |
| [#2180](https://github.com/Laticent/lattice/issues/2180) | — | — | studio(split): a component pick leaves the preview collapsed — split.spec.ts:206 is red on main |
| [#2183](https://github.com/Laticent/lattice/issues/2183) | — | — | vetrina(narration): cadenza-narrator.test.ts has 2 failures on main |

### B · security + privacy — 9

| # | label priority | area | title |
|---|---|---|---|
| [#617](https://github.com/Laticent/lattice/issues/617) | high | engine | Harden .lattice-*.zip import against zip-slip / path traversal on filesystem-backed (desktop/CLI) imports |
| [#1246](https://github.com/Laticent/lattice/issues/1246) | high | website | security: Mermaid renders after sanitizeSlideHtml, so a diagram can put javascript: into a same-origin preview frame |
| [#1501](https://github.com/Laticent/lattice/issues/1501) | high | engine | export(player): the only real guard on forged chrome is ungated, and two collection lookups are still forgeable |
| [#1833](https://github.com/Laticent/lattice/issues/1833) | high | engine | narration(export): a speaker note still reaches a recipient through the player's notes panel |
| [#1931](https://github.com/Laticent/lattice/issues/1931) | high | infra | infra(secrets): five Actions secrets were assumed to survive the org rehost — two of them fail SILENTLY green if they did not |
| [#1952](https://github.com/Laticent/lattice/issues/1952) | medium | website | anima(security): the Motion inspector renders an invalid scene, so an inline-style color swatch must gate on `validateColor` before Director mode or a library load |
| [#1958](https://github.com/Laticent/lattice/issues/1958) | medium | engine | security(engine): triage the 34 open CodeQL findings — 28 polynomial-regex, 4 escaping, 2 sanitization |
| [#1993](https://github.com/Laticent/lattice/issues/1993) | medium | website | studio(preview): patchSlideBody re-parses and re-serializes DOMPurify's output twice, which is the mXSS amplifier the sanitizer exists to stop |
| [#2024](https://github.com/Laticent/lattice/issues/2024) | medium | engine | Export CSP: media-src and connect-src have no behavioral coverage on the export path |

### C · silent wrong output — 20

| # | label priority | area | title |
|---|---|---|---|
| [#1605](https://github.com/Laticent/lattice/issues/1605) | high | chart | quadrant: one crowded slide sets the label size for every slide — and a name that doesn't fit is silently deleted |
| [#1858](https://github.com/Laticent/lattice/issues/1858) | high | engine | fix(runtime): verdict-grid/pricing badge mirror drops the last badge and prints raw markdown to the reader |
| [#1901](https://github.com/Laticent/lattice/issues/1901) | high | engine | Two trailing paragraphs abort the coda harvest entirely — the Key Insight prints as unstyled body text |
| [#1075](https://github.com/Laticent/lattice/issues/1075) | medium | engine | cards-stack: per-card overflow is unguarded (slide-level probe misses card-level clip) |
| [#1346](https://github.com/Laticent/lattice/issues/1346) | medium | code | Wrapped code lines continue flush-left, which reads as a dedent in indentation-sensitive languages |
| [#1405](https://github.com/Laticent/lattice/issues/1405) | medium | chart | matrix-grid's ::after axis labels are never inspected for clipping — the bearer pass skips any host that owns text |
| [#1406](https://github.com/Laticent/lattice/issues/1406) | medium | engine | A relative `logo:` resolves against the OUTPUT directory, not the deck — so every render to an out-of-tree path silently drops the logo |
| [#1875](https://github.com/Laticent/lattice/issues/1875) | medium | engine | Declared layout capacity is coda-blind — seven layouts clip an in-budget slide once a key insight is added |
| [#1911](https://github.com/Laticent/lattice/issues/1911) | medium | engine | export(player): player-prune drops every runtime-injected selector, so the scene replay control ships with the wrong icon |
| [#1932](https://github.com/Laticent/lattice/issues/1932) | medium | engine | engine(masthead): `headline:` is a silent no-op on split-panel / split-compare, and a masthead with a bay centers beside the bay |
| [#2012](https://github.com/Laticent/lattice/issues/2012) | medium | engine | `maskCodeRegions` has three holes, and `--strip-notes` deletes code through them |
| [#2171](https://github.com/Laticent/lattice/issues/2171) | medium | chart | chart: a dropped label is still silent for an author — the census only covers decks we ship |
| [#2231](https://github.com/Laticent/lattice/issues/2231) | medium | chart | word-cloud: examples/seq-ramp-canvas-aware.md loses a word from the artifact at landscape and square |
| [#501](https://github.com/Laticent/lattice/issues/501) | low | inventory | fix(inventory): glossary range pill is stale on cover-paginate split pages |
| [#1316](https://github.com/Laticent/lattice/issues/1316) | low | chart | chart(glass): the canvas glass pane never paints — no committed deck uses the selector, and the fill doesn't render on first paint even when it matches |
| [#1683](https://github.com/Laticent/lattice/issues/1683) | low | engine | `size: 4:3` is in the Studio's size map but absent from the engine registry, so it silently falls back to hd |
| [#2004](https://github.com/Laticent/lattice/issues/2004) | — | engine | fix(list): an inline-code chip in a list card swallows the space beside it |
| [#2050](https://github.com/Laticent/lattice/issues/2050) | — | — | engine: a NESTED front-matter key named after a global directive is read as that directive |
| [#2052](https://github.com/Laticent/lattice/issues/2052) | — | — | engine: an unterminated RAWTEXT element swallows the next slide separator, silently merging two slides |
| [#2098](https://github.com/Laticent/lattice/issues/2098) | — | — | A `list`-layout bullet loses the space around any inline element — `the **class** is` renders as `theclassis` |

### D · a11y + contrast — 24

| # | label priority | area | title |
|---|---|---|---|
| [#1412](https://github.com/Laticent/lattice/issues/1412) | high | theming | a11y palettes fail categorical layer ① (mark vs canvas) on 9 of 12 slots in dark, unremarked |
| [#1861](https://github.com/Laticent/lattice/issues/1861) | high | theming | fix(theming): `--cat-N-fill` overrides are silently inert on every textured theme — the documented paint path is falsified |
| [#1862](https://github.com/Laticent/lattice/issues/1862) | high | theming | fix(a11y): the Mermaid pie legend swatch is never textured — texture makes the chart HARDER to read on the a11y palettes |
| [#1864](https://github.com/Laticent/lattice/issues/1864) | high | theming | theming: the categorical fill ramp is not separable — ΔE 0.013 to NORMAL vision, against a 0.15 floor |
| [#1865](https://github.com/Laticent/lattice/issues/1865) | high | theming | feat(theme): `derive.js` emits no `--cat-N-texture` — every AI / Studio / Fabricate theme silently loses the channel |
| [#1904](https://github.com/Laticent/lattice/issues/1904) | high | theming | `--chart-state-*` is in no CVD token group — a real protanopia collapse reached a green PR undetected |
| [#1905](https://github.com/Laticent/lattice/issues/1905) | high | theming | `--state-*-ink` is never scored as ink — six palettes carry latent sub-AA status inks |
| [#1927](https://github.com/Laticent/lattice/issues/1927) | high | website | studio(a11y): a parked preview iframe stays in the accessibility tree and tab order — Tab can land on a hidden "Live deck preview" |
| [#1410](https://github.com/Laticent/lattice/issues/1410) | medium | theming | `` renders dark-on-dark on the inverse title surface |
| [#1615](https://github.com/Laticent/lattice/issues/1615) | medium | theming | a11y palettes: a per-slide `dark` class defeats the forced light scheme, collapsing the categorical value ramp |
| [#1685](https://github.com/Laticent/lattice/issues/1685) | medium | theming | a11y palettes: `--chart-state-*` and `--diagram-critical` stay flat, so they now disagree with the status trio on a dark slide |
| [#1736](https://github.com/Laticent/lattice/issues/1736) | medium | theming | a11y palettes: nothing prevents `color-mode: dark` on a light-only theme, and the `:root:root` pin cannot reach it |
| [#1871](https://github.com/Laticent/lattice/issues/1871) | medium | infra | test(a11y): no gate reads the exported PDF's tag tree — the structure is emitted and never checked |
| [#1878](https://github.com/Laticent/lattice/issues/1878) | medium | theming | theme-surface-aa audits only the mode a palette PINS, so half of every palette has never been gated |
| [#1886](https://github.com/Laticent/lattice/issues/1886) | medium | chart | kanban: the lane tag is sub-AA on the PLAIN card too, not just the status-washed one |
| [#1933](https://github.com/Laticent/lattice/issues/1933) | medium | website | studio(a11y): the toolbar dial is three independent `aria-pressed` toggles, and its segments miss the touch-target floor at 820px |
| [#1937](https://github.com/Laticent/lattice/issues/1937) | medium | website | test(a11y): the website accessibility gate scans one palette of 18 and twelve routes of 88, and no transient surface at all |
| [#1954](https://github.com/Laticent/lattice/issues/1954) | medium | engine | anima(a11y): built scenes have no poster, so a reduced-motion viewer gets "Play the motion" over an empty stage |
| [#1975](https://github.com/Laticent/lattice/issues/1975) | medium | website | studio: a disabled Save explains itself to a pointer only — keyboard and screen readers get nothing |
| [#1847](https://github.com/Laticent/lattice/issues/1847) | low | theming | The status pill's border is 2.18:1 against the canvas on the a11y palettes' `mute` state — nothing models the border at all |
| [#2077](https://github.com/Laticent/lattice/issues/2077) | low | comparison | fix(comparison): inline code in a compare-prose corner tag is 1.16:1 — it keeps its own ink on the accent banner |
| [#1745](https://github.com/Laticent/lattice/issues/1745) | p3 | theme | contrast(sweep): 285 sub-AA text runs in the exported players — 148 genuinely low-contrast, 137 from the new 4.5:1 floor |
| [#2121](https://github.com/Laticent/lattice/issues/2121) | — | — | A math slide narrates its MathML token run and its raw TeX source |
| [#2228](https://github.com/Laticent/lattice/issues/2228) | — | — | split-panel watermark: the pagination number is canvas ink on an accent panel (1.01 contrast) |

### E · jank (layout stability) — 17

| # | label priority | area | title |
|---|---|---|---|
| [#1892](https://github.com/Laticent/lattice/issues/1892) | high | engine | Let a component decline the coda: anchor, math and the canvas family host a band that does not belong to their composition |
| [#581](https://github.com/Laticent/lattice/issues/581) | medium | evidence | kpi: default layout overflows 4 rows under a two-line headline (masthead-lift capacity regression) |
| [#1318](https://github.com/Laticent/lattice/issues/1318) | medium | evidence | kpi: measure adapt.capacity.tall — the declared hard: 5 was never validated against an unsplit portrait render |
| [#1549](https://github.com/Laticent/lattice/issues/1549) | medium | math | math: three variants centre the MASTHEAD with the body, dropping the title ~150px off the top berth |
| [#1919](https://github.com/Laticent/lattice/issues/1919) | medium | chart | quadrant: two charts on adjacent slides render at different sizes, because a lede taxes the stage |
| [#2153](https://github.com/Laticent/lattice/issues/2153) | medium | infra | check-jank measures a ROTATED anchor as its axis-aligned bounding box, so `stamp-ribbon` reports a confident COLLISION over ~145px of real clearance |
| [#2168](https://github.com/Laticent/lattice/issues/2168) | medium | infra | Nothing has ever measured whether the page number holds position — `section.form::after` is unreachable from a `_class` string |
| [#2172](https://github.com/Laticent/lattice/issues/2172) | medium | engine | split: a component cannot declare a density limit without also opting into being split |
| [#1375](https://github.com/Laticent/lattice/issues/1375) | low | diagram | A wrapped `Text:` row collides with its neighbours in a Mermaid requirement diagram |
| [#1429](https://github.com/Laticent/lattice/issues/1429) | low | engine | engine(overflow): move both marker registers to the bottom edge — and the measured reason the current tab metrics can't go there as-is |
| [#2154](https://github.com/Laticent/lattice/issues/2154) | low | infra | check-jank has no notion of a deliberately full-bleed anchor, so `stamp-mark` and `stamp-veil` always report COLLISION |
| [#2155](https://github.com/Laticent/lattice/issues/2155) | low | infra | check-jank cannot sweep `big-number` or `quote` on ANY axis — no heading to grow, no element builder |
| [#2224](https://github.com/Laticent/lattice/issues/2224) | low | engine | The page number's ink sits 4px higher on a root frame than on a sovereign one |
| [#2054](https://github.com/Laticent/lattice/issues/2054) | — | — | A split run's last body page shifts its content down, because the pointer's berth is not reserved |
| [#2182](https://github.com/Laticent/lattice/issues/2182) | — | — | studio(settings): the slide panel's first control sits 83px lower than the deck panel's |
| [#2190](https://github.com/Laticent/lattice/issues/2190) | — | — | A cold first paste paints raw Mermaid fence source for 13–27 painted frames before the diagram lands |
| [#2192](https://github.com/Laticent/lattice/issues/2192) | — | — | studio(library): the search field's Clear ✕ is off the edge of the panel header — unclickable at the docked width |

### F · blind instruments — 22

| # | label priority | area | title |
|---|---|---|---|
| [#1902](https://github.com/Laticent/lattice/issues/1902) | high | infra | Nothing gates who addresses .cell-coda — six CSS families drifted silently when the cell moved |
| [#1069](https://github.com/Laticent/lattice/issues/1069) | medium | infra | lint: proseWordCount counts fenced-code content as prose (wall-of-text false positive on decks with code/anima blocks) |
| [#1270](https://github.com/Laticent/lattice/issues/1270) | medium | infra | Differential single-slide-vs-full-deck invariant test — the GATE half is what remains |
| [#1364](https://github.com/Laticent/lattice/issues/1364) | medium | infra | check-lint-coverage writes probe files into lib/components/, breaking any render running at the same time |
| [#1550](https://github.com/Laticent/lattice/issues/1550) | medium | engine | `coverWindow`'s balanced-chunking fix is unguarded — reverting it passes 5773 tests |
| [#1601](https://github.com/Laticent/lattice/issues/1601) | medium | infra | export: nothing detects a player-only defect — the PDF is right, the webpage is wrong, and no gate compares them |
| [#1623](https://github.com/Laticent/lattice/issues/1623) | medium | infra | A theme color change stales committed artifacts three hops deep, and no per-PR gate sees it |
| [#1872](https://github.com/Laticent/lattice/issues/1872) | medium | infra | test(split): the split oracle's `verified` map is empty — 28 enrolled components pinned against drift, none attested as correct |
| [#1889](https://github.com/Laticent/lattice/issues/1889) | medium | infra | test(export): nothing detects a bounded wait added before capture — the deferral fix traded that coverage away |
| [#1936](https://github.com/Laticent/lattice/issues/1936) | medium | infra | test(e2e): `build:e2e` skips the post-build passes, so the e2e artifact does not carry the stylesheet hoist it is meant to prove |
| [#1939](https://github.com/Laticent/lattice/issues/1939) | medium | infra | bench(studio): the edit-paint ratchet guards half the loop — the heavy `write` regime is never captured |
| [#2134](https://github.com/Laticent/lattice/issues/2134) | medium | website | The E2E suite runs against a site `npm run build` would not ship — `build:e2e` skips two head-rewriting post-build steps |
| [#2160](https://github.com/Laticent/lattice/issues/2160) | medium | infra | check-family-tiers reports four live rules as `unexercised` — three of them could be deleted and the oracle would not move |
| [#1913](https://github.com/Laticent/lattice/issues/1913) | low | infra | spike: red-team the typed-glyph gate — a text matcher with hand-rolled escape decoding that nobody has attacked |
| [#1915](https://github.com/Laticent/lattice/issues/1915) | low | infra | test(nightly): prove the e2e-ai rolling-issue alarm end-to-end in Actions — it has only ever been run locally |
| [#1946](https://github.com/Laticent/lattice/issues/1946) | low | infra | test(e2e): nothing exercises the `defaultFontSize` axis — the `minfont` project sets `minimumFontSize` only |
| [#1949](https://github.com/Laticent/lattice/issues/1949) | low | infra | examples: other hand-drawn-diagram decks may carry the same golden staleness — the sweep was deliberately deferred and never taken |
| [#2010](https://github.com/Laticent/lattice/issues/2010) | — | — | test(infra): check-lint-coverage's JSON probe lands in lib/components/, so a concurrent render throws "Invalid manifest" |
| [#2041](https://github.com/Laticent/lattice/issues/2041) | — | — | Intermittent ENOENT: the lint-teeth probe races every tree walk that reads what it enumerated |
| [#2053](https://github.com/Laticent/lattice/issues/2053) | — | — | lens: CSS that selects a slide by position is unchecked by the cross-slide guard |
| [#2137](https://github.com/Laticent/lattice/issues/2137) | — | — | positionIsTrustworthy refuses any deck whose display math has a lone `=` or `-` continuation line |
| [#2187](https://github.com/Laticent/lattice/issues/2187) | — | — | The family-conformance pass cannot see an inert [data-orientation] rule — and there is one |

### G · verification debt (#23) — 15

| # | label priority | area | title |
|---|---|---|---|
| [#667](https://github.com/Laticent/lattice/issues/667) | high | website | Verify + fix debug-overlay touch reveal on real iOS Safari (PR #658) |
| [#1398](https://github.com/Laticent/lattice/issues/1398) | high | website | Verify narrated Present against real audio — every claim about how it SOUNDS is still unverified |
| [#1955](https://github.com/Laticent/lattice/issues/1955) | high | infra | verify(desktop): the SlideWright Tauri wrapper's embedding was never checked, and the routes it may embed have since been deleted |
| [#783](https://github.com/Laticent/lattice/issues/783) | medium | website | verify(playground): Explore surface on real iOS Safari — touch stepping, scroll snap, transcript disclosure |
| [#1216](https://github.com/Laticent/lattice/issues/1216) | medium | website | studio(mobile): three claims from #1198 owed verification on a real device — and one already measured false |
| [#1461](https://github.com/Laticent/lattice/issues/1461) | medium | website | Measure the LLM fit judge before building any recommender UI |
| [#1579](https://github.com/Laticent/lattice/issues/1579) | medium | engine | verify(export): the player's pinch guard is unverified on a real phone — and its latch path is unverifiable by CDP touch at all |
| [#1591](https://github.com/Laticent/lattice/issues/1591) | medium | website | verify(playground): the pre-paint boot seed on real iPadOS Safari — the coarse-pointer editor metrics especially |
| [#1617](https://github.com/Laticent/lattice/issues/1617) | medium | website | verify(studio): the crash report on real iOS Safari — discoverability, layout, and the missing memory trend |
| [#1893](https://github.com/Laticent/lattice/issues/1893) | medium | engine | Verification gaps left open by #1884 — surfaces this sandbox cannot reach |
| [#1921](https://github.com/Laticent/lattice/issues/1921) | medium | website | verify(studio): the Studio suppresses Safari's own pinch events — unverified, and if it works a low-vision iOS reader loses page zoom |
| [#1956](https://github.com/Laticent/lattice/issues/1956) | medium | infra | verify: the standing real-surface backlog — 91 UNVERIFIED claims across seven surfaces, what each needs and how to clear it |
| [#1097](https://github.com/Laticent/lattice/issues/1097) | low | website | Verify: does parseFinishReply handle the complete({json:true}) object contract? |
| [#1541](https://github.com/Laticent/lattice/issues/1541) | low | website | verify(studio): the presenter screen's new swipe + wheel are unverified on a real touch device |
| [#2189](https://github.com/Laticent/lattice/issues/2189) | — | — | The Studio crashed on a tablet while editing a diagram deck, and the cause is unreachable from the sandbox |

### H · flaky tests — 10

| # | label priority | area | title |
|---|---|---|---|
| [#1514](https://github.com/Laticent/lattice/issues/1514) | medium | infra | Two rotation/orientation Studio e2e specs fail intermittently on main (~1 per full matrix run) |
| [#1747](https://github.com/Laticent/lattice/issues/1747) | medium | infra | test(docs): PlaygroundApp's rAF loop can re-arm the shell-drop timer after unmount, failing docs-build with `window is not defined` |
| [#1748](https://github.com/Laticent/lattice/issues/1748) | medium | infra | e2e: playground-first-paint.spec.ts flakes across at least four different tests under parallel load |
| [#2032](https://github.com/Laticent/lattice/issues/2032) | medium | website | read-aloud's arming-window test flakes ~50% under full-suite load — likely a real race in resume() |
| [#2070](https://github.com/Laticent/lattice/issues/2070) | medium | website | studio-instant-shell: "a rect from another orientation is not replayed in portrait" fails ~75% of runs on main |
| [#2205](https://github.com/Laticent/lattice/issues/2205) | medium | engine | state-chart linearity arm is a wall-clock assertion in disguise, and false-trips ~0.4% of runs |
| [#1586](https://github.com/Laticent/lattice/issues/1586) | low | infra | test(e2e): nothing bounds the Studio's cold first-paint time — the only de facto tripwire is a fixture timeout |
| [#1607](https://github.com/Laticent/lattice/issues/1607) | low | infra | test(e2e): split.spec.ts's component-pick test flakes ~1 in 4 at workers=2 |
| [#1851](https://github.com/Laticent/lattice/issues/1851) | low | infra | e2e: playground-first-paint's cut-document width read takes an unguarded boundingBox() and can hit null on CI |
| [#2105](https://github.com/Laticent/lattice/issues/2105) | — | — | Flaky: `state-chart parsing stays linear` — one arm's ratio floor always engages, making it an absolute timing assertion on CI hardware |

### I · track: export + player — 20

| # | label priority | area | title |
|---|---|---|---|
| [#1513](https://github.com/Laticent/lattice/issues/1513) | high | engine | Narration silently skips most of a slide on the on-device rung: the produce deadline burns down inside the serial queue |
| [#1838](https://github.com/Laticent/lattice/issues/1838) | high | engine | narration: an inline `&lt;!-- caption: --&gt;` may bind to the wrong page across an autosplit |
| [#1853](https://github.com/Laticent/lattice/issues/1853) | high | engine | feat(export): no way to export a lens — reader views cannot leave the Studio as files |
| [#1854](https://github.com/Laticent/lattice/issues/1854) | high | engine | feat(export): the .html player carries no lenses — a shipped deck has one reader view |
| [#500](https://github.com/Laticent/lattice/issues/500) | medium | legal | feat(legal): obligation-matrix cover-paginate — a split that survives a wide matrix |
| [#757](https://github.com/Laticent/lattice/issues/757) | medium | website | feat(export): the self-contained .lattice .html player + full theme/asset envelope |
| [#1354](https://github.com/Laticent/lattice/issues/1354) | medium | engine | The Export-to-Marp bundle ships MIT + OFL third-party files with none of their license texts |
| [#1503](https://github.com/Laticent/lattice/issues/1503) | medium | engine | narration: finish the encoder integration — Gemini encodes on the main thread, clips gain untrimmed codec delay, LAME notice unlinked |
| [#1509](https://github.com/Laticent/lattice/issues/1509) | medium | engine | narration: ask the provider for compressed audio — four response_format values have never been tried |
| [#1511](https://github.com/Laticent/lattice/issues/1511) | medium | engine | narration: compress for export off the main thread — worker pool first, idle precompression second |
| [#1558](https://github.com/Laticent/lattice/issues/1558) | medium | engine | export player: a pinch turns the slide, and the deck cannot be zoomed at all |
| [#1578](https://github.com/Laticent/lattice/issues/1578) | medium | engine | export(player): the exported .html player still has no zoom — a pinch is now inert rather than wrong |
| [#1585](https://github.com/Laticent/lattice/issues/1585) | medium | engine | export(player): a resting thumb silently disables swipe navigation — the pinch guard's disclosed cost, unmitigated |
| [#1602](https://github.com/Laticent/lattice/issues/1602) | medium | engine | export(player): the no-JS floor's ladder is width-only, so a tall deck's slide is 2.2× the screen height |
| [#1935](https://github.com/Laticent/lattice/issues/1935) | medium | engine | narration: a shared deck has no voice — `share-export` writes captions only, and the ladder floors a keyless recipient to silent |
| [#1492](https://github.com/Laticent/lattice/issues/1492) | low | website | export(narration): a per-export audio quality control, alongside the workspace one |
| [#1502](https://github.com/Laticent/lattice/issues/1502) | low | engine | core: two different exported functions named buildReadAlong in lib/core/ |
| [#1516](https://github.com/Laticent/lattice/issues/1516) | low | engine | Two narrow narration hazards found by red team but not reproduced: the warm drop-channel's doomed promise, and a whitespace-only cue |
| [#1603](https://github.com/Laticent/lattice/issues/1603) | low | engine | export(player): the player re-asserts a slide size the document already states — can three of the six sizing rules be deleted? |
| [#1713](https://github.com/Laticent/lattice/issues/1713) | low | engine | feat(export): write a slide background into PPTX so a rounded deck can keep its corner |

### J · track: Studio + website UX — 51

| # | label priority | area | title |
|---|---|---|---|
| [#515](https://github.com/Laticent/lattice/issues/515) | high | website | feat(playground): Google Drive bring-your-own-storage — Connect / Save / Open |
| [#1295](https://github.com/Laticent/lattice/issues/1295) | high | website | [Bug] Present Screen Rework |
| [#1621](https://github.com/Laticent/lattice/issues/1621) | high | website | fix(studio): the crash report is invisible on the browser's own post-crash reload — three designs withdrawn |
| [#1876](https://github.com/Laticent/lattice/issues/1876) | high | website | studio: the Coach, Chat, Library and Views panels are unreachable between ~1024px and ~1180px |
| [#414](https://github.com/Laticent/lattice/issues/414) | medium | website | refactor(website): consolidate the per-surface theme/palette dropdowns onto one shared control |
| [#610](https://github.com/Laticent/lattice/issues/610) | medium | website | Studio AI track (G6 → G7): model backbone, theme/component chat, voice — key-gated, budget-guarded |
| [#648](https://github.com/Laticent/lattice/issues/648) | medium | website | Studio-AI: render-in-the-loop harness — give the generator eyes so "10/10" becomes a measured target, not a wish |
| [#1087](https://github.com/Laticent/lattice/issues/1087) | medium | website | Motion faculty duplicates .scene-control CSS from scene.styles.css (drift trap) |
| [#1241](https://github.com/Laticent/lattice/issues/1241) | medium | website | ui(dropdown-menu): the only Radix portal wrapper that doesn't carry `lx-ui` — its rows sit outside the scoped reset |
| [#1247](https://github.com/Laticent/lattice/issues/1247) | medium | website | pwa: the engine/KaTeX ` |
| [#1257](https://github.com/Laticent/lattice/issues/1257) | medium | website | studio(front-matter): the lexicon: / acronyms: writers still rebuild the whole block |
| [#1266](https://github.com/Laticent/lattice/issues/1266) | medium | website | studio(panel): one settings row, so the keyboard pin is a property of the row and not of one file |
| [#1284](https://github.com/Laticent/lattice/issues/1284) | medium | website | [Bug] Auto complete is not smart |
| [#1431](https://github.com/Laticent/lattice/issues/1431) | medium | website | Component-generator prompt still offers --cat-N-mark as the categorical text color |
| [#1464](https://github.com/Laticent/lattice/issues/1464) | medium | website | [Bug] The search confidence meter is unreadable and needs a redesign |
| [#1494](https://github.com/Laticent/lattice/issues/1494) | medium | website | studio(shell): move the shell CSS out of JS template literals — a backtick in a comment breaks the build 700 lines away |
| [#1517](https://github.com/Laticent/lattice/issues/1517) | medium | website | [Bug] Closing the add-slide gallery leaves ~70 documents (~380MB) resident |
| [#1534](https://github.com/Laticent/lattice/issues/1534) | medium | website | Spike: let the pre-paint skeletons wrap the real components instead of hand-mirroring them |
| [#1569](https://github.com/Laticent/lattice/issues/1569) | medium | website | lint: flag a `---`-delimited YAML block below offset 0 — the stray front matter that costs a slide |
| [#1570](https://github.com/Laticent/lattice/issues/1570) | medium | website | studio: `splitSlides` is blind to HEADING splits, so the caller's slide count disagrees with the engine's |
| [#1634](https://github.com/Laticent/lattice/issues/1634) | medium | website | crash sentinel: onVisibility persists without a catchUpOnWipe guard |
| [#1678](https://github.com/Laticent/lattice/issues/1678) | medium | website | [Feat] Saved motion scenes have no Library presence — and imported ones are silently discarded |
| [#1716](https://github.com/Laticent/lattice/issues/1716) | medium | website | fix(studio): tell the author when an export squares a `corners: rounded` deck |
| [#1764](https://github.com/Laticent/lattice/issues/1764) | medium | website | refactor(playground): fold deck-config.js onto the Studio's setting rows — two of the four drifting front-matter lists collapse into one |
| [#1790](https://github.com/Laticent/lattice/issues/1790) | medium | website | ai(authoring): a model must not reach for `style:` — the prompts never say so, and nothing refuses it |
| [#1841](https://github.com/Laticent/lattice/issues/1841) | medium | website | [Feat] Hand-edit a theme's CSS and a finish's recipe — isomorphic where it round-trips, validated where it can't |
| [#1906](https://github.com/Laticent/lattice/issues/1906) | medium | website | Carbone is now default-LIGHT and no web surface has ever been opened on that face |
| [#1929](https://github.com/Laticent/lattice/issues/1929) | medium | website | studio: the theme/palette picker is unreachable at ~820px, so the QUALITY BAR's three-width evidence cannot be completed for it |
| [#1930](https://github.com/Laticent/lattice/issues/1930) | medium | website | studio(perf): the boot path re-splits every deck and runs three O(n) localStorage scans — the follow-ups the storage overlay made measurable |
| [#1938](https://github.com/Laticent/lattice/issues/1938) | medium | website | studio(library): the workspace backup carries no asset version history, and making it true is a workspace FORMAT change |
| [#1943](https://github.com/Laticent/lattice/issues/1943) | medium | website | site(landing): the Studio promotion shipped without its competition's critiques — 27 findings and the whole judging half were never applied |
| [#1944](https://github.com/Laticent/lattice/issues/1944) | medium | website | studio(header): the tablet header still overflows below ~787px — curing it means an icon-only posture dial |
| [#1951](https://github.com/Laticent/lattice/issues/1951) | medium | website | studio(coach/chat): three logged #18 follow-ups from the Coach + Chat migration were never ticketed |
| [#297](https://github.com/Laticent/lattice/issues/297) | low | website | feat(website): build a visual component catalog (thumbnail picker) |
| [#634](https://github.com/Laticent/lattice/issues/634) | low | website | AI component-gen: a status/RAG matrix should route to obligation-matrix, not emit inert [x] markers (#610) |
| [#797](https://github.com/Laticent/lattice/issues/797) | low | website | 28 of 30 gated showcase WebPs have no on-site consumer — re-point a surface at them or shrink the flags |
| [#964](https://github.com/Laticent/lattice/issues/964) | low | website | spike(lente): content-aware lens suggestions via wink-nlp (deterministic, no LLM) |
| [#982](https://github.com/Laticent/lattice/issues/982) | low | website | Reintroduce AI voice-rewrite (Technical/Narrative) behind a proper diff gate (§9.5 / R4) |
| [#983](https://github.com/Laticent/lattice/issues/983) | low | website | Lens suggester: de-jargon the per-slide rationale strings (reader terms, not the function/form taxonomy) |
| [#1077](https://github.com/Laticent/lattice/issues/1077) | low | website | anima: live scenes on a multi-scene DeckPreview page don't pause when scrolled off-screen |
| [#1162](https://github.com/Laticent/lattice/issues/1162) | low | website | Studio preview: keep the live iframe warm to avoid re-render cost on remount |
| [#1231](https://github.com/Laticent/lattice/issues/1231) | low | website | studio: make panels URL-addressable, and retire the synthetic back-guard entry |
| [#1267](https://github.com/Laticent/lattice/issues/1267) | low | website | studio(panel): cover the free-form panels' inputs, then gate it so a new one can't ship under the keyboard |
| [#1436](https://github.com/Laticent/lattice/issues/1436) | low | website | [Idea] Prefetch all assets after the homepage loads |
| [#1539](https://github.com/Laticent/lattice/issues/1539) | low | website | SLICE_CACHE_MAX (24) sits below PREVIEW_BUDGET (32), so a long overview traversal outruns the cache that makes recycling cheap |
| [#1765](https://github.com/Laticent/lattice/issues/1765) | low | website | spike(studio): design a control for the per-slide narrative grammar — _focus / _focusStyle / _focusSteps / _build have no UI at all |
| [#1995](https://github.com/Laticent/lattice/issues/1995) | low | website | Studio: an invalid theme name disables Save with no message |
| [#2087](https://github.com/Laticent/lattice/issues/2087) | low | website | fix(studio): getFrontMatter doesn't strip a trailing YAML comment, so three Inspector toggles show the wrong state |
| [#2181](https://github.com/Laticent/lattice/issues/2181) | — | — | e2e(studio-fixture): no mobile route into the Inspector — every settings spec dies in beforeEach at phone width |
| [#2191](https://github.com/Laticent/lattice/issues/2191) | — | — | Typing on a diagram deck peaks at 96 documents, and nothing identifies what they are |
| [#2203](https://github.com/Laticent/lattice/issues/2203) | — | — | Studio settings panel scrolls sideways in the General section — the Language trigger won't shrink |

### K · track: engine + forms contract — 37

| # | label priority | area | title |
|---|---|---|---|
| [#287](https://github.com/Laticent/lattice/issues/287) | high | engine | refactor(engine): LPM Phase 1 — manifest `render` block + `transformSection` adapter; migrate the chart kernels |
| [#506](https://github.com/Laticent/lattice/issues/506) | high | engine | feat(runtime): runtime auto-split (Option B) via eventual consistency |
| [#1442](https://github.com/Laticent/lattice/issues/1442) | high | engine | Adjacency-preserving equivalence harness + structural gating for the preview render |
| [#286](https://github.com/Laticent/lattice/issues/286) | medium | engine | refactor(css): namespace variant classes that collide with component names |
| [#288](https://github.com/Laticent/lattice/issues/288) | medium | engine | feat(engine): implement the front-matter deck-config contract (vars, object background/logo, fonts, metadata, sizes) |
| [#289](https://github.com/Laticent/lattice/issues/289) | medium | engine | feat(engine): implement the `$`-sigil inline-code variable interpolation grammar |
| [#380](https://github.com/Laticent/lattice/issues/380) | medium | engine | Narrative step model — assemble the slide as you go (implementation) |
| [#511](https://github.com/Laticent/lattice/issues/511) | medium | engine | refactor(engine): consolidate runtime + emulator — rename the CLI off "emulator", unify the Mermaid var-map |
| [#554](https://github.com/Laticent/lattice/issues/554) | medium | engine | feat(forms): N-up split Frame — compose multiple components in a grid (generalize split-panel) |
| [#1193](https://github.com/Laticent/lattice/issues/1193) | medium | engine | Component manifests have drifted from §0c's owner-resolved split classifications (5 undeclared, 2 stale, 2 off-policy) |
| [#1221](https://github.com/Laticent/lattice/issues/1221) | medium | engine | spike(engine): decorator-stamped intent — name the default variant so recipes are opt-in, not opt-out |
| [#1319](https://github.com/Laticent/lattice/issues/1319) | medium | evidence | kpi: wrap the supports so the row count leaves CSS — retire the :has(nth-child) thresholds |
| [#1333](https://github.com/Laticent/lattice/issues/1333) | medium | engine | Preview route decision: the running-global probe over-matches, and its scan is quadratic on author input |
| [#1339](https://github.com/Laticent/lattice/issues/1339) | medium | engine | Consolidate the authoring vocabulary — four enumerations already exist and disagree |
| [#1522](https://github.com/Laticent/lattice/issues/1522) | medium | components | Classify every component's variants into variantAxes (36 components, 172 tokens) |
| [#1542](https://github.com/Laticent/lattice/issues/1542) | medium | engine | Read the divider flag off the engine's token stream — `blankCode` is the last hand-written approximation on the preview path |
| [#1749](https://github.com/Laticent/lattice/issues/1749) | medium | engine | test(integration): move deck-class-fm / deck-mode-fm / deck-logo to unit — lib/engine already produces what they assert, no browser needed |
| [#1754](https://github.com/Laticent/lattice/issues/1754) | medium | engine | design: one guarded assembleDocument() chokepoint, instead of a fifth text-matching gate |
| [#1869](https://github.com/Laticent/lattice/issues/1869) | medium | engine | decision: retire the live-DOM mirror render path, or pay for it properly |
| [#1890](https://github.com/Laticent/lattice/issues/1890) | medium | engine | review-core: catastrophic regex backtracking in CLASS_COMMENT_G freezes the Studio on an unterminated class directive |
| [#1909](https://github.com/Laticent/lattice/issues/1909) | medium | engine | glyphs: two engine-JS sites still TYPE a shape, so HARD RULE #29's first sentence is an objective, not a description |
| [#1934](https://github.com/Laticent/lattice/issues/1934) | medium | engine | engine(cq): the container-query self-reference survives one tier down — 50 computed values on the gallery still track the host viewport |
| [#2225](https://github.com/Laticent/lattice/issues/2225) | medium | engine | `.tile-watermark` keys its ink on the `.dark` CLASS, not the resolved ground — the bug #2196 fixed for the deck logo |
| [#527](https://github.com/Laticent/lattice/issues/527) | low | — | explore: alignment as a universal modifier (vertical top/center for tables, lists, etc.) |
| [#1138](https://github.com/Laticent/lattice/issues/1138) | low | engine | Adaptive viewport fill — fluid viewer follow-ups (P2 edge cap) |
| [#1355](https://github.com/Laticent/lattice/issues/1355) | low | engine | `--measure-body` is 36em because narrower clips shipped decks, not because 36em is right |
| [#1368](https://github.com/Laticent/lattice/issues/1368) | low | engine | Four consumers read `data-class` as the slide's class identity, which it structurally cannot be |
| [#1395](https://github.com/Laticent/lattice/issues/1395) | low | engine | Spike: the published package surface sits outside every line-ending boundary — how far does "no reader has to remember" actually reach? |
| [#1396](https://github.com/Laticent/lattice/issues/1396) | low | engine | Spike: can a .lattice restore misplace its comments now that ingest normalization changes a lone-CR deck's slide count? |
| [#1407](https://github.com/Laticent/lattice/issues/1407) | low | code | `section pre.hljs` / `section code.hljs` are dead rules — no render path emits the `hljs` class |
| [#1611](https://github.com/Laticent/lattice/issues/1611) | low | legal | authority-chain: the 8n tier cycle only defines 4 residues, so tier 5+ loses its hue |
| [#1903](https://github.com/Laticent/lattice/issues/1903) | low | engine | coda.dock cannot express a per-variant structure — video and scene each compute two different shapes |
| [#1940](https://github.com/Laticent/lattice/issues/1940) | low | engine | forms(rule): the spectrum bar is still a `border-top` suppressed ad hoc in seven places, and the `rule` Tile manifest describes a Tile that does not exist |
| [#1941](https://github.com/Laticent/lattice/issues/1941) | low | engine | theme: the `@theme` scan is bounded at 4096 characters — a narrow, unverified behavior change to a published API |
| [#1948](https://github.com/Laticent/lattice/issues/1948) | low | engine | anima(svg): a `reveal`/`slide`-only path is still incidentally stroke-drawn by Vivus's aggregate scalar |
| [#2159](https://github.com/Laticent/lattice/issues/2159) | low | engine | `list-tabular`'s pill rule is the only genuine gallery gap among the `unexercised` family rules |
| [#2034](https://github.com/Laticent/lattice/issues/2034) | — | — | Directive scanning is not CommonMark inside a container: unbounded marker indent, and a fence behind a `&gt;` is invisible |

### L · track: charts + diagrams + theming — 23

| # | label priority | area | title |
|---|---|---|---|
| [#1213](https://github.com/Laticent/lattice/issues/1213) | high | chart | HARD RULE #4: human-readable chart text is sized in raw cqi with no floor — ~9px labels at portrait |
| [#1640](https://github.com/Laticent/lattice/issues/1640) | high | theming | Unblock the export-path cascade fix: flat-token dark companions first, plus three defects logged off-path by #1632 |
| [#299](https://github.com/Laticent/lattice/issues/299) | medium | diagram | refactor(diagram): give function-plot its own `lib/integrations/function-plot/` home + honest renderPaths |
| [#476](https://github.com/Laticent/lattice/issues/476) | medium | chart | chart(kanban): per-card detail reveal (Tier-2, on the HTML-mark path) |
| [#1459](https://github.com/Laticent/lattice/issues/1459) | medium | theming | The theme token contract is hand-maintained in four places, has already drifted 95 vs 91, and `carta` is checked by none of them |
| [#1468](https://github.com/Laticent/lattice/issues/1468) | medium | theming | Code blocks outside a `.code` slide get no surface treatment — and 5 palettes had a code-surface preference that never rendered |
| [#1536](https://github.com/Laticent/lattice/issues/1536) | medium | theming | The chart categorical cycle has no curated ink — charts still run the live color-mix the --cat-* tier retired |
| [#1562](https://github.com/Laticent/lattice/issues/1562) | medium | theming | A generated theme has no texture channel — `--cat-N-texture` can't join REQUIRED_TOKENS until a set can be derived per theme |
| [#1574](https://github.com/Laticent/lattice/issues/1574) | medium | theming | theming: the chart categorical cycle needs an ON-FILL ink — text on a tint has no curated value |
| [#1633](https://github.com/Laticent/lattice/issues/1633) | medium | chart | chart(state-chart): the layout installer rebuilds on every content pass, so the deck never settles |
| [#1866](https://github.com/Laticent/lattice/issues/1866) | medium | theming | feat(authoring): give categorical texture an author-visible switch — today there is no clean way to turn it on OR off |
| [#1953](https://github.com/Laticent/lattice/issues/1953) | medium | theming | theme(derive): `validateEssentials` accepts any hex for the light-surface `bg`/`bgAlt` slots — a dark `bg` derives an out-of-contract palette |
| [#1994](https://github.com/Laticent/lattice/issues/1994) | medium | theming | engine(themes): a Studio theme named after a built-in palette replaces it in the store, and the render memo keys on that name |
| [#180](https://github.com/Laticent/lattice/issues/180) | low | chart | epic(chart): resolution-independent charts — cqi-first, kill fixed-px, for any-format / 10K export |
| [#283](https://github.com/Laticent/lattice/issues/283) | low | engine | refactor(css): audit and reduce `!important` (~490 repo-wide) |
| [#477](https://github.com/Laticent/lattice/issues/477) | low | chart | chart(state-chart): tune the `tb` reveal-lift magnitude |
| [#867](https://github.com/Laticent/lattice/issues/867) | low | chart | chart(state-chart): consolidate the third private list-walker variant onto the shared kernel |
| [#1061](https://github.com/Laticent/lattice/issues/1061) | low | engine | anima: design a fit-for-purpose animation component (lead vs supporting actor) |
| [#1460](https://github.com/Laticent/lattice/issues/1460) | low | theming | `tools/contrast-audit.js:53` cannot see `--hljs-built_in` — its token regex excludes underscores |
| [#1908](https://github.com/Laticent/lattice/issues/1908) | low | theming | `themes/palette-audit.md` still presents carbone as a dark-only palette |
| [#1925](https://github.com/Laticent/lattice/issues/1925) | low | theming | The print band's `--seq-pole-*` pin is inert on the export path — latent since #1891 removed the only literal poles |
| [#1947](https://github.com/Laticent/lattice/issues/1947) | low | chart | anima: quadrant / radar / map share the fixed gradient plumbing but were never verified on their own surfaces |
| [#1973](https://github.com/Laticent/lattice/issues/1973) | — | diagram | Expose categorical tokens as Mermaid-consumable node classes, so `:::` can pin an entity's color |

### M · docs honesty — 24

| # | label priority | area | title |
|---|---|---|---|
| [#305](https://github.com/Laticent/lattice/issues/305) | medium | docs | docs: dedupe the two doc-index tables (CLAUDE.md vs skill.md drift) |
| [#307](https://github.com/Laticent/lattice/issues/307) | medium | docs | docs: prune/flip the treatments-rename ADR (shipped; still "implementation-ready") |
| [#308](https://github.com/Laticent/lattice/issues/308) | medium | engine | docs: resolve the P4 regression-gate ADR status (pivot shipped; still strikethrough "pre-code") |
| [#1784](https://github.com/Laticent/lattice/issues/1784) | medium | docs | docs(catalog): `capacity` is absent from 40 of 61 components, and AGENTS.md presents it as the primary authoring defense |
| [#1794](https://github.com/Laticent/lattice/issues/1794) | medium | docs | docs(public): two owner-only surfaces contradict the engine — v1.0.0 Release body and repo description |
| [#1867](https://github.com/Laticent/lattice/issues/1867) | medium | docs | docs: `design/skills/lens.md` still carries the security wording retired on 2026-07-18 |
| [#1914](https://github.com/Laticent/lattice/issues/1914) | medium | docs | docs(gotchas): prose in a deck fixture ships — an HTML comment becomes a speaker note, a PDF annotation, and lint narration |
| [#1945](https://github.com/Laticent/lattice/issues/1945) | medium | docs | docs(components): 54 of 59 components never got the three agent-contract fields — the pilot's second slice was never taken |
| [#1966](https://github.com/Laticent/lattice/issues/1966) | medium | docs | spike(exemplars): the style judges are calibrated on a corpus nobody has validated — break the circularity before deriving more |
| [#2033](https://github.com/Laticent/lattice/issues/2033) | medium | docs | docs(read-aloud): the voice-arming test races a real dynamic import against the fake clock |
| [#279](https://github.com/Laticent/lattice/issues/279) | low | diagram | docs: reconcile Mermaid diagram-type count (README "25" vs gallery "26") |
| [#280](https://github.com/Laticent/lattice/issues/280) | low | docs | docs: fix phantom `--hljs-name`/`--hljs-meta` token rows in highlight-js.docs.md |
| [#294](https://github.com/Laticent/lattice/issues/294) | low | infra | docs: document `pixel-check` in development.md and decide on a hook |
| [#309](https://github.com/Laticent/lattice/issues/309) | low | theming | docs: pick a single canonical home for the Mermaid contract (currently in 3 docs) |
| [#310](https://github.com/Laticent/lattice/issues/310) | low | docs | docs: drop/re-anchor the legacy "Part 1–11" doc numbering |
| [#519](https://github.com/Laticent/lattice/issues/519) | low | docs | examples: ship the four portrait demo decks + PDFs for the retired landscape locks |
| [#1234](https://github.com/Laticent/lattice/issues/1234) | low | docs | Adaptive ADR audit — the gaps left open by #1220 |
| [#1366](https://github.com/Laticent/lattice/issues/1366) | low | docs | The ungated-changelog-copy hole is closed by #1593 + #1777 — all that is left is whether to sweep 30 British spellings in a now-frozen archive |
| [#1413](https://github.com/Laticent/lattice/issues/1413) | low | docs | premise's "common mistake" contradicts its own slots table and every shipped example |
| [#1900](https://github.com/Laticent/lattice/issues/1900) | low | docs | gotchas: `studio-playground.md` is now the largest topic file (18.7k tokens) — split it at the seam the refile note already named |
| [#1910](https://github.com/Laticent/lattice/issues/1910) | low | docs | Decision note 2026-08-25 §9.5 cites the wrong rule for why two gate gaps were left unfixed |
| [#1950](https://github.com/Laticent/lattice/issues/1950) | low | docs | docs(counts): four dated "53 component" measurements were left alone — whether L3 covers 61/61 today is an unrun measurement |
| [#2086](https://github.com/Laticent/lattice/issues/2086) | low | infra | kit(agent): the same component prose ships in four cuts — decide which of them earns its place |
| [#2146](https://github.com/Laticent/lattice/issues/2146) | low | engine | Six surfaces still say the masthead-bay holds the logo Tile |

### N · process + queue hygiene — 29

| # | label priority | area | title |
|---|---|---|---|
| [#1437](https://github.com/Laticent/lattice/issues/1437) | critical | infra | Configure Release Pipeline |
| [#1252](https://github.com/Laticent/lattice/issues/1252) | high | infra | spike: eleven agent errors in one session cluster into three shapes — find the procedural fix, not more reviewers |
| [#1791](https://github.com/Laticent/lattice/issues/1791) | high | infra | ai(eval): the four AI faculties are only tested against fake replies — stress-test theme/component/finish/motion across Haiku, Sonnet and Opus |
| [#1912](https://github.com/Laticent/lattice/issues/1912) | high | infra | infra(workflow): `enable_pr_auto_merge` silently arms a MERGE commit, which the repo forbids — document the trap and the verify step |
| [#1928](https://github.com/Laticent/lattice/issues/1928) | high | infra | infra(ci): decide the CodeQL rollout — a required check that never reports on the merge group would deadlock the queue |
| [#290](https://github.com/Laticent/lattice/issues/290) | medium | infra | test(infra): add a three-renderer transform-parity unit test |
| [#292](https://github.com/Laticent/lattice/issues/292) | medium | infra | infra: adopt a per-feature deck archive policy (`_meta: archived` + examples/MANIFEST.md) |
| [#293](https://github.com/Laticent/lattice/issues/293) | medium | infra | infra: automate the graduation-commit trigger on PR merge |
| [#596](https://github.com/Laticent/lattice/issues/596) | medium | infra | Performance gating by metric class + E2E re-tier (PR B) |
| [#668](https://github.com/Laticent/lattice/issues/668) | medium | infra | Add a real-surface Playwright smoke against the built Playground in CI |
| [#1308](https://github.com/Laticent/lattice/issues/1308) | medium | infra | Make the slice/deck sweep measure what ships — then seedRenderIds, then reconcile the two slide splitters |
| [#1537](https://github.com/Laticent/lattice/issues/1537) | medium | infra | SessionStart hook skips the docs install on a warm container, so docs deps go stale |
| [#1855](https://github.com/Laticent/lattice/issues/1855) | medium | infra | `bench:check`: no browser tier sets `won`, so a &gt;50% export/print/CLI win reports "within variance band" |
| [#1856](https://github.com/Laticent/lattice/issues/1856) | medium | infra | Decide the `bench:check` comparability contract — the calibration probe is noisier than, and moves against, what it normalizes |
| [#1874](https://github.com/Laticent/lattice/issues/1874) | medium | infra | feat(orchestration): add the ADDITIVE TRIO — seam census, blast radius, contradiction resolution — as roster agents alongside the adversarial trio |
| [#1899](https://github.com/Laticent/lattice/issues/1899) | medium | infra | spike: nothing keeps the gotchas taxonomy from rotting again — titles are the only routing signal and the generator only checks that a row exists |
| [#1907](https://github.com/Laticent/lattice/issues/1907) | medium | infra | `palette:bless` destroys hand-written prose inside the map it rewrites |
| [#2082](https://github.com/Laticent/lattice/issues/2082) | medium | infra | kit(marp): rework the Marp kit once @laticent/lattice is on npm |
| [#2213](https://github.com/Laticent/lattice/issues/2213) | medium | infra | Finish the agent-workflow hardening swimlane: sweep the 218 grandfathered cards, and three gaps the intake bar exposed |
| [#800](https://github.com/Laticent/lattice/issues/800) | low | infra | Promote the @smoke e2e subset to a PR-blocking gate (after a nightly green streak) |
| [#970](https://github.com/Laticent/lattice/issues/970) | low | infra | chore(cleanup): delete 3 superseded old-browser branches |
| [#1369](https://github.com/Laticent/lattice/issues/1369) | low | infra | 15 test files still hand-roll a Chromium resolver, and one still shells out to a hard-coded /root path |
| [#1767](https://github.com/Laticent/lattice/issues/1767) | low | infra | golden-diff drops its montage artifact on large diffs, and blames a missing ImageMagick that is installed |
| [#1898](https://github.com/Laticent/lattice/issues/1898) | low | infra | spike: the pick surface has never been tested on briefs its author did not write — and the `see also` fix cannot be verified on the briefs that produced it |
| [#1922](https://github.com/Laticent/lattice/issues/1922) | low | infra | infra(git): 112 stale claude/* branches on the remote make the branch list unnavigable |
| [#1924](https://github.com/Laticent/lattice/issues/1924) | low | infra | infra(build): rebuilding a gallery PDF invalidates the showcase WebP, and nothing chains or checks it locally |
| [#2025](https://github.com/Laticent/lattice/issues/2025) | low | infra | Decide whether the Studio export e2e belongs on the per-PR gate |
| [#2096](https://github.com/Laticent/lattice/issues/2096) | — | — | lint: unused `CHROME` import in docs/e2e/studio-shell-parity.spec.ts |
| [#2099](https://github.com/Laticent/lattice/issues/2099) | — | — | A 3.1 MB `mermaid-v11.min.js` is committed at the repository root |
