---
marp: true
size: portrait
theme: indaco
paginate: true
header: "Lattice · word-cloud portrait"
---

<!-- _class: title silent -->

# A cloud should fill the axis a tall slide has.

`word-cloud · portrait · 2026-09-15`

At portrait the cloud packs into a box nearly three times the area of its landscape one. Its type has to grow with that box, or the words cluster in the middle of a canvas they cannot fill.

---

<!-- _class: content -->

## The scale was solved against the wrong box.

Word sizes are viewBox units. They scale by the square root of the area ratio between the two boxes the packer packs into — and that ratio was read off the wrong pair.

- **Landscape does not pack the full width.** It keeps 38% for the key rail: 682 × 320.
- **Portrait packs all of it.** The key moves below the cloud: 1100 × 760.
- So the ratio is **3.83**, not 2.375 — a scale of **1.96**, not 1.54.

---

<!-- _class: content -->

## A constant is still the wrong shape.

Growing the type costs words. An unplaced word is gone from the *artifact*, not just the picture — it reaches no `data-label`, no note, no description.

- A 24-term `dense` deck painted **22 of 24** at the flat scale. The old constant painted all 24.
- Our gallery is **blind** to this: it paints the same count at every scale in the range.
- So the scale is a **ladder**, largest-first, keyed on how many words place.

Its floor rung is no scaling at all. Every shipped slide still takes the top rung.

---

<!-- _class: word-cloud -->

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

<!-- _class: word-cloud dense -->

## dense packs the cloud tight.

- migration `6`
- tenancy `5`
- latency `5`
- audit `4`
- retention `4`
- failover `3`
- quotas `3`
- schema `2`
- backfill `2`
- egress `1`

---

<!-- _class: word-cloud constellation -->

## constellation scatters the words like stars.

- forecast `5`
- pipeline `4`
- attainment `4`
- churn `3`
- expansion `3`
- renewal `2`
- discount `2`
- ramp `1`

---

<!-- _class: word-cloud focal -->

## focal crowns one word the center.

- trust `8`
- clarity `3`
- cadence `3`
- proof `2`
- candor `2`
- follow-through `2`
- brevity `1`

---

<!-- _class: word-cloud dense -->

## Stress test — twenty terms, and not one of them lost.

- reliability `512`
- throughput `340`
- observability `280`
- rollback `210`
- provisioning `170`
- sharding `140`
- quorum `120`
- compaction `95`
- eviction `80`
- warmup `70`
- ingress `60`
- backpressure `50`
- fanout `42`
- checkpoint `36`
- replay `30`
- skew `25`
- drift `20`
- jitter `15`
- starvation `9`
- thrash `5`

---

<!-- _class: content -->

## What was verified.

- **The ladder beats the constant.** A 15-phrase portrait deck paints 11 words before, 10 at the flat scale, **12** with the ladder.
- **Nothing escapes its canvas.** Worst overhang **0** across the gallery — measured directly, because `overflow: visible` makes `check-chart-fit` skip it.
- **Landscape is byte-identical** — one pack at scale 1.
- **The packer's drops are now reported.** That found a real one on its first run: a shipped deck has been losing a word at landscape since before this work (#2231).

---

<!-- _class: content -->

## What was not.

The size key under the cloud renders at **14.2px** against a 13.5px floor — a 5% margin, and this change did not move it. Resizing chart chrome is a separate call.

That number is worth its own line: it was first reported here as 16.1px, which is the *declared* size. A viewBox `meet` scale of 0.884 sits between the declaration and the reader.
