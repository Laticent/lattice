---
status: proposed
summary: >
  What the Studio's deck-wide diagram check costs and who reads its result, so the owner can decide whether to delete
  the background effect and check at chat send. Measured: after one edit to a diagram in a 6-diagram deck the page
  makes one preview draw at +270 ms and six more draws from the check at +3.0 s, one per diagram in the deck, not only
  the edited one. A prose edit starts no check (the signature is the diagram code alone). The only reader of the result
  is the Architect chat's grounding. Recommendation: check at send. Default if no one answers: keep the effect.
---

# The deck-wide diagram check: while editing, or at chat send (follow-up of #2822)

**Asked.** The owner asked why a deck-wide syntax check runs while typing and deferred the change on 2026-10-22. This note
is the evidence for the decision. Follow-up file: `followups.d/2822-p3-deck-check-at-chat-send.md`. Nothing in the code
changed.

## What the effect does

`StudioShell.tsx` `diagramSignature` (about line 3581) is the deck's diagram source, joined. The effect re-runs when that
string changes: it clears the previous result, and if the deck has diagrams it waits 3 s (the comment above it still says
900 ms) and calls `checkDiagrams` (`mermaid-parse.ts:83`). That draws every diagram, up to 40 of up to 20,000
characters, through the draw host, one after another in the frame the preview shares, and stops if the check goes stale.

**The result has one reader.** `chatGrounding.diagrams` passes it to `deckBrief` for the Architect chat
(`chat-agent.ts:104`), so the agent can say "slide 4's diagram does not parse". The slide you are editing already shows
its own error through the render. For the Architect's own drafts, `checkDraft` (`StudioShell.tsx` about line 5167) already
runs the same check on the draft (`assessDeck` and the diagram parse together), so those need no background result.

## What it costs, measured

Chromium, desktop, the built Studio, a deck of six one-diagram slides, `performance.getEntriesByName('lattice-draw:draw-called')`
after one keystroke inside the first diagram:

| Draw calls | When (after the keystroke) |
|---|---|
| 1 | +270 ms: the preview redraws the slide you edited |
| 6 | +3.0 s: the check, all six diagrams, queued within 11 ms |

So one edit costs seven draws, six of them for slides nobody is looking at, and they take their turns in the same frame
the preview draws in. A prose edit changes no diagram, so it starts no check. A pause of 3 s after each diagram edit is
when it fires; typing a burst re-arms it.

Not measured: how long the six draws occupy the frame (a keystroke at +3.1 s would show the contention; the probe that
tried it hit an unparseable diagram and timed out), and the same on the phone profile. Both are the first measurements
if the owner wants the cost in milliseconds before deciding.

## Options

| | Keep the effect | Check at chat send |
|---|---|---|
| Draw jobs while editing | 6 per diagram edit, 3 s after a pause | 0 |
| Chat sees the deck's diagram errors | yes, already computed | yes, computed at send; adds up to the check's duration (several diagrams, one after another) to the first send after an edit |
| Code | as is | delete the effect and its state; call `checkDiagrams` where the chat builds its grounding, behind the same staleness guard |
| Risk | none | the diagram e2e (`draw-frame-preview.spec.ts`, "deck-wide diagram check") pins today's timing and would be rewritten |

## Recommendation

**Check at send.** The result has one reader, that reader is the chat, and the work it replaces is paid on every diagram
edit by authors who never open the chat. The owner decides; **default if no one answers: keep the effect**, since it is the
behavior the owner already has and deferred.

Evidence the change would owe, from the owner's own done-when: a keystroke trace with no check job while typing. The
`check-trace` script that produced the table above is a 25-line Playwright probe; it belongs next to the bench if the change
ships.
