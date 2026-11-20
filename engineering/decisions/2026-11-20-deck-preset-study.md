---
status: proposed
summary: A study of more deck presets. 21 candidates were rendered on one four-slide deck in their paired palette, the opposite color mode and the house palette, and scored by two independent judges; 11 revised candidates were scored again. With today's registers the best reach 8/10 and none reaches 10. Readability is solved (every bar 3.33:1 or better, every card text 6.5:1 or better); the gap is distinctness, because once the palette changes the presets collapse into each other, and every backdrop soft enough to stay off the words vanishes at sheet size. The owner chose ten target presets, let a preset carry palette, mode, chart style and backdrop as recommendations, asked for Minimal to get a real identity, set the build order for four new ingredients (title compositions, one accent on a grayscale palette, hand-drawn chart marks, and a real halftone backdrop), and set a ship floor of 8.5 with a target of 9, which no preset meets today.
companion:
  - ./2026-09-26-deck-presets-and-settings-tiers.md
  - ./2026-11-20-slide-and-share-presets.md
---

# A study of more deck presets

**Date:** 2026-11-20 · **Status:** proposed; the four decisions in §5 are owner-settled (one round, 2026-11-20); nothing is built

The ask: *"I wonder if we can have more presets. Let's think about it and future out the art of
the possible, then evaluate and score each. I want 10 killer 10/10 presets that are boardroom
ready, and some that are really crafty, and both."*

**The answer, first.** The registers that exist today get eight presets to 7 or 8 out of 10 and
none to 10. Six new ingredients would close the gap (§4). The owner chose the ten (§3) and the
build order (§5).

## 1. Method

- **The deck.** Four slides: `title`, `cards-grid` (three cards), `bar` (three bars) and
  `big-number`. Every candidate rendered the same words, through the CLI (`node dist/lattice.js`),
  at 2560×1440.
- **Three renders per candidate.** Its paired palette in its intended color mode ("own"), the
  same palette in the opposite mode ("flip"), and `indaco` light ("house"), which tests whether
  the look survives a palette change.
- **Two judges, blind to each other.** Judge A scored five axes adapted from the layout audit
  (`2026-06-06-layout-audit/README.md`): Boardroom, Craft, Readability, Robustness and
  Distinctness. A 10 needed no axis below 8, and a fatal flaw capped OVERALL at 6. Judge B
  (`red-team`) attacked each candidate for contrast, pattern noise, hierarchy, distinctness and
  fit to its stated purpose. Both measured contrast from full-resolution pixels.
- **Round 2.** Both judges' fixes were folded into 11 revised candidates, which Judge A rescored.
  The raise loop stopped there, because the remaining gap was the vocabulary, not the recipes.

## 2. What the judges found

- **Readability is solved by round 2.** At full resolution, bar fill measured 3.33:1 or better
  in both modes, against a 3:1 floor, and card text measured 6.5:1 or better, against 4.5:1.
- **`marks: etch` fails on dark slides.** In round 1 its bar fill measured 1.51 to 1.75:1 on
  dark backgrounds (Blueprint, Nocturne, Signal). The outline carries the bar and the fill
  nearly disappears. No proposed preset uses `etch` on a dark default. The finding is recorded
  as a follow-up against the register itself.
- **The palette does most of the work.** On the house row, Earnings, Strategy, Annual Report,
  Nocturne and Calm collapsed into Classic or Editorial, Keynote into Brand-forward, and
  Letterpress into Atelier. This is the evidence behind decision D1.
- **Texture that is soft enough vanishes.** At `backdrop` 40 or below, `halo`, `meridian`,
  `strata` and `savile` could not be seen at sheet size. A restrained preset needs a structural
  mark, which is ingredient 2.
- **Five candidates converge on Brand-forward.** Brand-forward, Keynote, Signal, Riso and
  Blueprint all set `typography: poster`, and the condensed headline carries most of the look.
- **Two claims checked and dismissed.** Rounded slide corners are transparent in the PNG
  export and white in the PDF, which is correct for a rounded slide. Card rails from
  `spectrum-card` do draw on every card: they are about 3px wide on a 2560px slide, so they
  vanish in a thumbnail. That is ingredient 6, not a bug. `corners` rounds only the slide
  surface, by design (`lib/base/base.registers.docs.md` §The slide's corner).

## 3. The ten, and the round-2 scores

Classic stays the default under all ten. "Today" is Judge A's latest OVERALL.

| Preset | Kind | Today | Recipe | Held back by | Needs |
|---|---|---|---|---|---|
| Editorial | boardroom | 7 | ships (`preset: editorial`) | Its only marks are the corner fold and a short rule | 2 |
| Strategy House | boardroom | 8 | `theme: brina` · `typography: ledger` · `headline: left` · `rule: full` · `eyebrow: bar` · `spectrum-card: solid` · `marks: tone` · `lift: on` | On another palette it reads as Editorial with rails | 1, 2, 6 |
| Annual Report | boardroom | 7 | `theme: burgundy` · `typography: ledger` · `finish: meridian` · `backdrop: 40` · `headline: left` · `rule: short` · `marks: tone` | The wash is invisible at a strength that keeps it off the words | 1, 2 |
| Earnings | boardroom | 6 | `theme: ardesia` · `headline: left` · `rule: short` · `spectrum: solid` · `spectrum-edge: left` · `marks: tone` | A grayscale palette has no accent to give; on `onyx` the accent is red, which reads as a loss | 4 |
| Brand-forward | both | 7 | ships (`preset: brand`) | Three other candidates collapsed into it | 2 |
| Museum | both | 7 | `theme: carta` · `finish: gallery` · `backdrop: 20` · `typography: festival` · `headline: left` · `rule: none` · `spectrum: off` · `marks: tone` | Was `tone muted`, which gave 3.33:1 in dark mode | 2 |
| Keynote | both | 6 | `theme: crepuscolo` (dark) · `typography: poster` · `headline: center` · `finish: halo` · `backdrop: 40` · `lift: on` · `marks: vivid` | Today it is Brand-forward in purple | 1, 2 |
| Field Notes | crafty | 8 | `theme: cuoio` · `mode: sketch-clean` · `finish: ledger` · `spectrum: off` · `rule: short` · `eyebrow: underline` | Hand-written titles over machine-drawn bars | 1, 3 |
| Blueprint | crafty | 7 | `theme: laguna` (dark) · `finish: atrium` · `typography: poster` · `marks: vivid` · `rule: full` · `eyebrow: bar` · `spectrum: mono` | In light mode it is a cream sheet, not a blueprint | 1, 2 |
| Riso Zine | crafty | 5 | `theme: mustard` · `typography: poster` · `finish: strata` · `backdrop: 80` · `marks: pigment vivid` · `spectrum-card: solid` · `rule: full` | The dots form a regular lattice, not a halftone, and nothing overprints | 5 |

**Cut, with the reason.**
- Board Pack: Minimal plus a ledger serif.
- Calm: the backdrop looks like camouflage.
- Swiss: a muddy gray page.
- Nocturne: outlined bars at 1.51:1.
- Festival: neither playful nor visible as rails.
- Sketchbook: merged into Field Notes.
- Letterpress, then Atelier: they read as Annual Report.
- Signal: Brand-forward in green.
- Chalkboard: Field Notes on slate. It returns with ingredient 3.

Round-1 scores for all 21, from both judges, are in the study gallery (see Reproduce).

## 4. The six ingredients

| # | Ingredient | Unlocks | Rough size |
|---|---|---|---|
| 1 | A preset can carry `theme`, `mode`, `marks` and `backdrop` as recommendations | Annual Report, Keynote, Field Notes, Blueprint | small: the table in `lib/core/front-matter-key.js` and its Studio mirror (`deck-preset.ts`) |
| 2 | Title compositions: a preset chooses how its title and section slides are laid out (a masthead, a wall label, a full-bleed stage line, a drawing title block) | 7 of the 10 | medium |
| 3 | Hand-drawn chart marks, so sketch mode reaches the bars (rough strokes, hatched fill) | Field Notes; Chalkboard returns | medium to large |
| 4 | One accent color a preset can set on a grayscale palette | Earnings | small to medium |
| 5 | A halftone backdrop: dots sized by tone, two inks that overprint, a slight offset between them | Riso Zine | large |
| 6 | Rail weight, so card rails show at thumbnail size | Strategy House; a playful many-color preset | small |

The sizes are estimates made before any code was read for them.

## 5. Decisions (owner-settled 2026-11-20, one round)

| Fork | Chosen | Not chosen |
|---|---|---|
| D1. What a preset may set | `theme`, `mode`, `marks` and `backdrop` join the preset family as recommendations, and a key the deck writes still wins. This reverses "What a preset deliberately does NOT set" in `lib/core/resolve-preset.js` for those four keys | Palette only; or keep the September rule |
| D2. Minimal | Give it a real identity, so it earns its slot | Make it an alias of Classic plus a left headline; keep it as is |
| D3. Which ingredients, in order | 2 title compositions, then 4 one accent, then 3 hand-drawn charts, then 5 halftone. Ingredient 1 comes before all of them, because four of the ten need it. Ingredient 6 is not scheduled | — |
| D4. PR #3335 | Hold | Merge |
| D5. The ship floor | **No preset ships below 8.5 OVERALL, and the target is 9.** An independent judge sets the score with the §1 rubric, on renders of all three rows (own, flip, house), never the maker | Ship at today's 7 to 8 |

**What D5 means today.** No preset clears it. The best two (Strategy House and Field Notes) score
8, and the four that ship score 5 to 8 (Classic 6 and 8 from the two judges, Editorial 7,
Brand-forward 7, Minimal 5 and 6). So the ten ship one at a time, each when its ingredient lands
and a judge scores it at 8.5 or higher. The shipped four are held to the same floor: raising them
is part of the work, and Minimal's new identity (D2) is judged against it too.

## Reproduce

The candidates are front-matter recipes on the four-slide deck in §1. The ten recipes are the
table in §3. The cut ones are recorded in the study gallery, together with every score.
