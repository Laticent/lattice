---
marp: true
theme: indaco
size: 16:9
pagination: true
header: "Lattice · State chart — stress test"
---

<!-- @meta{layout=title} -->

`Lattice · Stress test`

# State chart vs. content we've never seen.

Browser-measured layout: nodes are sized by the real text engine, edges are drawn from measured rects. These slides try to break it.

---

<!-- @meta{layout=state-chart, footer="1 — very short labels"} -->


## Single-letter states.

- A `start`
  - -> B
- B
  - -> C
  - -> A
- C `end`

---

<!-- @meta{layout=state-chart, footer="2 — long labels that would overflow a fixed box"} -->


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

<!-- @meta{layout=state-chart, footer="3 — non-Latin (CJK) labels"} -->


`状態遷移`

## CJK state labels.

- 待機 `start`
  - -開始-> 実行中
- 実行中 `on-track`
  - -完了-> 完了
  - -失敗-> 待機
- 完了 `end`

---

<!-- @meta{layout=state-chart, footer="4 — many states, mostly linear"} -->


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

<!-- @meta{layout=state-chart, footer="5 — dense branching from one state"} -->


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

<!-- @meta{layout=state-chart, footer="6 — heavy back-edges (everything returns to start)"} -->


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

<!-- @meta{layout=state-chart, footer="7 — single state, no transitions"} -->


## Degenerate: one state.

- Singleton `start`

---

<!-- @meta{layout=state-chart, footer="8 — mixed widths + every status color"} -->


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

<!-- @meta{layout=state-chart, class=lr, footer="9 — lr direction with branching + back-edge"} -->


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

<!-- @meta{layout=state-chart, class=lr, footer="10 — lr with long labels + self-loop"} -->


## Connection (left-to-right).

- Disconnected `start`
  - -connect-> Establishing Session
- Establishing Session
  - -retry-> Establishing Session
  - -ok-> Connected
  - -timeout-> Disconnected
- Connected `end` `live`

---

<!-- @meta{layout=state-chart, footer="11 — complex machine: skips, converging back-edges, self-loop"} -->


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

<!-- @meta{layout=state-chart, class=lr, footer="12 — complex LR: forward skip, back-edges, self-loop"} -->


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

<!-- @meta{layout=state-chart, class=curved, footer="13 — curved variant (rounded corners)"} -->


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

<!-- @meta{layout=state-chart, class=lr curved, footer="14 — curved variant, left-to-right"} -->


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
