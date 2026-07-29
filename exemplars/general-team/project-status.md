---
marp: true
size: 4k
theme: indaco
paginate: true
header: "Project Atlas · Status review"
---

<!-- _class: title silent -->
<!-- tier: short -->

`Monthly status · 10 June 2026`

# Project Atlas

The mobile rebuild is on schedule and on budget — one dependency is now our top risk.

---

<!-- _class: content -->
<!-- tier: short -->

## Atlas is green on schedule and budget; the auth vendor is our one amber risk.

The native mobile rebuild is 64% complete, tracking to the September beta and within budget. Engineering velocity is steady. The single item that could move the date is our dependency on the auth vendor's new SDK, which has slipped twice.

---

<!-- _class: content -->
<!-- tier: standard -->

## Why the rebuild: the old hybrid app caps our growth.

The current hybrid app crashes at three times the industry rate and can't use the device features our roadmap needs. Atlas rebuilds it natively so we stop losing users at launch and unblock the feature pipeline for the next two years.

- Crash rate today is 1.8% of sessions, against a 0.5% industry benchmark.
- Two roadmap features are blocked entirely by the old architecture.

---

<!-- _class: kpi compact -->
<!-- tier: short -->

## On schedule and on budget; one workstream amber.

1. 64%
   - Build complete
   - target 60% by Jun `On plan`
2. $1.4M
   - Budget consumed
   - of $2.2M · 63% spent `On plan`
3. 1
   - Workstreams at risk
   - auth SDK dependency `At risk`

---

<!-- _class: stats -->
<!-- tier: standard -->

`Quality · internal builds`

## What the nightly builds tell us about quality so far.

`Measured on the internal dogfood build across 320 testers, last 30 days.`

1. 0.4%
   - crash rate
2. 1.9s
   - cold-start time
3. 96%
   - automated test coverage
4. −67%
   - crashes vs hybrid

---

<!-- _class: roadmap -->
<!-- tier: short -->

## Where each workstream stands against the September beta.

| Workstream | Now `Jun` | Next `Jul` | Beta `Sep` |
| --- | --- | --- | --- |
| Core UI | [x] Nav shell | [-] Feature screens | [ ] Polish pass |
| Auth | [-] SDK integration | [ ] Biometric login | [ ] Hardening |
| Data sync | [x] Offline cache | [-] Conflicts | [ ] Load test |
| Release | [x] CI pipeline | [ ] Beta channel | [ ] Store submit |

---

<!-- _class: timeline-list -->
<!-- tier: full -->

`History · 2026`

## How the project has tracked since we started.

1. `2026 Feb` Architecture approved `decision`
   - Native rebuild greenlit over a second hybrid attempt.
2. `2026 Apr` Navigation shell shipped `done`
   - The app skeleton and offline cache landed on schedule.
3. `2026 May` Dogfood build to 320 testers `live`
   - Internal release confirmed the crash-rate improvement.
4. `2026 Jun` Auth SDK slips a second time `at-risk`
   - Vendor pushes their release from June to late July.

---

<!-- _class: matrix-2x2 -->
<!-- tier: short -->

## Our open risks, placed by likelihood and impact.

- **Low likelihood · Low impact.**
  - App-store review delay
- **Low likelihood · High impact.**
  - Data-sync conflict bug at scale
- **High likelihood · Low impact.**
  - Minor UI polish slipping past beta
- **High likelihood · High impact.**
  - Auth SDK slips again and blocks beta

---

<!-- _class: checklist -->
<!-- tier: full -->

## Beta-readiness checklist.

- [x] Navigation and core screens `complete`
- [x] Offline cache and sync `complete`
- [-] Auth integration `blocked on vendor`
- [-] Performance budget `1.9s, target 1.5s`
- [ ] Beta channel and tester onboarding `Jul`
- [ ] Store metadata and screenshots `Aug`

---

<!-- _class: decision -->
<!-- tier: full -->

## To protect the date, we are building an auth fallback in parallel.

- Build a fallback to the current SDK
  - Two engineers for one sprint keeps beta on track if the vendor slips again.
- Wait for the vendor's new SDK
  - Cleaner long-term, but bets the September date on a date that has already moved twice.

---

<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->
<!-- tier: short -->

## Green on schedule and budget — watching the auth dependency closely.

`Lena Park · atlas@example.com`
