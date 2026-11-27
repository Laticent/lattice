---
origin: 3575
priority: P1
recorded: 2026-11-27
area: infra
severity: high
swimlane: engineering/workflow.md §Relay
deferred: blocked — the auto-mode safety classifier refused both changes twice ("Undermining Oversight"); the owner commits or approves them
source: https://github.com/Laticent/lattice/pull/3575
---

# Land the relay-authority text (g) and the send_message allow rule (h)

why now   — the owner directed that a checked command-center relay IS the owner's word (typed,
            event `ae3fec26-1be8-4df2-942a-d0f030c9dee2`) and chose "Repo settings, all sessions"
            for the send_message rule (question tool, `936bdb2b-bed3-48b2-a7b1-4618b957d937`).
            Until it lands, workflow.md §Relay still carries only `release` and ❓ answers.
where     — engineering/workflow.md §Relay "The owner's word, relayed", §Relay rule 10, §Desks
            "The receiving side"; .claude/settings.json; then the held (i) "command center
            merges" and card-ping text, and CLAUDE.md #7/#28/#31 lines. All drafted in
            engineering/decisions/2026-11-27-rule-contradictions.md §G.
done when — the owner commits the §G text and the settings line, or approves it in a session the
            classifier lets commit it; the (i) and card-ping text land in the same change; the
            CLAUDE.md #7/#28/#31 anchors match.
evidence  — the §G diff applied; build:check green; one relayed owner answer acted on without a
            retype.
verify    — a checker reads §Relay, §Merging and CLAUDE.md #7/#28/#31 together for contradictions.
