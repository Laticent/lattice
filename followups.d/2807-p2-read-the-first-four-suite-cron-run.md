---
origin: 2807
priority: P2
recorded: 2026-10-19
area: infra
severity: low
swimlane: engineering/decisions/2026-10-18-platform-suites.md
source: https://github.com/Laticent/lattice/pull/2807
---

# Read the first scheduled platform-suites run that carries all four suites

why now   — The only scheduled run so far (39235883310, 2026-10-19) checked out a commit from before #2786 and ran one suite of four.
            The four-suite matrix has run only by manual dispatch (39297285443) and on PR #2807. The next cron is due 04:41 UTC on
            2026-10-20, and GitHub has started one 5 h 32 m late before.
where     — the `schedule` runs of `.github/workflows/platform-suites.yml` on main; the record is the "first scheduled run" section of
            `engineering/decisions/2026-10-18-platform-suites.md` and the workflow's header comment.
done when — a scheduled run with all four suites is green, and its link and per-suite job times are in both places; a red one is triaged
            (the `alert` job opens "Nightly platform suites failed").
verify    — tier 0 gates, because it only reads runs and edits docs.
