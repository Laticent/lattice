---
marp: true
theme: indaco
paginate: true
size: square
---

<!-- _class: title -->

# The insight moves. The figure keeps the slide.

`fit · key insight under a chart or diagram`

On a phone, a chart or diagram keeps the slide and its key insight takes the closing page. The chart is drawn for the whole page.

---

<!-- _class: diagram -->

## The glyph's meaning is never voiced.

```mermaid
sequenceDiagram
  Client-)Server: fire and forget
  Server--xClient: dropped
  Worker-->>Queue: acknowledgment
```

> Every arrow is spoken as a neutral "sends to", so the label after the colon carries all the meaning; a reader who skims the arrows and skips the labels gets the protocol backwards, which is why each label names the outcome rather than the mechanism.

<!-- A sequence diagram under a 45-word insight: at a phone square the diagram's labels would fall below the legibility floor, so the insight takes the closing page and the diagram keeps its own. -->

---

<!-- _class: diagram -->

## A request is approved twice, then filed.

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Review: submit
  Review --> Draft: changes
  Review --> Approved: sign-off
  Approved --> Filed: archive
  Filed --> [*]
```

> The second approval is the one that matters: a reviewer can bounce a draft as often as they like, but once sign-off lands the request goes straight to filing, so the review loop is the only place a change can still be made, and every team that skipped it later filed a correction instead.

<!-- A tall state diagram under a 55-word insight: on its own page it draws larger, so the insight moves. -->

---

<!-- _class: bar -->

## Support load sits with two teams.

- Platform `412`
- Billing `388`
- Mobile `96`
- Web `71`

> Two teams take four tickets in five.

<!-- Even a one-line insight moves: the rule needs no threshold, so the bars always have the page. -->

---

<!-- _class: line -->

## Churn fell once onboarding moved to week one.

- Jan
  - Churn `4.1`
- Feb
  - Churn `3.9`
- Mar
  - Churn `2.6`
- Apr
  - Churn `2.2`

> The drop starts the month the onboarding call moved from week three to week one, and it holds in every cohort since, so the first-week call is now staffed as a retention lever rather than offered as a courtesy.

<!-- A chart is drawn for the whole page on a phone, since its insight always moves: it fills the page the insight left. -->

---

<!-- _class: diagram -->

## How a signal becomes a decision.

```mermaid
flowchart LR
  A[Input] --> B[Score]
  B --> C{Above bar?}
  C -->|yes| D[Act]
  C -->|no| E[Log]
```

> Even a short insight moves to its own page.

<!-- A short line moves too: on a phone the figure always keeps the stage. -->

---

<!-- _class: diagram -->

## Three services, one queue between them.

```mermaid
flowchart TB
  A[Checkout] --> Q[(Queue)]
  B[Billing] --> Q
  Q --> C[Fulfilment]
```

> The queue is the only coupling: checkout and billing never call fulfilment directly, so either can be down for an hour and orders still ship once it recovers, which is why the incident review asked for a second consumer rather than a faster one.

— Figures from the March incident review.

<!-- The insight and the below-note move together: the run's closing page holds both, in their authored order. -->
