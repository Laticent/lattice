---
marp: true
theme: indaco
pagination: true
header: "Lattice · word-cloud"
---

<!-- @meta{layout=title, class=silent} -->

# word-cloud

`Evidence · Canvas · Series`

Spiral-packed word cloud — items sized by weight.

---

<!-- @meta{layout=word-cloud, footer=Default · word-cloud} -->

## Weight is meaning in a word cloud.

- time-to-value `5`
- security `4`
- onboarding `4`
- pricing `3`
- integrations `3`
- support `2`
- roadmap `2`
- contracts `1`
- residency `1`


---

<!-- @meta{layout=word-cloud, class=constellation, footer="constellation · word-cloud constellation — Words scattered like stars."} -->

## constellation scatters the words like stars.

- component `5`
- manifest `4`
- function `3`
- form `3`
- substance `2`
- gallery `1`


---

<!-- @meta{layout=word-cloud, class=dense, footer="dense · word-cloud dense — The cloud packed tight."} -->

## dense packs the cloud tight.

- component `5`
- manifest `5`
- function `4`
- form `4`
- substance `4`
- gallery `3`
- folder `3`
- variant `3`
- universal `2`
- cascade `2`
- scaffolder `2`
- bundler `1`
- transform `1`
- selector `1`
- palette `1`


---

<!-- @meta{layout=word-cloud, class=spectrum, footer="spectrum · word-cloud spectrum — Words colored along a scale."} -->

## spectrum colors the words along a scale.

- component `5`
- manifest `4`
- function `4`
- form `3`
- substance `3`
- gallery `2`
- variant `2`
- universal `1`


---

<!-- @meta{layout=word-cloud, class=focal, footer="focal · word-cloud focal — One word crowned the center."} -->

## focal crowns one word the center.

- variants `5`
- gallery `2`
- manifest `2`
- docs `1`
- declared `1`


---

<!-- @meta{layout=word-cloud, class=dense, footer="Stress test · word-cloud — The densest cloud that still reads."} -->
<!-- @meta{stress-slide} -->

## Stress test — 20 terms, raw frequency counts, 512 down to 5.

- component `512`
- variant `327`
- manifest `261`
- gallery `204`
- function `168`
- form `139`
- substance `116`
- transform `94`
- selector `77`
- palette `63`
- cascade `51`
- bundle `42`
- scaffolder `34`
- token `28`
- normalize `22`
- packer `17`
- spiral `13`
- footer `9`
- eyebrow `7`
- watermark `5`


---

<!-- @meta{layout=word-cloud, class=dark, footer=Composition: dark · word-cloud dark} -->

## Weight is meaning in a word cloud.

- time-to-value `5`
- security `4`
- onboarding `4`
- pricing `3`
- integrations `3`
- support `2`
- roadmap `2`
- contracts `1`
- residency `1`


---

<!-- @meta{layout=word-cloud, class=compact, footer=Composition: compact · word-cloud compact} -->

## Weight is meaning in a word cloud.

- time-to-value `5`
- security `4`
- onboarding `4`
- pricing `3`
- integrations `3`
- support `2`
- roadmap `2`
- contracts `1`
- residency `1`


---

<!-- @meta{layout=word-cloud, class=accent, footer=Composition: accent · word-cloud accent} -->

## Weight is meaning in a word cloud.

- time-to-value `5`
- security `4`
- onboarding `4`
- pricing `3`
- integrations `3`
- support `2`
- roadmap `2`
- contracts `1`
- residency `1`


---

<!-- @meta{layout=cards-grid, class=three claim-hero, footer=Anti-patterns · word-cloud} -->

## When NOT to reach for word-cloud.

- Precise comparisons
  - If the audience needs to know that 'manifest' is 1.6× 'function', the spiral packing actively misleads. Use `progress` or a bar chart where the eye can compare lengths directly.
- Two or three words
  - A three-word cloud is a list with extra steps. Use `stats` for a metric row or `big-number` for a single weighted headline.
- Multi-word phrases
  - Each li should be a single token. Multi-word phrases blow out the layout and crowd the spiral; if your data is phrases, normalize to keywords first or use `quote` for verbatim text.

---

<!-- @meta{layout=closing, class=silent index} -->

## See also.

`Related components`

- `progress` — the weights need precise visual comparison
- `stats` — the headline metrics are independent numbers, not a corpus
- `piechart` — the items are parts of a whole, not free-form themes
- `quote` — the verbatim language matters more than the frequency
- `list` — single-line takeaways — the `takeaway` variant
