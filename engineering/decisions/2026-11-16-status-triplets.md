---
status: in-progress
summary: >
  Each brand theme now curates a status TRIPLET per status: the fill, the ink ON it and its edge. Fills are deep on
  the light face and glowing on the dark one, so each clears 4.5:1 as painted against every surface a status mark sits
  on (the slide, the card, the hero tile, its own row tint, a kanban card) and keeps 3:1 at the back of a lit hall
  (`npm run check:glance`). The ink is the slide's own paper or night, AA 4.5:1 on the fill.
  The hues come from the theme's own brand and chart colors. The trio keeps at least half of its recorded colorblind
  separation; the a11y palettes are unchanged. Amends the one-ink rule of 2026-10-24-status-is-one-system.md.
---

# Status triplets: each theme curates its fill, ink and edge (2026-11-16)

## 1. The question

Every theme declared its own status fills, but they were near-identical: warn was `#854A00` in eight of the fourteen
brand themes and fail `#9D0800` in five. On the light face the pairwise difference between themes was below what
an eye can see (warn: a median OKLab distance of 0.011). The cause was one rule, not neglect: every status solid
carried ONE shared white ink at 7:1 (2026-10-24-status-is-one-system.md §2, chart-styling.md §3), which pins a
fill's lightness, and the status meaning pins its hue. Nothing was left to curate.

The owner asked for per-theme curation, AA throughout, and a border of its own: a fill, an ink and an edge per status.

## 2. What the owner picked, and why

Five prototype rounds on mustard, indaco and crepuscolo, each graded by an independent checker, settled it.

- **Pale tonal pills (rounds 1-3) were rejected.** They looked distinct on screen, but `check:glance` showed a
  fill at 3.3:1 against the slide falls to about 2.5:1 on a projector in a lit room, and a 2px border does not
  survive the blur at the back of a hall. Light-face warn fell to 2.5-2.8:1.
- **Option A (picked 2026-11-16): deep fills on the light face, glowing fills on the dark one.** Every fill clears
  4.5:1 against its slide as painted. Measured at the hall back row in a lit room it held 3.3-4.6:1 on every face of
  the three prototype themes. The shipped dark faces had measured 2.1-2.6:1 (48 of 54 marks below the floor).
- **The colorblind trade (picked: "half").** Deep fills share a lightness band, and lightness is what a red-green
  colorblind reader separates by. Holding the recorded separation in full forced near-black greens and pastel
  mints; dropping it entirely left pass and fail alike for those readers. The owner picked keeping at least half,
  pair by pair, under every simulated deficiency. Brand themes do not owe the colorblind floors; the a11y palettes
  do, and every status mark also draws its meaning (check, dash, cross).

## 3. The contract

Per brand theme, per face, per `marks:` intensity, solved by `tools/curate-status-triplets.js`:

| Part | Token | Rule |
|---|---|---|
| Fill | `--X-mark`, `--X-vivid-mark` | >= 4.5:1 as painted against every surface a status mark sits on: `--bg`, `--bg-alt` (a kpi card), `--accent-soft` (a hero tile), its own row tint `--X-bg` composited over `--bg` (a checklist disc on its row), and a kanban card: plain (lifted on dark), keyline, or washed in the status's own fill, which the tool recomputes for each candidate fill; hue from the theme's nearest brand or chart color in the status band |
| Ink on the fill | `--X-on-mark` | the slide's paper (light) or night (dark); >= 4.5:1 on the fill |
| Edge | `--X-edge-mark`, `--X-vivid-edge-mark` | the fill itself (it already clears 4.5:1 off the slide) |
| Signal ring | `--warn-signal-mark`, `--fail-signal-mark` | the status hue at the opposite lightness, >= 3.2:1 against both intensities' fill; on the dark face also >= 2:1 off the slide (`deepRing`) |
| Urgency | the fill trio | blocked is never quieter than at risk: on every face fail stands off the slide at least as far as warn does, and is at least as saturated |
| Accent | every status fill | >= 0.08 (OKLab) from the theme's accent, so an at-risk pill cannot read as decoration; one named exemption, cuoio's dark face at 0.045 (its gold accent sits in warn's lightness band; the reachable maximum), held by the tool's audit |
| Colorblind | the fill trio | keeps >= half of the 2026-11-15 record, pair by pair; re-recorded, then held as a ratchet |
| Shade | `--status-shade-mark` | what a mark ON a status solid steps toward, away from the status ink: black on the light face, white on the dark one (risk-matrix critical band, a state-chart status row's chips). `--on-mark-shade` stays the shade under the ONE ink, for category and neutral tiles |
| Hue fallback | per slot | a slot with no brand or chart color in its band takes the band's center hue, and the list is pinned (`test/unit/tools/curate-status-triplets.test.js`): ardesia pass, warn and fail (a slate palette with no green, amber or red), atelier pass, brina warn, crepuscolo fail, laguna warn |

The `a11y-*` palettes curate none of these. The base declares each new token's default as the pre-triplet pair (the one
ink `--on-mark`, a border in the slide ink `--X`), and `a11y-base`, which extends onyx, declares that pair itself so it
does not inherit onyx's triplet: the a11y palettes render pixel-identical to the pre-triplet engine (measured on the
demo deck, both a11y-base and a11y-deuteranopia), and so does any theme the Studio derives (follow-up below).

**Row tints moved in two themes.** The surface rule could not be met at "half" on two faces, because their row tint
sat far off its slide. Carbone's dark rows were 18% of a bright status ink; ten brand themes use 12% and carta, cuoio
and indaco 10%. A pass disc then needed a fill as light as fail, and the trio kept only 40% of its colorblind
separation. Concrete's light slide is mid-gray, and a 12% tint darkens it further, so the deep fills crowded toward
black (also 40%). Carbone's dark rows are now 12% and concrete's light rows 10%. Both faces then solve at "half", and
the owner's number stands. (Carbone's light rows, 26-30% of their own pale inks, already meet the rule.)

**Kanban cards moved on the dark face.** A kanban status pill sits on its card, and two dark cards were too light for
any trio to clear at "half": the plain card was `--bg-alt` lifted 12% toward white, and the keyline card mixed in 28%
of `--border`. The lift is now 4% and the keyline step 12%; the dark washed card and the `tinted` board's dark card,
both built on the lift, move with it. The cards stay above the slide, but closer: card against slide fell from
1.45-2.07:1 to 1.17-1.66:1 (cuoio is the lowest), the hairline border carries more of the edge, and a keyline card
now sits within a shade of a plain one. That is a visible change, put to the owner with the dark boards rendered.
Before this, 65 of the 168 brand pill-on-washed-card pairs fell below 4.5:1 (worst 3.49:1, concrete dark vivid warn);
now none does (worst 4.51:1 as the browser paints it, magnolia light at-risk).

## 4. How it is wired

- **Pointers.** `base.tokens.css` § THE STATUS TRIPLET ON THIS SLIDE adds `--state-X-on-ink` and `--state-X-edge` beside
  `--state-X-hue`, in the same slide-level block and through the same private `--_state-X-*` pointer, so the vivid
  register re-points the edge with the fill. The print band puts both back to the pre-triplet pair in the print inks.
- **Discs** (checks, checklist, obligation-matrix, `state-cells`, `heat`, roadmap). Each role line gains a fifth role,
  `--state-edge`, and its glyph mark reads `--state-X-on-ink`. A heat-inverted line reads the inverted status's pair,
  because it follows the solid it paints. Rims read `var(--state-edge, var(--state-ink))`; rails and the outline
  variants' rings stay on the slide ink, because they are lines, not borders. Neutral lines set `--state-edge:initial`
  so a neutral mark nested in a status row cannot inherit its border.
- **Chart family.** One mapping beside `--status-mark` gives every `[data-s]` member `--status-on-ink`, with the frame's
  one ink as the default. Each kind's edge channel (`--chart-status-ink`, `--fill-ink`, `--fc-hue-mark`,
  `--hs-state-ink`) points at `--state-X-edge` instead of the slide ink. The generated finish rules pick a status's
  text ink with a percent, not a fallback chain: `--finish-status-k` is 0% under pigment (the status's own ink) and
  100% under etch and tone (the heading ink on their pale washes).
- **Components.** kpi pills, policy badges and regulatory-update tiers read `--state-X-on-ink`, and kpi's rim and
  policy's badge edge read `--state-X-edge`. The risk matrix's key numbers follow their band; its target ring and path
  wear the status ink, which a brand theme curates as one ink across its statuses.

## 5. Measured

- The first cut measured each fill against `--bg` only. `check:glance` on all 28 brand faces then found three marks
  below 3:1 at the hall back row: carbone dark's checklist pass disc on its row tint (2.34:1) and kpi pass pill on
  its card (2.87:1), and concrete light's warn disc on its row tint (2.82:1). That is why the contract names every
  surface. An independent review then found kanban cards missing from the list; they are in it now.
- `check:glance` on the demo deck and a kanban deck with every status on the default, keyline and tinted boards.
  Glance now counts an HTML box as a status mark only when it is painted with one of the slide's status fills, compared
  as pixels (a kanban card is a wash of its status, not a solid, and a fill from an oklab `color-mix` serializes as
  `oklab(…)`, which a string match missed). A surface the tool cannot resolve now stops it, instead of being skipped.
- `node tools/curate-status-triplets.js --check`: all 14 brand themes meet the contract, and the tool reproduces the
  shipped theme values byte for byte (`--keep=0.5` against the pre-triplet record).
- Colorblind separation: 0 brand pairs below half of the record (worst kept 50.0%, atelier muted dark pass^fail,
  achromatopsia); 702 of the 1,344 re-recorded pairs went up, 642 down; 0 a11y pairs moved. THE COST, stated plainly:
  URGENCY lifts a dark-face fail toward pass's lightness, so for a reader with no color vision the two can sit very
  close (carta muted dark pass^fail under achromatopsia: 0.0095, half of an already small 0.019). Brand themes do not
  owe the colorblind floors (the owner's call); every status mark draws its meaning (check, dash, cross), and the a11y
  palettes carry the floors.
- `tools/composed-contrast.js` now scores text on a status solid at AA 4.5:1 for every palette, against the status's own
  ink. Before it held 7:1 on the light face; the a11y palettes' 7:1 one-ink floor is still pinned, in
  test/unit/palette/chart-solids.test.js, which decides "curates a triplet" from the theme's tokens (its edge is its
  fill), not its name.
- `test/unit/palette/chart-solids.test.js` and `chart-one-ink.test.js`: every status fill sits opposite its own ink;
  brand fills clear 4.5:1 off the slide; a11y floors unchanged.
- `tools/composed-contrast.js`: 0 regressions over 4,686 pairs (the 10 frozen redline rows are unchanged).

The design was challenged by an adversarial trio before merge. The red team found the a11y palettes inheriting onyx's
triplet, state-chart chips stepping toward their own ink on the dark face (7.15:1 down to 3.05:1), and a white chip
arrow on a glowing `live` row; all three are fixed. The inversion review found warn louder than fail on every dark face
and warn on the brand accent in cuoio and mustard; both are now rules of the contract (URGENCY, ACCENT).

## 6. What does not move

- **The status text inks** `--pass` … `--mute`. A status LINE or TEXT on the slide still paints them, and the
  colorblind floor on them (cvd-trio-floor's first table) is untouched.
- **Categories and the neutral** keep the one ink `--on-mark` and their 7:1 / 4.6:1 bars.
- **The a11y palettes**, in every token.
- **Kanban card washes**, which are status TINTS under the heading ink, not solids. On the dark face the cards under
  them moved (above): the plain, keyline, washed and `tinted` cards all sit closer to the slide.

## 7. Follow-ups

- The Studio's theme generator (`lib/theme/derive.js`) still derives the pre-triplet pair, so a generated theme keeps
  the one ink: correct and readable, but not option A. `followups.d/3232-p2-derive-status-triplets.md`.
