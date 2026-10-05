---
origin: 2518
priority: P3
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2518
---

# The chat header's "≈ $/turn" prices one model call, not an agent turn

why now   — an agent edit takes 2–3 calls (decision note §7), so the readout under-quotes an
            edit turn by about half. The authoritative per-call cost still lands in the
            spend tally, so this is a misleading estimate, not lost money.
where     — docs/src/components/studio/ChatCost.tsx, architect.ts chatSystemTokens.
done when — the readout prices a typical agent turn (or shows a range: question vs edit)
            from the measured averages, and says which it is quoting.
evidence  — the readout's figure next to the benchmark's measured cost for one question and
            one edit, screenshot at 1440/390.
verify    — tier 0 gates, because it is a display estimate with no effect on what is sent.
