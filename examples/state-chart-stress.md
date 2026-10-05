---
marp: true
theme: indaco
size: 16:9
paginate: true
header: "Lattice · State chart — stress test"
---

<!-- _class: title -->
<!-- _paginate: false -->

`Lattice · Stress test`

# State chart vs. content we've never seen.

Browser-measured layout: nodes are sized by the real text engine, edges are drawn from measured rects. These slides try to break it.

---

<!-- _class: state-chart -->
<!-- _footer: "1 — very short labels" -->

## Single-letter states.

- A `start`
  - -> B
- B
  - -> C
  - -> A
- C `end`

---

<!-- _class: state-chart -->
<!-- _footer: "2 — long labels that would overflow a fixed box" -->

## Long state names.

- Awaiting Initial Submission `start`
  - -submit-> Pending Manual Compliance Re-Review
- Pending Manual Compliance Re-Review
  - -escalate-> Approved by Regional Authority
  - -return for changes-> Awaiting Initial Submission
- Approved by Regional Authority `done`
  - -archive-> Archived in Cold Storage
- Archived in Cold Storage `end`

---

<!-- _class: state-chart -->
<!-- _footer: "3 — non-Latin (CJK) labels" -->

`状態遷移`

## CJK state labels.

- 待機 `start`
  - -開始-> 実行中
- 実行中 `on-track`
  - -完了-> 完了
  - -失敗-> 待機
- 完了 `end`

---

<!-- _class: state-chart -->
<!-- _footer: "4 — many states, mostly linear" -->

## Ten-step pipeline.

- Intake `start`
  - -> Triage
- Triage
  - -> Assigned
- Assigned
  - -> In Progress
- In Progress `on-track`
  - -> Code Review
  - -block-> Blocked
- Code Review
  - -> QA
  - -reject-> In Progress
- QA
  - -> Staging
  - -fail-> In Progress
- Staging
  - -> Released
- Released `live`
  - -> Closed
- Blocked `blocked`
  - -unblock-> In Progress
- Closed `end`

---

<!-- _class: state-chart -->
<!-- _footer: "5 — dense branching from one state" -->

## Router with many exits.

- Dispatch `start`
  - -a-> Handler A
  - -b-> Handler B
  - -c-> Handler C
  - -d-> Dead Letter
  - -retry-> Dispatch
- Handler A `done`
- Handler B `done`
- Handler C `at-risk`
- Dead Letter `fail`

---

<!-- _class: state-chart -->
<!-- _footer: "6 — heavy back-edges (everything returns to start)" -->

## Wizard with escape hatches.

- Welcome `start`
  - -next-> Account
- Account
  - -next-> Profile
  - -cancel-> Welcome
- Profile
  - -next-> Payment
  - -cancel-> Welcome
- Payment
  - -next-> Confirm
  - -cancel-> Welcome
- Confirm `done`
  - -restart-> Welcome

---

<!-- _class: state-chart -->
<!-- _footer: "7 — single state, no transitions" -->

## Degenerate: one state.

- Singleton `start`

---

<!-- _class: state-chart -->
<!-- _footer: "8 — mixed widths + every status color" -->

## Status palette across widths.

- Q `start`
  - -> Processing Now
- Processing Now `on-track`
  - -> Hold
- Hold `at-risk`
  - -> Stop
- Stop `blocked`
  - -> Choose
- Choose `decision`
  - -> Later
- Later `deferred`
  - -> Done
- Done `end` `done`

---

<!-- _class: state-chart lr -->
<!-- _footer: "9 — lr direction with branching + back-edge" -->

## Left-to-right pipeline.

- Source `start`
  - -compile-> Compiled
- Compiled `on-track`
  - -test-> Tested
- Tested
  - -deploy-> Deployed
  - -fail-> Source
- Deployed `end` `live`

---

<!-- _class: state-chart lr -->
<!-- _footer: "10 — lr with long labels + self-loop" -->

## Connection (left-to-right).

- Disconnected `start`
  - -connect-> Establishing Session
- Establishing Session
  - -retry-> Establishing Session
  - -ok-> Connected
  - -timeout-> Disconnected
- Connected `end` `live`

---

<!-- _class: state-chart -->
<!-- _footer: "11 — complex machine: skips, converging back-edges, self-loop" -->

## Incident response.

- Detected `start`
  - -triage-> Triaged
- Triaged `on-track`
  - -assign-> Investigating
  - -false alarm-> Resolved
- Investigating
  - -mitigate-> Mitigated
  - -escalate-> Escalated
  - -need more info-> Triaged
- Mitigated
  - -verify-> Monitoring
- Escalated `at-risk`
  - -hand off-> Mitigated
  - -re-page-> Escalated
- Monitoring `live`
  - -resolve-> Resolved
  - -regression-> Investigating
- Resolved `done`
  - -postmortem-> Closed
- Closed `end`

---

<!-- _class: state-chart lr -->
<!-- _footer: "12 — complex LR: forward skip, back-edges, self-loop" -->

## Build & release graph.

- Commit `start`
  - -ci-> Build
  - -hotfix-> Staging
- Build `on-track`
  - -test-> Tested
  - -retry-> Build
- Tested
  - -stage-> Staging
  - -fail-> Build
- Staging `at-risk`
  - -promote-> Production
  - -rollback-> Build
- Production `end` `live`

---

<!-- _class: state-chart curved -->
<!-- _footer: "13 — curved variant (rounded corners)" -->

## Document approval (curved).

- Draft `start`
  - -submit-> In Review
  - -discard-> Archived
- In Review `on-track`
  - -approve-> Approved
  - -revise-> In Review
  - -reject-> Draft
- Approved
  - -publish-> Published
- Published `live`
  - -archive-> Archived
- Archived `end`

---

<!-- _class: state-chart lr curved -->
<!-- _footer: "14 — curved variant, left-to-right" -->

## Job runner (curved, lr).

- Idle `start`
  - -run-> Running
  - -skip-> Done
- Running `on-track`
  - -pause-> Paused
  - -finish-> Done
- Paused
  - -resume-> Running
- Done `end`
