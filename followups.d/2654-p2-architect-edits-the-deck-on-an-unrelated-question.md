---
origin: 2654
priority: P2
recorded: 2026-10-14
area: website
severity: medium
swimlane: engineering/decisions/2026-10-13-studio-chat-polish.md §5
source: https://github.com/Laticent/lattice/pull/2672
---

# The Architect edits the deck, in the deck checker's words, when asked an unrelated question

why now   — a tester asked "what is in this video" and "what's the video about" and each reply ended with edits the
            tester did not ask for ("I tweaked slides 2, 5 and 7 to clear out the checker's warnings about word counts
            and missing claims", with a diff card), in vocabulary a person does not use: "the checker", "referent",
            layout class names such as `big-number`. This is existing behavior (the agent loop shows the model the
            checker's findings and it fixes them), found while testing #2672; it was not changed there.
where     — `docs/src/components/studio/chat-agent.ts` (`checkerNote`, the loop that shows the model its warnings) and
            the Architect's system prompt in `architect-agent.ts`. The activity line under a reply ("Read big-number ·
            Edited slides · Checked the deck") is the same family: small, faint, and in layout names.
done when — a question that asks for no change gets an answer and no diff card; when the Architect does edit, the
            reply says what it changed and why in plain words (no "checker", "referent" or class names), and the
            activity line reads as sentences a person can follow.
evidence  — a screenshot of a question turn with no edit, and of an edit turn with the plain wording, on a phone.
verify    — tier 1; the model's behavior needs a real model (HARD RULE #24: a scratch run or the author's own key).
