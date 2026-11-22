---
origin: 3254
priority: P2
recorded: 2026-11-17
area: engine
severity: low
swimlane: engineering/decisions/2026-07-04-accessible-descriptions.md
deferred: off-path — the agenda component's page chip (lib/core/agenda-autofill.js, lib/components/inventory/agenda/); this PR changes only decks, docs and a Compose function
source: https://github.com/Laticent/lattice/pull/3254
---

# A screen reader reads an agenda page reference as "p . 3"

```text
  P2 · [no ticket] give the agenda's page chip a spoken form
       why now   — Orca 46.1 over Chromium, reading the plain HTML export of
                   examples/semantic-testing.md, spoke every filled agenda row as
                   "01. Name the mission before you name the test. p . 3." The
                   page chip is inline code holding `p.3`, so the reader spells it.
                   Every deck whose agenda fills itself with page numbers ships
                   this; the decks in #3254 only exposed it.
       done when — the chip reaches the accessibility tree as "page 3" (an
                   aria-label on the chip, or visually hidden text), the visible
                   chip is unchanged, and a test reads the accessible name of a
                   filled agenda's page chip and pins "page 3".
       evidence  — the Orca harness in #3254's PR body (Xvfb, AT-SPI,
                   speech-dispatcher with espeak-ng, Orca's debug log); grep
                   "SPEECH OUTPUT" for "p . ".
       verify    — tier 0: a unit test on the agenda's rendered HTML; then one
                   Orca or axe accessible-name read of a rendered agenda slide.
```
