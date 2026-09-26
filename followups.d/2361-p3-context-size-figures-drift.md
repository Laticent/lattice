---
origin: 2361
priority: P3
recorded: 2026-09-25
---

# Four context-size figures have drifted past the budgets they cite

why now   — `gotchas.md` measures 10.4k o200k tokens against its own 10k read-whole budget (docs say
            7k). `components.pick.md` is 4.4k (docs say 3.8k). The decisions index is 37k (its README
            says 27k). The size gates are per row, so none of this fails (chapter 4 §2.1).
where     — `engineering/decisions/2026-08-17-context-index-tiering.md`, CLAUDE.md,
            `engineering/decisions/README.md`, `engineering/development.md` §Context cost.
done when — either the read-whole indexes are gated on total size, or the docs stop quoting sizes.
evidence  — the o200k measurement at a quoted sha.
verify    — tier 1 checker if a gate is added (it changes what build:check finds).
