---
origin: 2518
priority: P2
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2518
---

# Bring a chat-agent edit to the old one-shot's cost

why now   — the matched benchmark in engineering/decisions/2026-10-05-studio-chat-agent.md
            §7 puts an agent edit at ~1.5x the old one-shot: $0.030 against $0.019,
            12 s against 8 s. A plain slide edit still takes 3 model calls: read the
            layout, edit, then a final round only to write the summary. The owner set
            efficiency as a requirement.
where     — docs/src/components/studio/architect-agent.ts (runAgentLoop, the prompt's
            HOW YOU WORK, read_component), docs/src/components/studio/chat-agent.ts.
            Candidates:
            - inline the contract of every layout the deck already uses (or the ask
              names) in the brief, so the common edit skips read_component;
            - let the model end the turn with the edit call's text, skipping the
              summary-only round.
done when — re-running the matched benchmark (same deck, the six asks, Sonnet)
            shows edits at or under the old one-shot's cost, questions no worse, and 0 lint
            errors on every applied edit.
evidence  — the before/after table from the benchmark (OpenRouter usage.cost), added to the
            decision note's §7.
verify    — tier 1 checker, because it changes what the model sees on every turn.
