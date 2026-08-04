---
status: shipped
summary: 183 committed PDFs — every `examples/` deck, all 45 exemplars, the design galleries, the CI baseline deck, the palette audit — had a producer and a named watcher, and the watcher did not read them. `#1279` closed OWNERSHIP deliberately without closing FRESHNESS, and the `watcher:` those rules named was `overflow:check`, which re-renders the markdown to a scratch dir and deletes it: it never opens the committed artifact. So an engine change staleified all of them silently. The issue proposed three designs — an input-hash sidecar, a scheduled re-render PR, or declaring them unfresh-by-design — and the answer is a fourth that dominates all three: THE WATCHER ALREADY EXISTS. `regression-gate.mjs` renders a deck fresh and pixel-diffs it against the committed golden; its corpus simply stopped at `lib/`. Widening it needed no new tool, no new committed artifact class, and no new gate concept (HARD RULE #15). The corpus is DERIVED from `git ls-files` rather than hand-listed, because a hand-kept set of artifacts is silent by default — the lesson #1279 itself records. Measured before deciding: the staleness is real and visible, not bookkeeping — `examples/pricing.pdf` p2 differs from a fresh render by 8.9% of the page, the committed artifact still carrying a larger body type and a narrower measure than the engine now produces. Cost is ~11s per deck, ~35 minutes for the scope on 4 cores, which puts it in the same on-demand tier as `overflow:check` rather than in CI, for the reason `ci.yml` already documents: Skia's CPU-dispatched rasterization is not bit-identical across GitHub's heterogeneous runners.
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
183 artifacts adds no new tool, no new artifact class, and no new concept
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
bit-identical across machine classes. These decks are not bucketed — 18 of the 121
example decks carry a ` ```mermaid ` fence and they are scattered — so the tolerance is
chosen by reading the deck for a fence.

### Blessing rewrites only what drifted

`--bless` in the deck scope does **not** re-render the scope. It runs the normal
comparison and promotes the fresh render onto the golden only where the diff exceeded
tolerance. Two reasons, and the first is the load-bearing one:

1. **PDF bytes are not reproducible between runs** — timestamps and font-subset ordering
   differ, which is why this gate compares pixels rather than bytes at all. A blanket
   re-render would rewrite all 183 files to land a handful of real changes, burying the
   review in noise.
2. The fresh render is already on disk and already rasterized, so promoting it costs one
   rename rather than a second sweep.

## Cost, and why it is not a CI gate

**~11 seconds per deck; ~35 minutes for the 183-deck scope on this 4-core sandbox.**
That puts it in the same on-demand tier as `overflow:check` (185 renders, "tens of
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

## Verified

- The gate reproduces the drift it was built to find: `examples/pricing` p2 at 8.9%,
  before/after rasterized and compared side by side.
- Deck scope run whole; results and the blessing pass are recorded in the PR body.
- `--only` accepts a gallery stem, a deck path (`examples/pricing`), or an unambiguous
  basename; `--scope galleries` reproduces the pre-#1379 run exactly.

## What this does NOT claim

- It is **not** a per-PR gate and cannot become one without solving the cross-runner
  rasterization problem `ci.yml` documents.
- It does not watch `examples/chart-theme-gallery/**` (six hand-produced PDFs with no
  sibling deck — their own README calls them "reviewer deliverables, not regression
  baselines"), `kit/Sample-Deck.pdf`, or the decision-record evidence. Those keep
  `watcher: null`, which remains the honest answer for each.
- The `PDF_OWNERSHIP` `watcher:` column is now true for the five rules that named
  `overflow:check` alone. It was overstated before, and that is corrected in the same
  change rather than filed.
