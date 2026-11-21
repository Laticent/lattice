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
| D6. Where cover styles live (owner asked for existing keys and axes, then "are we fitting a square peg in a round hole?"; **revised after the adversarial trio**) | Weight and style become **preset tokens** (`--rule-w`, `--rule-style`, `--rule-color`, `--rail-w`, a card-radius hook) that presets set internally (D10), since one-word readers silently drop a second word. The cover surface is a **`cover:` register for title and closing only**, stamping its own collision-free `cover-light` token, so the tested meaning of `light`, `title light` and the HTML player's `BOOKEND_FORCES_DARK` is untouched. Dividers and `topic` keep their surfaces. Compositions are title and closing manifest variants (§8 N1) | Redefining `light` (a decided, test-pinned contract); a `bookends:` register (the name belongs to the narration feature, and `divider light` is a different layout); size on `headline:`; weight words on `rule:` and `spectrum-edge:` |
| D7. Extras | Add a `paper` finish (reviving Atelier and Letterpress), a playful many-color preset (reviving Festival) and Chalkboard (on `marks: sketch`), each judged against 8.5 | None for now |
| D8. Cadence (re-decided after the trio) | **Waves.** Wave 1: Earnings, Annual Report, Strategy House, Museum and the raised Editorial. Wave 2: Keynote and Blueprint. Wave 3: Riso, Field Notes, Chalkboard, the paper finish and the playful preset. Each wave launches in one PR | All presets together, which stalled every preset behind the slowest item and contradicted §8 in three places |
| D10. Simplicity budget (owner, after the trio) | **Strict.** The picker shows at most five tiles at once (grouped). The Basic settings tier gains no controls. New ingredients (rule weight, rail weight, cover composition) are set by presets internally and are not public author settings until someone asks for one | Expose every ingredient as a public setting |
| D11. Changing shipped presets (owner) | Change them in place: the product is not generally available, so the only decks are the repo's and the owner's. **Guard:** no deck may start to overflow; every repo deck that names an affected preset is rendered before and after and its overflow count must not rise | New names with the old recipes kept |
| D12. Agent budget (owner) | Approved past the 10-agent session budget (HARD RULE #25): parallel sessions for the independent Phase-1 packages, each with its own checker and card grader, about 20 agents in all | One session; or checkers on the riskier packages only |
| D9. WebKit and Gecko testing | In CI, which installs both; no change to this environment | Allow the Playwright download hosts here |

**What D5 means today.** No preset clears it. The best two (Strategy House and Field Notes) score
8, and the four that ship score 5 to 8 (Classic 6 and 8 from the two judges, Editorial 7,
Brand-forward 7, Minimal 5 and 6). So the presets ship in waves (D8), each once its ingredients land
and fresh judges score it at 8.5 or higher on the preset corpus deck (§8). The shipped four are held to the same floor: raising them
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
| L1 | A dark slide with the bar off wipes a background painted on the section | `section.dark.no-spectrum { background-image: none }`, `lib/base/base.variants.css:349` (and nine more `background-image: none` sites). **Corrected by the trio:** engine finishes paint on the injected `.backdrop` child (`base.finish.css:125, :151`), which these rules never touch, so only deck CSS on the section is wiped | Prototypes only | None needed once every pattern is a real finish (Phase 2); the prototypes' workaround goes away with them | none |
| L2 | The title slide is hard-wired dark | `section.title { background: var(--surface-inverse); color-scheme: dark }`, `lib/components/anchor/title/title.styles.css:27`; the subtitle is fixed to `--on-dark-secondary` at `:39`; `--text-display` is remapped to the light ink | The seven light covers | A `cover:` register for title and closing that stamps its own `cover-light` token, repainting the canvas and `--fin-canvas` with scheme-aware inks; the existing `light` contract is left as it is (D6, §8 WP-cover) | register |
| L3 | Chart marks cannot take one ink | `fill`, `stroke` and `stroke-width` are `!important` at `lib/plugins/chart-family/chart-family.styles.generated.css:351-354`, keyed on `section:is(.marks-pigment, .marks-etch, .marks-tone)`; the edge reads `--chart-cat-N-ink`. **Corrected:** `marks: tone` already draws one hue in eight steps; what is missing is choosing that hue | Earnings, Museum | An ink-source word on the existing `tone` finish (from the heading ink or the accent instead of cat-1), emitted by `tools/build-marks-css.js` | register value |
| L4 | Card rail width is fixed | `--sp-card-w: calc(… * 0.35)` on `section:is(.with-spectrum-card, …)`, `lib/base/base.accent-finish.css:197-198` | Strategy House | `--sp-card-w: var(--rail-w, calc(…))`, set by presets internally, not a public word (D10) | token |
| L5 | Heading rule weight and style are fixed | `section.rule-full.form .cell-masthead { border-bottom: 1px solid var(--border) }`, `lib/base/base.accent-finish.css:22`; short and accent rules at `:37-56` | Editorial, Annual Report | `--rule-w`, `--rule-style` and `--rule-color` tokens defaulting to today's values, set by the preset | token |
| L6 | A finish cannot step aside for the footer or the hero | **Corrected:** `backdrop: clear` and the `spot-*` masks already clear the content box under a finish (`resolve-backdrop.js:9, :41`; `base.finish.css:257-310`). They do not cover the footer box or the hero stack | Blueprint, Riso, Field Notes | Extend the existing clear mask to the footer box and the hero stack | register value |
| L7 | No pattern finishes at the needed strength | **Corrected:** `lib/finishes/finish-generate.js:35` `TEXTURE_TYPES` already has `grid`, `dots`, `ruled`, `hatch` and `lattice`, and `ledger` is a ruled finish. Shipped finishes must be generator recipes (`checkFinishPackages`, `tools/check-ownership.js:1013`). Missing: dots sized by tone, a dark-only glow, line-height snapping | Blueprint, Riso, Field Notes | New `lib/finishes/<name>/` recipes, extending the generator only where it lacks a feature | recipe + generator |
| L8 | Sketch mode stops at the chart | The prototype's `feTurbulence` filter is the effect `lib/core/rough-ink.js:27-29` records a veto against (it collapsed Marp's print transform). The owned CLI PDF did not shrink in round 5; export-to-Marp, PPTX, WebKit and Gecko are unverified | Field Notes | Extend `rough-ink.js`, which already draws filter-free rough paths, to chart marks | fix |
| L9 | The PDF photographs the page background at 1× | Every CLI PDF page carries its background as one 1280×720 image at 96 ppi; measured on the shipped `classic` and `editorial` presets as well as the prototypes. The text and drawings stay vector (`engineering/pipeline.md` §3, "The page itself") | Every preset with a pattern or finish, in the exported PDF | Photograph the background at 2× or more, or emit pattern finishes as vector. **This changes the bytes of every exported PDF, so it needs the owner's export sign-off (Quality Bar)** | export |
| L10 | Card radius is not driven by `corners:` | `corners:` shapes only the slide surface (`lib/base/base.modifiers.css:4214`); cards read `--radius-md` from `lib/base/base.tokens.css:224`, which no register sets | Strategy House | A separate card-radius hook (`--card-radius`) that presets set; `corners: square` is the default and stamps nothing, so it cannot carry this | token |
| L11 | No second-ink token | Riso borrows `--cat-2-mark` and mixes it per mode | Riso | `--ink-2` with light and dark arms in the palette contract | token |

**Order.** L1, L2 and L3 first: together they remove every selector workaround in seven of the
eight presets that clear the floor, so each ships as a plain preset. Then L4, L5 and L10, which are
small tokens. Then L6 and L7 together, since the pattern finishes are built on the keep-out hook.
Then L8 and L11. L9 waits for the owner's export sign-off, rendered in dark and light.

## 8. The build plan (revised after the adversarial trio)

The owner: *"our plan should include fixes for these. I am also open to adding new things
(finishes, marks, etc) that help us raise the floor."* Then: *"run the trio, address any
findings."* The red team, the inversion and the checker all returned "not buildable as written."
The diagnosis held, but several mechanics did not; this section is the corrected plan. The
corrections are listed at the end.

**Rules every step follows.**

- **Registers and recipes only.** A preset is a table entry. Every rule it uses comes from the
  engine, so no deck CSS and no specificity workarounds. New finishes are `lib/finishes/<name>/`
  recipes built by the generator (`checkFinishPackages`).
- **One package, one branch from `main`, one PR** (HARD RULE #17). Every engine step gets an
  independent checker, a demo deck in dark and light (#9), a `changelog.d/` fragment (#10), its
  docs (including `lib/base/base.registers.docs.md` and `spec/LFM-1.1.md` §2.3 with the
  conformance JSON when it adds a register), and the HARD RULE #34 evidence for every new or
  changed test.
- **Existing renders do not move unless the step says so.** New tokens default to today's
  value, and CI's golden-diff job is the evidence. The stated exceptions are F6 (etch contrast)
  and the raised shipped presets (D11).
- **The overflow guard (D11).** Before a step merges, every repo deck it can reach is rendered
  before and after, and the overflow count must not rise.
- **The judging gate.** A preset is judged on a preset corpus deck of 25 to 30 slides (one or
  more per component bucket, every chart kind touched by a new mark, the dense layouts, and
  long-heading stress slides), in own, flip and house, **and in the exported PDF**. Machine gates
  run first: contrast, `tools/pixel-check.js`, `npm run check:jank` and overflow. Then two fresh
  judges, who have not seen earlier rounds, score the **worst slide**, with Classic and today's
  Editorial in the same batch as calibration anchors. The floor is 8.5 (D5).
- **The simplicity budget (D10).** No step adds a Basic-tier control or a picker tile beyond the
  five-in-view limit.

### Phase 0: preset plumbing (first, per D3)

| Step | What ships | Why |
|---|---|---|
| P0 | A reader that falls back to the preset for top-level keys (`theme`, `color-mode`, `backdrop`), threaded through the palette (`resolve-palette.js:45`), the CLI theme pick (documented in `lattice.js` PALETTE RESOLUTION), export-to-Marp (`bundle-front-matter.js`, `tools/export-marp.js:417`), `register-factory.js` reads, the Playground (`deck-config.js:266`) and the legacy `chart-finish:` alias. **Preset tokens:** a preset can set internal tokens (rule weight, rail weight, cover composition) through a stamped `preset-<name>` class with generated CSS, which reverses "a preset is not a class token" in `resolve-preset.js` (D10). The Studio mirror (`deck-preset.ts`, `deck-preset.test.ts`, `preset-register.test.js`) learns multi-word values, never strips the author's `theme:` from a tile or on Reset, and keeps tiles rendering in the deck's own theme | D1 is not "the table": `theme` and `backdrop` never reach the render through a preset today, and widening `PRESET_KEYS` alone breaks the Studio |

### Phase 1: fix the limits

| Package | Steps | What ships | Owns (files) | Depends on |
|---|---|---|---|---|
| WP-marks | F3, F6 | An ink-source word on `marks: tone` (heading ink or accent), and the shipped `etch` fill raised to 3:1 on every dark theme (a stated render change to `examples/marks.md` and the chart-finish examples) | `resolve-marks.js`, `tools/build-marks-css.js`, `chart-family.styles.generated.css`, `marks-catalog.ts`, `engineering/chart-styling.md` | none |
| WP-tokens | F4a | Tokens only, defaults equal to today: `--rule-w`, `--rule-style`, `--rule-color` (`accent-finish.css:22`, `:37-56`, `forms/cell/masthead/masthead.css:51`, split-panel's kickers), `--rail-w` (`accent-finish.css:197-198`), and a card-radius hook that excludes `--radius-full` | `base.accent-finish.css`, `masthead.css`, `split-panel.styles.css`, `base.tokens.css` | none |
| WP-clear | F5 | The existing `backdrop: clear` mask extended to the footer box and the hero stack | `base.finish.css` (the clear-mask region only), `resolve-backdrop.js` | none |
| WP-cover | F2 | A `cover:` register for the front and back cover (title and closing), stamping its own collision-free token (`cover-light`), so today's `light`, `title light` and the HTML player's `BOOKEND_FORCES_DARK` keep their tested meaning. It repaints the canvas and `--fin-canvas`, with scheme-aware inks for the subtitle, eyebrow and chrome. Dividers and `topic` keep their own surfaces. **Export:** `player-core.mjs` gains the new token, so the owner signs off on the HTML player in dark and light | the anchor components' CSS, `base.modifiers.css:1259-1320`, `base.finish.css:520-700`, `player-core.mjs`, the shared register plumbing (`plugins.js`, `runtime/index.js`, `lint.js:238`, `deck-settings*.js`, `rules/front-matter/index.js`, `components/index.js`, `surface-registers.js`, `record-registers.js`, `meta.generated.mjs`) | P0 |

WP-marks, WP-tokens and WP-clear touch disjoint files and run in parallel with P0. WP-cover
owns the shared register plumbing, so it starts after P0 lands, and later register work rebases
on it. `lint.js:238` is one line, so any two packages that add vocabulary conflict there by
construction; rebase on that real conflict (HARD RULE #16).

### Phase 2: new things that raise the floor

| Step | New | What it is | Depends on |
|---|---|---|---|
| N1 | Cover compositions | Declared as `variants` in the title and closing manifests, which `checkTypeSizeModifiers` exempts (a modifier may not set `font-size`): `masthead`, `ledger`, `column`, `label`, `stage`, `frame`, `poster`. Presets set them (D10). They graduate into the anchor galleries in a separate commit (HARD RULE #8) | WP-cover, WP-tokens, P0 |
| N2 | Finish recipes `grid`, `halftone`, `ruled`, `glow` | Generator recipes. The generator gains dots sized by tone, a dark-only glow and line-height snapping. Patterns are drawn as **vector**, so an exported PDF keeps them sharp without changing any existing PDF's bytes (L9) | WP-clear |
| N3 | Marks `sketch` and `print` | `sketch`: rough, hatched marks from `lib/core/rough-ink.js` on every chart kind, never an SVG filter. `print`: a second-ink plate offset sideways. The names avoid `color-mode: print` in the build | N4 for `print` |
| N4 | `--ink-2` | A second ink in the palette contract, satisfying `checkNoSafeDefaultTokens` and `checkThemeTokenParity` (`lib/theme/derive.js` REQUIRED_TOKENS) | none |
| N5 | Finish recipe `paper` | A paper grain that reads at thumbnail size and stays off the words | WP-clear |
| N6 | The playful preset | Bold rainbow rails through `--rail-w` | WP-tokens, P0 |
| N7 | Chalkboard | `marks: sketch` on a slate pairing | N3 |

### Phase 3: verify

| Step | Verifies |
|---|---|
| V1 | The PDF background photo (L9). The new patterns avoid it by being vector (N2). Whether today's finishes should also leave the 96-ppi photo is a separate export change that needs the owner's sign-off in dark and light; it does not block any wave |
| V2 | Every new register, recipe and mark in PDF, PPTX, ODP (`engineering/pipeline.md` §4a0 and its table), export-to-Marp (`lib/export/marp-bundle.js`), and the HTML player |
| V3 | Playwright Chromium, WebKit and Gecko in CI (D9) on the Studio picker and the preset corpus deck |
| V4 | The Studio picker within the five-in-view budget (D10): tiles render live in the deck's theme and mode, and show a cover as well as a content slide, since covers are where presets differ most; screenshots at 390, 820 and 1440 px; WebKit's retained preview frames stay bounded |
| V5 | The judging gate above, run per wave on the built engine |

### Phase 4: ship in waves (D8)

| Wave | Presets | Needs |
|---|---|---|
| 1 | Earnings, Annual Report, Strategy House, Museum, and the raised Editorial (D11) | P0, WP-marks, WP-tokens, WP-cover, N1 |
| 2 | Keynote, Blueprint, and Brand-forward's raised foot band | wave 1, WP-clear, N2 (`glow`, `grid`) |
| 3 | Riso, Field Notes, Chalkboard, a paper preset (Atelier or Letterpress), the playful preset, and Minimal's new identity | N2 (`halftone`, `ruled`), N3, N4, N5, N6, N7 |

Each wave's PR adds its presets to `PRESETS` (whose "four, on purpose" comment is rewritten for
the grouped picker), passes the overflow guard and the judging gate, and launches together.

### What the trio corrected

- F2 redefined `light`: a decided, test-pinned contract (`finish-canvas-matrix.test.js:19-20`,
  `html-player.test.js:546-605`) that the legacy `class: light` alias reaches. Replaced by its own
  `cover-light` token. `bookends` was also already the narration's term
  (`lib/core/resolve-bookends.mjs`), and `divider light` is a different layout, so the register
  is `cover:` for title and closing only.
- D1 was not "the table". It became P0, scheduled first.
- Multi-word values (`spectrum-edge: left bold`) are silently dropped by every one-word reader, so
  rule and rail weight became preset tokens (D10), not new public words.
- `corners: square` is the default and stamps nothing, so zeroing radii there would move every
  deck. Replaced by a separate radius hook.
- `marks: mono` would have matched none of the generated rules. Replaced by an ink-source word on
  `tone`.
- L1, L6 and L7 were partly wrong (above). F1 is dropped, F5 extends `backdrop: clear`, and the
  new finishes are recipes.
- Cover compositions set `font-size` and would fail `checkTypeSizeModifiers`, so they became
  component variants.
- The 4-slide sample was too small to trust and the judges had worked six rounds beside the
  maker, so a 25-to-30-slide corpus deck, worst-slide scoring, fresh judges and calibration
  anchors became the gate.
- Cadence, simplicity, the shipped presets and the agent budget were put back to the owner
  (D8, D10, D11, D12).

## Reproduce

The candidates are front-matter recipes on the four-slide deck in §1. The ten recipes are the
table in §3. The cut ones are recorded in the study gallery, together with every score.
