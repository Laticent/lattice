---
marp: true
theme: indaco
paginate: true
---

<!--
  Measurement fixture for the three sub-fallback glyph entries — `―` `→` `　`.

  No shipped deck's quadrant/radar labels contain these characters (measured: 24
  decks, 66 billed label strings, zero non-ASCII), so the question "what does
  re-billing them to GLYPH_UPPER_MAX cost" has no natural subject in the corpus.
  Open vocabulary is the point: an author can type them, so this fixture makes
  them reachable — long group names, cohort names and magic archetypes carrying
  each character, across both faces (clean + sketch) and all three tracked rules
  (0.04 / 0.06 / 0.08em).

  Not a gallery and not a demo deck: nothing enumerates test/fixtures/*.md, and
  this deck exists to be rendered twice and diffed. See
  engineering/decisions/2026-08-12-sketch-label-voice.md, "Found, and now CLOSED".
-->

<!-- _class: quadrant -->

`Effort 0–10 → Reach 0–100`

## Group headings carrying the three sub-fallback glyphs.

Every group name below carries `―` (horizontal bar), `→` (rightwards arrow) or `　` (ideographic space).

- Quick Wins ― Bar
  - Weekly signal digest `2, 82`
  - Slack intake bot `3, 72`
- Strategic Bets → Arrow
  - Scoring model v2 `8, 88`
  - Decision-log API `7, 74`
- Defer　Ideographic
  - Per-team weighting UI `2, 28`
  - Maturity self-assessment `1, 20`
- Time Sinks ― → 　 All Three
  - Bespoke board exports `8, 18`
  - Custom calibration tooling `9, 26`

---

<!-- _class: quadrant cohort -->

`Effort 0–10 → Reach 0–100`

## Cohort centroid names, long enough to wrap at two lines.

The cohort label wraps around its centroid, so a wider estimate breaks it earlier.

- Platform Investment ― Long Runway
  - Weekly signal digest `2, 82`
  - Slack intake bot `3, 72`
- Customer Facing → Fast Payback
  - Scoring model v2 `8, 88`
  - Decision-log API `7, 74`
- Internal Tooling　Deferred Scope
  - Per-team weighting UI `2, 28`
  - Maturity self-assessment `1, 20`
- Compliance ― Mandatory → Fixed
  - Bespoke board exports `8, 18`
  - Custom calibration tooling `9, 26`

---

<!-- _class: quadrant magic -->

`Effort 0–10 → Reach 0–100`

## Magic-quadrant archetypes at the widest tracking.

`magic` tracks corner names at 0.08em, the widest rule the table feeds.

- Leaders ― Established
  - Weekly signal digest `2, 82`
- Challengers → Rising
  - Scoring model v2 `8, 88`
- Niche Players　Focused
  - Per-team weighting UI `2, 28`
- Visionaries ― → 　 Emerging
  - Bespoke board exports `8, 18`

---

<!-- _class: radar -->

`Scale · 0–10`

## Radar sector names ride the rim and wrap the same way.

- Delivery Speed ― Throughput
  - Performance `9`
  - Pricing `7`
  - Support `8`
- Commercial Terms → Renewal
  - Performance `7`
  - Pricing `8`
  - Support `6`
- Operations　Coverage
  - Performance `6`
  - Pricing `9`
  - Support `7`

---

<!-- _class: quadrant sketch -->

`Effort 0–10 → Reach 0–100`

## The same group headings under the hand face.

`sketch` re-points the body font at the hand sans, so the hand half of the table bills these.

- Quick Wins ― Bar
  - Weekly signal digest `2, 82`
  - Slack intake bot `3, 72`
- Strategic Bets → Arrow
  - Scoring model v2 `8, 88`
  - Decision-log API `7, 74`
- Defer　Ideographic
  - Per-team weighting UI `2, 28`
  - Maturity self-assessment `1, 20`
- Time Sinks ― → 　 All Three
  - Bespoke board exports `8, 18`
  - Custom calibration tooling `9, 26`

---

<!-- _class: quadrant cohort sketch -->

`Effort 0–10 → Reach 0–100`

## Cohort centroid names under the hand face.

- Platform Investment ― Long Runway
  - Weekly signal digest `2, 82`
  - Slack intake bot `3, 72`
- Customer Facing → Fast Payback
  - Scoring model v2 `8, 88`
  - Decision-log API `7, 74`
- Internal Tooling　Deferred Scope
  - Per-team weighting UI `2, 28`
  - Maturity self-assessment `1, 20`
- Compliance ― Mandatory → Fixed
  - Bespoke board exports `8, 18`
  - Custom calibration tooling `9, 26`

---

<!-- _class: quadrant magic sketch -->

`Effort 0–10 → Reach 0–100`

## Magic archetypes at 0.08em tracking under the hand face.

- Leaders ― Established
  - Weekly signal digest `2, 82`
- Challengers → Rising
  - Scoring model v2 `8, 88`
- Niche Players　Focused
  - Per-team weighting UI `2, 28`
- Visionaries ― → 　 Emerging
  - Bespoke board exports `8, 18`

---

<!-- _class: radar sketch -->

`Scale · 0–10`

## Radar sector names under the hand face.

- Delivery Speed ― Throughput
  - Performance `9`
  - Pricing `7`
  - Support `8`
- Commercial Terms → Renewal
  - Performance `7`
  - Pricing `8`
  - Support `6`
- Operations　Coverage
  - Performance `6`
  - Pricing `9`
  - Support `7`
