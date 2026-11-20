---
status: proposed
summary: A study of more deck presets, scored by two independent judges over six rounds. Rounds 1 and 2 tuned recipes from today's registers and topped out at 8/10, because presets collapse into each other once the palette changes. The owner set a ship floor of 8.5 (target 9) and asked for the limiting factors to be found and solved. Rounds 3 to 6 prototyped new ingredients as deck CSS through the real engine (light covers, heavy and double rules, rail weight, one-ink charts, grid, halftone, ruled paper), and seven presets cleared 8.5 with both judges (Earnings, Annual Report, Strategy House, Museum, Keynote, Editorial, Blueprint), plus Riso with one. Every remaining workaround traces to one of eleven engine limits (§7), each with its root cause, the presets it blocks and the fix; one of them, the PDF photographing every page background at 96 ppi, changes export bytes and waits for the owner's sign-off.
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

## 6. Rounds 3 to 6: prototyping the ingredients

After D5 the owner added: *"no settling, no jank, no tech debt, no broken window when it comes to
the designs … shoot for 8.5. Minimal and Classic are okay to fall under 8.5, maybe a few more to
satisfy boardroom grade"*, and then: *"if we can't reach 8.5 then that means we need to identify
and solve the limiting factors."*

**Method.** Each ingredient was prototyped as deck CSS in the front matter's `style:` block, using
palette tokens only and sizes as multiples of `--fs-h1` / `--fs-h2`, and rendered through the real
CLI. Both judges scored every round at full resolution in own, flip and house, contrast included.
The prototypes prove each design reads; they are not the build, and §7 says what the build needs
instead of their selector workarounds.

**Final scores (round 6).**

| Preset | Judge A | Judge B | Result |
|---|---|---|---|
| Earnings | 9 | 8.5 | clears the floor; Judge A's 9 is the only score at the target |
| Annual Report | 8.5 | 8.5 | clears |
| Strategy House | 8.5 | 8.5 | clears |
| Museum | 8.5 | 8.5 | clears |
| Keynote | 8.5 | 8.5 | clears |
| Editorial | 8.5 | 8.5 | clears |
| Blueprint | 8.5 | 8.5 | clears |
| Riso Zine | 7 (round 5, before its fixes) | 8.5 | clears with Judge B; Judge A has not rescored it |
| Brand-forward | 8 | 8.5 | split; shipped house look, Judge A advises not to chase it |
| Field Notes | 8 | 8 | below; capped by L7 and L8 |
| Minimal | 7.5 | 8 | below, allowed |

**What each preset's prototype adds** (all recipes in the study's round-6 `candidates.json`):

- Editorial: a light cover under a heavy rule, a 4px masthead rule and no finish.
- Strategy House: a 22px accent edge, 10px card rails, square cards, and a light cover with a
  right-hand accent column.
- Annual Report: a small-caps light cover over a double rule, and a double masthead rule.
- Earnings: a light cover, a red accent edge and black-and-white charts.
- Brand-forward: a poster cover, left-aligned, with a 44px foot band; content slides carry a
  matching band.
- Museum: a gallery-label cover and one warm accent across the eyebrow, the bars and the big number.
- Keynote: a 2.75× cover and an accent glow on dark slides.
- Blueprint: a drafting border, a two-scale grid with content-sized plates, and a boxed title.
- Riso Zine: a halftone at the edge, a second-ink plate offset sideways, and em-based cover
  misregistration.
- Field Notes: a margin line, ruled paper on text slides and hand-drawn bars.
- Minimal: no header or footer, page numbers kept, light-weight headings and square corners.

**Defects the judges caught in the maker's work, and fixed:**

- Stale review sheets, twice.
- Light covers with white text, then with a muddy finish wash.
- Rules and bands written in CSS that never rendered.
- A bar shadow that drew bars below zero, then covered the value labels.
- A margin line and a drawing border through the footer.
- A halftone under the page number.
- A plate seam through a headline.
- `corners: square` judged dead when the Minimal preset itself defaults to rounded.

## 7. The limiting factors, and how each is solved

Every remaining workaround in the prototypes traces to one of these. Each references code read at
the cited line on 2026-11-20. "Blocks" lists the presets that need it.

| # | Limit | Root cause | Blocks | The fix | Kind |
|---|---|---|---|---|---|
| L1 | A dark slide with the bar off wipes any deck background | `section.dark.no-spectrum { background-image: none }`, `lib/base/base.variants.css:349` (and `:356` for the divider) | Keynote, Blueprint, Riso, Field Notes, Strategy's cover column | Those rules clear only the bar layer, and the engine composes a `--deck-backdrop` hook beneath it on every section | hook |
| L2 | The title slide is hard-wired dark | `section.title { background: var(--surface-inverse); color-scheme: dark }`, `lib/components/anchor/title/title.styles.css:27`; the subtitle is fixed to `--on-dark-secondary` at `:39`; `--text-display` is remapped to the light ink | The seven light covers | A `cover: light` register: `section.title.light` repaints the canvas and `--fin-canvas`, and the inks come from scheme-aware tokens, as `divider.light` already does | register + fix |
| L3 | Chart marks cannot take one ink | `fill`, `stroke` and `stroke-width` are `!important` at `lib/plugins/chart-family/chart-family.styles.generated.css:351-354`; the edge reads `--chart-cat-N-ink` | Earnings, Museum | A `marks: mono` value (or a `chart-ink` register) that sets `--chart-cat1` and `--chart-cat1-ink` from `--text-heading` or `--accent` | register |
| L4 | Card rail width is fixed | `--sp-card-w: calc(… * 0.35)` on `section:is(.with-spectrum-card, …)`, `lib/base/base.accent-finish.css:197-198` | Strategy House | `--sp-card-w: var(--rail-w, calc(…))`, exposed as `rail: hair\|bold` | token |
| L5 | Heading rule weight and style are fixed | `section.rule-full.form .cell-masthead { border-bottom: 1px solid var(--border) }`, `lib/base/base.accent-finish.css:22`; short and accent rules at `:37-56` | Editorial, Annual Report | `--rule-w`, `--rule-style` and `--rule-color` tokens defaulting to today's values, set by the preset | token |
| L6 | A finish cannot step aside for text | The only off switch is the per-slide `no-finish` class, `lib/base/base.finish.css:1242` | Blueprint, Riso, Field Notes (hand-placed plates) | A keep-out hook on the finish layer that clears the masthead box, the footer box and the hero stack | hook |
| L7 | No pattern finishes | Grid, halftone and ruled paper exist only as deck CSS; a true halftone needs dot size to follow tone; ruled lines need to snap to the body line-height | Blueprint, Riso, Field Notes | New `finish:` values (`grid`, `halftone`, `ruled`), built on L1 and L6 | register values |
| L8 | Sketch mode stops at the chart | The prototype's `feTurbulence` filter is the effect `lib/core/rough-ink.js:27-29` records a veto against (it collapsed Marp's print transform). The owned CLI PDF did not shrink in round 5; export-to-Marp, PPTX, WebKit and Gecko are unverified | Field Notes | Extend `rough-ink.js`, which already draws filter-free rough paths, to chart marks | fix |
| L9 | The PDF photographs the page background at 1× | Every CLI PDF page carries its background as one 1280×720 image at 96 ppi; measured on the shipped `classic` and `editorial` presets as well as the prototypes. The text and drawings stay vector (`engineering/pipeline.md` §3, "The page itself") | Every preset with a pattern or finish, in the exported PDF | Photograph the background at 2× or more, or emit pattern finishes as vector. **This changes the bytes of every exported PDF, so it needs the owner's export sign-off (Quality Bar)** | export |
| L10 | Card radius is not driven by `corners:` | `corners:` shapes only the slide surface (`lib/base/base.modifiers.css:4214`); cards read `--radius-md` from `lib/base/base.tokens.css:224`, which no register sets | Strategy House | `corners: square` also zeroes the `--radius-*` component tokens | fix |
| L11 | No second-ink token | Riso borrows `--cat-2-mark` and mixes it per mode | Riso | `--ink-2` with light and dark arms in the palette contract | token |

**Order.** L1, L2 and L3 first: together they remove every selector workaround in seven of the
eight presets that clear the floor, so each ships as a plain preset. Then L4, L5 and L10, which are
small tokens. Then L6 and L7 together, since the pattern finishes are built on the keep-out hook.
Then L8 and L11. L9 waits for the owner's export sign-off, rendered in dark and light.

## Reproduce

The candidates are front-matter recipes on the four-slide deck in §1. The ten recipes are the
table in §3. The cut ones are recorded in the study gallery, together with every score.
