---
origin: 3415
priority: P1
recorded: 2026-11-23
area: docs
severity: low
swimlane: engineering/decisions/2026-11-21-plain-english-key-renames.md
deferred: blocked — the decision note changes in the next rename PR (paginate), which starts from main after #3415 merges
source: https://github.com/Laticent/lattice/pull/3415
---

# Fold four owner decisions and one migration rule into the renames decision note

why now   — Four owner answers about the remaining renames were given in other sessions'
            chats and are not yet in the decision note, the durable home for them:
            - sketch-clean = A (naming session, 2026-11-22 02:12 UTC): `drawing:
              sketch-headings` stamps one class, and every `sketch` rule also matches it.
              Its own note: followups.d/3415-p2-sketch-headings-one-class.md.
            - paginate = B (naming session, 2026-11-22 02:09 UTC): `paginate:` becomes
              `pagination:`. Its own note: followups.d/3415-p1-paginate-to-pagination.md.
            - D11 A (presets desk, session_01DPMMjEgrcv6brmaXooaAX9; relayed by the
              Command Center 2026-11-23): when `marks:` splits (Q4), tone's color-source
              word stays a word on `chart-finish:` (`marks: tone ink` becomes
              `chart-finish: tone ink`).
            - D10 A (same session): `cover:` becomes `cover-layout:`. The presets desk ships
              that rename in its own cover PR, so it leaves this sweep.
            The same relay added a rule: every rename PR also migrates
            `lib/presets/*/*.preset.json` (new in #3470), or a preset silently stops setting
            the renamed key. #3470 adds a test that fails on a retired key.
where     — engineering/decisions/2026-11-21-plain-english-key-renames.md: §2 for the
            decisions, §4 ("Each PR") for the preset-migration step.
done when — the note records all four with where each was answered, drops `cover:` from
            this sweep's list, and §4 names the preset migration as a step of every rename.
evidence  — the note's diff in the paginate PR.
verify    — tier 0 gates (docs only); a fact-checker if the presets session's answers
            cannot be re-read with list_events.
