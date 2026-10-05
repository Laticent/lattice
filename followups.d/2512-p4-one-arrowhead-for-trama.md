---
origin: 2512
priority: P4
recorded: 2026-10-05
source: engineering/decisions/2026-10-05-trama-radial-layout.md
---

# Trama draws its filled arrowhead twice

why now   — the pipeline's `head()` (`docs/src/lib/trama/pipeline.ts`) and the radial kernel's `arrowheadPath` (`radial.ts`) draw the same filled triangle with different rounding (one decimal against two) and point order. #2512 kept both, because merging them changes every flowchart's and state chart's bytes.
where     — `docs/src/lib/trama/pipeline.ts` `head()`, `docs/src/lib/trama/radial.ts` `arrowheadPath`.
done when — one arrowhead serves both, landed in a change that already re-blesses flowchart and state-chart output.
evidence  — the flowchart and state-chart golden diffs, with the change explained as rounding only.
verify    — tier 1: maker-checker.
