---
marp: true
theme: indaco
paginate: true
mode: sketch
header: "Lattice · hub-spoke in sketch"
---

<!-- _class: title silent -->

# Hub-spoke now measures the hand face it paints.

`Chart · hub-spoke · mode: sketch`

Under `mode: sketch` the chart billed every character at a flat 0.66em. Digits and
symbols paint wider than that, so values ran past their room and the hub's value
reached the edge of its disc. A measured per-character table replaces the flat number.

---

<!-- _class: hub-spoke sized -->
<!-- _footer: "Was: `$120M` reached 1.052 of the hub radius and `8%` painted 1.233× its estimate. Now: 0.936 and 0.94×." -->

`FY2026 · Partner channel revenue`

## Two partners carry half of channel revenue.

- Channel revenue `$120M`
  - Atlas Distribution `28%`
  - Keystone Resellers `22%`
  - Northgate Systems `18%`
  - Brightline Retail `13%`
  - Summit Online `11%`
  - Harborview Telecom `8%`

---

<!-- _class: hub-spoke -->
<!-- _footer: "Was: `$48M` reached 1.021 of the hub radius. Now: 0.912, with every value inside its estimate." -->

`Regional sales · Bookings this quarter`

## Twelve regions booked $48M; the top three brought in $20M.

- Global sales `$48M`
  - Northeast `$7.8M`
  - Southeast `$6.5M`
  - Midwest `$5.7M`
  - Texas `$4.9M`
  - Mountain `$4.1M`
  - California `$3.8M`
  - Pacific NW `$3.3M`
  - Canada `$3.0M`
  - Mexico `$2.6M`
  - Brazil `$2.4M`
  - UK and Ireland `$2.2M`
  - Nordics `$1.7M`

---

<!-- _class: hub-spoke flow-in -->
<!-- _footer: "Was: `16M` and `14M` painted 1.190× their estimate, `8M` 1.270×. Now every value sits at 0.94–0.95×." -->

`Data platform · Records per day`

## Billing and the web store send two thirds of what the lake takes in.

- Data lake `45M`
  - Billing `16M`
  - Web store `14M`
  - Mobile app `8M`
  - Call center `4M`
  - Partner feeds `3M`

---

<!-- _class: hub-spoke tiered -->
<!-- _footer: "Was: the hub printed `Framewor` over `k`. Now a smaller type size keeps the word whole." -->

`Framework ownership · 2026`

## Four teams own the framework's ten moving parts.

- Framework
  - Strategy
    - Scoring model
    - Weights
    - Calibration `at-risk`
  - Platform
    - Intake bot
    - Decision API
  - Enablement
    - Workshops
    - Taxonomy
  - Analytics
    - Dashboards
    - Exports `blocked`
    - Audits

---

<!-- _class: hub-spoke -->
<!-- _footer: "Names were billed 12% wide on the median; now 4%. Status words keep their tracking in the bill." -->

`Transformation program · Q3`

## Two of six workstreams are off track.

- Program office
  - Customer onboarding
  - Core platform migration `at-risk`
  - Data governance
  - Vendor consolidation `blocked`
  - Finance systems
  - Training and adoption

---

<!-- _class: closing -->

# Measured, not guessed.

The table lives in `lib/core/hub-spoke-model.js` and rides the same font pin as the
chart family's uppercase table. `npm run fonts:measure -- --check` re-measures it.
