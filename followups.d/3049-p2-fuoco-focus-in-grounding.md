---
origin: 3049
priority: P2
recorded: 2026-11-06
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-skills-tools-and-chat-reach.md §6
deferred: large — a separate Studio change with its own tests and cost readout; this PR is the skill index
source: https://github.com/Laticent/lattice/pull/3049
---

# Send the author's current slide and line to the chat

why now   — "fix this slide" cannot mean the slide the author is on: Fuoco knows the focus, the chat never reads it.
where     — architect.ts ChatGrounding + buildChatSystem tail; chat-agent.ts agentSystemParts; StudioShell.tsx where
            grounding is built (read hub.get() once at send, never subscribe); chatSystemTokens / agentTurnUsd.
done when — grounding carries focus {slide, section, caretLine}; the dynamic tail names it in one line; the cost
            readout counts it; chat-grounding tests cover it.
evidence  — the tail's added tokens measured on a real turn (target about 30).
verify    — tier 1, self-review with the gates.
