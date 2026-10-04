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

1. A `start`
   - `{to=2}`
2. B
   - `{to=3}`
   - `{to=1}`
3. C `end`

---

<!-- _class: state-chart -->
<!-- _footer: "2 — long labels that would overflow a fixed box" -->

## Long state names.

1. Awaiting Initial Submission `start`
   - `{submit, to=2}`
2. Pending Manual Compliance Re-Review
   - `{escalate, to=3}`
   - `{return for changes, to=1}`
3. Approved by Regional Authority `done`
   - `{archive, to=4}`
4. Archived in Cold Storage `end`

---

<!-- _class: state-chart -->
<!-- _footer: "3 — non-Latin (CJK) labels" -->

`状態遷移`

## CJK state labels.

1. 待機 `start`
   - `{開始, to=2}`
2. 実行中 `on-track`
   - `{完了, to=3}`
   - `{失敗, to=1}`
3. 完了 `end`

---

<!-- _class: state-chart -->
<!-- _footer: "4 — many states, mostly linear" -->

## Ten-step pipeline.

1. Intake `start`
   - `{to=2}`
2. Triage
   - `{to=3}`
3. Assigned
   - `{to=4}`
4. In Progress `on-track`
   - `{to=5}`
   - `{block, to=9}`
5. Code Review
   - `{to=6}`
   - `{reject, to=4}`
6. QA
   - `{to=7}`
   - `{fail, to=4}`
7. Staging
   - `{to=8}`
8. Released `live`
   - `{to=10}`
9. Blocked `blocked`
   - `{unblock, to=4}`
10. Closed `end`

---

<!-- _class: state-chart -->
<!-- _footer: "5 — dense branching from one state" -->

## Router with many exits.

1. Dispatch `start`
   - `{a, to=2}`
   - `{b, to=3}`
   - `{c, to=4}`
   - `{d, to=5}`
   - `{retry, to=self}`
2. Handler A `done`
3. Handler B `done`
4. Handler C `at-risk`
5. Dead Letter `fail`

---

<!-- _class: state-chart -->
<!-- _footer: "6 — heavy back-edges (everything returns to start)" -->

## Wizard with escape hatches.

1. Welcome `start`
   - `{next, to=2}`
2. Account
   - `{next, to=3}`
   - `{cancel, to=1}`
3. Profile
   - `{next, to=4}`
   - `{cancel, to=1}`
4. Payment
   - `{next, to=5}`
   - `{cancel, to=1}`
5. Confirm `done`
   - `{restart, to=1}`

---

<!-- _class: state-chart -->
<!-- _footer: "7 — single state, no transitions" -->

## Degenerate: one state.

1. Singleton `start`

---

<!-- _class: state-chart -->
<!-- _footer: "8 — mixed widths + every status color" -->

## Status palette across widths.

1. Q `start`
   - `{to=2}`
2. Processing Now `on-track`
   - `{to=3}`
3. Hold `at-risk`
   - `{to=4}`
4. Stop `blocked`
   - `{to=5}`
5. Choose `decision`
   - `{to=6}`
6. Later `deferred`
   - `{to=7}`
7. Done `done` `end`

---

<!-- _class: state-chart lr -->
<!-- _footer: "9 — lr direction with branching + back-edge" -->

## Left-to-right pipeline.

1. Source `start`
   - `{compile, to=2}`
2. Compiled `on-track`
   - `{test, to=3}`
3. Tested
   - `{deploy, to=4}`
   - `{fail, to=1}`
4. Deployed `live` `end`

---

<!-- _class: state-chart lr -->
<!-- _footer: "10 — lr with long labels + self-loop" -->

## Connection (left-to-right).

1. Disconnected `start`
   - `{connect, to=2}`
2. Establishing Session
   - `{retry, to=self}`
   - `{ok, to=3}`
   - `{timeout, to=1}`
3. Connected `live` `end`

---

<!-- _class: state-chart -->
<!-- _footer: "11 — complex machine: skips, converging back-edges, self-loop" -->

## Incident response.

1. Detected `start`
   - `{triage, to=2}`
2. Triaged `on-track`
   - `{assign, to=3}`
   - `{false alarm, to=7}`
3. Investigating
   - `{mitigate, to=4}`
   - `{escalate, to=5}`
   - `{need more info, to=2}`
4. Mitigated
   - `{verify, to=6}`
5. Escalated `at-risk`
   - `{hand off, to=4}`
   - `{re-page, to=self}`
6. Monitoring `live`
   - `{resolve, to=7}`
   - `{regression, to=3}`
7. Resolved `done`
   - `{postmortem, to=8}`
8. Closed `end`

---

<!-- _class: state-chart lr -->
<!-- _footer: "12 — complex LR: forward skip, back-edges, self-loop" -->

## Build & release graph.

1. Commit `start`
   - `{ci, to=2}`
   - `{hotfix, to=4}`
2. Build `on-track`
   - `{test, to=3}`
   - `{retry, to=self}`
3. Tested
   - `{stage, to=4}`
   - `{fail, to=2}`
4. Staging `at-risk`
   - `{promote, to=5}`
   - `{rollback, to=2}`
5. Production `live` `end`

---

<!-- _class: state-chart curved -->
<!-- _footer: "13 — curved variant (rounded corners)" -->

## Document approval (curved).

1. Draft `start`
   - `{submit, to=2}`
   - `{discard, to=5}`
2. In Review `on-track`
   - `{approve, to=3}`
   - `{revise, to=self}`
   - `{reject, to=1}`
3. Approved
   - `{publish, to=4}`
4. Published `live`
   - `{archive, to=5}`
5. Archived `end`

---

<!-- _class: state-chart lr curved -->
<!-- _footer: "14 — curved variant, left-to-right" -->

## Job runner (curved, lr).

1. Idle `start`
   - `{run, to=2}`
   - `{skip, to=4}`
2. Running `on-track`
   - `{pause, to=3}`
   - `{finish, to=4}`
3. Paused
   - `{resume, to=2}`
4. Done `end`
