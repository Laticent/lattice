---
origin: 2909
priority: P4
recorded: 2026-10-28
area: engine
severity: low
swimlane: engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md §Phasing
source: https://github.com/Laticent/lattice/pull/2909
---

# The web-reference scanner is still a private reader of CSS and HTML, not a policy over a shared reference model

why now   — The 2026-10-27 note decides that Segno carries opaque per-kind roles, a dialect package owns the reference model (what is fetched and when it fires), and the scanner becomes a policy table over it. R0 shipped (`CLICK_FETCH_ATTRS`); R1 is the previous item; R2 (a CSS island replacing `cssRefSpans`), R3 (an HTML island that reports `unsure` spans, replacing the scanner's private `risky` flag) and R4 (each consumer deletes its own scan) have not started. The owner's open decisions are D6 (where the role vocabulary lives), D7 (fail closed on `unsure`) and D8 (sequencing).
where     — `lib/core/remote-ref.js`, `docs/src/lib/segno/`, the pipeline note's P5 (CSS) and S3 islands.
done when — D6 to D8 are answered; R2 lands with the 433-deck byte-identity check and the fuzz at 0 requests in three engines; then R3 and R4 follow as their own PRs.
evidence  — the decision note and the PR #2909 measurements it cites. D6 to D8 were answered on
            2026-10-29 (the note's "Decisions for the owner"), so R2 is unblocked; what it needs first is
            written up in the note's "R2: what stands between the scanner and a CSS island".
verify    — tier 1 per phase: byte-identity of the rewrite and `blocked` lists on the deck corpus, and the seeded fuzz with its failing arm.
