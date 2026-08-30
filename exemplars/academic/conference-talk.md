---
marp: true
size: 4k
theme: indaco
paginate: true
header: "Rumor cascades · Conference talk"
---

<!-- _class: title silent -->
<!-- tier: short -->

`WebSci '26 · Session 4B · 12 min`

# Rumors travel faster than corrections — and we can predict which ones

A structural signature of misinformation cascades, learned from 1.2M shares.

---

<!-- _class: content -->
<!-- tier: short -->

## We can flag a viral rumor in its first hour — from shape alone, not content.

Corrections always lag the rumor they chase. We asked whether the *structure* of early sharing — who reshares whom, how fast, how broad — predicts a false cascade before fact-checkers weigh in. It does, with 0.81 AUC at hour one.

---

<!-- _class: content -->
<!-- tier: standard -->

## The problem: by the time a rumor is labeled false, it has already arrived.

On the platform we study, the median verified rumor reaches 60% of its eventual audience before any correction is posted. Content-based detectors need the text to be flagged first. We wanted a signal that fires earlier — from the cascade itself.

- Median time-to-correction: 11.4 hours.
- Median time-to-60%-reach: 2.1 hours.

---

<!-- _class: content -->
<!-- tier: short -->

## Our claim: false cascades are structurally distinct from true ones, early.

True news spreads broad and shallow — many people share it once. Rumors spread deep and narrow — long chains of reshare-of-reshare. That shape difference is visible in the first hour, before the audience peaks.

---

<!-- _class: content -->
<!-- tier: short -->

## Method: 1.2M shares across 4,300 labeled cascades, modelled as growing trees.

We reconstructed each cascade as a reshare tree, sampled it at fixed time slices, and extracted twelve structural features per slice. A gradient-boosted classifier predicts the eventual fact-check verdict from the hour-one snapshot.

- Ground truth: three independent fact-check organisations, majority label.
- Strict temporal split — train on 2023–24, test on 2025.

---

<!-- _class: radar -->
<!-- tier: short -->

`Structural features · 0–10 (normalized)`

## False cascades are deeper, faster, and less broad than true ones.

- False rumors
  - Depth `9`
  - Velocity `8`
  - Breadth `3`
  - Reciprocity `7`
  - Bot share `6`
- True news
  - Depth `4`
  - Velocity `5`
  - Breadth `9`
  - Reciprocity `3`
  - Bot share `2`

---

<!-- _class: stats -->
<!-- tier: standard -->

`Held-out 2025 test set · n = 1,040 cascades`

## What the structural classifier delivers at one hour.

`Compared against a content-only baseline on the identical split.`

1. 0.81
   - AUC at hour 1
2. +0.17
   - over content baseline
3. 73%
   - precision @ 50% recall
4. 1.0 h
   - median lead time gained

---

<!-- _class: content -->
<!-- tier: standard -->

## The single most predictive feature is structural virality, not volume.

Raw share count barely helps — popular true stories look popular too. What separates a rumor is *structural virality*: the average distance between any two nodes in the tree. Rumors build long chains; news builds wide fans.

- Structural virality alone reaches 0.74 AUC.
- Adding the other eleven features lifts it to 0.81.

---

<!-- _class: content -->
<!-- tier: full -->

## Ablation: drop the bot-account features and performance barely moves.

We worried the model was just an automation detector. Removing every bot-related feature cost only 0.02 AUC. The structural signal is about human resharing behavior, not coordinated inauthentic accounts — rumors spread deep because people, not bots, pass them along.

---

<!-- _class: content -->
<!-- tier: full -->

## Threats to validity we want you to push on.

The labels come from English-language fact-checkers; the signature may not transfer across languages or platforms. And a model that predicts virality could be gamed by adversaries who flatten their cascades on purpose. We treat this as a triage aid, not a verdict.

- Single-platform, single-language — generalisation untested.
- Adversarial robustness is future work.

---

<!-- _class: content -->
<!-- tier: full -->

## What changes if you can flag a rumor at hour one instead of hour eleven.

A ten-hour head start moves the intervention from cleanup to containment — friction prompts, reduced amplification, earlier human review. We are not proposing automated removal; we are proposing the clock start earlier.

- Pilots route hour-one flags to human moderators, not auto-action.
- The earlier the flag, the smaller the eventual audience.

---

<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->
<!-- tier: short -->

## Rumors have a shape — and the shape shows up before the truth does.

`Dr. Imani Osei · code + data at rumorshape.example`
