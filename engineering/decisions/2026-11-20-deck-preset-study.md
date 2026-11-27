---
status: blocked
summary: A study of more deck presets, scored by two independent judges over six rounds. Rounds 1 and 2 tuned recipes from today's registers and topped out at 8/10, because presets collapse into each other once the palette changes. The owner set a ship floor of 8.5 (target 9) and asked for the limiting factors to be found and solved. Rounds 3 to 6 prototyped new ingredients as deck CSS through the real engine (light covers, heavy and double rules, rail weight, one-ink charts, grid, halftone, ruled paper), and seven presets cleared 8.5 with both judges (Earnings, Annual Report, Strategy House, Museum, Keynote, Editorial, Blueprint), plus Riso with one. Every remaining workaround traces to one of eleven engine limits (§7), each with its root cause, the presets it blocks and the fix; one of them, the PDF photographing every page background at 96 ppi, changes export bytes and waited for the owner's sign-off, since given: #3336 draws a finish's backdrop instead (§7, L9). Wave 1 is parked until after 1.0 (D15, §9).
companion:
  - ./2026-09-26-deck-presets-and-settings-tiers.md
  - ./2026-11-20-slide-and-share-presets.md
---

# A study of more deck presets

**Date:** 2026-11-20 · **Status:** parked. The owner parked Wave 1 until after 1.0 (D15, 2026-11-24; §9), and draft PR #3470 holds it. The §5 decisions are owner-settled (2026-11-20), and §9 records the owner's later decisions (21 to 24 Nov). Some engine steps shipped before the park, for example #3349 (WP-marks) and #3410 (the spectrum keys)

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

Round-1 scores for all 21, from both judges, were in the study gallery. **That gallery is lost** (see Reproduce), and this table is the only copy of the round-2 scores.

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
| D12. Agent budget (owner) | Approved past the 10-agent session budget (HARD RULE #25): parallel sessions for the independent Phase-1 packages, each with its own checker and card grader, about 20 agents in all. **Superseded:** on 2026-11-21 the owner set 15 more for the rest of the build (§9) | One session; or checkers on the riskier packages only |
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

**What each preset's prototype adds.** The full recipes were in the study's round-6 `candidates.json`, which is **lost** (see Reproduce). This list and the renders in the "Ten Deck Presets" artifact are all that remain:

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
| L7 | No pattern finishes at the needed strength | **Corrected:** `lib/finishes/finish-generate.js:35` `TEXTURE_TYPES` already has `grid`, `dots`, `ruled`, `hatch` and `lattice`, and `ledger` is a ruled finish. Shipped finishes must be generator recipes (`checkFinishPackages`, `tools/check-ownership.js:1013`). Missing: dots sized by tone, a dark-only glow, line-height snapping | Blueprint, Riso, Field Notes | New `lib/finishes/<name>/` recipes, extending the generator only where it lacks a feature. **Superseded:** the owner banned generated CSS (S8 in `2026-11-21-spectrum-keys.md`), and `followups.d/3410-p2` plans to retire the finish generator, so new finishes become hand-written CSS that a gate keeps in step with their data, unless the owner records an exception | recipe + generator (superseded) |
| L8 | Sketch mode stops at the chart | The prototype's `feTurbulence` filter is the effect `lib/core/rough-ink.js:27-29` records a veto against (it collapsed Marp's print transform). The owned CLI PDF did not shrink in round 5; export-to-Marp, PPTX, WebKit and Gecko are unverified | Field Notes | Extend `rough-ink.js`, which already draws filter-free rough paths, to chart marks | fix |
| L9 | The PDF photographs the page background at 1× | Every CLI PDF page carries its background as one 1280×720 image at 96 ppi; measured on the shipped `classic` and `editorial` presets as well as the prototypes. The text and drawings stay vector (`engineering/pipeline.md` §3, "The page itself") | Every preset with a pattern or finish, in the exported PDF | Photograph the background at 2× or more, or emit pattern finishes as vector. **This changes the bytes of every exported PDF, so it needs the owner's export sign-off (Quality Bar).** **Superseded:** #3336 shipped that change with the owner's sign-off and merged on 2026-11-21. The PDF writer now draws a finish's glow, textures and fades (`engineering/pipeline.md` §4a0). Only a layer it cannot draw, such as a ghost numeral, stays in the photo, together with everything painted above it (`followups.d/3335-p14`) | export (shipped) |
| L10 | Card radius is not driven by `corners:` | `corners:` shapes only the slide surface (`lib/base/base.modifiers.css:4214`); cards read `--radius-md` from `lib/base/base.tokens.css:224`, which no register sets | Strategy House | A separate card-radius hook (`--card-radius`) that presets set; `corners: square` is the default and stamps nothing, so it cannot carry this | token |
| L11 | No second-ink token | Riso borrows `--cat-2-mark` and mixes it per mode | Riso | `--ink-2` with light and dark arms in the palette contract | token |

**Order.** L1, L2 and L3 first: together they remove every selector workaround in seven of the
eight presets that clear the floor, so each ships as a plain preset. Then L4, L5 and L10, which are
small tokens. Then L6 and L7 together, since the pattern finishes are built on the keep-out hook.
Then L8 and L11. L9 waited for the owner's export sign-off, rendered in dark and light. **Superseded:** #3336 merged with that sign-off on 2026-11-21 (L9 above).

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
  Editorial in the same batch as calibration anchors. The floor is 8.5 (D5). The corpus is
  `test/fixtures/preset-corpus.md`, the machine half is `node tools/preset-gate.js`, and the
  judges follow "The judge protocol" below.
- **The simplicity budget (D10).** No step adds a Basic-tier control or a picker tile beyond the
  five-in-view limit.

### Phase 0: preset plumbing (first, per D3)

| Step | What ships | Why |
|---|---|---|
| P0 | A reader that falls back to the preset for top-level keys (`theme`, `color-mode`, `backdrop`), threaded through the palette (`resolve-palette.js:45`), the CLI theme pick (documented in `lattice.js` PALETTE RESOLUTION), export-to-Marp (`bundle-front-matter.js`, `tools/export-marp.js:417`), `register-factory.js` reads, the Playground (`deck-config.js:266`) and the legacy `chart-finish:` alias. **Preset tokens:** a preset can set internal tokens (rule weight, rail weight, cover composition) through a stamped `preset-<name>` class with generated CSS (**superseded:** the owner banned generated CSS, S8 in `2026-11-21-spectrum-keys.md`; on #3470, not yet on `main`, each preset owns `lib/presets/<name>/<name>.css` beside its `<name>.preset.json`), which reverses "a preset is not a class token" in `resolve-preset.js` (D10). The Studio mirror (`deck-preset.ts`, `deck-preset.test.ts`, `preset-register.test.js`) learns multi-word values, never strips the author's `theme:` from a tile or on Reset, and keeps tiles rendering in the deck's own theme | D1 is not "the table": `theme` and `backdrop` never reach the render through a preset today, and widening `PRESET_KEYS` alone breaks the Studio |

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
| N2 | Finish recipes `grid`, `halftone`, `ruled`, `glow` | Generator recipes (**superseded:** no script writes CSS, S8, and `followups.d/3410-p2` plans hand-written finish stylesheets, unless the owner records an exception). The generator gains dots sized by tone, a dark-only glow and line-height snapping. Patterns are drawn as **vector**, so an exported PDF keeps them sharp without changing any existing PDF's bytes (L9) | WP-clear |
| N3 | Marks `sketch` and `print` | `sketch`: rough, hatched marks from `lib/core/rough-ink.js` on every chart kind, never an SVG filter. `print`: a second-ink plate offset sideways. The names avoid `color-mode: print` in the build | N4 for `print` |
| N4 | `--ink-2` | A second ink in the palette contract, satisfying `checkNoSafeDefaultTokens` and `checkThemeTokenParity` (`lib/theme/derive.js` REQUIRED_TOKENS) | none |
| N5 | Finish recipe `paper` | A paper grain that reads at thumbnail size and stays off the words | WP-clear |
| N6 | The playful preset | Bold rainbow rails through `--rail-w` | WP-tokens, P0 |
| N7 | Chalkboard | `marks: sketch` on a slate pairing | N3 |

### Phase 3: verify

| Step | Verifies |
|---|---|
| V1 | The PDF background photo (L9). The new patterns avoid it by being vector (N2). Whether today's finishes should also leave the 96-ppi photo is a separate export change that needs the owner's sign-off in dark and light; it does not block any wave. **Superseded:** #3336 is that change, signed off and merged on 2026-11-21, so V1 now checks that each new finish is drawn, not photographed |
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

### The judge protocol

Every wave PR runs this and records the result in its body. It is the procedure behind V5 and
the judging-gate rule above.

**1. Machine gates first.** Gate the wave's presets and the two calibration anchors in one run,
with the previous wave's run as the pixel baseline:

```
node tools/preset-gate.js --recipe <wave>/earnings.yml … --preset classic,editorial \
  --against .scratch/preset-gate/<previous run>
```

The tool renders the corpus deck in own, flip and house, as PNG and as the exported PDF, and runs
overflow (all three of the CLI's lost-content lines), text contrast (4.5:1), chart-mark fill
contrast (3:1, sampled from pixels), `check-jank` on the bookends and a card grid with the
running header or footer as the anchor, and `pixel-check` against the baseline. A preset that fails any of
them is fixed and re-run; it never reaches a judge. The anchors must pass and must not move,
unless the wave says why they did. The tool's header describes each gate.

**2. Two fresh judges.** One `checker` and one `red-team` agent, spawned for this wave only, who
have not seen an earlier round, the study's scores or each other's work. Each gets the contact
sheets (`sheet-<row>-png.png` and `sheet-<row>-pdf.png` per preset) and the full-resolution PNGs,
and nothing else: not this note, not the maker's notes, not the floor. A judge who knows the
floor is 8.5 grades toward it. Build the packet with `--packet <dir>` on the gate run: it holds
the presets that passed plus the two anchors, under shuffled letters, with untitled sheets, and it
**prints the letter-to-preset key instead of writing it**. Keep that key out of every file a judge
can reach until both have reported, and do not hand judges the run's own sheets, which carry the
preset's name in their title strip. In the first round both judges named the presets: the sheets
were the run's titled ones, and a key file sat beside the packet.

**3. Calibration anchors in the same batch.** Classic and today's Editorial are judged in the
same batch as the candidates, not labeled as anchors. Their scores calibrate the batch: if the
judges score Classic far from its earlier 7 to 8, the batch reads high or low, and the
candidates' scores are read against the anchors, not as absolutes.

**4. The rubric (§1), scored on the worst slide.** Judge A's five axes (Boardroom, Craft,
Readability, Robustness, Distinctness; a 10 needs no axis below 8; a fatal flaw caps the score
at 6) and Judge B's attack (contrast, pattern noise, hierarchy, distinctness, fit to purpose).
Each judge names the preset's worst slide in each row and in the PDF, and scores that slide,
not the average: a preset is as good as the slide a board member stops on. Contrast is measured
from full-resolution pixels, never estimated from a thumbnail.

**5. The verdict.** A preset ships when both judges score its worst slide at 8.5 or above (D5).
A split goes to the owner with both judges' worst slides attached. Judges score; they never fix.
The maker's fixes go to a new pair of judges, since a judge who saw the fix is no longer fresh.

**Cost.** Two agents per wave, counted toward the session's total (HARD RULE #25). The machine
gates cost no agents. A run over the four shipped presets, three rows each, took 14.5 minutes on the
cloud sandbox (866 s, 2026-11-21).

**The baseline (2026-11-21, the four shipped presets, `--keep-going`).** Classic, Editorial and
Minimal pass every machine gate in every row. Brand-forward fails text contrast in all three
rows: the running header and footer on its dark bookends (title, divider, closing) and the
split-panel lede measure 4.0 to 4.08:1, because its `strata` finish lifts the navy under them;
on Classic the same chrome measures 4.58:1. The engine fix is not part of the gate, so Brand-forward
goes to wave 2 as a known failure (it is raised there anyway, §3).

### The first round (2026-11-21, the four shipped presets)

Run on the baseline sheets above, at the owner's request, to exercise the protocol. Not a wave:
no candidate was judged, only the shipped presets, Classic and Editorial among them.

| Preset | Judge A (`checker`) | Judge B (`red-team`) | Worst slide, in both judges' words |
|---|---|---|---|
| Minimal | 7 | 7 | split-panel (5): the lede ends 22 to 26 px above the footer |
| Classic (anchor) | 7 | 5 | the same, and it "collapses into" Minimal: content slides differ on about 1% of pixels |
| Brand-forward | 7.5 | 5 | title (1): the footer at 4.09:1 on the dotted navy, in every row; the dot grid behind data |
| Editorial (anchor) | 7 | 6 | ruled lines strike through the kpi line and the footer; the corner glow reads as a smudge |

What the round taught, beyond the scores:

- **The judges agree with the machine gate where both measure.** Judge B measured Brand-forward's
  title footer at 4.09:1, the gate at 4.08:1; both found every other text run and mark above
  the floor (judge B's lowest dark-mode mark 3.21:1, the gate's 3:1 floor).
- **The judges see what no gate measures.** Distinctness (Classic and Minimal are one look on
  content slides, D1's finding again), texture striking text (Editorial's rules), and the one
  slide that caps every look the same way: `split-panel` bottom-anchors its panel, so the lede
  sits about 3.5 px (CSS) above the footer whatever its length, and `check-jank` reports it only
  as advisory crowding. That is an engine defect, not a corpus one (shortening the copy moved
  nothing), so it is a follow-up, and it caps every preset equally until it is fixed.
- **The anchors calibrate.** Editorial scored 7 and 6 here, against Judge A's earlier 7 on the
  four-slide deck (§3); the study never scored Classic, so 7 and 5 are its first numbers. Read a
  wave's candidates against the anchors in their own batch, not against the study's numbers.
- **The key leaked**, through the titled sheets and a key file (step 2 above; `--packet` now
  builds the packet so neither can happen).

### The second round (2026-11-21, blind)

The first round's grade asked for a round that was blind to identity. The packet came from
`--packet` (untitled sheets, the key printed and never written), and the run's named folders were
moved out of the judges' reach. Two new judges, who had seen neither round, both ended with
"Identity: unknown". Per the protocol, only the presets that passed every gate, plus the anchors,
went in, so Brand-forward was left out.

| Preset | Judge A (`checker`) | Judge B (`red-team`) | Worst slide, in the judges' words |
|---|---|---|---|
| Editorial (anchor) | 7.5 | 7 | split-panel (5) on the footer; ruled lines against the chart grids (17, 19, 20) |
| Minimal | 6.5 | 6.5 | the lone "rest." of the donut heading (18); old-style figures make "14.2%" read low (14) |
| Classic (anchor) | 6.5 | 7.5 | the same as Minimal, from which it differs by about 1% of pixels outside the bookends |

- **Blind judging works**, and it moved the scores. Editorial went from last (round 1, 7 and 6) to
  first, and Classic and Minimal fell to 6.5. Judges who could read the names graded the names.
- **Both rounds agree on the defects**: split-panel's lede on the footer (both rounds, all four
  judges), Classic and Minimal as one look, Editorial's texture against chart grids, scatter
  labels on gridlines. New in this round: old-style figures in a hero number, an orphaned word in
  a wrapped heading (18), and the stacked-bar legend's year label sitting on its first series name
  (17).
- **Checked and dismissed:** Judge B reported black 11 px notches in every corner of Minimal's
  PNG slides. Its pixel reader dropped the alpha channel: the corners are transparent (`0,0,0,0`
  at pixel 1,1, RGBA), as §2 records for rounded slides.
- **own and house are the same deck for all three**, as the gate's header says. Both judges saw it.

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

## 9. Owner decisions, 21–24 Nov

The owner made these decisions after §8, in sessions that were not this note's. Until now they
lived only in draft PR #3470's body, its comments and its commits. **Where the words come from:**
the presets desk (`session_01DPMMjEgrcv6brmaXooaAX9`) ran on Picard's account, and the session
that wrote this section runs on Kirk's account, which cannot read that transcript. So the G and
marks rows below quote the presets desk's own record of each answer in #3470, not the owner's
typing. The D15 row is the same: its words are the presets desk's record of that chat, in #3470's
handoff comment. Only the budget row quotes the owner's own answer, read from the coordinator
session's transcript (event `7afa532b-453f-480f-9dea-957c7090da46`, readable with `list_events`).
No copy of that answer exists on GitHub.

**The presets desk numbered its own decisions, and reused the numbers.** Its D1, D2 and D3 are not
§5's. In #3470 the same number names more than one thing:

- D1 is the marks floor (commit `33f3a72`).
- D2 is both the tone presets (`33f3a72`) and the agent budget (the decision comment of 2026-11-23).
- D3 is both "who does the two D6 fixes", answered "D3 A", and the open Mermaid item in the body.

So this section names each item by topic: "marks D1", "marks D2", "the session budget" and "the
Mermaid item".

| Decision | What the owner decided | Source, as recorded |
|---|---|---|
| G2. Heading size and weight | A preset changes a heading's weight, never its size: a `--heading-weight` preset hook on the base `h1`/`h2` rule. Annual Report is set to 400 on #3470, which is not merged. **The two records disagree on the number:** #3470's body says "Annual Report 500", and `3f2996d` sets 400 because Newsreader ships only 400 and 700, so 500 rendered as 400, "which is the weight the owner chose in G2". **Settled 2026-11-27:** the owner chose 400 ("D1 A", given in chat and copied to #3549: https://github.com/Laticent/lattice/pull/3549#issuecomment-7220937828), after renders showed that 500 and 600 draw identically to 400 and 700 in Newsreader. Whether heading weight becomes a public setting, such as a second word on `typography:`, is open: the owner wants more thought (`followups.d/3549-p1-heading-weight-axis.md`) | #3470 body, item 2: "G2, a `--heading-weight` preset hook on the base `h1`/`h2` rule (Annual Report 500), weight only, never size"; commit `ae181a0` dates the gap answers 2026-11-22 |
| G3. Museum's palette | Museum uses the `cuoio` theme | #3470 body, item 2: "G3, Museum on cuoio" |
| G4. Cover sizes | Covers use the three cover sizes that exist today; no new size | #3470 body, item 2: "G4, the three existing cover sizes" |
| Marks D1. The 3:1 floor under `marks: tone` | A mark passes on its fill **or** its ink edge. Every other finish is still held to its fill. Museum's palest wedge fills at 1.41:1 and its edge measures 5.19:1 | #3470 body, item 3(b): "Under `marks: tone`, a mark passes on its fill **or** its ink edge (owner's D1)"; commit `33f3a72` dates it 2026-11-23 |
| Marks D2. Which presets chart in tone | Strategy House and Annual Report use palette colors instead of tone. Tone stays on Earnings and Museum, where it is the preset's identity | #3470 body, item 3: "Strategy House and Annual Report move from tone to palette colors (owner's D2); tone stays on Earnings and Museum" |
| D15. Wave 1's timing | **Wave 1 is parked until after 1.0.** #3470 stays a draft, and its baton is released. When work resumes, #3470 first takes in #3517 (cover-layout), because its presets set `cover:` | The presets desk's record (#3470's handoff comment, 2026-11-24) of the owner in the presets-desk chat on 2026-11-23: "D14 keep working / D15 B", then "d15 do now". The command center relayed it as "tier C = park #3470 Wave 1 presets until after 1.0" (#3470's handoff comment, 2026-11-24). Issue #3518 lists #3470 under "Parked until after 1.0" |
| Agent budget for the presets lane | **15 more agents** for the rest of the preset build: the cover layouts, Wave 1's five presets and Waves 2 and 3. The coordinator asked when the lane had spent about 23, past D12's 20 | The owner, 2026-11-21 17:45:23 UTC, answering an AskUserQuestion in the coordinator session (`session_015KSkL7nmyGLB3eqQgaSLAb`, event `7afa532b-453f-480f-9dea-957c7090da46`) that asked "how many more agents may the sessions use in total?": "you are authorized for 15 but be efficient and effective." The "about 23 spent" comes from the same question's wording: "Agent use across the preset work is ~23, past the ~20 you approved". Neither is on GitHub; check them with `list_events` on that session |

**Four budget figures disagree, and the owner's 15 is the one that governs.**

- D12 in §5 says about 20 in all (2026-11-20).
- The owner's 15 more for the whole lane came on 2026-11-21, on top of the roughly 23 already
  spent.
- `followups.d/3410-p1` gives Wave 1 a budget of 5, of which #3410 used 3 (2026-11-22).
- #3470's decision card gives the presets desk session 13 in total (the session budget, numbered D2 there, 2026-11-23).

The 5 and the 13 are caps on one wave and on one session. Neither raises the lane's 15. A
session that resumes the work counts what the lane has spent against the 15 and asks the owner
before going past it.

**Open from #3470, not decided:** the Mermaid item (numbered D3 in #3470's body), about Mermaid edge labels in the
exported player. It changes export bytes and needs the owner's sign-off (#3470 body, Caveats).
The cover-layout decisions (dividers follow the mode, D16, D17) land with #3517 and are recorded there.

**What `main` lacks for marks D1.** `tools/preset-gate.js` on `main` checks the 3:1 floor against
the fill only. #3470's commit `33f3a72` adds the edge rule, but it has not merged.
`followups.d/3470-p2-preset-gate-tone-edge.md` tracks this.

## Reproduce

**Most of the study's working files are lost.** The round-6 `candidates.json` (every recipe and
its prototype deck CSS), the `gen*.mjs` scripts that built the candidates and their review
sheets, and the study gallery with the 21 round-1 scores from both judges sat in a session
scratchpad. That session ended, and none of them was committed. What survives:

- This note: the §1 method, the §3 recipes and round-2 scores, the §6 summary of each prototype
  and its round-6 scores, and the §7 limits.
- The only copy of the renders is in two private artifacts the owner can open:
  - [Ten Deck Presets](https://claude.ai/artifact/Vgt34JQTsneQAvMa18zFuB). It shows 33 round-6
    renders (11 presets, 3 slides each) and stores 30 earlier-round renders beside them, 63 images
    in all. It predates the trio's §7 and §8 corrections, so its limits list disagrees with §7 on
    seven points:
    - **L1:** it proposes a `--deck-backdrop` hook. §7 needs no fix, because engine finishes paint
      on `.backdrop`.
    - **L2:** it proposes a `cover: light` register. §7 has a `cover:` register for title and
      closing that stamps its own `cover-light` token and leaves `light` alone.
    - **L3:** it proposes a `marks: mono` value. §7 adds an ink-source word on `marks: tone`.
    - **L4:** it exposes rail weight as a public `rail: hair|bold` word. §7 keeps `--rail-w`
      internal to presets (D10).
    - **L6:** it proposes a new keep-out hook. §7 extends the existing `backdrop: clear` mask.
    - **L7:** it says no pattern finishes exist. §7 finds them in the generator.
    - **L10:** it has `corners: square` zero the card radii. §7 adds a separate `--card-radius`
      hook, because `corners: square` is the default.
  - [Studio Presets Prototype](https://claude.ai/artifact/MivFdXxULa8BJiYTe1wxKy): 24 renders of
    Classic and Editorial under the slide looks, from the companion study
    `2026-11-20-slide-and-share-presets.md`.

To rerun a candidate, write its §3 recipe as front matter on a four-slide deck (`title`,
`cards-grid`, `bar`, `big-number`) and render it with `node dist/lattice.js` at 2560×1440 in own,
flip and house (§1). A prototype's deck CSS cannot be rebuilt from this note. The build replaces
it anyway (§8), and the judging gate runs on `test/fixtures/preset-corpus.md` through
`node tools/preset-gate.js`, not on these recipes.
