---
status: shipped
summary: >
  #1348 filed two Mermaid ink pairs below AA; measuring the whole map found four, sharing one
  shape — `--cat-on-fill` is curated for the PALE `--cat-N-fill` band, and each key put it on
  a surface from another tier. Ranked by damage the filed pairs were not the worst: the
  sequence AUTONUMBER BADGE (`sequenceNumberColor` on `--diagram-line`) was below AA on 57 of
  64 palette x scheme combos and at exactly 1.00:1 on 47 of them, because most palettes derive
  both tokens from the same end of the ramp — the badge rendered as a blank disc with an
  invisible number, in every deck that ever used `autonumber`, and nothing had ever looked.
  A foreground-tier fill takes CANVAS ink, so it moves to `--bg`; that clears 62 of 64, and
  the last two were cuoio's dark `--diagram-line`, lifted #786A5B -> #8C7C6B (which also
  raises every cuoio-dark edge against the canvas, 3.59:1 -> 4.66:1). `noteTextColor` moves to
  `--text-heading`, clearing all 64. `KNOWN_BELOW_AA` goes from four entries to one. The last
  one is `errorTextColor`, and it is NOT a diagram defect: carbone pins `--bg` flat dark while
  its status trio still declares `light-dark()` arms tuned for an off-white canvas the palette
  does not have, so `--pass` reads 3.90:1 and `--fail` 2.34:1 on the only canvas they can land
  on. Pinning the trio flat was implemented and measured — it fixes the pair, lifts both to
  AAA, and retires TEN composed-surface sanctions — but it drops `warn^fail` under
  deuteranopia through the CVD collapse floor, so it is raised as a palette-contract decision
  rather than taken.
---

# Ink curated for one tier, used on another — four times

**2026-08-24 · #1348 (three of four pairs closed)**

**Area:** `lib/core/mermaid-theme-map.js`, `themes/cuoio.css`,
`test/unit/palette/diagram-ink-contrast.test.js`

## The shape, stated once

A Mermaid SVG bakes its colors to literal hex, so `themeVariables` decide legibility
outright — no CSS can rescue them afterwards. Lattice's categorical system has three ink
tiers, each curated against one surface band:

| ink | curated for |
|---|---|
| `--cat-on-fill` | the PALE `--cat-N-fill` band |
| `--cat-on-mark` | the saturated `--cat-N-mark` stroke tier |
| `--text-heading` | the canvas and the non-categorical diagram surfaces |

Every failure #1348 collected is the same mistake: a key fed from one tier, drawn on a
surface from another. The map had `--cat-on-fill` as its default ink, so the error was the
path of least resistance.

## Ranked by damage, not by filing order

Measured across all 32 palettes x both schemes (64 combos), through the shipping resolver:

| pair | surface | below AA | worst |
|---|---|---:|---|
| `sequenceNumberColor` | `--diagram-line` | **57 / 64** | **1.00:1** on 47 |
| `gitBranchLabel0-7` | `--cat-N-mark` | 64 / 64 | 1.2:1 |
| `noteTextColor` | `--diagram-note` | 5 / 64 | 3.83:1 |
| `errorTextColor` | `--fail` | 1 / 64 | 2.34:1 |

The autonumber badge is the one nobody filed and the one that was actually invisible. Most
palettes derive `--cat-on-fill` and `--diagram-line` from the same end of the ramp, so ink
and fill resolved to the **same hex** — a filled disc with a number painted in the disc's own
color. Rendered through the real emulator, before and after, the badges read as solid blobs
on indaco (light) and onyx-dark (dark), and as `1 2 3` after.

That it survived is the finding. `gitBranchLabel` was caught because a gate was written for
it; this one sat beside it in the same table, worse, until the whole map was swept.

## What each one needed — four different answers

- **`gitBranchLabel0-7`** — closed before this change. The sanction asked for "a third ink
  tier or move the chips to the pale band"; the third tier already existed (`--cat-on-mark`)
  with nothing pointing at it.

- **`sequenceNumberColor` → `--bg`.** Mermaid fills the badge `circle` from `signalColor`,
  which is `--diagram-line` — a FOREGROUND tier. The ink that belongs on a foreground fill is
  the canvas, the same inversion `errorTextColor` already uses on `--fail`. Seven candidate
  inks were measured; it was the only one close (worst 3.59:1, against `--cat-on-mark`'s 7
  failures and `--text-heading`'s 62).

- **cuoio's dark `--diagram-line`, #786A5B → #8C7C6B.** The residual two combos. The line
  tier now has to carry TEXT, not just an edge, and cuoio's dark arm was the only one of 32
  still short against its #15110D canvas. The lift costs nothing: every cuoio-dark edge and
  arrow goes 3.59:1 → 4.66:1 against the same canvas. The light arm is untouched.

- **`noteTextColor` → `--text-heading`.** `--diagram-note` is not in the categorical band at
  all, so the ink already curated against the non-categorical diagram surfaces is the right
  tier. Clears all 64, worst 4.63:1.

## 4. `errorTextColor` — raised, not taken

One combo of 64: **carbone light, 2.34:1**. The map side is already optimal — of seven inks
measured against `--fail`, `--bg` fails 1, `--bg-alt` fails 1, `--cat-on-mark` fails 6, and
every other tier fails 58 or more. There is no map edit that improves it, which is what
#1348 said: *"the fix is a palette-side `--fail` curation, not a map edit."*

**What it actually is.** carbone pins `--bg` flat dark (`#1A1A1C`, no `light-dark()`) while
still declaring its status trio as `light-dark()` pairs whose light arms are, in the
palette's own comment, "AA+ on the off-white canvas" — a canvas this palette does not have.
Against the canvas it does have:

| token | light arm on `#1A1A1C` | dark arm on `#1A1A1C` |
|---|---|---|
| `--pass` | **3.90:1** | 14.13:1 |
| `--fail` | **2.34:1** | 9.63:1 |
| `--warn` | 6.27:1 | 6.27:1 |

Reachable, not theoretical: `section.light` / `section.print` set `color-scheme` on the
ELEMENT and govern their own subtree past carbone's `:where(:root)` pin — the same seam
`paired-token-parity.test.js` writes down as the cost of carbone's exemption there — while
`--bg` stays dark because it is flat. `tools/contrast-audit.js` does not see it because it
audits carbone in `[dark]` only.

**The fix was implemented and measured, then reverted.** Pinning the trio flat to its dark
arms fixes this pair, lifts `--pass` and `--fail` to AAA on the canvas, and **retires ten
`KNOWN_SUB_THRESHOLD` sanctions** in `tools/composed-contrast.js` — every `carbone|light|*`
entry. It also drops `warn^fail` under deuteranopia from 0.2386 to 0.1465, through the 0.15
collapse floor in `cvd-trio-floor.test.js`.

That number is not incidental: **carbone's dark arms are frozen at that same 0.1465 and
grandfathered.** The pin does not introduce the weakness — it propagates an existing one
onto a second reading. So the real question is not "does the pin regress CVD" but "should
carbone's trio be re-tuned to clear both AA and the collapse floor", on values
`2026-08-24-status-trio-monochromacy-respacing.md` set the same day. That is a palette
contract decision, and the sanction in `diagram-ink-contrast.test.js` now carries the whole
measurement so whoever takes it does not have to re-derive it.

## Verification

Each fix mutation-checked against the gate on the real tree, control re-run between:

| mutant | gate |
|---|---|
| `sequenceNumberColor` back to `--cat-on-fill` | **59 of 64** theme x scheme cases red |
| `noteTextColor` back to `--cat-on-fill` | **5** red |
| cuoio dark line back to `#786A5B` | **2** red |
| carbone `--fail` back to a `light-dark()` pair | **1** red |
| unmutated | 67 / 67 green |

Real surface (HARD RULE #23): a four-slide probe deck rendered through `lattice-emulator.js`
at indaco, cuoio, onyx-dark and a11y-deuteranopia, light and dark, before and after, as
before│after montages. The badge and note montages are in the PR.

## Gates

`npm run lint` · `npm test` · `npm run build:check` ·
`node --test test/unit/palette/` (diagram ink 67/67, CVD floor, composed-surface, baselines).
