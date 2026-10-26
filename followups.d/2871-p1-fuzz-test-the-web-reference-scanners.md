---
origin: 2871
priority: P1
recorded: 2026-10-25
area: engine
severity: high
swimlane: engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md §9
source: https://github.com/Laticent/lattice/pull/2871
---

# Fuzz-test the web-reference scanners in Chromium, WebKit and Firefox

why now   — #2871 merged at MEDIUM confidence. It closes 30 known spellings of a web fetch in
            `blockWebImages` and `blockWebCss` (HARD RULE #22) and proves them in three engines
            and on the real Reading view. Nothing has searched for spellings no one has written
            down yet. A red-team agent tried three times and a fuzzer build once; a safety filter
            stopped every attempt, so the input generators have to come from a person, or from a
            session with access approved for defensive security work.
where     — lib/core/remote-ref.js (`cssRefSpans`, `scanHtml`, `blockWebImages`,
            `verifyWithParser`, `blockWebCss`); the payload table is
            test/fixtures/web-ref-beacons.js; the per-payload probe is in the evidence folder.
done when — a seeded fuzz run generates CSS and HTML from the spec grammars, rewrites each
            input, loads the result in Chromium, WebKit and Firefox against a loopback server,
            and fails on any request at all. A run of at least 100,000 inputs per engine reports
            zero requests, or every request it finds has a fix and a row in the payload table.
            A small seeded slice runs on every PR.
evidence  — the run's seed, input count, engines and versions, and its request count, with the
            commit it ran against.
verify    — tier 2: the fuzz slice, test/integration/invariants/web-ref-beacon.test.js and
            docs/e2e/read-article-beacons.spec.ts (all three engines) green.
