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

## The size scale was solved against the wrong box.

Word sizes are viewBox units, so they scale by the square root of the area ratio between the box landscape packs into and the box portrait packs into. That ratio was read off the wrong pair.

- **Landscape does not pack the full width.** It keeps the right 38% for the key rail, so it packs 682 × 320, not 1100 × 320.
- **Portrait packs all of it** — the key moves below the cloud, so the cloud gets 1100 × 760.
- The real area ratio is **3.83**, not 2.375. The scale was **1.54** where it should have been **1.96**.

The constant is now derived from those two boxes rather than restating their dimensions, so re-tuning either cannot leave the scale solved against a box nobody packs.

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

## What was verified, and what was not.

- **Every word still places.** Rendered word counts across the nine gallery slides at portrait are identical before and after: `[9, 6, 15, 8, 5, 20, 9, 9, 9]`. Growing the type bought no silent drop — which is the failure this change could most easily have caused.
- **Nothing escapes its canvas.** `.wc-svg` is `overflow: visible` on purpose, so `check-chart-fit` skips its viewBox assertion and cannot see this. Measured directly instead: worst overhang **0** on all nine slides.
- **Landscape is untouched.** Cloud extent is unchanged to the pixel — 557 × 288 and 592 × 317 on the two `chart-fit` slides.
- **Not verified:** the size key below the cloud still sets small against a 164px word. It measures 16.1px, above the legibility floor the render probe enforces, so it is left alone — resizing chart chrome is a separate design call, not this fix.
