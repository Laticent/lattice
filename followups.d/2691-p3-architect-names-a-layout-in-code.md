---
origin: 2691
priority: P3
recorded: 2026-10-14
area: website
severity: low
swimlane: engineering/decisions/2026-10-13-studio-chat-polish.md §4e
source: https://github.com/Laticent/lattice/pull/2691
---

# The Architect still names a layout in code ("a `video` slide") now and then

why now   — on a real iPhone with Gemini Pro Latest, the reply to "add a video slide with this video" said "we can add a
            `video` slide using its link". HOW YOU TALK (architect-agent.ts PURPOSE) says to describe a layout, never by
            its class name. One slip in two turns; the rest of the reply was plain.
where     — PURPOSE in docs/src/components/studio/architect-agent.ts; the component index in buildAgentSystem lists layouts
            by class name, which the model reads every turn and echoes.
done when — a question that touches a layout gets a reply that names it in words ("a video slide"), on a real model, over
            a handful of turns; consider rendering a code-styled class name as plain text in the chat if the prompt alone
            does not hold.
evidence  — screenshots of the real-model replies (the author's key, HARD RULE #24).
verify    — tier 1; prompt behavior needs a real model.
