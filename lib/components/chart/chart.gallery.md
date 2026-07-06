<!-- _class: title silent -->

# chart

`13 components`

Chart — series-substance data visualizations (SVG kernel).


---

<!-- _class: funnel -->
<!-- _footer: "funnel · chart survey" -->

## The funnel narrows; the width is the story.

- Visitors `12,000`
  - Two-thirds arrive from inbound, not outbound
  - Paid search makes up the rest
- Signups `4,800`
- Activated `2,160`
- Paid `864`
- Renewed `670`

---

<!-- _class: gantt -->
<!-- _footer: "gantt · chart survey" -->

`2026 Q1 .. 2026 Q4` `today Q3`

## The gantt lays the work against the calendar.

Three workstreams across four quarters; the one at-risk bar quietly gates the rollout, GA is a milestone, and the today line marks where the plan stands.

- Framework
  - Signal taxonomy `Q1..Q2` `done`
  - Scoring model v2 `Q2..Q3` `live` `after: Signal taxonomy`
  - Per-team weighting `Q3..Q4` `at-risk` `after: Scoring model v2`
    - Two teams contest the weighting; the Q3 review decides it, and the rollout waits on the outcome.
- Adoption
  - Pilot onboarding `Q1..Q2` `done`
  - Org-wide rollout `Q3..Q4` `after: Per-team weighting`
  - GA `Q4` `milestone` `after: Org-wide rollout`
    - Go/no-go gate: needs SOC2 sign-off and the weighting decision landed.

---

<!-- _class: journey -->
<!-- _footer: "journey · chart survey" -->

## The journey scores each stage of the path.

- Evaluate
  - Read case study `@prospect` `:5`
  - Book demo `@prospect` `:4`
  - Live demo `@prospect` `@sales` `:4`
- Trial
  - Trial signup `@prospect` `:3`
  - Workspace setup `@user` `@onboarding` `:1`
- Activate
  - First report `@user` `:3`
  - Daily use `@user` `:5`

---

<!-- _class: kanban -->
<!-- _footer: "kanban · chart survey" -->

`chart · kanban`

## The board tracks cards across lanes.

- Backlog
  - Waiting cards `S`
- In progress
  - The active limit `M`
- Review
  - Almost done `S`
- Done
  - Shipped work `L`

---

<!-- _class: map -->
<!-- _footer: "map · chart survey" -->

## The map fills regions by value.

- India `48.2`
  - Largest by volume, thinnest by margin
  - Two new state hubs this year
- Nigeria `36.4`
- Kenya `31.0`
- Brazil `27.5`
- Indonesia `19.3`
- Ethiopia `14.1`
- Bangladesh `11.8`
- Peru `9.6`

---

<!-- _class: piechart -->
<!-- _footer: "piechart · chart survey" -->

`H1 2026 · 1,840 person-hours`

## The pie gives each share one wedge.

Nearly half went to producing decks; the deciding itself was the smallest slice.

- Deck production `46%`
  - 92 decks, averaging 18 slides each
  - Most of it review-cycle churn
- Meetings about meetings `22%`
- Realigning on priorities `18%`
- Stakeholder management `9%`
- Actually deciding `5%`

---

<!-- _class: progress -->
<!-- _footer: "progress · chart survey" -->

`H1 2026 · Phase 1 readiness`

## Progress bars race toward their targets.

Snapshot at 14:00 UTC. Status pills reflect the most optimistic reading of the available data.

- Signal Intake `92%` `on-track`
- Scoring policy `68%` `at-risk`
- Decision Log `81%` `on-track`
- Calibration cadence `34%` `deferred`
- Adoption `12%` `blocked`

---

<!-- _class: quadrant -->
<!-- _footer: "quadrant · chart survey" -->

`Effort 0–10 → Reach 0–100`

## The quadrant scatters items on two axes.

Effort in analyst-weeks; reach as the percent of teams that would adopt it, optimistically.

- Quick Wins
  - Weekly signal digest `2, 82`
  - Slack intake bot `3, 72`
- Strategic Bets
  - Scoring model v2 `8, 88`
    - Owner: Platform team
    - A 3-week spike de-risks the roadmap
  - Decision-log API `7, 74`
- Defer
  - Per-team weighting UI `2, 28`
  - Maturity self-assessment `1, 20`
- Time Sinks
  - Bespoke board exports `8, 18`
  - Custom calibration tooling `9, 26`

---

<!-- _class: radar -->
<!-- _footer: "radar · chart survey" -->

`Scale · 0–10`

## The radar maps strengths around the compass.

- Meridian
  - Performance `9`
    - Measured as p95 latency; lower is better
    - Our strongest axis against the field
  - Pricing `7`
  - Support `8`
  - Ecosystem `6`
  - Security `9`
- Vantage
  - Performance `7`
  - Pricing `8`
  - Support `6`
  - Ecosystem `9`
  - Security `7`
- Helios
  - Performance `6`
  - Pricing `9`
  - Support `7`
  - Ecosystem `8`
  - Security `8`

---

<!-- _class: roadmap -->
<!-- _footer: "roadmap · chart survey" -->

`H2 2026 · Rollout plan`

## The roadmap grids workstreams against phases.

| Workstream | Foundation `Q2 2026`   | Hardening `Q3 2026`      | Scale `Q4 2026`         |
| ---------- | ---------------------- | ------------------------ | ----------------------- |
| Framework  | [x] Signal taxonomy    | [-] Scoring model v2     | [ ] Per-team weighting  |
| Adoption   | [x] Pilot onboarding   | [-] Weekly signal review | [ ] Org-wide rollout    |
| Governance | [x] Decision log       | [x] Calibration cadence  | [ ] Board reporting     |
| Tooling    | [x] Intake form        | [/] Dashboards           | [ ] Self-serve exports  |

---

<!-- _class: state-chart lr -->
<!-- _footer: "state-chart · chart survey" -->

`Submission lifecycle`

## States connect; the arrows carry the rules.

How a draft moves from author to publication.

1. Draft `start`
   - `submit => 2`
2. Submitted `on-track`
   - `review => 3`
3. In Review `at-risk`
   - `approve => 4`
   - `reject => 1`
   - `revise => self`
   - Two reviewers must sign off before approval.
4. Approved
   - `publish => 5`
5. Published `end`

*Rejected drafts return to the author; revisions stay in review.*

---

<!-- _class: timeline-list -->
<!-- _footer: "timeline-list · chart survey" -->

`chart · timeline-list`

## The timeline pins events to their dates.

Four milestones show the shape; the date chips carry the when.

1. `Q1` The first milestone
   - One clause says what changed here.
2. `Q2` The second, marked `decision`
   - A tag names the milestone's kind.
3. `Q3` The third milestone
   - Sixteen words is each entry's budget.
4. `Q4` The fourth milestone
   - Four to six entries reads best.

---

<!-- _class: word-cloud -->
<!-- _footer: "word-cloud · chart survey" -->

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
