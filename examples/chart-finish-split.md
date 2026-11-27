---
marp: true
size: 16:9
theme: indaco
pagination: true
header: "chart-finish · color-intensity"
---

<!-- @meta{layout=title, header="", footer="Each slide names the one setting it wears; everything else is the default"} -->

# `marks:` is now two keys

`chart-finish · color-intensity`

`chart-finish:` picks how charts draw color. `color-intensity:` picks how loud the status colors are. The old line `marks: tone ink vivid` is now `chart-finish: tone ink` and `color-intensity: vivid`.

---

<!-- @meta{layout=bar, footer="Nothing set: the default finish, pigment"} -->

`chart-finish: pigment · the default`

## Pigment fills each bar with its full color.

- North America
  - FY24 `3.1`
  - FY25 `3.6`
  - FY26 `4.2`
- EMEA
  - FY24 `1.7`
  - FY25 `2.4`
  - FY26 `3.1`
- APAC
  - FY24 `1.2`
  - FY25 `1.5`
  - FY26 `1.8`

---

<!-- @meta{layout=bar, class=chart-finish-etch, footer="Same as writing chart-finish: etch in the front matter"} -->

`chart-finish: etch`

## Etch draws a pale bar inside a strong outline.

- North America
  - FY24 `3.1`
  - FY25 `3.6`
  - FY26 `4.2`
- EMEA
  - FY24 `1.7`
  - FY25 `2.4`
  - FY26 `3.1`
- APAC
  - FY24 `1.2`
  - FY25 `1.5`
  - FY26 `1.8`

---

<!-- @meta{layout=bar, class=chart-finish-tone, footer="Same as writing chart-finish: tone in the front matter"} -->

`chart-finish: tone`

## Tone draws every bar in one color, light to dark.

- North America
  - FY24 `3.1`
  - FY25 `3.6`
  - FY26 `4.2`
- EMEA
  - FY24 `1.7`
  - FY25 `2.4`
  - FY26 `3.1`
- APAC
  - FY24 `1.2`
  - FY25 `1.5`
  - FY26 `1.8`

---

<!-- @meta{layout=bar, class=chart-finish-tone chart-finish-ink, footer="Same as writing chart-finish: tone ink in the front matter"} -->

`chart-finish: tone ink`

## Tone ink uses the heading color instead.

- North America
  - FY24 `3.1`
  - FY25 `3.6`
  - FY26 `4.2`
- EMEA
  - FY24 `1.7`
  - FY25 `2.4`
  - FY26 `3.1`
- APAC
  - FY24 `1.2`
  - FY25 `1.5`
  - FY26 `1.8`

---

<!-- @meta{layout=bar, class=chart-finish-tone chart-finish-accent, footer="Same as writing chart-finish: tone accent in the front matter"} -->

`chart-finish: tone accent`

## Tone accent uses the theme's accent color.

- North America
  - FY24 `3.1`
  - FY25 `3.6`
  - FY26 `4.2`
- EMEA
  - FY24 `1.7`
  - FY25 `2.4`
  - FY26 `3.1`
- APAC
  - FY24 `1.2`
  - FY25 `1.5`
  - FY26 `1.8`

---

<!-- @meta{layout=progress, footer="Nothing set: the default intensity, muted"} -->

`color-intensity: muted · the default`

## Muted keeps the status colors calm.

- Signal intake `92%` `on-track`
- Scoring policy `68%` `at-risk`
- Calibration cadence `34%` `deferred`
- Adoption `12%` `blocked`

---

<!-- @meta{layout=progress, class=color-intensity-vivid, footer="Same as writing color-intensity: vivid in the front matter"} -->

`color-intensity: vivid`

## Vivid makes the same status colors louder.

- Signal intake `92%` `on-track`
- Scoring policy `68%` `at-risk`
- Calibration cadence `34%` `deferred`
- Adoption `12%` `blocked`

---

<!-- @meta{layout=closing, header="", footer="Old decks: lint:deck --fix writes the two new lines"} -->

## One key for the chart's look, one for how loud status reads.

- `chart-finish:` pigment, etch or tone, plus ink or accent under tone
- `color-intensity:` muted or vivid
- `marks:` no longer does anything
