---
status: shipped
summary: >
  The one-time re-bless `2026-08-18-golden-corpus-purpose-and-medium.md` recommended and
  `2026-08-24-...-nightly` (#1803) deferred until the gate had been OBSERVED. It has been:
  two nightly runs on `main@fd3176e` reported 196 of 349 committed goldens drifted with a
  drifted set identical between them — zero symmetric difference — and one of them
  reproduces on a different host at the same worst-page figure to two decimals. That is the
  pair of readings #1803 asked for, and it settles the question it left open: the drift is
  STALENESS, not cross-runner rasterization noise. The split is the finding — 184 of 199
  DECK goldens against 12 of 150 GALLERY goldens — and it falls exactly along a documented
  seam: `regression-gate.mjs --bless` means GALLERIES when no `--scope` is given while
  `--check` means ALL, so `npm run bless` after a shared CSS change refreshes 150 artifacts
  and silently leaves 199. The three most recent blesses (#1777, #1801, #1804) all took that
  default, which is why the deck half is six days and a dozen render-input commits stale
  while the gallery half is current.
---

# The deck half of the golden corpus was six days stale, and the bless default is why

**2026-08-24 · branch `claude/palette-cascade-followup-7dzvik`**

**Area:** the committed golden corpus (`examples/**.pdf`, `exemplars/**.pdf`,
`design/*.gallery.pdf`, `themes/palette-audit.pdf`, `test/integration/baseline-decks/`),
`tools/regression-gate.mjs`

## 1. The reading #1803 asked for

`.github/workflows/integration-nightly.yml` wired `npm run regress` report-only on
2026-08-24 (#1803) and said what to read from the first reports before anyone proposed
making it blocking:

> does the drifted SET stay stable run to run (a moving set is cross-runner noise, a fixed
> one is genuine staleness), and does anything in the clean gallery half start flapping.

Two runs have now carried it, both on `main@fd3176e`, reported into the rolling issue
(#1529) at 06:05:50Z and 08:30:56Z. Both say:

```
75 galleries × 2 moods + 199 deck goldens. 196 DRIFTED: …
```

**The two drifted sets are identical.** Parsed from the two comment bodies and compared as
sets: 196 names each, symmetric difference **zero**. Not "similar" — the same 196 names.

## 2. Cross-host rasterization is not the cause, checked rather than assumed

A stable set is necessary but not sufficient: a *systematic* host difference is stable too,
and that is precisely the failure mode `ci.yml:278` retired this gate from PR CI for. The
gate already carries a band for it — `FAIL_FRACTION` 0.05% of a page, `FAIL_FRACTION_MERMAID`
1%, sized against an observed ~0.4–0.5% cross-machine AA drift — but a band is a model, and
the technique this repo keeps re-learning is to go and measure the thing rather than re-derive
it from the model that produced the number.

So one of the 196 was re-run here, on a different host from the GitHub runner:

| | runner, `main@fd3176e` | this sandbox, `main@e7597f7` |
|---|---|---|
| `examples/qr-cards` | `DRIFT(7pg, worst 0.72%)` | `DRIFT(5pg, worst 0.72%)` |

The worst-page figure reproduces to two decimals on a different machine. The drift is in the
artifact, not in the rasterizer.

**The 7-vs-5 page count is the band showing up at the margin, and it is worth stating rather
than smoothing over:** two of the seven pages the runner scored over `FAIL_FRACTION` fell
under it here. Those two are the cross-host component. Five are not, and one deck of 196 is
one sample — the claim this table supports is "cross-host noise is not the CAUSE", not "the
per-page counts are host-independent".

## 3. The split is the finding

Of the 196:

| scope | drifted | of | |
|---|---|---|---|
| deck goldens | **184** | 199 | 92% |
| gallery goldens | **12** | 150 | 8% |

Two halves of one corpus, rendered by one engine, off the same commit, twelve-fold apart.
That is not what accumulated drift looks like — it is what a seam looks like.

## 4. The seam is the bless default

`tools/regression-gate.mjs:432`:

```js
const scope = scopeIdx >= 0 ? args[scopeIdx + 1] : (args.includes('--bless') ? 'galleries' : 'all');
```

**`--bless` with no `--scope` means GALLERIES. `--check` with no `--scope` means ALL.** The
asymmetry is deliberate and its reasoning is sound (the file argues it at :425–431): letting
`npm run bless` reach the deck scope made it a 35-minute sweep that silently banked unrelated
example-PDF drift into an author's commit, so the deck bless is opt-in.

The consequence is that **the check watches 349 artifacts and the default bless refreshes
150.** An author who lands a shared CSS change, sees galleries move and runs `npm run bless`
has done everything the tooling asked and left 199 goldens stale — with nothing in the
session telling them so. The last three blesses all took that default:

| | blessed | scope |
|---|---|---|
| #1777 (2026-08-23) | galleries | default |
| #1801 (2026-08-24) | galleries | default |
| #1804 (2026-08-24) | galleries | default (its one deck PDF is a new demo, not a re-bless) |

Deck goldens were last re-blessed on **2026-08-18**. Between that and `fd3176e` sit twelve
commits touching `lib/`, `themes/` or `lattice-emulator.js`. 184 of 199 is what six days of
that costs.

**#1789 is not the sole cause, and the correction matters.** It is the loudest — eighteen
palettes changed, zero PDFs committed — but the corpus was already days stale when it landed.
A note naming one PR would send the next reader looking for a discipline failure; the
mechanism is structural.

## 5. What actually moved, looked at rather than counted

Sampled from the before│after│overlay montages the gate writes, at the two ends of the range:

- **`design/forms.gallery` slide 1** (crepuscolo, dark title): whole glyph runs shift value
  with no hue change — eyebrow strip max channel delta **36/255**, mean **1.26**. An ink-tier
  move. crepuscolo's own #1789 diff touches only `--code-inline-fg` and the status trio, none
  of which paint an eyebrow, so this one is older than #1789 — the palette's `--text-muted`
  light arm was re-pointed `#8E83A8` → `#6E6487` by #1738 on 2026-08-18, inside the window.
- **`design/forms.gallery` slide 6** (donut + legend): the ring geometry and the legend's
  vertical rhythm both move. This is a layout change, not an ink one, and it is the largest
  class in the corpus by pixel count.

Neither reads as a defect: the after side is well-formed on both, and the second is arguably
the better composition. **That is the whole check a re-bless owes** — blessing promotes
whatever renders today, so the question is never "did pixels move" (196 artifacts say yes)
but "does anything on the after side look broken".

## 6. What this change does

1. **Re-blesses the deck scope** — `node tools/regression-gate.mjs --scope decks --bless`,
   which promotes only what actually drifted rather than blanket re-rendering (`:259–263`).
2. **Re-checks the gallery scope** and blesses what the #1804 pass left.
3. **Closes the seam it found**, at zero cost: a galleries-default `--bless` now prints that
   it did NOT touch the deck scope and names the flag that would. It does not go and measure
   the deck drift — that is a multi-hour render and would defeat the reason the default is
   narrow — it just stops the omission being silent.

## 7. What this does NOT fix

- **The nightly is still report-only, and should stay that way for now.** #1803's argument is
  unchanged by this note: nothing in the gate's history has been measured on a GitHub runner
  across a re-bless boundary. What this change buys is the *next* reading — a corpus that is
  fresh as of today, so the next nightly's red is new information rather than a six-day
  backlog. If the runs after this one come back green, the cross-runner-flake objection has
  its first real evidence for; if they come back red on a stable set again, the band needs
  measuring, not the corpus re-blessing.
- **`build:galleries:check` still cannot see a change committed WITH its inputs.** That blind
  spot is documented at `tools/lib/render-inputs.js:40` and is exactly what let #1789 through.
  The nightly is its watcher now; the pre-commit guard is unchanged and still the cheap catch.
- **The 15 deck goldens that did NOT drift are not proof of anything.** They are decks whose
  content none of the twelve commits reaches.
- **Nothing here re-measures the band.** `FAIL_FRACTION` and `FAIL_FRACTION_MERMAID` are
  untouched, and §2's 7-vs-5 is a single deck's worth of evidence that a band exists, not a
  measurement of its width.
