---
origin: 2612
priority: P3
recorded: 2026-10-08
area: engine
severity: low
swimlane: spec/LFM-1.1.md §3.6
source: engineering/decisions/2026-10-08-spec-audit.md (checker on the spec work, finding F1)
---

# lint:deck does not report a pill with an unknown or repeated word

why now   — `{X, c13}`, `{BETA, tag, tag}`, `{BETA, tag, chip}` and `{BETA, c4, c5}` all render as
            code, and `lintText` reports none of them. `findLiteralPills` (lib/authoring/lint-core.js
            ~3308) reports only a span that quoting would fix, though its own comment says it also
            catches an unknown word. LFM 1.1 §3.6 therefore does not require a finding for these, so
            the spec does not promise what the linter does not do.
where     — lib/authoring/lint-core.js `findLiteralPills`; spec/diagnostics.md `pill-literal` row;
            spec/conformance/lfm/inline-notation.json (the "unknown word" row gains an L2 block).
done when — each span above gets one finding naming the word, LFM 1.1 §3.6 rule 1 requires it, and the
            conformance row checks it.
evidence  — the conformance row's L2 block, and a lint run over examples/ showing what newly fires.
verify    — tier 0 gates.
