---
status: in-progress
summary: >
  Each brand theme now curates its status colors. On the LIGHT face it curates a triplet per status: a deep fill, the
  slide's paper as the ink on it, and the fill as its own edge, each fill clearing 4.5:1 against every surface a status
  mark sits on, so it reads at the back of a lit hall (`npm run check:glance`). On the DARK face a status is a chart
  solid like the categories beside it, solved the way lib/theme/chart-solids.js solves it, with the theme's own hues and
  palette strength: the one ink, an edge in the status ink, and the established dark order. The owner picked that over
  back-row reach on dark so a status chart and a category chart read as one design language. The trio keeps at least
  half of its recorded colorblind separation; the a11y palettes keep their tokens. Amends 2026-10-24-status-is-one-system.md.
---

# Status triplets: each theme curates its status colors (2026-11-16)

## 1. The question

Every theme declared its own status fills, but they were near-identical: warn was `#854A00` in eight of the fourteen
brand themes and fail `#9D0800` in five. On the light face the pairwise difference between themes was below what an
eye can see (warn: a median OKLab distance of 0.011). The cause was one rule, not neglect: every status solid carried
ONE shared white ink at 7:1 (2026-10-24-status-is-one-system.md §2, chart-styling.md §3), which pins a fill's
lightness, and the status meaning pins its hue. Nothing was left to curate.

The owner asked for per-theme curation, AA throughout, and a border of its own: a fill, an ink and an edge per status.

## 2. What the owner picked, and why

Five prototype rounds on mustard, indaco and crepuscolo, each graded by an independent checker, settled the light face.

- **Pale tonal pills (rounds 1-3) were rejected.** They looked distinct on screen, but `check:glance` showed a fill at
  3.3:1 against the slide falls to about 2.5:1 on a projector in a lit room, and a 2px border does not survive the
  blur at the back of a hall.
- **Option A: deep fills on the light face.** Every fill clears 4.5:1 against every surface it sits on.
- **The colorblind trade (picked: "half").** The trio keeps at least half of its recorded separation, pair by pair,
  under every simulated deficiency. Brand themes do not owe the colorblind floors; the a11y palettes do, and every
  status mark also draws its meaning (check, dash, cross).
- **The dark face: one design language (picked: B, after option A shipped glowing dark fills).** Option A first made
  the dark fills glow too (lightness 0.67-0.83), so they cleared 4.5:1 off every surface. Set beside a category chart
  they read as a second system: the category fills sit at 0.47-0.59, most at 0.55-0.58, and the glowing status fills were pastels next to
  them. The owner chose matching the categories over back-row reach on dark: "they match, but status is hard to read
  from the back again." Light already matched (status 0.30-0.51 against categories 0.29-0.49).

The dark face did not need a new design. The system already had one, and the first cut of B rediscovered it the hard
way: 2026-10-24-status-is-one-system.md §3 records that under the one ink a dark fill "tops out near 0.18 luminance"
and cannot clear 3:1 against a tinted row, which is why a status mark wears a rim in its status ink; the token ledger
(2026-10-24-chart-color-token-ledger.md §3) makes a category and a status one concept, the SOLID, with one bar; and
lib/theme/chart-solids.js places each status at a fixed position across the dark band (`DARK_SPREAD`: at risk at the
white bar, done at the slide's limit, blocked between and the most saturated), an order the owner kept when the finish
review asked (2026-10-28-finish-invariant.md §5, item 3). Holding dark fills to 4.5:1 off every surface threw all three
away, and an URGENCY rule added for the glowing fills then fought the established order and squeezed the trio, which is
what made "half" look unreachable on eight themes. With the established rules back, all fourteen keep half.

## 3. The contract

Per brand theme, per face, per `marks:` intensity, solved by `tools/curate-status-triplets.js`:

| Part | Light face | Dark face |
|---|---|---|
| Fill | >= 4.5:1 as painted against every surface a status mark sits on: `--bg`, `--bg-alt` (a kpi card), `--accent-soft` (a hero tile), its own row tint `--X-bg` over `--bg`, and a kanban card (keyline, or washed in the status's own fill, recomputed per candidate) | a chart solid: white (`--on-mark`) at 4.6:1 on it and 3:1 off the slide, at its `DARK_SPREAD` position; its edge stands it off a tinted row or a card |
| Hue | the theme's nearest brand or chart color in the status band; blocked held to red (20-32 degrees, `FAIL_RED`) | the same anchor, held inside the chart solids' `HUE_BAND`, blocked to the same red; where the trio would keep less than half its colorblind separation, done turns toward blue-green and blocked toward crimson (never past 17 degrees), the least total turn that keeps it |
| Strength | the anchor's own chroma | `STATUS_CHROMA` scaled by the palette's strength (its categories' mean chroma), so a muted palette's status stays muted beside its categories |
| Ink on the fill (`--X-on-mark`) | the slide's paper, >= 4.5:1 | the one ink `--on-mark`, >= 4.6:1 |
| Edge (`--X-edge-mark`) | the fill itself | the status ink `--X` (the rim of 2026-10-24 §3) |
| Signal ring | the status hue at the opposite lightness, >= 3.2:1 against both intensities' fill | bright, 2:1 off its fill and 3.2:1 off the slide (chart-solids) |
| Order | at risk sits at least 0.06 lightness above blocked (`LIGHT_SPREAD`), so the two exceptions never read as one heavy mass; URGENCY: blocked stands off the slide at least as far as at risk, and is at least as saturated. One named exemption: concrete at 0.02, the reachable maximum on its mid-gray slide (`SPREAD_EXEMPT`, held by the audit, stale-checked) | the established dark order (`DARK_SPREAD`): at risk lightest, done deepest, blocked between and the most saturated |
| Accent | every status fill >= 0.08 (OKLab) from the accent; cuoio and mustard hold 0.04 on light (at risk beside a gold accent), burgundy too (blocked beside a red one), so at risk can sit above a blocked that reads red | the same; no exemption |
| Colorblind | the fill trio keeps >= half of the 2026-11-15 record, pair by pair; re-recorded, then held as a ratchet | the same |
| Shade (`--status-shade-mark`) | black: what a mark ON a status solid steps toward, away from its light ink | black, for the same reason; on both faces the audit holds it 7:1 or more from the status ink, so a chip never steps toward its own text |

Hue fallback: a slot with no brand or chart color in its band takes the band's center hue, and the list is pinned
(`test/unit/tools/curate-status-triplets.test.js`): ardesia pass, warn and fail (a slate palette with no green, amber
or red), atelier pass, brina warn, crepuscolo fail, laguna warn.

On dark, at risk's anchors (69-97 degrees, amber to yellow) all sit outside the band (45-62), so every theme's dark at
risk is the band's edge, as on `main`. Done keeps the theme's own hue (or, for ardesia and atelier, the band-center
fallback; magnolia's 168 degrees sits at the band's 165 edge) in nine themes: brina, carta, crepuscolo and
indaco turn it 10 degrees toward blue-green and laguna 15, to keep half.

**Blocked is red, on both faces.** An independent scoring of the first cut found indaco's dark blocked a raspberry
magenta (it took indaco's chart color 4) on a slide whose title said "in the red", and mustard's and cuoio's light at
risk and blocked at one lightness, so their risk matrix read as one brown mass. So blocked's hue is held to 20-32
degrees (pure red is 29): atelier, brina, burgundy, carbone, indaco and magnolia move up from a crimson or raspberry,
carta's light orange comes down to 32; on dark, carta and crepuscolo turn to 17 to keep half. And on light at risk now
sits at least 0.06 above blocked (concrete 0.02), which deepens blocked where the accent holds at risk down (cuoio,
mustard; burgundy's blocked, kept off its own deep-red accent, is the deepest, L 0.30).

A second scoring found that cure worse than the defect on the warm themes: blocked at L 0.30-0.34 read maroon-black or
brown, not red, and at risk dark khaki. So on light blocked must also READ red (`LIGHT_RED`: lightness 0.38 or more,
chroma 0.14 or more), and the spread comes from at risk sitting higher, not blocked sinking. Cuoio and mustard can only
lift at risk if it comes closer to their gold accent, so their light faces hold the accent floor at 0.04 instead of
0.08 (`ACCENT_EXEMPT`, named and audited). Burgundy holds 0.04 too, for blocked: its accent is itself a deep red, so
a blocked that reads red sits 0.048 from it (0.072 vivid); its at risk stays 0.15 away. The cost: in cuoio and mustard done
deepens to a near-black green to keep the trio apart for a colorblind reader, and at risk is a dark gold, since a light
fill under the slide's paper at 4.5:1 cannot be a bright amber. Concrete keeps its deep fills: its `SPREAD_EXEMPT`
entry waives both the full spread (it holds 0.02) and the reads-red floor (its blocked, `#73000B`, sits at L 0.35), since
its mid-gray slide leaves no lighter fill that clears 4.5:1 against every surface.

**The light hues are banded, as the dark ones are.** A third scoring still put cuoio's, mustard's and burgundy's light
at risk at khaki (82-84 degrees, anchored on a gold accent) and their light trio at olive-black / khaki / oxblood. The
owner set the bar: no worse than `main` (scored on the same rubric: light 6.5, dark 6), aiming for 9. So the light face now
holds each status inside the chart solids' bands too (`LIGHT_BAND`): done 120-165, at risk 45-70 (a gold at most, not
khaki), blocked 20-32, pilot 200-255 (out to a theme's own brand blue; pilot is not in the colorblind trio). The theme's
own hue is kept wherever it falls inside its band. At risk now sits at about 70 degrees on every theme: amber has little
room to differ between brands, and the per-theme character shows in done, blocked, pilot and each fill's depth instead.

The `a11y-*` palettes curate none of this. The base declares each triplet token's default as the one-ink pair (the ink
`--on-mark`, an edge in the slide ink `--X`), and `a11y-base`, which extends onyx, declares that pair itself so it does
not inherit onyx's triplet. Any theme the Studio derives keeps the pair too (follow-up below).

**One row tint moved.** Concrete's light slide is mid-gray, and a 12% status tint darkens it further, so the deep light
fills crowded toward black and kept only 40% of their colorblind separation. Concrete's light rows are now 10%, a level
carta, cuoio and indaco already use. (An earlier cut also moved carbone's dark rows and two dark kanban cards, for the
4.5:1 dark rule; the dark face no longer holds that rule, so they are back as they were on `main`.)

## 4. How it is wired

- **Pointers.** `base.tokens.css` § THE STATUS TRIPLET ON THIS SLIDE adds `--state-X-on-ink` and `--state-X-edge` beside
  `--state-X-hue`, in the same slide-level block and through the same private `--_state-X-*` pointer, so the vivid
  register re-points the edge with the fill. The print band puts both back to the one-ink pair in the print inks.
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
  policy's badge edge read `--state-X-edge`. The risk matrix's key numbers wear their status's ink; its target ring and
  path wear the status ink, which a brand theme curates as one ink across its statuses.
- **No second adjustment on a curated fill (the owner's call, 2026-11-16).** A status solid wears the theme's fill as
  the theme curated it; only a finish (etch, tone) changes its strength. The pigment finish used to take the risk
  bands, the risk key and a slope chart's signal lines 28-42% toward the slide on the dark face, because the one shared
  set of vivid fills was "a fire-engine block" there. The bands, key and lines now wear `--state-X-hue` on both faces;
  critical keeps its one designed step (82% fail toward `--status-shade-mark`, as risk-matrix.styles.css has it).
  Washes stay washes: kanban cards, journey moods, bullet bands and state-chart groups are tints by design.

- **Tone's one status level** (`tools/build-marks-css.js` `TONE_STATUS`). Under tone a status kept its own hue at the
  text level, a 30% wash on light and 35% on dark, beside category shades that start at 92%: on light the status chart
  read faded next to its pie, and on dark it all but vanished. It is now 40% on light, the most at which the heading
  ink keeps 4.5:1 on every theme (concrete's mid-gray slide and laguna's done set it), and 88% on dark (the least at which the status ink keeps 5:1 on
  every palette, a11y included; 80% left the a11y dark faces at 4.0), still one level per finish (#2908). On dark the body is a strong mix of the fill, so its text is the status's own ink
  (`--finish-status-k-d`: white on a brand theme, near-black on an a11y palette's bright dark face); a first cut kept the
  heading ink there and `tools/chart-finish-reach.mjs` found 192 text runs under 4.5:1, most on the a11y palettes.

## 5. Measured

- **One design language.** Dark status fills sit at lightness 0.46-0.57 beside category fills at 0.47-0.59 (most at
  0.55-0.58), against 0.67-0.83 for the glowing cut. Rendered: a category chart beside a status chart under
  pigment, etch and tone on indaco, onyx, mustard, carta, ardesia and cuoio dark, each pair reading in one register.
  Blocked stays the most saturated mark, which is the chart solids' design ("the exceptions carry the color"); beside
  ardesia's near-gray categories that reads as a status should.
- **The cost, on the dark face.** A status no longer reaches the back of a lit hall there. `check:glance` on the demo
  deck, hall back row, lit room, all 14 dark faces: 596 of 812 marks below 3:1, worst 1.65:1 (the risk key's critical
  disc, drawn deeper than blocked so its white number reads; its signal ring and the cells' crosses mark it). That is
  `main`'s level, measured with `main`'s engine on the same deck: indaco dark 44 of 58 below (median 2.66:1) on `main`
  against 47 of 58 (2.61:1) here, onyx dark 40 of 58 (2.71:1) on both. The categories beside them sit at the same
  lightness and carry the same limit; nothing measures them yet.
- **The light face** is untouched by B (0 light values changed). `check:glance` on the demo deck and a kanban deck
  with every status on the default, keyline and tinted boards: every light-face mark clears 3:1 at the hall back row,
  worst 3.05:1 (concrete). Glance counts an HTML box as a status mark only when it is painted with one of the slide's
  status fills, compared as pixels, measures `::before` discs and the risk key, and a surface the solver cannot resolve
  stops it.
- `test/unit/tools/curate-status-triplets.test.js` breaks each dark rule on indaco (a glowing fill, a fill too deep for
  the slide, a night ink, an edge in the fill, a shade toward the ink) and requires the audit to report it.
- `node tools/curate-status-triplets.js --check`: all 14 brand themes meet the contract, and the tool reproduces the
  shipped theme values byte for byte (`--keep=0.5` against the pre-triplet record).
- Colorblind separation: 0 brand pairs below half of the record on either face; 0 a11y pairs moved. Every status mark
  also draws its meaning, and the a11y palettes carry the floors.
- `test/unit/palette/chart-solids.test.js` decides per face whether a theme curates the triplet (its edge is its fill):
  light status rows face the triplet bars, dark status rows the chart-solid bars every category faces.
- `tools/composed-contrast.js`: 0 regressions over 4,686 pairs (the 10 frozen redline rows are unchanged).

The design was challenged by an adversarial trio before merge. The red team found the a11y palettes inheriting onyx's
triplet, state-chart chips stepping toward their own ink on the dark face, and a white chip arrow on a glowing `live`
row; all three are fixed, and the last two no longer arise now that dark fills are mid-tone under a light ink. The
inversion review found warn louder than fail on the glowing dark faces and warn on the brand accent in cuoio and
mustard; URGENCY answered the first on the light face, and the dark face now follows the established order instead.

## 6. What does not move

- **The status text inks** `--pass` … `--mute`. A status LINE or TEXT on the slide still paints them, and the
  colorblind floor on them (cvd-trio-floor's first table) is untouched.
- **Categories and the neutral** keep the one ink `--on-mark` and their 7:1 / 4.6:1 bars.
- **The a11y palettes**, in every token.
- **Kanban**: its cards and washes are as on `main`.

## 7. Follow-ups

- The Studio's theme generator (`lib/theme/derive.js`) still derives the one-ink pair, so a generated theme keeps the
  one ink on both faces: correct and readable, but not the light-face triplet. `followups.d/3232-p2-derive-status-triplets.md`.
