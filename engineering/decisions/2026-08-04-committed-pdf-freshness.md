---
status: shipped
summary: 185 committed PDFs — every `examples/` deck, all 45 exemplars, the design galleries, the CI baseline deck, the palette audit — had a producer and a named watcher, and the watcher did not read them. `#1279` closed OWNERSHIP deliberately without closing FRESHNESS, and the `watcher:` those rules named was `overflow:check`, which re-renders the markdown to a scratch dir and deletes it: it never opens the committed artifact. So an engine change staleified all of them silently. The issue proposed three designs — an input-hash sidecar, a scheduled re-render PR, or declaring them unfresh-by-design — and the answer is a fourth that dominates all three: THE WATCHER ALREADY EXISTS. `regression-gate.mjs` renders a deck fresh and pixel-diffs it against the committed golden; its corpus simply stopped at `lib/`. Widening it needed no new tool, no new committed artifact class, and no new gate concept (HARD RULE #15). The corpus is DERIVED from `git ls-files` rather than hand-listed, because a hand-kept set of artifacts is silent by default — the lesson #1279 itself records. Measured before deciding: the staleness is real and visible, not bookkeeping — `examples/pricing.pdf` p2 differs from a fresh render by 8.9% of the page, the committed artifact still carrying a larger body type and a narrower measure than the engine now produces. Cost is ~11s per deck, ~35 minutes for the scope on 4 cores, which puts it in the same on-demand tier as `overflow:check` rather than in CI, for the reason `ci.yml` already documents: Skia's CPU-dispatched rasterization is not bit-identical across GitHub's heterogeneous runners.
---

# Committed PDFs get the watcher they were already credited with

**Date:** 2026-08-04
**Closes:** #1379
**Swimlane:** committed-artifact ownership (`#1279`, `#1365`)

---

## The gap

`#1279` asserted a class: every PDF in `git ls-files` is claimed by a `PDF_OWNERSHIP`
rule naming how it is **produced** and what **watches** it. That was the right general
fix for "an artifact nothing watches", and it was explicit that it closed ownership and
not freshness.

The trouble is what went in the `watcher:` column. Five rules — the `examples/` decks
and the token-contrast set, the 45 worked exemplars, the design galleries, the CI
baseline deck — named `overflow:check`. That tool renders each deck's **markdown** into
a scratch directory, scrapes the emulator's console report, and unlinks the PDF it just
made. It never opens the committed artifact. The palette audit named `watcher: null`.

So the column said these files were watched, and nothing read their bytes. Three
mechanisms sound like they would cover it and none does:

- the pre-commit `pdf-rebuild` hook fires only when **that deck's markdown** is staged,
  and an engine change touches no deck markdown;
- `npm run regress` compares committed goldens against fresh renders — for the ~75
  galleries under `lib/`, and nothing else;
- `overflow:check` renders everything and compares clip **counts** against a ratchet.

## Measured first, because the design turned on it

The issue's stated symptom was that #1300's widened probes put a "Content clipped" pill
into fresh renders that committed PDFs lack. **That does not reproduce**:
`examples/overflow-fix-me.md` (three clipping slides in the ratchet) pixel-matches its
committed PDF exactly, as do `gallery-jargon` and `state-chart`. Those decks' markdown
was staged in the PR that changed the probes, so the hook rebuilt them. The acute case
was already covered.

The chronic case is real, and it is the one nobody would notice. `examples/pricing.pdf`
p2 differs from a fresh render by **8.9% of the page**: the committed artifact still
renders body copy at a larger size and a narrower measure than the engine now produces,
so the same three sentences occupy four lines instead of three and every element below
them sits lower. Nothing about that deck changed. The engine's typography moved
underneath it, months of commits ago, and no gate could say so.

That measurement is what ruled out the issue's third candidate ("declare them
unfresh-by-design"): the drift is visible to a reader, not a timestamp artifact.

## The decision: the watcher already exists

The issue offered three designs. All three build something new:

| candidate | what it costs |
|---|---|
| input-hash sidecar beside each PDF | a **new committed artifact class**, which then needs its own freshness story and its own ratchet; exact about staleness, silent about whether the staleness is visible |
| scheduled re-render opening a `chore/` PR | a workflow that commits binary artifacts, against HARD RULE #16's merge-train discipline |
| declare them unfresh-by-design | reduces the guarantee — and the measurement above says the thing being given up is real |

The fourth option is that **none of that is needed**. `regression-gate.mjs` already
answers exactly this question — "does the committed PDF still match a fresh render?" —
for the gallery goldens. Its corpus walk was rooted at `lib/`. Widening it to the other
185 artifacts adds no new tool, no new artifact class, and no new concept
(HARD RULE #15). It is the same widening `#1279` itself performed when the walk moved
from `lib/components` to `lib/`, one directory further out.

### The corpus is derived, never hand-listed

A deck golden is **any committed PDF with a sibling `.md`**, minus three exclusions.
The set comes from `git ls-files`, for the reason `#1279` is entirely about: a hand-kept
list of artifacts is silent by default, and the set of committed artifacts drifting from
the set a gate knows about *is* the defect. Hand-listing five directories here would
have re-created it one layer up.

The three exclusions each restate a `PDF_OWNERSHIP` rule that already says, in prose,
why re-rendering that file is wrong:

- `engineering/decisions/**` — frozen evidence beside a dated record. Rebuilding
  destroys the thing being evidenced.
- `kit/**` — rendered by **real marp-cli** on purpose, to show what a recipient's
  toolchain produces. Re-rendering it through our engine replaces the artifact with one
  made by the engine it exists to be compared against.
- `*.gallery.{light,dark}.pdf` — the gallery scope's own pairs; including them here
  would render each twice and report each drift twice.

### Two details that would have made it false-fail

**The render invocation must match the producer's exactly.** The gallery path renders
with `[EMULATOR, md, dist/lattice.css, out, 'indaco']`. The producers for these decks —
`build-staged-pdfs.js` (the hook) and `build-exemplar-pdfs.js` — render with
`[EMULATOR, md, out]`, no CSS path and no palette, so the deck's own `theme:` front
matter decides. Passing the gallery form would override the theme and false-fail every
deck naming another one.

**Mermaid is detected per deck, not per directory.** The gallery path widens its
tolerance for the `chart` and `diagram` buckets, because mmdc's SVG anti-aliasing is not
bit-identical across machine classes. These decks are not bucketed — 24 of the 185 deck
goldens carry a ` ```mermaid ` fence and they are scattered — so the tolerance is
chosen by reading the deck for a fence.

### Blessing rewrites only what drifted

`--bless` in the deck scope does **not** re-render the scope. It runs the normal
comparison and promotes the fresh render onto the golden only where the diff exceeded
tolerance. Two reasons, and the first is the load-bearing one:

1. **PDF bytes are not reproducible between runs** — timestamps and font-subset ordering
   differ, which is why this gate compares pixels rather than bytes at all. A blanket
   re-render would rewrite all 185 files to land a handful of real changes, burying the
   review in noise.
2. The fresh render is already on disk and already rasterized, so promoting it costs one
   rename rather than a second sweep.

## Cost, and why it is not a CI gate

**~11 seconds per deck; ~35 minutes for the 185-deck scope on this 4-core sandbox.**
That puts it in the same on-demand tier as `overflow:check` (263 decks, "tens of
minutes") and `bench:check`, not in the per-PR gate set.

That is not only a runtime argument. `ci.yml` already records why the *gallery* half of
this gate was removed from CI: across GitHub's heterogeneous runners, Skia's
CPU-dispatched rasterization is not bit-identical, so it flaked on ~0.4–2% of a
different gallery each run. A pixel gate that fails randomly teaches its reader to
ignore it — the same failure mode `#1361` describes for a red `overflow:check` on
`main`. Both halves stay local and on-demand, deliberately.

**What that leaves unclosed, stated rather than implied:** an engine change can still
staleify these artifacts silently between the moments somebody runs the sweep. This
makes the drift *findable and provable* — it does not make it *impossible*. The residual
is the same one `overflow:check` carries, and the honest description is "the same watcher
the galleries have", not "freshness is now guaranteed".

## The strongest objection, recorded rather than answered

The HARD RULE #25 inversion put it sharply: `#1279`'s defect was that `watcher:` named
something that does not read the bytes; this change's remedy is a `watcher:` that names
something **no process requires anyone to run**. There is no CI job, no hook, no nightly,
and no line in `workflow.md` saying when to sweep. That is a real weakening of the word,
and it deserves to be written down next to the claim rather than left for a reader to
notice.

It also sharpened the reason `regress` left CI, which is worse than the flake:
`2026-06-12-p4-regression-gate-retire-marp.md` §0 records that post-marp a self-golden
pixel gate detects **change, not correctness** — a golden blessed with a bug passes
forever. This change then blesses 19 goldens. The inspection of the four largest is what
stands between that and a permanently-passing wrong golden, and inspection does not scale.

**The recommended next step, not taken here:** add `regress --scope decks` to
`.github/workflows/integration-nightly.yml`, which already runs a slow render tier on
`main` and opens a rolling tracking issue on failure, at a tolerance set **above** the
cross-runner rasterization noise (~3% rather than the local 0.05%). At that threshold the
four drifts a reader could actually see — 8.9%, 8.3%, 5.3%, 3.7% — are caught
automatically and forever, while the fourteen sub-1% ones stay a local concern. That is
strictly better than a 35-minute command nobody is obliged to run.

It is not in this change for one reason, stated plainly: **a workflow arm cannot be
exercised from this sandbox.** Adding CI I cannot run and then describing it as a gate
would be the same species of claim this whole swimlane exists to stamp out (HARD RULE
#23). It wants its own change, on a surface where it can be watched working.

**SHIPPED (2026-08-24), with two deviations from the paragraph above.** The step is in
`integration-nightly.yml`, report-only, feeding the existing rolling issue.

- **Scope is BOTH, not `--scope decks`.** A full run on `main` at 5ce794d — the first
  anyone has taken — reports **75/75 galleries green and 184 of 199 deck goldens drifted**,
  worst page 64%. On those numbers `--scope decks` looks vindicated, but that is hindsight
  luck: the gallery half is clean only because #1777 re-blessed it on 2026-08-23 (closing
  #1730), and three days earlier `2026-08-18-golden-corpus-purpose-and-medium.md` §2.3 was
  documenting 17,044 drifted pixels in exactly that half. Each note picked the scope that
  happened to be rotten when it was written, and each would have been wrong within the
  week. Run both. Measured cost: **78 minutes** for the pair on 4 cores, against this
  note's ~35 min for the deck scope alone — and that run was 184-red, so it also paid for
  184 montages. Budget ~2h15m on top of the nightly's ~45-55 min, well inside the 6h
  per-job ceiling.
- **The ~3% tolerance was NOT applied, and recommending it was a scoping error.** That
  figure came from the four `--scope decks` drifts named just above — 8.9 / 8.3 / 5.3 /
  3.7%. Gallery drift scores an order of magnitude lower: the 17,044-pixel `quote` drift
  §2.3 documents, visible across 7 of 9 slides, reports `worst 0.26%`. A 3% floor would
  have admitted it silently, i.e. defeated the gate on the scope it was being widened to
  cover. `FAIL_FRACTION` is unchanged at 0.0005; if cross-runner noise ever proves to need
  headroom, the shape is a measured per-scope constant like `FAIL_FRACTION_MERMAID`, not
  one global loosening.

The HARD RULE #23 caveat above still stands and is the whole reason the step is
report-only: the workflow arm has still never run on a GitHub runner, and cross-runner
rasterization flakiness is why this gate left CI in the first place. Report-only is how
that gets measured instead of assumed.

## Verified

- The gate reproduces the drift it was built to find: `examples/pricing` p2 at 8.9%,
  before/after rasterized and compared side by side.
- Deck scope run whole; results and the blessing pass are recorded in the PR body.
- `--only` accepts a gallery stem or a deck path (`examples/pricing`) — **not** a bare
  basename. Twelve gallery stems collide with deck-golden basenames (`pricing`, `map`,
  `funnel`, `state-chart`, `inventory` — which matches two at once — and seven more), so a
  bare stem aimed at a gallery would silently re-bless an example PDF too. `--scope
  galleries` reproduces the pre-#1379 run exactly.
- `--bless` with no `--scope` means GALLERIES. `npm run bless` is documented as re-rendering
  the gallery goldens; letting the widened default reach the deck scope made it a 35-minute
  sweep that banked unrelated example-PDF drift into whatever commit you were making. The
  deck bless is opt-in; the CHECK default stays `all`.
- A typo'd `--bless --only zzz` exits **2** with `nothing named "zzz"`. The first cut exited
  **0** silently, which is the worst direction for a bless command to fail.

## What this does NOT claim

- It is **not** a per-PR gate and cannot become one without solving the cross-runner
  rasterization problem `ci.yml` documents.
- **Ten committed PDFs remain outside both scopes**, and the honest count is ten rather
  than the eight this note first gave:
  - `examples/chart-theme-gallery/**` (6) — hand-produced, no sibling deck; their own README
    calls them "reviewer deliverables, not regression baselines."
  - `kit/Sample-Deck.pdf` — rendered by real marp-cli on purpose.
  - `engineering/decisions/2026-05-12-kpi-candidates.pdf` — frozen evidence.
  - **`examples/data-viz-gallery.{light,dark}.pdf`** — and this pair is a genuine remaining
    gap, not a deliberate exclusion. They are a showcase light/dark pair built from
    `examples/data-viz-gallery.md`, so the sibling-`.md` rule drops them (the sibling would
    have to be `data-viz-gallery.light.md`) and the `lib/`-rooted gallery walk never sees
    them. Their `PDF_OWNERSHIP` watcher names `build:showcase-galleries:check`, which
    verifies the deck matches its manifests and that the PDF **exists** — it never opens the
    bytes. That is the same overstatement this change corrects for five other rules, in a
    third artifact shape (a pair from one deck, outside `lib/`) that neither scope handles.
    Found by the HARD RULE #25 checker; filed rather than fixed here, because supporting it
    means teaching the deck scope about light/dark pairs and `injectDark`.
- The `PDF_OWNERSHIP` `watcher:` column is now true for the five rules that named
  `overflow:check` alone. It was overstated before, and that is corrected in the same
  change rather than filed.
